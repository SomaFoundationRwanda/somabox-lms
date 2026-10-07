// Display helpers for calendar dates ('YYYY-MM-DD' strings).
// A date string is a calendar day, not an instant: it is parsed into a local Date from its
// parts so the viewer's time zone can never shift it to the previous or next day.
import { isDateString } from "@somabox/timeline";

const DEFAULT_OPTS = { weekday: "short", day: "numeric", month: "short" };

/** Local Date for a 'YYYY-MM-DD' string (midnight local time), or null. */
export function toLocalDate(dateStr) {
  if (!isDateString(dateStr)) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** 'YYYY-MM-DD' for a local Date. */
export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** e.g. "Tue, 13 Jan". Returns "" for a missing/invalid date. */
export function formatDate(dateStr, opts = DEFAULT_OPTS) {
  const date = toLocalDate(dateStr);
  if (!date) return "";
  return date.toLocaleDateString(undefined, opts);
}

/** e.g. "Mon, 12 Jan – Sun, 18 Jan" (or a single date when only one end is known). */
export function formatRange(start, end, opts = { day: "numeric", month: "short" }) {
  const a = formatDate(start, opts);
  const b = formatDate(end, opts);
  if (a && b) return a === b ? a : `${a} – ${b}`;
  return a || b || "";
}

/** Calendar date of an instant (ISO string) in the viewer's time zone, formatted. */
export function formatInstantDate(value, opts = DEFAULT_OPTS) {
  if (!value) return "";
  if (isDateString(value)) return formatDate(value, opts);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, opts);
}

/** A stored date value as 'YYYY-MM-DD' for <input type="date"> ("" if unusable). Never goes
 *  through toISOString, which would shift the day in time zones ahead of UTC. */
export function toDateInput(value) {
  if (!value) return "";
  if (isDateString(value)) return value;
  const head = String(value).slice(0, 10);
  return isDateString(head) ? head : "";
}
