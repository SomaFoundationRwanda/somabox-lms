// The context the LMS sends with every AI request, assembled on the server so teachers never
// write prompts: course, grade level, module, outcomes (with codes), and the teacher's language.
import { localDb } from "../../helpers/db-manager.js";

const LANGUAGES = ["en", "fr", "rw", "sw", "es"];

export async function buildContext({ courseId, moduleId, userId }) {
  const course = await localDb.prepare("SELECT title, grade FROM courses WHERE id = ?").get(courseId);
  const module = moduleId ? await localDb.prepare("SELECT title, kind, week_offset FROM modules WHERE id = ? AND course_id = ?").get(moduleId, courseId) : null;
  const outcomes = await localDb.prepare("SELECT id, code, title FROM outcomes WHERE course_id = ? ORDER BY id").all(courseId);
  const user = userId ? await localDb.prepare("SELECT preferred_language FROM users WHERE id = ?").get(userId) : null;
  const language = LANGUAGES.includes(user?.preferred_language) ? user.preferred_language : "en";
  return {
    courseTitle: course?.title || "",
    gradeLevel: course?.grade || "",
    moduleTitle: module ? (module.kind === "baseline" ? `Week 0 (baseline): ${module.title}` : `Week ${module.week_offset}: ${module.title}`) : "",
    outcomes: uniqueCodes(outcomes),
    language,
  };
}

/** Maps an outcome code the model returned back to the course's outcome id (or null). */
export function outcomeIdFor(context, code) {
  const match = context.outcomes.find((o) => String(o.code).toLowerCase() === String(code || "").toLowerCase());
  return match ? match.id : null;
}

// The model refers to outcomes by code, so codes must be unique. Older courses often have the
// column default "OUT-1" on every outcome: repeated codes are replaced by OUT-<position>.
function uniqueCodes(outcomes) {
  const counts = new Map();
  for (const o of outcomes) counts.set(o.code, (counts.get(o.code) || 0) + 1);
  return outcomes.map((o, i) => ({
    id: o.id,
    title: o.title,
    code: o.code && counts.get(o.code) === 1 ? o.code : `OUT-${i + 1}`,
  }));
}
