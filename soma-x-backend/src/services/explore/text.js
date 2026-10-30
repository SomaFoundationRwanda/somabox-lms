// Plain text of an Explore file, for summaries: PDF pages, EPUB chapters, and for videos and
// audio a transcript saved next to them with the same name (.vtt, .srt, or .txt), since the box
// can't transcribe speech itself. Returns { text, source } or { text: null, reason }.
import fs from "fs";
import path from "path";
import EPub from "epub";
import { absolutePath, fileType } from "./roots.js";

const MAX_PDF_PAGES = Number(process.env.SUMMARY_MAX_PAGES) || 120;
const MAX_CHARS = 400_000;

const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();

async function pdfText(file) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), disableFontFace: true, useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
  const parts = [];
  let length = 0;
  for (let i = 1; i <= Math.min(doc.numPages, MAX_PDF_PAGES) && length < MAX_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = clean(content.items.map((it) => it.str).join(" "));
    parts.push(text);
    length += text.length;
  }
  await doc.destroy();
  return parts.join("\n");
}

function epubText(file) {
  return new Promise((resolve) => {
    const book = new EPub(file);
    book.on("error", () => resolve(""));
    book.on("end", async () => {
      const parts = [];
      let length = 0;
      for (const chapter of book.flow || []) {
        if (length >= MAX_CHARS) break;
        const html = await new Promise((r) => book.getChapter(chapter.id, (err, data) => r(err ? "" : data)));
        const text = clean(String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'));
        if (text) parts.push(text);
        length += text.length;
      }
      resolve(parts.join("\n"));
    });
    book.parse();
  });
}

/** A transcript file next to a video or audio file, as plain text (timestamps removed). */
function transcriptText(file) {
  const base = file.replace(/\.[^.]+$/, "");
  for (const ext of [".vtt", ".srt", ".txt"]) {
    const candidate = `${base}${ext}`;
    if (!fs.existsSync(candidate)) continue;
    const raw = fs.readFileSync(candidate, "utf8");
    if (ext === ".txt") return clean(raw);
    return clean(raw.split(/\r?\n/)
      .filter((line) => line.trim() && !/^WEBVTT/.test(line) && !/^\d+$/.test(line.trim()) && !/-->/.test(line) && !/^(NOTE|STYLE|REGION)\b/.test(line))
      .map((line) => line.replace(/<[^>]+>/g, ""))
      .join(" "));
  }
  return null;
}

export async function extractText(pathKey) {
  const file = absolutePath(pathKey);
  if (!fs.existsSync(file)) return { text: null, reason: "missing" };
  const type = fileType(pathKey);
  const ext = path.extname(pathKey).toLowerCase();
  try {
    if (type === "video" || type === "audio") {
      const text = transcriptText(file);
      return text ? { text, source: "transcript" } : { text: null, reason: "no_transcript" };
    }
    const text = ext === ".pdf" ? await pdfText(file) : ext === ".epub" ? await epubText(file) : null;
    if (!text || text.length < 200) return { text: null, reason: "no_text" };
    return { text, source: ext.slice(1) };
  } catch (error) {
    console.error(`Couldn't read text from ${pathKey}:`, error.message);
    return { text: null, reason: "unreadable" };
  }
}

/**
 * Splits text into parts the model can read (about `size` characters, on sentence ends where
 * possible). Long texts are sampled: at most `max` parts spread evenly from start to end.
 * Returns { parts, total }.
 */
export function splitText(text, { size = 3500, max = Number(process.env.SUMMARY_MAX_PARTS) || 8 } = {}) {
  const all = [];
  let rest = text;
  while (rest.length) {
    if (rest.length <= size) { all.push(rest); break; }
    let cut = rest.lastIndexOf(". ", size);
    if (cut < size * 0.5) cut = size;
    all.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (all.length <= max) return { parts: all, total: all.length };
  const picked = [];
  for (let i = 0; i < max; i++) picked.push(all[Math.round((i * (all.length - 1)) / (max - 1))]);
  return { parts: picked, total: all.length };
}
