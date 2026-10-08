// The Library is a folder (local-content/library) like the other Explore roots: whatever is in it
// (books downloaded from the cloud, uploaded by admins, or copied onto the box, in any subfolders)
// is what the Library shows. The index and covers come from services/explore. These routes keep
// the Library page and the admin's cloud book downloads working on top of that folder.
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import multer from 'multer';
import { localDb } from '../helpers/db-manager.js';
import { config } from '../config/index.js';
import { requireRole } from '../helpers/auth.js';
import { requireMediaAccess } from '../helpers/media.js';
import { absolutePath, fileType, coverPath } from './explore/roots.js';
import { syncExploreIndex } from './explore/indexer.js';
import { getCatalog, invalidateCatalog } from './explore/catalog.js';

const router = express.Router();
const requireAdmin = requireRole('admin');
const CLOUD_URL = config.cloudUrl;
const LIBRARY_DIR = config.paths.library;
const upload = multer({ dest: path.join(os.tmpdir(), 'somabox-uploads'), limits: { fileSize: 1024 * 1024 * 1024 } });

fs.mkdirSync(LIBRARY_DIR, { recursive: true });

/** A safe file or folder name from a title: "Ubuntu & Me: Part 2" -> "Ubuntu-Me-Part-2". */
function fileStem(title) {
    const stem = String(title || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 120);
    return stem || 'book';
}

/** A free path_key in `folderKey` for `stem.ext` (adds -2, -3, ... if needed). */
function freeKey(folderKey, stem, ext) {
    let key = `${folderKey}/${stem}${ext}`;
    for (let n = 2; fs.existsSync(absolutePath(key)); n++) key = `${folderKey}/${stem}-${n}${ext}`;
    return key;
}

/** Shows a file under the title people know it by (kept across rescans). */
async function setTitle(pathKey, title) {
    await localDb.prepare('UPDATE content_items SET title = ?, title_locked = true WHERE path_key = ?').run(title, pathKey);
    invalidateCatalog();
}

let downloadStatus = 'init';
let downloading = false;

// Admins: books available in the cloud library.
router.get('/available-books', requireAdmin, async (req, res) => {
    try {
        const cloudRes = await fetch(`${CLOUD_URL}/library-metadata`);
        if (!cloudRes.ok) return res.status(503).json({ error: 'Cloud server is not reachable' });
        return res.json(await cloudRes.json());
    } catch (err) {
        console.error('Error fetching available books:', err);
        return res.status(503).json({ error: 'Cloud server is not reachable' });
    }
});

/** Downloads one cloud book into library/<first category>/<title>.epub. */
async function downloadBook(book) {
    if (!/^\d+$/.test(String(book?.id))) throw new Error(`Invalid book id: ${book?.id}`);
    const category = String(book.categories || '').split(',').map((c) => c.trim()).find(Boolean);
    const folderKey = category ? `library/${fileStem(category)}` : 'library';
    fs.mkdirSync(absolutePath(folderKey), { recursive: true });
    const target = `${folderKey}/${fileStem(book.book_name)}.epub`;
    if (fs.existsSync(absolutePath(target))) return { id: book.id, status: 'skipped' };

    const res = await fetch(`${CLOUD_URL}/content/library/${book.id}.epub`);
    if (!res.ok) throw new Error(`Failed to download book ${book.id}: ${res.statusText}`);
    const partial = `${absolutePath(target)}.part`;
    const out = fs.createWriteStream(partial);
    for await (const chunk of res.body) out.write(chunk);
    out.end();
    await new Promise((resolve) => out.on('finish', resolve));
    fs.renameSync(partial, absolutePath(target));
    return { id: book.id, status: 'downloaded', pathKey: target, title: book.book_name };
}

router.post('/download', requireAdmin, async (req, res) => {
    if (downloading) return res.status(400).json({ message: 'Another download is in progress' });
    const { books } = req.body;
    if (!Array.isArray(books) || !books.length) return res.status(400).json({ error: 'No books specified' });
    if (!books.every((book) => /^\d+$/.test(String(book?.id)))) return res.status(400).json({ error: 'Invalid book id' });

    downloading = true;
    downloadStatus = 'downloading';
    (async () => {
        try {
            const done = [];
            for (const book of books) done.push(await downloadBook(book));
            await syncExploreIndex({ root: 'library' });
            for (const d of done) if (d.pathKey && d.title) await setTitle(d.pathKey, d.title);
            downloadStatus = 'finished';
        } catch (err) {
            console.error('Download failed:', err);
            downloadStatus = 'failed';
        } finally {
            downloading = false;
        }
    })();
    return res.status(202).json({ message: 'Download started' });
});

router.get('/download-status', requireAdmin, (req, res) => res.json({ status: downloadStatus }));

// Admins: add a book (or any file the Library can open) to the top of the library folder.
router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
    const cleanup = () => { if (req.file?.path) fs.rmSync(req.file.path, { force: true }); };
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
        const original = path.basename(req.file.originalname);
        const ext = path.extname(original).toLowerCase();
        if (!fileType(original)) {
            cleanup();
            return res.status(400).json({ error: 'The library can hold books (pdf, epub), videos, and audio' });
        }
        const title = String(req.body.bookName || '').trim() || original.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');
        const key = freeKey('library', fileStem(title), ext);
        try { fs.renameSync(req.file.path, absolutePath(key)); } catch { fs.copyFileSync(req.file.path, absolutePath(key)); cleanup(); }
        await syncExploreIndex({ root: 'library' });
        await setTitle(key, title);
        const row = await localDb.prepare('SELECT id FROM content_items WHERE path_key = ?').get(key);
        return res.status(201).json({ id: row?.id, name: title, path_key: key });
    } catch (err) {
        cleanup();
        console.error('Upload failed:', err);
        return res.status(500).json({ error: 'Failed to upload book' });
    }
});

/** Library entries from the shared catalogue: every visible file under library/, with its folder. */
async function libraryEntries() {
    const { summary } = await getCatalog();
    const entries = [];
    const walk = (key, folders) => {
        const node = summary[key];
        if (!node) return;
        for (const item of node.content) {
            entries.push({
                id: item.id, name: item.title, title: item.title, type: item.type, path_key: item.slug,
                ext: path.extname(item.slug).slice(1).toLowerCase(),
                category_ids: folders[0] || '', folders,
                url: `/content/files/${item.slug}`, cover: item.cover,
            });
        }
        for (const child of node.items) walk(child.slug, [...folders, child.title]);
    };
    walk('library', []);
    return entries;
}

// The Library page: [{ id, name, title, type, path_key, ext, category_ids, folders, url, cover }].
router.get('/books', async (req, res) => {
    try {
        return res.json(await libraryEntries());
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch library' });
    }
});

// Shelf names: the library's top-level folders.
router.get('/categories', async (req, res) => {
    try {
        const { summary } = await getCatalog();
        return res.json((summary.library?.items || []).map((f) => f.title));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

// Opens a library file by its id in the catalogue (books from before the library was a folder
// may also be asked for by their old number, kept as their file name).
router.get('/file/:id', requireMediaAccess(), async (req, res) => {
    const id = String(req.params.id);
    if (!/^\d+$/.test(id)) return res.status(404).json({ error: 'Book not found' });
    const row = await localDb.prepare("SELECT path_key FROM content_items WHERE id = ? AND path_key LIKE 'library/%'").get(id);
    const candidates = [row?.path_key, `library/${id}.epub`, `library/${id}.pdf`].filter(Boolean);
    const { isHidden } = await getCatalog();
    for (const key of candidates) {
        if (fs.existsSync(absolutePath(key)) && !isHidden(key)) return res.sendFile(absolutePath(key));
    }
    return res.status(404).json({ error: 'Book not found' });
});

// Admins: remove a library file (and its cover).
router.delete('/book/:id', requireAdmin, async (req, res) => {
    try {
        const row = await localDb.prepare("SELECT path_key FROM content_items WHERE id = ? AND path_key LIKE 'library/%'").get(req.params.id);
        if (!row) return res.status(404).json({ error: 'Book not found' });
        fs.rmSync(absolutePath(row.path_key), { force: true });
        fs.rmSync(coverPath(row.path_key), { force: true });
        await syncExploreIndex({ root: 'library' });
        return res.json({ message: 'Book deleted successfully' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: 'Failed to delete book' });
    }
});

export default router;
