// Phase 10: the sync outbox replaces login-time Firebase sync.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { startTestServer, USERS, PASSWORD } from "./helpers.js";

let ctx;
let db;
let cloud;
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
  cloud = await startCloud();
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

  // Logging in no longer pushes anything anywhere, and doesn't create sync work.
  const before = await pending();
  const login = await ctx.api("POST", "/auth/login", { body: { email: USERS.teacher.email, password: PASSWORD } });
  assert.equal(login.status, 200);
  assert.equal(await pending(), before);
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
  const user = cloud.state.records.find((r) => r.entity === "users");
  assert.deepEqual(Object.keys(user.data).sort(), ["created_at", "grade_level", "id", "is_active", "role", "sync_id"].filter((k) => k in user.data).sort());
  const enrollment = cloud.state.records.find((r) => r.entity === "enrollments" && r.data.role === "student");
  const student = await db.prepare("SELECT sync_id FROM users WHERE email = ?").get(USERS.student.email);
  assert.equal(enrollment.data.user_person, student.sync_id, "people are referenced by sync_id");
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
  const saved = await asAdmin("PUT", "/sync/settings", { scope: { events: false, people: "full", submissionText: true } });
  assert.equal(saved.status, 200);

  await gradedWork();
  await asTeacher("POST", "/analytics/events", { events: [{ type: "course_opened" }] });
  const run = await asAdmin("POST", "/sync/run");
  assert.equal(run.body.status, "ok");
  assert.ok(run.body.skipped >= 1, "usage events were kept on the box");
  assert.ok(!cloud.state.records.some((r) => r.entity === "usage_events"));
  const text = JSON.stringify(cloud.state.records);
  assert.ok(text.includes(USERS.student.email), "full people mode sends emails");
  assert.ok(text.includes("My private essay text"));
  await asAdmin("PUT", "/sync/settings", { scope: { events: true, people: "pseudonymous", submissionText: false } });
});

test("only admins control sync", async () => {
  assert.equal((await asTeacher("GET", "/sync/status")).status, 403);
  assert.equal((await asTeacher("POST", "/sync/run")).status, 403);
  assert.equal((await asStudent("PUT", "/sync/settings", { scope: {} })).status, 403);
});
