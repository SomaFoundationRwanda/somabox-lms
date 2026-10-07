// Outcomes, item outcome tags, baseline, and outcome mastery.
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import {
  requireTeacher,
  requireEnrolled,
  requireNavVisible,
  courseExists,
} from "./shared.js";
import { CONTENT_TABLES, GRADED_TYPES, sendItemError, setItemOutcomes } from "./items.js";
import { computeMastery } from "./results.js";

const router = express.Router();

// ===== Outcomes =====

router.get("/:id/outcomes", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireNavVisible(req, res, courseId, "outcomes")) return;
    const rows = await localDb.prepare("SELECT * FROM outcomes WHERE course_id = ? ORDER BY created_at DESC").all(courseId);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching outcomes:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/outcomes", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });
    const masteryScale = ["4pt", "percent", "pass_fail"].includes(req.body.masteryScale) ? req.body.masteryScale : "4pt";

    const info = await localDb.prepare("INSERT INTO outcomes (course_id, title, description, mastery_scale) VALUES (?, ?, ?, ?)")
      .run(courseId, title, req.body.description || "", masteryScale);
    return res.status(201).json(await localDb.prepare("SELECT * FROM outcomes WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error creating outcome:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/outcomes/:outcomeId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { title, description, masteryScale } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (masteryScale !== undefined && ["4pt", "percent", "pass_fail"].includes(masteryScale)) { updates.push("mastery_scale = ?"); params.push(masteryScale); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.outcomeId, courseId);
    await localDb.prepare(`UPDATE outcomes SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    return res.json(await localDb.prepare("SELECT * FROM outcomes WHERE id = ?").get(req.params.outcomeId));
  } catch (error) {
    console.error("Error updating outcome:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/outcomes/:outcomeId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    await localDb.prepare("DELETE FROM outcomes WHERE id = ? AND course_id = ?").run(req.params.outcomeId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting outcome:", error);
    return res.status(500).json({ message: error.message });
  }
});


// Item outcomes routes
router.get("/:id/item-outcomes", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireEnrolled(req, res, courseId)) return;
    const rows = await localDb.prepare(`
      SELECT io.*, o.title AS outcome_title, o.code AS outcome_code
      FROM item_outcomes io
      JOIN outcomes o ON o.id = io.outcome_id
      WHERE io.course_id = ?
    `).all(courseId);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/item-outcomes", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const { itemType, itemId, outcomeIds } = req.body;
    if (!itemType || !itemId || !Array.isArray(outcomeIds)) {
      return res.status(400).json({ message: "itemType, itemId, and outcomeIds array required" });
    }
    if (!CONTENT_TABLES[itemType]) return res.status(400).json({ message: "itemType must be page, assignment, quiz, or discussion" });
    const item = await localDb.prepare(`SELECT id, published FROM ${CONTENT_TABLES[itemType]} WHERE id = ? AND course_id = ?`).get(itemId, courseId);
    if (!item) return res.status(404).json({ message: "Item not found in this course" });
    // A published graded item must keep at least one outcome.
    if (Number(item.published) === 1 && GRADED_TYPES.includes(itemType) && outcomeIds.filter(Boolean).length === 0) {
      const quiz = itemType === "quiz" ? await localDb.prepare("SELECT kind FROM quizzes WHERE id = ?").get(item.id) : null;
      if (quiz?.kind !== "practice") {
        return res.status(422).json({ message: "A published graded item needs at least one outcome. Unpublish it first to remove all outcomes.", code: "OUTCOME_REQUIRED" });
      }
    }
    await localDb.transaction(() => setItemOutcomes(courseId, itemType, item.id, outcomeIds.filter(Boolean)))();
    return res.json({ message: "Item outcomes updated", itemCount: outcomeIds.length });
  } catch (error) {
    if (sendItemError(res, error)) return;
    return res.status(500).json({ message: error.message });
  }
});


// Outcome Mastery vs Baseline calculation
router.get("/:id/outcome-mastery", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    // From outcome_results only (percentages). Learners see their own; staff see the class.
    const isStudent = auth.enrollment.role === "student";
    const outcomes = await computeMastery(courseId, { userId: isStudent ? req.user.id : null });
    const tagged = await localDb.prepare("SELECT outcome_id, COUNT(*) AS c FROM item_outcomes WHERE course_id = ? GROUP BY outcome_id").all(courseId);
    const taggedBy = new Map(tagged.map((t) => [Number(t.outcome_id), Number(t.c)]));
    const students = await localDb.prepare("SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").get(courseId);
    return res.json({
      outcomes: outcomes.map((o) => ({ ...o, taggedItemsCount: taggedBy.get(Number(o.id)) || 0 })),
      totalStudents: Number(students?.c || 0),
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export default router;
