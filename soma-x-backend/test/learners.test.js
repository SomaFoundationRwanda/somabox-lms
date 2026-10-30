// Teachers managing their learners: creating accounts for pupils without email (with a check for
// learners who already have one), adding existing learners by name or code, and resetting the
// password of a learner in their own course. The school owns the accounts; everything is audited.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
let db;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asOther = call("otherTeacher");
const asStudent = call("student");
const asAdmin = call("admin");

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
});

after(async () => {
  await ctx.stop();
});

const people = async (courseId) => (await asTeacher("GET", `/courses/${courseId}/people`)).body;

test("a teacher creates accounts for new learners, who sign in with their code and a temporary password", async () => {
  const courseId = await ctx.createCourse("Class P4");
  const res = await asTeacher("POST", `/courses/${courseId}/learners`, { names: ["  Ama   Uwase ", "Bosco Niyonzima", "Ama Uwase"], grade: "Primary 4" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.created.length, 2, "the same name twice in one list is one learner");
  const [ama] = res.body.created;
  assert.equal(ama.fullName, "Ama Uwase");
  assert.match(ama.learnerCode, /^[A-Z0-9]+-\d{4}$/);
  assert.match(ama.temporaryPassword, /^[a-z]{4}-\d{4}$/);

  // In the course, with no email shown, and their code for the teacher.
  const amaRow = (await people(courseId)).find((p) => p.fullName === "Ama Uwase");
  assert.equal(amaRow.email, null);
  assert.equal(amaRow.learnerCode, ama.learnerCode);
  assert.equal(amaRow.canResetPassword, true);

  const login = await ctx.api("POST", "/auth/login", { body: { email: ama.learnerCode, password: ama.temporaryPassword } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.must_change_password, true);
  const account = await db.prepare("SELECT role, grade_level, email FROM users WHERE id = ?").get(ama.id);
  assert.equal(account.role, "scholar");
  assert.equal(account.grade_level, "Primary 4");
  assert.match(account.email, /@learner\.invalid$/);

  const audit = await db.prepare("SELECT admin_email FROM admin_audit_logs WHERE action = 'TEACHER_CREATE_LEARNER' AND target_user_id = ?").get(ama.id);
  assert.equal(audit.admin_email, USERS.teacher.email);
  // The school's admin sees them like any account.
  const listed = await asAdmin("GET", `/users?search=${encodeURIComponent("Ama Uwase")}`);
  assert.equal(listed.body.users.length, 1);
});

test("a learner who may already have an account is caught, and can be added instead", async () => {
  const first = await ctx.createCourse("Class A");
  await asTeacher("POST", `/courses/${first}/learners`, { names: ["Claude Mugisha"], grade: "Primary 5" });
  const second = await ctx.createCourse("Class B");

  const ask = await asTeacher("POST", `/courses/${second}/learners`, { names: ["claude mugisha", "Diane Ingabire"], grade: "Primary 6" });
  assert.equal(ask.status, 409);
  assert.equal(ask.body.code, "POSSIBLE_DUPLICATES");
  assert.equal(ask.body.duplicates[0].matches[0].fullName, "Claude Mugisha");
  assert.equal(ask.body.duplicates[0].matches[0].grade, "Primary 5");
  assert.equal(ask.body.duplicates[0].matches[0].email, undefined, "no email addresses");
  assert.equal((await people(second)).filter((p) => p.role === "student").length, 1, "nothing created yet");

  const add = await asTeacher("POST", `/courses/${second}/learners`, { names: ["claude mugisha", "Diane Ingabire"], grade: "Primary 6", duplicates: "add" });
  assert.equal(add.status, 201);
  assert.deepEqual(add.body.added.map((l) => l.fullName), ["Claude Mugisha"]);
  assert.deepEqual(add.body.created.map((l) => l.fullName), ["Diane Ingabire"]);
  const names = (await people(second)).map((p) => p.fullName);
  assert.ok(names.includes("Claude Mugisha") && names.includes("Diane Ingabire"));

  // Two learners with the same name: the teacher picks (by code), nothing is guessed.
  await asTeacher("POST", `/courses/${first}/learners`, { names: ["Claude Mugisha"], grade: "Primary 2", duplicates: "create" });
  const third = await ctx.createCourse("Class C");
  const unsure = await asTeacher("POST", `/courses/${third}/learners`, { names: ["Claude Mugisha"], grade: "Primary 5", duplicates: "add" });
  assert.equal(unsure.body.ambiguous[0].matches.length, 2);
  assert.equal((await people(third)).filter((p) => p.role === "student").length, 1, "only the harness's learner");
});

test("teachers find learners by name or code and add them; others can't search", async () => {
  const courseId = await ctx.createCourse("Search");
  const made = (await asTeacher("POST", `/courses/${courseId}/learners`, { names: ["Eric Habimana"], grade: "Senior 1" })).body.created[0];
  const other = await ctx.createCourse("Elsewhere");

  const byName = await asTeacher("GET", `/courses/${other}/learner-search?q=habim`);
  assert.equal(byName.status, 200);
  assert.deepEqual(byName.body.map((l) => l.learnerCode), [made.learnerCode]);
  assert.equal(byName.body[0].inCourse, false);
  assert.equal(byName.body[0].email, undefined);
  const byCode = await asTeacher("GET", `/courses/${other}/learner-search?q=${made.learnerCode.toLowerCase()}`);
  assert.equal(byCode.body.length, 1);

  assert.equal((await asOther("GET", `/courses/${other}/learner-search?q=eric`)).status, 403, "not their course");
  assert.equal((await asStudent("GET", `/courses/${other}/learner-search?q=eric`)).status, 403);

  assert.equal((await asTeacher("POST", `/courses/${other}/people`, { userId: made.id })).status, 201);
  assert.ok((await people(other)).some((p) => p.learnerCode === made.learnerCode));
  const second = await ctx.createCourse("By code");
  assert.equal((await asTeacher("POST", `/courses/${second}/people`, { learnerCode: made.learnerCode.toLowerCase() })).status, 201);
  assert.equal((await asTeacher("POST", `/courses/${second}/people`, { learnerCode: "NOPE-9999" })).status, 404);
});

test("a teacher resets the password of a learner in their course, and only there", async () => {
  const courseId = await ctx.createCourse("Resets");
  const made = (await asTeacher("POST", `/courses/${courseId}/learners`, { names: ["Fiston Kalisa"], grade: "Primary 3" })).body.created[0];
  const first = await ctx.api("POST", "/auth/login", { body: { email: made.learnerCode, password: made.temporaryPassword } });
  await ctx.api("PATCH", "/users/profile/password", { token: first.body.token, body: { currentPassword: made.temporaryPassword, newPassword: "my-own-pass" } });
  const session = (await ctx.api("POST", "/auth/login", { body: { email: made.learnerCode, password: "my-own-pass" } })).body.token;

  const row = (await people(courseId)).find((p) => p.learnerCode === made.learnerCode);
  assert.equal((await asOther("POST", `/courses/${courseId}/people/${row.id}/reset-password`)).status, 403, "another course's teacher");
  assert.equal((await asStudent("POST", `/courses/${courseId}/people/${row.id}/reset-password`)).status, 403);
  assert.equal((await asAdmin("POST", `/courses/${courseId}/people/${row.id}/reset-password`)).status, 403, "admins reset on the Users page");

  const reset = await asTeacher("POST", `/courses/${courseId}/people/${row.id}/reset-password`);
  assert.equal(reset.status, 200);
  assert.match(reset.body.temporaryPassword, /^[a-z]{4}-\d{4}$/);
  assert.equal((await ctx.api("GET", "/auth/me", { token: session })).status, 401, "signed out everywhere");
  assert.equal((await ctx.api("POST", "/auth/login", { body: { email: made.learnerCode, password: "my-own-pass" } })).status, 401);
  const again = await ctx.api("POST", "/auth/login", { body: { email: made.learnerCode, password: reset.body.temporaryPassword } });
  assert.equal(again.body.user.must_change_password, true);
  const audit = await db.prepare("SELECT admin_email FROM admin_audit_logs WHERE action = 'TEACHER_RESET_PASSWORD' AND target_user_id = ?").get(made.id);
  assert.equal(audit.admin_email, USERS.teacher.email);

  // Never a teacher's password, even one sitting in the course as a learner.
  await db.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'student', 'active')").run(courseId, USERS.otherTeacher.email);
  const teacherRow = (await people(courseId)).find((p) => p.email === USERS.otherTeacher.email);
  assert.equal(teacherRow.canResetPassword, false);
  assert.equal((await asTeacher("POST", `/courses/${courseId}/people/${teacherRow.id}/reset-password`)).status, 403);
});
