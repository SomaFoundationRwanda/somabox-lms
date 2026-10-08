// AI summaries of Explore and Library files for learners. A summary is made once per file and
// language (in the background, one at a time, because the model is slow on a school box) and
// then shared by everyone who opens that file. Only the file's own text goes to the model; nothing
// about learners does. Books: their text. Videos and audio: a transcript file next to them.
import fs from "fs";
import path from "path";
import { localDb } from "../../helpers/db-manager.js";
import { generateStructured, AiError } from "../ai/gateway.js";
import { schoolAiEnabled } from "../ai/access.js";
import { absolutePath, fileType } from "./roots.js";
import { extractText, splitText } from "./text.js";

export const SUMMARY_LANGUAGES = ["en", "fr", "rw", "sw", "es"];
const dailyLimit = () => Number(process.env.SUMMARY_DAILY_LIMIT) || 5;

const REASONS = {
  no_text: "This file has no readable text (it may be scanned pages), so it can't be summarised.",
  no_transcript: "Videos and recordings can be summarised when a transcript (.vtt, .srt, or .txt with the same name) is saved next to them.",
  unreadable: "This file couldn't be read.",
  missing: "This file isn't on the box any more.",
};

export async function summariesEnabled() {
  const row = await localDb.prepare("SELECT value FROM system_settings WHERE key = 'learner_summaries_enabled'").get();
  const on = row ? row.value !== false && row.value !== "false" : true;
  return on && await schoolAiEnabled();
}

/** Whether a summary could be made for this file at all (cheap checks only). */
export function summarisable(pathKey) {
  const type = fileType(pathKey);
  if (type === "book") return { ok: true };
  if (type === "video" || type === "audio") {
    const base = absolutePath(pathKey).replace(/\.[^.]+$/, "");
    const has = [".vtt", ".srt", ".txt"].some((ext) => fs.existsSync(`${base}${ext}`));
    return has ? { ok: true } : { ok: false, reason: "no_transcript", message: REASONS.no_transcript };
  }
  return { ok: false, reason: "unsupported", message: "This kind of file can't be summarised." };
}

export async function userLanguage(userId) {
  const row = await localDb.prepare("SELECT preferred_language FROM users WHERE id = ?").get(userId);
  return SUMMARY_LANGUAGES.includes(row?.preferred_language) ? row.preferred_language : "en";
}

export function summaryView(row, { staff = false } = {}) {
  if (!row) return { status: "none" };
  if (row.hidden && !staff) return { status: "hidden" };
  return {
    status: row.status, language: row.language, summary: row.status === "done" ? row.summary : null,
    error: row.status === "failed" ? row.error : null, partsRead: row.parts_read, partsTotal: row.parts_total,
    hidden: !!row.hidden, createdAt: row.created_at, finishedAt: row.finished_at,
    position: row.status === "queued" ? row.position ?? 0 : undefined,
  };
}

export async function getSummary(pathKey, language) {
  const row = await localDb.prepare("SELECT * FROM content_summaries WHERE path_key = ? AND language = ?").get(pathKey, language);
  if (row?.status === "queued") {
    // How many summaries are ahead of this one.
    const ahead = await localDb.prepare("SELECT COUNT(*) AS n FROM content_summaries WHERE status IN ('queued', 'running') AND id < ?").get(row.id);
    row.position = Number(ahead.n);
  }
  return row;
}

/**
 * Asks for a summary. Returns { row, created } or throws { status, message, code }.
 * Learners may start at most SUMMARY_DAILY_LIMIT new summaries a day (default 5); asking for one
 * that already exists or is being made is free.
 */
export async function requestSummary(user, pathKey, language) {
  const existing = await getSummary(pathKey, language);
  if (existing && existing.status !== "failed") return { row: existing, created: false };
  const can = summarisable(pathKey);
  if (!can.ok) throw Object.assign(new Error(can.message), { status: 400, code: can.reason.toUpperCase() });
  const staff = ["teacher", "ta", "admin"].includes(user.role);
  if (!staff) {
    const used = await localDb.prepare(`
      SELECT COUNT(*) AS n FROM content_summaries WHERE requested_by = ? AND created_at > NOW() - INTERVAL '1 day'
    `).get(user.id);
    if (Number(used.n) >= dailyLimit()) {
      throw Object.assign(new Error(`You can ask for ${dailyLimit()} new summaries a day. Summaries others asked for are always available.`), { status: 429, code: "DAILY_LIMIT" });
    }
  }
  let row;
  if (existing) {
    row = await localDb.prepare(`
      UPDATE content_summaries SET status = 'queued', error = NULL, summary = NULL, requested_by = ?, created_at = CURRENT_TIMESTAMP, finished_at = NULL
      WHERE id = ? RETURNING *
    `).get(user.id, existing.id);
  } else {
    row = await localDb.prepare(`
      INSERT INTO content_summaries (path_key, language, status, requested_by) VALUES (?, ?, 'queued', ?)
      ON CONFLICT (path_key, language) DO UPDATE SET path_key = EXCLUDED.path_key RETURNING *
    `).get(pathKey, language, user.id);
  }
  kick();
  return { row, created: true };
}

// ---- Worker -----------------------------------------------------------------------------------

let working = null;

async function claim() {
  return localDb.transaction(async () => {
    const row = await localDb.prepare(`
      SELECT * FROM content_summaries WHERE status = 'queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED
    `).get();
    if (!row) return null;
    await localDb.prepare("UPDATE content_summaries SET status = 'running' WHERE id = ?").run(row.id);
    return row;
  })();
}

async function make(row) {
  const fail = async (message) => {
    await localDb.prepare("UPDATE content_summaries SET status = 'failed', error = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(message, row.id);
  };
  try {
    const item = await localDb.prepare("SELECT title, type FROM content_items WHERE path_key = ?").get(row.path_key);
    const { text, reason } = await extractText(row.path_key);
    if (!text) return fail(REASONS[reason] || REASONS.unreadable);
    const { parts, total } = splitText(text);
    await localDb.prepare("UPDATE content_summaries SET parts_total = ?, parts_read = 0, source_size = ? WHERE id = ?").run(parts.length, text.length, row.id);
    const title = item?.title || path.basename(row.path_key);
    const kind = fileType(row.path_key);
    const run = (task, input) => generateStructured({ task, input: { language: row.language, title, kind, ...input }, userId: row.requested_by, feature: "summary" });
    const notes = [];
    for (const [i, part] of parts.entries()) {
      const result = await run("notes", { part: `${i + 1} of ${parts.length}`, sourceText: part });
      notes.push(...result.notes);
      await localDb.prepare("UPDATE content_summaries SET parts_read = ? WHERE id = ?").run(i + 1, row.id);
    }
    const summary = await run("content_summary", { notes: notes.slice(0, 40) });
    await localDb.prepare(`
      UPDATE content_summaries SET status = 'done', summary = ?::jsonb, finished_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(JSON.stringify({ ...summary, sampled: total > parts.length, partsInFile: total }), row.id);
  } catch (error) {
    if (!(error instanceof AiError)) console.error(`Summary of ${row.path_key} failed:`, error);
    await fail(error instanceof AiError ? error.message : "Something went wrong while making this summary");
  }
}

export function kick() {
  if (working) return working;
  working = (async () => {
    try {
      for (let row = await claim(); row; row = await claim()) await make(row);
    } finally {
      working = null;
    }
  })();
  return working;
}

/** After a restart: summaries that were being made start again. */
export async function recoverSummaries() {
  await localDb.prepare("UPDATE content_summaries SET status = 'queued' WHERE status = 'running'").run();
  kick();
}

export async function waitForSummaries() {
  while (working) await working;
}
