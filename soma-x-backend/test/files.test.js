// Files need a signed-in person: guests can browse the catalogue but must sign up to open
// anything. Media tags use the signed cookie set at sign-in; course files also need membership.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startTestServer, USERS, PASSWORD } from "./helpers.js";

let ctx;
let config;
const created = [];

before(async () => {
  ctx = await startTestServer();
  ({ config } = await import("../src/config/index.js"));
});

after(async () => {
  for (const p of created) fs.rmSync(p, { recursive: true, force: true });
  await ctx.stop();
});

/** Logs in like the browser does and returns the media cookie it set. */
async function mediaCookie(email) {
  const res = await fetch(`${ctx.baseUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  const cookie = res.headers.get("set-cookie") || "";
  assert.match(cookie, /somabox_media=[^;]+;.*HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  return cookie.split(";")[0];
}
const get = (url, cookie) => fetch(`${ctx.baseUrl}${url}`, { headers: cookie ? { cookie } : {} });

function lessonFile() {
  const dir = path.join(config.paths.lessons, `test-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "lesson.txt"), "a lesson");
  created.push(dir);
  return `/lessons/test-${process.pid}/lesson.txt`;
}

test("guests can browse the catalogue but not open files", async () => {
  for (const url of ["/content/main-categories", "/content/levels/summary", "/library/books", "/library/categories", "/courses/public"]) {
    const res = await get(url);
    assert.equal(res.status, 200, url);
  }
  const lesson = lessonFile();
  const blocked = await get(lesson);
  assert.equal(blocked.status, 401);
  assert.equal((await blocked.json()).code, "LOGIN_REQUIRED");
  for (const url of ["/library/file/1", "/content/files/anything.mp4", "/khan-academy/index.html", "/course-files/123456/x.pdf"]) {
    assert.equal((await get(url)).status, 401, url);
  }
  // Signed-in API data stays private.
  assert.equal((await get("/courses/mine")).status, 401);
});

test("signing in sets a media cookie that opens files; a forged or expired cookie doesn't", async () => {
  const lesson = lessonFile();
  const cookie = await mediaCookie(USERS.student.email);
  const ok = await get(lesson, cookie);
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), "a lesson");

  const [name, value] = cookie.split("=");
  const [uid, , sig] = value.split(".");
  assert.equal((await get(lesson, `${name}=${uid}.${Date.now() + 1e9}.${sig}`)).status, 401, "changing the expiry breaks the signature");
  const { mediaToken } = await import("../src/helpers/media.js");
  const expired = await mediaToken(Number(uid), Date.now() - 13 * 60 * 60 * 1000);
  assert.equal((await get(lesson, `${name}=${expired}`)).status, 401);

  // The app can renew the cookie with its bearer token; logout clears it.
  const renewed = await fetch(`${ctx.baseUrl}/auth/media-session`, { method: "POST", headers: { Authorization: `Bearer ${ctx.tokens.student}` } });
  assert.equal(renewed.status, 200);
  assert.match(renewed.headers.get("set-cookie") || "", /somabox_media=/);
  assert.equal((await fetch(`${ctx.baseUrl}/auth/media-session`, { method: "POST" })).status, 401);
});

test("course files open only for that course's members", async () => {
  const courseId = await ctx.createCourse("Files");
  const dir = path.join(config.paths.courseFiles, courseId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "sheet.txt"), "worksheet");
  created.push(dir);
  const url = `/course-files/${courseId}/sheet.txt`;
  assert.equal((await get(url, await mediaCookie(USERS.student.email))).status, 200, "an enrolled learner");
  assert.equal((await get(url, await mediaCookie(USERS.teacher.email))).status, 200, "its teacher");
  assert.equal((await get(url, await mediaCookie(USERS.outsider.email))).status, 403, "someone else on the box");
  assert.equal((await get(url, await mediaCookie(USERS.admin.email))).status, 200, "an admin");
});

test("the profile step only completes with explicit answers; the gap report counts only those", async () => {
  const asStudent = (method, path, body) => ctx.api(method, path, { token: ctx.tokens.student, body });
  let view = (await asStudent("GET", "/users/profile/view")).body;
  assert.equal(view.isProfileComplete, false, "defaults in the database are not answers");
  const base = { fullName: "Learner", gender: "female", regionProvince: "Kigali", regionDistrict: "Gasabo", gradeLevel: "P5", completeProfile: true };
  const partial = await asStudent("PATCH", "/users/profile/update", base);
  assert.equal(partial.status, 400);
  assert.deepEqual(partial.body.missing, ["accessibility needs"], "location is the school's, never asked");
  assert.equal((await asStudent("GET", "/users/profile/view")).body.isProfileComplete, false);
  const done = await asStudent("PATCH", "/users/profile/update", { ...base, isRural: true, disabilityStatus: "none" });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  view = (await asStudent("GET", "/users/profile/view")).body;
  assert.equal(view.isProfileComplete, true);
  assert.ok(view.profile_completed_at);
  const admin = (await ctx.api("GET", "/users/profile/view", { token: ctx.tokens.admin })).body;
  assert.equal(admin.isProfileComplete, true, "admins aren't asked");
});
