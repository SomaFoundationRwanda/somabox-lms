// Phase 10: the sync outbox replaces login-time Firebase sync.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startTestServer, USERS, PASSWORD } from "./helpers.js";

let ctx;
let db;
let cloud;
let forgetActiveDays;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");
const asAdmin = call("admin");
const STUDENT = encodeURIComponent(USERS.student.email);

/** A fake cloud endpoint that records what it receives; `fail` makes it answer 500. */
async function startCloud() {
  const state = { fail: false, batches: [], records: [] };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      if (state.fail) { res.writeHead(500); return res.end(); }
      const parsed = JSON.parse(body);
      state.batches.push({ auth: req.headers.authorization, boxId: parsed.boxId, count: parsed.records.length });
      state.records.push(...parsed.records);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://127.0.0.1:${server.address().port}/ingest`, state, stop: () => new Promise((r) => server.close(r)) };
}

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
  // Imported only now: server modules must load after the test database is chosen.
  ({ forgetActiveDays } = await import("../src/services/insights/events.js"));
  cloud = await startCloud();
  // Everyone's first request today records their active day: get that done before counting.
  for (const who of ["admin", "teacher", "student"]) await call(who)("GET", "/auth/me");
  await new Promise((r) => setTimeout(r, 200));
});

after(async () => {
  delete process.env.SYNC_URL;
  delete process.env.SYNC_TOKEN;
  await cloud.stop();
  await ctx.stop();
});

beforeEach(() => {
  delete process.env.SYNC_URL;
  cloud.state.fail = false;
  cloud.state.records.length = 0;
  cloud.state.batches.length = 0;
});

async function gradedWork() {
  const courseId = await ctx.createCourse("Sync");
  const o = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Read" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week.id}`, { published: true });
  const a = await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { itemType: "assignment", title: "Essay", pointsPossible: 10, outcomeIds: [o.id] });
  await asStudent("POST", `/courses/${courseId}/assignments/${a.body.content_id}/submit`, { body: "My private essay text" });
  await asTeacher("PATCH", `/courses/${courseId}/assignments/${a.body.content_id}/grade/${STUDENT}`, { grade: 8, feedback: "Nice" });
  return courseId;
}
const pending = async () => Number((await db.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE sent_at IS NULL").get()).n);

test("changes are captured in the outbox by the database, without password hashes", async () => {
  const courseId = await gradedWork();
  const entities = (await db.prepare("SELECT DISTINCT entity FROM sync_outbox WHERE sent_at IS NULL").all()).map((r) => r.entity);
  for (const e of ["courses", "outcomes", "enrollments", "assignment_submissions", "grade_audit_log", "outcome_results"]) {
    assert.ok(entities.includes(e), `${e} changes are captured`);
  }
  const hashes = await db.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE payload->>'password_hash' IS NOT NULL").get();
  assert.equal(Number(hashes.n), 0);
  const course = await db.prepare("SELECT sync_id FROM courses WHERE id = ?").get(courseId);
  assert.match(course.sync_id, /^[0-9a-f-]{36}$/);

  // Logging in doesn't push anything anywhere; it's recorded as one sign-in, nothing more.
  const before = await pending();
  const login = await ctx.api("POST", "/auth/login", { body: { email: USERS.teacher.email, password: PASSWORD } });
  assert.equal(login.status, 200);
  assert.equal(await pending(), before + 1);
  assert.equal((await db.prepare("SELECT entity, payload->>'event_type' AS type FROM sync_outbox ORDER BY id DESC LIMIT 1").get()).type, "signed_in");
});

test("without a cloud configured, records wait on the box", async () => {
  await gradedWork();
  const before = await pending();
  const run = await asAdmin("POST", "/sync/run");
  assert.equal(run.status, 200);
  assert.equal(run.body.status, "not_configured");
  assert.equal(await pending(), before);
  const status = (await asAdmin("GET", "/sync/status")).body;
  assert.deepEqual([status.configured, status.pending, status.runs[0].status], [false, before, "not_configured"]);
  assert.equal(status.scope.people, "pseudonymous");
});

test("a sync sends pseudonymous, append-only records once; nobody's email or essay leaves the box", async () => {
  await gradedWork();
  process.env.SYNC_URL = cloud.url;
  process.env.SYNC_TOKEN = "box-secret";
  const run = await asAdmin("POST", "/sync/run");
  assert.equal(run.body.status, "ok", JSON.stringify(run.body));
  assert.equal(await pending(), 0);
  assert.ok(run.body.sent > 0);
  assert.equal(cloud.state.batches[0].auth, "Bearer box-secret");
  const boxId = (await asAdmin("GET", "/sync/status")).body.boxId;
  assert.equal(cloud.state.batches[0].boxId, boxId);

  const text = JSON.stringify(cloud.state.records);
  for (const u of Object.values(USERS)) assert.ok(!text.includes(u.email), `${u.email} never leaves the box`);
  assert.ok(!text.includes("My private essay text"), "submission text stays on the box by default");
  assert.ok(!text.includes("password_hash"));
  const user = cloud.state.records.find((r) => r.entity === "users" && r.data.role === "scholar");
  for (const k of ["full_name", "email", "phone", "accessibility_profile", "school_name"]) assert.ok(!(k in user.data), `${k} stays on the box`);
  const allowed = ["id", "sync_id", "role", "grade_level", "is_active", "created_at", "learner_code", "gender", "disability_status", "is_rural",
    "region_province", "region_district", "preferred_language", "profile_completed_at", "profile_deferred", "annex_classes",
    "staff_code", "teacher_classes", "teacher_subjects"];
  assert.deepEqual(Object.keys(user.data).filter((k) => !allowed.includes(k)), [], "only pseudonymous fields leave the box");
  for (const k of ["gender", "disability_status", "is_rural", "region_district", "preferred_language"]) assert.ok(k in user.data, `${k} is sent for statistics`);
  const student = await db.prepare("SELECT sync_id FROM users WHERE email = ?").get(USERS.student.email);
  const enrollments = cloud.state.records.filter((r) => r.entity === "enrollments" && r.data.role === "student");
  assert.ok(enrollments.some((e) => e.data.user_person === student.sync_id), "people are referenced by sync_id");
  assert.equal(new Set(cloud.state.records.map((r) => r.syncId)).size, cloud.state.records.length, "every record has its own sync id");

  const again = await asAdmin("POST", "/sync/run");
  assert.equal(again.body.status, "nothing_to_send");
});

test("when the cloud is unreachable, records stay queued and are retried", async () => {
  await gradedWork();
  process.env.SYNC_URL = cloud.url;
  cloud.state.fail = true;
  const before = await pending();
  const failed = await asAdmin("POST", "/sync/run");
  assert.equal(failed.body.status, "failed");
  assert.match(failed.body.message, /stay on the box/);
  assert.equal(await pending(), before);
  const row = await db.prepare("SELECT attempts, last_error FROM sync_outbox WHERE sent_at IS NULL ORDER BY id LIMIT 1").get();
  assert.equal(Number(row.attempts), 1);
  assert.match(row.last_error, /500/);

  cloud.state.fail = false;
  const ok = await asAdmin("POST", "/analytics/me-sync");
  assert.equal(ok.status, 200);
  assert.equal(ok.body.status, "ok");
  assert.equal(await pending(), 0);
});

test("the admin's sync scope decides what leaves the box", async () => {
  process.env.SYNC_URL = cloud.url;
  await asAdmin("POST", "/sync/run"); // clear the backlog
  cloud.state.records.length = 0;

  assert.equal((await asAdmin("PUT", "/sync/settings", { scope: { people: "everyone" } })).status, 400);
  assert.equal((await asAdmin("PUT", "/sync/settings", { scope: { madeUp: true } })).status, 400);
  // The learning record is always sent: those kinds can't be switched off, and results always
  // say whose they are (at least by an anonymous ID).
  for (const key of ["courses", "enrollments", "grades", "outcomeResults", "events"]) {
    const refused = await asAdmin("PUT", "/sync/settings", { scope: { [key]: false } });
    assert.equal(refused.status, 400, key);
  }
  assert.equal((await asAdmin("PUT", "/sync/settings", { scope: { people: "none" } })).status, 400);
  const saved = await asAdmin("PUT", "/sync/settings", { scope: { attendance: false, people: "full", submissionText: true } });
  assert.equal(saved.status, 200);

  const courseId = await gradedWork();
  await asTeacher("POST", `/courses/${courseId}/attendance/sessions`, { date: new Date().toISOString().slice(0, 10) }).catch(() => null);
  await db.prepare("INSERT INTO attendance_sessions (course_id, session_date, created_by) VALUES (?, CURRENT_DATE, ?)").run(courseId, USERS.teacher.email).catch(() => null);
  const run = await asAdmin("POST", "/sync/run");
  assert.equal(run.body.status, "ok");
  assert.ok(!cloud.state.records.some((r) => r.entity.startsWith("attendance")), "attendance stays on the box when switched off");
  const text = JSON.stringify(cloud.state.records);
  assert.ok(text.includes(USERS.student.email), "full people mode sends emails");
  assert.ok(text.includes("My private essay text"));
  await asAdmin("PUT", "/sync/settings", { scope: { attendance: true, people: "pseudonymous", submissionText: false } });
});

test("the learning record always reaches the cloud: lessons, every result, activity and profiles; never files", async () => {
  process.env.SYNC_URL = cloud.url;
  await asAdmin("POST", "/sync/run");
  cloud.state.records.length = 0;

  // A baseline quiz and a graded test, a lesson page, and a learner's work on them.
  const courseId = await ctx.createCourse("Record");
  const o = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Count" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week.id}`, { published: true });
  const quiz = (await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, {
    itemType: "quiz", title: "Test 1", kind: "graded", category: "general_test", outcomeIds: [o.id],
    questions: [{ prompt: "1+1?", options: ["2", "3"], correctOption: "2", outcomeId: o.id }],
  })).body;
  await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { itemType: "page", title: "Lesson", body: "SECRET LESSON BODY" });
  await asStudent("POST", "/analytics/events", { events: [{ type: "course_opened", courseId }] });
  // A new day for the learner.
  await db.prepare("DELETE FROM usage_events WHERE event_type = 'active_day'").run();
  forgetActiveDays();
  await asStudent("GET", "/auth/me");
  await new Promise((r) => setTimeout(r, 100));
  // A learner who answers their gender later: the update follows.
  await db.prepare("UPDATE users SET gender = NULL WHERE email = ?").run(USERS.student.email);
  await asAdmin("POST", "/sync/run");
  await db.prepare("UPDATE users SET gender = 'female' WHERE email = ?").run(USERS.student.email);
  // A retention cleanup on the box isn't a deletion for the cloud.
  await db.prepare("DELETE FROM usage_events WHERE event_type = 'course_opened'").run();

  const run = await asAdmin("POST", "/sync/run");
  assert.equal(run.body.status, "ok", JSON.stringify(run.body));
  const sent = (entity) => cloud.state.records.filter((r) => r.entity === entity);
  const q = sent("quizzes").find((r) => r.data.id === quiz.content_id);
  assert.ok(q, "quizzes are sent");
  assert.deepEqual([q.data.kind, q.data.category], ["graded", "general_test"], "with their kind and type of work");
  assert.ok(!("created_by_teacher_email" in q.data) && q.data.created_by_teacher_person, "their teacher by anonymous ID");
  for (const entity of ["modules", "module_items", "item_outcomes", "course_pages", "outcomes", "enrollments"]) assert.ok(sent(entity).length, `${entity} are sent`);
  const page = sent("course_pages").find((r) => r.data.title === "Lesson");
  assert.ok(page && !("body" in page.data) && !("body_html" in page.data), "lesson pages go without their body");
  assert.ok(!JSON.stringify(cloud.state.records).includes("SECRET LESSON BODY"));
  const events = sent("usage_events").map((r) => r.data.event_type);
  for (const type of ["course_opened", "active_day"]) assert.ok(events.includes(type), `${type} is sent`);
  assert.ok(!sent("usage_events").some((r) => r.op === "delete"), "retention cleanups stay on the box");
  const student = await db.prepare("SELECT sync_id FROM users WHERE email = ?").get(USERS.student.email);
  assert.ok(sent("users").some((r) => r.entitySyncId === student.sync_id && r.data.gender === "female"), "a gender given later is sent");
  for (const entity of ["course_files", "page_file_references", "books", "cloud_content", "content_items"]) assert.equal(sent(entity).length, 0, `${entity} never leave the box`);
});

test("signing in is recorded, once per sign-in, with one active day per person per day", async () => {
  const before = Number((await db.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE event_type = 'signed_in'").get()).n);
  const login = await ctx.api("POST", "/auth/login", { body: { email: USERS.student.email, password: PASSWORD } });
  assert.equal(login.status, 200);
  const after = Number((await db.prepare("SELECT COUNT(*) AS n FROM usage_events WHERE event_type = 'signed_in'").get()).n);
  assert.equal(after, before + 1);
  for (let i = 0; i < 3; i++) await ctx.api("GET", "/auth/me", { token: login.body.token });
  const user = await db.prepare("SELECT id FROM users WHERE email = ?").get(USERS.student.email);
  const days = await db.prepare("SELECT data->>'day' AS day, COUNT(*) AS n FROM usage_events WHERE event_type = 'active_day' AND user_id = ? GROUP BY 1").all(user.id);
  assert.ok(days.length >= 1);
  assert.ok(days.every((d) => Number(d.n) === 1), "one active day per day");
});

test("only admins control sync", async () => {
  assert.equal((await asTeacher("GET", "/sync/status")).status, 403);
  assert.equal((await asTeacher("POST", "/sync/run")).status, 403);
  assert.equal((await asStudent("PUT", "/sync/settings", { scope: {} })).status, 403);
});
