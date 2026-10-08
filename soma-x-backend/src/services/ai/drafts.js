// AI drafts: shaping gateway output into reviewable drafts, validating teacher edits, and
// turning an approved draft into real course content. Everything created is UNPUBLISHED and
// placed in the right module with its outcome tags; nothing reaches learners until a teacher
// publishes it.
import { localDb } from "../../helpers/db-manager.js";
import { ItemError, createModuleContent } from "../courses/items.js";
import { saveRubric } from "../courses/rubrics.js";
import { freeOutcomeCode } from "../courses/shared.js";
import { outcomeIdFor } from "./context.js";

const escapeHtml = (text) => String(text ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const paragraphs = (text) => String(text || "").split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${escapeHtml(p)}</p>`).join("");

// ---- From gateway results to draft payloads (outcome codes resolved to this course's ids) ----

const question = (ctx) => (q) => ({
  prompt: q.prompt,
  options: q.options,
  correctIndex: Math.min(q.correctIndex, q.options.length - 1),
  points: q.points || 1,
  outcomeId: outcomeIdFor(ctx, q.outcomeCode),
});

export const toPayload = {
  page: (r) => ({ title: r.title, sections: r.sections }),
  quiz: (r, ctx) => ({ title: r.title, questions: r.questions.map(question(ctx)) }),
  assignment: (r, ctx) => ({ title: r.title, instructions: r.instructions, pointsPossible: r.pointsPossible, outcomeId: outcomeIdFor(ctx, r.outcomeCode), rubric: null }),
  rubric: (r, ctx) => ({ criteria: r.criteria.map((c) => ({ title: c.title, description: c.description, points: c.points, outcomeId: outcomeIdFor(ctx, c.outcomeCode) })) }),
  story: (r, ctx) => ({ title: r.title, paragraphs: r.paragraphs, questions: r.questions.map(question(ctx)), discussionPrompt: r.discussionPrompt }),
  outline: (r) => ({ outcomes: r.outcomes, modules: r.modules }),
  outcome: (r) => ({ title: r.title, description: r.description, masteryLevels: r.masteryLevels }),
  grading: (r) => ({ scores: r.scores, feedback: r.feedback }),
};

export async function createDraft({ jobId, courseId, moduleId, assignmentId, scholarEmail, type, payload, createdBy }) {
  const row = await localDb.prepare(`
    INSERT INTO ai_drafts (job_id, course_id, module_id, assignment_id, scholar_email, type, payload, original_payload, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?) RETURNING id
  `).get(jobId || null, courseId, moduleId || null, assignmentId || null, scholarEmail || null, type, JSON.stringify(payload), JSON.stringify(payload), createdBy);
  return row.id;
}

// ---- Checking a teacher's edits ---------------------------------------------------------

const need = (cond, message) => { if (!cond) throw new ItemError(400, message); };
const text = (v) => typeof v === "string" && v.trim().length > 0;

function checkQuestions(questions) {
  need(Array.isArray(questions) && questions.length > 0, "Add at least one question");
  questions.forEach((q, i) => {
    need(text(q?.prompt), `Question ${i + 1} needs text`);
    need(Array.isArray(q.options) && q.options.length >= 2 && q.options.every(text), `Question ${i + 1} needs at least two answer options`);
    need(Number.isInteger(q.correctIndex) && q.correctIndex >= 0 && q.correctIndex < q.options.length, `Question ${i + 1} needs a correct answer`);
  });
}

export function checkPayload(type, p) {
  need(p && typeof p === "object", "The draft is empty");
  if (type === "page") { need(text(p.title), "The page needs a title"); need(Array.isArray(p.sections) && p.sections.length > 0, "The page needs some content"); }
  if (type === "quiz") { need(text(p.title), "The quiz needs a title"); checkQuestions(p.questions); }
  if (type === "assignment") { need(text(p.title), "The assignment needs a title"); need(text(p.instructions), "The assignment needs instructions"); need(Number(p.pointsPossible) > 0, "Points must be more than 0"); }
  if (type === "rubric" || (type === "assignment" && p.rubric)) {
    const criteria = type === "rubric" ? p.criteria : p.rubric.criteria;
    need(Array.isArray(criteria) && criteria.length > 0 && criteria.every((c) => text(c?.title)), "Each rubric criterion needs a title");
  }
  if (type === "story") { need(text(p.title), "The story needs a title"); need(Array.isArray(p.paragraphs) && p.paragraphs.some(text), "The story needs some text"); checkQuestions(p.questions); need(text(p.discussionPrompt), "Add a discussion question"); }
  if (type === "outline") { need(Array.isArray(p.outcomes) && p.outcomes.every((o) => text(o?.title)), "Each outcome needs a title"); need(Array.isArray(p.modules) && p.modules.every((m) => text(m?.title)), "Each week needs a title"); }
  if (type === "outcome") { need(text(p.title), "The outcome needs a title"); }
  if (type === "grading") { need(Array.isArray(p.scores), "Scores are missing"); }
}

// ---- Approval --------------------------------------------------------------------------

async function draftModule(draft) {
  if (!draft.module_id) throw new ItemError(409, "This draft's week no longer exists. Reject it and generate again.");
  const module = await localDb.prepare("SELECT * FROM modules WHERE id = ? AND course_id = ?").get(draft.module_id, draft.course_id);
  if (!module) throw new ItemError(409, "This draft's week no longer exists. Reject it and generate again.");
  return module;
}

async function validOutcome(courseId, id) {
  if (!id) return null;
  const row = await localDb.prepare("SELECT id FROM outcomes WHERE id = ? AND course_id = ?").get(id, courseId);
  return row ? row.id : null;
}

async function quizQuestions(courseId, questions) {
  const out = [];
  for (const q of questions) {
    const options = q.options.map((t, i) => ({ id: `opt_${i + 1}`, text: t }));
    out.push({
      prompt: q.prompt,
      questionType: "multiple_choice",
      options,
      correctOption: options[q.correctIndex].id,
      points: Number(q.points) || 1,
      outcomeId: await validOutcome(courseId, q.outcomeId),
    });
  }
  return out;
}

/** Creates the draft's content. Returns refs to what was created. Runs inside a transaction. */
export async function applyDraft(draft, actorEmail) {
  const p = draft.payload;
  const courseId = draft.course_id;
  const base = { courseId, actorEmail, publish: false };

  if (draft.type === "page") {
    const module = await draftModule(draft);
    const body = p.sections.map((s) => `<h3>${escapeHtml(s.heading)}</h3>${paragraphs(s.body)}`).join("");
    const r = await createModuleContent({ ...base, moduleId: module.id, itemType: "page", data: { title: p.title, body } });
    return { pages: [r.contentId] };
  }
  if (draft.type === "quiz") {
    const module = await draftModule(draft);
    const r = await createModuleContent({ ...base, moduleId: module.id, itemType: "quiz", data: { title: p.title, kind: "graded", questions: await quizQuestions(courseId, p.questions) } });
    return { quizzes: [r.contentId] };
  }
  if (draft.type === "assignment") {
    const module = await draftModule(draft);
    const outcomeId = await validOutcome(courseId, p.outcomeId);
    const r = await createModuleContent({
      ...base, moduleId: module.id, itemType: "assignment",
      data: { title: p.title, description: paragraphs(p.instructions), pointsPossible: Number(p.pointsPossible) || 10, outcomeIds: outcomeId ? [outcomeId] : [] },
    });
    if (p.rubric?.criteria?.length) {
      const criteria = [];
      for (const c of p.rubric.criteria) criteria.push({ title: c.title, description: c.description, points: c.points, outcomeId: await validOutcome(courseId, c.outcomeId) });
      await saveRubric(courseId, { id: r.contentId, title: p.title }, { criteria });
    }
    return { assignments: [r.contentId] };
  }
  if (draft.type === "story") {
    const module = await draftModule(draft);
    const page = await createModuleContent({ ...base, moduleId: module.id, itemType: "page", data: { title: p.title, body: p.paragraphs.map((t) => `<p>${escapeHtml(t)}</p>`).join("") } });
    const quiz = await createModuleContent({ ...base, moduleId: module.id, itemType: "quiz", data: { title: `${p.title}: questions`, kind: "graded", questions: await quizQuestions(courseId, p.questions) } });
    const discussion = await createModuleContent({ ...base, moduleId: module.id, itemType: "discussion", data: { title: `${p.title}: discussion`, body: `<p>${escapeHtml(p.discussionPrompt)}</p>` } });
    return { pages: [page.contentId], quizzes: [quiz.contentId], discussions: [discussion.contentId] };
  }
  if (draft.type === "outline") {
    const outcomes = [];
    for (const o of p.outcomes) {
      const row = await localDb.prepare("INSERT INTO outcomes (course_id, title, description, code) VALUES (?, ?, ?, ?) RETURNING id").get(courseId, o.title, o.description || "", await freeOutcomeCode(courseId, o.code));
      outcomes.push(row.id);
    }
    const last = await localDb.prepare("SELECT COALESCE(MAX(week_offset), 0) AS w, COALESCE(MAX(position) FILTER (WHERE kind <> 'unassigned'), -1) AS p FROM modules WHERE course_id = ? AND kind = 'regular'").get(courseId);
    const modules = [];
    for (const [i, m] of p.modules.entries()) {
      const row = await localDb.prepare(`
        INSERT INTO modules (course_id, title, description, position, published, created_by_teacher_email, kind, week_offset, day_offset)
        VALUES (?, ?, ?, ?, 0, ?, 'regular', ?, 0) RETURNING id
      `).get(courseId, m.title, m.description || "", Number(last.p) + 1 + i, actorEmail, Number(last.w) + 1 + i);
      modules.push(row.id);
    }
    return { outcomes, modules };
  }
  if (draft.type === "outcome") {
    const levels = JSON.stringify((p.masteryLevels || []).map((l) => ({ level: l.level, points: l.points, description: l.description })));
    const targetId = await validOutcome(courseId, p.outcomeId);
    if (targetId) {
      await localDb.prepare("UPDATE outcomes SET title = ?, description = ?, mastery_levels = ? WHERE id = ?").run(p.title, p.description || "", levels, targetId);
      return { outcomes: [targetId] };
    }
    const row = await localDb.prepare("INSERT INTO outcomes (course_id, code, title, description, mastery_levels) VALUES (?, ?, ?, ?, ?) RETURNING id").get(courseId, await freeOutcomeCode(courseId), p.title, p.description || "", levels);
    return { outcomes: [row.id] };
  }
  if (draft.type === "rubric") {
    const assignment = await localDb.prepare("SELECT id, title FROM assignments WHERE id = ? AND course_id = ?").get(draft.assignment_id, courseId);
    if (!assignment) throw new ItemError(409, "This draft's assignment no longer exists");
    const criteria = [];
    for (const c of p.criteria) criteria.push({ title: c.title, description: c.description, points: c.points, outcomeId: await validOutcome(courseId, c.outcomeId) });
    await saveRubric(courseId, assignment, { criteria });
    return { rubrics: [assignment.id] };
  }
  throw new ItemError(400, "Grading suggestions are accepted from the grading screen, by saving the learner's grade");
}
