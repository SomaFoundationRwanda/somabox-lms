// Types of graded work, hidden scores, submitted dates, and the points-based total.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");
const STUDENT = encodeURIComponent(USERS.student.email);

before(async () => {
  ctx = await startTestServer();
});

after(async () => {
  await ctx.stop();
});

async function course() {
  const courseId = await ctx.createCourse("Types");
  const outcome = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Add fractions" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week.id}`, { published: true });
  const add = async (body) => {
    const res = await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { outcomeIds: [outcome.id], ...body });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.content_id;
  };
  return { courseId, add };
}

test("assignments and quizzes take a known type; unknown types are refused", async () => {
  const { courseId, add } = await course();
  const id = await add({ itemType: "assignment", title: "Midterm", pointsPossible: 30, category: "midterm_test" });
  const quizId = await add({ itemType: "quiz", title: "Quiz 1", category: "short_quiz", questions: [] });
  assert.equal((await asTeacher("GET", `/courses/${courseId}/assignments/${id}`)).body.category, "midterm_test");
  assert.equal((await asTeacher("GET", `/courses/${courseId}/quizzes/${quizId}`)).body.category, "short_quiz");

  const week = (await asTeacher("GET", `/courses/${courseId}/modules`)).body[0];
  const bad = await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { itemType: "assignment", title: "X", category: "homework" });
  assert.equal(bad.status, 400);
  assert.equal((await asTeacher("PATCH", `/courses/${courseId}/assignments/${id}`, { category: "homework" })).status, 400);
  assert.equal((await asTeacher("PATCH", `/courses/${courseId}/assignments/${id}`, { category: "exam" })).status, 200);
  assert.equal((await asTeacher("GET", `/courses/${courseId}/assignments/${id}`)).body.category, "exam");
});

test("the total is points earned over points marked, overall and per type", async () => {
  const { courseId, add } = await course();
  const quiz = await add({ itemType: "assignment", title: "Quiz", pointsPossible: 10, category: "short_quiz" });
  const exam = await add({ itemType: "assignment", title: "Exam", pointsPossible: 30, category: "exam" });
  const untyped = await add({ itemType: "assignment", title: "Old work", pointsPossible: 10 });

  let book = (await asStudent("GET", `/courses/${courseId}/grades`)).body;
  assert.equal(book.totalPct, null, "nothing marked yet");
  assert.equal(book.gradedCount, 0);

  await asStudent("POST", `/courses/${courseId}/assignments/${quiz}/submit`, { body: "my answers" });
  await asTeacher("PATCH", `/courses/${courseId}/assignments/${quiz}/grade/${STUDENT}`, { grade: 9 });
  book = (await asStudent("GET", `/courses/${courseId}/grades`)).body;
  assert.equal(book.totalPct, 90, "9/10");
  assert.ok(book.cells[`assignment:${quiz}`].submittedAt, "handed-in work has a submitted date");

  // Graded without being handed in: counts, but has no submitted date.
  await asTeacher("PATCH", `/courses/${courseId}/assignments/${exam}/grade/${STUDENT}`, { grade: 15 });
  book = (await asStudent("GET", `/courses/${courseId}/grades`)).body;
  assert.equal(book.totalPct, 60, "(9 + 15) / (10 + 30)");
  assert.equal(book.cells[`assignment:${exam}`].submittedAt, null);
  const byKey = Object.fromEntries(book.categories.map((c) => [c.key, c]));
  assert.equal(byKey.short_quiz.pct, 90);
  assert.equal(byKey.exam.pct, 50);
  assert.equal(byKey.midterm_test.pct, null);
  assert.equal(byKey.other.items, 1, "work without a type is grouped as other");
  assert.equal(book.columns.find((c) => c.id === untyped).category, null);

  const teacher = (await asTeacher("GET", `/courses/${courseId}/grades`)).body;
  assert.equal(teacher.rows[0].averagePct, 60);
});

test("hidden scores: learners see that work was handed in, not the mark, until the teacher publishes", async () => {
  const { courseId, add } = await course();
  const id = await add({ itemType: "assignment", title: "Test", pointsPossible: 20, category: "general_test", scoresHidden: true });
  await asStudent("POST", `/courses/${courseId}/assignments/${id}/submit`, { body: "done" });
  await asTeacher("PATCH", `/courses/${courseId}/assignments/${id}/grade/${STUDENT}`, { grade: 12, feedback: "Check question 3" });

  let book = (await asStudent("GET", `/courses/${courseId}/grades`)).body;
  let cell = book.cells[`assignment:${id}`];
  assert.deepEqual([cell.status, cell.points, cell.pct, cell.feedback, cell.scoresHidden], ["submitted", null, null, "", true]);
  assert.equal(book.totalPct, null, "hidden marks don't count in the learner's total yet");
  const page = (await asStudent("GET", `/courses/${courseId}/assignments/${id}`)).body;
  assert.equal(page.mySubmission.grade, null);
  assert.equal(page.mySubmission.feedback, "");

  // The teacher still sees the mark.
  const teacher = (await asTeacher("GET", `/courses/${courseId}/grades`)).body;
  assert.equal(teacher.rows[0].cells[`assignment:${id}`].points, 12);
  assert.equal(teacher.columns[0].scoresHidden, true);

  assert.equal((await asStudent("POST", `/courses/${courseId}/grades/visibility`, { key: `assignment:${id}`, hidden: false })).status, 403);
  assert.equal((await asTeacher("POST", `/courses/${courseId}/grades/visibility`, { key: "page:1", hidden: false })).status, 400);
  const published = await asTeacher("POST", `/courses/${courseId}/grades/visibility`, { key: `assignment:${id}`, hidden: false });
  assert.equal(published.status, 200, JSON.stringify(published.body));

  book = (await asStudent("GET", `/courses/${courseId}/grades`)).body;
  cell = book.cells[`assignment:${id}`];
  assert.deepEqual([cell.status, cell.points, cell.pct, cell.feedback], ["graded", 12, 60, "Check question 3"]);
  assert.equal(book.totalPct, 60);
});

test("a quiz with hidden scores doesn't show the learner their score after submitting", async () => {
  const { courseId, add } = await course();
  const id = await add({
    itemType: "quiz", title: "Long quiz", category: "long_quiz", scoresHidden: true,
    questions: [{ prompt: "2+2?", questionType: "multiple_choice", options: [{ id: "a", text: "4" }, { id: "b", text: "5" }], correctOption: "a", points: 2 }],
  });
  const quiz = (await asStudent("GET", `/courses/${courseId}/quizzes/${id}`)).body;
  const submitted = await asStudent("POST", `/courses/${courseId}/quizzes/${id}/submit`, { answers: { [quiz.questions[0].id]: "a" } });
  assert.equal(submitted.status, 201);
  assert.deepEqual([submitted.body.score, submitted.body.scorePct, submitted.body.scoresHidden], [null, null, true]);
  assert.equal((await asStudent("GET", `/courses/${courseId}/quizzes/${id}`)).body.mySubmission.score, null);
  assert.equal((await asStudent("GET", `/courses/${courseId}/quizzes`)).body.find((q) => q.id === id).myScore, null);
  const cell = (await asStudent("GET", `/courses/${courseId}/grades`)).body.cells[`quiz:${id}`];
  assert.equal(cell.points, null);
  assert.ok(cell.submittedAt);

  await asTeacher("PATCH", `/courses/${courseId}/quizzes/${id}`, { scoresHidden: false });
  assert.equal(Number((await asStudent("GET", `/courses/${courseId}/quizzes/${id}`)).body.mySubmission.score), 2);
});
