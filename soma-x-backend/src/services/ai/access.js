// Who may use AI: teachers and admins (guide §12.2, decided: admins too), unless an admin has
// switched AI off for the whole school or for that person.
import { localDb } from "../../helpers/db-manager.js";

export async function schoolAiEnabled() {
  const row = await localDb.prepare("SELECT value FROM system_settings WHERE key = 'ai_enabled'").get();
  return row ? row.value !== false && row.value !== "false" : true;
}

/** { allowed, reason } for the session user. */
export async function aiAccess(user) {
  if (!user) return { allowed: false, reason: "Please log in to continue" };
  if (!["teacher", "admin"].includes(user.role)) return { allowed: false, reason: "The AI assistant is for teachers" };
  if (!await schoolAiEnabled()) return { allowed: false, reason: "The AI assistant is switched off for this school" };
  const row = await localDb.prepare("SELECT ai_enabled FROM users WHERE id = ?").get(user.id);
  if (row && row.ai_enabled === false) return { allowed: false, reason: "The AI assistant is switched off for your account" };
  return { allowed: true, reason: null };
}

/** Express middleware form. */
export async function requireAi(req, res, next) {
  try {
    const access = await aiAccess(req.user);
    if (!access.allowed) return res.status(403).json({ message: access.reason, code: "AI_DISABLED" });
    next();
  } catch (error) {
    next(error);
  }
}
