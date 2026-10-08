// Phase 11: fixes from the audit (docs/99-gap-report.md).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import { startTestServer, USERS, PASSWORD } from "./helpers.js";

let ctx;
let db;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");
const asAdmin = call("admin");
const asOutsider = call("outsider");
const STUDENT = encodeURIComponent(USERS.student.email);

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
});

after(async () => {
  await ctx.stop();
});

const addItem = (courseId, moduleId, body) => asTeacher("POST", `/courses/${courseId}/modules/${moduleId}/items`, body);

async function course(opts) {
  const courseId = await ctx.createCourse("Hardening", opts);
  const o = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Read" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week.id}`, { published: true });
  return { courseId, o, week };
}

test("a course code alone opens only public, open courses; invites can't be faked or revived", async () => {
  const c = await course();
  // Private by default: the outsider can't walk in with the code.
  const denied = await asOutsider("POST", `/courses/${c.courseId}/enroll`);
  assert.equal(denied.status, 403);
  assert.match(denied.body.message, /private/);
  assert.equal((await asOutsider("POST", `/courses/${c.courseId}/accept-invite`)).status, 404, "no invitation, nothing to accept");

  // Invited: the code (or accept-invite) works.
  await asTeacher("POST", `/courses/${c.courseId}/people`, { email: "newbie@test.local" });
  await db.prepare("UPDATE enrollments SET status = 'invited' WHERE course_id = ? AND user_email = ?").run(c.courseId, USERS.outsider.email).catch(() => {});
  await db.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'student', 'invited')").run(c.courseId, USERS.outsider.email);
  assert.equal((await asOutsider("POST", `/courses/${c.courseId}/enroll`)).status, 201);

  // Switched off by the teacher: can't switch themselves back on.
  await db.prepare("UPDATE enrollments SET status = 'inactive' WHERE course_id = ? AND user_email = ?").run(c.courseId, USERS.outsider.email);
  assert.equal((await asOutsider("POST", `/courses/${c.courseId}/enroll`)).status, 403);
  assert.equal((await asOutsider("POST", `/courses/${c.courseId}/accept-invite`)).status, 404);

  // Public and open: the code works for anyone.
  const pub = await course();
  await db.prepare("UPDATE courses SET visibility = 'public' WHERE id = ?").run(pub.courseId);
  assert.equal((await asOutsider("POST", `/courses/${pub.courseId}/enroll`)).status, 201);
});

test("only the course teacher manages staff, teachers need teacher accounts, and the last teacher stays", async () => {
  const c = await course();
  const people = async () => (await asTeacher("GET", `/courses/${c.courseId}/people`)).body;
  // A TA can't promote or demote staff.
  await asTeacher("POST", `/courses/${c.courseId}/people`, { email: USERS.otherTeacher.email, role: "ta" });
  const asTA = call("otherTeacher");
  const demote = await asTA("POST", `/courses/${c.courseId}/people`, { email: USERS.teacher.email, role: "student" });
  assert.equal(demote.status, 403);
  assert.equal((await asTA("POST", `/courses/${c.courseId}/people`, { email: USERS.outsider.email, role: "teacher" })).status, 403);
  // A learner account can't be made a course teacher.
  const learnerTeacher = await asTeacher("POST", `/courses/${c.courseId}/people`, { email: USERS.outsider.email, role: "teacher" });
  assert.equal(learnerTeacher.status, 400);
  // The last teacher can't be removed or demoted.
  const me = (await people()).find((p) => p.email === USERS.teacher.email);
  assert.equal((await asTeacher("DELETE", `/courses/${c.courseId}/people/${me.id}`)).status, 409);
  assert.equal((await asTeacher("POST", `/courses/${c.courseId}/people`, { email: USERS.teacher.email, role: "ta" })).status, 409);

  // Learners see classmates' names, not their email addresses (except their own).
  const seen = (await asStudent("GET", `/courses/${c.courseId}/people`)).body;
  assert.ok(seen.every((p) => p.email === null || p.email === USERS.student.email));
  assert.ok(seen.some((p) => p.email === USERS.student.email));
});

test("deleting an account releases its places; a re-registered email inherits nothing", async () => {
  const c = await course();
  const hash = await bcrypt.hash(PASSWORD, 4);
  await db.prepare("INSERT INTO users (email, full_name, password_hash, role) VALUES ('leaver@test.local', 'Leaver', ?, 'teacher')").run(hash);
  await asTeacher("POST", `/courses/${c.courseId}/people`, { email: "leaver@test.local", role: "teacher" });
  const leaver = await db.prepare("SELECT id FROM users WHERE email = 'leaver@test.local'").get();
  assert.equal((await asAdmin("DELETE", `/users/${leaver.id}`)).status, 200);
  const left = await db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE user_email = 'leaver@test.local'").get();
  assert.equal(Number(left.n), 0);

  const again = await ctx.api("POST", "/auth/register", { body: { email: "leaver@test.local", password: PASSWORD, fullName: "Someone else" } });
  assert.ok([200, 201].includes(again.status), JSON.stringify(again.body));
  const token = await ctx.login("leaver@test.local");
  const mine = await ctx.api("GET", "/courses/mine", { token });
  assert.deepEqual(mine.body, []);
});

test("changing someone's email keeps their courses and work theirs", async () => {
  const c = await course();
  const a = await addItem(c.courseId, c.week.id, { itemType: "assignment", title: "Essay", outcomeIds: [c.o.id] });
  await asStudent("POST", `/courses/${c.courseId}/assignments/${a.body.content_id}/submit`, { body: "mine" });
  const hash = await bcrypt.hash(PASSWORD, 4);
  await db.prepare("INSERT INTO users (email, full_name, password_hash, role) VALUES ('mover@test.local', 'Mover', ?, 'scholar')").run(hash);
  await db.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, 'mover@test.local', 'student', 'active')").run(c.courseId);
  await db.prepare("INSERT INTO assignment_submissions (assignment_id, scholar_email, body, submitted_at) VALUES (?, 'mover@test.local', 'moving essay', NOW())").run(a.body.content_id);
  const mover = await db.prepare("SELECT id FROM users WHERE email = 'mover@test.local'").get();

  assert.equal((await asAdmin("PATCH", `/users/${mover.id}`, { email: USERS.student.email })).status, 409, "an email in use is refused");
  const moved = await asAdmin("PATCH", `/users/${mover.id}`, { email: "moved@test.local" });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  const token = await ctx.login("moved@test.local");
  const mine = await ctx.api("GET", "/courses/mine", { token });
  assert.ok(mine.body.some((x) => x.id === c.courseId), "still enrolled");
  const sub = await db.prepare("SELECT body FROM assignment_submissions WHERE scholar_email = 'moved@test.local'").get();
  assert.equal(sub.body, "moving essay");
  const leftover = await db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE user_email = 'mover@test.local'").get();
  assert.equal(Number(leftover.n), 0);
});

test("deleted work stops counting toward mastery", async () => {
  const c = await course();
  const quiz = await addItem(c.courseId, c.week.id, { itemType: "quiz", title: "Q", outcomeIds: [c.o.id], questions: [{ prompt: "1+1", options: ["2", "3"], correctOption: "2", outcomeId: c.o.id }] });
  const [q] = await db.prepare("SELECT id FROM quiz_questions WHERE quiz_id = ?").all(quiz.body.content_id);
  await asStudent("POST", `/courses/${c.courseId}/quizzes/${quiz.body.content_id}/submit`, { answers: { [q.id]: "2" } });
  const mastery = async () => (await asTeacher("GET", `/courses/${c.courseId}/outcome-mastery`)).body.outcomes[0].currentMastery;
  assert.equal(await mastery(), 100);
  assert.equal((await asTeacher("DELETE", `/courses/${c.courseId}/quizzes/${quiz.body.content_id}`)).status, 204);
  assert.equal(await mastery(), null, "the deleted quiz's results are gone");
  const left = await db.prepare("SELECT COUNT(*) AS n FROM outcome_results WHERE course_id = ?").get(c.courseId);
  assert.equal(Number(left.n), 0);
});

test("a rubric that has been used for grading keeps its scoring; wording can still change", async () => {
  const c = await course();
  const a = await addItem(c.courseId, c.week.id, { itemType: "assignment", title: "Poster", pointsPossible: 10, outcomeIds: [c.o.id] });
  const id = a.body.content_id;
  const rubric = (await asTeacher("PUT", `/courses/${c.courseId}/assignments/${id}/rubric`, { criteria: [{ title: "Drawing", points: 4, outcomeId: c.o.id }] })).body;
  await asTeacher("PUT", `/courses/${c.courseId}/assignments/${id}/grade/${STUDENT}/rubric`, { scores: [{ criterionId: rubric.criteria[0].id, points: 3 }] });

  const reshaped = await asTeacher("PUT", `/courses/${c.courseId}/assignments/${id}/rubric`, { criteria: [{ title: "Drawing", points: 5, outcomeId: c.o.id }] });
  assert.equal(reshaped.status, 409);
  assert.equal(reshaped.body.code, "RUBRIC_IN_USE");
  const reworded = await asTeacher("PUT", `/courses/${c.courseId}/assignments/${id}/rubric`, { criteria: [{ title: "Clear drawing", description: "Neat and labelled", points: 4, outcomeId: c.o.id }] });
  assert.equal(reworded.status, 200, JSON.stringify(reworded.body));
  const scores = await db.prepare("SELECT points FROM submission_scores").all();
  assert.ok(scores.some((s) => Number(s.points) === 3), "the learner's score survived");
  assert.equal((await db.prepare("SELECT title FROM rubric_criteria WHERE id = ?").get(rubric.criteria[0].id)).title, "Clear drawing");
});

test("open questions don't count against learners while they can't be marked", async () => {
  const c = await course();
  const quiz = await addItem(c.courseId, c.week.id, {
    itemType: "quiz", title: "Mixed", outcomeIds: [c.o.id],
    questions: [
      { prompt: "1+1", options: ["2", "3"], correctOption: "2", points: 1, outcomeId: c.o.id },
      { prompt: "Explain why", questionType: "open", points: 4, outcomeId: c.o.id },
    ],
  });
  const qs = await db.prepare("SELECT id, question_type FROM quiz_questions WHERE quiz_id = ? ORDER BY position").all(quiz.body.content_id);
  const res = await asStudent("POST", `/courses/${c.courseId}/quizzes/${quiz.body.content_id}/submit`, { answers: { [qs[0].id]: "2", [qs[1].id]: "Because." } });
  assert.equal(res.body.scorePct, 100, "1 of 1 markable point, not 1 of 5");
  const m = (await asTeacher("GET", `/courses/${c.courseId}/outcome-mastery`)).body.outcomes[0];
  assert.equal(m.currentMastery, 100);
});

test("outcome codes are unique in a course", async () => {
  const c = await course();
  const more = [];
  for (const title of ["Write", "Speak"]) more.push((await asTeacher("POST", `/courses/${c.courseId}/outcomes`, { title })).body);
  const codes = (await db.prepare("SELECT code FROM outcomes WHERE course_id = ? ORDER BY id").all(c.courseId)).map((o) => o.code);
  assert.deepEqual(codes, ["OUT-1", "OUT-2", "OUT-3"]);
  const chosen = (await asTeacher("POST", `/courses/${c.courseId}/outcomes`, { title: "Count", code: "out-2" })).body;
  assert.equal(chosen.code, "OUT-4", "a taken code isn't reused, whatever its case");
});

test("a learner account with a TA place can't see AI drafts or grading suggestions", async () => {
  const c = await course();
  await db.prepare("UPDATE enrollments SET role = 'ta' WHERE course_id = ? AND user_email = ?").run(c.courseId, USERS.student.email);
  for (const path of [`/courses/${c.courseId}/ai/drafts`, `/courses/${c.courseId}/ai/jobs`, `/courses/${c.courseId}/ai/grading-suggestion?assignmentId=1&scholarEmail=x`]) {
    assert.equal((await asStudent("GET", path)).status, 403, path);
  }
  await db.prepare("UPDATE enrollments SET role = 'student' WHERE course_id = ? AND user_email = ?").run(c.courseId, USERS.student.email);
});

test("an enrolled learner never succeeds on a teacher-only course route", async () => {
  // A course with one of everything, so routes reach their permission checks with real ids.
  const c = await course();
  const page = (await addItem(c.courseId, c.week.id, { itemType: "page", title: "P", body: "x" })).body;
  const quiz = (await addItem(c.courseId, c.week.id, { itemType: "quiz", title: "Q", outcomeIds: [c.o.id], questions: [{ prompt: "1+1", options: ["2"], correctOption: "2" }] })).body;
  const assignment = (await addItem(c.courseId, c.week.id, { itemType: "assignment", title: "A", outcomeIds: [c.o.id] })).body;
  const disc = (await asTeacher("POST", `/courses/${c.courseId}/discussions`, { title: "D", body: "x", moduleId: c.week.id, published: true })).body;
  const ann = (await asTeacher("POST", `/courses/${c.courseId}/announcements`, { title: "N", body: "x", published: true })).body;
  const studentEnrollment = await db.prepare("SELECT id FROM enrollments WHERE course_id = ? AND user_email = ?").get(c.courseId, USERS.student.email);
  const ids = {
    id: c.courseId, moduleId: c.week.id, itemId: page.id, moduleItemId: page.id, pageId: page.content_id,
    quizId: quiz.content_id, assignmentId: assignment.content_id, discussionId: disc?.id, announcementId: ann?.id,
    outcomeId: c.o.id, enrollmentId: studentEnrollment.id, scholarEmail: STUDENT, userId: 1, fileId: 1, draftId: 1, jobId: 1, collaborationId: 1,
  };
  // Routes learners are meant to use (reading published content, their own work, their progress).
  const LEARNER_OK = new Set([
    "GET /courses/:id", "GET /courses/:id/nav", "GET /courses/:id/people", "GET /courses/:id/modules", "GET /courses/:id/modules/:moduleId",
    "GET /courses/:id/modules/:moduleId/items", "GET /courses/:id/pages", "GET /courses/:id/pages/:pageId", "POST /courses/:id/pages/:pageId/view",
    "GET /courses/:id/assignments", "GET /courses/:id/assignments/:assignmentId", "POST /courses/:id/assignments/:assignmentId/submit",
    "GET /courses/:id/assignments/:assignmentId/rubric", "GET /courses/:id/quizzes", "GET /courses/:id/quizzes/:quizId",
    "POST /courses/:id/quizzes/:quizId/submit", "GET /courses/:id/discussions", "GET /courses/:id/discussions/:discussionId",
    "POST /courses/:id/discussions/:discussionId/replies", "GET /courses/:id/announcements", "GET /courses/:id/syllabus",
    "GET /courses/:id/grades", "GET /courses/:id/outcomes", "GET /courses/:id/outcome-mastery", "GET /courses/:id/item-outcomes",
    "GET /courses/:id/calendar", "GET /courses/:id/calendar.ics", "GET /courses/:id/timeline", "GET /courses/:id/home-loop",
    "GET /courses/:id/baseline", "GET /courses/:id/my-progress", "GET /courses/:id/files", "GET /courses/:id/collaborations",
    "POST /courses/:id/collaborations", "POST /courses/:id/discussions", "POST /courses/:id/modules/:moduleId/items/:itemId/progress",
    "GET /courses/:id/setup-status", "POST /courses/:id/enroll", "POST /courses/:id/accept-invite", "POST /courses/:id/join",
    "GET /courses/:id/rubrics", "GET /courses/:id/activity", "GET /courses/:id/module-items/sequence",
    "GET /courses/:id/module-items/sequence-position", "POST /courses/:id/module-items/:moduleItemId/progress",
    "GET /courses/:id/attendance/me",
  ]);
  const routes = [];
  const walk = (prefix, stack) => {
    for (const layer of stack) {
      if (layer.route) for (const m of Object.keys(layer.route.methods)) routes.push({ method: m.toUpperCase(), path: prefix + layer.route.path });
      else if (layer.handle?.stack) walk(prefix, layer.handle.stack);
    }
  };
  for (const [prefix, router] of ctx.API_ROUTERS) walk(prefix, router.stack);
  const courseRoutes = routes.filter((r) => r.path.startsWith("/courses/:id") && !LEARNER_OK.has(`${r.method} ${r.path}`));
  // Reads first, then writes, deletes last (a wrongly allowed delete would hide later failures).
  const order = { GET: 0, POST: 1, PUT: 1, PATCH: 1, DELETE: 2 };
  courseRoutes.sort((a, b) => order[a.method] - order[b.method]);
  const allowed = [];
  for (const r of courseRoutes) {
    const path = r.path.replace(/:([A-Za-z]+)/g, (_, k) => String(ids[k] ?? 1));
    const res = await asStudent(r.method, path, r.method === "GET" ? undefined : { title: "x", body: "x", email: USERS.outsider.email, grade: 1, scores: [] });
    if (res.status >= 200 && res.status < 300) allowed.push(`${r.method} ${r.path} -> ${res.status}`);
  }
  assert.deepEqual(allowed, [], "learners must not succeed on these teacher routes");
  assert.ok(courseRoutes.length >= 60, `checked ${courseRoutes.length} teacher routes`);
});
