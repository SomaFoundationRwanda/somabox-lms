// Phase 9: course Insights, My progress, teacher scoping of analytics, school view, privacy.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { addDays, todayIn } from "@somabox/timeline";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
let db;
let jobs;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");
const asAdmin = call("admin");
const STUDENT = encodeURIComponent(USERS.student.email);
const today = todayIn("Africa/Kigali");

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
  jobs = await import("../src/services/ai/jobs.js");
});

after(async () => {
  await ctx.stop();
});

async function course({ start = null } = {}) {
  const courseId = await ctx.createCourse("Insights");
  if (start) await asTeacher("PATCH", `/courses/${courseId}`, { startDate: start });
  const o1 = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Add fractions" })).body;
  const o2 = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Compare fractions" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week.id}`, { published: true });
  return { courseId, o1, o2, week };
}
const addItem = (courseId, moduleId, body) => asTeacher("POST", `/courses/${courseId}/modules/${moduleId}/items`, body);
const userId = async (email) => Number((await db.prepare("SELECT id FROM users WHERE email = ?").get(email)).id);

/** A course that started 20 days ago: one wrong quiz, one late graded assignment, two missing. */
async function busyCourse() {
  const c = await course({ start: addDays(today, -20) });
  const quiz = await addItem(c.courseId, c.week.id, {
    itemType: "quiz", title: "Check", outcomeIds: [c.o1.id],
    questions: [{ prompt: "1/2 + 1/4?", options: ["3/4", "2/6"], correctOption: "3/4", points: 1, outcomeId: c.o1.id }],
  });
  const essay = await addItem(c.courseId, c.week.id, { itemType: "assignment", title: "Poster", pointsPossible: 10, outcomeIds: [c.o1.id], dueDay: 2, closeDay: 40 });
  await addItem(c.courseId, c.week.id, { itemType: "assignment", title: "Missing one", outcomeIds: [c.o2.id], dueDay: 2, closeDay: 40 });
  await addItem(c.courseId, c.week.id, { itemType: "assignment", title: "Missing two", outcomeIds: [c.o2.id], dueDay: 3, closeDay: 40 });
  const quizId = quiz.body.content_id;
  const [question] = await db.prepare("SELECT id FROM quiz_questions WHERE quiz_id = ?").all(quizId);
  const attempt = await asStudent("POST", `/courses/${c.courseId}/quizzes/${quizId}/submit`, { answers: { [question.id]: "2/6" } });
  assert.equal(attempt.status, 201, JSON.stringify(attempt.body));
  assert.equal((await asStudent("POST", `/courses/${c.courseId}/assignments/${essay.body.content_id}/submit`, { body: "my poster" })).status, 201);
  assert.equal((await asTeacher("PATCH", `/courses/${c.courseId}/assignments/${essay.body.content_id}/grade/${STUDENT}`, { grade: 2 })).status, 200);
  return { ...c, quizId, essayId: essay.body.content_id };
}

test("an empty course reports nulls, never invented figures; Insights is a teacher-only nav item", async () => {
  const c = await course();
  const res = await asTeacher("GET", `/courses/${c.courseId}/insights`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const k = res.body.class;
  assert.deepEqual([k.learners, k.learnersWithData, k.averageMastery, k.averageBaseline, k.onTimeRate, k.atRisk], [1, 0, null, null, null, 0]);
  assert.deepEqual(k.bands, { needsReteach: 0, onTrack: 0, mastered: 0, noData: 1 });
  assert.equal(res.body.learners[0].overall, null);
  assert.equal(res.body.learners[0].normalizedGain, null);
  assert.ok(res.body.outcomes.every((o) => o.currentMastery === null && o.baselineScore === null));
  assert.equal(res.body.aiSummary, null);

  const nav = await db.prepare("SELECT visible_to_students FROM course_nav_items WHERE course_id = ? AND nav_key = 'insights'").get(c.courseId);
  assert.equal(Number(nav.visible_to_students), 0);
});

test("per-learner metrics: growth and normalised gain, timeliness, risk reasons, item analysis", async () => {
  const c = await busyCourse();
  // A baseline of 40% on the first outcome.
  await db.prepare("INSERT INTO outcome_results (user_id, course_id, outcome_id, source_type, source_id, pct) VALUES (?, ?, ?, 'baseline', 1, 40)")
    .run(await userId(USERS.student.email), c.courseId, c.o1.id);

  const res = await asTeacher("GET", `/courses/${c.courseId}/insights`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const [me] = res.body.learners;
  assert.equal(me.work, undefined, "per-item work is only in the learner view");
  const o1 = me.outcomes.find((o) => o.outcomeId === c.o1.id);
  // Current = mean(latest quiz 0%, assignment 20%) = 10; baseline 40.
  assert.deepEqual([o1.current, o1.baseline, o1.deltaPoints, o1.normalizedGain, o1.resultsToMastery], [10, 40, -30, -0.5, null]);
  assert.deepEqual([me.overall, me.deltaPoints, me.normalizedGain], [10, -30, -0.5]);
  // Quiz (default due day 6) and the poster were both handed in late; two assignments are missing.
  assert.deepEqual([me.timeliness.onTime, me.timeliness.late, me.timeliness.missing, me.timeliness.onTimeRate], [0, 2, 2, 0]);
  assert.deepEqual(me.risk.reasons.map((r) => r.code).sort(), ["low_mastery", "missing_work", "often_late"]);
  assert.equal(me.trajectory.length, 2);
  assert.ok(me.engagement.lastActivityAt, "submitting counts as activity");

  assert.equal(res.body.class.atRisk, 1);
  assert.equal(res.body.class.missing, 2);
  const missingItem = res.body.items.find((i) => i.title === "Missing one");
  assert.deepEqual([missingItem.learners, missingItem.handedIn, missingItem.missing, missingItem.averagePct], [1, 0, 1, null]);
  const poster = res.body.items.find((i) => i.title === "Poster");
  assert.deepEqual([poster.late, poster.graded, poster.averagePct], [1, 1, 20]);
  const outcome = res.body.outcomes.find((o) => o.id === c.o1.id);
  assert.equal(outcome.bands.needsReteach, 1);

  const detail = await asTeacher("GET", `/courses/${c.courseId}/insights/learners/${me.id}`);
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.body.learner.work.map((w) => w.state).sort(), ["done_late", "done_late", "missing", "missing"]);

  const analysis = await asTeacher("GET", `/courses/${c.courseId}/insights/quizzes/${c.quizId}`);
  assert.equal(analysis.status, 200);
  assert.deepEqual([analysis.body.learnersAnswered, analysis.body.questions[0].pctCorrect], [1, 0]);
  assert.equal(analysis.body.questions[0].options.find((o) => o.text === "2/6").chosen, 1);
});

test("risk rules: inactivity and a falling trend", async () => {
  const { riskReasons } = await import("../src/services/insights/metrics.js");
  const none = { onTime: 3, late: 0, missing: 0 };
  const inactive = riskReasons({ overall: 80, resultsCount: 3, timeliness: none, engagement: { lastActivityAt: null }, points: [], courseRunningDays: 10, today });
  assert.deepEqual(inactive.map((r) => r.code), ["inactive"]);
  const notStarted = riskReasons({ overall: null, resultsCount: 0, timeliness: none, engagement: { lastActivityAt: null }, points: [], courseRunningDays: 3, today });
  assert.deepEqual(notStarted, [], "a course in its first week flags nobody as inactive");
  const points = [90, 85, 95, 60, 65, 70].map((pct) => ({ pct }));
  const falling = riskReasons({ overall: 75, resultsCount: 6, timeliness: none, engagement: { lastActivityAt: new Date() }, points, courseRunningDays: 30, today });
  assert.deepEqual(falling.map((r) => r.code), ["falling"]);
});

test("who can see what: course teachers and admins see Insights; learners only their own progress", async () => {
  const c = await busyCourse();
  assert.equal((await call("otherTeacher")("GET", `/courses/${c.courseId}/insights`)).status, 403);
  assert.equal((await asStudent("GET", `/courses/${c.courseId}/insights`)).status, 403);
  assert.equal((await asAdmin("GET", `/courses/${c.courseId}/insights`)).status, 200);
  const me = await userId(USERS.student.email);
  assert.equal((await asStudent("GET", `/courses/${c.courseId}/insights/learners/${me}`)).status, 403);
  assert.equal((await asStudent("GET", `/courses/${c.courseId}/insights/quizzes/${c.quizId}`)).status, 403);

  const mine = await asStudent("GET", `/courses/${c.courseId}/my-progress`);
  assert.equal(mine.status, 200, JSON.stringify(mine.body));
  assert.equal(mine.body.risk, undefined, "learners don't see risk flags");
  assert.equal(mine.body.learners, undefined, "or anyone else");
  assert.equal(mine.body.class, undefined);
  assert.ok(mine.body.outcomes.every((o) => o.code && o.title));
  assert.equal(mine.body.work.length, 4);
  assert.equal((await asTeacher("GET", `/courses/${c.courseId}/my-progress`)).status, 400);
  assert.equal((await call("outsider")("GET", `/courses/${c.courseId}/my-progress`)).status, 403);
});

test("teachers only see analytics for learners they teach", async () => {
  await busyCourse();
  // The outsider learns in another teacher's course and has a result there.
  const other = (await call("otherTeacher")("POST", "/courses", { title: "Elsewhere" })).body.id;
  await db.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'student', 'active')").run(other, USERS.outsider.email);
  const outcome = (await call("otherTeacher")("POST", `/courses/${other}/outcomes`, { title: "Read" })).body;
  await db.prepare("INSERT INTO outcome_results (user_id, course_id, outcome_id, source_type, source_id, pct) VALUES (?, ?, ?, 'assignment_submission', 999, 70)")
    .run(await userId(USERS.outsider.email), other, outcome.id);

  const outsider = encodeURIComponent(USERS.outsider.email);
  assert.equal((await asTeacher("GET", `/analytics/growth-curves?scholarEmail=${outsider}`)).status, 403);
  assert.equal((await asTeacher("GET", `/analytics/growth-curves?scholarEmail=${STUDENT}`)).status, 200);
  assert.equal((await asTeacher("GET", `/analytics/sol-outcomes?scholarEmail=${outsider}`)).status, 403);
  assert.equal((await asTeacher("GET", `/sol/diagnostic/status?scholarEmail=${outsider}`)).status, 403);
  assert.equal((await asTeacher("GET", `/sol/diagnostic/status?scholarEmail=${STUDENT}`)).status, 200);
  assert.equal((await asStudent("GET", `/analytics/growth-curves?scholarEmail=${outsider}`)).status, 403);

  const learnersSeen = (body) => Math.max(0, ...body.weeks.map((w) => w.learners));
  const teacherView = (await asTeacher("GET", "/analytics/growth-curves")).body;
  const adminView = (await asAdmin("GET", "/analytics/growth-curves")).body;
  assert.equal(learnersSeen(teacherView), 1, "the teacher's cohort is only their own learners");
  assert.equal(learnersSeen(adminView), 2);
  assert.equal((await call("otherTeacher")("GET", `/analytics/growth-curves?scholarEmail=${outsider}`)).status, 200);
});

test("the AI class summary sees outcome codes and numbers only, and Insights shows it", async () => {
  const c = await course();
  const early = await asTeacher("POST", `/courses/${c.courseId}/ai/jobs`, { kind: "class_summary" });
  assert.equal(early.status, 400, "nothing to summarise yet");

  const busy = await busyCourse();
  const started = await asTeacher("POST", `/courses/${busy.courseId}/ai/jobs`, { kind: "class_summary" });
  assert.equal(started.status, 202, JSON.stringify(started.body));
  await jobs.waitForIdle();
  const job = (await asTeacher("GET", `/courses/${busy.courseId}/ai/jobs/${started.body.id}`)).body;
  assert.equal(job.status, "done", job.error);
  assert.match(job.result.summary, /fractions/);
  assert.equal(job.drafts.length, 0, "a summary is teacher commentary, not a draft for learners");

  const sent = ctx.fakeGateway.state.requests.filter((r) => r.task === "class_summary").at(-1);
  const text = JSON.stringify(sent.input);
  assert.ok(!text.includes(USERS.student.email) && !text.toLowerCase().includes("student@"), "no learner identities");
  assert.ok(sent.input.stats.outcomes && Object.keys(sent.input.stats.outcomes).length === 2);

  const insights = (await asTeacher("GET", `/courses/${busy.courseId}/insights`)).body;
  assert.equal(insights.aiSummary.jobId, started.body.id);
  assert.ok(insights.aiSummary.suggestions.length >= 1);
});

test("usage events: editing published work is recorded; publishing alone isn't; unknown events are dropped", async () => {
  const c = await course();
  const a = await addItem(c.courseId, c.week.id, { itemType: "assignment", title: "Draft", outcomeIds: [c.o1.id] });
  const count = async () => Number((await db.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE event_type = 'item_edited_after_publish' AND course_id = ?").get(c.courseId)).n);
  assert.equal((await asTeacher("PATCH", `/courses/${c.courseId}/assignments/${a.body.content_id}`, { published: true })).status, 200);
  assert.equal(await count(), 0);
  assert.equal((await asTeacher("PATCH", `/courses/${c.courseId}/assignments/${a.body.content_id}`, { title: "Final" })).status, 200);
  assert.equal(await count(), 1);
  const ev = await db.prepare("SELECT data FROM usage_events WHERE event_type = 'item_edited_after_publish' AND course_id = ?").get(c.courseId);
  assert.deepEqual(ev.data, { itemType: "assignment", contentId: a.body.content_id, fields: ["title"] });

  const sent = await asTeacher("POST", "/analytics/events", { events: [
    { type: "grading_time", data: { ms: 42000 }, courseId: c.courseId },
    { type: "made_up", data: {} },
  ] });
  assert.equal(sent.body.stored, 1);
});

test("admins: school view, retention setting with purge, inclusivity suppresses small groups", async () => {
  await busyCourse();
  const school = await asAdmin("GET", "/analytics/school");
  assert.equal(school.status, 200, JSON.stringify(school.body));
  assert.ok(school.body.courses.length >= 1);
  assert.ok(school.body.courses.every((c) => "averageMastery" in c && "atRisk" in c && Array.isArray(c.teachers)));
  assert.equal((await asTeacher("GET", "/analytics/school")).status, 403);

  const gap = (await asAdmin("GET", "/analytics/inclusivity-gap")).body;
  assert.equal(gap.source, "outcome_results");
  assert.equal(gap.ruralVsUrban.urbanAverage, null, "fewer than 5 learners: not reported");
  assert.ok(gap.suppressed.includes("urban"));

  await db.prepare("INSERT INTO usage_events (event_type, created_at) VALUES ('course_opened', NOW() - INTERVAL '200 days')").run();
  assert.equal((await asAdmin("PUT", "/analytics/settings", { usageRetentionDays: 10 })).status, 400);
  const saved = await asAdmin("PUT", "/analytics/settings", { usageRetentionDays: 90 });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.ok(saved.body.purged.usageEvents >= 1);
  assert.equal((await asAdmin("GET", "/analytics/settings")).body.usageRetentionDays, 90);
  const old = await db.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE created_at < NOW() - INTERVAL '90 days'").get();
  assert.equal(Number(old.n), 0);
});

test("personal data export: your own, or anyone's for an admin", async () => {
  await busyCourse();
  const mine = await asStudent("GET", "/analytics/my-data");
  assert.equal(mine.status, 200);
  assert.equal(mine.body.profile.email, USERS.student.email);
  assert.equal(mine.body.profile.password_hash, undefined);
  assert.ok(mine.body.outcomeResults.length >= 2);
  assert.ok(mine.body.assignmentSubmissions.length >= 1);
  const id = await userId(USERS.student.email);
  assert.equal((await asTeacher("GET", `/analytics/users/${id}/data`)).status, 403);
  assert.equal((await asAdmin("GET", `/analytics/users/${id}/data`)).status, 200);
});
