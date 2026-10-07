// Baseline (Week 0): build the baseline quiz from outcome-tagged questions, approve it, or
// skip it with a recorded reason. Learners' baselines are computed from their answers when
// they submit the baseline quiz (see the quiz submit route).
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import { isTeacherRole, requireTeacher, requireEnrolled, courseExists } from "./shared.js";
import { createModuleContent, replaceQuizQuestions, sendItemError, syncListingPublished } from "./items.js";
import { getBaselineState } from "./setup.js";
import { refreshDueDates } from "./schedule.js";

const router = express.Router();

router.get("/:id/baseline", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;
    const state = await getBaselineState(courseId);
    if (!isTeacherRole(auth.enrollment.role)) {
      return res.json({ status: state.status, quizId: state.status === "approved" ? state.quizId : null });
    }
    return res.json(state);
  } catch (error) {
    console.error("Error reading baseline:", error);
    return res.status(500).json({ message: error.message });
  }
});

async function ensureBaselineModule(courseId, actorEmail) {
  const existing = await localDb.prepare("SELECT * FROM modules WHERE course_id = ? AND kind = 'baseline'").get(courseId);
  if (existing) return existing;
  await localDb.prepare(`
    INSERT INTO modules (course_id, title, description, position, published, created_by_teacher_email, kind, week_offset, day_offset)
    VALUES (?, 'Week 0: Baseline', 'A short check of what learners already know, before Week 1.', -1, 0, ?, 'baseline', 0, 0)
  `).run(courseId, actorEmail);
  await refreshDueDates(courseId);
  return await localDb.prepare("SELECT * FROM modules WHERE course_id = ? AND kind = 'baseline'").get(courseId);
}

// Copies up to `perOutcome` outcome-tagged multiple-choice questions per outcome from the
// course's other quizzes into the baseline quiz (creating the Week 0 module and quiz if needed).
router.post("/:id/baseline/generate", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const perOutcome = Math.min(10, Math.max(1, Number(req.body.perOutcome) || 2));
    const pool = await localDb.prepare(`
      SELECT qq.* FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id
      WHERE q.course_id = ? AND q.kind <> 'baseline' AND qq.outcome_id IS NOT NULL
        AND qq.question_type = 'multiple_choice' AND qq.correct_option IS NOT NULL
      ORDER BY qq.outcome_id, q.id, qq.position
    `).all(courseId);
    const picked = [];
    const counts = new Map();
    for (const q of pool) {
      const n = counts.get(q.outcome_id) || 0;
      if (n >= perOutcome) continue;
      counts.set(q.outcome_id, n + 1);
      picked.push(q);
    }
    if (picked.length === 0) {
      return res.status(400).json({ message: "No outcome-tagged multiple-choice questions to build from yet. Tag quiz questions with outcomes, or write the baseline questions directly." });
    }

    const state = await localDb.transaction(async () => {
      const module = await ensureBaselineModule(courseId, auth.email);
      let { quizId } = await getBaselineState(courseId);
      if (!quizId) {
        const created = await createModuleContent({
          courseId, moduleId: module.id, itemType: "quiz", actorEmail: auth.email, publish: false,
          data: { title: "Baseline check", description: "Answer what you can. This isn't graded: it shows where you're starting from.", kind: "baseline", attemptsAllowed: 1, releaseDay: 0, dueDay: 6 },
        });
        quizId = created.contentId;
      }
      await replaceQuizQuestions(quizId, picked.map((q) => ({
        prompt: q.prompt,
        questionType: "multiple_choice",
        options: JSON.parse(q.options || "[]"),
        correctOption: q.correct_option,
        points: Number(q.points) || 1,
        outcomeId: q.outcome_id,
      })), courseId);
      return await getBaselineState(courseId);
    })();
    return res.json(state);
  } catch (error) {
    if (sendItemError(res, error)) return;
    console.error("Error generating baseline:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/baseline/approve", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const state = await getBaselineState(courseId);
    if (!state.canApprove) {
      return res.status(422).json({ message: `The baseline isn't ready: ${state.problems.join("; ")}`, problems: state.problems });
    }
    await localDb.transaction(async () => {
      // A baseline is taken once, before teaching; it's visible to learners once the course opens.
      await localDb.prepare("UPDATE quizzes SET attempts_allowed = 1, published = 1 WHERE id = ?").run(state.quizId);
      await syncListingPublished("quiz", state.quizId, true);
      await localDb.prepare("UPDATE modules SET published = 1 WHERE id = ?").run(state.moduleId);
      await localDb.prepare(`
        UPDATE courses SET baseline_status = 'approved', baseline_skip_reason = NULL, baseline_decided_by = ?, baseline_decided_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(auth.email, courseId);
    })();
    return res.json(await getBaselineState(courseId));
  } catch (error) {
    console.error("Error approving baseline:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/baseline/skip", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const reason = String(req.body.reason || "").trim();
    if (reason.length < 10) return res.status(400).json({ message: "Say briefly why the baseline is being skipped (at least 10 characters)" });
    await localDb.prepare(`
      UPDATE courses SET baseline_status = 'skipped', baseline_skip_reason = ?, baseline_decided_by = ?, baseline_decided_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(reason, auth.email, courseId);
    return res.json(await getBaselineState(courseId));
  } catch (error) {
    console.error("Error skipping baseline:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Undo an approval or skip while the course is still being set up.
router.post("/:id/baseline/reset", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    if (course.lifecycle !== "draft") return res.status(400).json({ message: "The baseline decision can't change after the course opens" });
    await localDb.prepare(`
      UPDATE courses SET baseline_status = 'pending', baseline_skip_reason = NULL, baseline_decided_by = NULL, baseline_decided_at = NULL
      WHERE id = ?
    `).run(courseId);
    return res.json(await getBaselineState(courseId));
  } catch (error) {
    console.error("Error resetting baseline:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
