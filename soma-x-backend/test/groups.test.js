// Course groups: membership, assignments given to groups, and group discussions.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");
const STUDENT = USERS.student.email.toLowerCase();

before(async () => {
  ctx = await startTestServer();
});

after(async () => {
  await ctx.stop();
});

async function course() {
  const courseId = await ctx.createCourse("Groups");
  const outcome = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Read maps" })).body;
  const week = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1" })).body;
  await asTeacher("PATCH", `/courses/${courseId}/modules/${week.id}`, { published: true });
  return { courseId, outcome, week };
}

test("teachers make groups of enrolled learners; learners see only their own groups", async () => {
  const { courseId } = await course();
  const a = await asTeacher("POST", `/courses/${courseId}/groups`, { name: "Group A", memberEmails: [USERS.student.email] });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.deepEqual(a.body.members.map((m) => m.email), [STUDENT]);
  await asTeacher("POST", `/courses/${courseId}/groups`, { name: "Group B" });

  assert.equal((await asTeacher("POST", `/courses/${courseId}/groups`, { name: "group a" })).status, 409, "names are unique per course");
  assert.equal((await asTeacher("POST", `/courses/${courseId}/groups`, { name: "C", memberEmails: [USERS.teacher.email] })).status, 400, "only learners");
  assert.equal((await asStudent("POST", `/courses/${courseId}/groups`, { name: "Mine" })).status, 403);

  const teacherView = (await asTeacher("GET", `/courses/${courseId}/groups`)).body;
  assert.deepEqual(teacherView.groups.map((g) => g.name), ["Group A", "Group B"]);
  const learnerView = (await asStudent("GET", `/courses/${courseId}/groups`)).body;
  assert.deepEqual(learnerView.groups.map((g) => g.name), ["Group A"]);
  assert.equal(learnerView.groups[0].members[0].email, undefined, "learners don't get emails");

  const b = teacherView.groups[1];
  await asTeacher("PATCH", `/courses/${courseId}/groups/${b.id}`, { memberEmails: [USERS.student.email] });
  assert.equal((await asStudent("GET", `/courses/${courseId}/groups`)).body.groups.length, 2);
});

test("an assignment given to a group is only for its members", async () => {
  const { courseId, outcome, week } = await course();
  const mine = (await asTeacher("POST", `/courses/${courseId}/groups`, { name: "Mine", memberEmails: [USERS.student.email] })).body;
  const other = (await asTeacher("POST", `/courses/${courseId}/groups`, { name: "Other" })).body;
  const add = async (title, groupIds) => (await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, {
    itemType: "assignment", title, pointsPossible: 10, category: "short_quiz", outcomeIds: [outcome.id], groupIds,
  })).body.content_id;
  const forMine = await add("For my group", [mine.id]);
  const forOther = await add("For the other group", [other.id]);
  const forBoth = await add("For both", [mine.id, other.id]);

  assert.deepEqual((await asTeacher("GET", `/courses/${courseId}/assignments/${forOther}`)).body.groups.map((g) => g.name), ["Other"]);
  assert.equal((await asStudent("GET", `/courses/${courseId}/assignments/${forOther}`)).status, 404);
  assert.equal((await asStudent("POST", `/courses/${courseId}/assignments/${forOther}/submit`, { body: "x" })).status, 404);
  assert.equal((await asStudent("GET", `/courses/${courseId}/assignments/${forMine}`)).status, 200);

  const titles = (await asStudent("GET", `/courses/${courseId}/modules`)).body.flatMap((m) => m.items.map((i) => i.title));
  assert.ok(titles.includes("For my group") && titles.includes("For both"));
  assert.ok(!titles.includes("For the other group"));
  const list = (await asStudent("GET", `/courses/${courseId}/assignments`)).body.map((a) => a.id);
  assert.ok(list.includes(forBoth) && !list.includes(forOther));

  const book = (await asStudent("GET", `/courses/${courseId}/grades`)).body;
  assert.ok(!book.columns.some((c) => c.id === forOther));
  const teacherBook = (await asTeacher("GET", `/courses/${courseId}/grades`)).body;
  assert.equal(teacherBook.rows[0].cells[`assignment:${forOther}`].status, "not_assigned");

  // Back to the whole class.
  await asTeacher("PATCH", `/courses/${courseId}/assignments/${forOther}`, { groupIds: [] });
  assert.equal((await asStudent("GET", `/courses/${courseId}/assignments/${forOther}`)).status, 200);

  const elsewhere = await ctx.createCourse("Elsewhere");
  const foreign = (await asTeacher("POST", `/courses/${elsewhere}/groups`, { name: "X" })).body;
  assert.equal((await asTeacher("PATCH", `/courses/${courseId}/assignments/${forMine}`, { groupIds: [foreign.id] })).status, 400);
});

test("group discussions are separate: only members and staff see them, and they go with their group", async () => {
  const { courseId, week } = await course();
  const mine = (await asTeacher("POST", `/courses/${courseId}/groups`, { name: "Mine", memberEmails: [USERS.student.email] })).body;
  const other = (await asTeacher("POST", `/courses/${courseId}/groups`, { name: "Other" })).body;
  const post = (who, body) => call(who)("POST", `/courses/${courseId}/discussions`, { moduleId: week.id, published: true, ...body });

  const general = (await post("teacher", { title: "Everyone" })).body;
  const ours = await post("teacher", { title: "Our plan", groupId: mine.id });
  assert.equal(ours.status, 201, JSON.stringify(ours.body));
  assert.equal((await post("student", { title: "Sneaky", groupId: mine.id })).status, 403, "learners reply, they don't start discussions");
  const theirs = (await post("teacher", { title: "Their plan", groupId: other.id })).body;

  const seen = (await asStudent("GET", `/courses/${courseId}/discussions`)).body;
  assert.deepEqual(seen.map((d) => d.title).sort(), ["Everyone", "Our plan"]);
  assert.equal(seen.find((d) => d.title === "Our plan").groupName, "Mine");
  assert.equal(seen.find((d) => d.id === general.id).group_id, null);
  assert.equal((await asStudent("GET", `/courses/${courseId}/discussions/${theirs.id}`)).status, 404);
  assert.equal((await asStudent("POST", `/courses/${courseId}/discussions/${theirs.id}/replies`, { body: "hi" })).status, 404);
  assert.equal((await asTeacher("GET", `/courses/${courseId}/discussions`)).body.length, 3);

  assert.equal((await asTeacher("DELETE", `/courses/${courseId}/groups/${other.id}`)).status, 204);
  assert.equal((await asTeacher("GET", `/courses/${courseId}/discussions/${theirs.id}`)).status, 404, "its discussion went with it");
});

test("group work: one member hands in for the whole group, and one mark is the group's", async () => {
  const { courseId, outcome, week } = await course();
  // A second learner in the course, in the same group.
  const made = (await asTeacher("POST", `/courses/${courseId}/learners`, { names: ["Mate Two"], grade: "S1B" })).body.created[0];
  const mateEmail = (await ctx.db.prepare("SELECT LOWER(email) AS e FROM users WHERE learner_code = ?").get(made.learnerCode)).e;
  const team = (await asTeacher("POST", `/courses/${courseId}/groups`, { name: "Team", memberEmails: [USERS.student.email, mateEmail] })).body;
  const work = (await asTeacher("POST", `/courses/${courseId}/modules/${week.id}/items`, {
    itemType: "assignment", title: "Poster", pointsPossible: 10, category: "general_test", outcomeIds: [outcome.id], groupIds: [team.id], groupSubmission: true,
  })).body.content_id;

  const before = (await asStudent("GET", `/courses/${courseId}/assignments/${work}`)).body;
  assert.equal(before.myGroup.name, "Team");
  assert.equal(before.myGroup.members.length, 2);

  const sent = await asStudent("POST", `/courses/${courseId}/assignments/${work}/submit`, { body: "our poster" });
  assert.equal(sent.status, 201, JSON.stringify(sent.body));
  assert.deepEqual(sent.body.group, { id: team.id, name: "Team", members: 2 });

  const teacherView = (await asTeacher("GET", `/courses/${courseId}/assignments/${work}`)).body;
  const mates = teacherView.submissions.map((s) => s.scholar_email.toLowerCase()).sort();
  assert.deepEqual(mates, [STUDENT, mateEmail].sort(), "handed in for both members");
  const mateRow = teacherView.submissions.find((s) => s.scholar_email.toLowerCase() === mateEmail);
  assert.equal(mateRow.groupName, "Team");
  assert.equal(mateRow.submitted_by, STUDENT);

  const graded = await asTeacher("PATCH", `/courses/${courseId}/assignments/${work}/grade/${encodeURIComponent(mateEmail)}`, { grade: 7 });
  assert.equal(graded.status, 200);
  assert.equal(graded.body.learners, 2);
  const book = (await asTeacher("GET", `/courses/${courseId}/grades`)).body;
  for (const row of book.rows) assert.equal(row.cells[`assignment:${work}`].points, 7, `${row.email} has the group's mark`);
});
