// Course timeline: the single place dates are calculated. Used by the backend (to answer
// API calls and cache due dates) and the frontend (to preview dates while editing), so
// both always agree.
//
// Model (relative offsets are the source of truth; dates are derived):
// - A course has a start date (YYYY-MM-DD): the first day of Week 1. Week N starts
//   7 * (N - 1) days later. The baseline (Week 0) is the 7 days before Week 1, so adding or
//   removing a baseline never moves any other date.
// - A module sits at week_offset (0 = baseline, 1.. = regular) plus day_offset (0-6) days.
//   The "Unassigned" holding module has no dates.
// - An item has release_day, due_day, and close_day: days after its module's start
//   (0 = the module's first day). due_day/close_day may be null (no due date / no cutoff).
// - Plain calendar days: no holidays or school-day rules.
//
// Dates are 'YYYY-MM-DD' strings and all date arithmetic is on calendar dates, never on
// milliseconds, so time zones and daylight saving can't shift a day.

export const DEFAULT_TIMEZONE = "Africa/Kigali";
export const DEFAULT_DUE_DAY = 6;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateString(value) {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

function parts(dateStr) {
  const m = DATE_RE.exec(dateStr);
  if (!m) throw new Error(`Not a date: ${dateStr}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fromUtcDate(d) {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** dateStr plus n calendar days. */
export function addDays(dateStr, n) {
  const [y, m, d] = parts(dateStr);
  return fromUtcDate(new Date(Date.UTC(y, m - 1, d + Number(n))));
}

/** Calendar days from a to b (b - a). */
export function diffDays(a, b) {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

export function compareDates(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Day of week, 0 = Sunday. */
export function weekday(dateStr) {
  const [y, m, d] = parts(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// ---- Time zones (only for turning a calendar date into an instant) ---------------------

function zoneOffsetMinutes(utcMs, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const get = (type) => Number(fmt.formatToParts(new Date(utcMs)).find((p) => p.type === type).value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60000);
}

/** The instant (ISO string) of a wall-clock time on dateStr in timeZone. */
export function zonedInstant(dateStr, hour, minute, second, timeZone = DEFAULT_TIMEZONE) {
  const [y, m, d] = parts(dateStr);
  const guess = Date.UTC(y, m - 1, d, hour, minute, second);
  let utc = guess - zoneOffsetMinutes(guess, timeZone) * 60000;
  const second2 = zoneOffsetMinutes(utc, timeZone);
  utc = guess - second2 * 60000;
  return new Date(utc).toISOString();
}

/** Last second of dateStr in timeZone (when something "due on" that day is due). */
export function endOfDay(dateStr, timeZone = DEFAULT_TIMEZONE) {
  return zonedInstant(dateStr, 23, 59, 59, timeZone);
}

export function startOfDay(dateStr, timeZone = DEFAULT_TIMEZONE) {
  return zonedInstant(dateStr, 0, 0, 0, timeZone);
}

/** Today's date in timeZone. */
export function todayIn(timeZone = DEFAULT_TIMEZONE, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The calendar date (in timeZone) of an instant or date-like value. */
export function dateIn(value, timeZone = DEFAULT_TIMEZONE) {
  if (value == null || value === "") return null;
  if (isDateString(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return todayIn(timeZone, d);
}

// ---- Course timeline -------------------------------------------------------------------

/** First day of a module: Week 1 starts on the course start date. */
export function moduleStart(courseStart, module) {
  if (!courseStart || module.kind === "unassigned" || module.week_offset == null) return null;
  return addDays(courseStart, (Number(module.week_offset) - 1) * 7 + (Number(module.day_offset) || 0));
}

export function itemDates(modStart, item) {
  if (!modStart) return { releaseDate: null, dueDate: null, closeDate: null };
  const day = (v) => (v == null || v === "" ? null : Number(v));
  const release = day(item.release_day) ?? 0;
  const due = day(item.due_day);
  const close = day(item.close_day);
  return {
    releaseDate: addDays(modStart, release),
    dueDate: due == null ? null : addDays(modStart, due),
    closeDate: close == null ? null : addDays(modStart, close),
  };
}

export function moduleStatus(start, end, today) {
  if (!start) return "undated";
  if (compareDates(today, start) < 0) return "upcoming";
  if (compareDates(today, end) > 0) return "past";
  return "current";
}

/** upcoming (not released) | open | past_due (after due, still accepted) | closed | undated */
export function itemStatus({ releaseDate, dueDate, closeDate }, today) {
  if (!releaseDate) return "undated";
  if (compareDates(today, releaseDate) < 0) return "upcoming";
  if (closeDate && compareDates(today, closeDate) > 0) return "closed";
  if (dueDate && compareDates(today, dueDate) > 0) return closeDate ? "past_due" : "closed";
  return "open";
}

/**
 * Resolves every module and item of a course.
 * input: { startDate, today, modules: [{ id, kind, week_offset, day_offset }],
 *          items: [{ id, module_id, release_day, due_day, close_day }] }
 */
export function resolveTimeline({ startDate, today, modules, items = [] }) {
  const resolvedModules = new Map();
  for (const m of modules) {
    const start = moduleStart(startDate, m);
    const end = start ? addDays(start, 6) : null;
    resolvedModules.set(Number(m.id), {
      id: m.id, startDate: start, endDate: end,
      status: today ? moduleStatus(start, end, today) : undefined,
    });
  }
  const resolvedItems = items.map((item) => {
    const mod = resolvedModules.get(Number(item.module_id));
    const dates = itemDates(mod?.startDate || null, item);
    return { id: item.id, ...dates, status: today ? itemStatus(dates, today) : undefined };
  });
  return { modules: [...resolvedModules.values()], items: resolvedItems };
}

/**
 * Week/day offsets after moving a module by `days` calendar days. A baseline stays in
 * week 0 (only its day can move, and not before the course start); a regular module
 * can't move before Week 1.
 */
export function shiftModuleOffsets(module, days) {
  const week = Number(module.week_offset);
  const day = Number(module.day_offset) || 0;
  if (module.kind === "baseline") {
    const next = day + days;
    if (next < 0 || next > 6) throw new RangeError("The baseline week can only move within its own week");
    return { week_offset: 0, day_offset: next };
  }
  const total = (week - 1) * 7 + day + days;
  if (total < 0) throw new RangeError("A module can't move before Week 1");
  return { week_offset: Math.floor(total / 7) + 1, day_offset: total % 7 };
}
