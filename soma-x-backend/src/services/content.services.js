// Explore content: the catalogue (public, so guests can browse), the files themselves (signed-in
// people only), and the content manager. The files on disk are the source of truth; see
// services/explore/indexer.js.
import fs from "fs";
import os from "os";
import path from "path";
import express from "express";
import multer from "multer";
import { localDb } from "../helpers/db-manager.js";
import { requireRole } from "../helpers/auth.js";
import { requireMediaAccess } from "../helpers/media.js";
import { FILE_ROOTS, rootOf, safePathKey, absolutePath, fileType, humanize, coverPath } from "./explore/roots.js";
import { syncExploreIndex, lastIndexRun } from "./explore/indexer.js";
import { getCatalog, invalidateCatalog } from "./explore/catalog.js";
import { coverQueueLength } from "./explore/covers.js";
import { startPreview, guestMayOpen, limitGuestRange } from "./explore/preview.js";
import { SUMMARY_LANGUAGES, summariesEnabled, summarisable, userLanguage, getSummary, summaryView, requestSummary } from "./explore/summaries.js";

const router = express.Router();
const requireContentManager = requireRole("teacher", "admin");
const isStaff = (user) => ["teacher", "ta", "admin"].includes(user?.role);

/** Admins manage every root; teachers manage the roots open to staff (school content). */
function canManage(user, pathKey) {
  const root = rootOf(pathKey);
  if (!root) return false;
  return user.role === "admin" || root.managers === "staff";
}

// A single file or folder name: no separators, not "." or "..", not hidden.
function safeName(name) {
  const base = path.basename(String(name || "").trim());
  return base && base !== "." && base !== ".." && !base.startsWith(".") ? base : null;
}

// --- Catalogue (public) -------------------------------------------------------------------------

router.get("/explore", async (req, res) => {
  try {
    const { version, mainCategories, summary } = await getCatalog();
    return res.json({ version, mainCategories, summary });
  } catch (error) {
    console.error("Error building the Explore catalogue:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Older clients read the catalogue in parts; all of them come from the same index now.
router.get("/main-categories", async (req, res) => res.json((await getCatalog()).mainCategories));
router.get("/levels/summary", async (req, res) => res.json((await getCatalog()).summary));
router.get("/custom-content/summary", async (req, res) => res.json((await getCatalog()).summary));

// --- Files (signed-in people) ---------------------------------------------------------------------
// Only Explore folders are served here (course files have their own, membership-checked route).
// Hidden files and folders are only opened by staff, who need to preview them.
router.get("/files/*filePath", requireMediaAccess({ allowGuests: true }), async (req, res, next) => {
  try {
    const segments = [].concat(req.params.filePath || []);
    const pathKey = safePathKey(segments.join("/"));
    const signUp = () => res.status(401).json({ message: "Sign up for free to keep watching or reading", code: "LOGIN_REQUIRED" });
    // Visitors without a preview of this item are asked to sign up (nothing about the file is said).
    if (!req.mediaUser && (!pathKey || !await guestMayOpen(req, pathKey))) return signUp();
    if (!pathKey || !fileType(pathKey)) return res.status(404).json({ message: "File not found" });
    if (!isStaff(req.mediaUser) && await (await getCatalog()).isHidden(pathKey)) {
      return res.status(404).json({ message: "File not found" });
    }
    const file = absolutePath(pathKey);
    if (!fs.existsSync(file)) return res.status(404).json({ message: "File not found" });
    // Visitors get only the start of videos and audio.
    if (!req.mediaUser && !limitGuestRange(req, pathKey)) return signUp();
    return res.sendFile(file, { dotfiles: "deny" });
  } catch (error) {
    next(error);
  }
});

// Visitors (not signed in) start a short preview of an Explore or Library item.
router.post("/preview", async (req, res) => {
  try {
    if (req.user) return res.json({ signedIn: true });
    const pathKey = safePathKey(req.body?.path);
    if (!pathKey || !fileType(pathKey) || !fs.existsSync(absolutePath(pathKey)) || await (await getCatalog()).isHidden(pathKey)) {
      return res.status(404).json({ message: "File not found" });
    }
    return res.json(await startPreview(req, res, pathKey));
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error("Error starting a preview:", error);
    return res.status(500).json({ message: error.message });
  }
});

// --- AI summaries (signed-in people) ------------------------------------------------------------
// A summary of a book (from its text) or a video/recording (from a transcript next to it), made
// once per file and language and shared by everyone. GET tells the app whether it exists, is being
// made, or can be asked for; POST asks for it.
async function summaryTarget(req, res, raw) {
  const pathKey = safePathKey(raw);
  const staff = isStaff(req.user);
  if (!pathKey || !fileType(pathKey) || !fs.existsSync(absolutePath(pathKey))) {
    res.status(404).json({ message: "File not found" });
    return null;
  }
  if (!staff && await (await getCatalog()).isHidden(pathKey)) {
    res.status(404).json({ message: "File not found" });
    return null;
  }
  return { pathKey, staff };
}

router.get("/summary", async (req, res) => {
  try {
    const target = await summaryTarget(req, res, req.query.path);
    if (!target) return;
    const enabled = await summariesEnabled();
    const language = SUMMARY_LANGUAGES.includes(req.query.language) ? req.query.language : await userLanguage(req.user.id);
    const can = summarisable(target.pathKey);
    const row = await getSummary(target.pathKey, language);
    return res.json({
      enabled, language, available: can.ok, reason: can.ok ? null : can.message,
      ...summaryView(row, { staff: target.staff }),
    });
  } catch (error) {
    console.error("Error reading summary:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/summary", async (req, res) => {
  try {
    const target = await summaryTarget(req, res, req.body?.path);
    if (!target) return;
    if (!await summariesEnabled()) return res.status(403).json({ message: "AI summaries are switched off for this school", code: "SUMMARIES_OFF" });
    const language = await userLanguage(req.user.id);
    const { row, created } = await requestSummary(req.user, target.pathKey, language);
    return res.status(created ? 202 : 200).json({ language, ...summaryView(await getSummary(row.path_key, language), { staff: target.staff }) });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message, code: error.code });
    console.error("Error asking for summary:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Admins: hide a summary from learners, or remove it so it's made again next time.
router.patch("/summary", requireRole("admin"), async (req, res) => {
  const key = safePathKey(req.body?.path);
  if (!key || typeof req.body?.hidden !== "boolean") return res.status(400).json({ message: "Send path and hidden" });
  const info = await localDb.prepare("UPDATE content_summaries SET hidden = ? WHERE path_key = ? AND (?::text IS NULL OR language = ?)")
    .run(req.body.hidden, key, req.body.language || null, req.body.language || null);
  return info.changes ? res.json({ ok: true }) : res.status(404).json({ message: "No summary for this file" });
});

router.delete("/summary", requireRole("admin"), async (req, res) => {
  const key = safePathKey(req.body?.path || req.query.path);
  if (!key) return res.status(400).json({ message: "Send path" });
  await localDb.prepare("DELETE FROM content_summaries WHERE path_key = ? AND status <> 'running'").run(key);
  return res.status(204).end();
});

// --- Content manager ----------------------------------------------------------------------------

async function folderRow(pathKey) {
  return localDb.prepare("SELECT id, title, subtitle, path_key, parent_id, is_disabled FROM categories WHERE path_key = ?").get(pathKey);
}

function breadcrumbs(pathKey) {
  const parts = pathKey.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
}

// The roots the caller may manage (the file manager's starting points).
router.get("/manager/roots", requireContentManager, async (req, res) => {
  const roots = FILE_ROOTS.filter((r) => req.user.role === "admin" || r.managers === "staff");
  return res.json({ roots: roots.map((r) => ({ path: r.key, title: r.title })), lastIndexRun: lastIndexRun(), coversWaiting: coverQueueLength() });
});

router.get("/manager/list", requireContentManager, async (req, res) => {
  try {
    const pathKey = safePathKey(req.query.path || "custom-content");
    if (!pathKey || !canManage(req.user, pathKey)) return res.status(400).json({ error: "Out of allowed folders" });
    let folder = await folderRow(pathKey);
    if (!folder && fs.existsSync(absolutePath(pathKey))) {
      await syncExploreIndex({ root: rootOf(pathKey).key });
      folder = await folderRow(pathKey);
    }
    if (!folder) return res.status(404).json({ error: "Folder not found" });
    const categories = await localDb.prepare("SELECT id, title, subtitle, path_key, is_disabled FROM categories WHERE parent_id = ? ORDER BY title").all(folder.id);
    const items = await localDb.prepare(`
      SELECT id, title, subtitle, type, size, path_key, is_disabled, title_locked FROM content_items WHERE category_id = ? ORDER BY title
    `).all(folder.id);
    const crumbs = [];
    for (const key of breadcrumbs(pathKey)) {
      const row = await folderRow(key);
      if (row) crumbs.push({ name: row.title, path: row.path_key });
    }
    return res.json({
      path: folder.path_key, title: folder.title, is_disabled: folder.is_disabled, breadcrumbs: crumbs,
      canChangeFiles: rootOf(pathKey).appFiles,
      categories,
      items: items.map((i) => ({ ...i, hasCover: i.type === "book" && fs.existsSync(coverPath(i.path_key)) })),
    });
  } catch (error) {
    console.error("Error listing folder:", error);
    return res.status(500).json({ error: "Failed to list folder" });
  }
});

// Folders and files can be created or deleted from the app in school content and the library;
// cloud content changes through the Sync page.
function requireFileChanges(req, res, pathKey) {
  if (!pathKey || !canManage(req.user, pathKey)) {
    res.status(400).json({ error: "Out of allowed folders" });
    return false;
  }
  if (!rootOf(pathKey).appFiles) {
    res.status(400).json({ error: "Cloud content is changed from the Sync page" });
    return false;
  }
  return true;
}

router.post("/manager/create-folder", requireContentManager, async (req, res) => {
  try {
    const parentKey = safePathKey(req.body?.path || "custom-content");
    if (!requireFileChanges(req, res, parentKey)) return;
    const name = String(req.body?.name || "").trim();
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    if (!name || /[\\/]/.test(name) || name.includes("..") || safeName(slug) !== slug) {
      return res.status(400).json({ error: "Folder name cannot be empty, start with a dot, or contain / or .." });
    }
    const key = `${parentKey}/${slug}`;
    if (fs.existsSync(absolutePath(key))) return res.status(409).json({ error: "Already exists" });
    fs.mkdirSync(absolutePath(key), { recursive: true });
    await syncExploreIndex({ root: rootOf(key).key });
    await localDb.prepare("UPDATE categories SET title = ?, title_locked = true WHERE path_key = ?").run(name, key);
    invalidateCatalog();
    const row = await folderRow(key);
    return res.status(201).json({ id: row?.id, title: name, path_key: key });
  } catch (error) {
    console.error("Error creating folder:", error);
    return res.status(500).json({ error: "Failed to create folder" });
  }
});

// Uploads land in a temporary folder first, so a file with the same name is never overwritten.
const upload = multer({ dest: path.join(os.tmpdir(), "somabox-uploads"), limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

router.post("/manager/upload", requireContentManager, upload.single("file"), async (req, res) => {
  const cleanup = () => { if (req.file?.path) fs.rmSync(req.file.path, { force: true }); };
  try {
    const parentKey = safePathKey(req.body?.path || "custom-content");
    if (!requireFileChanges(req, res, parentKey)) return cleanup();
    if (!req.file) return res.status(400).json({ error: "No file" });
    const name = safeName(req.file.originalname);
    if (!name) { cleanup(); return res.status(400).json({ error: "Invalid file name" }); }
    if (!fileType(name)) {
      cleanup();
      return res.status(400).json({ error: "Explore can open videos (mp4, webm, mkv, m4v, mov), audio (mp3, wav, ogg, m4a), and books (pdf, epub)" });
    }
    if (!fs.existsSync(absolutePath(parentKey))) { cleanup(); return res.status(404).json({ error: "Target not found" }); }
    const key = `${parentKey}/${name}`;
    const target = absolutePath(key);
    if (fs.existsSync(target)) { cleanup(); return res.status(409).json({ error: "A file with this name is already in this folder" }); }
    try {
      fs.renameSync(req.file.path, target);
    } catch {
      fs.copyFileSync(req.file.path, target);
      cleanup();
    }
    await syncExploreIndex({ root: rootOf(key).key });
    const row = await localDb.prepare("SELECT id, title, type FROM content_items WHERE path_key = ?").get(key);
    return res.status(201).json({ id: row?.id, title: row?.title ?? humanize(name), type: row?.type, path_key: key });
  } catch (error) {
    cleanup();
    console.error("Upload failed:", error);
    return res.status(500).json({ error: "Upload failed" });
  }
});

// Hide or show a folder or file (hidden ones aren't listed or opened for learners).
router.patch("/manager/toggle", requireContentManager, async (req, res) => {
  try {
    const { target, is_disabled } = req.body || {};
    const key = safePathKey(req.body?.path_key) || (req.body?.id && target === "content"
      ? (await localDb.prepare("SELECT path_key FROM content_items WHERE id = ?").get(req.body.id))?.path_key : null);
    if (!key || !canManage(req.user, key)) return res.status(404).json({ error: "Not found" });
    const table = target === "category" ? "categories" : target === "content" ? "content_items" : null;
    if (!table) return res.status(400).json({ error: "Invalid target" });
    if (table === "categories" && rootOf(key).key === key) return res.status(400).json({ error: "Top-level sections can't be hidden" });
    const info = await localDb.prepare(`UPDATE ${table} SET is_disabled = ? WHERE path_key = ?`).run(is_disabled ? 1 : 0, key);
    if (!info.changes) return res.status(404).json({ error: "Not found" });
    invalidateCatalog();
    return res.json({ ok: true });
  } catch (error) {
    console.error("Toggle failed:", error);
    return res.status(500).json({ error: "Toggle failed" });
  }
});

// Rename how a folder or file is shown (the file on disk keeps its name; the title survives rescans).
router.patch("/manager/details", requireContentManager, async (req, res) => {
  try {
    const { target } = req.body || {};
    const key = safePathKey(req.body?.path_key);
    if (!key || !canManage(req.user, key)) return res.status(404).json({ error: "Not found" });
    const table = target === "category" ? "categories" : target === "content" ? "content_items" : null;
    if (!table) return res.status(400).json({ error: "Invalid target" });
    const title = req.body.title !== undefined ? String(req.body.title).trim().slice(0, 200) : undefined;
    const subtitle = req.body.subtitle !== undefined ? String(req.body.subtitle).trim().slice(0, 1000) : undefined;
    if (title === "") return res.status(400).json({ error: "Title can't be empty" });
    const sets = [];
    const params = [];
    if (title !== undefined) { sets.push("title = ?", "title_locked = true"); params.push(title); }
    if (subtitle !== undefined) { sets.push("subtitle = ?"); params.push(subtitle); }
    if (!sets.length) return res.status(400).json({ error: "Nothing to change" });
    const info = await localDb.prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE path_key = ?`).run(...params, key);
    if (!info.changes) return res.status(404).json({ error: "Not found" });
    invalidateCatalog();
    return res.json({ ok: true });
  } catch (error) {
    console.error("Rename failed:", error);
    return res.status(500).json({ error: "Rename failed" });
  }
});

// Delete a file or folder in school content or the library (non-empty folders need { recursive: true }).
router.delete("/manager/item", requireContentManager, async (req, res) => {
  try {
    const key = safePathKey(req.body?.path_key || req.query.path_key);
    if (!requireFileChanges(req, res, key)) return;
    if (rootOf(key).key === key) return res.status(400).json({ error: "The top-level folder can't be deleted" });
    const target = absolutePath(key);
    if (!fs.existsSync(target)) return res.status(404).json({ error: "Not found" });
    const stat = fs.statSync(target);
    if (stat.isDirectory() && fs.readdirSync(target).length && !req.body?.recursive) {
      return res.status(409).json({ error: "This folder isn't empty", code: "FOLDER_NOT_EMPTY" });
    }
    fs.rmSync(target, { recursive: true, force: true });
    const cover = coverPath(key);
    if (fs.existsSync(cover)) fs.rmSync(cover, { force: true });
    await syncExploreIndex({ root: rootOf(key).key });
    return res.status(204).end();
  } catch (error) {
    console.error("Delete failed:", error);
    return res.status(500).json({ error: "Delete failed" });
  }
});

// Re-read every Explore folder now (admins), e.g. after copying files onto the box.
router.post("/manager/rescan", requireRole("admin"), async (req, res) => {
  try {
    return res.json(await syncExploreIndex());
  } catch (error) {
    console.error("Rescan failed:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
