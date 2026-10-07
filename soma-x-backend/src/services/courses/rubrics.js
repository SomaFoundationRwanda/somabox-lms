// Saving an assignment's rubric (used by the rubric route and by approving an AI rubric draft).
import { localDb } from "../../helpers/db-manager.js";
import { ItemError } from "./items.js";

/**
 * Creates or replaces the rubric of `assignment` ({ id, title }) from
 * { title?, criteria: [{ title, description?, points?, weight?, outcomeId? }] }. Returns its id.
 */
export async function saveRubric(courseId, assignment, { title, criteria }) {
  if (!Array.isArray(criteria) || criteria.length === 0) throw new ItemError(400, "A rubric needs at least one criterion");
  for (const [i, c] of criteria.entries()) {
    if (!String(c?.title || "").trim()) throw new ItemError(400, `Criterion ${i + 1} needs a title`);
    if (c?.points !== undefined && (!Number.isFinite(Number(c.points)) || Number(c.points) < 0)) {
      throw new ItemError(400, `Criterion ${i + 1}: points must be 0 or more`);
    }
    if (c?.outcomeId) {
      const outcome = await localDb.prepare("SELECT id FROM outcomes WHERE id = ? AND course_id = ?").get(c.outcomeId, courseId);
      if (!outcome) throw new ItemError(400, `Criterion ${i + 1} is tagged with an outcome from another course`);
    }
  }

  return await localDb.transaction(async () => {
    const name = String(title || "").trim() || `${assignment.title} rubric`;
    const saved = await localDb.prepare(`
      INSERT INTO rubrics (course_id, assignment_id, title) VALUES (?, ?, ?)
      ON CONFLICT (assignment_id) DO UPDATE SET title = excluded.title
      RETURNING id
    `).get(courseId, assignment.id, name);
    await localDb.prepare("DELETE FROM rubric_criteria WHERE rubric_id = ?").run(saved.id);
    for (const [pos, c] of criteria.entries()) {
      await localDb.prepare(`
        INSERT INTO rubric_criteria (rubric_id, outcome_id, title, description, points, weight, position)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(saved.id, c.outcomeId || null, String(c.title).trim(), String(c.description || ""),
        c.points === undefined ? 4 : Number(c.points), Number(c.weight) > 0 ? Number(c.weight) : 1, pos);
    }
    return saved.id;
  })();
}
