// Phase 3: one time model. Relative offsets are the truth; dates, due_at caches, the
// calendar, and the Home loop all derive from them.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { addDays, todayIn } from "@somabox/timeline";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
let db;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");
const today = todayIn("Africa/Kigali");

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
});

after(async () => {
  await ctx.stop();
});

async function course({ start = "2026-01-05" } = {}) {
  const courseId = await ctx.createCourse("Timeline");
  if (start) assert.equal((await asTeacher("PATCH", `/courses/${courseId}`, { startDate: start })).status, 200);
  const outcome = await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "O" });
  const w1 = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  const w2 = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 2" })).body;
  const w3 = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 3" })).body;
  for (const m of [w1, w2, w3]) await asTeacher("PATCH", `/courses/${courseId}/modules/${m.id}`, { published: true });
  return { courseId, outcomeId: outcome.body.id, w1, w2, w3 };
}

const addItem = (courseId, moduleId, body) => asTeacher("POST", `/courses/${courseId}/modules/${moduleId}/items`, body);
async function moduleDates(courseId) {
  const res = await asTeacher("GET", `/courses/${courseId}/modules`);
  return res.body;
}

test("module and item dates come from the start date and offsets", async () => {
  const { courseId, outcomeId, w2 } = await course();
  const item = await addItem(courseId, w2.id, { itemType: "assignment", title: "Essay", outcomeIds: [outcomeId], releaseDay: 1, dueDay: 4, closeDay: 6 });
  assert.equal(item.status, 201, JSON.stringify(item.body));

  const mods = await moduleDates(courseId);
  const week2 = mods.find((m) => m.id === w2.id);
  assert.equal(week2.startDate, "2026-01-12");
  assert.equal(week2.endDate, "2026-01-18");
  const row = week2.items[0];
  assert.deepEqual([row.releaseDate, row.dueDate, row.closeDate], ["2026-01-13", "2026-01-16", "2026-01-18"]);
  assert.equal(row.dueAt, "2026-01-16T21:59:59.000Z", "end of day in Kigali");

  const cached = await db.prepare("SELECT due_at FROM assignments WHERE id = ?").get(item.body.content_id);
  assert.equal(new Date(cached.due_at).toISOString(), "2026-01-16T21:59:59.000Z");
});

test("changing the course start date moves every module and item date", async () => {
  const { courseId, outcomeId, w1, w3 } = await course();
  const a = await addItem(courseId, w1.id, { itemType: "assignment", title: "A", outcomeIds: [outcomeId], dueDay: 2 });
  const q = await addItem(courseId, w3.id, { itemType: "quiz", title: "Q", kind: "practice", dueDay: 5 });

  assert.equal((await asTeacher("PATCH", `/courses/${courseId}`, { startDate: "2026-02-02" })).status, 200);
  const mods = await moduleDates(courseId);
  assert.equal(mods.find((m) => m.id === w1.id).startDate, "2026-02-02");
  assert.equal(mods.find((m) => m.id === w3.id).startDate, "2026-02-16");
  const aDue = await db.prepare("SELECT due_at FROM assignments WHERE id = ?").get(a.body.content_id);
  const qDue = await db.prepare("SELECT due_at FROM quizzes WHERE id = ?").get(q.body.content_id);
  assert.equal(new Date(aDue.due_at).toISOString(), "2026-02-04T21:59:59.000Z");
  assert.equal(new Date(qDue.due_at).toISOString(), "2026-02-21T21:59:59.000Z");

  const courseRow = await db.prepare("SELECT start_date FROM courses WHERE id = ?").get(courseId);
  assert.equal(courseRow.start_date, "2026-02-02", "stored as a plain date");
});

test("day offsets are validated and editing them updates the cached due date", async () => {
  const { courseId, outcomeId, w1 } = await course();
  const a = await addItem(courseId, w1.id, { itemType: "assignment", title: "A", outcomeIds: [outcomeId] });
  assert.equal((await asTeacher("PATCH", `/courses/${courseId}/assignments/${a.body.content_id}`, { releaseDay: 3, dueDay: 2 })).status, 400);
  assert.equal((await asTeacher("PATCH", `/courses/${courseId}/assignments/${a.body.content_id}`, { dueDay: 10 })).status, 200);
  const cached = await db.prepare("SELECT due_at FROM assignments WHERE id = ?").get(a.body.content_id);
  assert.equal(new Date(cached.due_at).toISOString(), "2026-01-15T21:59:59.000Z");
  assert.equal((await asTeacher("PATCH", `/courses/${courseId}`, { startDate: "not a date" })).status, 400);
});

test("the baseline is the week before Week 1, and adding it moves nothing", async () => {
  const { courseId, outcomeId, w1 } = await course();
  const a = await addItem(courseId, w1.id, { itemType: "assignment", title: "A", outcomeIds: [outcomeId], dueDay: 1 });
  const before = (await db.prepare("SELECT due_at FROM assignments WHERE id = ?").get(a.body.content_id)).due_at;
  const baseline = await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Baseline", kind: "baseline" });
  const mods = await moduleDates(courseId);
  assert.equal(mods.find((m) => m.id === baseline.body.id).startDate, "2025-12-29");
  const afterDue = (await db.prepare("SELECT due_at FROM assignments WHERE id = ?").get(a.body.content_id)).due_at;
  assert.equal(new Date(afterDue).toISOString(), new Date(before).toISOString());
});

test("shifting from a module previews, then moves it and everything after", async () => {
  const { courseId, outcomeId, w1, w2, w3 } = await course();
  await addItem(courseId, w3.id, { itemType: "assignment", title: "Late", outcomeIds: [outcomeId], dueDay: 6 });

  const preview = await asTeacher("PATCH", `/courses/${courseId}/shift-timeline`, { days: 3, fromModuleId: w2.id, preview: true });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.deepEqual(preview.body.modules.map((m) => [m.moduleId, m.toStart]), [[w2.id, "2026-01-15"], [w3.id, "2026-01-22"]]);
  assert.equal(preview.body.items.length, 1);
  assert.equal((await moduleDates(courseId)).find((m) => m.id === w2.id).startDate, "2026-01-12", "preview saves nothing");

  const applied = await asTeacher("PATCH", `/courses/${courseId}/shift-timeline`, { days: 3, fromModuleId: w2.id });
  assert.equal(applied.status, 200);
  const mods = await moduleDates(courseId);
  assert.equal(mods.find((m) => m.id === w1.id).startDate, "2026-01-05", "earlier modules stay");
  assert.equal(mods.find((m) => m.id === w2.id).startDate, "2026-01-15");
  assert.equal(mods.find((m) => m.id === w3.id).items[0].dueDate, "2026-01-28");

  const tooEarly = await asTeacher("PATCH", `/courses/${courseId}/shift-timeline`, { days: -30, fromModuleId: w1.id });
  assert.equal(tooEarly.status, 400);
  const whole = await asTeacher("PATCH", `/courses/${courseId}/shift-timeline`, { days: 7 });
  assert.equal(whole.body.startDate, "2026-01-12");
});

test("the calendar matches item dates exactly and hides unpublished work from learners", async () => {
  const { courseId, outcomeId, w1, w2 } = await course();
  const pub = await addItem(courseId, w1.id, { itemType: "assignment", title: "Visible", outcomeIds: [outcomeId], dueDay: 3 });
  const draft = await addItem(courseId, w2.id, { itemType: "assignment", title: "Draft", dueDay: 2 });
  await addItem(courseId, w2.id, { itemType: "page", title: "Reading", releaseDay: 1 });

  const teacherCal = await asTeacher("GET", `/courses/${courseId}/calendar`);
  assert.equal(teacherCal.status, 200);
  const mods = await moduleDates(courseId);
  const items = mods.flatMap((m) => m.items);
  for (const e of teacherCal.body.events.filter((e) => e.type === "due")) {
    const it = items.find((i) => i.id === e.moduleItemId);
    assert.equal(e.date, it.dueDate, e.title);
    const table = e.itemType === "quiz" ? "quizzes" : "assignments";
    const cached = await db.prepare(`SELECT due_at FROM ${table} WHERE id = ?`).get(e.contentId);
    assert.equal(new Date(cached.due_at).toISOString(), e.at, "cache matches calendar");
  }
  assert.ok(teacherCal.body.events.some((e) => e.type === "release" && e.title.includes("Reading") && e.date === "2026-01-13"));
  assert.ok(teacherCal.body.events.some((e) => e.contentId === draft.body.content_id));

  const studentCal = await asStudent("GET", `/courses/${courseId}/calendar`);
  assert.ok(studentCal.body.events.some((e) => e.contentId === pub.body.content_id));
  assert.ok(!studentCal.body.events.some((e) => e.contentId === draft.body.content_id));

  const ranged = await asTeacher("GET", `/courses/${courseId}/calendar?from=2026-01-12&to=2026-01-18`);
  assert.ok(ranged.body.events.every((e) => e.date >= "2026-01-12" && e.date <= "2026-01-18"));
});

test("dragging an item on the calendar rewrites its offset", async () => {
  const { courseId, outcomeId, w2 } = await course();
  const a = await addItem(courseId, w2.id, { itemType: "assignment", title: "Move me", outcomeIds: [outcomeId], dueDay: 2 });
  const url = `/courses/${courseId}/calendar/items/${a.body.id}`;
  const moved = await asTeacher("PATCH", url, { field: "due", date: "2026-01-20" });
  assert.equal(moved.status, 200, JSON.stringify(moved.body));
  assert.equal(moved.body.dueDay, 8);
  assert.equal(moved.body.dueDate, "2026-01-20");
  const cached = await db.prepare("SELECT due_at FROM assignments WHERE id = ?").get(a.body.content_id);
  assert.equal(new Date(cached.due_at).toISOString(), "2026-01-20T21:59:59.000Z");

  assert.equal((await asTeacher("PATCH", url, { field: "due", date: "2026-01-11" })).status, 400, "before the module starts");
  assert.equal((await asStudent("PATCH", url, { field: "due", date: "2026-01-19" })).status, 403);
});

test("my calendar spans my courses; drafts stay hidden from learners", async () => {
  const { courseId, outcomeId, w1 } = await course();
  await addItem(courseId, w1.id, { itemType: "assignment", title: "Mine", outcomeIds: [outcomeId], dueDay: 1 });
  const draftCourse = await ctx.createCourse("Draft calendar", { lifecycle: "draft" });
  await asTeacher("PATCH", `/courses/${draftCourse}`, { startDate: "2026-01-05" });
  const dm = (await asTeacher("POST", `/courses/${draftCourse}/modules`, { title: "W1" })).body;
  await asTeacher("PATCH", `/courses/${draftCourse}/modules/${dm.id}`, { published: true });
  await addItem(courseId, w1.id, { itemType: "page", title: "Intro" });
  await addItem(draftCourse, dm.id, { itemType: "page", title: "Draft course page" });

  const mine = await asStudent("GET", "/calendar/me?from=2026-01-01&to=2026-01-31");
  assert.equal(mine.status, 200);
  assert.ok(mine.body.events.some((e) => e.title.includes("Mine") && e.courseId === courseId));
  assert.ok(!mine.body.events.some((e) => e.courseId === draftCourse));
  const teacherMine = await asTeacher("GET", "/calendar/me?from=2026-01-01&to=2026-01-31");
  assert.ok(teacherMine.body.events.some((e) => e.courseId === draftCourse));

  const ics = await fetch(`${ctx.baseUrl}/calendar/me.ics`, { headers: { Authorization: `Bearer ${ctx.tokens.student}` } });
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get("content-type"), /text\/calendar/);
  const body = await ics.text();
  assert.match(body, /BEGIN:VCALENDAR/);
  assert.match(body, /DTSTART;VALUE=DATE:20260106/);

  assert.equal((await asStudent("GET", "/calendar/school")).status, 403);
  const school = await call("admin")("GET", "/calendar/school?from=2026-01-01&to=2026-01-31");
  assert.equal(school.status, 200);
  assert.ok(!school.body.events.some((e) => e.courseId === draftCourse));
});

test("the Home loop follows real dates", async () => {
  // Week 1 started yesterday; an assignment in it is due in 3 days.
  const start = addDays(today, -1);
  const { courseId, outcomeId, w1 } = await course({ start });
  await addItem(courseId, w1.id, { itemType: "assignment", title: "Due soon", outcomeIds: [outcomeId], dueDay: 4 });

  const loop = await asStudent("GET", `/courses/${courseId}/home-loop`);
  assert.equal(loop.status, 200);
  assert.equal(loop.body.currentModuleId, w1.id);
  assert.equal(loop.body.currentBeat, "collect");
  assert.match(loop.body.beatTitle, new RegExp(addDays(start, 4)));

  const future = await course({ start: addDays(today, 10) });
  const upcoming = await asTeacher("GET", `/courses/${future.courseId}/home-loop`);
  assert.equal(upcoming.body.currentBeat, "prepare");
  assert.match(upcoming.body.beatTitle, /starts on/);

  const undated = await course({ start: null });
  const noStart = await asTeacher("GET", `/courses/${undated.courseId}/home-loop`);
  assert.ok(noStart.body.needsAttention.some((n) => n.id === "no-start-date"));
});
