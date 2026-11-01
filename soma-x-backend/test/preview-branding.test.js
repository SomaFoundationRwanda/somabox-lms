// Visitors open the box's learning content freely; the school's look is the admin's; the
// school's location is everyone's (nobody is asked).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { startTestServer, USERS, PASSWORD } from "./helpers.js";

process.env.EXPLORE_COVERS = "off";
let ctx;
let db;
let content;
const tag = `p${process.pid}`;
const asAdmin = (method, url, body) => ctx.api(method, url, { token: ctx.tokens.admin, body });

function put(rel, body) {
  const file = path.join(content, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (typeof body === "number") {
    fs.writeFileSync(file, "");
    fs.truncateSync(file, body); // a large (sparse) file
  } else fs.writeFileSync(file, body);
}

/** A visitor: keeps the cookies the box sets, like a browser. */
function visitor() {
  let cookie = "";
  const call = async (method, url, { body, headers = {} } = {}) => {
    const res = await fetch(`${ctx.baseUrl}${url}`, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { cookie } : {}), ...headers },
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return res;
  };
  return { call };
}

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
  ({ config: { paths: { content } } } = await import("../src/config/index.js"));
  put(`custom-content/${tag}/lesson.mp4`, 40 * 1024 * 1024);
  put(`custom-content/${tag}/story.pdf`, "%PDF-1.4 a short story");
  put(`custom-content/${tag}/song.mp3`, "audio");
  put(`custom-content/${tag}/extra.pdf`, "%PDF-1.4 more");
  put(`custom-content/${tag}/hidden.pdf`, "%PDF-1.4 secret");
  put(`library/${tag}/reader.epub`, "epub");
  await asAdmin("POST", "/content/manager/rescan");
  await asAdmin("PATCH", "/content/manager/toggle", { target: "content", path_key: `custom-content/${tag}/hidden.pdf`, is_disabled: true });
});

after(async () => {
  for (const root of ["custom-content", "library"]) fs.rmSync(path.join(content, root, tag), { recursive: true, force: true });
  fs.rmSync(path.join(content, "branding"), { recursive: true, force: true });
  await ctx.stop();
});

test("visitors open Explore and Library items in full, as often as they like; hidden ones stay hidden", async () => {
  const v = visitor();
  const video = `custom-content/${tag}/lesson.mp4`;
  const late = await v.call("GET", `/content/files/${video}`, { headers: { Range: "bytes=20000000-20000009" } });
  assert.equal(late.status, 206, "the whole video, not just its beginning");
  for (const item of ["story.pdf", "song.mp3", "extra.pdf"]) {
    assert.equal((await v.call("GET", `/content/files/custom-content/${tag}/${item}`)).status, 200, `${item}: no limit on items`);
  }
  const lib = (await (await fetch(`${ctx.baseUrl}/library/books`)).json()).find((b) => b.path_key === `library/${tag}/reader.epub`);
  assert.equal((await v.call("GET", `/library/file/${lib.id}`)).status, 200, "library books too");
  assert.equal((await v.call("GET", `/content/files/custom-content/${tag}/hidden.pdf`)).status, 404);
  assert.equal((await v.call("POST", "/content/preview", { body: { path: video } })).status, 404, "no previews to start any more");
});

test("the school's name, logo and colours are the admin's, and anyone can see them", async () => {
  const before = (await ctx.api("GET", "/school/public")).body;
  assert.deepEqual([before.configured, before.logoUrl, before.primaryColor], [false, null, "#203A3A"], "the default name isn't taken for a real one");

  assert.equal((await asAdmin("PUT", "/school", { primaryColor: "blue" })).status, 400);
  const saved = await asAdmin("PUT", "/school", { name: "GS Rugando", primaryColor: "#0b5394", secondaryColor: "#f1c232" });
  assert.equal(saved.status, 200);
  const logo = await sharp({ create: { width: 1000, height: 600, channels: 4, background: "#0b5394" } }).png().toBuffer();
  const form = new FormData();
  form.append("logo", new Blob([logo], { type: "image/png" }), "logo.png");
  const up = await fetch(`${ctx.baseUrl}/school/logo`, { method: "POST", headers: { Authorization: `Bearer ${ctx.tokens.admin}` }, body: form });
  assert.equal(up.status, 201);
  const pub = (await ctx.api("GET", "/school/public")).body;
  assert.deepEqual([pub.name, pub.configured, pub.primaryColor, pub.secondaryColor], ["GS Rugando", true, "#0B5394", "#F1C232"]);
  assert.match(pub.logoUrl, /^\/branding\/logo-\d+\.png$/);
  const img = await fetch(`${ctx.baseUrl}${pub.logoUrl}`);
  assert.equal(img.status, 200, "the logo is public (login page)");
  const meta = await sharp(Buffer.from(await img.arrayBuffer())).metadata();
  assert.ok(meta.width <= 512 && meta.height <= 512, "resized for the screen");

  const bad = new FormData();
  bad.append("logo", new Blob(["<svg onload=alert(1)>"], { type: "image/svg+xml" }), "logo.svg");
  assert.equal((await fetch(`${ctx.baseUrl}/school/logo`, { method: "POST", headers: { Authorization: `Bearer ${ctx.tokens.admin}` }, body: bad })).status, 400);
  assert.equal((await fetch(`${ctx.baseUrl}/school/logo`, { method: "POST", headers: { Authorization: `Bearer ${ctx.tokens.teacher}` }, body: form })).status, 403);
  assert.equal((await asAdmin("DELETE", "/school/logo")).body.logoUrl, null, "back to the SOMABOX logo");
  assert.equal((await fetch(`${ctx.baseUrl}${pub.logoUrl}`)).status, 404);
});

test("the school's location is everyone's; learners and teachers are never asked", async () => {
  await asAdmin("PUT", "/school", { province: "Northern Province", district: "Musanze", isRural: true });
  for (const email of [USERS.student.email, USERS.teacher.email]) {
    const row = await db.prepare("SELECT region_province, region_district, is_rural FROM users WHERE email = ?").get(email);
    assert.deepEqual([row.region_province, row.region_district, Number(row.is_rural)], ["Northern Province", "Musanze", 1], email);
  }
  const admin = await db.prepare("SELECT region_district FROM users WHERE email = ?").get(USERS.admin.email);
  assert.notEqual(admin.region_district, "Musanze", "admins aren't changed");

  // A new learner: profile done with only gender, accessibility and grade; location is the school's.
  const reg = await ctx.api("POST", "/auth/register", { body: { email: "rural@test.local", password: PASSWORD, fullName: "Rural", className: "P4" } });
  const token = reg.body.token;
  const done = await ctx.api("PATCH", "/users/profile/update", { token, body: { fullName: "Rural", gender: "male", disabilityStatus: "none", gradeLevel: "S1", regionProvince: "Kigali", isRural: false, completeProfile: true } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  const me = (await ctx.api("GET", "/users/profile/view", { token })).body;
  assert.deepEqual([me.isProfileComplete, me.region_province, me.region_district, Number(me.is_rural)], [true, "Northern Province", "Musanze", 1], "what they sent for location is ignored");

  // A teacher's profile is complete without location too.
  const t = await ctx.api("PATCH", "/users/profile/update", { token: ctx.tokens.otherTeacher, body: { fullName: "T2", gender: "female", disabilityStatus: "none", completeProfile: true } });
  assert.equal(t.status, 200, JSON.stringify(t.body));
});
