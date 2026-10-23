// A new box has no built-in admin: it prints a one-time setup code, and whoever has it (someone at
// the box) names the school and creates the first admin. Later codes recover admin access.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, USERS, PASSWORD } from "./helpers.js";

let ctx;
let setup;
let throttle;
const anon = (method, path, body) => ctx.api(method, path, { body });
const form = (code, extra = {}) => ({ code, fullName: "Grace Admin", email: "grace@school.local", password: "first-admin-pass", schoolName: "Groupe Scolaire Kigali", ...extra });

before(async () => {
  ctx = await startTestServer();
  setup = await import("../src/services/setup.services.js");
  throttle = await import("../src/helpers/login-throttle.js");
});

after(async () => {
  await ctx.stop();
});

test("no built-in admin@mail.com account exists", async () => {
  assert.equal(await ctx.db.prepare("SELECT 1 FROM users WHERE LOWER(email) = 'admin@mail.com'").get(), undefined);
});

test("a box without an admin is set up once, with the code printed on the box", async () => {
  // Make this box look new: the harness's admin becomes a teacher for this test.
  await ctx.db.prepare("UPDATE users SET role = 'teacher' WHERE role = 'admin'").run();
  try {
    assert.deepEqual((await anon("GET", "/setup/status")).body, { needsSetup: true, recovering: false });
    const { code, purpose } = await setup.issueSetupCode();
    assert.equal(purpose, "setup");
    assert.match(code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);

    const wrong = await anon("POST", "/setup", form("AAAA-BBBB"));
    assert.equal(wrong.status, 400);
    assert.equal(wrong.body.code, "BAD_SETUP_CODE");
    // A form mistake doesn't use up the code.
    assert.equal((await anon("POST", "/setup", form(code, { password: "short" }))).status, 400);
    assert.equal((await anon("POST", "/setup", form(code, { schoolName: "" }))).status, 400);
    assert.equal((await anon("POST", "/setup", form(code, { email: USERS.student.email }))).status, 409, "a learner's email can't become the admin");

    // Typed in lower case without the dash still works.
    const done = await anon("POST", "/setup", form(code.toLowerCase().replace("-", "")));
    assert.equal(done.status, 201);
    assert.equal(done.body.user.role, "admin");
    assert.equal(done.body.user.must_change_password, false);
    assert.equal((await ctx.api("GET", "/users", { token: done.body.token })).status, 200);

    const school = await ctx.db.prepare("SELECT school_name, configured_at FROM unit_branding WHERE id = 1").get();
    assert.equal(school.school_name, "Groupe Scolaire Kigali");
    assert.ok(school.configured_at);
    const audit = await ctx.db.prepare("SELECT admin_email FROM admin_audit_logs WHERE action = 'BOX_SETUP'").get();
    assert.equal(audit.admin_email, "grace@school.local");

    // Closed for good: the code is used up and setup refuses.
    assert.deepEqual((await anon("GET", "/setup/status")).body, { needsSetup: false, recovering: false });
    const again = await anon("POST", "/setup", form(code, { email: "intruder@x.local" }));
    assert.equal(again.status, 409);
    assert.equal(again.body.code, "ALREADY_SET_UP");
  } finally {
    await ctx.db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(USERS.admin.email);
  }
});

test("a recovery code from the box resets an admin's password or adds an admin", async () => {
  const email = "grace@school.local";
  const oldToken = await ctx.login(email, "first-admin-pass");
  const { code, purpose } = await setup.issueSetupCode();
  assert.equal(purpose, "recover");
  assert.equal((await anon("GET", "/setup/status")).body.recovering, true);

  assert.equal((await anon("POST", "/setup", form(code, { email: USERS.teacher.email, schoolName: "" }))).status, 409, "not a teacher's account");
  const reset = await anon("POST", "/setup", form(code, { email, password: "recovered-pass", schoolName: "" }));
  assert.equal(reset.status, 201);
  assert.equal((await ctx.api("GET", "/auth/me", { token: oldToken })).status, 401, "old sessions end");
  assert.equal((await anon("POST", "/auth/login", { email, password: "first-admin-pass" })).status, 401);
  await ctx.login(email, "recovered-pass");
  assert.equal((await anon("POST", "/setup", form(code, { email: "second@school.local" }))).status, 409, "a code works once");

  const next = await setup.issueSetupCode();
  const added = await anon("POST", "/setup", form(next.code, { email: "second@school.local", schoolName: "" }));
  assert.equal(added.status, 201);
  assert.equal((await ctx.db.prepare("SELECT role FROM users WHERE email = 'second@school.local'").get()).role, "admin");
  const school = await ctx.db.prepare("SELECT school_name FROM unit_branding WHERE id = 1").get();
  assert.equal(school.school_name, "Groupe Scolaire Kigali", "recovery leaves the school alone");
});

test("an expired code is refused, and guessing codes is limited", async () => {
  throttle.resetLoginThrottle();
  const { code } = await setup.issueSetupCode({ code: "PRESET-CODE-1" });
  await ctx.db.prepare("UPDATE box_setup_code SET expires_at = NOW() - INTERVAL '1 minute'").run();
  assert.equal((await anon("POST", "/setup", form(code, { email: "late@school.local", schoolName: "" }))).status, 400);

  await setup.issueSetupCode();
  for (let i = 0; i < 3; i++) assert.equal((await anon("POST", "/setup", form(`GUES-S00${i}`))).status, 400);
  const limited = await anon("POST", "/setup", form("GUES-S009"));
  assert.equal(limited.status, 429);
  throttle.resetLoginThrottle();
  // Signing in is unaffected by setup guesses for other accounts.
  await ctx.login(USERS.teacher.email, PASSWORD);
});
