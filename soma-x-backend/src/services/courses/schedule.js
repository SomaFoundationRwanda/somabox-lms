// Server side of the course timeline: loads a course's modules and items, resolves their
// dates with @somabox/timeline, and keeps the cached due_at columns (assignments, quizzes,
// modules) in step. Relative offsets are the source of truth; call refreshDueDates after
// anything that changes a start date, a module's week/day, or an item's days.
import { resolveTimeline, endOfDay, startOfDay, todayIn, isDateString, diffDays, DEFAULT_TIMEZONE } from "@somabox/timeline";
import { localDb } from "../../helpers/db-manager.js";

export const SCHOOL_TIMEZONE = process.env.SCHOOL_TIMEZONE || DEFAULT_TIMEZONE;

export function schoolToday(now = new Date()) {
  return todayIn(SCHOOL_TIMEZONE, now);
}

export class ScheduleError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

/** Validates and normalises { releaseDay, dueDay, closeDay } input for an item type. */
export function parseItemDays(itemType, body, current = {}) {
  const has = (k) => body[k] !== undefined;
  if (!has("releaseDay") && !has("dueDay") && !has("closeDay")) return null;
  const num = (v, name) => {
    if (v === null || v === "") return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n > 365) throw new ScheduleError(`${name} must be a whole number of days from 0 to 365`);
    return n;
  };
  const dated = ["assignment", "quiz", "discussion"].includes(itemType);
  const release = has("releaseDay") ? num(body.releaseDay, "releaseDay") ?? 0 : Number(current.release_day ?? 0);
  let due = has("dueDay") ? num(body.dueDay, "dueDay") : (current.due_day ?? null);
  let close = has("closeDay") ? num(body.closeDay, "closeDay") : (current.close_day ?? null);
  if (!dated) { due = null; close = null; }
  if (due !== null && due < release) throw new ScheduleError("The due day can't be before the release day");
  if (close !== null && (due === null || close < due)) throw new ScheduleError("The close day must be on or after the due day");
  return { release_day: release, due_day: due, close_day: close };
}

/**
 * Everything needed to place a course on a calendar:
 * { course, startDate, today, modules: [module + dates], items: [item + dates] }
 */
export async function loadCourseTimeline(courseId, { today = schoolToday() } = {}) {
  const course = await localDb.prepare("SELECT * FROM courses WHERE id = ?").get(courseId);
  if (!course) return null;
  const modules = await localDb.prepare("SELECT * FROM modules WHERE course_id = ? ORDER BY week_offset ASC NULLS LAST, position ASC").all(courseId);
  const items = await localDb.prepare(`
    SELECT mi.*, m.published AS module_published
    FROM module_items mi JOIN modules m ON m.id = mi.module_id
    WHERE m.course_id = ? ORDER BY m.position ASC, mi.position ASC
  `).all(courseId);
  const startDate = isDateString(course.start_date) ? course.start_date : null;
  const resolved = resolveTimeline({ startDate, today, modules, items });

  const moduleDates = new Map(resolved.modules.map((m) => [Number(m.id), m]));
  const itemDates = new Map(resolved.items.map((i) => [Number(i.id), i]));
  return {
    course,
    startDate,
    today,
    modules: modules.map((m) => ({ ...m, ...dropId(moduleDates.get(Number(m.id))) })),
    items: items.map((i) => ({ ...i, ...dropId(itemDates.get(Number(i.id))) })),
  };
}

function dropId(obj) {
  if (!obj) return {};
  const { id, ...rest } = obj;
  return rest;
}

/** Rewrites the cached due_at columns of a course from its relative offsets. */
export async function refreshDueDates(courseId) {
  const timeline = await loadCourseTimeline(courseId);
  if (!timeline) return;
  const dueAt = (date) => (date ? endOfDay(date, SCHOOL_TIMEZONE) : null);

  await localDb.transaction(async () => {
    for (const m of timeline.modules) {
      await localDb.prepare("UPDATE modules SET due_at = ? WHERE id = ?").run(dueAt(m.endDate), m.id);
    }
    // Content with no listing (a graded discussion's assignment) is handled below.
    await localDb.prepare("UPDATE assignments SET due_at = NULL WHERE course_id = ?").run(courseId);
    await localDb.prepare("UPDATE quizzes SET due_at = NULL WHERE course_id = ?").run(courseId);
    for (const item of timeline.items) {
      if (item.item_type === "assignment") {
        await localDb.prepare("UPDATE assignments SET due_at = ? WHERE id = ?").run(dueAt(item.dueDate), item.content_id);
      } else if (item.item_type === "quiz") {
        await localDb.prepare("UPDATE quizzes SET due_at = ? WHERE id = ?").run(dueAt(item.dueDate), item.content_id);
      } else if (item.item_type === "discussion") {
        // A graded discussion is due when its discussion is due.
        await localDb.prepare(`
          UPDATE assignments SET due_at = ? WHERE id = (SELECT linked_assignment_id FROM discussions WHERE id = ?)
        `).run(dueAt(item.dueDate), item.content_id);
      }
    }
  })();
}

/** API shape for an item's dates (date strings plus the exact instants). */
export function datesPayload(item) {
  return {
    releaseDate: item.releaseDate ?? null,
    dueDate: item.dueDate ?? null,
    closeDate: item.closeDate ?? null,
    releaseAt: item.releaseDate ? startOfDay(item.releaseDate, SCHOOL_TIMEZONE) : null,
    dueAt: item.dueDate ? endOfDay(item.dueDate, SCHOOL_TIMEZONE) : null,
    closeAt: item.closeDate ? endOfDay(item.closeDate, SCHOOL_TIMEZONE) : null,
    status: item.status ?? "undated",
  };
}

/** Day offset of `date` from a module's start, for drag-to-reschedule. */
export function dayOffsetFor(moduleStartDate, date) {
  if (!moduleStartDate) throw new ScheduleError("This course has no start date yet, so items can't be scheduled by date");
  if (!isDateString(date)) throw new ScheduleError("Dates must look like YYYY-MM-DD");
  const offset = diffDays(moduleStartDate, date);
  if (offset < 0) throw new ScheduleError("That date is before this item's module starts. Move the item to an earlier module instead.");
  return offset;
}

const ITEM_PATHS = { page: "pages", assignment: "assignments", quiz: "quizzes", discussion: "discussions" };
const TYPE_LABELS = { page: "Page", assignment: "Assignment", quiz: "Quiz", discussion: "Discussion", file: "File" };

/**
 * Calendar events for one course from its resolved timeline. Learners only see published
 * items in published modules. Each event: { id, type: 'module'|'release'|'due'|'close',
 * date, at, title, itemType, moduleItemId, contentId, moduleId, moduleTitle, courseId,
 * courseTitle, published, url, canReschedule }.
 */
export function courseEvents(tl, { isTeacher, from, to, types } = {}) {
  const events = [];
  const inRange = (d) => d && (!from || d >= from) && (!to || d <= to);
  const want = (t) => !types || types.includes(t);
  const modules = new Map(tl.modules.map((m) => [Number(m.id), m]));
  const base = { courseId: tl.course.id, courseTitle: tl.course.title };

  for (const m of tl.modules) {
    if (!m.startDate || (!isTeacher && Number(m.published) !== 1)) continue;
    if (want("module") && inRange(m.startDate)) {
      events.push({
        ...base, id: `module-${m.id}`, type: "module", date: m.startDate, at: startOfDay(m.startDate, SCHOOL_TIMEZONE),
        title: m.kind === "baseline" ? `Baseline week: ${m.title}` : `Week ${m.week_offset}: ${m.title}`,
        moduleId: m.id, moduleTitle: m.title, published: Number(m.published) === 1,
        url: `/course/${tl.course.id}/modules`, canReschedule: false,
      });
    }
  }

  for (const item of tl.items) {
    if (item.item_type === "sub_header") continue;
    const m = modules.get(Number(item.module_id));
    if (!m || !m.startDate) continue;
    const visible = Number(item.published) === 1 && Number(m.published) === 1;
    if (!isTeacher && !visible) continue;
    const url = ITEM_PATHS[item.item_type] ? `/course/${tl.course.id}/${ITEM_PATHS[item.item_type]}/${item.content_id}` : `/course/${tl.course.id}/files`;
    const common = {
      ...base, itemType: item.item_type, moduleItemId: item.id, contentId: item.content_id,
      moduleId: m.id, moduleTitle: m.title, published: visible, url, canReschedule: !!isTeacher,
    };
    const label = TYPE_LABELS[item.item_type] || "Item";
    // Dated work shows its due (and close) date; everything else shows when it's released.
    if (item.dueDate) {
      if (want("due") && inRange(item.dueDate)) {
        events.push({ ...common, id: `due-${item.id}`, type: "due", date: item.dueDate, at: endOfDay(item.dueDate, SCHOOL_TIMEZONE), title: `${label} due: ${item.title}` });
      }
      if (item.closeDate && want("close") && inRange(item.closeDate)) {
        events.push({ ...common, id: `close-${item.id}`, type: "close", date: item.closeDate, at: endOfDay(item.closeDate, SCHOOL_TIMEZONE), title: `${label} closes: ${item.title}` });
      }
    } else if (item.releaseDate && want("release") && inRange(item.releaseDate)) {
      events.push({ ...common, id: `release-${item.id}`, type: "release", date: item.releaseDate, at: startOfDay(item.releaseDate, SCHOOL_TIMEZONE), title: `${label}: ${item.title}` });
    }
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title)));
}

export function icsEvents(events) {
  return events.map((e) => ({
    uid: `${e.id}-${e.courseId}@somabox`,
    date: e.date,
    summary: e.courseTitle ? `${e.title} (${e.courseTitle})` : e.title,
    description: e.moduleTitle ? `Module: ${e.moduleTitle}` : undefined,
  }));
}
