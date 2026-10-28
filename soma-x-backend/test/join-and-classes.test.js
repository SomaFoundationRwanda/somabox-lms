// Join requests (the join code), learners' classes (own and annex), suggestions of a class's
// learners, the class asked at sign-up, week dates, and the preliminary test type.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { addDays, todayIn } from "@somabox/timeline";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asOutsider = call("outsider");

before(async () => {
  ctx = await startTestServer();
});

after(async () => {
  await ctx.stop();
});

const userRow = (email) => ctx.db.prepare("SELECT grade_level, annex_classes FROM users WHERE LOWER(email) = LOWER(?)").get(email);

test("joining with the code waits for the teacher, who approves into the course's class", async () => {
  const courseId = await ctx.createCourse("S1B English");
  await asTeacher("PATCH", `/courses/${courseId}`, { grade: "S1B" });
  await ctx.db.prepare("UPDATE users SET grade_level = NULL, annex_classes = '[]' WHERE LOWER(email) = LOWER(?)").run(USERS.outsider.email);
  const code = (await asTeacher("POST", `/courses/${courseId}/join-code`, { action: "on" })).body.code;

  const asked = await asOutsider("POST", "/courses/join-by-code", { code });
  assert.equal(asked.body.status, "pending");
  const waiting = await asOutsider("GET", `/courses/${courseId}`);
  assert.equal(waiting.status, 403);
  assert.equal(waiting.body.code, "PENDING");
  assert.equal((await asOutsider("GET", `/courses/${courseId}/modules`)).status, 403, "no access before approval");
  assert.equal((await asOutsider("POST", "/courses/join-by-code", { code })).body.status, "pending", "asking again changes nothing");

  const teacherNotes = (await asTeacher("GET", "/notifications")).body.notifications;
  assert.ok(teacherNotes.some((n) => n.text_key === "joinRequest"), "the teacher hears about it");
  const request = (await asTeacher("GET", `/courses/${courseId}/people`)).body.find((p) => p.status === "pending");
  assert.ok(request);
  assert.equal((await asOutsider("POST", `/courses/${courseId}/people/${request.id}/request`, { approve: true })).status, 403);
  assert.equal((await asTeacher("POST", `/courses/${courseId}/people/${request.id}/request`, { approve: true })).status, 200);
  assert.equal((await asOutsider("GET", `/courses/${courseId}`)).status, 200);
  assert.equal((await userRow(USERS.outsider.email)).grade_level, "S1B", "a learner without a class gets the course's");

  // Another class's course: S2A becomes an annex class, S1B stays theirs.
  const other = await ctx.createCourse("S2A Maths");
  await asTeacher("PATCH", `/courses/${other}`, { grade: "S2A" });
  await asTeacher("POST", `/courses/${other}/people`, { email: USERS.outsider.email, role: "student" });
  const after2 = await userRow(USERS.outsider.email);
  assert.equal(after2.grade_level, "S1B");
  assert.deepEqual(after2.annex_classes, ["S2A"]);
  const there = (await asTeacher("GET", `/courses/${other}/people`)).body.find((p) => p.role === "student" && p.status === "active" && p.className === "S1B");
  assert.ok(there?.canResetPassword, "the S2A teacher may reset it: S2A is one of the learner's classes");

  // Declining drops the request.
  const third = await ctx.createCourse("S1B Physics");
  const code3 = (await asTeacher("POST", `/courses/${third}/join-code`, { action: "on" })).body.code;
  await asOutsider("POST", "/courses/join-by-code", { code: code3 });
  const req3 = (await asTeacher("GET", `/courses/${third}/people`)).body.find((p) => p.status === "pending");
  await asTeacher("POST", `/courses/${third}/people/${req3.id}/request`, { approve: false });
  assert.equal((await asOutsider("GET", `/courses/${third}`)).body.code, "NOT_ENROLLED");
});

test("teachers see the learners of the course's class and level to add", async () => {
  const courseId = await ctx.createCourse("P4A Science");
  await asTeacher("PATCH", `/courses/${courseId}`, { grade: "P4A" });
  const made = (await asTeacher("POST", `/courses/${await ctx.createCourse("Other")}/learners`, { names: ["Ana P4A", "Ben P4B", "Cy P6"], grade: "P4A" })).body.created;
  await ctx.db.prepare("UPDATE users SET grade_level = 'P4B' WHERE learner_code = ?").run(made[1].learnerCode);
  await ctx.db.prepare("UPDATE users SET grade_level = 'P6' WHERE learner_code = ?").run(made[2].learnerCode);
  const s = (await asTeacher("GET", `/courses/${courseId}/learner-suggestions`)).body;
  assert.deepEqual(s.sameClass.map((l) => l.fullName), ["Ana P4A"]);
  assert.deepEqual(s.sameLevel.map((l) => l.fullName), ["Ben P4B"]);
  assert.equal((await asOutsider("GET", `/courses/${courseId}/learner-suggestions`)).status, 403);
});

test("signing up asks for the class first; the school's classes are listed", async () => {
  const none = await ctx.api("POST", "/auth/register", { body: { email: "noclass@test.local", password: "secret123", fullName: "No Class" } });
  assert.equal(none.status, 400);
  assert.equal(none.body.code, "CLASS_REQUIRED");
  const ok = await ctx.api("POST", "/auth/register", { body: { email: "withclass@test.local", password: "secret123", fullName: "With Class", className: " S1  B " } });
  assert.equal(ok.status, 201);
  assert.equal((await userRow("withclass@test.local")).grade_level, "S1 B");
  const classes = await ctx.api("GET", "/auth/classes");
  assert.equal(classes.status, 200);
  assert.ok(Array.isArray(classes.body));
});

test("a week moves by its start date; Week 1 and dates before the start are refused", async () => {
  const courseId = await ctx.createCourse("Dated");
  const start = todayIn("Africa/Kigali");
  await asTeacher("PATCH", `/courses/${courseId}`, { startDate: start });
  const w1 = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "One" })).body;
  const w2 = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Two" })).body;
  const first = await asTeacher("PATCH", `/courses/${courseId}/modules/${w1.id}`, { startDate: addDays(start, 3) });
  assert.equal(first.status, 409);
  assert.equal(first.body.code, "FIRST_WEEK");
  assert.equal((await asTeacher("PATCH", `/courses/${courseId}/modules/${w2.id}`, { startDate: addDays(start, -2) })).body.code, "BEFORE_START");
  const moved = await asTeacher("PATCH", `/courses/${courseId}/modules/${w2.id}`, { startDate: addDays(start, 23) });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.deepEqual([moved.body.week_offset, moved.body.day_offset], [4, 2]);
  const order = (await asTeacher("GET", `/courses/${courseId}/modules`)).body.filter((m) => m.kind === "regular").map((m) => m.title);
  assert.deepEqual(order, ["One", "Two"], "weeks come in date order");
});

test("preliminary tests are a type of graded work", async () => {
  const courseId = await ctx.createCourse("Prelim");
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "W" })).body;
  const res = await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { itemType: "assignment", title: "Start test", category: "preliminary_test" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
});
