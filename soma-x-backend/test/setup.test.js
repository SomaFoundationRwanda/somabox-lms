// Phase 4: the opening gate, the setup checklist, and baselines computed from answers.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
let db;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
});

after(async () => {
  await ctx.stop();
});

const draft = (title = "Setup") => ctx.createCourse(title, { lifecycle: "draft" });
const status = (courseId) => asTeacher("GET", `/courses/${courseId}/setup-status`);
const ids = (list) => list.map((b) => b.id).sort();

async function readyCourse() {
  const courseId = await draft();
  const outcome = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Fractions" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { itemType: "page", title: "Reading" });
  await asTeacher("PATCH", `/courses/${courseId}`, { startDate: "2026-01-05", endDate: "2026-03-27" });
  return { courseId, outcome, week };
}

test("a new course lists every blocking step and can't open", async () => {
  const courseId = await draft();
  const res = await status(courseId);
  assert.equal(res.status, 200);
  assert.equal(res.body.canOpen, false);
  assert.deepEqual(ids(res.body.blocking), ["baseline", "content", "outcomes", "start_date"]);
  assert.ok(res.body.checklist.every((c) => typeof c.done === "boolean" && c.href));

  const open = await asTeacher("POST", `/courses/${courseId}/open-course`, {});
  assert.equal(open.status, 400);
  assert.deepEqual(ids(open.body.blocking), ["baseline", "content", "outcomes", "start_date"]);
  const row = await db.prepare("SELECT lifecycle FROM courses WHERE id = ?").get(courseId);
  assert.equal(row.lifecycle, "draft");
});

test("each blocker clears as it's fixed, then the course opens", async () => {
  const { courseId, outcome, week } = await readyCourse();
  assert.deepEqual(ids((await status(courseId)).body.blocking), ["baseline"]);

  // An untagged graded assignment blocks; a practice quiz doesn't.
  const essay = await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { itemType: "assignment", title: "Essay" });
  await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { itemType: "quiz", title: "Warm-up", kind: "practice" });
  assert.deepEqual(ids((await status(courseId)).body.blocking), ["baseline", "untagged"]);
  await asTeacher("POST", `/courses/${courseId}/item-outcomes`, { itemType: "assignment", itemId: essay.body.content_id, outcomeIds: [outcome.id] });

  // A graded quiz is tagged by tagging its questions.
  await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, {
    itemType: "quiz", title: "Check",
    questions: [{ prompt: "1/2 + 1/2?", options: ["1", "2"], correctOption: "1", outcomeId: outcome.id }],
  });
  assert.deepEqual(ids((await status(courseId)).body.blocking), ["baseline"]);

  // Items parked in Unassigned block opening.
  await asTeacher("DELETE", `/courses/${courseId}/modules/${week.id}/items/${essay.body.id}`);
  assert.ok(ids((await status(courseId)).body.blocking).includes("unassigned"));
  const unassigned = await db.prepare("SELECT id FROM modules WHERE course_id = ? AND kind = 'unassigned'").get(courseId);
  await asTeacher("PATCH", `/courses/${courseId}/modules/${unassigned.id}/items/${essay.body.id}`, { moduleId: week.id });

  assert.equal((await asTeacher("POST", `/courses/${courseId}/baseline/skip`, { reason: "short" })).status, 400);
  assert.equal((await asTeacher("POST", `/courses/${courseId}/baseline/skip`, { reason: "Mid-term transfer cohort" })).status, 200);
  const ready = (await status(courseId)).body;
  assert.equal(ready.canOpen, true, JSON.stringify(ready.blocking));
  assert.ok(ready.warnings.some((w) => w.id === "unpublished_weeks"));

  assert.equal((await asTeacher("POST", `/courses/${courseId}/open-course`, {})).status, 200);
  assert.equal((await asTeacher("POST", `/courses/${courseId}/baseline/reset`, {})).status, 400, "locked after opening");
  const skipped = await db.prepare("SELECT baseline_status, baseline_skip_reason, baseline_decided_by FROM courses WHERE id = ?").get(courseId);
  assert.deepEqual([skipped.baseline_status, skipped.baseline_skip_reason, skipped.baseline_decided_by], ["skipped", "Mid-term transfer cohort", USERS.teacher.email]);
});

test("warnings don't block but are reported", async () => {
  const courseId = await draft();
  const o1 = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Assessed" })).body;
  await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Never assessed" });
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 2 (empty)" });
  await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { itemType: "assignment", title: "Open-ended", outcomeIds: [o1.id], dueDay: null });
  await asTeacher("PATCH", `/courses/${courseId}`, { startDate: "2026-01-05" });
  await asTeacher("POST", `/courses/${courseId}/baseline/skip`, { reason: "No baseline this term" });

  const res = (await status(courseId)).body;
  assert.equal(res.canOpen, true, JSON.stringify(res.blocking));
  assert.deepEqual(ids(res.warnings), ["empty_weeks", "no_due_date", "no_end_date", "unassessed_outcomes", "unpublished_weeks"]);
});

test("learners only see whether the course is open", async () => {
  const { courseId } = await readyCourse();
  await db.prepare("UPDATE courses SET lifecycle = 'open' WHERE id = ?").run(courseId);
  const res = await asStudent("GET", `/courses/${courseId}/setup-status`);
  assert.deepEqual(Object.keys(res.body).sort(), ["isOpened", "lifecycle"]);
});

// ---------- Baseline ----------

async function baselineCourse() {
  const { courseId, outcome, week } = await readyCourse();
  const o2 = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Decimals" })).body;
  return { courseId, o1: outcome, o2, week };
}

test("a baseline can only be approved when every question is scorable and tagged", async () => {
  const { courseId, o1 } = await baselineCourse();
  const notReady = await asTeacher("POST", `/courses/${courseId}/baseline/approve`, {});
  assert.equal(notReady.status, 422);
  assert.ok(notReady.body.problems.some((p) => p.includes("baseline (Week 0) module")));

  const zero = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 0", kind: "baseline" })).body;
  await asTeacher("POST", `/courses/${courseId}/modules/${zero.id}/items`, {
    itemType: "quiz", title: "Baseline", kind: "baseline",
    questions: [
      { prompt: "Untagged", options: ["a", "b"], correctOption: "a" },
      { prompt: "Open", questionType: "open", outcomeId: o1.id },
    ],
  });
  const state = (await asTeacher("GET", `/courses/${courseId}/baseline`)).body;
  assert.equal(state.canApprove, false);
  assert.equal(state.untaggedQuestionCount, 1);
  assert.ok(state.problems.some((p) => p.includes("can't be scored")));
});

test("the baseline quiz can be built from outcome-tagged questions", async () => {
  const { courseId, o1, o2, week } = await baselineCourse();
  assert.equal((await asTeacher("POST", `/courses/${courseId}/baseline/generate`, {})).status, 400, "nothing to build from yet");

  await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, {
    itemType: "quiz", title: "Practice", kind: "practice",
    questions: [
      { prompt: "F1", options: ["a", "b"], correctOption: "a", outcomeId: o1.id },
      { prompt: "F2", options: ["a", "b"], correctOption: "b", outcomeId: o1.id },
      { prompt: "F3", options: ["a", "b"], correctOption: "a", outcomeId: o1.id },
      { prompt: "D1", options: ["a", "b"], correctOption: "b", outcomeId: o2.id },
      { prompt: "Untagged", options: ["a", "b"], correctOption: "a" },
    ],
  });
  const built = await asTeacher("POST", `/courses/${courseId}/baseline/generate`, { perOutcome: 2 });
  assert.equal(built.status, 200, JSON.stringify(built.body));
  assert.equal(built.body.questionCount, 3, "2 for Fractions + 1 for Decimals");
  assert.equal(built.body.canApprove, true);
  assert.deepEqual(built.body.outcomesCovered.sort(), [o1.id, o2.id].sort());

  const approved = await asTeacher("POST", `/courses/${courseId}/baseline/approve`, {});
  assert.equal(approved.status, 200);
  assert.equal(approved.body.status, "approved");
  const quiz = await db.prepare("SELECT kind, attempts_allowed, published FROM quizzes WHERE id = ?").get(approved.body.quizId);
  assert.deepEqual([quiz.kind, quiz.attempts_allowed, Number(quiz.published)], ["baseline", 1, 1]);
  assert.ok(!ids((await status(courseId)).body.blocking).includes("baseline"));

  // Changing the questions of an approved baseline (while still in draft) needs re-approval.
  const item = await db.prepare("SELECT id, module_id FROM module_items WHERE item_type = 'quiz' AND content_id = ?").get(approved.body.quizId);
  await asTeacher("PATCH", `/courses/${courseId}/modules/${item.module_id}/items/${item.id}/content`, {
    questions: [{ prompt: "New", options: ["a", "b"], correctOption: "a", outcomeId: o1.id }],
  });
  assert.equal((await asTeacher("GET", `/courses/${courseId}/baseline`)).body.status, "pending");
});

test("baseline results per outcome are computed from the learner's answers", async () => {
  const { courseId, o1, o2 } = await baselineCourse();
  const zero = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 0", kind: "baseline" })).body;
  const created = await asTeacher("POST", `/courses/${courseId}/modules/${zero.id}/items`, {
    itemType: "quiz", title: "Baseline", kind: "baseline",
    questions: [
      { prompt: "Q1", options: ["a", "b"], correctOption: "a", points: 2, outcomeId: o1.id },
      { prompt: "Q2", options: ["a", "b"], correctOption: "b", points: 3, outcomeId: o1.id },
      { prompt: "Q3", options: ["a", "b"], correctOption: "a", points: 4, outcomeId: o2.id },
    ],
  });
  const quizId = created.body.content_id;
  assert.equal((await asTeacher("POST", `/courses/${courseId}/baseline/approve`, {})).status, 200);
  await asTeacher("POST", `/courses/${courseId}/open-course`, {});

  const qs = await db.prepare("SELECT id, prompt FROM quiz_questions WHERE quiz_id = ? ORDER BY position").all(quizId);
  const q = Object.fromEntries(qs.map((x) => [x.prompt, x.id]));
  // Q1 right (2/2), Q2 wrong (0/3) -> Fractions 2/5 = 40%; Q3 right -> Decimals 100%.
  const submit = await asStudent("POST", `/courses/${courseId}/quizzes/${quizId}/submit`, { answers: { [q.Q1]: "a", [q.Q2]: "a", [q.Q3]: "a" } });
  assert.equal(submit.status, 201, JSON.stringify(submit.body));

  const baselines = await db.prepare("SELECT outcome_id, baseline_score FROM student_outcome_baselines WHERE course_id = ? ORDER BY outcome_id").all(courseId);
  assert.deepEqual(baselines.map((b) => [b.outcome_id, Number(b.baseline_score)]), [[o1.id, 40], [o2.id, 100]]);
  const results = await db.prepare("SELECT outcome_id, pct, source_type FROM outcome_results WHERE course_id = ? ORDER BY outcome_id").all(courseId);
  assert.deepEqual(results.map((r) => [r.outcome_id, Number(r.pct), r.source_type]), [[o1.id, 40, "baseline"], [o2.id, 100, "baseline"]]);

  const mastery = await asStudent("GET", `/courses/${courseId}/outcome-mastery`);
  const byId = Object.fromEntries(mastery.body.outcomes.map((o) => [o.id, o]));
  assert.equal(byId[o1.id].baselineScore, 40);
  assert.equal(byId[o2.id].baselineScore, 100);

  // The baseline is taken once.
  const again = await asStudent("POST", `/courses/${courseId}/quizzes/${quizId}/submit`, { answers: { [q.Q1]: "a", [q.Q2]: "b", [q.Q3]: "a" } });
  assert.equal(again.status, 409);
  const unchanged = await db.prepare("SELECT baseline_score FROM student_outcome_baselines WHERE course_id = ? AND outcome_id = ?").get(courseId, o1.id);
  assert.equal(Number(unchanged.baseline_score), 40);
});
