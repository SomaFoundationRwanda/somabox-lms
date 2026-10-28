// Announcements (category, urgency, audience) and the course notifications learners get.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");
const STUDENT = encodeURIComponent(USERS.student.email);

before(async () => {
  ctx = await startTestServer();
});

after(async () => {
  await ctx.stop();
});

const notes = async (who) => (await call(who)("GET", "/notifications")).body.notifications.filter((n) => n.text_key);
// New work is announced just after the response that published it.
async function waitForNote(who, key, title) {
  for (let i = 0; i < 40; i++) {
    const found = (await notes(who)).find((n) => n.text_key === key && (!title || n.title.includes(title)));
    if (found) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

async function course(name) {
  const courseId = await ctx.createCourse(name);
  const outcome = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Spell" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week.id}`, { published: true });
  return { courseId, outcome, week };
}

test("announcements have a category, an urgency, and an audience", async () => {
  const { courseId } = await course("News");
  const group = (await asTeacher("POST", `/courses/${courseId}/groups`, { name: "Readers" })).body;

  const general = await asTeacher("POST", `/courses/${courseId}/announcements`, { title: "Welcome", body: "Hello all" });
  assert.equal(general.status, 201, JSON.stringify(general.body));
  assert.deepEqual([general.body.category, general.body.urgency, general.body.isPublic], ["general", "normal", true]);

  assert.equal((await asTeacher("POST", `/courses/${courseId}/announcements`, { title: "X", category: "custom" })).status, 400, "custom needs a name");
  assert.equal((await asTeacher("POST", `/courses/${courseId}/announcements`, { title: "X", urgency: "panic" })).status, 400);
  assert.equal((await asTeacher("POST", `/courses/${courseId}/announcements`, { title: "X", isPublic: false })).status, 400, "private needs an audience");

  const custom = (await asTeacher("POST", `/courses/${courseId}/announcements`, { title: "Trip", category: "custom", customCategory: "School trip", urgency: "important" })).body;
  assert.equal(custom.custom_category, "School trip");
  const forGroup = (await asTeacher("POST", `/courses/${courseId}/announcements`, { title: "Readers only", isPublic: false, groupIds: [group.id] })).body;
  const forStudent = (await asTeacher("POST", `/courses/${courseId}/announcements`, { title: "Just you", isPublic: false, peopleEmails: [USERS.student.email] })).body;

  let seen = (await asStudent("GET", `/courses/${courseId}/announcements`)).body.map((a) => a.title);
  assert.ok(seen.includes("Welcome") && seen.includes("Trip") && seen.includes("Just you"));
  assert.ok(!seen.includes("Readers only"), "not in the group");
  await asTeacher("PATCH", `/courses/${courseId}/groups/${group.id}`, { memberEmails: [USERS.student.email] });
  seen = (await asStudent("GET", `/courses/${courseId}/announcements`)).body.map((a) => a.title);
  assert.ok(seen.includes("Readers only"));
  assert.deepEqual((await asStudent("GET", `/courses/${courseId}/announcements`)).body.find((a) => a.id === forStudent.id).people, [], "learners don't see who was tagged");

  assert.equal((await asTeacher("PATCH", `/courses/${courseId}/announcements/${forGroup.id}`, { pinned: true })).body.pinned, true, "pinning works");
  assert.equal((await asStudent("POST", `/courses/${courseId}/announcements`, { title: "Me" })).status, 403);
});

test("urgent announcements always notify; others when asked", async () => {
  const { courseId } = await course("Alerts");
  await asTeacher("POST", `/courses/${courseId}/announcements`, { title: "Quiet one" });
  await asTeacher("POST", `/courses/${courseId}/announcements`, { title: "Told one", notify: true });
  await asTeacher("POST", `/courses/${courseId}/announcements`, { title: "Fire drill", urgency: "urgent" });
  const mine = await notes("student");
  const titles = mine.filter((n) => n.text_key.toLowerCase().includes("announcement")).map((n) => n.title);
  assert.ok(titles.includes("Told one"));
  assert.ok(titles.includes("Urgent: Fire drill"));
  assert.ok(!titles.includes("Quiet one"));
  assert.equal(mine.find((n) => n.title === "Urgent: Fire drill").text_params.course, "Alerts");
});

test("learners hear about new work once, their marks, published scores, and being added", async () => {
  const { courseId, outcome, week } = await course("Notified");
  const add = (body) => asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { outcomeIds: [outcome.id], category: "short_quiz", ...body });
  const a = (await add({ itemType: "assignment", title: "Essay one", pointsPossible: 10 })).body;
  assert.ok(await waitForNote("student", "workPublished", "Essay one"), "told about new work");
  // Unpublish and publish again: not told twice.
  await asTeacher("PATCH", `/courses/${courseId}/assignments/${a.content_id}`, { published: false });
  await asTeacher("PATCH", `/courses/${courseId}/assignments/${a.content_id}`, { published: true });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal((await notes("student")).filter((n) => n.text_key === "workPublished" && n.title.includes("Essay one")).length, 1);

  await asTeacher("PATCH", `/courses/${courseId}/assignments/${a.content_id}/grade/${encodeURIComponent(USERS.student.email)}`, { grade: 8 });
  assert.ok((await notes("student")).some((n) => n.text_key === "workMarked" && n.title.includes("Essay one")));

  const hidden = (await add({ itemType: "assignment", title: "Secret test", pointsPossible: 10, scoresHidden: true })).body;
  await asTeacher("PATCH", `/courses/${courseId}/assignments/${hidden.content_id}/grade/${STUDENT}`, { grade: 5 });
  assert.ok(!(await notes("student")).some((n) => n.text_key === "workMarked" && n.title.includes("Secret test")), "hidden marks aren't announced");
  await asTeacher("POST", `/courses/${courseId}/grades/visibility`, { key: `assignment:${hidden.content_id}`, hidden: false });
  assert.ok((await notes("student")).some((n) => n.text_key === "scoresPublished" && n.title.includes("Secret test")));

  const other = await ctx.createCourse("Joined later");
  await ctx.db.prepare("DELETE FROM enrollments WHERE course_id = ? AND LOWER(user_email) = LOWER(?)").run(other, USERS.student.email);
  await asTeacher("POST", `/courses/${other}/people`, { email: USERS.student.email, role: "student" });
  assert.ok((await notes("student")).some((n) => n.text_key === "addedToCourse" && n.text_params.course === "Joined later"));
});
