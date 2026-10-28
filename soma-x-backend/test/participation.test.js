// Who can hand in work: observers only look, and a closed or archived course takes no new work.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");
const asOutsider = call("outsider");

before(async () => {
  ctx = await startTestServer();
});

after(async () => {
  await ctx.stop();
});

async function courseWithWork() {
  const courseId = await ctx.createCourse("Participation");
  const outcome = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Fractions" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await ctx.db.prepare("UPDATE modules SET published = 1 WHERE id = ?").run(week.id);
  const item = (await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, { itemType: "assignment", title: "Poster", outcomeIds: [outcome.id] })).body;
  return { courseId, assignmentId: item.content_id };
}

test("observers can read a course but can't hand in work", async () => {
  const { courseId, assignmentId } = await courseWithWork();
  await asTeacher("POST", `/courses/${courseId}/people`, { email: USERS.outsider.email, role: "observer" });
  assert.equal((await asOutsider("GET", `/courses/${courseId}/assignments/${assignmentId}`)).status, 200);
  const submit = await asOutsider("POST", `/courses/${courseId}/assignments/${assignmentId}/submit`, { body: "x" });
  assert.equal(submit.status, 403);
  assert.equal(submit.body.code, "OBSERVER");
});

test("a closed course takes no new work until it's reopened", async () => {
  const { courseId, assignmentId } = await courseWithWork();
  assert.equal((await asTeacher("PATCH", `/courses/${courseId}`, { lifecycle: "closed" })).status, 200);
  const refused = await asStudent("POST", `/courses/${courseId}/assignments/${assignmentId}/submit`, { body: "Late" });
  assert.equal(refused.status, 409);
  assert.equal(refused.body.code, "COURSE_CLOSED");
  // Learners can still read it.
  assert.equal((await asStudent("GET", `/courses/${courseId}/assignments/${assignmentId}`)).status, 200);

  assert.equal((await asTeacher("PATCH", `/courses/${courseId}`, { lifecycle: "open" })).status, 200);
  assert.equal((await asStudent("POST", `/courses/${courseId}/assignments/${assignmentId}/submit`, { body: "On time" })).status, 201);
});
