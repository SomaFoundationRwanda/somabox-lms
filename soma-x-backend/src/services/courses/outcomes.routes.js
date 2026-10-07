// Outcomes, item outcome tags, baseline, and outcome mastery.
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import {
  requireTeacher,
  requireEnrolled,
  requireNavVisible,
  courseExists,
} from "./shared.js";

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
    await localDb.prepare("DELETE FROM item_outcomes WHERE course_id = ? AND item_type = ? AND item_id = ?").run(courseId, itemType, itemId);
    for (const oid of outcomeIds) {
      await localDb.prepare(`
        INSERT INTO item_outcomes (course_id, item_type, item_id, outcome_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (item_type, item_id, outcome_id) DO NOTHING
      `).run(courseId, itemType, itemId, oid);
    }
    return res.json({ message: "Item outcomes updated", itemCount: outcomeIds.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});


// Baseline Assessments
router.get("/:id/baseline", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!await requireEnrolled(req, res, courseId)) return;

    const week0Module = await localDb.prepare("SELECT * FROM modules WHERE course_id = ? AND week_offset = 0 LIMIT 1").get(courseId);
    let quiz = null;
    if (week0Module) {
      const item = await localDb.prepare("SELECT * FROM module_items WHERE module_id = ? AND item_type = 'quiz' LIMIT 1").get(week0Module.id);
      if (item && item.content_ref_id) {
        quiz = await localDb.prepare("SELECT * FROM quizzes WHERE id = ?").get(item.content_ref_id);
      }
    }
    const outcomes = await localDb.prepare("SELECT * FROM outcomes WHERE course_id = ?").all(courseId);
    return res.json({ week0Module, quiz, outcomesCount: outcomes.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/baseline/submit", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    // TODO(phase 4): compute per-outcome scores server-side from quiz answers instead of
    // trusting client-sent percentages. Until then, only explicit, valid scores are stored.
    const { answers } = req.body;
    const outcomes = await localDb.prepare("SELECT * FROM outcomes WHERE course_id = ?").all(courseId);

    const scores = [];
    for (const o of outcomes) {
      if (!answers || answers[o.id] === undefined || answers[o.id] === null || answers[o.id] === "") continue;
      const score = Number(answers[o.id]);
      if (!Number.isFinite(score) || score < 0 || score > 100) {
        return res.status(400).json({ message: `Invalid baseline score for outcome ${o.id}: must be between 0 and 100` });
      }
      scores.push({ outcomeId: o.id, score });
    }

    if (scores.length === 0) {
      return res.status(400).json({ message: "No baseline scores provided" });
    }

    for (const { outcomeId, score } of scores) {
      await localDb.prepare(`
        INSERT INTO student_outcome_baselines (course_id, scholar_email, outcome_id, baseline_score)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (course_id, scholar_email, outcome_id) DO UPDATE SET baseline_score = EXCLUDED.baseline_score, assessed_at = CURRENT_TIMESTAMP
      `).run(courseId, auth.email, outcomeId, score);
    }

    return res.json({ message: "Baseline assessment recorded successfully", recorded: scores.length });
  } catch (error) {
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

    const outcomes = await localDb.prepare("SELECT * FROM outcomes WHERE course_id = ? ORDER BY id ASC").all(courseId);
    const students = await localDb.prepare("SELECT user_email FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").all(courseId);

    const isStudent = auth.enrollment.role === 'student';

    // Only real results are reported. Missing baselines or graded work yield null
    // ("No data yet"), never a synthesized number. Scores are normalized to percent.
    const masteryList = await Promise.all(outcomes.map(async (o) => {
      let baselineScore = null;
      if (isStudent) {
        const myBase = await localDb.prepare("SELECT baseline_score FROM student_outcome_baselines WHERE course_id = ? AND outcome_id = ? AND LOWER(scholar_email) = LOWER(?)").get(courseId, o.id, auth.email);
        if (myBase && myBase.baseline_score !== null) baselineScore = Math.round(Number(myBase.baseline_score));
      } else {
        const baseRow = await localDb.prepare("SELECT AVG(baseline_score) AS avg_base FROM student_outcome_baselines WHERE course_id = ? AND outcome_id = ?").get(courseId, o.id);
        if (baseRow && baseRow.avg_base !== null) baselineScore = Math.round(Number(baseRow.avg_base));
      }

      const taggedItems = await localDb.prepare("SELECT item_type, item_id FROM item_outcomes WHERE course_id = ? AND outcome_id = ?").all(courseId, o.id);

      const percents = [];
      for (const item of taggedItems) {
        if (item.item_type === 'assignment') {
          const assignment = await localDb.prepare("SELECT points_possible FROM assignments WHERE id = ?").get(item.item_id);
          const possible = Number(assignment?.points_possible) || 0;
          if (possible <= 0) continue;
          const rows = isStudent
            ? await localDb.prepare("SELECT grade FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?) AND grade IS NOT NULL").all(item.item_id, auth.email)
            : await localDb.prepare("SELECT grade FROM assignment_submissions WHERE assignment_id = ? AND grade IS NOT NULL").all(item.item_id);
          for (const r of rows) percents.push((Number(r.grade) / possible) * 100);
        } else if (item.item_type === 'quiz') {
          const totalRow = await localDb.prepare("SELECT COALESCE(SUM(points), 0) AS total FROM quiz_questions WHERE quiz_id = ?").get(item.item_id);
          const possible = Number(totalRow?.total) || 0;
          if (possible <= 0) continue;
          const rows = isStudent
            ? await localDb.prepare("SELECT score FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?) AND score IS NOT NULL").all(item.item_id, auth.email)
            : await localDb.prepare("SELECT score FROM quiz_submissions WHERE quiz_id = ? AND score IS NOT NULL").all(item.item_id);
          for (const r of rows) percents.push((Number(r.score) / possible) * 100);
        }
      }

      const currentMastery = percents.length > 0
        ? Math.round(percents.reduce((sum, p) => sum + p, 0) / percents.length)
        : null;

      let delta = null;
      if (currentMastery !== null && baselineScore !== null) {
        const deltaNum = currentMastery - baselineScore;
        delta = deltaNum >= 0 ? `+${deltaNum}%` : `${deltaNum}%`;
      }

      let status = null;
      if (currentMastery !== null) {
        status = "On Track";
        if (currentMastery < 60) status = "Needs Reteach";
        else if (currentMastery >= 85) status = "Mastery Achieved";
      }

      return {
        id: o.id,
        code: o.code || `OUT-${o.id}`,
        title: o.title,
        description: o.description,
        baselineScore,
        currentMastery,
        delta,
        status,
        resultsCount: percents.length,
        taggedItemsCount: taggedItems.length
      };
    }));

    return res.json({ outcomes: masteryList, totalStudents: students.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export default router;
