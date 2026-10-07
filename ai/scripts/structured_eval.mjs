#!/usr/bin/env node
// Quality gate for structured AI output on a real box (needs the runtime and gateway running).
// Runs every LMS task in English, French, Kinyarwanda, and Swahili through POST /generate and
// reports: valid JSON per task and language (the gateway validates against the schema),
// whether outcome codes are ones we sent, and latency. Exits 1 if any task fails.
//
//   node ai/scripts/structured_eval.mjs [gatewayUrl]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GATEWAY = process.argv[2] || process.env.AI_GATEWAY_URL || "http://127.0.0.1:5000";
const outcomes = [{ code: "OUT-1", title: "Add fractions with unlike denominators" }, { code: "OUT-2", title: "Compare fractions" }];
const base = { courseTitle: "Mathematics P5", gradeLevel: "Primary 5", moduleTitle: "Week 2: Adding fractions", outcomes };
const CASES = {
  outline: { ...base, topic: "Fractions for Primary 5", weeks: 4 },
  outcome_rewrite: { ...base, goal: "learners should get fractions" },
  quiz: { ...base, count: 4 },
  rubric: { ...base, assignmentTitle: "Fraction poster", instructions: "Draw and label three fractions." },
  story: { ...base, idea: "A girl shares mangoes with her friends at the market" },
  page: base,
  assignment: base,
  grading_suggestion: { ...base, assignmentTitle: "Fraction poster", criteria: [{ id: 11, title: "Method", points: 4 }, { id: 12, title: "Answer", points: 4 }], submissionText: "1/2 + 1/4 = 2/6 because I add the tops and the bottoms." },
  class_summary: { ...base, stats: { "OUT-1": { mastery: 72, learners: 30 }, "OUT-2": { mastery: 48, learners: 30 } } },
};
const LANGS = ["en", "fr", "rw", "sw"];
const codes = new Set(outcomes.map((o) => o.code));
const usedCodes = (r) => JSON.stringify(r).match(/"outcomeCode":"([^"]+)"/g)?.map((m) => m.split('"')[3]) || [];

const rows = [];
let failures = 0;
for (const [task, input] of Object.entries(CASES)) {
  for (const language of LANGS) {
    const started = Date.now();
    let status = "ok";
    let note = "";
    try {
      const res = await fetch(`${GATEWAY}/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, input: { ...input, language } }) });
      const body = await res.json();
      if (!body.ok) {
        status = body.code || "error";
        note = (body.details || []).slice(0, 2).join("; ") || body.error;
      } else {
        const bad = usedCodes(body.result).filter((c) => !codes.has(c));
        if (bad.length) { status = "bad_codes"; note = bad.join(","); }
        else note = `${body.attempts} attempt(s), ${body.usage.completion_tokens} tokens`;
      }
    } catch (err) {
      status = "unreachable";
      note = err.message;
    }
    if (status !== "ok") failures += 1;
    rows.push({ task, language, status, seconds: ((Date.now() - started) / 1000).toFixed(1), note });
    console.log(`${status === "ok" ? "PASS" : "FAIL"} ${task.padEnd(18)} ${language}  ${rows.at(-1).seconds}s  ${note}`);
  }
}
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `structured_eval_${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
fs.writeFileSync(file, JSON.stringify(rows, null, 2));
console.log(`\n${rows.length - failures}/${rows.length} passed. Results: ${file}`);
process.exit(failures ? 1 : 0);
