// Phase 2: data integrity rules (lifecycle, module ownership, quizzes, rubrics).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers.js";

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

// ---------- Lifecycle (guide §5.1) ----------

test("students can't see a draft course, in lists or directly", async () => {
  const courseId = await ctx.createCourse("Still drafting", { lifecycle: "draft" });
  const direct = await asStudent("GET", `/courses/${courseId}`);
  assert.equal(direct.status, 403);
  assert.equal(direct.body.code, "COURSE_NOT_OPEN");
  const mine = await asStudent("GET", "/courses/mine");
  assert.ok(!mine.body.some((c) => c.id === courseId));
  const teacherView = await asTeacher("GET", `/courses/${courseId}`);
  assert.equal(teacherView.status, 200);
});

test("lifecycle moves follow the allowed transitions", async () => {
  const courseId = await ctx.createCourse("Lifecycle");
  const patch = (lifecycle) => asTeacher("PATCH", `/courses/${courseId}`, { lifecycle });
  assert.equal((await patch("draft")).status, 400);
  assert.equal((await patch("closed")).status, 200);
  assert.equal((await patch("open")).status, 200);
  assert.equal((await patch("archived")).status, 200);
  assert.equal((await patch("open")).status, 400);
  assert.equal((await patch("closed")).status, 200);
  const row = await db.prepare("SELECT lifecycle FROM courses WHERE id = ?").get(courseId);
  assert.equal(row.lifecycle, "closed");
});

test("only open public courses can be discovered and joined", async () => {
  const draft = await ctx.createCourse("Public draft", { lifecycle: "draft" });
  await db.prepare("UPDATE courses SET visibility = 'public' WHERE id = ?").run(draft);
  const list = await call("outsider")("GET", "/courses/public");
  assert.ok(!list.body.courses.some((c) => c.id === draft));
  assert.equal((await call("outsider")("POST", `/courses/${draft}/join`, {})).status, 400);
});

test("outcomes can be created through the API", async () => {
  const courseId = await ctx.createCourse("Outcomes");
  const res = await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Read fluently" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.mastery_scale, "4pt");
});

// ---------- Module ownership (guide §5.2-5.3) ----------

async function setupCourse(title = "Integrity") {
  const courseId = await ctx.createCourse(title);
  const week1 = await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" });
  const week2 = await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 2" });
  const outcome = await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Explain ideas" });
  return { courseId, week1: week1.body, week2: week2.body, outcomeId: outcome.body.id };
}

const addItem = (courseId, moduleId, body) => asTeacher("POST", `/courses/${courseId}/modules/${moduleId}/items`, body);

test("modules are numbered by week; there is at most one baseline", async () => {
  const { courseId, week1, week2 } = await setupCourse("Weeks");
  assert.equal(week1.week_offset, 1);
  assert.equal(week2.week_offset, 2);
  const baseline = await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Baseline", kind: "baseline" });
  assert.equal(baseline.status, 201);
  assert.equal(baseline.body.week_offset, 0);
  assert.equal((await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Another", kind: "baseline" })).status, 409);
  assert.equal((await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Zero", weekOffset: 0 })).status, 400);
  assert.equal((await asTeacher("PATCH", `/courses/${courseId}/modules/${week2.id}`, { weekOffset: 5 })).status, 200);
});

test("content can only be created inside a module", async () => {
  const { courseId } = await setupCourse("No orphans");
  for (const path of ["assignments", "quizzes", "pages"]) {
    const res = await asTeacher("POST", `/courses/${courseId}/${path}`, { title: "Loose" });
    assert.equal(res.status, 404, `POST /${path} should no longer exist`);
  }
  assert.equal((await asTeacher("POST", `/courses/${courseId}/discussions`, { title: "Loose" })).status, 400);
  assert.equal((await addItem(courseId, 999999, { itemType: "page", title: "Nowhere" })).status, 404);
});

test("graded items without an outcome are saved as drafts and can't be published", async () => {
  const { courseId, week1, outcomeId } = await setupCourse("Outcome rule");
  const untagged = await addItem(courseId, week1.id, { itemType: "assignment", title: "Essay" });
  assert.equal(untagged.status, 201);
  assert.equal(untagged.body.published, false);
  assert.ok(untagged.body.notice);

  const publishItem = await asTeacher("PATCH", `/courses/${courseId}/modules/${week1.id}/items/${untagged.body.id}`, { published: true });
  assert.equal(publishItem.status, 422);
  assert.equal(publishItem.body.code, "OUTCOME_REQUIRED");
  const publishDirect = await asTeacher("PATCH", `/courses/${courseId}/assignments/${untagged.body.content_id}`, { published: true });
  assert.equal(publishDirect.status, 422);

  const tagged = await addItem(courseId, week1.id, { itemType: "assignment", title: "Tagged", outcomeIds: [outcomeId] });
  assert.equal(tagged.body.published, true);
  // A published graded item can't lose its last outcome.
  const strip = await asTeacher("POST", `/courses/${courseId}/item-outcomes`, { itemType: "assignment", itemId: tagged.body.content_id, outcomeIds: [] });
  assert.equal(strip.status, 422);

  const page = await addItem(courseId, week1.id, { itemType: "page", title: "Reading" });
  assert.equal(page.body.published, true, "pages don't need outcomes");
  const practice = await addItem(courseId, week1.id, { itemType: "quiz", title: "Warm-up", kind: "practice" });
  assert.equal(practice.body.published, true, "practice quizzes don't need outcomes");
});

test("outcome tags must come from the same course and the item must exist", async () => {
  const { courseId, week1 } = await setupCourse("Tags");
  const other = await setupCourse("Other tags");
  const item = await addItem(courseId, week1.id, { itemType: "assignment", title: "Essay" });
  const foreign = await asTeacher("POST", `/courses/${courseId}/item-outcomes`, { itemType: "assignment", itemId: item.body.content_id, outcomeIds: [other.outcomeId] });
  assert.equal(foreign.status, 400);
  const missing = await asTeacher("POST", `/courses/${courseId}/item-outcomes`, { itemType: "assignment", itemId: 999999, outcomeIds: [] });
  assert.equal(missing.status, 404);
});

test("moving and removing items keeps content in exactly one module", async () => {
  const { courseId, week1, week2, outcomeId } = await setupCourse("Moves");
  const item = await addItem(courseId, week1.id, { itemType: "assignment", title: "Movable", outcomeIds: [outcomeId] });
  const assignmentId = item.body.content_id;

  assert.equal((await asTeacher("PATCH", `/courses/${courseId}/assignments/${assignmentId}`, { moduleId: week2.id })).status, 200);
  let row = await db.prepare("SELECT a.module_id, mi.module_id AS listed_in FROM assignments a JOIN module_items mi ON mi.item_type = 'assignment' AND mi.content_id = a.id WHERE a.id = ?").get(assignmentId);
  assert.equal(row.module_id, week2.id);
  assert.equal(row.listed_in, week2.id);

  // Deleting a module that still has content is refused.
  const refused = await asTeacher("DELETE", `/courses/${courseId}/modules/${week2.id}`);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "MODULE_NOT_EMPTY");
  assert.equal((await asTeacher("DELETE", `/courses/${courseId}/modules/${week1.id}`)).status, 204);

  // "Remove from module" parks it, unpublished, in Unassigned, which blocks opening.
  assert.equal((await asTeacher("DELETE", `/courses/${courseId}/modules/${week2.id}/items/${item.body.id}`)).status, 204);
  row = await db.prepare("SELECT a.published, m.kind FROM assignments a JOIN modules m ON m.id = a.module_id WHERE a.id = ?").get(assignmentId);
  assert.equal(row.kind, "unassigned");
  assert.equal(Number(row.published), 0);
  const status = await asTeacher("GET", `/courses/${courseId}/setup-status`);
  assert.ok(status.body.missingRequirements.some((m) => m.includes("Unassigned")));

  // Deleting the assignment removes its listing and tags too.
  assert.equal((await asTeacher("DELETE", `/courses/${courseId}/assignments/${assignmentId}`)).status, 204);
  assert.equal(await db.prepare("SELECT 1 FROM module_items WHERE item_type = 'assignment' AND content_id = ?").get(assignmentId), undefined);
  assert.equal(await db.prepare("SELECT 1 FROM item_outcomes WHERE item_type = 'assignment' AND item_id = ?").get(assignmentId), undefined);
});

test("learners can't see or submit unpublished work", async () => {
  const { courseId, week1 } = await setupCourse("Hidden");
  const draft = await addItem(courseId, week1.id, { itemType: "assignment", title: "Draft" });
  assert.equal((await asStudent("GET", `/courses/${courseId}/assignments/${draft.body.content_id}`)).status, 404);
  assert.equal((await asStudent("POST", `/courses/${courseId}/assignments/${draft.body.content_id}/submit`, { body: "hi" })).status, 404);
});

test("discussions are created in a module the learner can see", async () => {
  const { courseId, week1 } = await setupCourse("Discuss");
  // week1 isn't published yet
  assert.equal((await asStudent("POST", `/courses/${courseId}/discussions`, { title: "Q", moduleId: week1.id })).status, 404);
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week1.id}`, { published: true });
  const res = await asStudent("POST", `/courses/${courseId}/discussions`, { title: "Q", moduleId: week1.id });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.module_id, week1.id);
});

// ---------- Quizzes (guide §5.4) ----------

test("quiz submissions are kept as attempts and limited when the teacher sets a limit", async () => {
  const { courseId, week1, outcomeId } = await setupCourse("Attempts");
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week1.id}`, { published: true });
  const created = await addItem(courseId, week1.id, {
    itemType: "quiz", title: "Check", outcomeIds: [outcomeId], attemptsAllowed: 2,
    questions: [{ prompt: "1+1", options: ["2", "3"], correctOption: "2", points: 2, outcomeId }],
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const quizId = created.body.content_id;
  const question = await db.prepare("SELECT id, outcome_id FROM quiz_questions WHERE quiz_id = ?").get(quizId);
  assert.equal(question.outcome_id, outcomeId);

  const submit = (answer) => asStudent("POST", `/courses/${courseId}/quizzes/${quizId}/submit`, { answers: { [question.id]: answer } });
  const first = await submit("3");
  assert.equal(first.status, 201);
  assert.equal(first.body.attemptNumber, 1);
  assert.equal(first.body.scorePct, 0);
  const second = await submit("2");
  assert.equal(second.body.attemptNumber, 2);
  assert.equal(second.body.attemptsRemaining, 0);
  const third = await submit("2");
  assert.equal(third.status, 409);

  const attempts = await db.prepare("SELECT COUNT(*) AS c FROM quiz_attempts WHERE quiz_id = ?").get(quizId);
  assert.equal(Number(attempts.c), 2);
  const latest = await db.prepare("SELECT score, attempt_number FROM quiz_submissions WHERE quiz_id = ?").get(quizId);
  assert.equal(Number(latest.score), 2);
  assert.equal(latest.attempt_number, 2);
});

// ---------- Rubrics and grading (guide §5.5-5.6) ----------

test("a rubric belongs to its assignment and criteria can point at outcomes", async () => {
  const { courseId, week1, outcomeId } = await setupCourse("Rubrics");
  const other = await setupCourse("Other rubric course");
  const item = await addItem(courseId, week1.id, { itemType: "assignment", title: "Essay", outcomeIds: [outcomeId] });
  const url = `/courses/${courseId}/assignments/${item.body.content_id}/rubric`;

  assert.equal((await asTeacher("PUT", url, { criteria: [] })).status, 400);
  assert.equal((await asTeacher("PUT", url, { criteria: [{ title: "Clarity", outcomeId: other.outcomeId }] })).status, 400);
  const saved = await asTeacher("PUT", url, { criteria: [{ title: "Clarity", points: 4, outcomeId }, { title: "Evidence", points: 6 }] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.criteria.length, 2);
  assert.equal(saved.body.criteria[0].outcome_id, outcomeId);

  // Saving again replaces, never duplicates.
  await asTeacher("PUT", url, { criteria: [{ title: "Only one" }] });
  const library = await asTeacher("GET", `/courses/${courseId}/rubrics`);
  assert.equal(library.body.length, 1);
  assert.equal(library.body[0].criteria.length, 1);
  assert.equal(library.body[0].assignment_title, "Essay");
  assert.equal((await asTeacher("POST", `/courses/${courseId}/rubrics`, { title: "Standalone" })).status, 404);
});

test("grades stay within points possible, only for learners in the course, and are audited", async () => {
  const { courseId, week1, outcomeId } = await setupCourse("Grading");
  const item = await addItem(courseId, week1.id, { itemType: "assignment", title: "Essay", outcomeIds: [outcomeId], pointsPossible: 10 });
  const base = `/courses/${courseId}/assignments/${item.body.content_id}/grade`;
  const student = encodeURIComponent(USERS_STUDENT);
  assert.equal((await asTeacher("PATCH", `${base}/${student}`, { grade: 11 })).status, 400);
  assert.equal((await asTeacher("PATCH", `${base}/${encodeURIComponent("outsider@test.local")}`, { grade: 5 })).status, 404);
  assert.equal((await asTeacher("PATCH", `${base}/${student}`, { grade: 7 })).status, 200);
  assert.equal((await asTeacher("PATCH", `${base}/${student}`, { grade: 9, reason: "regrade" })).status, 200);
  const log = await db.prepare("SELECT old_grade, new_grade, changed_by, reason FROM grade_audit_log WHERE assignment_id = ? ORDER BY id").all(item.body.content_id);
  assert.deepEqual(log.map((l) => [l.old_grade === null ? null : Number(l.old_grade), Number(l.new_grade), l.reason]), [[null, 7, null], [7, 9, "regrade"]]);
  assert.equal(log[0].changed_by, "teacher@test.local");
});

const USERS_STUDENT = "student@test.local";

test("a learner's first submission succeeds and schedules spaced reviews", async () => {
  const { courseId, week1, outcomeId } = await setupCourse("First submission");
  const item = await addItem(courseId, week1.id, { itemType: "assignment", title: "Essay", outcomeIds: [outcomeId] });
  const res = await asStudent("POST", `/courses/${courseId}/assignments/${item.body.content_id}/submit`, { body: "My essay" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const reviews = await db.prepare("SELECT interval_days, due_at > NOW() AS future FROM sol_spaced_reviews WHERE topic_id = ? ORDER BY interval_days").all(`assignment_${item.body.content_id}`);
  assert.deepEqual(reviews.map((r) => [r.interval_days, r.future]), [[3, true], [7, true], [30, true]]);
});
