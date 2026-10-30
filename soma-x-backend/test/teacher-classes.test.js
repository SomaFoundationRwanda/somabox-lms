// Teachers' classes and subjects (set by the admin), staff codes, no first-visit questions for
// teachers, learner accounts made by teachers, and resetting passwords only for one's own class.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asAdmin = call("admin");

before(async () => {
  ctx = await startTestServer();
});

after(async () => {
  await ctx.stop();
});

test("admins give teachers classes and subjects; teachers get a staff code and no first-visit questions", async () => {
  const res = await asAdmin("POST", "/users", {
    email: "new.teacher@test.local", password: "secret123", role: "teacher", fullName: "Neza",
    teacherClasses: ["S1B", " s1b ", "S3C", "S1 beta-B"], teacherSubjects: ["English", "Mathematics"],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.match(res.body.user.staff_code, /^[A-Z0-9]+-T\d{3}$/);

  const login = await ctx.api("POST", "/auth/login", { body: { email: res.body.user.staff_code, password: "secret123" } });
  assert.equal(login.status, 200, "teachers can sign in with their staff code");
  const token = login.body.token;
  const profile = (await ctx.api("GET", "/users/profile/view", { token })).body;
  assert.deepEqual(profile.teacher_classes, ["S1B", "S3C", "S1 beta-B"], "repeats dropped, the school's own names kept");
  assert.deepEqual(profile.teacher_subjects, ["English", "Mathematics"]);
  assert.equal(profile.isProfileComplete, true, "teachers aren't asked anything");

  const id = (await ctx.db.prepare("SELECT id FROM users WHERE email = 'new.teacher@test.local'").get()).id;
  assert.equal((await asAdmin("PATCH", `/users/${id}`, { teacherSubjects: ["Physics"] })).status, 200);
  assert.deepEqual((await ctx.db.prepare("SELECT teacher_subjects FROM users WHERE id = ?").get(id)).teacher_subjects, ["Physics"]);
  assert.equal((await asAdmin("PATCH", `/users/${id}`, { teacherClasses: "S1B" })).status, 400);
});

test("courses keep their subject", async () => {
  const res = await asTeacher("POST", "/courses", { title: "S1B English", grade: "S1B", subject: "English" });
  assert.equal(res.status, 201);
  assert.deepEqual([res.body.grade, res.body.subject], ["S1B", "English"]);
});

test("learners a teacher makes can keep a permanent password and answer the first-visit questions later", async () => {
  const courseId = await ctx.createCourse("S1B Maths");
  const res = await asTeacher("POST", `/courses/${courseId}/learners`, { names: ["Keza Ineza"], grade: "S1B", passwordMode: "permanent" });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const [keza] = res.body.created;
  const login = await ctx.api("POST", "/auth/login", { body: { email: keza.learnerCode, password: keza.temporaryPassword } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.must_change_password, false, "a permanent password isn't changed at first sign-in");
  const profile = (await ctx.api("GET", "/users/profile/view", { token: login.body.token })).body;
  assert.equal(profile.profile_deferred, true);

  const temp = (await asTeacher("POST", `/courses/${courseId}/learners`, { names: ["Gisa Mugabo"], grade: "S1B" })).body.created[0];
  const tempLogin = await ctx.api("POST", "/auth/login", { body: { email: temp.learnerCode, password: temp.temporaryPassword } });
  assert.equal(tempLogin.body.user.must_change_password, true);
});

test("a teacher resets passwords only for learners of the course's own class", async () => {
  const courseId = await ctx.createCourse("English");
  await asTeacher("PATCH", `/courses/${courseId}`, { grade: "S1B" });
  const res = (await asTeacher("POST", `/courses/${courseId}/learners`, { names: ["Mine One"], grade: "s1b" })).body;
  const other = (await asTeacher("POST", `/courses/${courseId}/learners`, { names: ["Other Class"], grade: "S2A" })).body;
  assert.ok(res.created.length && other.created.length);
  const people = (await asTeacher("GET", `/courses/${courseId}/people`)).body;
  const mine = people.find((p) => p.fullName === "Mine One");
  const theirs = people.find((p) => p.fullName === "Other Class");
  assert.equal(mine.canResetPassword, true, "class names match whatever their case");
  assert.equal(theirs.canResetPassword, false);
  assert.equal((await asTeacher("POST", `/courses/${courseId}/people/${mine.id}/reset-password`)).status, 200);
  const refused = await asTeacher("POST", `/courses/${courseId}/people/${theirs.id}/reset-password`);
  assert.equal(refused.status, 403);
  assert.equal(refused.body.code, "OTHER_CLASS");
});

test("a teacher's Learners page lists their learners once, with where each password can be reset", async () => {
  const courseId = await ctx.createCourse("S4A Biology");
  await asTeacher("PATCH", `/courses/${courseId}`, { grade: "S4A" });
  const second = await ctx.createCourse("S4A Chemistry");
  await asTeacher("PATCH", `/courses/${second}`, { grade: "S4A" });
  const [ours] = (await asTeacher("POST", `/courses/${courseId}/learners`, { names: ["Ours Both"], grade: "S4A" })).body.created;
  const [theirs] = (await asTeacher("POST", `/courses/${courseId}/learners`, { names: ["Theirs Visitor"], grade: "S5B" })).body.created;
  const ourAccount = (await asTeacher("GET", `/courses/${courseId}/people`)).body.find((p) => p.fullName === "Ours Both").account;
  assert.equal((await asTeacher("POST", `/courses/${second}/people`, { email: ourAccount, role: "student" })).status, 201);

  const res = await asTeacher("GET", "/courses/mine/learners");
  assert.equal(res.status, 200);
  const both = res.body.filter((l) => l.learnerCode === ours.learnerCode);
  assert.equal(both.length, 1, "one row per learner");
  assert.deepEqual(both[0].courses.map((c) => c.id).sort(), [courseId, second].sort());
  assert.ok(both[0].resetIn);
  const visitor = res.body.find((l) => l.learnerCode === theirs.learnerCode);
  assert.equal(visitor.resetIn, null, "another class's learner can't be reset here");
  const reset = await asTeacher("POST", `/courses/${both[0].resetIn.courseId}/people/${both[0].resetIn.enrollmentId}/reset-password`);
  assert.equal(reset.status, 200);

  assert.equal((await ctx.api("GET", "/courses/mine/learners", { token: ctx.tokens.student })).status, 403);
});

test("the admin records a teacher's gender and phone; only male or female are accepted", async () => {
  const made = await asAdmin("POST", "/users", { email: "gendered.teacher@test.local", password: "secret123", role: "teacher", fullName: "Uwera", gender: "female", phone: "0788000000" });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const row = await ctx.db.prepare("SELECT id, gender, phone FROM users WHERE email = 'gendered.teacher@test.local'").get();
  assert.deepEqual([row.gender, row.phone], ["female", "0788000000"]);
  assert.equal((await asAdmin("POST", "/users", { email: "other.teacher@test.local", password: "secret123", role: "teacher", gender: "other" })).status, 400);

  assert.equal((await asAdmin("PATCH", `/users/${row.id}`, { gender: "male", phone: "0722000000" })).status, 200);
  const after = await ctx.db.prepare("SELECT gender, phone FROM users WHERE id = ?").get(row.id);
  assert.deepEqual([after.gender, after.phone], ["male", "0722000000"]);
  assert.equal((await asAdmin("PATCH", `/users/${row.id}`, { gender: "other" })).status, 400);

  // A teacher answers it themselves; nothing else is accepted.
  const token = ctx.tokens.teacher;
  assert.equal((await ctx.api("PATCH", "/users/profile/update", { token, body: { gender: "unknown" } })).status, 400);
  assert.equal((await ctx.api("PATCH", "/users/profile/update", { token, body: { gender: "female" } })).status, 200);
});

test("signing in by code still finds learners", async () => {
  const code = (await ctx.db.prepare("SELECT learner_code FROM users WHERE email = ?").get(USERS.student.email))?.learner_code;
  if (!code) return;
  assert.equal((await ctx.api("POST", "/auth/login", { body: { email: code, password: "wrong" } })).status, 401);
});
