// Structured generation against a fake llama.cpp server (same /v1/chat/completions API).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { generate, GenerateError } from "../generate.js";
import { TASKS, buildMessages } from "../tasks.js";
import { validate } from "../validate.js";

let server;
let runtimeUrl;
let replies = [];
let requests = [];

before(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      requests.push(JSON.parse(body));
      const next = replies.shift();
      if (next === "500") { res.writeHead(500); res.end(); return; }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: next } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }));
    });
  });
  await new Promise((r) => server.listen(0, r));
  runtimeUrl = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const goodQuiz = JSON.stringify({
  title: "Fractions check",
  questions: [{ prompt: "What is 1/2 + 1/4?", options: ["3/4", "2/6", "1/8"], correctIndex: 0, points: 1, outcomeCode: "OUT-1" }],
});

test("returns validated JSON and asks the runtime for schema-constrained output", async () => {
  replies = [goodQuiz];
  requests = [];
  const out = await generate({ task: "quiz", input: { language: "fr", outcomes: [{ code: "OUT-1", title: "Add fractions" }] }, runtimeUrl });
  assert.equal(out.result.title, "Fractions check");
  assert.equal(out.attempts, 1);
  assert.deepEqual(out.usage, { promptTokens: 100, completionTokens: 50 });
  assert.deepEqual(requests[0].response_format.schema, TASKS.quiz.schema);
  assert.match(requests[0].messages[0].content, /French/);
  assert.match(requests[0].messages[1].content, /OUT-1: Add fractions/);
});

test("retries once when the output is invalid, then gives up with the problems", async () => {
  replies = ["not json", goodQuiz];
  const ok = await generate({ task: "quiz", input: {}, runtimeUrl });
  assert.equal(ok.attempts, 2);

  replies = [JSON.stringify({ title: "x" }), JSON.stringify({ title: "Quiz", questions: [] })];
  await assert.rejects(generate({ task: "quiz", input: {}, runtimeUrl }), (err) => err instanceof GenerateError && err.code === "invalid_output" && err.details.length > 0);
});

test("explains when the model isn't running or the task is unknown", async () => {
  await assert.rejects(generate({ task: "quiz", input: {}, runtimeUrl: "http://127.0.0.1:9" }), (err) => err.code === "runtime_unavailable");
  replies = ["500"];
  await assert.rejects(generate({ task: "quiz", input: {}, runtimeUrl }), (err) => err.code === "runtime_error");
  await assert.rejects(generate({ task: "nope", input: {}, runtimeUrl }), (err) => err.code === "unknown_task");
});

test("every task has a prompt template and a schema the validator accepts", () => {
  for (const task of Object.keys(TASKS)) {
    const messages = buildMessages(task, { language: "sw", moduleTitle: "Week 1" });
    assert.match(messages[1].content, /Week\/module: Week 1/, task);
    assert.match(messages[0].content, /Swahili/);
  }
  assert.deepEqual(validate(TASKS.rubric.schema, { criteria: [{ title: "Argument", description: "Clear", points: 4, outcomeCode: "OUT-1" }] }), ["$.criteria: needs at least 2 items"]);
  assert.ok(validate(TASKS.quiz.schema, JSON.parse(goodQuiz)).length === 0);
  assert.ok(validate(TASKS.page.schema, { title: "T", sections: [], extra: 1 }).some((p) => p.includes("not allowed")));
});
