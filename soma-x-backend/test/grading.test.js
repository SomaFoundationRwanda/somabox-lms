// Phase 6: rubric grading, outcome results as the only mastery source, retakes, overrides,
// and the late/close rules.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { addDays, todayIn } from "@somabox/timeline";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
let db;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");
const asAdmin = call("admin");
const STUDENT = encodeURIComponent(USERS.student.email);
const today = todayIn("Africa/Kigali");

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
});

after(async () => {
  await ctx.stop();
});

async function course({ start = null } = {}) {
  const courseId = await ctx.createCourse("Grading");
  if (start) await asTeacher("PATCH", `/courses/${courseId}`, { startDate: start });
  const o1 = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Argue" })).body;
  const o2 = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Cite" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week.id}`, { published: true });
  return { courseId, o1, o2, week };
}
const addItem = (courseId, moduleId, body) => asTeacher("POST", `/courses/${courseId}/modules/${moduleId}/items`, body);
const mastery = async (who, courseId) => Object.fromEntries((await call(who)("GET", `/courses/${courseId}/outcome-mastery`)).body.outcomes.map((o) => [o.id, o]));

async function rubricAssignment({ courseId, o1, o2, week }) {
  const a = await addItem(courseId, week.id, { itemType: "assignment", title: "Essay", pointsPossible: 10, outcomeIds: [o1.id, o2.id] });
  const rubric = await asTeacher("PUT", `/courses/${courseId}/assignments/${a.body.content_id}/rubric`, {
    criteria: [{ title: "Claim", points: 4, outcomeId: o1.id }, { title: "Sources", points: 4, outcomeId: o2.id }],
  });
  const [claim, sources] = rubric.body.criteria;
  return { assignmentId: a.body.content_id, claim, sources };
}

test("changing one rubric score moves the gradebook and outcome mastery together", async () => {
  const c = await course();
  const { assignmentId, claim, sources } = await rubricAssignment(c);
  const url = `/courses/${c.courseId}/assignments/${assignmentId}/grade/${STUDENT}/rubric`;

  const first = await asTeacher("PUT", url, { scores: [{ criterionId: claim.id, points: 4 }, { criterionId: sources.id, points: 2 }], feedback: "Good claim" });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.grade, 7.5, "10 x mean(4/4, 2/4)");

  let book = (await asTeacher("GET", `/courses/${c.courseId}/grades`)).body;
  let cell = book.rows[0].cells[`assignment:${assignmentId}`];
  assert.deepEqual([cell.points, cell.pct, cell.status], [7.5, 75, "graded"]);
  let m = await mastery("student", c.courseId);
  assert.deepEqual([m[c.o1.id].currentMastery, m[c.o2.id].currentMastery], [100, 50]);

  // One criterion changes: grade, gradebook, and the Sources outcome all follow.
  await asTeacher("PUT", url, { scores: [{ criterionId: claim.id, points: 4 }, { criterionId: sources.id, points: 4 }] });
  book = (await asTeacher("GET", `/courses/${c.courseId}/grades`)).body;
  cell = book.rows[0].cells[`assignment:${assignmentId}`];
  assert.deepEqual([cell.points, cell.pct], [10, 100]);
  m = await mastery("student", c.courseId);
  assert.deepEqual([m[c.o1.id].currentMastery, m[c.o2.id].currentMastery], [100, 100]);
  const student = (await asStudent("GET", `/courses/${c.courseId}/grades`)).body;
  assert.equal(student.cells[`assignment:${assignmentId}`].pct, 100);
  assert.equal(student.cells[`assignment:${assignmentId}`].feedback, "Good claim", "feedback kept when not resent");

  const log = await db.prepare("SELECT change_kind FROM grade_audit_log WHERE assignment_id = ? ORDER BY id").all(assignmentId);
  assert.deepEqual(log.map((l) => l.change_kind), ["rubric", "rubric"]);
});

test("rubric scores are validated; a rubric assignment can't get a plain total from a teacher", async () => {
  const c = await course();
  const { assignmentId, claim } = await rubricAssignment(c);
  const url = `/courses/${c.courseId}/assignments/${assignmentId}/grade/${STUDENT}`;
  assert.equal((await asTeacher("PUT", `${url}/rubric`, { scores: [{ criterionId: claim.id, points: 3 }] })).status, 400, "every criterion");
  assert.equal((await asTeacher("PUT", `${url}/rubric`, { scores: [{ criterionId: claim.id, points: 9 }] })).status, 400, "over max");
  assert.equal((await asTeacher("PUT", `${url}/rubric`, { scores: [{ criterionId: 999999, points: 1 }] })).status, 400);
  const plain = await asTeacher("PATCH", url, { grade: 5 });
  assert.equal(plain.status, 409);
  assert.equal(plain.body.code, "RUBRIC_REQUIRED");
});

test("admins can override a grade only with a reason, and it's logged", async () => {
  const c = await course();
  const { assignmentId } = await rubricAssignment(c);
  const url = `/courses/${c.courseId}/assignments/${assignmentId}/grade/${STUDENT}`;
  assert.equal((await asAdmin("PATCH", url, { grade: 6 })).status, 400);
  const ok = await asAdmin("PATCH", url, { grade: 6, reason: "Appeal upheld by school board" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const log = await db.prepare("SELECT change_kind, actor_role, changed_by, reason, new_grade FROM grade_audit_log WHERE assignment_id = ?").get(assignmentId);
  assert.deepEqual([log.change_kind, log.actor_role, log.changed_by, Number(log.new_grade)], ["override", "admin", USERS.admin.email, 6]);
  const m = await mastery("student", c.courseId);
  assert.equal(m[c.o1.id].currentMastery, 60, "override feeds results from the grade");
  assert.equal((await call("otherTeacher")("PATCH", url, { grade: 6 })).status, 403);
});

test("graded quiz attempts write per-outcome results; the latest attempt counts; practice doesn't", async () => {
  const c = await course();
  const quiz = await addItem(c.courseId, c.week.id, {
    itemType: "quiz", title: "Check", outcomeIds: [c.o2.id],
    questions: [
      { prompt: "tagged", options: ["a", "b"], correctOption: "a", points: 2, outcomeId: c.o1.id },
      { prompt: "untagged", options: ["a", "b"], correctOption: "a", points: 2 },
    ],
  });
  const quizId = quiz.body.content_id;
  const qs = await db.prepare("SELECT id, prompt FROM quiz_questions WHERE quiz_id = ?").all(quizId);
  const q = Object.fromEntries(qs.map((x) => [x.prompt, x.id]));

  await asStudent("POST", `/courses/${c.courseId}/quizzes/${quizId}/submit`, { answers: { [q.tagged]: "a", [q.untagged]: "b" } });
  let m = await mastery("student", c.courseId);
  assert.deepEqual([m[c.o1.id].currentMastery, m[c.o2.id].currentMastery], [100, 0], "untagged questions score the quiz's other tag");

  await asStudent("POST", `/courses/${c.courseId}/quizzes/${quizId}/submit`, { answers: { [q.tagged]: "b", [q.untagged]: "a" } });
  m = await mastery("student", c.courseId);
  assert.deepEqual([m[c.o1.id].currentMastery, m[c.o2.id].currentMastery], [0, 100], "latest attempt replaces the earlier one");

  const practice = await addItem(c.courseId, c.week.id, {
    itemType: "quiz", title: "Warm-up", kind: "practice",
    questions: [{ prompt: "p", options: ["a", "b"], correctOption: "a", outcomeId: c.o1.id }],
  });
  const pq = await db.prepare("SELECT id FROM quiz_questions WHERE quiz_id = ?").get(practice.body.content_id);
  await asStudent("POST", `/courses/${c.courseId}/quizzes/${practice.body.content_id}/submit`, { answers: { [pq.id]: "a" } });
  m = await mastery("student", c.courseId);
  assert.equal(m[c.o1.id].currentMastery, 0, "practice results don't count");

  const book = (await asTeacher("GET", `/courses/${c.courseId}/grades`)).body;
  assert.ok(book.columns.some((col) => col.key === `quiz:${quizId}`), "graded quizzes are in the gradebook");
  assert.ok(!book.columns.some((col) => col.key === `quiz:${practice.body.content_id}`));
  assert.deepEqual([book.rows[0].cells[`quiz:${quizId}`].pct, book.rows[0].cells[`quiz:${quizId}`].attempts], [50, 2]);
});

test("class mastery averages learners, and growth is reported against the baseline", async () => {
  const c = await course();
  await db.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'student', 'active')").run(c.courseId, USERS.outsider.email);
  const a = await addItem(c.courseId, c.week.id, { itemType: "assignment", title: "Short", pointsPossible: 10, outcomeIds: [c.o1.id] });
  await asTeacher("PATCH", `/courses/${c.courseId}/assignments/${a.body.content_id}/grade/${STUDENT}`, { grade: 10 });
  await asTeacher("PATCH", `/courses/${c.courseId}/assignments/${a.body.content_id}/grade/${encodeURIComponent(USERS.outsider.email)}`, { grade: 5 });
  // A baseline result as the Phase 4 baseline quiz would write it.
  const student = await db.prepare("SELECT id FROM users WHERE email = ?").get(USERS.student.email);
  await db.prepare("INSERT INTO outcome_results (user_id, course_id, outcome_id, source_type, source_id, pct) VALUES (?, ?, ?, 'baseline', 1, 50)").run(student.id, c.courseId, c.o1.id);

  const cls = await mastery("teacher", c.courseId);
  assert.equal(cls[c.o1.id].currentMastery, 75);
  assert.equal(cls[c.o1.id].learnersWithData, 2);
  const mine = await mastery("student", c.courseId);
  assert.deepEqual([mine[c.o1.id].baselineScore, mine[c.o1.id].currentMastery, mine[c.o1.id].deltaPoints, mine[c.o1.id].normalizedGain], [50, 100, 50, 1]);
});

test("a teacher can grant a learner another attempt at a limited quiz", async () => {
  const c = await course();
  const quiz = await addItem(c.courseId, c.week.id, {
    itemType: "quiz", title: "Once", attemptsAllowed: 1, outcomeIds: [c.o1.id],
    questions: [{ prompt: "x", options: ["a", "b"], correctOption: "a" }],
  });
  const quizId = quiz.body.content_id;
  const submit = () => asStudent("POST", `/courses/${c.courseId}/quizzes/${quizId}/submit`, { answers: {} });
  assert.equal((await submit()).status, 201);
  assert.equal((await submit()).status, 409);
  const grant = await asTeacher("POST", `/courses/${c.courseId}/quizzes/${quizId}/grant-attempt`, { scholarEmail: USERS.student.email, reason: "Was ill" });
  assert.equal(grant.status, 200, JSON.stringify(grant.body));
  assert.equal(grant.body.attemptsRemaining, 1);
  assert.equal((await submit()).status, 201);
  assert.equal((await submit()).status, 409);
  assert.equal((await asStudent("POST", `/courses/${c.courseId}/quizzes/${quizId}/grant-attempt`, { scholarEmail: USERS.student.email })).status, 403);

  const open = await addItem(c.courseId, c.week.id, { itemType: "quiz", title: "Unlimited", kind: "practice" });
  assert.equal((await asTeacher("POST", `/courses/${c.courseId}/quizzes/${open.body.content_id}/grant-attempt`, { scholarEmail: USERS.student.email })).status, 400);
});

test("late work is accepted and flagged; nothing is accepted after close or before release", async () => {
  // Week 1 started 10 days ago.
  const c = await course({ start: addDays(today, -10) });
  const late = await addItem(c.courseId, c.week.id, { itemType: "assignment", title: "Late ok", outcomeIds: [c.o1.id], dueDay: 2, closeDay: 30 });
  const closed = await addItem(c.courseId, c.week.id, { itemType: "assignment", title: "Closed", outcomeIds: [c.o1.id], dueDay: 2, closeDay: 3 });
  const future = await addItem(c.courseId, c.week.id, { itemType: "assignment", title: "Later", outcomeIds: [c.o1.id], releaseDay: 20, dueDay: 25 });

  const lateRes = await asStudent("POST", `/courses/${c.courseId}/assignments/${late.body.content_id}/submit`, { body: "sorry" });
  assert.equal(lateRes.status, 201);
  assert.equal(lateRes.body.late, true);
  const closedRes = await asStudent("POST", `/courses/${c.courseId}/assignments/${closed.body.content_id}/submit`, { body: "too late" });
  assert.equal(closedRes.status, 409);
  assert.equal(closedRes.body.code, "CLOSED");
  const futureRes = await asStudent("POST", `/courses/${c.courseId}/assignments/${future.body.content_id}/submit`, { body: "early" });
  assert.equal(futureRes.body.code, "NOT_OPEN_YET");

  const book = (await asTeacher("GET", `/courses/${c.courseId}/grades`)).body;
  assert.equal(book.rows[0].cells[`assignment:${late.body.content_id}`].late, true);
});
