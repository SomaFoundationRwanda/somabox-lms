// Cover images for books in Explore (PDF: first page; EPUB: its cover image), made in the
// background one at a time so a big download doesn't hog a small box. Stored as AVIF under
// local-content/pdf-book-covers/<path_key>.avif and served publicly (covers help guests browse).
import fs from "fs";
import path from "path";
import sharp from "sharp";
import EPub from "epub";
import { pdfToPng } from "pdf-to-png-converter";
import { absolutePath, coverPath } from "./roots.js";

const queue = [];
const queued = new Set();
let working = false;

async function pdfImage(file) {
  const pages = await pdfToPng(file, { pagesToProcess: [1], viewportScale: 2.0 });
  return pages[0]?.content || null;
}

function epubImage(file) {
  return new Promise((resolve) => {
    const book = new EPub(file);
    book.on("end", () => {
      const id = book.metadata.cover;
      if (!id) return resolve(null);
      book.getImage(id, (err, data) => resolve(err ? null : data));
    });
    book.on("error", () => resolve(null));
    book.parse();
  });
}

/** Makes the cover for one book if it doesn't exist yet. Returns true if a cover exists after. */
export async function ensureCover(pathKey) {
  const out = coverPath(pathKey);
  if (fs.existsSync(out)) return true;
  const file = absolutePath(pathKey);
  if (!fs.existsSync(file)) return false;
  try {
    const image = /\.pdf$/i.test(pathKey) ? await pdfImage(file) : await epubImage(file);
    if (!image) return false;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await sharp(image).resize({ height: 800, withoutEnlargement: true }).avif({ quality: 45 }).toFile(out);
    return true;
  } catch (error) {
    console.error(`Couldn't make a cover for ${pathKey}:`, error.message);
    return false;
  }
}

/** Adds books without a cover to the background queue. */
export function queueCovers(pathKeys) {
  for (const key of pathKeys) {
    if (queued.has(key) || fs.existsSync(coverPath(key))) continue;
    queued.add(key);
    queue.push(key);
  }
  if (!working && queue.length && process.env.EXPLORE_COVERS !== "off") drain();
}

async function drain() {
  working = true;
  const { invalidateCatalog } = await import("./catalog.js");
  let made = 0;
  while (queue.length) {
    const key = queue.shift();
    if (await ensureCover(key)) made += 1;
    queued.delete(key);
  }
  working = false;
  if (made) invalidateCatalog();
}

export const coverQueueLength = () => queue.length;
