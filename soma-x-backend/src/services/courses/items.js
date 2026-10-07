// Course content lifecycle: every page, assignment, quiz, and discussion is created inside a
// module, moved between modules, and deleted through these functions, so content.module_id
// and its module_items listing never disagree. Callers handle auth.
import { localDb } from "../../helpers/db-manager.js";
import { calculateEstimatedReadMinutes, syncPageFileReferences } from "./shared.js";
import { ScheduleError, parseItemDays, refreshDueDates } from "./schedule.js";
import { baselineQuestionsChanged } from "./setup.js";

export const CONTENT_TABLES = {
  page: "course_pages",
  assignment: "assignments",
  quiz: "quizzes",
  discussion: "discussions",
};

// Graded work must be tagged with at least one outcome before learners can see it.
export const GRADED_TYPES = ["assignment", "quiz"];

export class ItemError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function getCourseModule(courseId, moduleId) {
  return await localDb.prepare("SELECT * FROM modules WHERE id = ? AND course_id = ?").get(moduleId, courseId);
}

/** The course's "Unassigned (fix me)" holding module, created on first use. */
export async function getUnassignedModule(courseId) {
  const existing = await localDb.prepare("SELECT * FROM modules WHERE course_id = ? AND kind = 'unassigned'").get(courseId);
  if (existing) return existing;
  await localDb.prepare(`
    INSERT INTO modules (course_id, title, description, position, published, kind, week_offset, day_offset)
    VALUES (?, 'Unassigned (fix me)', 'Items that are not in a week yet. Move each one into the right module; the course can''t open while this module has items.', 9999, 0, 'unassigned', NULL, NULL)
    ON CONFLICT DO NOTHING
  `).run(courseId);
  return await localDb.prepare("SELECT * FROM modules WHERE course_id = ? AND kind = 'unassigned'").get(courseId);
}

async function nextItemPosition(moduleId) {
  const row = await localDb.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM module_items WHERE module_id = ?").get(moduleId);
  return Number(row?.m ?? -1) + 1;
}

export async function replaceQuizQuestions(quizId, questions, courseId) {
  await baselineQuestionsChanged(courseId, quizId);
  await localDb.prepare("DELETE FROM quiz_questions WHERE quiz_id = ?").run(quizId);
  for (const [idx, q] of questions.entries()) {
    const outcomeId = q?.outcomeId ? Number(q.outcomeId) : null;
    if (outcomeId) {
      const outcome = await localDb.prepare("SELECT id FROM outcomes WHERE id = ? AND course_id = ?").get(outcomeId, courseId);
      if (!outcome) throw new ItemError(400, `Question ${idx + 1} is tagged with an outcome from another course`);
    }
    await localDb.prepare(`
      INSERT INTO quiz_questions (quiz_id, position, prompt, question_type, options, correct_option, points, outcome_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      quizId, idx,
      String(q?.prompt || "").trim() || "Untitled question",
      q?.questionType === "open" ? "open" : "multiple_choice",
      JSON.stringify(Array.isArray(q?.options) ? q.options : []),
      q?.correctOption || null,
      Number(q?.points) || 1,
      outcomeId
    );
  }
  // A quiz assesses every outcome its questions are tagged with.
  await localDb.prepare(`
    INSERT INTO item_outcomes (course_id, item_type, item_id, outcome_id)
    SELECT DISTINCT ?, 'quiz', quiz_id, outcome_id FROM quiz_questions WHERE quiz_id = ? AND outcome_id IS NOT NULL
    ON CONFLICT (item_type, item_id, outcome_id) DO NOTHING
  `).run(courseId, quizId);
}

async function setItemOutcomes(courseId, itemType, contentId, outcomeIds) {
  await localDb.prepare("DELETE FROM item_outcomes WHERE course_id = ? AND item_type = ? AND item_id = ?").run(courseId, itemType, contentId);
  for (const raw of outcomeIds) {
    const outcomeId = Number(raw);
    const outcome = await localDb.prepare("SELECT id FROM outcomes WHERE id = ? AND course_id = ?").get(outcomeId, courseId);
    if (!outcome) throw new ItemError(400, "One of the outcomes doesn't belong to this course");
    await localDb.prepare(`
      INSERT INTO item_outcomes (course_id, item_type, item_id, outcome_id) VALUES (?, ?, ?, ?)
      ON CONFLICT (item_type, item_id, outcome_id) DO NOTHING
    `).run(courseId, itemType, contentId, outcomeId);
  }
}

export { setItemOutcomes };

/** Whether a graded item (assignment or graded/baseline quiz) has at least one outcome tag. */
export async function needsOutcomeBeforePublish(itemType, contentId) {
  if (!GRADED_TYPES.includes(itemType)) return false;
  if (itemType === "quiz") {
    const quiz = await localDb.prepare("SELECT kind FROM quizzes WHERE id = ?").get(contentId);
    if (quiz?.kind === "practice") return false;
  }
  const tag = await localDb.prepare("SELECT 1 FROM item_outcomes WHERE item_type = ? AND item_id = ? LIMIT 1").get(itemType, contentId);
  return !tag;
}

export const OUTCOME_REQUIRED_MESSAGE =
  "This item has no outcome, so it can't show learner progress. Tag it with at least one outcome, then publish it.";

/**
 * Creates content of itemType inside moduleId, plus its module item, in one transaction.
 * Graded items are only published when they have outcomes (pass outcomeIds); otherwise
 * they're saved as drafts. Returns { moduleItemId, contentId, position, published, notice }.
 */
export async function createModuleContent({ courseId, moduleId, itemType, data = {}, actorEmail, publish = true, indentLevel = 0 }) {
  if (!CONTENT_TABLES[itemType]) throw new ItemError(400, `Unsupported item type: ${itemType}`);
  const moduleRow = await getCourseModule(courseId, moduleId);
  if (!moduleRow) throw new ItemError(404, "Module not found");

  const title = String(data.title || "").trim() || "Untitled";
  const outcomeIds = Array.isArray(data.outcomeIds) ? data.outcomeIds.filter(Boolean) : [];
  // Dates come from day offsets within the module (due_at is derived, never stored directly).
  const days = parseItemDays(itemType, data) || parseItemDays(itemType, { releaseDay: 0, dueDay: 6 });

  return await localDb.transaction(async () => {
    let contentId;
    if (itemType === "page") {
      const bodyJson = data.bodyJson ? (typeof data.bodyJson === "string" ? data.bodyJson : JSON.stringify(data.bodyJson)) : null;
      const readMins = calculateEstimatedReadMinutes(bodyJson, data.bodyHtml, data.body);
      const row = await localDb.prepare(`
        INSERT INTO course_pages (course_id, module_id, title, body, body_json, body_html, estimated_read_minutes, published, created_by_teacher_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?) RETURNING id
      `).get(courseId, moduleRow.id, title, data.body || "", bodyJson, data.bodyHtml || null, readMins, actorEmail);
      contentId = Number(row.id);
      await syncPageFileReferences(contentId, bodyJson);
    } else if (itemType === "assignment") {
      const row = await localDb.prepare(`
        INSERT INTO assignments (course_id, module_id, title, description, points_possible, published, created_by_teacher_email)
        VALUES (?, ?, ?, ?, ?, 0, ?) RETURNING id
      `).get(courseId, moduleRow.id, title, data.description || "", Number(data.pointsPossible) || 100, actorEmail);
      contentId = Number(row.id);
    } else if (itemType === "quiz") {
      const kind = ["baseline", "practice", "graded"].includes(data.kind) ? data.kind : (moduleRow.kind === "baseline" ? "baseline" : "graded");
      const attempts = data.attemptsAllowed == null || data.attemptsAllowed === "" ? null : Number(data.attemptsAllowed);
      const timeLimit = data.timeLimitMinutes == null || data.timeLimitMinutes === "" ? null : Number(data.timeLimitMinutes);
      const row = await localDb.prepare(`
        INSERT INTO quizzes (course_id, module_id, title, description, published, created_by_teacher_email, kind, attempts_allowed, time_limit_minutes)
        VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?) RETURNING id
      `).get(courseId, moduleRow.id, title, data.description || "", actorEmail, kind, attempts, timeLimit);
      contentId = Number(row.id);
      await replaceQuizQuestions(contentId, Array.isArray(data.questions) ? data.questions : [], courseId);
    } else if (itemType === "discussion") {
      const row = await localDb.prepare(`
        INSERT INTO discussions (course_id, module_id, title, body, published, created_by_teacher_email)
        VALUES (?, ?, ?, ?, 0, ?) RETURNING id
      `).get(courseId, moduleRow.id, title, data.body || "", actorEmail);
      contentId = Number(row.id);
    }

    if (outcomeIds.length) await setItemOutcomes(courseId, itemType, contentId, outcomeIds);

    let published = Boolean(publish);
    let notice = null;
    if (published && await needsOutcomeBeforePublish(itemType, contentId)) {
      published = false;
      notice = "Saved as a draft: add an outcome before publishing, so this item can show learner progress.";
    }
    if (published) {
      await localDb.prepare(`UPDATE ${CONTENT_TABLES[itemType]} SET published = 1 WHERE id = ?`).run(contentId);
    }

    const position = await nextItemPosition(moduleRow.id);
    const item = await localDb.prepare(`
      INSERT INTO module_items (module_id, item_type, content_id, title, position, indent_level, published, release_day, due_day, close_day)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
    `).get(moduleRow.id, itemType, contentId, title, position, Math.min(3, Math.max(0, Number(indentLevel) || 0)), published ? 1 : 0,
      days.release_day, days.due_day, days.close_day);
    await refreshDueDates(courseId);

    return { moduleItemId: Number(item.id), contentId, position, published, notice, title };
  })();
}

/** Moves content (and its module item listing) to another module of the same course. */
export async function moveContentToModule(courseId, itemType, contentId, targetModuleId) {
  const table = CONTENT_TABLES[itemType];
  if (!table) throw new ItemError(400, `Unsupported item type: ${itemType}`);
  const target = await getCourseModule(courseId, targetModuleId);
  if (!target) throw new ItemError(404, "Module not found");

  await localDb.transaction(async () => {
    const position = await nextItemPosition(target.id);
    await localDb.prepare(`UPDATE ${table} SET module_id = ? WHERE id = ? AND course_id = ?`).run(target.id, contentId, courseId);
    await localDb.prepare("UPDATE module_items SET module_id = ?, position = ? WHERE item_type = ? AND content_id = ?")
      .run(target.id, position, itemType, contentId);
    if (itemType === "discussion") {
      // A graded discussion's assignment follows its discussion.
      await localDb.prepare(`
        UPDATE assignments SET module_id = ? WHERE id = (SELECT linked_assignment_id FROM discussions WHERE id = ?)
      `).run(target.id, contentId);
    }
    // Day offsets are kept, so the item lands on the same weekday of its new module.
    await refreshDueDates(courseId);
  })();
  return target;
}

/** Deletes content, its module item, its outcome tags, and a graded discussion's assignment. */
export async function deleteContent(courseId, itemType, contentId) {
  const table = CONTENT_TABLES[itemType];
  if (!table) throw new ItemError(400, `Unsupported item type: ${itemType}`);
  await localDb.transaction(async () => {
    if (itemType === "discussion") {
      const discussion = await localDb.prepare("SELECT linked_assignment_id FROM discussions WHERE id = ? AND course_id = ?").get(contentId, courseId);
      if (discussion?.linked_assignment_id) {
        await localDb.prepare("DELETE FROM item_outcomes WHERE item_type = 'assignment' AND item_id = ?").run(discussion.linked_assignment_id);
        await localDb.prepare("DELETE FROM assignments WHERE id = ? AND course_id = ?").run(discussion.linked_assignment_id, courseId);
      }
    }
    if (itemType === "assignment") {
      await localDb.prepare("UPDATE discussions SET linked_assignment_id = NULL, graded = 0 WHERE linked_assignment_id = ? AND course_id = ?").run(contentId, courseId);
    }
    await localDb.prepare("DELETE FROM module_items WHERE item_type = ? AND content_id = ?").run(itemType, contentId);
    await localDb.prepare("DELETE FROM item_outcomes WHERE course_id = ? AND item_type = ? AND item_id = ?").run(courseId, itemType, contentId);
    await localDb.prepare(`DELETE FROM ${table} WHERE id = ? AND course_id = ?`).run(contentId, courseId);
  })();
}

/** Sends an ItemError as JSON; returns false for other errors so the caller can 500. */
export function sendItemError(res, error) {
  if (error?.name === "ScheduleError" || error instanceof ScheduleError) {
    res.status(400).json({ message: error.message });
    return true;
  }
  if (!(error instanceof ItemError)) return false;
  res.status(error.status).json({ message: error.message, ...(error.code ? { code: error.code } : {}) });
  return true;
}

/** Keeps a content row's module listing in step when its published flag changes. */
export async function syncListingPublished(itemType, contentId, published) {
  await localDb.prepare("UPDATE module_items SET published = ? WHERE item_type = ? AND content_id = ?").run(published ? 1 : 0, itemType, contentId);
}

/** { id, title, kind, week_offset } of the module a piece of content belongs to. */
export async function moduleSummary(moduleId) {
  return await localDb.prepare("SELECT id, title, kind, week_offset FROM modules WHERE id = ?").get(moduleId) || null;
}

/** Applies { releaseDay, dueDay, closeDay } from a request to a content item's listing. */
export async function updateItemDays(courseId, itemType, contentId, body) {
  const listing = await localDb.prepare("SELECT * FROM module_items WHERE item_type = ? AND content_id = ?").get(itemType, contentId);
  if (!listing) return false;
  const days = parseItemDays(itemType, body, listing);
  if (!days) return false;
  await localDb.prepare("UPDATE module_items SET release_day = ?, due_day = ?, close_day = ? WHERE id = ?")
    .run(days.release_day, days.due_day, days.close_day, listing.id);
  await refreshDueDates(courseId);
  return true;
}
