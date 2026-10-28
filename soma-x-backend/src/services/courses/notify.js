// System notifications about courses: who to tell, and what. Every kind has an English text here
// (kept with the notification) and the same key under shell.notifications.kinds in the app's
// languages, so the bell shows it in the reader's language.
import { localDb } from "../../helpers/db-manager.js";
import { createNotification } from "../notifications.service.js";
import { groupHiddenItems } from "./groups.js";

const fill = (text, params) => text.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m));

export const KINDS = {
  addedToCourse: { type: "class_added", title: "You were added to {course}", message: "Open it from My subjects." },
  teachingCourse: { type: "class_added", title: "You now teach {course}", message: "Open it from My subjects." },
  workPublished: { type: "work", title: "New work: {item}", message: "In {course}." },
  workMarked: { type: "graded", title: "{item} was marked", message: "See your score in {course}, on Grades." },
  scoresPublished: { type: "graded", title: "Scores published: {item}", message: "See your score in {course}, on Grades." },
  announcement: { type: "announcement", title: "{title}", message: "New announcement in {course}." },
  urgentAnnouncement: { type: "announcement", title: "Urgent: {title}", message: "Urgent announcement in {course}." },
  discussionStarted: { type: "discussion", title: "New discussion: {title}", message: "In {course}. Add your reply." },
  joinRequest: { type: "class_added", title: "{name} asked to join {course}", message: "They used the join code. Approve or decline them on People." },
  courseOpened: { type: "class_added", title: "{course} is open", message: "Your teacher opened this subject. Start with this week." },
};

/** Sends one kind of notification to each email (once each). */
export async function notify(emails, kind, params, link) {
  const k = KINDS[kind];
  for (const email of new Set(emails.map((e) => String(e || "").toLowerCase()).filter(Boolean))) {
    await createNotification({
      userEmail: email, type: k.type, link,
      title: fill(k.title, params), message: fill(k.message, params), key: kind, params,
    });
  }
}

export async function courseTitle(courseId) {
  return (await localDb.prepare("SELECT title FROM courses WHERE id = ?").get(courseId))?.title || "";
}

/** Tells someone they were added to a course: learners only once they can open it (not a draft). */
export async function notifyAddedToCourse(courseId, email, role) {
  const course = await localDb.prepare("SELECT title, lifecycle FROM courses WHERE id = ?").get(courseId);
  if (!course) return;
  const staff = role === "teacher" || role === "ta";
  if (!staff && course.lifecycle !== "open") return;
  await notify([email], staff ? "teachingCourse" : "addedToCourse", { course: course.title }, `/course/${courseId}/home`);
}

/** The course's active learners, lower-cased. */
export async function activeLearners(courseId) {
  const rows = await localDb.prepare("SELECT LOWER(user_email) AS email FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").all(courseId);
  return rows.map((r) => r.email);
}

/** Learners who are given this item (groups can keep an assignment or discussion from some). */
export async function learnersGiven(courseId, itemType, contentId) {
  const out = [];
  for (const email of await activeLearners(courseId)) {
    if (!(await groupHiddenItems(courseId, email)).has(`${itemType}:${contentId}`)) out.push(email);
  }
  return out;
}

const ITEM_PATHS = { assignment: "assignments", quiz: "quizzes", discussion: "discussions" };

/**
 * Tells learners about graded work (assignments, graded quizzes; a graded discussion's assignment
 * is told as its discussion) and discussions they can now see and weren't told about yet. Call
 * after anything that can make items visible: publishing an item or a week, opening the course.
 * silent: only record them as told (opening a course doesn't send one message per item).
 */
export async function announceVisible(courseId, { silent = false } = {}) {
  const rows = await localDb.prepare(`
    SELECT mi.item_type, mi.content_id FROM module_items mi
    JOIN modules m ON m.id = mi.module_id JOIN courses c ON c.id = m.course_id
    WHERE m.course_id = ? AND mi.published = 1 AND m.published = 1 AND c.lifecycle = 'open'
      AND mi.item_type IN ('assignment', 'quiz', 'discussion')
      AND NOT EXISTS (SELECT 1 FROM announced_items a WHERE a.item_type = mi.item_type AND a.content_id = mi.content_id)
  `).all(courseId);
  if (!rows.length) return;
  const course = await courseTitle(courseId);
  for (const { item_type: itemType, content_id: contentId } of rows) {
    const claimed = await localDb.prepare(`
      INSERT INTO announced_items (item_type, content_id) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING content_id
    `).get(itemType, contentId);
    if (!claimed || silent) continue;
    const table = { assignment: "assignments", quiz: "quizzes", discussion: "discussions" }[itemType];
    const row = await localDb.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(contentId);
    if (!row || (itemType === "quiz" && row.kind !== "graded")) continue;
    const params = { course, item: row.title, title: row.title };
    const link = `/course/${courseId}/${ITEM_PATHS[itemType]}/${contentId}`;
    await notify(await learnersGiven(courseId, itemType, contentId), itemType === "discussion" ? "discussionStarted" : "workPublished", params, link);
  }
}
