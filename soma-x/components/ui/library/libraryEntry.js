// Helpers for entries from GET /library/books:
// { id, name, title, type: "book"|"video"|"audio", path_key, ext, category_ids, folders, url, cover }.
// `url` and `cover` are relative to the server; `cover` is null until it has been made.

/** Full URL of the entry's file. */
export function libraryFileUrl(serverUrl, entry) {
    if (!entry) return "";
    if (entry.url) return `${serverUrl}${entry.url}`;
    return `${serverUrl}/library/file/${entry.id}`;
}

/** Full URL of the entry's cover, or null when it has none (yet). */
export function libraryCoverUrl(serverUrl, entry) {
    return entry?.cover ? `${serverUrl}${entry.cover}` : null;
}

/** The entry's shelf: its top folder title, or "" for files at the top of the library. */
export function libraryShelf(entry) {
    return String(entry?.category_ids || "").trim();
}

/** Shelf names in the order to show them: folders A-Z, then "" (Other) when any entry has none. */
export function libraryShelves(entries) {
    const named = new Set();
    let other = false;
    for (const e of entries || []) {
        const s = libraryShelf(e);
        if (s) named.add(s); else other = true;
    }
    const list = [...named].sort((a, b) => a.localeCompare(b));
    if (other) list.push("");
    return list;
}

/** How to open an entry: "epub" (EPUB reader) or a UniversalPlayerModal type ("video" | "audio" | "book"). */
export function libraryViewer(entry) {
    if (entry?.type === "video" || entry?.type === "audio") return entry.type;
    if (String(entry?.ext || "").replace(/^\./, "").toLowerCase() === "epub") return "epub";
    return "book";
}
