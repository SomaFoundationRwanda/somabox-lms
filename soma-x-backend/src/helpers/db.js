import fs from "fs";
import path from "path";
import { serverDb } from "./db-manager.js";
import { config } from "../config/index.js";

const CONTENT_DIR = config.paths.rwandanEducation;

function getStatements() {
  return {
    insertCategory: serverDb.prepare(`
      INSERT INTO categories (title, subtitle, parent_id, path_key, is_main, is_disabled)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    getCategory: serverDb.prepare(`SELECT id FROM categories WHERE path_key = ?`),
    insertContent: serverDb.prepare(`
      INSERT INTO content_items
      (category_id, title, subtitle, type, url, path_key, size, duration, pages, is_disabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `),
    getContent: serverDb.prepare(`SELECT id FROM content_items WHERE path_key = ?`),
  };
}

async function ensureCategory(name, parentId = null, relativePath = "", isMain = false, isDisabled = false) {
  const { getCategory, insertCategory } = getStatements();
  const row = await getCategory.get(relativePath);
  if (row) return row.id;
  const res = await insertCategory.run(
    name.replace(/-/g, " "), "", parentId, relativePath, isMain ? 1 : 0, isDisabled ? 1 : 0
  );
  return res.lastInsertRowid;
}

async function insertFileContent(file, categoryId, type, relativePath, filePath) {
  const { getContent, insertContent } = getStatements();
  const existing = await getContent.get(relativePath);
  if (existing) return;
  const stat = fs.statSync(filePath);
  
  const ext = path.extname(file).toLowerCase();
  let actualType = type;
  if (['.mp4', '.webm', '.mkv'].includes(ext)) actualType = 'video';
  else if (['.pdf', '.epub'].includes(ext)) actualType = 'book';
  else if (['.mp3', '.wav', '.ogg'].includes(ext)) actualType = 'audio';

  const res = await insertContent.run(
    categoryId, file.replace(/-/g, " ").replace(/^\w/, c => c.toUpperCase()),
    `Description for ${file}`, actualType, `${relativePath}`, relativePath, stat.size, null, null, 0
  );
  return res.lastInsertRowid;
}

async function scanFolder(dir, parentId = null, base = "") {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.join(base, entry.name);

    if (entry.isDirectory()) {
      const containsFiles = fs.readdirSync(fullPath).some(f => fs.statSync(path.join(fullPath, f)).isFile());

      const catId = await ensureCategory(entry.name, parentId, relativePath);
      if (containsFiles) {
        const type = entry.name.toLowerCase();
        const files = fs.readdirSync(fullPath, { withFileTypes: true }).filter(f => f.isFile());
        for (const f of files) {
          await insertFileContent(f.name, catId, type, path.join('rwandan-education', relativePath, f.name), path.join(fullPath, f.name));
        }
      } else {
        await scanFolder(fullPath, catId, relativePath);
      }
    }
  }
}

async function insertMainCategories() {
    const mainCategories = [
        {
          title: "Rwandan education",
          slug: "rwandan-education",
          items: [
            { title: "Nursery School", slug: "nursery-school-content" },
            { title: "Primary School", slug: "primary-school-content" },
            { title: "Secondary School", slug: "secondary-school-content" },
            { title: "University Level", slug: "university-content" },
          ]
        },
        {
          title: "International education",
          slug: "international-education",
          items: [
            { slug: "w3schools", title: "W3Schools" },
            { slug: "wikipedia", title: "Wikipedia" },
            { slug: "kolibri", title: "Kolibri" },
          ]
        },
        { title: "School content", slug: "school-content", items: [] },
      ];

      const topLevelFolders = fs.existsSync(CONTENT_DIR) ? fs.readdirSync(CONTENT_DIR, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name) : [];

      for (const mainCat of mainCategories) {
        const mainCatId = await ensureCategory(mainCat.title, null, mainCat.slug, true, false);
        for (const item of mainCat.items) {
          const isDisabled = mainCat.slug === "rwandan-education" && !topLevelFolders.includes(item.slug);
          await ensureCategory(item.title, mainCatId, `${mainCat.slug}/${item.slug}`, false, isDisabled);
        }
      }
}

export async function deleteContentByPath(pathKey) {
  const deleteContent = serverDb.prepare(`
    DELETE FROM content_items 
    WHERE path_key = ? OR path_key LIKE ?
  `);
  await deleteContent.run(pathKey, `${pathKey}/%`);

  const deleteCategories = serverDb.prepare(`
    DELETE FROM categories 
    WHERE path_key = ? OR path_key LIKE ?
  `);
  await deleteCategories.run(pathKey, `${pathKey}/%`);
}

export async function loadContentIntoDB() {
  await scanFolder(CONTENT_DIR);
  await insertMainCategories();
}
