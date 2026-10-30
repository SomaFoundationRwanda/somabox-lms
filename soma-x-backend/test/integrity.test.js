// Phase 2: data integrity rules (lifecycle, module ownership, quizzes, rubrics).
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

test("an outcome that is the only tag of published graded work can't be deleted", async () => {
  const { courseId, week1, outcomeId } = await setupCourse("Outcome delete");
  const tagged = await addItem(courseId, week1.id, { itemType: "assignment", title: "Essay", outcomeIds: [outcomeId] });
  assert.equal(tagged.body.published, true);

  const blocked = await asTeacher("DELETE", `/courses/${courseId}/outcomes/${outcomeId}`);
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.code, "OUTCOME_IN_USE");
  assert.deepEqual(blocked.body.items, ["Essay"]);

  // With a second outcome on the work, the first one can go.
  const second = await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Second" });
  await asTeacher("POST", `/courses/${courseId}/item-outcomes`, { itemType: "assignment", itemId: tagged.body.content_id, outcomeIds: [outcomeId, second.body.id] });
  assert.equal((await asTeacher("DELETE", `/courses/${courseId}/outcomes/${outcomeId}`)).status, 204);
});

test("learners join a private course with the teacher's join code", async () => {
  const asOutsider = call("outsider");
  const courseId = await ctx.createCourse("Join code");
  assert.equal((await db.prepare("SELECT visibility FROM courses WHERE id = ?").get(courseId)).visibility, "private");

  // Off until the teacher turns it on; only teachers can see or change it.
  assert.deepEqual((await asTeacher("GET", `/courses/${courseId}/join-code`)).body, { code: null });
  assert.equal((await asStudent("GET", `/courses/${courseId}/join-code`)).status, 403);
  assert.equal((await asStudent("POST", `/courses/${courseId}/join-code`, { action: "on" })).status, 403);
  const on = await asTeacher("POST", `/courses/${courseId}/join-code`, { action: "on" });
  assert.match(on.body.code, /^[2-9A-HJKMNP-Z]{6}$/);
  assert.equal((await asTeacher("POST", `/courses/${courseId}/join-code`, { action: "on" })).body.code, on.body.code, "on keeps the code");

  // The code never reaches learners through course rows.
  const asJson = JSON.stringify((await asStudent("GET", `/courses/${courseId}`)).body) + JSON.stringify((await asStudent("GET", "/courses/mine")).body);
  assert.ok(!asJson.includes(on.body.code));

  // Typed loosely (lower case, spaces, a dash) it still works: a request to join as a student,
  // which the teacher approves (a code can travel beyond the class).
  assert.equal((await asOutsider("POST", "/courses/join-by-code", { code: "XXXXXX" })).status, 404);
  const typed = `${on.body.code.slice(0, 3).toLowerCase()} - ${on.body.code.slice(3)}`;
  const joined = await asOutsider("POST", "/courses/join-by-code", { code: typed });
  assert.equal(joined.status, 200);
  assert.equal(joined.body.courseId, courseId);
  assert.equal(joined.body.status, "pending");
  const enrollment = await db.prepare("SELECT role, status FROM enrollments WHERE course_id = ? AND user_email = ?").get(courseId, USERS.outsider.email);
  assert.deepEqual([enrollment.role, enrollment.status], ["student", "pending"]);

  // A new code replaces the old one; off stops joining.
  const renewed = await asTeacher("POST", `/courses/${courseId}/join-code`, { action: "new" });
  assert.notEqual(renewed.body.code, on.body.code);
  assert.equal((await asOutsider("POST", "/courses/join-by-code", { code: on.body.code })).status, 404);
  await asTeacher("POST", `/courses/${courseId}/join-code`, { action: "off" });
  assert.equal((await asOutsider("POST", "/courses/join-by-code", { code: renewed.body.code })).status, 404);

  // A draft course can't be joined yet.
  const draftId = await ctx.createCourse("Draft join", { lifecycle: "draft" });
  const draftCode = (await asTeacher("POST", `/courses/${draftId}/join-code`, { action: "on" })).body.code;
  const notOpen = await asOutsider("POST", "/courses/join-by-code", { code: draftCode });
  assert.equal(notOpen.status, 400);
  assert.equal(notOpen.body.code, "NOT_OPEN");
});

test("guessing join codes is cut off after repeated misses", async () => {
  const asAdmin = call("admin");
  for (let i = 0; i < 10; i++) assert.equal((await asAdmin("POST", "/courses/join-by-code", { code: `ZZZZ${i}` })).status, 404);
  const blocked = await asAdmin("POST", "/courses/join-by-code", { code: "ZZZZZZ" });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, "TOO_MANY");
});

test("a quiz stops assessing an outcome its questions no longer use", async () => {
  const { courseId, week1, outcomeId } = await setupCourse("Quiz retag");
  const second = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Second" })).body.id;
  const question = (outcome) => ({ prompt: "2 + 2?", options: ["4", "5"], correctOption: "4", outcomeId: outcome });
  const quiz = await addItem(courseId, week1.id, { itemType: "quiz", title: "Check", questions: [question(outcomeId)] });
  const tags = async () => (await asTeacher("GET", `/courses/${courseId}/item-outcomes`)).body
    .filter((t) => t.item_type === "quiz" && Number(t.item_id) === Number(quiz.body.content_id))
    .map((t) => Number(t.outcome_id));

  assert.deepEqual(await tags(), [outcomeId]);
  const res = await asTeacher("PATCH", `/courses/${courseId}/modules/${week1.id}/items/${quiz.body.id}/content`, { questions: [question(second)] });
  assert.equal(res.status, 200);
  assert.deepEqual(await tags(), [second]);
});

test("an outcome can be edited, but not to an empty statement", async () => {
  const { courseId, outcomeId } = await setupCourse("Outcome edit");
  const edited = await asTeacher("PATCH", `/courses/${courseId}/outcomes/${outcomeId}`, { title: "  Reads fluently  ", description: "Aloud" });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.title, "Reads fluently");
  assert.equal((await asTeacher("PATCH", `/courses/${courseId}/outcomes/${outcomeId}`, { title: "   " })).status, 400);
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

test("teachers start discussions in a week; learners reply but don't start them", async () => {
  const { courseId, week1 } = await setupCourse("Discuss");
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week1.id}`, { published: true });
  assert.equal((await asStudent("POST", `/courses/${courseId}/discussions`, { title: "Q", moduleId: week1.id })).status, 403);
  const res = await asTeacher("POST", `/courses/${courseId}/discussions`, { title: "Q", moduleId: week1.id, published: true });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.module_id, week1.id);
  assert.equal((await asStudent("POST", `/courses/${courseId}/discussions/${res.body.id}/replies`, { body: "My answer" })).status, 201);
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
  // Learners hand in work only in a released week.
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week1.id}`, { published: true });
  const item = await addItem(courseId, week1.id, { itemType: "assignment", title: "Essay", outcomeIds: [outcomeId] });
  const res = await asStudent("POST", `/courses/${courseId}/assignments/${item.body.content_id}/submit`, { body: "My essay" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const reviews = await db.prepare("SELECT interval_days, due_at > NOW() AS future FROM sol_spaced_reviews WHERE topic_id = ? ORDER BY interval_days").all(`assignment_${item.body.content_id}`);
  assert.deepEqual(reviews.map((r) => [r.interval_days, r.future]), [[3, true], [7, true], [30, true]]);
});

test("admins can list every course with its teacher and learner count", async () => {
  const courseId = await ctx.createCourse("Listed for admin", { lifecycle: "draft" });
  const res = await call("admin")("GET", "/courses/all");
  assert.equal(res.status, 200);
  const row = res.body.find((c) => c.id === courseId);
  assert.equal(row.lifecycle, "draft");
  assert.equal(row.learners, 1);
  assert.match(row.teachers, /teacher@test\.local/);
});
