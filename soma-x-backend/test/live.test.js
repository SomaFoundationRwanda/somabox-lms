// Live updates (helpers/live.js): a ticket opens one event stream; browsers are told *what*
// changed (never data), only the ones concerned; a reconnect catches up; streams close when the
// browser goes or the session ends.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, USERS, PASSWORD } from "./helpers.js";

process.env.LIVE_COALESCE_MS = "50";
let ctx;
let live;

before(async () => {
  ctx = await startTestServer();
  live = await import("../src/helpers/live.js");
});

after(async () => {
  live.resetLive();
  await ctx.stop();
});

// Opens a stream as `token` and collects its events.
async function connect(token, last) {
  const { body: { ticket } } = await ctx.api("POST", "/live/ticket", { token });
  const controller = new AbortController();
  const res = await fetch(`${ctx.baseUrl}/live?ticket=${ticket}${last ? `&last=${encodeURIComponent(last)}` : ""}`, { signal: controller.signal });
  assert.equal(res.status, 200);
  const events = [];
  let ended = false;
  let lastId = null;
  (async () => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut;
        while ((cut = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const field = (name) => block.split("\n").find((l) => l.startsWith(`${name}: `))?.slice(name.length + 2);
          if (field("id")) lastId = field("id");
          if (field("event")) events.push({ type: field("event"), ...JSON.parse(field("data") || "{}") });
        }
      }
    } catch { /* aborted */ }
    ended = true;
  })();
  const waitFor = async (match, ms = 3000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const found = events.find(match);
      if (found) return found;
      await new Promise((r) => setTimeout(r, 25));
    }
    return null;
  };
  await waitFor((e) => e.type === "ready");
  return { events, waitFor, close: () => controller.abort(), get ended() { return ended; }, get lastId() { return lastId; } };
}

const settle = () => new Promise((r) => setTimeout(r, 200));

test("a stream needs a fresh, single-use ticket", async () => {
  assert.equal((await fetch(`${ctx.baseUrl}/live`)).status, 401);
  assert.equal((await fetch(`${ctx.baseUrl}/live?ticket=made-up`)).status, 401);
  assert.equal((await ctx.api("POST", "/live/ticket")).status, 401, "signed in only");
  const { body: { ticket } } = await ctx.api("POST", "/live/ticket", { token: ctx.tokens.student });
  const first = new AbortController();
  assert.equal((await fetch(`${ctx.baseUrl}/live?ticket=${ticket}`, { signal: first.signal })).status, 200);
  first.abort();
  assert.equal((await fetch(`${ctx.baseUrl}/live?ticket=${ticket}`)).status, 401, "used once");
});

test("a teacher's change reaches the course's members only; a learner's work reaches its teachers", async () => {
  const courseId = await ctx.createCourse("Live course");
  const learner = await connect(ctx.tokens.student);
  const outsider = await connect(ctx.tokens.outsider);
  const teacher = await connect(ctx.tokens.teacher);

  await ctx.api("POST", `/courses/${courseId}/outcomes`, { token: ctx.tokens.teacher, body: { title: "Count to ten" } });
  await ctx.api("POST", `/courses/${courseId}/outcomes`, { token: ctx.tokens.teacher, body: { title: "Count to twenty" } });
  assert.ok(await learner.waitFor((e) => e.kind === "course" && e.id === courseId));
  await settle();
  assert.equal(learner.events.filter((e) => e.kind === "course").length, 1, "two changes in a row: one event");
  assert.equal(outsider.events.some((e) => e.kind === "course"), false);

  // Reading changes nothing.
  await ctx.api("GET", `/courses/${courseId}/outcomes`, { token: ctx.tokens.teacher });
  await settle();
  assert.equal(learner.events.filter((e) => e.kind === "course").length, 1);

  // Adding someone: their course list changes, and from then on they get the course's events.
  await ctx.api("POST", `/courses/${courseId}/people`, { token: ctx.tokens.teacher, body: { email: USERS.outsider.email } });
  assert.ok(await outsider.waitFor((e) => e.kind === "courses"));
  assert.ok(await teacher.waitFor((e) => e.kind === "course-work" && e.id === courseId), "the teacher's people list");
  await settle();
  await ctx.api("POST", `/courses/${courseId}/outcomes`, { token: ctx.tokens.teacher, body: { title: "Count to fifty" } });
  assert.ok(await outsider.waitFor((e) => e.kind === "course" && e.id === courseId));
  for (const s of [learner, outsider, teacher]) s.close();
});

test("notifications reach their person; school changes reach everyone", async () => {
  const learner = await connect(ctx.tokens.student);
  const other = await connect(ctx.tokens.outsider);
  await ctx.api("POST", "/notifications", { token: ctx.tokens.admin, body: { userEmail: USERS.student.email, title: "Hello", message: "Hi" } });
  assert.ok(await learner.waitFor((e) => e.kind === "notifications"));
  await settle();
  assert.equal(other.events.some((e) => e.kind === "notifications"), false);

  await ctx.api("PUT", "/school", { token: ctx.tokens.admin, body: { primaryColor: "#203A3A" } });
  assert.ok(await learner.waitFor((e) => e.kind === "school"));
  assert.ok(await other.waitFor((e) => e.kind === "school"));
  learner.close();
  other.close();
});

test("a reconnecting browser gets what it missed, or a reset when that can't be known", async () => {
  const first = await connect(ctx.tokens.student);
  await ctx.api("PUT", "/school", { token: ctx.tokens.admin, body: { primaryColor: "#203A3A" } });
  await first.waitFor((e) => e.kind === "school");
  const last = first.lastId;
  first.close();
  await ctx.api("POST", "/notifications", { token: ctx.tokens.admin, body: { userEmail: USERS.student.email, title: "While away", message: "x" } });

  const again = await connect(ctx.tokens.student, last);
  assert.ok(again.events.some((e) => e.kind === "notifications"), "missed while away");
  assert.equal(again.events.some((e) => e.kind === "school"), false, "already seen");
  again.close();

  const afterRestart = await connect(ctx.tokens.student, "another-boot:5");
  assert.ok(afterRestart.events.some((e) => e.type === "reset"));
  afterRestart.close();
});

test("streams close when the browser goes, on sign-out, and when the session ends elsewhere", async () => {
  await settle();
  const before = live.liveStats().streams;
  const s = await connect(ctx.tokens.student);
  assert.equal(live.liveStats().streams, before + 1);
  s.close();
  await settle();
  assert.equal(live.liveStats().streams, before, "forgotten as soon as the browser goes");

  // Sign-out ends that session's stream.
  const token = await ctx.login(USERS.otherTeacher.email);
  const mine = await connect(token);
  await ctx.api("POST", "/auth/logout", { token });
  await settle();
  assert.equal(mine.ended, true);

  // Deactivation ends all of the person's streams.
  const created = await ctx.api("POST", "/users", { token: ctx.tokens.admin, body: { email: "leaving@test.local", password: "temporary1", role: "scholar" } });
  assert.equal(created.status, 201);
  const temp = await ctx.login("leaving@test.local", "temporary1");
  await ctx.api("PATCH", "/users/profile/password", { token: temp, body: { currentPassword: "temporary1", newPassword: PASSWORD } });
  const theirs = await connect(await ctx.login("leaving@test.local"));
  const user = await ctx.db.prepare("SELECT id FROM users WHERE email = 'leaving@test.local'").get();
  await ctx.api("PATCH", `/users/${user.id}/status`, { token: ctx.tokens.admin, body: { isActive: false } });
  await settle();
  assert.equal(theirs.ended, true);

  // A session that expired by itself is found by the periodic check.
  const expiring = await ctx.login(USERS.outsider.email);
  const old = await connect(expiring);
  await ctx.db.prepare("UPDATE sessions SET expires_at = NOW() - INTERVAL '1 minute' WHERE token_hash = encode(sha256(?::bytea), 'hex')").run(expiring);
  await live._checkSessions();
  await settle();
  assert.equal(old.ended, true);
});
