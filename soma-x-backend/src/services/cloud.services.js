import express from 'express';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';
import { syncExploreIndex } from './explore/indexer.js';
import { cloudFetch, cloudFiles, downloadTo, forgetCloudFiles, isCurrent, rememberCloudFile } from './sync/cloud-content.js';

import { config } from '../config/index.js';
import { requireRole } from '../helpers/auth.js';
import { publish } from "../helpers/live.js";

const router = express.Router();
// Content sync manages files on the box: admins only.
router.use(requireRole('admin'));
const LOCAL_STORAGE_ROOT = config.paths.rwandanEducation;
const LOCAL_STORAGE_ROOT_PDF_COVERS = config.paths.rwandanPdfCovers;
// Cloud curriculum paths live under this Explore root on the box.
const ROOT_KEY = 'rwandan-education';
const pathKeyOf = (relPath) => `${ROOT_KEY}/${relPath}`;

/** The cloud's curriculum tree (/metadata). */
async function fetchCloudTree() {
    const res = await cloudFetch('/metadata');
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
    return res.json();
}

/** relPath -> { id, size, sha256, version } for every file in the cloud tree. */
function flattenTree(nodes, out = new Map()) {
    for (const node of nodes || []) {
        if (node.type === 'file') out.set(node.path, node);
        else flattenTree(node.children, out);
    }
    return out;
}

// A relative content path that stays strictly inside LOCAL_STORAGE_ROOT (no "..",
// absolute paths, or the root itself).
function isSafeRelPath(relPath) {
    if (typeof relPath !== 'string' || !relPath.trim()) return false;
    if (path.isAbsolute(relPath) || relPath.split(/[\\/]/).includes('..')) return false;
    const resolved = path.resolve(LOCAL_STORAGE_ROOT, relPath);
    return resolved.startsWith(path.resolve(LOCAL_STORAGE_ROOT) + path.sep);
}

router.get('/available-content', async (req, res) => {
    try {
        let cloudMetadata;
        try {
            cloudMetadata = await fetchCloudTree();
        } catch (err) {
            console.error('Network error fetching cloud:', err);
            return res.status(503).json({ error: 'Cloud server is not reachable' });
        }
        const recorded = await cloudFiles('curriculum');

        // isDownloaded: the file (or folder) is on the box. isOutdated: the cloud has a newer copy
        // of the file (or of something in the folder); downloading it again fetches the new one.
        const addDownloadStatus = (nodes) => nodes.map((node) => {
            const localPath = path.join(LOCAL_STORAGE_ROOT, node.path);
            if (node.type === 'folder') {
                const children = addDownloadStatus(node.children || []);
                return { ...node, children, isDownloaded: fs.existsSync(localPath), isOutdated: children.some((c) => c.isOutdated) };
            }
            const stat = fs.existsSync(localPath) ? fs.statSync(localPath) : null;
            const isOutdated = !!stat && !isCurrent({ localSize: stat.size, recorded: recorded.get(pathKeyOf(node.path)), cloud: node });
            return { ...node, isDownloaded: !!stat, isOutdated };
        });

        return res.json(addDownloadStatus(cloudMetadata));
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
let downloadSummary = null;
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

async function downloadFile(filePath, cloud) {
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const contentPath = `/content/${encodedPath}`;
    const localPath = path.join(LOCAL_STORAGE_ROOT, filePath);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });

    let localStat;
    try {
        localStat = fs.statSync(localPath);
    } catch {}

    // The catalogue entry says what the cloud has; without it (older cloud) ask for the size.
    let info = cloud;
    if (!info) {
        const headRes = await cloudFetch(contentPath, { method: 'HEAD' });
        if (!headRes.ok) throw new Error(`File not found in cloud: ${contentPath}`);
        info = { size: parseInt(headRes.headers.get('content-length'), 10) };
    }
    const recorded = (await cloudFiles('curriculum')).get(pathKeyOf(filePath));
    if (localStat && isCurrent({ localSize: localStat.size, recorded, cloud: info })) {
        if (!recorded && info.id) await rememberCloudFile(pathKeyOf(filePath), { collection: 'curriculum', ...info });
        return { file: filePath, status: 'skipped' };
    }

    // Resumes a download the box lost its connection in the middle of, and checks the hash.
    await downloadTo(contentPath, localPath, { sha256: info.sha256 });
    if (info.id) await rememberCloudFile(pathKeyOf(filePath), { collection: 'curriculum', ...info });

    return { file: filePath, status: localStat ? 'updated' : 'downloaded' };
}

// Background download helper
async function startDownload(files) {
    downloadStatus = "downloading";
    downloading = true;
    try {
        let catalogue = new Map();
        try {
            catalogue = flattenTree(await fetchCloudTree());
        } catch (err) {
            console.error('Could not read the cloud catalogue; comparing sizes only:', err.message);
        }
        const fileTasks = files.map(f => () => downloadFile(f, catalogue.get(f)));
        const results = await limitConcurrency(fileTasks, MAX_CONCURRENT);

        // Explore follows the disk: index what arrived (covers are made in the background).
        await syncExploreIndex({ root: ROOT_KEY });

        // A file that failed (often: the cable was unplugged) keeps its partial download;
        // downloading again resumes it.
        const failed = results.filter((r) => r instanceof Error);
        for (const err of failed) console.error('Download failed:', err.message);
        downloadSummary = { total: files.length, failed: failed.length };
        downloadStatus = failed.length ? "failed" : "finished";
        publish({ kind: "catalogue" }, { everyone: true });
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
    if (!files.every(isSafeRelPath)) {
        return res.status(400).json({ error: 'Invalid file path' });
    }

    // Start download in the background, immediately respond
    startDownload(files);
    res.status(202).json({ message: 'Download started' });
});

router.get('/download-status', (req, res) => {
    res.json({ status: downloadStatus, ...(downloadSummary || {}) });
});

router.post('/delete', async (req, res) => {
    const { paths } = req.body;
    if (!Array.isArray(paths) || !paths.length) {
        return res.status(400).json({ error: 'No paths specified' });
    }
    if (!paths.every(isSafeRelPath)) {
        return res.status(400).json({ error: 'Invalid path' });
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

        }

        for (const relPath of paths) await forgetCloudFiles(pathKeyOf(relPath));

        // 2. Explore follows the disk: drop what was deleted from the index.
        await syncExploreIndex({ root: ROOT_KEY });

        res.json({ message: 'Content deleted successfully' });
    } catch (err) {
        console.error('Delete failed:', err);
        res.status(500).json({ error: 'Failed to delete content' });
    }
});

export default router;