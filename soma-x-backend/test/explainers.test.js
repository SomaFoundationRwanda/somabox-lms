// Phase 7: usage events for explainer opens.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer } from "./helpers.js";

let ctx;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });

before(async () => {
  ctx = await startTestServer();
});

after(async () => {
  await ctx.stop();
});

test("explainer opens are logged, only for known event types and the caller's own courses", async () => {
  const courseId = await ctx.createCourse("Help");
  const res = await call("teacher")("POST", "/analytics/events", {
    events: [
      { type: "explainer_opened", courseId, data: { key: "items.quiz", lang: "fr", fallback: false } },
      { type: "explainer_opened", courseId, data: { key: "items.quiz", lang: "en", fallback: false } },
      { type: "made_up_event", data: {} },
    ],
  });
  assert.equal(res.status, 202);
  assert.equal(res.body.stored, 2);

  // An outsider can't attribute events to a course they aren't in.
  await call("outsider")("POST", "/analytics/events", { events: [{ type: "explainer_opened", courseId, data: { key: "pages.grades" } }] });
  const row = await ctx.db.prepare("SELECT course_id FROM usage_events WHERE data->>'key' = 'pages.grades'").get();
  assert.equal(row.course_id, null);

  assert.equal((await call("teacher")("POST", "/analytics/events", { events: [] })).status, 400);
  assert.equal((await call("teacher")("POST", "/analytics/events", { events: Array(51).fill({ type: "explainer_opened" }) })).status, 400);

  const usage = await call("admin")("GET", "/analytics/explainer-usage");
  assert.equal(usage.status, 200);
  assert.deepEqual(usage.body.explainers[0], { key: "items.quiz", opens: 2, people: 1 });
  assert.equal((await call("teacher")("GET", "/analytics/explainer-usage")).status, 403);
});
