import fs from "fs";
import express from "express";
import path from "path";
import multer from "multer";
import { serverDb, localDb } from "../helpers/db-manager.js";
import { config } from "../config/index.js";
import { mainCategoriesCache, summaryDataCache, hydrateCaches } from "../data/cache/index.js";
import { requireRole } from "../helpers/auth.js";

const router = express.Router();
const CONTENT_DIR = config.paths.content;
const DEFAULT_ROOT = config.defaults.customContentRoot;
const requireContentManager = requireRole("teacher", "admin");

/**
 * Resolves a client-supplied folder path to a path_key inside the custom content root.
 * Returns null for anything that would escape it (e.g. "custom-content/../../etc").
 */
function resolveCustomPath(rawPath) {
    const trimmed = String(rawPath || DEFAULT_ROOT).replace(/^\/+|\/+$/g, "");
    if (trimmed.split("/").some((segment) => segment === "..")) return null;
    const joined = trimmed === DEFAULT_ROOT || trimmed.startsWith(`${DEFAULT_ROOT}/`)
        ? trimmed
        : path.posix.join(DEFAULT_ROOT, trimmed);
    const normalized = path.posix.normalize(joined);
    if (normalized !== DEFAULT_ROOT && !normalized.startsWith(`${DEFAULT_ROOT}/`)) return null;
    return normalized;
}

// A single path segment: no separators, no "." or ".." (used for file and folder names).
function safeName(name) {
    const base = path.basename(String(name || "").trim());
    return base && base !== "." && base !== ".." ? base : null;
}

// Multer storage for custom content
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const fullPath = resolveCustomPath(req.body.path);
        if (!fullPath) return cb(Object.assign(new Error("Invalid folder path"), { status: 400 }));
        const dest = path.join(CONTENT_DIR, fullPath);
        fs.mkdirSync(dest, { recursive: true });
        cb(null, dest);
    },
    filename: function (req, file, cb) {
        const name = safeName(file.originalname);
        if (!name) return cb(Object.assign(new Error("Invalid file name"), { status: 400 }));
        cb(null, name);
    }
});
const upload = multer({ storage });

// --- Content Discovery Routes ---

router.get("/main-categories", (req, res) => {
    res.json(mainCategoriesCache);
});

router.get("/levels/summary", (req, res) => {
    res.json(summaryDataCache);
});

router.get("/custom-content/summary", async (req, res) => {
    try {
        const DEFAULT_THUMBNAIL = config.defaults.thumbnail;
        
        const allCategories = await localDb.prepare(`
            SELECT id, title, subtitle, path_key, parent_id, is_disabled
            FROM categories
            WHERE is_disabled = 0
        `).all();
        const allContent = await localDb.prepare(`
            SELECT id, category_id, title, subtitle, type, url, path_key, size, duration, pages
            FROM content_items
            WHERE is_disabled = 0
        `).all();
        
        const categoryMap = Object.fromEntries(allCategories.map(c => [c.id, c]));
        const contentMap = allContent.reduce((acc, item) => {
            if (!acc[item.category_id]) acc[item.category_id] = [];
            acc[item.category_id].push({
                id: item.id,
                slug: item.path_key,
                title: item.title,
                type: item.type,
                thumbnail: DEFAULT_THUMBNAIL,
                url: `/${item.path_key}`,
                description: item.subtitle || `Description for ${item.title}`,
                duration: item.duration ? `${item.duration} min` : undefined,
                pages: item.pages || undefined
            });
            return acc;
        }, {});
        
        function buildCategoryJSON(catId) {
            const cat = categoryMap[catId];
            if (!cat) return null;
            const children = allCategories.filter(c => c.parent_id === catId && Number(c.is_disabled) === 0);
            const contentItems = contentMap[catId] || [];
            
            return {
                slug: cat.path_key,
                title: cat.title,
                subtitle: cat.subtitle || "",
                isContentLevel: contentItems.length > 0,
                content: contentItems,
                items: children.map(child => ({
                    title: child.path_key.split('/').pop(),
                    slug: child.path_key,
                    image: DEFAULT_THUMBNAIL,
                    colorClass: "bg-gray-400"
                }))
            };
        }
        
        const summary = {};
        allCategories.forEach(cat => {
            summary[cat.path_key] = buildCategoryJSON(cat.id);
        });
        
        res.json(summary);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to get custom content summary" });
    }
});

router.get("/content/:slug", async (req, res) => {
    const slug = req.params.slug;

    // 1. Try Custom Content (localDb)
    if (slug.startsWith(DEFAULT_ROOT + '/')) {
        let fileRow = await localDb.prepare(`
            SELECT path_key, url FROM content_items WHERE path_key = ?
        `).get(slug);
        
        if (!fileRow) {
            fileRow = await localDb.prepare(`
                SELECT path_key, url FROM content_items WHERE path_key = ? OR url = ?
            `).get(slug, `/${slug}`);
        }
        
        if (fileRow) {
            const filePath = path.join(CONTENT_DIR, fileRow.path_key);
            if (!fs.existsSync(filePath)) return res.status(404).json({ error: "File not found on disk" });
            return res.sendFile(filePath);
        }
    }
    
    // 2. Try Managed Content (serverDb)
    const fileRow = await serverDb.prepare(`
        SELECT path_key FROM content_items WHERE path_key = ?
    `).get(slug);

    if (fileRow) {
        const filePath = path.join(CONTENT_DIR, fileRow.path_key);
        if (fs.existsSync(filePath)) return res.sendFile(filePath);
    }

    res.status(404).json({ error: "Content not found" });
});

// --- Manager APIs (Custom Content) ---

async function getCategoryByPath(pathKey) {
    return await localDb.prepare(`
        SELECT id, title, subtitle, path_key, parent_id, is_disabled
        FROM categories WHERE path_key = ?
    `).get(pathKey);
}

async function listChildren(categoryId) {
    const categories = await localDb.prepare(`
        SELECT id, title, subtitle, path_key, is_disabled
        FROM categories WHERE parent_id = ? ORDER BY title ASC
    `).all(categoryId);
    const items = await localDb.prepare(`
        SELECT id, title, type, size, path_key, is_disabled
        FROM content_items WHERE category_id = ? ORDER BY title ASC
    `).all(categoryId);
    return { categories, items };
}

async function breadcrumbsFor(pathKey) {
    const parts = pathKey.split("/").filter(Boolean);
    const crumbs = [];
    for (let i = 0; i < parts.length; i++) {
        const sub = parts.slice(0, i + 1).join("/");
        const row = await getCategoryByPath(sub);
        if (row) crumbs.push({ name: row.title, path: row.path_key });
    }
    return crumbs;
}

router.get("/manager/list", requireContentManager, async (req, res) => {
    try {
        const fullPath = resolveCustomPath(req.query.path);
        if (!fullPath) return res.status(400).json({ error: "Out of allowed folders" });
        const cat = await getCategoryByPath(fullPath);
        
        if (!cat || !cat.path_key.startsWith(DEFAULT_ROOT)) {
            return res.status(cat ? 400 : 404).json({ error: cat ? "Out of allowed folders" : "Category not found" });
        }
        
        const data = await listChildren(cat.id);
        const crumbs = await breadcrumbsFor(cat.path_key);
        res.json({
            path: cat.path_key,
            title: cat.title,
            breadcrumbs: crumbs,
            categories: data.categories,
            items: data.items
        });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to list folder" });
    }
});

router.post("/manager/create-folder", requireContentManager, express.json(), async (req, res) => {
    try {
        const { name, path: parentPath } = req.body || {};
        const fullParentPath = resolveCustomPath(parentPath);
        if (!fullParentPath) return res.status(400).json({ error: "Out of allowed folders" });

        if (!name) return res.status(400).json({ error: "Name is required" });
        const folderSlug = safeName(String(name).trim().toLowerCase().replace(/\s+/g, "-"));
        if (!folderSlug || folderSlug !== String(name).trim().toLowerCase().replace(/\s+/g, "-")) {
            return res.status(400).json({ error: "Folder name cannot contain / or .." });
        }

        const parent = await getCategoryByPath(fullParentPath);
        if (!parent || !parent.path_key.startsWith(DEFAULT_ROOT)) return res.status(404).json({ error: "Invalid parent" });
        
        const newPathKey = path.posix.join(parent.path_key, folderSlug);
        const exists = await localDb.prepare(`SELECT 1 FROM categories WHERE path_key = ?`).get(newPathKey);
        if (exists) {
            return res.status(409).json({ error: "Already exists" });
        }
        
        const info = await localDb.prepare(`
            INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled)
            VALUES (?, ?, ?, ?, 0, 0)
        `).run(name, "", parent.id, newPathKey);
        
        fs.mkdirSync(path.join(CONTENT_DIR, newPathKey), { recursive: true });
        res.status(201).json({ id: info.lastInsertRowid, title: name, path_key: newPathKey });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Failed to create folder" });
    }
});

// The role check runs before multer so anonymous or scholar uploads never touch disk.
router.post("/manager/upload", requireContentManager, upload.single("file"), async (req, res) => {
    try {
        const { type } = req.body;
        const fullPath = resolveCustomPath(req.body.path);
        if (!fullPath) return res.status(400).json({ error: "Out of allowed folders" });
        const parent = await getCategoryByPath(fullPath);
        
        if (!parent || !parent.path_key.startsWith(DEFAULT_ROOT)) return res.status(404).json({ error: "Target not found" });
        if (!req.file) return res.status(400).json({ error: "No file" });
        
        const filename = safeName(req.file.originalname);
        const pathKey = path.posix.join(parent.path_key, filename);
        const physicalPath = path.join(CONTENT_DIR, pathKey);
        
        if (req.file.path !== physicalPath) {
            fs.mkdirSync(path.dirname(physicalPath), { recursive: true });
            fs.renameSync(req.file.path, physicalPath);
        }
        
        const exists = await localDb.prepare(`SELECT 1 FROM content_items WHERE path_key = ?`).get(pathKey);
        if (exists) {
            if (fs.existsSync(physicalPath)) fs.unlinkSync(physicalPath);
            return res.status(409).json({ error: "File exists" });
        }
        
        const stat = fs.statSync(physicalPath);
        const info = await localDb.prepare(`
            INSERT INTO content_items (category_id, title, subtitle, type, url, path_key, size, duration, pages, is_disabled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).run(parent.id, filename.replace(/-/g, " "), "", (type || "book").toLowerCase(), `/${pathKey}`, pathKey, stat.size, null, null);
        
        res.status(201).json({ id: info.lastInsertRowid, title: filename, path_key: pathKey });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Upload failed" });
    }
});

router.patch("/manager/toggle", requireContentManager, express.json(), async (req, res) => {
    try {
        const { target, path_key, id, is_disabled } = req.body || {};
        const flag = is_disabled ? 1 : 0;
        
        if (target === "category") {
            const fullPath = resolveCustomPath(path_key);
            if (!fullPath) return res.status(404).json({ error: "Not found" });
            const cat = await getCategoryByPath(fullPath);
            if (!cat || !cat.path_key.startsWith(DEFAULT_ROOT)) return res.status(404).json({ error: "Not found" });
            await localDb.prepare(`UPDATE categories SET is_disabled = ? WHERE id = ?`).run(flag, cat.id);
        } else if (target === "content") {
            const row = id 
                ? await localDb.prepare(`SELECT id FROM content_items WHERE id = ?`).get(id)
                : await localDb.prepare(`SELECT id FROM content_items WHERE path_key = ?`).get(path_key);
            if (!row) return res.status(404).json({ error: "Not found" });
            await localDb.prepare(`UPDATE content_items SET is_disabled = ? WHERE id = ?`).run(flag, row.id);
        } else {
            return res.status(400).json({ error: "Invalid target" });
        }
        res.json({ ok: true });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Toggle failed" });
    }
});

router.use('/files', express.static(CONTENT_DIR));

export default router;
