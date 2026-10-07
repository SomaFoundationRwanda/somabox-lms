// Phase 0 regression tests: no fabricated metrics, auth on read endpoints,
// draft course lifecycle with a real opening gate, and AI stub output kept as drafts.
//
// Runs against a throwaway PostgreSQL database created for this run and dropped after.
// Connection settings come from the usual PG* environment variables.
// Runs against a throwaway PostgreSQL database (see test/helpers.js).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, USERS } from "./helpers.js";

const TEACHER = USERS.teacher.email;
const STUDENT = USERS.student.email;

let ctx;
let db;
let tokens;
// as(role) -> request helper carrying that user's session token.
const as = (who) => (method, path, body) => ctx.api(method, path, { token: who ? tokens[who] : undefined, body });
const asTeacher = as("teacher");
const asStudent = as("student");
const asOutsider = as("outsider");
const anon = as(null);
const createCourse = (title, opts) => ctx.createCourse(title, opts);

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
  tokens = ctx.tokens;
});

after(async () => {
  await ctx.stop();
});

// ---------- P0-1: no fabricated metrics on an empty database ----------

test("growth-curves is empty on an empty database", async () => {
  const res = await asTeacher("GET", "/analytics/growth-curves");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { weeks: [], baselineAverage: null, baselineLearners: 0 });
});

test("inclusivity-gap reports null averages when there is no progress data", async () => {
  const res = await as("admin")("GET", "/analytics/inclusivity-gap");
  assert.equal(res.status, 200);
  // Two seeded test scholars exist, but neither has any progress data.
  assert.equal(res.body.totalScholars, 2);
  assert.equal(res.body.scholarsWithData, 0);
  assert.equal(res.body.ruralVsUrban.ruralAverage, null);
  assert.equal(res.body.ruralVsUrban.urbanAverage, null);
  assert.equal(res.body.ruralVsUrban.gapPercentage, null);
  for (const value of Object.values(res.body.genderBreakdown)) assert.equal(value, null);
  assert.equal(res.body.accessibilityMetrics.scholarsWithAccessibilityNeeds, 0);
  assert.equal(res.body.accessibilityMetrics.averagePerformance, null);
});

test("sol-outcomes reports zero or null counts when nothing was recorded", async () => {
  const res = await asTeacher("GET", "/analytics/sol-outcomes");
  assert.equal(res.status, 200);
  assert.equal(res.body.activeTrackedOutcomes, 0);
  for (const p of res.body.principles) assert.ok(p.count === 0 || p.count === null, `${p.name}: ${p.count}`);
});

test("outcome-mastery returns null baseline and mastery when nothing was assessed", async () => {
  const courseId = await createCourse();
  await db.prepare("INSERT INTO outcomes (course_id, title) VALUES (?, 'Solve linear equations')").run(courseId);

  for (const [email, call] of [[TEACHER, asTeacher], [STUDENT, asStudent]]) {
    const res = await call("GET", `/courses/${courseId}/outcome-mastery`);
    assert.equal(res.status, 200);
    assert.equal(res.body.outcomes.length, 1);
    const [o] = res.body.outcomes;
    assert.equal(o.baselineScore, null, `${email} baseline`);
    assert.equal(o.currentMastery, null, `${email} mastery`);
    assert.equal(o.delta, null);
    assert.equal(o.status, null);
  }
});

test("outcome-mastery normalizes graded work to percent", async () => {
  const courseId = await createCourse();
  const outcome = await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Graphing" });
  const mod = await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" });
  const item = await asTeacher("POST", `/courses/${courseId}/modules/${mod.body.id}/items`, { itemType: "assignment", title: "HW", pointsPossible: 50, outcomeIds: [outcome.body.id] });
  const graded = await asTeacher("PATCH", `/courses/${courseId}/assignments/${item.body.content_id}/grade/${encodeURIComponent(STUDENT)}`, { grade: 40 });
  assert.equal(graded.status, 200, JSON.stringify(graded.body));

  const res = await asStudent("GET", `/courses/${courseId}/outcome-mastery`);
  assert.equal(res.status, 200);
  const [o] = res.body.outcomes;
  assert.equal(o.currentMastery, 80);
  assert.equal(o.baselineScore, null);
  assert.equal(o.delta, null);
});

test("client-sent baseline scores are no longer accepted", async () => {
  // Baselines are computed from baseline quiz answers (see test/setup.test.js).
  const courseId = await createCourse();
  const res = await asStudent("POST", `/courses/${courseId}/baseline/submit`, { answers: { 1: 100 } });
  assert.equal(res.status, 404);
  const rows = await db.prepare("SELECT * FROM student_outcome_baselines WHERE course_id = ?").all(courseId);
  assert.equal(rows.length, 0);
});

// ---------- P0-3: read endpoints require enrollment ----------

test("course read endpoints reject anonymous and non-enrolled callers", async () => {
  const courseId = await createCourse();
  for (const path of ["home-loop", "setup-status", "baseline", "item-outcomes"]) {
    const anonymous = await anon("GET", `/courses/${courseId}/${path}`);
    assert.equal(anonymous.status, 401, `${path} anonymous`);
    // A client-supplied email is ignored: the outsider can't borrow the student's identity.
    const outsider = await asOutsider("GET", `/courses/${courseId}/${path}?userEmail=${encodeURIComponent(STUDENT)}`);
    assert.equal(outsider.status, 403, `${path} outsider`);
    const student = await asStudent("GET", `/courses/${courseId}/${path}`);
    assert.equal(student.status, 200, `${path} student`);
  }
});

test("home-loop hides class-wide attention items from students", async () => {
  const courseId = await createCourse();
  const mod = await db.prepare("INSERT INTO modules (course_id, title, week_offset) VALUES (?, 'Week 1', 1) RETURNING id").get(courseId);
  const assignment = await db.prepare("INSERT INTO assignments (course_id, module_id, title) VALUES (?, ?, 'Untagged') RETURNING id").get(courseId, mod.id);
  await db.prepare("INSERT INTO module_items (module_id, item_type, content_id, title, position) VALUES (?, 'assignment', ?, 'Untagged', 0)").run(mod.id, assignment.id);

  const teacher = await asTeacher("GET", `/courses/${courseId}/home-loop`);
  assert.equal(teacher.status, 200);
  assert.ok(teacher.body.needsAttention.some((n) => n.id === "missing-outcomes"));

  const student = await asStudent("GET", `/courses/${courseId}/home-loop`);
  assert.equal(student.status, 200);
  assert.equal(student.body.needsAttention.length, 0);
});

// ---------- P0-6: new courses are drafts and the opening gate is real ----------

test("a new course starts unopened and cannot open with missing requirements", async () => {
  const courseId = await createCourse("Draft", { lifecycle: "draft" });
  const status = await asTeacher("GET", `/courses/${courseId}/setup-status`);
  assert.equal(status.status, 200);
  assert.equal(status.body.isOpened, false);
  assert.equal(status.body.canOpen, false);
  assert.ok(status.body.missingRequirements.length > 0);

  const open = await asTeacher("POST", `/courses/${courseId}/open-course`, {});
  assert.equal(open.status, 400);

  const patch = await asTeacher("PATCH", `/courses/${courseId}`, { lifecycle: "open" });
  assert.equal(patch.status, 400);

  const course = await db.prepare("SELECT lifecycle FROM courses WHERE id = ?").get(courseId);
  assert.equal(course.lifecycle, "draft");
});

test("a course with outcomes, a module, and an item can open", async () => {
  const courseId = await createCourse("To open", { lifecycle: "draft" });
  await db.prepare("INSERT INTO outcomes (course_id, title) VALUES (?, 'O1')").run(courseId);
  const mod = await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" });
  await asTeacher("POST", `/courses/${courseId}/modules/${mod.body.id}/items`, { itemType: "page", title: "Intro" });
  await asTeacher("PATCH", `/courses/${courseId}`, { startDate: "2026-01-05" });
  await asTeacher("POST", `/courses/${courseId}/baseline/skip`, { reason: "Small pilot class, no pre-test" });

  const open = await asTeacher("POST", `/courses/${courseId}/open-course`, {});
  assert.equal(open.status, 200, JSON.stringify(open.body));
  const status = await asTeacher("GET", `/courses/${courseId}/setup-status`);
  assert.equal(status.body.isOpened, true);
});

test("open-course requires the teacher role", async () => {
  const courseId = await createCourse();
  // Even claiming the teacher's email in the body, a student is still a student.
  const res = await asStudent("POST", `/courses/${courseId}/open-course`, { teacherEmail: TEACHER });
  assert.equal(res.status, 403);
});

// (P0-5 AI stubs were replaced by real AI jobs and drafts in Phase 8: see test/ai.test.js.)

// ---------- P0-4: default admin must change password ----------

test("default admin must change password before using anything else", async () => {
  const login = await anon("POST", "/auth/login", { email: "admin@mail.com", password: "admin" });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.must_change_password, true);
  const token = login.body.token;
  const call = (method, path, body) => ctx.api(method, path, { token, body });

  const blocked = await call("GET", "/users");
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "PASSWORD_CHANGE_REQUIRED");
  assert.equal((await call("GET", "/auth/me")).status, 200);

  const same = await call("PATCH", "/users/profile/password", { currentPassword: "admin", newPassword: "admin" });
  assert.equal(same.status, 400);
  const change = await call("PATCH", "/users/profile/password", { currentPassword: "admin", newPassword: "a-new-password" });
  assert.equal(change.status, 200);

  assert.equal((await call("GET", "/users")).status, 200);
  const relogin = await anon("POST", "/auth/login", { email: "admin@mail.com", password: "a-new-password" });
  assert.equal(relogin.status, 200);
  assert.equal(relogin.body.user.must_change_password, false);
});

// ---------- Counts and positions read the awaited row, not a Promise ----------

test("new modules get increasing positions", async () => {
  const courseId = await createCourse();
  const first = await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" });
  const second = await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 2" });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(second.status, 201, JSON.stringify(second.body));
  const rows = await db.prepare("SELECT title, position FROM modules WHERE course_id = ? ORDER BY id").all(courseId);
  assert.deepEqual(rows.map((r) => Number(r.position)), [0, 1]);
});

test("modules and items can be reordered", async () => {
  const courseId = await createCourse();
  const a = await db.prepare("INSERT INTO modules (course_id, title, position, week_offset) VALUES (?, 'A', 0, 1) RETURNING id").get(courseId);
  const b = await db.prepare("INSERT INTO modules (course_id, title, position, week_offset) VALUES (?, 'B', 1, 2) RETURNING id").get(courseId);
  const res = await asTeacher("PATCH", `/courses/${courseId}/modules/reorder`, { moduleIds: [b.id, a.id] });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const mods = await db.prepare("SELECT id FROM modules WHERE course_id = ? ORDER BY position").all(courseId);
  assert.deepEqual(mods.map((m) => m.id), [b.id, a.id]);

  const i1 = await db.prepare("INSERT INTO module_items (module_id, item_type, title, position) VALUES (?, 'sub_header', 'one', 0) RETURNING id").get(a.id);
  const i2 = await db.prepare("INSERT INTO module_items (module_id, item_type, title, position) VALUES (?, 'sub_header', 'two', 1) RETURNING id").get(a.id);
  const itemRes = await asTeacher("PATCH", `/courses/${courseId}/modules/${a.id}/items/reorder`, { itemIds: [i2.id, i1.id] });
  assert.equal(itemRes.status, 200, JSON.stringify(itemRes.body));
  const items = await db.prepare("SELECT id FROM module_items WHERE module_id = ? ORDER BY position").all(a.id);
  assert.deepEqual(items.map((i) => i.id), [i2.id, i1.id]);
});
