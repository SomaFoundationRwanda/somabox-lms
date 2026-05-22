import express from 'express';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
import { loadContentIntoDB, deleteContentByPath } from '../helpers/db.js';
import { hydrateCaches } from '../data/cache/index.js';
import sharp from 'sharp';
import { pdfToPng } from 'pdf-to-png-converter';

import { config } from '../config/index.js';

const router = express.Router();
const CLOUD_URL = config.cloudUrl;
const normalizedCloudUrl = CLOUD_URL.replace(/\/$/, '');
const CLOUD_CONTENT_ROOT = `${normalizedCloudUrl}/content`;
const LOCAL_STORAGE_ROOT = config.paths.rwandanEducation;
const LOCAL_STORAGE_ROOT_PDF_COVERS = config.paths.rwandanPdfCovers;

router.get('/available-content', async (req, res) => {
    try {
        let cloudRes;
        try {
            cloudRes = await fetch(`${normalizedCloudUrl}/metadata`);
            if (!cloudRes.ok) throw new Error(`HTTP error! status: ${cloudRes.status}`);
        } catch (err) {
            console.error('Network error fetching cloud:', err);
            return res.status(503).json({ error: 'Cloud server is not reachable' });
        }

        const cloudMetadata = await cloudRes.json();

        // Recursively add isDownloaded flag
        const addDownloadStatus = (nodes) => {
            return nodes.map(node => {
                const localPath = path.join(LOCAL_STORAGE_ROOT, node.path);
                let isDownloaded = false;
                
                if (node.type === 'file') {
                    isDownloaded = fs.existsSync(localPath);
                } else if (node.type === 'folder') {
                    // For folders, we consider it downloaded if the directory exists
                    // and might want to check if it's fully downloaded, but for now
                    // simple existence check is a good start.
                    isDownloaded = fs.existsSync(localPath);
                    if (node.children) {
                        node.children = addDownloadStatus(node.children);
                    }
                }
                
                return { ...node, isDownloaded };
            });
        };

        const enrichedMetadata = addDownloadStatus(cloudMetadata);
        return res.json(enrichedMetadata);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch available content' });
    }
});

router.get('/metadata', (req, res) => {
    try {
        const buildTree = (dirPath, relPath = '') => {
            if (!fs.existsSync(dirPath)) return [];
            const items = fs.readdirSync(dirPath);
            const nodes = [];
            for (const item of items) {
                if (item.startsWith('.')) continue;
                const fullPath = path.join(dirPath, item);
                const itemRelPath = relPath ? `${relPath}/${item}` : item;
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    nodes.push({
                        type: 'folder',
                        name: item,
                        path: itemRelPath,
                        children: buildTree(fullPath, itemRelPath)
                    });
                } else {
                    nodes.push({
                        type: 'file',
                        name: item,
                        path: itemRelPath,
                        size: stat.size
                    });
                }
            }
            return nodes;
        };

        const tree = buildTree(LOCAL_STORAGE_ROOT);
        res.json(tree);
    } catch (err) {
        console.error('Failed to generate metadata:', err);
        res.status(500).json({ error: 'Failed to generate metadata' });
    }
});


const MAX_CONCURRENT = 5;
let downloadStatus = "init";
let downloading = false;

function limitConcurrency(tasks, limit) {
    const results = [];
    let active = 0;
    let i = 0;

    return new Promise((resolve) => {
        const next = () => {
            if (i === tasks.length && active === 0) return resolve(results);

            while (active < limit && i < tasks.length) {
                const idx = i++;
                const task = tasks[idx];
                active++;
                task()
                    .then(r => results[idx] = r)
                    .catch(r => results[idx] = r)
                    .finally(() => {
                        active--;
                        next();
                    });
            }
        };
        next();
    });
}

async function generatePDFCover(filePath) {
    const fullPath = path.join(LOCAL_STORAGE_ROOT, filePath);
    const coverFileName = filePath.replace(/\.pdf$/i, '.avif');
    const coverPath = path.join(LOCAL_STORAGE_ROOT_PDF_COVERS, coverFileName);

    try {
        // Ensure output directory exists
        fs.mkdirSync(path.dirname(coverPath), { recursive: true });

        // 1. Use pdf-to-png-converter to extract first page
        const pngPages = await pdfToPng(fullPath, {
            pagesToProcess: [1],
            viewportScale: 2.0
        });

        if (pngPages.length === 0) {
            throw new Error('Failed to extract page from PDF');
        }

        // 2. Use sharp to convert buffer to AVIF and optimize
        await sharp(pngPages[0].content)
            .resize({ height: 800, withoutEnlargement: true })
            .avif({ quality: 45 })
            .toFile(coverPath);

        console.log('Generated cover for:', filePath);
    } catch (err) {
        console.error('Failed to generate cover for', filePath, ':', err.message);
    }
}

async function downloadFile(filePath) {
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const cloudFileUrl = `${CLOUD_CONTENT_ROOT}/${encodedPath}`;
    const localPath = path.join(LOCAL_STORAGE_ROOT, filePath);

    fs.mkdirSync(path.dirname(localPath), { recursive: true });

    let localStat;
    try {
        localStat = fs.statSync(localPath);
    } catch {}

    const headRes = await fetch(cloudFileUrl, { method: 'HEAD' });
    if (!headRes.ok) throw new Error(`File not found in cloud: ${cloudFileUrl}`);

    const cloudSize = parseInt(headRes.headers.get('content-length'), 10);

    if (localStat && localStat.size === cloudSize) {
        // Even if skipped, ensure cover exists if it's a PDF
        if (filePath.toLowerCase().endsWith('.pdf')) {
            const coverFileName = filePath.replace(/\.pdf$/i, '.avif');
            const coverPath = path.join(LOCAL_STORAGE_ROOT_PDF_COVERS, coverFileName);
            if (!fs.existsSync(coverPath)) {
                await generatePDFCover(filePath);
            }
        }
        return { file: filePath, status: 'skipped' };
    }

    const res = await fetch(cloudFileUrl);
    if (!res.ok) throw new Error(`Failed to download: ${cloudFileUrl}`);

    const writeStream = fs.createWriteStream(localPath);

    try {
        for await (const chunk of res.body) {
            writeStream.write(chunk);
        }
        writeStream.end();
        await new Promise(resolve => writeStream.on('finish', resolve));

        // Generate cover if it's a PDF
        if (filePath.toLowerCase().endsWith('.pdf')) {
            await generatePDFCover(filePath);
        }
    } catch (err) {
        writeStream.destroy();
        throw err;
    }

    return { file: filePath, status: 'downloaded' };
}

// Background download helper
async function startDownload(files) {
    downloadStatus = "downloading";
    downloading = true;
    try {
        const fileTasks = files.map(f => () => downloadFile(f));
        const results = await limitConcurrency(fileTasks, MAX_CONCURRENT);

        await loadContentIntoDB();
        await hydrateCaches();

        downloadStatus = "finished";
        return results;
    } catch (err) {
        console.error(err);
        downloadStatus = "failed";
        return [];
    } finally {
        downloading = false;
    }
}

router.post('/download', (req, res) => {
    if (downloading) return res.status(400).json({ message: 'Another download is in progress' });

    const { files } = req.body;
    if (!Array.isArray(files) || !files.length) {
        return res.status(400).json({ error: 'No files specified' });
    }

    // Start download in the background, immediately respond
    startDownload(files);
    res.status(202).json({ message: 'Download started' });
});

router.get('/download-status', (req, res) => {
    res.json({ status: downloadStatus });
});

router.post('/delete', async (req, res) => {
    const { paths } = req.body;
    if (!Array.isArray(paths) || !paths.length) {
        return res.status(400).json({ error: 'No paths specified' });
    }

    try {
        for (const relPath of paths) {
            const localPath = path.join(LOCAL_STORAGE_ROOT, relPath);
            const coverPath = path.join(LOCAL_STORAGE_ROOT_PDF_COVERS, relPath);
            
            // 1. Delete from filesystem
            if (fs.existsSync(localPath)) {
                const stat = fs.statSync(localPath);
                if (stat.isDirectory()) {
                    fs.rmSync(localPath, { recursive: true, force: true });
                    // Also delete corresponding cover directory if it exists
                    if (fs.existsSync(coverPath)) {
                        fs.rmSync(coverPath, { recursive: true, force: true });
                    }
                } else {
                    fs.unlinkSync(localPath);
                    // Also delete corresponding cover file if it's a PDF
                    if (relPath.toLowerCase().endsWith('.pdf')) {
                        const coverFilePath = coverPath.replace(/\.pdf$/i, '.avif');
                        if (fs.existsSync(coverFilePath)) {
                            fs.unlinkSync(coverFilePath);
                        }
                    }
                }
            }

            // 2. Delete from database
            // Note: relPath in cloud metadata doesn't have 'rwandan-education/' prefix
            // but in DB path_key it does.
            const dbPathKey = path.join('rwandan-education', relPath);
            deleteContentByPath(dbPathKey);
        }

        // 3. Hydrate caches
        await hydrateCaches();

        res.json({ message: 'Content deleted successfully' });
    } catch (err) {
        console.error('Delete failed:', err);
        res.status(500).json({ error: 'Failed to delete content' });
    }
});

export default router;