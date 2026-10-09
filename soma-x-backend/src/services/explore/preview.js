// Visitor previews: people who haven't signed up can try a few Explore or Library items for a
// short time (the admin sets how many and how long; default 5 items, 40 seconds), then they're
// asked to sign up. Enforced on the box, not just in the browser:
// - each visitor (a signed cookie) may start previews of a limited number of items a day;
// - an item's file is only sent during its preview window (the preview time plus a little slack);
// - for videos and audio only the beginning of the file is sent, so it can't be saved whole.
import crypto from "crypto";
import fs from "fs";
import { localDb } from "../../helpers/db-manager.js";
import { signValue, verifyValue, cookieValue } from "../../helpers/media.js";
import { getSchool } from "../school.js";
import { absolutePath, fileType } from "./roots.js";

export const GUEST_COOKIE = "somabox_guest";
const SLACK_SECONDS = 30;
const MIN_CAP_BYTES = 8 * 1024 * 1024;
const CAP_SHARE = 0.25;

async function guestId(req) {
  return verifyValue(cookieValue(req, GUEST_COOKIE));
}

/**
 * Starts (or continues) a visitor's preview of one item. Returns { seconds, remainingItems,
 * startedAt } or throws { status, code, message }. Sets the visitor cookie when it's new.
 */
export async function startPreview(req, res, pathKey) {
  const { guestPreview: settings } = await getSchool();
  if (!settings.enabled) throw Object.assign(new Error("Sign up to open this"), { status: 403, code: "PREVIEW_OFF" });

  let id = await guestId(req);
  if (!id) {
    id = crypto.randomUUID();
    res.cookie(GUEST_COOKIE, await signValue(id), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 30 * 24 * 3600 * 1000 });
  }
  const existing = await localDb.prepare("SELECT started_at FROM guest_previews WHERE guest_id = ? AND path_key = ?").get(id, pathKey);
  const used = Number((await localDb.prepare(`
    SELECT COUNT(*) AS n FROM guest_previews WHERE guest_id = ? AND started_at > NOW() - INTERVAL '1 day'
  `).get(id)).n);
  if (!existing && used >= settings.items) {
    throw Object.assign(new Error(`You've tried ${settings.items} items. Sign up for free to keep learning.`), { status: 403, code: "PREVIEW_LIMIT" });
  }
  const row = existing || await localDb.prepare("INSERT INTO guest_previews (guest_id, path_key) VALUES (?, ?) RETURNING started_at").get(id, pathKey);
  const elapsed = (Date.now() - new Date(row.started_at).getTime()) / 1000;
  if (elapsed > settings.seconds + SLACK_SECONDS) {
    throw Object.assign(new Error("Your preview of this has ended. Sign up for free to watch or read it all."), { status: 403, code: "PREVIEW_ENDED" });
  }
  return {
    seconds: settings.seconds,
    secondsLeft: Math.max(0, Math.round(settings.seconds - elapsed)),
    remainingItems: Math.max(0, settings.items - (existing ? used : used + 1)),
    startedAt: row.started_at,
  };
}

/** True if this visitor is inside the preview window for this item. */
export async function guestMayOpen(req, pathKey) {
  const id = await guestId(req);
  if (!id) return false;
  const { guestPreview: settings } = await getSchool();
  if (!settings.enabled) return false;
  const row = await localDb.prepare(`
    SELECT 1 FROM guest_previews WHERE guest_id = ? AND path_key = ? AND started_at > NOW() - make_interval(secs => ?)
  `).get(id, pathKey, settings.seconds + SLACK_SECONDS);
  return !!row;
}

/**
 * For visitors' videos and audio: limits the byte range to the start of the file (a quarter, at
 * least 8 MB). Returns false if the request asks for something past that (the preview is over).
 */
export function limitGuestRange(req, pathKey) {
  const type = fileType(pathKey);
  if (type !== "video" && type !== "audio") return true;
  const size = fs.statSync(absolutePath(pathKey)).size;
  const cap = Math.min(size, Math.max(MIN_CAP_BYTES, Math.ceil(size * CAP_SHARE)));
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || "").trim());
  const start = match && match[1] !== "" ? Number(match[1]) : 0;
  if (start >= cap) return false;
  const askedEnd = match && match[2] !== "" ? Number(match[2]) : cap - 1;
  req.headers.range = `bytes=${start}-${Math.min(askedEnd, cap - 1)}`;
  return true;
}

/** Old preview records (kept a week for the daily limit, then removed). */
export async function purgeOldPreviews() {
  await localDb.prepare("DELETE FROM guest_previews WHERE started_at < NOW() - INTERVAL '7 days'").run();
}
