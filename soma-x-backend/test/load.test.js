// Phase 11: many learners on one box at once, double-submits, and a large sync backlog.
// The test pool is deliberately small (PGMAXCONNECTIONS=5) so contention shows up here first.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcrypt";
import { startTestServer, PASSWORD } from "./helpers.js";

let ctx;
let db;
const LEARNERS = 40;
const learners = [];

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
  const hash = await bcrypt.hash(PASSWORD, 4);
  for (let i = 0; i < LEARNERS; i++) {
    const email = `load${i}@test.local`;
    await db.prepare("INSERT INTO users (email, full_name, password_hash, role) VALUES (?, ?, ?, 'scholar')").run(email, `Learner ${i}`, hash);
    learners.push({ email, token: await ctx.login(email) });
  }
});

after(async () => {
  delete process.env.SYNC_URL;
  await ctx.stop();
});

const asTeacher = (method, path, body) => ctx.api(method, path, { token: ctx.tokens.teacher, body });

async function classroom() {
  const courseId = await ctx.createCourse("Busy class");
  for (const l of learners) {
    await db.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'student', 'active')").run(courseId, l.email);
  }
  const o = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Add" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week.id}`, { published: true });
  const add = (body) => asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { outcomeIds: [o.id], ...body });
  const assignment = (await add({ itemType: "assignment", title: "Essay" })).body.content_id;
  const quiz = (await add({ itemType: "quiz", title: "Check", questions: [{ prompt: "2+2", options: ["4", "5"], correctOption: "4", outcomeId: o.id }] })).body.content_id;
  const limited = (await add({ itemType: "quiz", title: "Two tries", attemptsAllowed: 2, questions: [{ prompt: "3+3", options: ["6", "7"], correctOption: "6" }] })).body.content_id;
  const [question] = await db.prepare("SELECT id FROM quiz_questions WHERE quiz_id = ?").all(quiz);
  const [limitedQuestion] = await db.prepare("SELECT id FROM quiz_questions WHERE quiz_id = ?").all(limited);
  return { courseId, assignment, quiz, limited, question: question.id, limitedQuestion: limitedQuestion.id };
}

test(`${LEARNERS} learners hand in work and take a quiz at the same moment`, async () => {
  const c = await classroom();
  const started = Date.now();
  const results = await Promise.all(learners.flatMap((l, i) => [
    ctx.api("POST", `/courses/${c.courseId}/assignments/${c.assignment}/submit`, { token: l.token, body: { body: `essay ${i}` } }),
    ctx.api("POST", `/courses/${c.courseId}/quizzes/${c.quiz}/submit`, { token: l.token, body: { answers: { [c.question]: i % 2 ? "4" : "5" } } }),
  ]));
  const elapsed = Date.now() - started;
  const statuses = results.map((r) => r.status);
  assert.deepEqual([...new Set(statuses)], [201], `every request succeeded: ${JSON.stringify(results.find((r) => r.status !== 201)?.body)}`);
  const subs = await db.prepare("SELECT COUNT(*) AS n FROM assignment_submissions WHERE assignment_id = ?").get(c.assignment);
  const attempts = await db.prepare("SELECT COUNT(*) AS n FROM quiz_attempts WHERE quiz_id = ?").get(c.quiz);
  const results2 = await db.prepare("SELECT COUNT(*) AS n FROM outcome_results WHERE course_id = ? AND source_type = 'quiz_attempt'").get(c.courseId);
  assert.deepEqual([Number(subs.n), Number(attempts.n), Number(results2.n)], [LEARNERS, LEARNERS, LEARNERS]);
  const insights = await asTeacher("GET", `/courses/${c.courseId}/insights`);
  assert.equal(insights.body.class.learners, LEARNERS + 1, "plus the course's default learner");
  assert.equal(insights.body.outcomes[0].currentMastery, 50, "half answered correctly");
  // Not a benchmark; a guard against something pathological (e.g. a lock held across requests).
  assert.ok(elapsed < 20000, `${LEARNERS * 2} submissions took ${elapsed} ms`);
});

test("a double-tapped quiz submit can't race past the attempt limit or crash", async () => {
  const c = await classroom();
  const l = learners[0];
  const results = await Promise.all(Array.from({ length: 6 }, () =>
    ctx.api("POST", `/courses/${c.courseId}/quizzes/${c.limited}/submit`, { token: l.token, body: { answers: { [c.limitedQuestion]: "6" } } })));
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [201, 201, 409, 409, 409, 409]);
  const numbers = (await db.prepare("SELECT attempt_number FROM quiz_attempts WHERE quiz_id = ? ORDER BY attempt_number").all(c.limited)).map((r) => r.attempt_number);
  assert.deepEqual(numbers, [1, 2]);
});

test("a large sync backlog goes out exactly once, even with overlapping runs", async () => {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => { body += d; });
    req.on("end", () => {
      received.push(...JSON.parse(body).records.map((r) => r.syncId));
      res.writeHead(200);
      res.end("{}");
    });
  });
  await new Promise((r) => server.listen(0, r));
  process.env.SYNC_URL = `http://127.0.0.1:${server.address().port}/`;
  try {
    const { pushOutbox } = await import("../src/services/sync/outbox.js");
    await pushOutbox(); // whatever the earlier tests queued
    received.length = 0;
    await db.prepare(`
      INSERT INTO usage_events (event_type, data) SELECT 'course_opened', jsonb_build_object('n', g) FROM generate_series(1, 3000) g
    `).run();
    const runs = await Promise.all([pushOutbox(), pushOutbox(), pushOutbox()]);
    const busy = runs.filter((r) => r.status === "busy").length;
    assert.equal(busy, 2, "only one run at a time");
    const ok = runs.find((r) => r.status === "ok");
    assert.equal(ok.sent, 3000);
    assert.equal(ok.pending, 0);
    assert.equal(received.length, 3000);
    assert.equal(new Set(received).size, 3000, "no record sent twice");
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("deleting is guarded: a course with learners' work is archived instead; deletes clean up files", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const { config } = await import("../src/config/index.js");
  const c = await classroom();
  await ctx.api("POST", `/courses/${c.courseId}/quizzes/${c.quiz}/submit`, { token: learners[0].token, body: { answers: {} } });
  const refused = await asTeacher("DELETE", `/courses/${c.courseId}`);
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "HAS_LEARNER_WORK");
  // Archive: the learner no longer sees it in their list.
  assert.equal((await asTeacher("PATCH", `/courses/${c.courseId}`, { lifecycle: "archived" })).status, 200);
  const mine = await ctx.api("GET", "/courses/mine", { token: learners[0].token });
  assert.ok(!mine.body.some((x) => x.id === c.courseId));
  // An admin can still force it; the course's upload folder goes with it.
  const dir = path.join(config.paths.courseFiles, c.courseId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "sheet.txt"), "x");
  assert.equal((await ctx.api("DELETE", `/courses/${c.courseId}?force=true`, { token: ctx.tokens.admin })).status, 204);
  assert.ok(!fs.existsSync(dir), "uploaded files are removed with the course");
});

test("server errors show a plain message with a reference, never database text; /health answers", async () => {
  const c = await classroom();
  const broken = await asTeacher("GET", `/courses/${c.courseId}/insights/quizzes/not-a-number`);
  assert.equal(broken.status, 500);
  assert.match(broken.body.message, /Something went wrong on the server.*reference [0-9A-F]{6}/);
  assert.ok(!/syntax|integer|SELECT/i.test(broken.body.message));
  const health = await ctx.api("GET", "/health");
  assert.equal(health.status, 200);
  assert.equal(health.body.database, "ok");
  assert.ok(health.body.migrations >= 16);
  assert.equal(health.body.email, undefined);
});
