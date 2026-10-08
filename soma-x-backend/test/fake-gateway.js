// A stand-in for the AI gateway's POST /generate, returning valid structured results for each
// task (the real gateway validates the model's output against the same shapes).
import http from "node:http";

const q = (prompt, outcomeCode = "OUT-1", correctIndex = 0) => ({ prompt, options: ["Right", "Wrong", "Also wrong"], correctIndex, points: 1, outcomeCode });

export const RESULTS = {
  outline: {
    outcomes: [{ code: "OUT-1", title: "Add fractions", description: "With unlike denominators" }, { code: "OUT-2", title: "Compare fractions", description: "" }],
    modules: [{ week: 1, title: "What is a fraction?", description: "Parts of a whole" }, { week: 2, title: "Adding fractions", description: "" }],
  },
  outcome_rewrite: {
    title: "Add fractions with unlike denominators",
    description: "Learners find a common denominator and add.",
    masteryLevels: [4, 3, 2, 1].map((p) => ({ level: `L${p}`, points: p, description: `Level ${p} work` })),
  },
  quiz: { title: "Fractions check", questions: [q("1/2 + 1/4?"), q("Which is bigger?", "OUT-2", 1)] },
  rubric: { criteria: [{ title: "Method", description: "Shows the steps", points: 4, outcomeCode: "OUT-1" }, { title: "Answer", description: "Correct result", points: 4, outcomeCode: "OUT-2" }] },
  story: { title: "Amina's market", paragraphs: ["Amina sells mangoes at the market every Saturday.", "She cuts each mango into halves and quarters."], questions: [q("What does Amina sell?"), q("How does she cut them?")], discussionPrompt: "When have you shared something equally?" },
  page: { title: "Fractions around us", sections: [{ heading: "Halves", body: "A half is one of two equal parts.\n\nFold a paper in two." }] },
  assignment: { title: "Fraction poster", instructions: "1. Draw three fractions.\n2. Label them.", pointsPossible: 10, outcomeCode: "OUT-1" },
  grading_suggestion: null, // built from the request's criteria
  notes: { notes: ["The text explains how to share things equally.", "A quarter is one of four equal parts."] },
  content_summary: { overview: "This book shows learners how to share things equally and what fractions like a quarter mean.", keyPoints: ["Sharing equally means everyone gets the same amount.", "A quarter is one of four equal parts.", "Fractions are written with a top and bottom number."], questions: ["Where do you share things equally at home?"] },
  class_summary: { summary: "Most learners can add fractions.", suggestions: ["Reteach comparing fractions with drawings."] },
};

export async function startFakeGateway() {
  const state = { fail: null, delayMs: 0, requests: [] };
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", async () => {
      const send = (status, obj) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
      if (req.url === "/health") return send(200, { status: "healthy", runtime_connected: true });
      const { task, input } = JSON.parse(body || "{}");
      state.requests.push({ task, input });
      if (state.delayMs) await new Promise((r) => setTimeout(r, state.delayMs));
      if (state.fail) return send(503, { ok: false, code: state.fail, error: "fake failure" });
      let result = RESULTS[task];
      if (task === "grading_suggestion") {
        result = { scores: input.criteria.map((c) => ({ criterionId: c.id, points: Math.min(3, c.points), reason: "Mostly correct" })).concat([{ criterionId: 999999, points: 9, reason: "not a real criterion" }]), feedback: "Good method. Check your final answer." };
      }
      if (!result) return send(400, { ok: false, code: "unknown_task" });
      return send(200, { ok: true, result, usage: { prompt_tokens: 120, completion_tokens: 80 }, latency_ms: 5 });
    });
  });
  await new Promise((r) => server.listen(0, r));
  return { url: `http://127.0.0.1:${server.address().port}`, state, stop: () => new Promise((r) => server.close(r)) };
}
