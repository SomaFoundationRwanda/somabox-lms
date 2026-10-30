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
    // Once learners have been scored on this rubric, replacing its criteria would delete those
    // scores. Wording can still change in place; anything that changes the scoring can't.
    const existing = await localDb.prepare("SELECT id FROM rubrics WHERE assignment_id = ?").get(assignment.id);
    if (existing) {
      const scored = await localDb.prepare(`
        SELECT 1 FROM submission_scores ss JOIN rubric_criteria c ON c.id = ss.criterion_id WHERE c.rubric_id = ? LIMIT 1
      `).get(existing.id);
      if (scored) {
        const current = await localDb.prepare("SELECT * FROM rubric_criteria WHERE rubric_id = ? ORDER BY position").all(existing.id);
        const sameScoring = current.length === criteria.length && current.every((c, i) => {
          const n = criteria[i];
          return Number(c.points) === (n.points === undefined ? 4 : Number(n.points))
            && Number(c.weight) === (Number(n.weight) > 0 ? Number(n.weight) : 1)
            && Number(c.outcome_id || 0) === Number(n.outcomeId || 0);
        });
        if (!sameScoring) {
          throw new ItemError(409, "Learners have already been graded with this rubric, so its criteria, points, weights, and outcomes can't change. You can still edit the wording.", "RUBRIC_IN_USE");
        }
        await localDb.prepare("UPDATE rubrics SET title = ? WHERE id = ?").run(name, existing.id);
        for (const [i, c] of current.entries()) {
          await localDb.prepare("UPDATE rubric_criteria SET title = ?, description = ? WHERE id = ?")
            .run(String(criteria[i].title).trim(), String(criteria[i].description || ""), c.id);
        }
        return existing.id;
      }
    }
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
