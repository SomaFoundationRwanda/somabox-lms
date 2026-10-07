// Client for the AI gateway's structured endpoint. Every call is logged in ai_calls
// (feature, task, outcome, tokens, latency) so admins can see usage per teacher.
import { localDb } from "../../helpers/db-manager.js";

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const MESSAGES = {
  runtime_unavailable: "The AI model isn't running on this box. Ask your administrator to start it.",
  busy: "The AI assistant is busy with other teachers' requests. Try again in a few minutes.",
  timeout: "The AI model took too long to answer. Try again, or ask for less at once.",
  invalid_output: "The AI couldn't produce a usable answer this time. Try again or rephrase.",
  unreachable: "The AI service can't be reached on this box.",
};

export const gatewayUrl = () => process.env.AI_GATEWAY_URL || "http://127.0.0.1:5000";

export async function logAiCall({ userId, courseId, feature, task, ok, errorCode, promptTokens, completionTokens, latencyMs }) {
  try {
    await localDb.prepare(`
      INSERT INTO ai_calls (user_id, course_id, feature, task, ok, error_code, prompt_tokens, completion_tokens, latency_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId || null, courseId || null, feature, task || null, ok, errorCode || null, promptTokens ?? null, completionTokens ?? null, latencyMs ?? null);
  } catch (error) {
    console.error("Failed to log AI call:", error.message);
  }
}

/** Runs a structured task on the gateway. Returns the validated result object or throws AiError. */
export async function generateStructured({ task, input, userId, courseId, feature }) {
  const started = Date.now();
  let body = null;
  let status = 0;
  try {
    const res = await fetch(`${gatewayUrl()}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, input }),
      signal: AbortSignal.timeout(Number(process.env.AI_REQUEST_TIMEOUT_MS) || 300000),
    });
    status = res.status;
    body = await res.json().catch(() => null);
  } catch {
    await logAiCall({ userId, courseId, feature, task, ok: false, errorCode: "unreachable", latencyMs: Date.now() - started });
    throw new AiError("unreachable", MESSAGES.unreachable);
  }
  if (!body?.ok) {
    const code = body?.code || (status === 503 ? "busy" : "runtime_error");
    await logAiCall({ userId, courseId, feature, task, ok: false, errorCode: code, latencyMs: Date.now() - started });
    throw new AiError(code, MESSAGES[code] || body?.error || "The AI request failed");
  }
  await logAiCall({
    userId, courseId, feature, task, ok: true,
    promptTokens: body.usage?.prompt_tokens, completionTokens: body.usage?.completion_tokens, latencyMs: Date.now() - started,
  });
  return body.result;
}
