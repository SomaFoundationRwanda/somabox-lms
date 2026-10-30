// Attendance: registers per session, learners' own view, rates and flags in Insights.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { addDays, todayIn } from "@somabox/timeline";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
let db;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");
const asAdmin = call("admin");
const today = todayIn("Africa/Kigali");

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
});

after(async () => {
  await ctx.stop();
});

const studentId = async () => Number((await db.prepare("SELECT id FROM users WHERE email = ?").get(USERS.student.email)).id);

async function register(courseId, date, status, title) {
  const s = await asTeacher("POST", `/courses/${courseId}/attendance/sessions`, { date, ...(title ? { title } : {}) });
  assert.equal(s.status, 201, JSON.stringify(s.body));
  const saved = await asTeacher("PUT", `/courses/${courseId}/attendance/sessions/${s.body.id}`, { records: [{ userId: await studentId(), status }] });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  return s.body;
}

test("a teacher takes the register; the roster lists the class; marks can change or be cleared", async () => {
  const courseId = await ctx.createCourse("Attendance");
  const created = await asTeacher("POST", `/courses/${courseId}/attendance/sessions`, { date: today });
  assert.equal(created.status, 201);
  assert.deepEqual([created.body.date, created.body.title], [today, "Class"]);
  assert.equal((await asTeacher("POST", `/courses/${courseId}/attendance/sessions`, { date: today })).status, 409, "one 'Class' register per day");
  assert.equal((await asTeacher("POST", `/courses/${courseId}/attendance/sessions`, { date: today, title: "Afternoon" })).status, 201);
  assert.equal((await asTeacher("POST", `/courses/${courseId}/attendance/sessions`, { date: addDays(today, 1) })).status, 400, "not in the future");

  const roster = (await asTeacher("GET", `/courses/${courseId}/attendance/sessions/${created.body.id}`)).body.roster;
  assert.deepEqual(roster.map((r) => [r.name, r.status]), [[USERS.student.email, null]]);

  const id = await studentId();
  const url = `/courses/${courseId}/attendance/sessions/${created.body.id}`;
  assert.equal((await asTeacher("PUT", url, { records: [{ userId: id, status: "sick" }] })).status, 400);
  const outsider = Number((await db.prepare("SELECT id FROM users WHERE email = ?").get(USERS.outsider.email)).id);
  assert.equal((await asTeacher("PUT", url, { records: [{ userId: outsider, status: "present" }] })).status, 400, "only this course's learners");
  await asTeacher("PUT", url, { records: [{ userId: id, status: "late", note: "Bus" }] });
  let after = (await asTeacher("GET", url)).body.roster[0];
  assert.deepEqual([after.status, after.note, after.markedBy], ["late", "Bus", USERS.teacher.email]);
  await asTeacher("PUT", url, { records: [{ userId: id, status: null }] });
  after = (await asTeacher("GET", url)).body.roster[0];
  assert.equal(after.status, null);

  // Learners and other teachers can't take or read the register; admins can read but not mark.
  assert.equal((await asStudent("GET", `/courses/${courseId}/attendance`)).status, 403);
  assert.equal((await asStudent("PUT", url, { records: [{ userId: id, status: "present" }] })).status, 403);
  assert.equal((await call("otherTeacher")("GET", `/courses/${courseId}/attendance`)).status, 403);
  assert.equal((await asAdmin("GET", `/courses/${courseId}/attendance`)).status, 200);
  assert.equal((await asAdmin("PUT", url, { records: [{ userId: id, status: "present" }] })).status, 403);
});

test("rates: present and late attend, excused doesn't count, unmarked isn't invented; flags reach Insights", async () => {
  const courseId = await ctx.createCourse("Attendance rates");
  await asTeacher("PATCH", `/courses/${courseId}`, { startDate: addDays(today, -10) });
  await register(courseId, addDays(today, -6), "present");
  await register(courseId, addDays(today, -5), "late");
  await register(courseId, addDays(today, -4), "excused");
  await register(courseId, addDays(today, -3), "absent");
  await register(courseId, addDays(today, -2), "absent");
  await register(courseId, addDays(today, -1), "absent");
  await asTeacher("POST", `/courses/${courseId}/attendance/sessions`, { date: today }); // nobody marked yet

  const list = (await asTeacher("GET", `/courses/${courseId}/attendance`)).body;
  assert.equal(list.sessions.length, 7);
  assert.equal(list.sessions[0].unmarked, 1);
  const me = list.learners[0];
  assert.deepEqual([me.present, me.late, me.absent, me.excused, me.counted, me.rate, me.consecutiveAbsences], [1, 1, 3, 1, 5, 0.4, 3]);

  const insights = (await asTeacher("GET", `/courses/${courseId}/insights`)).body;
  const learner = insights.learners[0];
  assert.ok(learner.risk.reasons.some((r) => r.code === "absent_in_a_row" && /last 3 sessions/.test(r.message)));
  assert.equal(insights.class.attendanceRate, 40);

  const own = await asStudent("GET", `/courses/${courseId}/attendance/me`);
  assert.equal(own.status, 200);
  assert.equal(own.body.summary.rate, 0.4);
  assert.equal(own.body.sessions[0].status, null, "today's session isn't marked yet");
  const progress = (await asStudent("GET", `/courses/${courseId}/my-progress`)).body;
  assert.equal(progress.attendance.rate, 0.4);
  assert.equal(progress.risk, undefined);
});

test("a new course has no attendance figures; nav shows Attendance to learners; records sync and export", async () => {
  const courseId = await ctx.createCourse("Empty attendance");
  const list = (await asTeacher("GET", `/courses/${courseId}/attendance`)).body;
  assert.deepEqual([list.sessions.length, list.learners[0].rate, list.learners[0].counted], [0, null, 0]);
  const insights = (await asTeacher("GET", `/courses/${courseId}/insights`)).body;
  assert.equal(insights.class.attendanceRate, null);
  const nav = await db.prepare("SELECT visible_to_students FROM course_nav_items WHERE course_id = ? AND nav_key = 'attendance'").get(courseId);
  assert.equal(Number(nav.visible_to_students), 1);

  await register(courseId, today, "present");
  const outbox = await db.prepare("SELECT COUNT(*) AS n FROM sync_outbox WHERE entity IN ('attendance_sessions', 'attendance_records')").get();
  assert.ok(Number(outbox.n) >= 2);
  const data = (await asStudent("GET", "/analytics/my-data")).body;
  assert.ok(data.attendance.some((a) => a.course_id === courseId && a.status === "present"));

  // Hidden by the teacher: learners can't open their attendance either.
  await db.prepare("UPDATE course_nav_items SET visible_to_students = 0 WHERE course_id = ? AND nav_key = 'attendance'").run(courseId);
  assert.equal((await asStudent("GET", `/courses/${courseId}/attendance/me`)).status, 403);
});
