// Phase 8: AI as background jobs that produce drafts; nothing reaches learners without a teacher.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
let db;
let jobs;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");
const asAdmin = call("admin");

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
  jobs = await import("../src/services/ai/jobs.js");
});

after(async () => {
  await ctx.stop();
});

async function course() {
  const courseId = await ctx.createCourse("AI course");
  const o1 = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Add fractions" })).body;
  const o2 = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Compare fractions" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  return { courseId, o1, o2, week };
}

async function runJob(courseId, body) {
  const started = await asTeacher("POST", `/courses/${courseId}/ai/jobs`, body);
  assert.equal(started.status, 202, JSON.stringify(started.body));
  await jobs.waitForIdle();
  return (await asTeacher("GET", `/courses/${courseId}/ai/jobs/${started.body.id}`)).body;
}

test("'fill this week' runs as a job and only produces drafts", async () => {
  const c = await course();
  ctx.fakeGateway.state.requests.length = 0;
  const job = await runJob(c.courseId, { kind: "fill_week", moduleId: c.week.id });
  assert.equal(job.status, "done", job.error);
  assert.deepEqual([job.progress, job.total], [4, 4]);
  assert.deepEqual(job.drafts.map((d) => d.type), ["page", "quiz", "assignment"]);

  // Context was assembled on the server: outcomes with codes, the week, and the language.
  const sent = ctx.fakeGateway.state.requests.map((r) => r.task);
  assert.deepEqual(sent, ["page", "quiz", "assignment", "rubric"]);
  const input = ctx.fakeGateway.state.requests[1].input;
  assert.equal(input.moduleTitle, "Week 1: Week 1");
  assert.deepEqual(input.outcomes.map((o) => o.title), ["Add fractions", "Compare fractions"]);
  assert.equal(input.language, "en");

  // Nothing was added to the course yet.
  const items = await db.prepare("SELECT COUNT(*) AS c FROM module_items WHERE module_id = ?").get(c.week.id);
  assert.equal(Number(items.c), 0);
  const calls = await db.prepare("SELECT COUNT(*) AS c, SUM(prompt_tokens) AS t FROM ai_calls WHERE course_id = ? AND ok").get(c.courseId);
  assert.deepEqual([Number(calls.c), Number(calls.t)], [4, 480]);
});

test("approving drafts creates unpublished items in the week, with outcome tags and a rubric", async () => {
  const c = await course();
  const job = await runJob(c.courseId, { kind: "fill_week", moduleId: c.week.id });
  const quizDraft = job.drafts.find((d) => d.type === "quiz");
  const assignmentDraft = job.drafts.find((d) => d.type === "assignment");

  const draft = (await asTeacher("GET", `/courses/${c.courseId}/ai/drafts/${quizDraft.id}`)).body;
  assert.deepEqual(draft.payload.questions.map((q) => q.outcomeId), [c.o1.id, c.o2.id], "outcome codes mapped to this course");

  const ok = await asTeacher("POST", `/courses/${c.courseId}/ai/drafts/${quizDraft.id}/approve`, {});
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const quizId = ok.body.resultRefs.quizzes[0];
  const quiz = await db.prepare("SELECT published, module_id, kind FROM quizzes WHERE id = ?").get(quizId);
  assert.deepEqual([Number(quiz.published), quiz.module_id, quiz.kind], [0, c.week.id, "graded"]);
  const tags = await db.prepare("SELECT outcome_id FROM item_outcomes WHERE item_type = 'quiz' AND item_id = ? ORDER BY outcome_id").all(quizId);
  assert.deepEqual(tags.map((t) => t.outcome_id), [c.o1.id, c.o2.id]);
  const correct = await db.prepare("SELECT correct_option, options FROM quiz_questions WHERE quiz_id = ? ORDER BY position LIMIT 1").get(quizId);
  assert.equal(JSON.parse(correct.options).find((o) => o.id === correct.correct_option).text, "Right");

  const a = await asTeacher("POST", `/courses/${c.courseId}/ai/drafts/${assignmentDraft.id}/approve`, {});
  const assignmentId = a.body.resultRefs.assignments[0];
  const rubric = await asTeacher("GET", `/courses/${c.courseId}/assignments/${assignmentId}/rubric`);
  assert.deepEqual(rubric.body.criteria.map((cr) => cr.outcome_id), [c.o1.id, c.o2.id]);

  // Learners see none of it until the teacher publishes.
  await asTeacher("PATCH", `/courses/${c.courseId}/modules/${c.week.id}`, { published: true });
  const learnerView = await asStudent("GET", `/courses/${c.courseId}/modules`);
  assert.equal(learnerView.body.find((m) => m.id === c.week.id).items.length, 0);

  assert.equal((await asTeacher("POST", `/courses/${c.courseId}/ai/drafts/${quizDraft.id}/approve`, {})).status, 409, "approve once");
});

test("teachers can edit a draft before approving, or reject it", async () => {
  const c = await course();
  const job = await runJob(c.courseId, { kind: "story", moduleId: c.week.id, input: { idea: "A girl sells mangoes <b>at</b> market" } });
  const [story] = job.drafts;
  const draft = (await asTeacher("GET", `/courses/${c.courseId}/ai/drafts/${story.id}`)).body;

  assert.equal((await asTeacher("PATCH", `/courses/${c.courseId}/ai/drafts/${story.id}`, { payload: { ...draft.payload, questions: [] } })).status, 400);
  const edited = await asTeacher("PATCH", `/courses/${c.courseId}/ai/drafts/${story.id}`, { payload: { ...draft.payload, title: "Amina <script>" } });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.edited, true);
  const approved = await asTeacher("POST", `/courses/${c.courseId}/ai/drafts/${story.id}/approve`, {});
  const page = await db.prepare("SELECT title, body FROM course_pages WHERE id = ?").get(approved.body.resultRefs.pages[0]);
  assert.equal(page.title, "Amina <script>", "titles are text");
  assert.ok(!/<script>/.test(page.body));
  assert.equal(approved.body.resultRefs.discussions.length, 1);

  const outline = await runJob(c.courseId, { kind: "outline", input: { topic: "Fractions", weeks: 2 } });
  const reject = await asTeacher("POST", `/courses/${c.courseId}/ai/drafts/${outline.drafts[0].id}/reject`, {});
  assert.equal(reject.status, 200);
  const outcomes = await db.prepare("SELECT COUNT(*) AS c FROM outcomes WHERE course_id = ?").get(c.courseId);
  assert.equal(Number(outcomes.c), 2, "a rejected outline adds nothing");
});

test("an approved outline adds outcomes and numbered weeks", async () => {
  const c = await course();
  const job = await runJob(c.courseId, { kind: "outline", input: { topic: "Fractions", weeks: 2 } });
  const res = await asTeacher("POST", `/courses/${c.courseId}/ai/drafts/${job.drafts[0].id}/approve`, {});
  assert.equal(res.body.resultRefs.outcomes.length, 2);
  const weeks = await db.prepare("SELECT week_offset FROM modules WHERE id IN (" + res.body.resultRefs.modules.join(",") + ") ORDER BY week_offset").all();
  assert.deepEqual(weeks.map((w) => w.week_offset), [2, 3], "after the existing Week 1");
});

test("grading help hides who the learner is, and the teacher's save decides", async () => {
  const c = await course();
  const a = await asTeacher("POST", `/courses/${c.courseId}/modules/${c.week.id}/items`, { itemType: "assignment", title: "Essay", outcomeIds: [c.o1.id], pointsPossible: 8 });
  const assignmentId = a.body.content_id;
  const rubric = (await asTeacher("PUT", `/courses/${c.courseId}/assignments/${assignmentId}/rubric`, { criteria: [{ title: "Method", points: 4, outcomeId: c.o1.id }, { title: "Answer", points: 4 }] })).body;
  await db.prepare("UPDATE users SET full_name = 'Grace Uwase' WHERE email = ?").run(USERS.student.email);
  await asStudent("POST", `/courses/${c.courseId}/assignments/${assignmentId}/submit`, { body: "My name is Grace Uwase (student@test.local). Grace thinks 1/2+1/4=3/4." });

  ctx.fakeGateway.state.requests.length = 0;
  const job = await runJob(c.courseId, { kind: "grading", assignmentId, scholarEmail: USERS.student.email });
  assert.equal(job.status, "done", job.error);
  const sent = ctx.fakeGateway.state.requests[0].input.submissionText;
  assert.ok(!/grace|uwase|student@test/i.test(sent), `learner identity leaked: ${sent}`);

  const suggestion = (await asTeacher("GET", `/courses/${c.courseId}/ai/grading-suggestion?assignmentId=${assignmentId}&scholarEmail=${encodeURIComponent(USERS.student.email)}`)).body;
  assert.deepEqual(suggestion.payload.scores.map((s) => s.points), [3, 3], "unknown criteria dropped, points within each maximum");

  // The teacher keeps one suggested score and changes the other.
  const [method, answer] = rubric.criteria;
  const saved = await asTeacher("PUT", `/courses/${c.courseId}/assignments/${assignmentId}/grade/${encodeURIComponent(USERS.student.email)}/rubric`, {
    scores: [{ criterionId: method.id, points: 3 }, { criterionId: answer.id, points: 4 }],
    feedback: suggestion.payload.feedback,
    aiDraftId: suggestion.id,
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const sources = await db.prepare("SELECT criterion_id, source FROM submission_scores ORDER BY criterion_id").all();
  assert.deepEqual(sources.filter((s) => [method.id, answer.id].includes(s.criterion_id)).map((s) => s.source), ["ai_suggested_accepted", "teacher"]);
  const decided = await db.prepare("SELECT status, edited FROM ai_drafts WHERE id = ?").get(suggestion.id);
  assert.deepEqual([decided.status, decided.edited], ["approved", true]);
});

test("cancelling a queued job stops it; failures explain themselves", async () => {
  const c = await course();
  ctx.fakeGateway.state.delayMs = 150;
  const first = await asTeacher("POST", `/courses/${c.courseId}/ai/jobs`, { kind: "fill_week", moduleId: c.week.id });
  const second = await asTeacher("POST", `/courses/${c.courseId}/ai/jobs`, { kind: "quiz", moduleId: c.week.id });
  assert.equal(second.body.position, 1, "waits behind the first job");
  await asTeacher("POST", `/courses/${c.courseId}/ai/jobs/${second.body.id}/cancel`, {});
  await asTeacher("POST", `/courses/${c.courseId}/ai/jobs/${first.body.id}/cancel`, {});
  await jobs.waitForIdle();
  ctx.fakeGateway.state.delayMs = 0;
  const [a, b] = await Promise.all([first, second].map((j) => asTeacher("GET", `/courses/${c.courseId}/ai/jobs/${j.body.id}`)));
  assert.equal(b.body.status, "cancelled");
  assert.equal(a.body.status, "cancelled");
  assert.ok(a.body.progress < 4, "stopped between steps");

  ctx.fakeGateway.state.fail = "runtime_unavailable";
  const failed = await runJob(c.courseId, { kind: "quiz", moduleId: c.week.id });
  ctx.fakeGateway.state.fail = null;
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /isn't running/);
});

test("a restart marks running jobs failed", async () => {
  const c = await course();
  await db.prepare("INSERT INTO ai_jobs (course_id, kind, status, requested_by) VALUES (?, 'quiz', 'running', 'x')").run(c.courseId);
  await jobs.recoverJobs();
  const row = await db.prepare("SELECT status, error FROM ai_jobs WHERE course_id = ? AND requested_by = 'x'").get(c.courseId);
  assert.equal(row.status, "failed");
  assert.match(row.error, /restart/);
});

test("admins can switch AI off for the school or one teacher, and see usage", async () => {
  const c = await course();
  assert.equal((await asStudent("POST", `/courses/${c.courseId}/ai/jobs`, { kind: "quiz", moduleId: c.week.id })).status, 403);

  assert.equal((await asAdmin("PUT", "/ai/admin/settings", { enabled: false })).status, 200);
  const off = await asTeacher("POST", `/courses/${c.courseId}/ai/jobs`, { kind: "quiz", moduleId: c.week.id });
  assert.equal(off.status, 403);
  assert.equal(off.body.code, "AI_DISABLED");
  assert.equal((await asTeacher("GET", "/ai/status")).body.allowed, false);
  await asAdmin("PUT", "/ai/admin/settings", { enabled: true });

  const teacher = await db.prepare("SELECT id FROM users WHERE email = ?").get(USERS.teacher.email);
  await asAdmin("PATCH", `/ai/admin/users/${teacher.id}`, { aiEnabled: false });
  assert.equal((await asTeacher("POST", `/courses/${c.courseId}/ai/jobs`, { kind: "quiz", moduleId: c.week.id })).status, 403);
  await asAdmin("PATCH", `/ai/admin/users/${teacher.id}`, { aiEnabled: true });

  const usage = await asAdmin("GET", "/ai/admin/usage");
  assert.equal(usage.status, 200);
  assert.ok(usage.body.calls.some((r) => r.email === USERS.teacher.email && r.calls > 0));
  assert.equal((await asTeacher("GET", "/ai/admin/usage")).status, 403);
});

test("the old template stubs are gone", async () => {
  const c = await course();
  for (const path of ["propose-outline", "rewrite-outcomes", "fill-module", "generate-story"]) {
    assert.equal((await asTeacher("POST", `/courses/${c.courseId}/ai/${path}`, {})).status, 404, path);
  }
});
