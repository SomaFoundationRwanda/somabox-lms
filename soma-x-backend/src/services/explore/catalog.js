// The Explore catalogue, built from the index in one place and cached until something changes.
// Hidden folders hide everything in them; hidden files are left out; empty folders aren't shown.
import fs from "fs";
import { localDb } from "../../helpers/db-manager.js";
import { FILE_ROOTS, WEB_ROOT, coverKey, coverPath } from "./roots.js";

let cache = null;
let version = 0;

export function invalidateCatalog() {
  cache = null;
  version += 1;
}

const ancestors = (key) => {
  const parts = key.split("/");
  return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
};

/**
 * { version, mainCategories, summary, hidden } where
 * - mainCategories: [{ id, slug, title, subtitle, kind: 'files'|'web', items: [{ title, slug, count, image, kind }] }]
 * - summary: { [path_key]: { slug, title, subtitle, isContentLevel, content: [item], items: [folder] } }
 * - hidden: Set of path_keys hidden by an admin (folders and files)
 */
export async function getCatalog() {
  if (cache) return cache;
  const categories = await localDb.prepare("SELECT id, title, subtitle, path_key, parent_id, is_main, is_disabled FROM categories").all();
  const items = await localDb.prepare(`
    SELECT id, category_id, title, subtitle, type, url, path_key, size, duration, pages, is_disabled FROM content_items ORDER BY title
  `).all();

  const hidden = new Set([
    ...categories.filter((c) => Number(c.is_disabled) === 1).map((c) => c.path_key),
    ...items.filter((i) => Number(i.is_disabled) === 1).map((i) => i.path_key),
  ]);
  const isHidden = (key) => ancestors(key).some((a) => hidden.has(a));

  const visibleCats = categories.filter((c) => !isHidden(c.path_key));
  const contentByCat = new Map();
  for (const i of items) {
    if (isHidden(i.path_key)) continue;
    const cover = i.type === "book" && fs.existsSync(coverPath(i.path_key)) ? `/pdf-book-covers/${coverKey(i.path_key)}` : null;
    const entry = {
      id: i.id, slug: i.path_key, title: i.title, type: i.type, url: i.url || `/${i.path_key}`,
      description: i.subtitle || "", size: i.size != null ? Number(i.size) : null,
      duration: i.duration ? `${i.duration} min` : undefined, pages: i.pages || undefined,
      thumbnail: cover, cover,
    };
    const list = contentByCat.get(Number(i.category_id)) || [];
    list.push(entry);
    contentByCat.set(Number(i.category_id), list);
  }

  // Count visible files in each folder's subtree, and find a cover to show for the folder.
  const childrenOf = new Map();
  for (const c of visibleCats) {
    if (c.parent_id == null) continue;
    const list = childrenOf.get(Number(c.parent_id)) || [];
    list.push(c);
    childrenOf.set(Number(c.parent_id), list);
  }
  const memo = new Map();
  const subtree = (c) => {
    if (memo.has(c.id)) return memo.get(c.id);
    let count = (contentByCat.get(Number(c.id)) || []).length;
    let image = (contentByCat.get(Number(c.id)) || []).find((x) => x.cover)?.cover || null;
    for (const child of childrenOf.get(Number(c.id)) || []) {
      const s = subtree(child);
      count += s.count;
      image = image || s.image;
    }
    const result = { count, image };
    memo.set(c.id, result);
    return result;
  };

  const folderEntry = (c) => ({
    title: c.title, slug: c.path_key, count: subtree(c).count, image: subtree(c).image, colorClass: "bg-gray-400",
  });
  const summary = {};
  for (const c of visibleCats) {
    if (c.path_key === WEB_ROOT.key || c.path_key.startsWith(`${WEB_ROOT.key}/`)) continue;
    const content = contentByCat.get(Number(c.id)) || [];
    const folders = (childrenOf.get(Number(c.id)) || []).filter((x) => subtree(x).count > 0)
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })).map(folderEntry);
    summary[c.path_key] = {
      slug: c.path_key, title: c.title, subtitle: c.subtitle || "",
      isContentLevel: content.length > 0, content, items: folders,
    };
  }

  const mainCategories = [];
  for (const root of FILE_ROOTS) {
    const c = categories.find((x) => x.path_key === root.key);
    if (!c || isHidden(c.path_key)) continue;
    mainCategories.push({
      id: c.id, slug: c.path_key, path_key: c.path_key, title: c.title, subtitle: c.subtitle || "", kind: "files",
      items: summary[c.path_key]?.items || [], count: subtree(c).count,
    });
  }
  const web = categories.find((x) => x.path_key === WEB_ROOT.key);
  if (web && !isHidden(web.path_key)) {
    mainCategories.push({
      id: web.id, slug: web.path_key, path_key: web.path_key, title: web.title, subtitle: web.subtitle || "", kind: "web",
      items: (childrenOf.get(Number(web.id)) || []).map((c) => ({ title: c.title, slug: c.path_key.split("/").pop(), kind: "web" })),
    });
  }
  cache = { version, mainCategories, summary, hidden, isHidden };
  return cache;
}

/** True if an admin hid this path or a folder containing it. */
export async function isHiddenPath(pathKey) {
  return (await getCatalog()).isHidden(pathKey);
}
