// One box, one school: the admin sets the school once; learners get a learner code from the
// school's code and aren't asked for the school or rural/urban. Sync tells the cloud which box
// it is (hardware identity) and how syncing has gone.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { startTestServer, PASSWORD } from "./helpers.js";

let ctx;
let db;
const asAdmin = (method, url, body) => ctx.api(method, url, { token: ctx.tokens.admin, body });
const register = (email) => ctx.api("POST", "/auth/register", { body: { email, password: PASSWORD, fullName: email.split("@")[0] } });

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
});

after(async () => {
  delete process.env.SYNC_URL;
  delete process.env.DEVICE_INFO_PATH;
  await ctx.stop();
});

test("admins set the school once; new learners get its details and a learner code", async () => {
  const before = (await ctx.api("GET", "/school", { token: ctx.tokens.student })).body;
  assert.equal(before.code, "SPS", "derived from the default name 'SOMABOX Partner School'");
  assert.equal(before.nextLearnerNumber, undefined, "only admins see the counter");

  assert.equal((await ctx.api("PUT", "/school", { token: ctx.tokens.teacher, body: { name: "x" } })).status, 403);
  assert.equal((await asAdmin("PUT", "/school", { code: "g s k" })).status, 400);
  const saved = await asAdmin("PUT", "/school", { name: "Groupe Scolaire Kigali", code: "gsk", province: "Kigali", district: "Gasabo", isRural: true });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual([saved.body.code, saved.body.isRural], ["GSK", true]);
  const existing = await db.prepare("SELECT school_name, is_rural FROM users WHERE role = 'scholar' LIMIT 1").get();
  assert.deepEqual([existing.school_name, Number(existing.is_rural)], ["Groupe Scolaire Kigali", 1], "every learner on the box follows the school");

  const res = await register("newlearner@test.local");
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const code = res.body.user.learner_code;
  assert.match(code, /^GSK-\d{4}$/);
  const row = await db.prepare("SELECT school_name, is_rural FROM users WHERE email = 'newlearner@test.local'").get();
  assert.deepEqual([row.school_name, Number(row.is_rural)], ["Groupe Scolaire Kigali", 1]);

  // They can sign in with the code instead of their email.
  const byCode = await ctx.api("POST", "/auth/login", { body: { email: code.toLowerCase(), password: PASSWORD } });
  assert.equal(byCode.status, 200, JSON.stringify(byCode.body));
  assert.equal(byCode.body.user.learner_code, code);
  assert.equal((await ctx.api("POST", "/auth/login", { body: { email: "GSK-9999", password: PASSWORD } })).status, 401);

  // The profile step doesn't ask rural/urban when the school has set it.
  const token = byCode.body.token;
  const profile = await ctx.api("PATCH", "/users/profile/update", { token, body: { fullName: "New", gender: "male", regionProvince: "Kigali", regionDistrict: "Gasabo", gradeLevel: "P4", disabilityStatus: "none", completeProfile: true } });
  assert.equal(profile.status, 200, JSON.stringify(profile.body));
  const view = (await ctx.api("GET", "/users/profile/view", { token })).body;
  assert.deepEqual([view.isProfileComplete, view.learner_code, view.school.name, view.school.isRural], [true, code, "Groupe Scolaire Kigali", true]);
});

test("learner codes stay unique when many sign up at once; a new school code applies to new learners only", async () => {
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => register(`rush${i}@test.local`)));
  const codes = results.map((r) => r.body.user.learner_code);
  assert.equal(new Set(codes).size, 8);
  const first = codes.sort()[0];

  await asAdmin("PUT", "/school", { code: "GSKB" });
  const later = await register("later@test.local");
  assert.match(later.body.user.learner_code, /^GSKB-\d{4}$/);
  assert.equal((await db.prepare("SELECT learner_code FROM users WHERE email = 'rush0@test.local'").get()).learner_code.startsWith("GSK-"), true, "existing codes don't change");
  assert.ok(first);

  // Admin-created learners get a code too; teachers don't.
  const made = await asAdmin("POST", "/users", { email: "byadmin@test.local", password: PASSWORD, role: "scholar", fullName: "By Admin" });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.match(made.body.user.learner_code, /^GSKB-\d{4}$/);
  const teacher = await asAdmin("POST", "/users", { email: "newteacher@test.local", password: PASSWORD, role: "teacher", fullName: "T" });
  assert.equal(teacher.body.user.learner_code, null);
});

test("sync tells the cloud which box this is and how syncing has gone, even with nothing new", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "somabox-device-"));
  const file = path.join(dir, "device.json");
  fs.writeFileSync(file, JSON.stringify({ serialNumber: "SBX-2026-0042", machineId: "abc123", macAddresses: [{ interface: "eth0", mac: "b8:27:eb:12:34:56", physical: true }], model: "Raspberry Pi 5", collectedAsRoot: true }));
  process.env.DEVICE_INFO_PATH = file;

  const bodies = [];
  const cloud = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => { b += d; });
    req.on("end", () => { bodies.push(JSON.parse(b)); res.writeHead(200); res.end("{}"); });
  });
  await new Promise((r) => cloud.listen(0, r));
  process.env.SYNC_URL = `http://127.0.0.1:${cloud.address().port}/`;
  try {
    const status = (await asAdmin("GET", "/sync/status")).body;
    assert.deepEqual([status.device.source, status.device.serialNumber, status.device.macAddresses[0].mac], ["script", "SBX-2026-0042", "b8:27:eb:12:34:56"]);

    const first = await asAdmin("POST", "/sync/run");
    assert.equal(first.body.status, "ok");
    const batch = bodies[0];
    assert.equal(batch.device.serialNumber, "SBX-2026-0042");
    assert.equal(batch.device.model, "Raspberry Pi 5");
    assert.ok(Array.isArray(batch.history));
    assert.ok(batch.records.length > 0);

    bodies.length = 0;
    const again = await asAdmin("POST", "/sync/run");
    assert.equal(again.body.status, "nothing_to_send");
    assert.equal(bodies.length, 1, "a heartbeat still goes out");
    assert.deepEqual(bodies[0].records, []);
    assert.ok(bodies[0].history.some((h) => h.status === "ok"), "the cloud sees the earlier run");

    // Without the script's file the server reports what it can see itself.
    process.env.DEVICE_INFO_PATH = path.join(dir, "missing.json");
    const fallback = (await asAdmin("GET", "/sync/status")).body.device;
    assert.equal(fallback.source, "server");
    assert.ok(fallback.hostname);
  } finally {
    await new Promise((r) => cloud.close(r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
