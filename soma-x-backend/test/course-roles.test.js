// Who may do what in a course: learners only reach what's released to them, assistants teach but
// don't run the course, observers and admins only read, and staff-only sections stay staff-only.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
let config;
const call = (who) => (method, url, body) => ctx.api(method, url, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asTa = call("otherTeacher");
const asStudent = call("student");
const asObserver = call("outsider");
const asAdmin = call("admin");

before(async () => {
  ctx = await startTestServer();
  ({ config } = await import("../src/config/index.js"));
});

after(async () => {
  await ctx.stop();
});

/** An open course with a released week (page, discussion, assignment), a TA and an observer. */
async function course(title = "Roles") {
  const courseId = await ctx.createCourse(title);
  const outcome = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Fractions" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week.id}`, { published: true });
  const add = async (body) => (await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { outcomeIds: [outcome.id], ...body })).body;
  const page = await add({ itemType: "page", title: "Reading", body: "A fraction is part of a whole." });
  const discussion = await add({ itemType: "discussion", title: "Where are fractions?", body: "Share one." });
  const assignment = await add({ itemType: "assignment", title: "Poster", pointsPossible: 10 });
  await asTeacher("PATCH", `/courses/${courseId}/discussions/${discussion.content_id}`, { published: true });
  await asTeacher("POST", `/courses/${courseId}/people`, { email: USERS.otherTeacher.email, role: "ta" });
  await asTeacher("POST", `/courses/${courseId}/people`, { email: USERS.outsider.email, role: "observer" });
  return { courseId, week, page, discussion, assignment };
}

test("learners can't open unpublished items, or items in an unreleased week; staff and admins can", async () => {
  const c = await course("Hidden items");
  const pageUrl = `/courses/${c.courseId}/pages/${c.page.content_id}`;
  const discussionUrl = `/courses/${c.courseId}/discussions/${c.discussion.content_id}`;
  assert.equal((await asStudent("GET", pageUrl)).status, 200);
  assert.equal((await asStudent("GET", discussionUrl)).status, 200);

  // Hide the page item: gone for learners and observers, still there for staff and admins.
  assert.equal((await asTeacher("PATCH", `/courses/${c.courseId}/modules/${c.week.id}/items/${c.page.id}`, { published: false })).status, 200);
  assert.equal((await asStudent("GET", pageUrl)).status, 404);
  assert.equal((await asObserver("GET", pageUrl)).status, 404);
  assert.equal((await asStudent("POST", `${pageUrl}/view`, { scrollPct: 100 })).status, 404);
  assert.equal((await asTa("GET", pageUrl)).status, 200);
  assert.equal((await asAdmin("GET", pageUrl)).status, 200);

  // Unpublish the whole week: its discussion and assignment go too, even though they're published.
  assert.equal((await asTeacher("PATCH", `/courses/${c.courseId}/modules/${c.week.id}`, { published: false })).status, 200);
  assert.equal((await asStudent("GET", discussionUrl)).status, 404);
  assert.equal((await asStudent("POST", `${discussionUrl}/replies`, { body: "Hi" })).status, 404);
  assert.equal((await asStudent("GET", `/courses/${c.courseId}/assignments/${c.assignment.content_id}`)).status, 404);
  assert.equal((await asStudent("POST", `/courses/${c.courseId}/assignments/${c.assignment.content_id}/submit`, { body: "x" })).status, 404);
  assert.equal((await asTeacher("GET", discussionUrl)).status, 200);
});

test("a reply goes only into a discussion of the course in the address, under its own replies", async () => {
  const a = await course("Course A");
  const b = await course("Course B");
  // The student is in both; posting B's discussion through A's address is refused.
  const crossed = await asStudent("POST", `/courses/${a.courseId}/discussions/${b.discussion.content_id}/replies`, { body: "Wrong course" });
  assert.equal(crossed.status, 404);
  const replyB = (await asStudent("POST", `/courses/${b.courseId}/discussions/${b.discussion.content_id}/replies`, { body: "In B" })).body;
  const underForeign = await asStudent("POST", `/courses/${a.courseId}/discussions/${a.discussion.content_id}/replies`, { body: "Nested", parentReplyId: replyB.id });
  assert.equal(underForeign.status, 404);
  const ok = await asStudent("POST", `/courses/${a.courseId}/discussions/${a.discussion.content_id}/replies`, { body: "In A" });
  assert.equal(ok.status, 201);
  assert.equal(Number(ok.body.discussion_id), Number(a.discussion.content_id));
});

test("assistants teach and grade but don't run the course", async () => {
  const c = await course("Assistant");
  const id = c.courseId;
  // Allowed: posting, adding items, grading.
  assert.equal((await asTa("POST", `/courses/${id}/announcements`, { title: "Ruler", message: "Bring one" })).status, 201);
  assert.equal((await asTa("POST", `/courses/${id}/modules/${c.week.id}/items`, { itemType: "page", title: "Notes", body: "x" })).status, 201);
  await asStudent("POST", `/courses/${id}/assignments/${c.assignment.content_id}/submit`, { body: "Poster" });
  assert.equal((await asTa("PATCH", `/courses/${id}/assignments/${c.assignment.content_id}/grade/${encodeURIComponent(USERS.student.email)}`, { grade: 7 })).status, 200);
  // Refused: what changes the course itself.
  const teacherOnly = [
    ["PATCH", `/courses/${id}`, { title: "Renamed" }],
    ["PATCH", `/courses/${id}`, { lifecycle: "closed" }],
    ["PATCH", `/courses/${id}/nav`, { items: [{ nav_key: "files", visible_to_students: true }] }],
    ["PATCH", `/courses/${id}/shift-timeline`, { days: 7 }],
    ["POST", `/courses/${id}/join-code`, { action: "on" }],
    ["DELETE", `/courses/${id}`],
  ];
  for (const [method, url, body] of teacherOnly) {
    const res = await asTa(method, url, body);
    assert.equal(res.status, 403, `${method} ${url}`);
    assert.equal(res.body.code, "TEACHER_ONLY", `${method} ${url}`);
  }
  // Password resets are the course teacher's, and the people list says so.
  const people = (await asTa("GET", `/courses/${id}/people`)).body;
  const learner = people.find((p) => p.role === "student");
  assert.equal(learner.canResetPassword, false);
  // The course still exists and its teacher can do all of it.
  assert.equal((await asTeacher("PATCH", `/courses/${id}`, { title: "Renamed" })).status, 200);
});

test("observers and admins read the course but don't post in it; learners post only where it's shown", async () => {
  const c = await course("Read only");
  const id = c.courseId;
  const discussion = { title: "Mine", body: "x", moduleId: c.week.id };
  for (const [who, as] of [["observer", asObserver], ["admin", asAdmin]]) {
    assert.equal((await as("POST", `/courses/${id}/discussions`, discussion)).status, 403, `${who} starts a discussion`);
    assert.equal((await as("POST", `/courses/${id}/discussions/${c.discussion.content_id}/replies`, { body: "x" })).status, 403, `${who} replies`);
  }
  assert.equal((await asStudent("POST", `/courses/${id}/discussions`, discussion)).status, 403, "learners reply; teachers start discussions");
  assert.equal((await asStudent("POST", `/courses/${id}/discussions/${c.discussion.content_id}/replies`, { body: "x" })).status, 201, "a learner replies");

  // Collaborations are hidden from learners by default: nobody but staff adds one there.
  const collab = { title: "Board", url: "https://example.org" };
  assert.equal((await asStudent("POST", `/courses/${id}/collaborations`, collab)).status, 403);
  assert.equal((await asObserver("POST", `/courses/${id}/collaborations`, collab)).status, 403);
  assert.equal((await asTeacher("POST", `/courses/${id}/collaborations`, collab)).status, 201);
  await asTeacher("PATCH", `/courses/${id}/nav`, { items: [{ nav_key: "collaborations", visible_to_students: true }] });
  // Shown: a learner adds one with a classmate chosen by their place in the class (no email needed).
  const people = (await asStudent("GET", `/courses/${id}/people`)).body;
  const me = people.find((p) => p.email === USERS.student.email);
  const res = await asStudent("POST", `/courses/${id}/collaborations`, { ...collab, memberIds: [me.id] });
  assert.equal(res.status, 201);
  const members = await ctx.db.prepare("SELECT user_email FROM collaboration_members WHERE collaboration_id = ?").all(res.body.id);
  assert.deepEqual(members.map((m) => m.user_email), [USERS.student.email]);
  assert.equal((await asObserver("POST", `/courses/${id}/collaborations`, collab)).status, 403, "observers still only read");

  // Their visits aren't anyone's reading progress.
  await asObserver("POST", `/courses/${id}/pages/${c.page.content_id}/view`, { scrollPct: 100 });
  const views = await ctx.db.prepare("SELECT COUNT(*) AS n FROM page_views WHERE page_id = ? AND user_email = ?").get(c.page.content_id, USERS.outsider.email);
  assert.equal(Number(views.n), 0);
});

test("settings, insights and rubrics stay staff-only, whatever the navigation says", async () => {
  const c = await course("Staff only");
  const id = c.courseId;
  await asTeacher("PATCH", `/courses/${id}/nav`, { items: ["settings", "insights", "rubrics"].map((k) => ({ nav_key: k, visible_to_students: true })) });
  const keys = (await asStudent("GET", `/courses/${id}/nav`)).body.map((n) => n.navKey);
  for (const k of ["settings", "insights", "rubrics"]) assert.ok(!keys.includes(k), `${k} isn't in a learner's menu`);
  assert.equal((await asStudent("GET", `/courses/${id}/rubrics`)).status, 403);
  const staffNav = (await asTeacher("GET", `/courses/${id}/nav`)).body;
  assert.ok(staffNav.filter((n) => ["settings", "insights", "rubrics"].includes(n.navKey)).every((n) => n.staffOnly && !n.visibleToStudents));
  // A learner still sees an assignment's own rubric on the assignment.
  assert.equal((await asStudent("GET", `/courses/${id}/assignments/${c.assignment.content_id}/rubric`)).status, 200);
});

test("learners see the class as it is: active members, no observers", async () => {
  const c = await course("Class list");
  await ctx.db.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, 'gone@test.local', 'student', 'inactive')").run(c.courseId);
  const seen = (await asStudent("GET", `/courses/${c.courseId}/people`)).body;
  assert.ok(seen.every((p) => p.status === "active" && p.role !== "observer"));
  const staffSees = (await asTeacher("GET", `/courses/${c.courseId}/people`)).body;
  assert.ok(staffSees.some((p) => p.role === "observer") && staffSees.some((p) => p.status === "inactive"));
});

test("staff don't hand in work or take quizzes", async () => {
  const c = await course("Staff work");
  const res = await asTeacher("POST", `/courses/${c.courseId}/assignments/${c.assignment.content_id}/submit`, { body: "x" });
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "STAFF");
});

test("uploads stay inside the course's own folder", async () => {
  const c = await course("Uploads");
  const form = new FormData();
  form.append("file", new Blob(["hello"], { type: "text/plain" }), "notes.txt");
  form.append("folder", "../../../escape");
  const res = await fetch(`${ctx.baseUrl}/courses/${c.courseId}/files`, { method: "POST", headers: { Authorization: `Bearer ${ctx.tokens.teacher}` }, body: form });
  assert.equal(res.status, 201, await res.clone().text());
  const body = await res.json();
  const stored = path.resolve(config.paths.root, "local-content/course-files", c.courseId, body.filename ?? body.file?.filename ?? "");
  assert.ok(stored.startsWith(path.resolve(config.paths.root, "local-content/course-files", c.courseId) + path.sep), stored);
  assert.ok(fs.existsSync(stored), "the file is in the course folder");
  fs.rmSync(path.resolve(config.paths.root, "local-content/course-files", c.courseId), { recursive: true, force: true });
});

test("someone not in the course is told so, and can join a public open course but not a private one", async () => {
  const c = await course("Joining");
  const asOutsider = call("otherTeacher");
  // Make the TA a stranger to this course: remove them.
  const ta = (await asTeacher("GET", `/courses/${c.courseId}/people`)).body.find((p) => p.role === "ta");
  await asTeacher("DELETE", `/courses/${c.courseId}/people/${ta.id}`);

  let res = await asOutsider("GET", `/courses/${c.courseId}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.code, "NOT_ENROLLED");
  assert.equal(res.body.course, null, "a private course doesn't describe itself");
  assert.equal((await asOutsider("POST", `/courses/${c.courseId}/join`)).status, 403);

  await asTeacher("PATCH", `/courses/${c.courseId}`, { visibility: "public" });
  res = await asOutsider("GET", `/courses/${c.courseId}`);
  assert.equal(res.body.course.title, "Joining");
  assert.equal((await asOutsider("POST", `/courses/${c.courseId}/join`)).status, 200);
  assert.equal((await asOutsider("GET", `/courses/${c.courseId}`)).body.myRole, "student");

  // A place the teacher switched off isn't switched back on by joining.
  await ctx.db.prepare("UPDATE enrollments SET status = 'inactive' WHERE course_id = ? AND user_email = ?").run(c.courseId, USERS.otherTeacher.email);
  res = await asOutsider("GET", `/courses/${c.courseId}`);
  assert.equal(res.body.code, "REMOVED");
  assert.equal(res.body.course, null);
  assert.equal((await asOutsider("POST", `/courses/${c.courseId}/join`)).body.code, "REMOVED");
});

test("observers get no grades or attendance; an admin reading the course gets Insights and the class gradebook", async () => {
  const c = await course("Menus");
  const observerNav = (await asObserver("GET", `/courses/${c.courseId}/nav`)).body.map((n) => n.navKey);
  assert.ok(!observerNav.includes("grades") && !observerNav.includes("attendance"));
  assert.equal((await asObserver("GET", `/courses/${c.courseId}/grades`)).status, 403);
  assert.equal((await asObserver("GET", `/courses/${c.courseId}/attendance/me`)).status, 403);

  const adminNav = (await asAdmin("GET", `/courses/${c.courseId}/nav`)).body.map((n) => n.navKey);
  assert.ok(adminNav.includes("insights") && !adminNav.includes("settings"));
  const grades = (await asAdmin("GET", `/courses/${c.courseId}/grades`)).body;
  assert.equal(grades.role, "teacher");
  assert.ok(grades.rows.some((r) => r.email === USERS.student.email));
});

test("a course keeps its length in weeks", async () => {
  const id = await ctx.createCourse("Length");
  assert.equal((await asTeacher("PATCH", `/courses/${id}`, { lengthWeeks: 6 })).status, 200);
  assert.equal((await asTeacher("GET", `/courses/${id}`)).body.length_weeks, 6);
  assert.equal((await asTeacher("PATCH", `/courses/${id}`, { lengthWeeks: 0 })).status, 400);
});
