// Gradebook: every graded assignment and graded quiz, per learner, as points and percent.
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import { isTeacherRole, requireNavVisible, courseExists, userFullName } from "./shared.js";
import { loadCourseTimeline } from "./schedule.js";

const router = express.Router();

/**
 * Columns in course order (module week, then position). A graded discussion is graded through
 * its linked assignment and appears once, as that assignment.
 */
async function gradebookColumns(courseId, { includeUnpublished }) {
  const tl = await loadCourseTimeline(courseId);
  const modules = new Map(tl.modules.map((m) => [Number(m.id), m]));
  const columns = [];
  const order = (item) => {
    const m = modules.get(Number(item.module_id));
    return [m?.kind === "baseline" ? 0 : m?.kind === "unassigned" ? 1e6 : Number(m?.week_offset ?? 1e5), Number(m?.position ?? 0), Number(item.position)];
  };
  const items = [...tl.items].sort((a, b) => {
    const x = order(a); const y = order(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  for (const item of items) {
    const m = modules.get(Number(item.module_id));
    const visible = Number(item.published) === 1 && Number(m?.published) === 1;
    if (!includeUnpublished && !visible) continue;
    let column = null;
    if (item.item_type === "assignment") {
      const a = await localDb.prepare("SELECT id, title, points_possible FROM assignments WHERE id = ?").get(item.content_id);
      if (a) column = { key: `assignment:${a.id}`, type: "assignment", id: a.id, title: a.title, pointsPossible: Number(a.points_possible) || 0 };
    } else if (item.item_type === "quiz") {
      const q = await localDb.prepare("SELECT id, title, kind FROM quizzes WHERE id = ?").get(item.content_id);
      if (q && q.kind === "graded") {
        const total = await localDb.prepare("SELECT COALESCE(SUM(points), 0) AS t FROM quiz_questions WHERE quiz_id = ?").get(q.id);
        column = { key: `quiz:${q.id}`, type: "quiz", id: q.id, title: q.title, pointsPossible: Number(total?.t) || 0 };
      }
    } else if (item.item_type === "discussion") {
      const d = await localDb.prepare(`
        SELECT a.id, a.title, a.points_possible FROM discussions d JOIN assignments a ON a.id = d.linked_assignment_id WHERE d.id = ?
      `).get(item.content_id);
      if (d) column = { key: `assignment:${d.id}`, type: "assignment", id: d.id, title: d.title, pointsPossible: Number(d.points_possible) || 0, discussion: true };
    }
    if (column) columns.push({ ...column, moduleTitle: m?.title || "", dueDate: item.dueDate || null, published: visible });
  }
  return columns;
}

async function cellFor(column, email) {
  if (column.type === "assignment") {
    const s = await localDb.prepare("SELECT grade, feedback, submitted_at, is_late FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(column.id, email);
    const points = s?.grade == null ? null : Number(s.grade);
    return {
      status: !s ? "not_submitted" : points == null ? "submitted" : "graded",
      points,
      pct: points == null || !column.pointsPossible ? null : Math.round((points / column.pointsPossible) * 1000) / 10,
      late: !!s?.is_late,
      feedback: s?.feedback || "",
    };
  }
  const latest = await localDb.prepare("SELECT score, score_pct, attempt_number FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?)").get(column.id, email);
  const attempt = latest ? await localDb.prepare("SELECT is_late FROM quiz_attempts WHERE id = (SELECT id FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?))").get(column.id, email) : null;
  return {
    status: latest ? "graded" : "not_submitted",
    points: latest ? Number(latest.score) : null,
    pct: latest?.score_pct == null ? null : Number(latest.score_pct),
    attempts: latest ? Number(latest.attempt_number) : 0,
    late: !!attempt?.is_late,
    feedback: "",
  };
}

// Equal-weight mean of the graded columns' percentages (weighting/drop-lowest come later).
function average(cells) {
  const pcts = Object.values(cells).map((c) => c.pct).filter((p) => p != null);
  return pcts.length ? Math.round((pcts.reduce((s, p) => s + p, 0) / pcts.length) * 10) / 10 : null;
}

router.get("/:id/grades", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "grades");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);
    const columns = await gradebookColumns(courseId, { includeUnpublished: isTeacher });

    if (!isTeacher) {
      const cells = {};
      for (const c of columns) cells[c.key] = await cellFor(c, auth.email);
      return res.json({
        role: "student",
        columns,
        cells,
        averagePct: average(cells),
        // Older shape, kept for the existing student list.
        grades: columns.map((c) => ({ id: c.id, kind: c.type, title: c.title, pointsPossible: c.pointsPossible, grade: cells[c.key].points, pct: cells[c.key].pct, feedback: cells[c.key].feedback, status: cells[c.key].status, late: cells[c.key].late, dueDate: c.dueDate })),
      });
    }

    const students = await localDb.prepare("SELECT user_email FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active' ORDER BY user_email").all(courseId);
    const rows = [];
    for (const st of students) {
      const cells = {};
      for (const c of columns) cells[c.key] = await cellFor(c, st.user_email);
      rows.push({ email: st.user_email, fullName: await userFullName(st.user_email), cells, averagePct: average(cells) });
    }
    return res.json({ role: "teacher", columns, rows });
  } catch (error) {
    console.error("Error fetching grades:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
