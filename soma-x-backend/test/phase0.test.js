// Phase 0 regression tests: no fabricated metrics, auth on read endpoints,
// draft course lifecycle with a real opening gate, and AI stub output kept as drafts.
//
// Runs against a throwaway PostgreSQL database created for this run and dropped after.
// Connection settings come from the usual PG* environment variables.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const TEST_DB = `somabox_test_${process.pid}_${Date.now()}`;
const host = process.env.PGHOST || "localhost";
const port = process.env.PGPORT || "5432";
const user = process.env.PGUSER || process.env.USER || "postgres";
const password = process.env.PGPASSWORD || "";

function adminClient() {
  return new pg.Client({ host, port: Number(port), user, password, database: "postgres" });
}

const TEACHER = "teacher@test.local";
const STUDENT = "student@test.local";
const OUTSIDER = "outsider@test.local";

let server;
let baseUrl;
let pool;
let db;

async function api(method, path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, body: json };
}

async function createCourse(title = "Algebra") {
  const res = await api("POST", "/courses", { title, teacherEmail: TEACHER });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const courseId = res.body.id;
  await db.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'student', 'active')").run(courseId, STUDENT);
  return courseId;
}

before(async () => {
  const admin = adminClient();
  await admin.connect();
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  // Must be set before db-manager is imported; dotenv does not override existing vars.
  const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
  process.env.DATABASE_URL = `postgresql://${auth}@${host}:${port}/${TEST_DB}`;
  process.env.PGMAXCONNECTIONS = "5";
  delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

  const dbManager = await import("../src/helpers/db-manager.js");
  pool = dbManager.pool;
  db = dbManager.localDb;
  await dbManager.initSchemas();

  const express = (await import("express")).default;
  const courses = (await import("../src/services/courses.services.js")).default;
  const analytics = (await import("../src/services/analytics.services.js")).default;
  const authRoutes = (await import("../src/services/auth.services.js")).default;
  const users = (await import("../src/services/users.service.js")).default;

  const app = express();
  app.use(express.json());
  app.use("/courses", courses);
  app.use("/analytics", analytics);
  app.use("/auth", authRoutes);
  app.use("/users", users);

  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (pool) await pool.end();
  const admin = adminClient();
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.end();
});

// ---------- P0-1: no fabricated metrics on an empty database ----------

test("growth-curves returns an empty list on an empty database", async () => {
  const res = await api("GET", "/analytics/growth-curves");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test("inclusivity-gap reports null averages when there is no progress data", async () => {
  const res = await api("GET", "/analytics/inclusivity-gap");
  assert.equal(res.status, 200);
  assert.equal(res.body.totalScholars, 0);
  assert.equal(res.body.scholarsWithData, 0);
  assert.equal(res.body.ruralVsUrban.ruralAverage, null);
  assert.equal(res.body.ruralVsUrban.urbanAverage, null);
  assert.equal(res.body.ruralVsUrban.gapPercentage, null);
  for (const value of Object.values(res.body.genderBreakdown)) assert.equal(value, null);
  assert.equal(res.body.accessibilityMetrics.scholarsWithAccessibilityNeeds, 0);
  assert.equal(res.body.accessibilityMetrics.averagePerformance, null);
});

test("sol-outcomes reports zero or null counts when nothing was recorded", async () => {
  const res = await api("GET", "/analytics/sol-outcomes");
  assert.equal(res.status, 200);
  assert.equal(res.body.activeTrackedOutcomes, 0);
  for (const p of res.body.principles) assert.ok(p.count === 0 || p.count === null, `${p.name}: ${p.count}`);
});

test("outcome-mastery returns null baseline and mastery when nothing was assessed", async () => {
  const courseId = await createCourse();
  await db.prepare("INSERT INTO outcomes (course_id, title) VALUES (?, 'Solve linear equations')").run(courseId);

  for (const email of [TEACHER, STUDENT]) {
    const res = await api("GET", `/courses/${courseId}/outcome-mastery?userEmail=${encodeURIComponent(email)}`);
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
  const outcome = await db.prepare("INSERT INTO outcomes (course_id, title) VALUES (?, 'Graphing') RETURNING id").get(courseId);
  const assignment = await db.prepare("INSERT INTO assignments (course_id, title, points_possible, published) VALUES (?, 'HW', 50, 1) RETURNING id").get(courseId);
  await db.prepare("INSERT INTO item_outcomes (course_id, item_type, item_id, outcome_id) VALUES (?, 'assignment', ?, ?)").run(courseId, assignment.id, outcome.id);
  await db.prepare("INSERT INTO assignment_submissions (assignment_id, scholar_email, grade) VALUES (?, ?, 40)").run(assignment.id, STUDENT);

  const res = await api("GET", `/courses/${courseId}/outcome-mastery?userEmail=${encodeURIComponent(STUDENT)}`);
  assert.equal(res.status, 200);
  const [o] = res.body.outcomes;
  assert.equal(o.currentMastery, 80);
  assert.equal(o.baselineScore, null);
  assert.equal(o.delta, null);
});

test("baseline/submit never invents scores", async () => {
  const courseId = await createCourse();
  const outcome = await db.prepare("INSERT INTO outcomes (course_id, title) VALUES (?, 'Fractions') RETURNING id").get(courseId);

  const empty = await api("POST", `/courses/${courseId}/baseline/submit`, { userEmail: STUDENT, answers: {} });
  assert.equal(empty.status, 400);
  const invalid = await api("POST", `/courses/${courseId}/baseline/submit`, { userEmail: STUDENT, answers: { [outcome.id]: 150 } });
  assert.equal(invalid.status, 400);

  const rows = await db.prepare("SELECT * FROM student_outcome_baselines WHERE course_id = ?").all(courseId);
  assert.equal(rows.length, 0);

  const ok = await api("POST", `/courses/${courseId}/baseline/submit`, { userEmail: STUDENT, answers: { [outcome.id]: 45 } });
  assert.equal(ok.status, 200);
  const stored = await db.prepare("SELECT baseline_score FROM student_outcome_baselines WHERE course_id = ?").all(courseId);
  assert.equal(stored.length, 1);
  assert.equal(Number(stored[0].baseline_score), 45);
});

// ---------- P0-3: read endpoints require enrollment ----------

test("course read endpoints reject anonymous and non-enrolled callers", async () => {
  const courseId = await createCourse();
  for (const path of ["home-loop", "setup-status", "baseline", "item-outcomes"]) {
    const anon = await api("GET", `/courses/${courseId}/${path}`);
    assert.equal(anon.status, 400, `${path} anonymous`);
    const outsider = await api("GET", `/courses/${courseId}/${path}?userEmail=${encodeURIComponent(OUTSIDER)}`);
    assert.equal(outsider.status, 403, `${path} outsider`);
    const student = await api("GET", `/courses/${courseId}/${path}?userEmail=${encodeURIComponent(STUDENT)}`);
    assert.equal(student.status, 200, `${path} student`);
  }
});

test("home-loop hides class-wide attention items from students", async () => {
  const courseId = await createCourse();
  const mod = await db.prepare("INSERT INTO modules (course_id, title) VALUES (?, 'Week 1') RETURNING id").get(courseId);
  const assignment = await db.prepare("INSERT INTO assignments (course_id, title) VALUES (?, 'Untagged') RETURNING id").get(courseId);
  await db.prepare("INSERT INTO module_items (module_id, item_type, item_ref_id, content_ref_table, content_ref_id, title, position) VALUES (?, 'assignment', ?, 'assignments', ?, 'Untagged', 0)").run(mod.id, assignment.id, assignment.id);

  const teacher = await api("GET", `/courses/${courseId}/home-loop?userEmail=${encodeURIComponent(TEACHER)}`);
  assert.equal(teacher.status, 200);
  assert.equal(teacher.body.needsAttention.length, 1);

  const student = await api("GET", `/courses/${courseId}/home-loop?userEmail=${encodeURIComponent(STUDENT)}`);
  assert.equal(student.status, 200);
  assert.equal(student.body.needsAttention.length, 0);
});

// ---------- P0-6: new courses are drafts and the opening gate is real ----------

test("a new course starts unopened and cannot open with missing requirements", async () => {
  const courseId = await createCourse();
  const status = await api("GET", `/courses/${courseId}/setup-status?userEmail=${encodeURIComponent(TEACHER)}`);
  assert.equal(status.status, 200);
  assert.equal(status.body.isOpened, false);
  assert.equal(status.body.canOpen, false);
  assert.ok(status.body.missingRequirements.length > 0);

  const open = await api("POST", `/courses/${courseId}/open-course`, { teacherEmail: TEACHER });
  assert.equal(open.status, 400);

  const patch = await api("PATCH", `/courses/${courseId}`, { teacherEmail: TEACHER, status: "active" });
  assert.equal(patch.status, 400);

  const course = await db.prepare("SELECT status, is_opened FROM courses WHERE id = ?").get(courseId);
  assert.equal(course.status, "unpublished");
  assert.equal(Number(course.is_opened), 0);
});

test("a course with outcomes, a module, and an item can open", async () => {
  const courseId = await createCourse();
  await db.prepare("INSERT INTO outcomes (course_id, title) VALUES (?, 'O1')").run(courseId);
  const mod = await db.prepare("INSERT INTO modules (course_id, title) VALUES (?, 'Week 1') RETURNING id").get(courseId);
  await db.prepare("INSERT INTO module_items (module_id, item_type, title, position) VALUES (?, 'sub_header', 'Intro', 0)").run(mod.id);

  const open = await api("POST", `/courses/${courseId}/open-course`, { teacherEmail: TEACHER });
  assert.equal(open.status, 200, JSON.stringify(open.body));
  const status = await api("GET", `/courses/${courseId}/setup-status?userEmail=${encodeURIComponent(TEACHER)}`);
  assert.equal(status.body.isOpened, true);
});

test("open-course requires the teacher role", async () => {
  const courseId = await createCourse();
  const res = await api("POST", `/courses/${courseId}/open-course`, { teacherEmail: STUDENT });
  assert.equal(res.status, 403);
});

// ---------- P0-5: AI stub output is unpublished and linked correctly ----------

test("fill-module creates unpublished items readable through content_ref_id", async () => {
  const courseId = await createCourse();
  const mod = await db.prepare("INSERT INTO modules (course_id, title) VALUES (?, 'Week 1') RETURNING id").get(courseId);

  const res = await api("POST", `/courses/${courseId}/ai/fill-module`, { teacherEmail: TEACHER, moduleId: mod.id });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const items = await db.prepare("SELECT * FROM module_items WHERE module_id = ?").all(mod.id);
  assert.equal(items.length, 3);
  for (const item of items) {
    assert.equal(Number(item.published), 0, `${item.item_type} module item published`);
    assert.ok(item.content_ref_id, `${item.item_type} missing content_ref_id`);
    assert.ok(item.content_ref_table, `${item.item_type} missing content_ref_table`);
    const content = await db.prepare(`SELECT published FROM ${item.content_ref_table} WHERE id = ?`).get(item.content_ref_id);
    assert.equal(Number(content.published), 0, `${item.item_type} content published`);
  }
});

test("generate-story creates unpublished, escaped content in the course's own module", async () => {
  const courseId = await createCourse();
  const otherCourseId = await createCourse("Other");
  const mod = await db.prepare("INSERT INTO modules (course_id, title) VALUES (?, 'Week 1') RETURNING id").get(courseId);
  const foreignMod = await db.prepare("INSERT INTO modules (course_id, title) VALUES (?, 'Foreign') RETURNING id").get(otherCourseId);

  const foreign = await api("POST", `/courses/${courseId}/ai/generate-story`, { teacherEmail: TEACHER, moduleId: foreignMod.id, idea: "x" });
  assert.equal(foreign.status, 404);

  const res = await api("POST", `/courses/${courseId}/ai/generate-story`, { teacherEmail: TEACHER, moduleId: mod.id, idea: "<script>alert(1)</script>" });
  assert.equal(res.status, 200, JSON.stringify(res.body));

  const page = await db.prepare("SELECT body, published FROM course_pages WHERE id = ?").get(res.body.pageId);
  assert.equal(Number(page.published), 0);
  assert.ok(!page.body.includes("<script>"));
  assert.ok(!page.body.includes("className"));

  const items = await db.prepare("SELECT published, content_ref_id FROM module_items WHERE module_id = ?").all(mod.id);
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.equal(Number(item.published), 0);
    assert.ok(item.content_ref_id);
  }
});

// ---------- P0-4: default admin must change password ----------

test("default admin is flagged to change password until it does", async () => {
  const login = await api("POST", "/auth/login", { email: "admin@mail.com", password: "admin" });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.must_change_password, true);

  const same = await api("PATCH", "/users/profile/password", {
    currentEmail: "admin@mail.com", currentRole: "admin", currentPassword: "admin", newPassword: "admin",
  });
  assert.equal(same.status, 400);

  const change = await api("PATCH", "/users/profile/password", {
    currentEmail: "admin@mail.com", currentRole: "admin", currentPassword: "admin", newPassword: "a-new-password",
  });
  assert.equal(change.status, 200);

  const relogin = await api("POST", "/auth/login", { email: "admin@mail.com", password: "a-new-password" });
  assert.equal(relogin.status, 200);
  assert.equal(relogin.body.user.must_change_password, false);
});

// ---------- Counts and positions read the awaited row, not a Promise ----------

test("new modules get increasing positions", async () => {
  const courseId = await createCourse();
  const first = await api("POST", `/courses/${courseId}/modules`, { teacherEmail: TEACHER, title: "Week 1" });
  const second = await api("POST", `/courses/${courseId}/modules`, { teacherEmail: TEACHER, title: "Week 2" });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(second.status, 201, JSON.stringify(second.body));
  const rows = await db.prepare("SELECT title, position FROM modules WHERE course_id = ? ORDER BY id").all(courseId);
  assert.deepEqual(rows.map((r) => Number(r.position)), [0, 1]);
});
