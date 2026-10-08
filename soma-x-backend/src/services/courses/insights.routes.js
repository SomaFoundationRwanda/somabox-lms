// Course Insights (teachers of the course and admins) and My progress (a learner's own data).
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import { courseExists, requireTeacher, requireEnrolled, isTeacherRole } from "./shared.js";
import { courseInsights, quizItemAnalysis } from "../insights/metrics.js";
import { statusFor } from "./results.js";

const router = express.Router();

async function requireInsights(req, res, courseId) {
  if (!await courseExists(courseId)) {
    res.status(404).json({ message: "Course not found" });
    return false;
  }
  if (req.user?.role === "admin") return true;
  return !!(await requireTeacher(req, res, courseId));
}

// The whole course: Class, Outcomes, Learners, and Items tabs. Each learner's per-item list is
// left out here (see the learner endpoint).
router.get("/:id/insights", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await requireInsights(req, res, courseId)) return;
    const insights = await courseInsights(courseId);
    const summary = await latestClassSummary(courseId);
    return res.json({
      ...insights,
      learners: insights.learners.map(({ work, ...l }) => l),
      aiSummary: summary ? { jobId: summary.id, ...summary.result, createdAt: summary.finished_at, requestedBy: summary.requested_by } : null,
    });
  } catch (error) {
    console.error("Error computing insights:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/insights/learners/:userId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await requireInsights(req, res, courseId)) return;
    const insights = await courseInsights(courseId, { userId: Number(req.params.userId) });
    const learner = insights.learners[0];
    if (!learner) return res.status(404).json({ message: "This person isn't a learner in this course" });
    return res.json({ course: insights.course, today: insights.today, thresholds: insights.thresholds, outcomes: insights.outcomes.map(outcomeInfo), learner });
  } catch (error) {
    console.error("Error computing learner insights:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/insights/quizzes/:quizId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await requireInsights(req, res, courseId)) return;
    const analysis = await quizItemAnalysis(courseId, Number(req.params.quizId));
    if (!analysis) return res.status(404).json({ message: "Quiz not found" });
    return res.json(analysis);
  } catch (error) {
    console.error("Error analysing quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});

// A learner's own progress in the course: growth per outcome, recent results, and their work.
// No risk flags and no comparison with classmates.
router.get("/:id/my-progress", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;
    if (isTeacherRole(auth.enrollment.role)) return res.status(400).json({ message: "My progress is for learners. Teachers can see everyone's progress in Insights." });
    const insights = await courseInsights(courseId, { userId: req.user.id });
    const me = insights.learners[0];
    if (!me) return res.status(404).json({ message: "No progress yet" });
    const titles = new Map(insights.outcomes.map((o) => [Number(o.id), o]));
    return res.json({
      course: insights.course,
      today: insights.today,
      thresholds: insights.thresholds,
      overall: me.overall,
      overallBaseline: me.overallBaseline,
      deltaPoints: me.deltaPoints,
      normalizedGain: me.normalizedGain,
      outcomes: me.outcomes.map((o) => ({ ...outcomeInfo(titles.get(Number(o.outcomeId))), ...o, status: statusFor(o.current) })),
      trajectory: me.trajectory,
      timeliness: me.timeliness,
      attendance: me.attendance,
      work: me.work,
    });
  } catch (error) {
    console.error("Error computing my progress:", error);
    return res.status(500).json({ message: error.message });
  }
});

function outcomeInfo(o) {
  return o ? { id: o.id, code: o.code, title: o.title } : {};
}

export default router;

/** Latest finished AI class summary for a course, if any (used by Insights). */
export async function latestClassSummary(courseId) {
  return localDb.prepare(`
    SELECT id, result, finished_at, requested_by FROM ai_jobs
    WHERE course_id = ? AND kind = 'class_summary' AND status = 'done' AND result IS NOT NULL
    ORDER BY finished_at DESC LIMIT 1
  `).get(courseId);
}
