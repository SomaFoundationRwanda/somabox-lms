// What the Explore section is made of. Folders under local-content are the source of truth for
// files: whatever is in them (downloaded from the cloud by an admin, uploaded through the content
// manager, or copied onto the box by hand) is what Explore shows.
import path from "path";
import { config } from "../../config/index.js";

export const CONTENT_DIR = config.paths.content;

// File roots, in display order.
// - managers: who may manage the root in the app ("staff" = teachers and admins; "admin").
// - appFiles: whether files can be added/deleted from the app (cloud content changes only
//   through the Sync page).
// - skip: folders at the root's top level that aren't content (old library covers).
export const FILE_ROOTS = [
  { key: "rwandan-education", title: "Rwandan education", managers: "admin", appFiles: false, skip: [] },
  { key: "custom-content", title: "School content", managers: "staff", appFiles: true, skip: [] },
  { key: "library", title: "Library", managers: "admin", appFiles: true, skip: ["covers"] },
];

// Offline web libraries served by their own apps (opened in a frame, not indexed as files).
export const WEB_ROOT = {
  key: "international-education",
  title: "International education",
  items: [
    { key: "w3schools", title: "W3Schools" },
    { key: "wikipedia", title: "Wikipedia" },
    { key: "kolibri", title: "Kolibri" },
    { key: "khan-academy", title: "Khan Academy" },
  ],
};

// File types Explore can open; anything else on disk is ignored.
export const FILE_TYPES = {
  ".mp4": "video", ".webm": "video", ".mkv": "video", ".m4v": "video", ".mov": "video",
  ".mp3": "audio", ".wav": "audio", ".ogg": "audio", ".m4a": "audio",
  ".pdf": "book", ".epub": "book",
};

export const fileType = (name) => FILE_TYPES[path.extname(name).toLowerCase()] || null;

/** The file root a path_key belongs to, or null. */
export function rootOf(pathKey) {
  const first = String(pathKey || "").split("/")[0];
  return FILE_ROOTS.find((r) => r.key === first) || null;
}

/**
 * Normalises a client path into a path_key inside a file root ("custom-content/x/y"), or null if
 * it would leave the roots ("..", absolute paths, unknown root).
 */
export function safePathKey(raw) {
  const cleaned = String(raw || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!cleaned || cleaned.split("/").some((s) => s === ".." || s === "." || s === "")) return null;
  const normalized = path.posix.normalize(cleaned);
  return rootOf(normalized) ? normalized : null;
}

export const absolutePath = (pathKey) => path.join(CONTENT_DIR, ...pathKey.split("/"));

/** "primary-school_maths-p5.pdf" -> "Primary school maths p5" */
export function humanize(name) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : name;
}

/** Where a book's cover image lives (and is served from /pdf-book-covers). */
export const coverKey = (pathKey) => pathKey.replace(/\.(pdf|epub)$/i, ".avif");
export const coverPath = (pathKey) => path.join(config.paths.pdfCovers, ...coverKey(pathKey).split("/"));
