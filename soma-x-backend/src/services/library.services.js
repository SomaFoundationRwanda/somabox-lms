import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

import { fileURLToPath } from 'url';

import EPub from 'epub';
import sharp from 'sharp';
import { pdfToPng } from 'pdf-to-png-converter';

import crypto from 'crypto';
import { serverDb } from '../helpers/db-manager.js';
import { config } from '../config/index.js';
import { requireRole } from '../helpers/auth.js';

const router = express.Router();
const requireAdmin = requireRole('admin');
// Book ids become file names, so only plain numeric ids are accepted.
const isBookId = (id) => /^\d+$/.test(String(id));
const CLOUD_URL = config.cloudUrl;
const LIBRARY_DIR = config.paths.library;
const COVERS_DIR = config.paths.libraryCovers;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, LIBRARY_DIR);
    },
    // Temporary random name; the upload route renames it to <bookId>.<ext>.
    filename: function (req, file, cb) {
        cb(null, `upload-${crypto.randomUUID()}`);
    }
});
const upload = multer({ storage });

// Ensure library and covers directory exists
if (!fs.existsSync(LIBRARY_DIR)) {
    fs.mkdirSync(LIBRARY_DIR, { recursive: true });
}
if (!fs.existsSync(COVERS_DIR)) {
    fs.mkdirSync(COVERS_DIR, { recursive: true });
}

let downloadStatus = "init";
let downloading = false;

async function generateBookCover(filePath, bookId) {
    return new Promise((resolve) => {
        const epub = new EPub(filePath);

        epub.on('end', () => {
            const coverId = epub.metadata.cover;
            if (!coverId) {
                console.log(`No cover found for book: ${bookId}`);
                return resolve(false);
            }

            epub.getImage(coverId, async (err, data) => {
                if (err || !data) {
                    console.error(` Failed to extract image for book: ${bookId}`);
                    return resolve(false);
                }

                try {
                    const outputPath = path.join(COVERS_DIR, `${bookId}.avif`);
                    await sharp(data)
                        .resize({ height: 800, withoutEnlargement: true })
                        .avif({ quality: 45 })
                        .toFile(outputPath);

                    console.log(` Generated cover for book: ${bookId}`);
                    resolve(true);
                } catch (sharpErr) {
                    console.error(` Cover generation error for book ${bookId}:`, sharpErr.message);
                    resolve(false);
                }
            });
        });

        epub.on('error', (err) => {
            console.error('Error parsing EPUB', bookId, ':', err.message);
            resolve(false);
        });

        epub.parse();
    });
}

async function generatePDFCover(filePath, bookId) {
    try {
        const pngPages = await pdfToPng(filePath, {
            pagesToProcess: [1],
            viewportScale: 2.0
        });

        if (pngPages.length === 0) {
            throw new Error('Failed to extract page from PDF');
        }

        const outputPath = path.join(COVERS_DIR, `${bookId}.avif`);
        await sharp(pngPages[0].content)
            .resize({ height: 800, withoutEnlargement: true })
            .avif({ quality: 45 })
            .toFile(outputPath);

        console.log(` Generated cover for PDF book: ${bookId}`);
        return true;
    } catch (err) {
        console.error(` PDF cover generation error for book ${bookId}:`, err.message);
        return false;
    }
}

async function downloadBook(book) {
    if (!isBookId(book?.id)) throw new Error(`Invalid book id: ${book?.id}`);
    const bookUrl = `${CLOUD_URL}/content/library/${book.id}.epub`;
    const localPath = path.join(LIBRARY_DIR, `${book.id}.epub`);

    const res = await fetch(bookUrl);
    if (!res.ok) throw new Error(`Failed to download book ${book.id}: ${res.statusText}`);

    const writeStream = fs.createWriteStream(localPath);
    for await (const chunk of res.body) {
        writeStream.write(chunk);
    }
    writeStream.end();

    await new Promise(resolve => writeStream.on('finish', resolve));

    // Generate cover
    await generateBookCover(localPath, book.id);

    // Update database
    const insertBook = serverDb.prepare(`
        INSERT INTO books (id, name, category_ids)
        VALUES (?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category_ids = EXCLUDED.category_ids
    `);
    await insertBook.run(book.id, book.book_name, book.categories);

    return { id: book.id, status: 'downloaded' };
}

router.get('/available-books', requireAdmin, async (req, res) => {
    try {
        console.log(`Fetching available books from ${CLOUD_URL}/library-metadata`);
        const cloudRes = await fetch(`${CLOUD_URL}/library-metadata`);
        console.log(`Cloud response status: ${cloudRes.status}`);
        if (!cloudRes.ok) return res.status(503).json({ error: 'Cloud server is not reachable' });
        const books = await cloudRes.json();
        console.log(`Fetched ${books.length} books`);
        res.json(books);
    } catch (err) {
        console.error('Error fetching available books:', err);
        res.status(500).json({ error: 'Failed to fetch available books' });
    }
});

router.post('/download', requireAdmin, async (req, res) => {
    if (downloading) return res.status(400).json({ message: 'Another download is in progress' });

    const { books } = req.body;
    if (!Array.isArray(books) || !books.length) {
        return res.status(400).json({ error: 'No books specified' });
    }
    if (!books.every((book) => isBookId(book?.id))) {
        return res.status(400).json({ error: 'Invalid book id' });
    }

    downloading = true;
    downloadStatus = "downloading";

    (async () => {
        try {
            for (const book of books) {
                await downloadBook(book);
            }
            downloadStatus = "finished";
        } catch (err) {
            console.error('Download failed:', err);
            downloadStatus = "failed";
        } finally {
            downloading = false;
        }
    })();

    res.status(202).json({ message: 'Download started' });
});

// The role check runs before multer so unauthorized uploads never touch disk.
router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

        const originalName = path.basename(req.file.originalname);
        const ext = path.extname(originalName).toLowerCase();
        if (!['.pdf', '.epub'].includes(ext)) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Only PDF and EPUB files can be uploaded' });
        }
        const bookName = req.body.bookName || originalName.replace(/\.(epub|pdf)$/i, '').replace(/[-_]/g, ' ');

        const maxRow = await serverDb.prepare('SELECT MAX(id) as "maxId" FROM books').get();
        const maxIdNum = Number(maxRow?.maxId || 0);
        const nextId = (maxIdNum && maxIdNum >= 1000000) ? maxIdNum + 1 : 1000000;

        const newPath = path.join(LIBRARY_DIR, `${nextId}${ext}`);
        fs.renameSync(req.file.path, newPath);

        if (ext === '.pdf') {
            await generatePDFCover(newPath, nextId);
        } else {
            await generateBookCover(newPath, nextId);
        }

        const insertBook = serverDb.prepare(`
            INSERT INTO books (id, name, category_ids)
            VALUES (?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category_ids = EXCLUDED.category_ids
        `);
        await insertBook.run(nextId, bookName, "Custom Upload");

        res.status(201).json({ id: nextId, name: bookName });
    } catch (err) {
        console.error('Upload failed:', err);
        res.status(500).json({ error: 'Failed to upload book' });
    }
});

router.get('/download-status', requireAdmin, (req, res) => {
    res.json({ status: downloadStatus });
});

router.get('/books', async (req, res) => {
    try {
        const books = await serverDb.prepare('SELECT * FROM books').all();
        const booksWithExt = books.map(book => {
            let ext = 'epub';
            if (fs.existsSync(path.join(LIBRARY_DIR, `${book.id}.pdf`))) ext = 'pdf';
            else if (fs.existsSync(path.join(LIBRARY_DIR, `${book.id}.epub`))) ext = 'epub';
            return { ...book, ext };
        });
        res.json(booksWithExt);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch local books' });
    }
});

// Public: opened directly by the PDF/EPUB viewer, which can't send a bearer token.
router.get('/file/:id', (req, res) => {
    if (!isBookId(req.params.id)) return res.status(404).json({ error: 'Book not found' });
    const epubPath = path.join(LIBRARY_DIR, `${req.params.id}.epub`);
    const pdfPath = path.join(LIBRARY_DIR, `${req.params.id}.pdf`);
    
    if (fs.existsSync(epubPath)) {
        res.sendFile(epubPath);
    } else if (fs.existsSync(pdfPath)) {
        res.sendFile(pdfPath);
    } else {
        res.status(404).json({ error: 'Book not found' });
    }
});

router.get('/categories', async (req, res) => {
    try {
        const books = await serverDb.prepare('SELECT category_ids FROM books').all();
        const categories = new Set();
        books.forEach(book => {
            if (book.category_ids) {
                book.category_ids.split(',').forEach(cat => {
                    const trimmed = cat.trim();
                    if (trimmed) categories.add(trimmed.toLowerCase());
                });
            }
        });
        res.json(Array.from(categories));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
});

router.delete('/book/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    if (!isBookId(id)) return res.status(404).json({ error: 'Book not found' });
    const epubPath = path.join(LIBRARY_DIR, `${id}.epub`);
    const pdfPath = path.join(LIBRARY_DIR, `${id}.pdf`);
    const coverPath = path.join(COVERS_DIR, `${id}.avif`);
    
    try {
        if (fs.existsSync(epubPath)) fs.unlinkSync(epubPath);
        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);

        if (fs.existsSync(coverPath)) {
            fs.unlinkSync(coverPath);
        }
        
        await serverDb.prepare('DELETE FROM books WHERE id = ?').run(id);
        
        res.json({ message: 'Book deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete book' });
    }
});

export default router;
