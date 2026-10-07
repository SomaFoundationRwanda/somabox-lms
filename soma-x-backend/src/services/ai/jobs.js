// Background AI jobs. Generation on a CPU box takes minutes ("fill this week" is four model
// calls), so requests create a queued job and return at once; this runner works through the
// queue (AI_JOB_CONCURRENCY at a time, default 1, on top of the gateway's own limits), records
// progress after each step, honours cancellation between steps, and writes drafts as it goes.
import { localDb } from "../../helpers/db-manager.js";
import { ItemError } from "../courses/items.js";
import { generateStructured, AiError } from "./gateway.js";
import { buildContext } from "./context.js";
import { createDraft, toPayload } from "./drafts.js";

const MAX_SOURCE = 4000;
const concurrency = () => Math.max(1, Number(process.env.AI_JOB_CONCURRENCY) || 1);
let running = 0;

export const JOB_KINDS = {
  fill_week: { total: 4, needsModule: true },
  story: { total: 1, needsModule: true },
  quiz: { total: 1, needsModule: true },
  outline: { total: 1 },
  outcome_rewrite: { total: 1 },
  rubric: { total: 1, needsAssignment: true },
  grading: { total: 1, needsAssignment: true },
};

class Cancelled extends Error {}

/** Validates and queues a job. Returns the job row. */
export async function enqueueJob({ courseId, kind, moduleId, assignmentId, scholarEmail, input = {}, user }) {
  const def = JOB_KINDS[kind];
  if (!def) throw new ItemError(400, `Unknown AI job: ${kind}`);
  if (def.needsModule) {
    const module = moduleId ? await localDb.prepare("SELECT id FROM modules WHERE id = ? AND course_id = ? AND kind <> 'unassigned'").get(moduleId, courseId) : null;
    if (!module) throw new ItemError(400, "Choose the week this is for");
  }
  if (def.needsAssignment) {
    const assignment = assignmentId ? await localDb.prepare("SELECT id FROM assignments WHERE id = ? AND course_id = ?").get(assignmentId, courseId) : null;
    if (!assignment) throw new ItemError(400, "Choose the assignment this is for");
  }
  const clean = {
    topic: String(input.topic || "").slice(0, 300),
    idea: String(input.idea || "").slice(0, 500),
    goal: String(input.goal || "").slice(0, 500),
    weeks: Math.min(20, Math.max(1, Number(input.weeks) || 4)),
    count: Math.min(15, Math.max(1, Number(input.count) || 5)),
    sourceText: String(input.sourceText || "").slice(0, MAX_SOURCE),
    outcomeId: input.outcomeId ? Number(input.outcomeId) : null,
    scholarEmail: scholarEmail ? String(scholarEmail).toLowerCase() : null,
  };
  if (kind === "story" && !clean.idea.trim()) throw new ItemError(400, "Describe the story idea");
  if (kind === "outline" && !clean.topic.trim()) throw new ItemError(400, "Say what the course is about");
  if (kind === "outcome_rewrite" && !clean.goal.trim()) throw new ItemError(400, "Write the goal you want rewritten");
  if (kind === "grading") {
    const submission = await localDb.prepare("SELECT id FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(assignmentId, clean.scholarEmail);
    if (!submission) throw new ItemError(400, "There's no submission to suggest a grade for");
    const rubric = await localDb.prepare("SELECT id FROM rubrics WHERE assignment_id = ?").get(assignmentId);
    if (!rubric) throw new ItemError(400, "Grading suggestions need a rubric on the assignment");
  }

  const job = await localDb.prepare(`
    INSERT INTO ai_jobs (course_id, module_id, kind, input, total, user_id, requested_by)
    VALUES (?, ?, ?, ?::jsonb, ?, ?, ?) RETURNING *
  `).get(courseId, moduleId || null, kind, JSON.stringify({ ...clean, assignmentId: assignmentId || null }), def.total, user.id, user.email);
  kick();
  return job;
}

/** Number of jobs ahead of this one, queued or already running (0 = this one is running). */
export async function queuePosition(job) {
  if (job.status !== "queued") return 0;
  const row = await localDb.prepare("SELECT COUNT(*) AS c FROM ai_jobs WHERE status IN ('queued', 'running') AND id < ?").get(job.id);
  return Number(row?.c || 0);
}

export async function requestCancel(jobId) {
  await localDb.prepare(`
    UPDATE ai_jobs SET cancel_requested = true,
      status = CASE WHEN status = 'queued' THEN 'cancelled' ELSE status END,
      finished_at = CASE WHEN status = 'queued' THEN CURRENT_TIMESTAMP ELSE finished_at END
    WHERE id = ? AND status IN ('queued', 'running')
  `).run(jobId);
}

/** After a restart, jobs that were mid-run can't resume: mark them failed, then carry on. */
export async function recoverJobs() {
  await localDb.prepare(`
    UPDATE ai_jobs SET status = 'failed', error = 'Interrupted by a restart. Start it again.', finished_at = CURRENT_TIMESTAMP
    WHERE status = 'running'
  `).run();
  kick();
}

export function kick() {
  setImmediate(() => { runNext().catch((e) => console.error("AI job runner error:", e)); });
}

async function runNext() {
  while (running < concurrency()) {
    const job = await localDb.prepare(`
      UPDATE ai_jobs SET status = 'running', started_at = CURRENT_TIMESTAMP
      WHERE id = (SELECT id FROM ai_jobs WHERE status = 'queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING *
    `).get();
    if (!job) return;
    running += 1;
    execute(job).finally(() => {
      running -= 1;
      kick();
    });
  }
}

/** Resolves when no job is queued or running (used by tests). */
export async function waitForIdle(timeoutMs = 10000) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const row = await localDb.prepare("SELECT COUNT(*) AS c FROM ai_jobs WHERE status IN ('queued', 'running')").get();
    if (Number(row.c) === 0 && running === 0) return;
    if (Date.now() > until) throw new Error("AI jobs still running");
    await new Promise((r) => setTimeout(r, 20));
  }
}

async function execute(job) {
  const step = async () => {
    const row = await localDb.prepare("SELECT cancel_requested FROM ai_jobs WHERE id = ?").get(job.id);
    if (row?.cancel_requested) throw new Cancelled();
  };
  const progress = async () => {
    await localDb.prepare("UPDATE ai_jobs SET progress = progress + 1 WHERE id = ?").run(job.id);
  };
  const run = (task, input) => generateStructured({ task, input, userId: job.user_id, courseId: job.course_id, feature: job.kind });
  const draft = (type, payload, extra = {}) => createDraft({ jobId: job.id, courseId: job.course_id, moduleId: job.module_id, type, payload, createdBy: job.requested_by, ...extra });

  try {
    const input = job.input || {};
    const ctx = await buildContext({ courseId: job.course_id, moduleId: job.module_id, userId: job.user_id });
    const base = { ...ctx, sourceText: input.sourceText || undefined };

    if (job.kind === "fill_week") {
      await step();
      await draft("page", toPayload.page(await run("page", base)));
      await progress();
      await step();
      await draft("quiz", toPayload.quiz(await run("quiz", { ...base, count: input.count }), ctx));
      await progress();
      await step();
      const assignment = toPayload.assignment(await run("assignment", base), ctx);
      await progress();
      await step();
      const rubric = await run("rubric", { ...base, assignmentTitle: assignment.title, instructions: assignment.instructions });
      assignment.rubric = toPayload.rubric(rubric, ctx);
      await draft("assignment", assignment);
      await progress();
    } else if (job.kind === "story") {
      await step();
      await draft("story", toPayload.story(await run("story", { ...base, idea: input.idea }), ctx));
      await progress();
    } else if (job.kind === "quiz") {
      await step();
      await draft("quiz", toPayload.quiz(await run("quiz", { ...base, topic: input.topic, count: input.count }), ctx));
      await progress();
    } else if (job.kind === "outline") {
      await step();
      await draft("outline", toPayload.outline(await run("outline", { ...base, topic: input.topic, weeks: input.weeks })));
      await progress();
    } else if (job.kind === "outcome_rewrite") {
      await step();
      const payload = toPayload.outcome(await run("outcome_rewrite", { ...base, goal: input.goal }));
      await draft("outcome", { ...payload, outcomeId: input.outcomeId || null });
      await progress();
    } else if (job.kind === "rubric") {
      await step();
      const assignment = await localDb.prepare("SELECT id, title, description FROM assignments WHERE id = ?").get(input.assignmentId);
      const tagged = await localDb.prepare("SELECT outcome_id FROM item_outcomes WHERE item_type = 'assignment' AND item_id = ?").all(assignment.id);
      const taggedIds = new Set(tagged.map((t) => Number(t.outcome_id)));
      const outcomes = taggedIds.size ? ctx.outcomes.filter((o) => taggedIds.has(Number(o.id))) : ctx.outcomes;
      const result = await run("rubric", { ...base, outcomes, assignmentTitle: assignment.title, instructions: stripHtml(assignment.description) });
      await draft("rubric", toPayload.rubric(result, ctx), { assignmentId: assignment.id });
      await progress();
    } else if (job.kind === "grading") {
      await step();
      const result = await suggestGrade(job, ctx, run);
      await draft("grading", result.payload, { assignmentId: result.assignmentId, scholarEmail: input.scholarEmail });
      await progress();
    }

    await localDb.prepare("UPDATE ai_jobs SET status = 'done', finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id);
  } catch (error) {
    if (error instanceof Cancelled) {
      await localDb.prepare("UPDATE ai_jobs SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(job.id);
      return;
    }
    const message = error instanceof AiError || error instanceof ItemError ? error.message : "Something went wrong while generating";
    if (!(error instanceof AiError)) console.error(`AI job ${job.id} failed:`, error);
    await localDb.prepare("UPDATE ai_jobs SET status = 'failed', error = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(message, job.id);
  }
}

const stripHtml = (html) => String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * Grading assist. The model only sees the rubric and the submission text with the learner's
 * name and email removed; it never sees who the learner is. Scores are clamped to each
 * criterion's maximum and limited to this rubric's criteria.
 */
async function suggestGrade(job, ctx, run) {
  const input = job.input;
  const assignment = await localDb.prepare("SELECT id, title, description FROM assignments WHERE id = ?").get(input.assignmentId);
  const rubric = await localDb.prepare("SELECT id FROM rubrics WHERE assignment_id = ?").get(assignment.id);
  const criteria = await localDb.prepare("SELECT id, title, description, points FROM rubric_criteria WHERE rubric_id = ? ORDER BY position").all(rubric.id);
  const submission = await localDb.prepare("SELECT body FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(assignment.id, input.scholarEmail);
  const user = await localDb.prepare("SELECT full_name FROM users WHERE LOWER(email) = LOWER(?)").get(input.scholarEmail);

  const result = await run("grading_suggestion", {
    language: ctx.language,
    gradeLevel: ctx.gradeLevel,
    assignmentTitle: assignment.title,
    instructions: stripHtml(assignment.description),
    criteria: criteria.map((c) => ({ id: c.id, title: c.title, description: c.description, points: Number(c.points) })),
    submissionText: anonymize(stripHtml(submission?.body), [user?.full_name, input.scholarEmail]),
  });
  const byId = new Map(criteria.map((c) => [Number(c.id), c]));
  const scores = result.scores
    .filter((s) => byId.has(Number(s.criterionId)))
    .map((s) => ({ criterionId: Number(s.criterionId), points: Math.min(Number(byId.get(Number(s.criterionId)).points), Math.max(0, Number(s.points))), reason: s.reason }));
  return { assignmentId: assignment.id, payload: { scores, feedback: result.feedback } };
}

/** Replaces the learner's full name, its parts, and their email with "[learner]". */
export function anonymize(text, identifiers) {
  let out = String(text || "");
  const parts = new Set();
  for (const id of identifiers.filter(Boolean)) {
    parts.add(String(id));
    if (!String(id).includes("@")) String(id).split(/\s+/).filter((p) => p.length >= 3).forEach((p) => parts.add(p));
    else parts.add(String(id).split("@")[0]);
  }
  for (const p of [...parts].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "[learner]");
  }
  return out;
}
