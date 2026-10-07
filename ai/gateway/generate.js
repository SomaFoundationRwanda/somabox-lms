// Structured generation against the llama.cpp server: grammar-constrained JSON (the schema
// is passed as response_format), parsed and validated here, retried once if invalid.
import { TASKS, buildMessages } from "./tasks.js";
import { validate } from "./validate.js";

export class GenerateError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

async function callRuntime(runtimeUrl, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${runtimeUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) throw new GenerateError("runtime_error", `Model server returned ${res.status}`);
    return await res.json();
  } catch (err) {
    if (err instanceof GenerateError) throw err;
    if (err.name === "AbortError") throw new GenerateError("timeout", "The model took too long to answer");
    throw new GenerateError("runtime_unavailable", "The AI model isn't running on this box");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs one structured task. Returns { result, usage: { promptTokens, completionTokens }, attempts }.
 * Throws GenerateError(code) for unknown_task | runtime_unavailable | runtime_error | timeout | invalid_output.
 */
export async function generate({ task, input = {}, runtimeUrl, timeoutMs = 120000, maxSourceLength = 4000, maxAttempts = 2 }) {
  const def = TASKS[task];
  if (!def) throw new GenerateError("unknown_task", `Unknown task: ${task}`);
  const messages = buildMessages(task, input, { maxSourceLength });
  const usage = { promptTokens: 0, completionTokens: 0 };
  let lastProblems = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await callRuntime(runtimeUrl, {
      messages,
      max_tokens: def.maxTokens,
      temperature: attempt === 1 ? 0.4 : 0.2,
      stream: false,
      response_format: { type: "json_object", schema: def.schema },
    }, timeoutMs);
    usage.promptTokens += Number(response?.usage?.prompt_tokens) || 0;
    usage.completionTokens += Number(response?.usage?.completion_tokens) || 0;

    const text = response?.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      lastProblems = ["$: not valid JSON"];
      continue;
    }
    lastProblems = validate(def.schema, parsed);
    if (lastProblems.length === 0) return { result: parsed, usage, attempts: attempt };
  }
  throw new GenerateError("invalid_output", "The model's answer didn't have the expected shape", lastProblems.slice(0, 10));
}
