// Keeps the Explore index (categories, content_items) in step with the files on disk.
// - New folders and files are added (titles made readable from their names).
// - Changed files are updated (size, type, folder); titles someone edited stay as they are.
// - Folders and files that are gone are removed.
// - Hidden flags and edited titles are kept across rescans.
// Runs at startup, every EXPLORE_RESCAN_MINUTES, after downloads/uploads/deletes, and on demand.
import fs from "fs";
import path from "path";
import { localDb } from "../../helpers/db-manager.js";
import { FILE_ROOTS, WEB_ROOT, CONTENT_DIR, fileType, humanize, absolutePath, coverPath } from "./roots.js";
import { queueCovers } from "./covers.js";
import { invalidateCatalog } from "./catalog.js";

let running = null;
let lastRun = null;

/** Every folder and openable file under a root, as path_keys (dotfiles and symlinks skipped). */
function walk(rootKey, skip = []) {
  const dirs = [rootKey];
  const files = [];
  const stack = [rootKey];
  while (stack.length) {
    const rel = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(absolutePath(rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      if (rel === rootKey && skip.includes(e.name)) continue;
      const childRel = `${rel}/${e.name}`;
      if (e.isDirectory()) {
        dirs.push(childRel);
        stack.push(childRel);
      } else if (e.isFile()) {
        const type = fileType(e.name);
        if (!type) continue;
        let size = null;
        try { size = fs.statSync(absolutePath(childRel)).size; } catch { continue; }
        files.push({ pathKey: childRel, type, size });
      }
    }
  }
  return { dirs, files };
}

async function ensureCategory(pathKey, { title, parentId, isMain }) {
  const existing = await localDb.prepare("SELECT id, parent_id, title, title_locked, is_main FROM categories WHERE path_key = ?").get(pathKey);
  if (!existing) {
    const row = await localDb.prepare(`
      INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled) VALUES (?, '', ?, ?, ?, 0) RETURNING id
    `).get(title, parentId, pathKey, isMain ? 1 : 0);
    return { id: Number(row.id), added: true };
  }
  const updates = [];
  const params = [];
  if ((existing.parent_id ?? null) !== (parentId ?? null)) { updates.push("parent_id = ?"); params.push(parentId); }
  if (Number(existing.is_main) !== (isMain ? 1 : 0)) { updates.push("is_main = ?"); params.push(isMain ? 1 : 0); }
  if (isMain && !existing.title_locked && existing.title !== title) { updates.push("title = ?"); params.push(title); }
  if (updates.length) await localDb.prepare(`UPDATE categories SET ${updates.join(", ")} WHERE id = ?`).run(...params, existing.id);
  return { id: Number(existing.id), added: false };
}

/** The fixed top level: file roots and the web libraries. */
async function ensureTopLevel() {
  for (const root of FILE_ROOTS) {
    fs.mkdirSync(absolutePath(root.key), { recursive: true });
    await ensureCategory(root.key, { title: root.title, parentId: null, isMain: true });
  }
  const web = await ensureCategory(WEB_ROOT.key, { title: WEB_ROOT.title, parentId: null, isMain: true });
  for (const item of WEB_ROOT.items) {
    await ensureCategory(`${WEB_ROOT.key}/${item.key}`, { title: item.title, parentId: web.id, isMain: false });
  }
}

async function syncRoot(rootKey, stats) {
  const { dirs, files } = walk(rootKey, FILE_ROOTS.find((r) => r.key === rootKey).skip);
  const onDisk = new Set(dirs);
  const like = `${rootKey}/%`;

  // Folders, parents first.
  const ids = new Map();
  dirs.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b));
  for (const dir of dirs) {
    const parentKey = dir === rootKey ? null : dir.slice(0, dir.lastIndexOf("/"));
    const { id, added } = await ensureCategory(dir, {
      title: dir === rootKey ? FILE_ROOTS.find((r) => r.key === rootKey).title : humanize(dir.split("/").pop()),
      parentId: parentKey ? ids.get(parentKey) : null,
      isMain: dir === rootKey,
    });
    ids.set(dir, id);
    if (added) stats.foldersAdded += 1;
  }

  // Files.
  const existing = new Map((await localDb.prepare(`
    SELECT id, path_key, category_id, type, size, url FROM content_items WHERE path_key LIKE ?
  `).all(like)).map((r) => [r.path_key, r]));
  const seen = new Set();
  for (const f of files) {
    seen.add(f.pathKey);
    const categoryId = ids.get(f.pathKey.slice(0, f.pathKey.lastIndexOf("/")));
    const url = `/${f.pathKey}`;
    const row = existing.get(f.pathKey);
    if (!row) {
      const legacy = await legacyBook(f.pathKey);
      await localDb.prepare(`
        INSERT INTO content_items (category_id, title, subtitle, type, url, path_key, size, is_disabled, indexed_at, title_locked)
        VALUES (?, ?, '', ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, ?)
      `).run(categoryId, legacy?.title || humanize(f.pathKey.split("/").pop()), f.type, url, f.pathKey, f.size, !!legacy?.title);
      stats.filesAdded += 1;
    } else if (Number(row.category_id) !== categoryId || row.type !== f.type || Number(row.size) !== f.size || row.url !== url) {
      await localDb.prepare("UPDATE content_items SET category_id = ?, type = ?, size = ?, url = ?, indexed_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(categoryId, f.type, f.size, url, row.id);
      stats.filesUpdated += 1;
    }
  }

  // Gone from disk.
  for (const [key, row] of existing) {
    if (!seen.has(key)) {
      await localDb.prepare("DELETE FROM content_items WHERE id = ?").run(row.id);
      stats.filesRemoved += 1;
    }
  }
  const folders = await localDb.prepare("SELECT id, path_key FROM categories WHERE path_key LIKE ? ORDER BY length(path_key) DESC").all(like);
  for (const c of folders) {
    if (!onDisk.has(c.path_key)) {
      await localDb.prepare("DELETE FROM categories WHERE id = ?").run(c.id);
      stats.foldersRemoved += 1;
    }
  }
  return files;
}

/**
 * Library books from before the library was a folder: "library/<id>.epub|pdf" with their title in
 * the old `books` table and a cover in library/covers/<id>.avif. The title is reused, and the
 * cover copied to where Explore keeps covers, so nothing has to be regenerated.
 */
async function legacyBook(pathKey) {
  const match = /^library\/(\d+)\.(pdf|epub)$/i.exec(pathKey);
  if (!match) return null;
  const book = await localDb.prepare("SELECT name FROM books WHERE id = ?").get(Number(match[1])).catch(() => null);
  const oldCover = path.join(CONTENT_DIR, "library", "covers", `${match[1]}.avif`);
  const newCover = coverPath(pathKey);
  if (fs.existsSync(oldCover) && !fs.existsSync(newCover)) {
    fs.mkdirSync(path.dirname(newCover), { recursive: true });
    fs.copyFileSync(oldCover, newCover);
  }
  return book?.name ? { title: book.name } : null;
}

/**
 * Old rows that don't belong to any root or the web libraries (e.g. the old unprefixed
 * "nursery-school-content" folders and the "school-content" placeholder). Items in them were
 * moved to their real folders by syncRoot, so only empty shells remain.
 */
async function removeLegacyRows(stats) {
  const keep = (key) => FILE_ROOTS.some((r) => key === r.key || key.startsWith(`${r.key}/`))
    || key === WEB_ROOT.key || WEB_ROOT.items.some((i) => key === `${WEB_ROOT.key}/${i.key}`);
  const items = await localDb.prepare("SELECT id, path_key FROM content_items").all();
  for (const item of items) {
    if (!keep(item.path_key)) {
      await localDb.prepare("DELETE FROM content_items WHERE id = ?").run(item.id);
      stats.filesRemoved += 1;
    }
  }
  const categories = await localDb.prepare("SELECT id, path_key FROM categories ORDER BY length(path_key) DESC").all();
  for (const c of categories) {
    if (!keep(c.path_key)) {
      await localDb.prepare("DELETE FROM categories WHERE id = ?").run(c.id);
      stats.foldersRemoved += 1;
    }
  }
}

/**
 * Brings the index in step with disk. With `root`, only that file root is walked (faster after an
 * upload). Concurrent calls share one run. Returns the stats of the run.
 */
export async function syncExploreIndex({ root = null } = {}) {
  if (running) {
    await running;
    if (!root) return lastRun;
  }
  running = (async () => {
    const started = Date.now();
    const stats = { foldersAdded: 0, foldersRemoved: 0, filesAdded: 0, filesUpdated: 0, filesRemoved: 0, files: 0 };
    const roots = root ? FILE_ROOTS.filter((r) => r.key === root) : FILE_ROOTS;
    const books = [];
    await localDb.transaction(async () => {
      await ensureTopLevel();
      for (const r of roots) {
        const files = await syncRoot(r.key, stats);
        stats.files += files.length;
        books.push(...files.filter((f) => f.type === "book").map((f) => f.pathKey));
      }
      if (!root) await removeLegacyRows(stats);
    })();
    invalidateCatalog();
    queueCovers(books);
    lastRun = { ...stats, root: root || "all", finishedAt: new Date().toISOString(), ms: Date.now() - started };
    return lastRun;
  })();
  try {
    return await running;
  } finally {
    running = null;
  }
}

export const lastIndexRun = () => lastRun;

let timer = null;
/** Indexes once now (in the background) and then every EXPLORE_RESCAN_MINUTES (default 5). */
export function startExploreIndexer() {
  const minutes = Math.max(1, Number(process.env.EXPLORE_RESCAN_MINUTES) || 5);
  const run = () => syncExploreIndex().catch((error) => console.error("Explore indexing failed:", error.message));
  run();
  if (!timer) {
    timer = setInterval(run, minutes * 60 * 1000);
    timer.unref?.();
  }
}

export { CONTENT_DIR };
