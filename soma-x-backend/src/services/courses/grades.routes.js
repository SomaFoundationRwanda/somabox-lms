// Gradebook: every graded assignment and graded quiz, per learner, as points and percent,
// grouped by type of work (short quiz, exam...). Teachers choose when learners see each item's scores.
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import { isTeacherRole, requireNavVisible, requireTeacher, courseExists, userFullName } from "./shared.js";
import { loadCourseTimeline } from "./schedule.js";
import { GRADE_CATEGORIES } from "./categories.js";
import { groupHiddenItems } from "./groups.js";
import { courseTitle, notify } from "./notify.js";

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
      const a = await localDb.prepare("SELECT id, title, points_possible, category, scores_hidden FROM assignments WHERE id = ?").get(item.content_id);
      if (a) column = { key: `assignment:${a.id}`, type: "assignment", id: a.id, title: a.title, pointsPossible: Number(a.points_possible) || 0, category: a.category, scoresHidden: !!a.scores_hidden };
    } else if (item.item_type === "quiz") {
      const q = await localDb.prepare("SELECT id, title, kind, category, scores_hidden FROM quizzes WHERE id = ?").get(item.content_id);
      if (q && q.kind === "graded") {
        const total = await localDb.prepare("SELECT COALESCE(SUM(points), 0) AS t FROM quiz_questions WHERE quiz_id = ?").get(q.id);
        column = { key: `quiz:${q.id}`, type: "quiz", id: q.id, title: q.title, pointsPossible: Number(total?.t) || 0, category: q.category, scoresHidden: !!q.scores_hidden };
      }
    } else if (item.item_type === "discussion") {
      const d = await localDb.prepare(`
        SELECT a.id, a.title, a.points_possible, a.category, a.scores_hidden FROM discussions d JOIN assignments a ON a.id = d.linked_assignment_id WHERE d.id = ?
      `).get(item.content_id);
      if (d) column = { key: `assignment:${d.id}`, type: "assignment", id: d.id, title: d.title, pointsPossible: Number(d.points_possible) || 0, category: d.category, scoresHidden: !!d.scores_hidden, discussion: true };
    }
    if (column?.type === "assignment") column.hasRubric = !!await localDb.prepare("SELECT 1 FROM rubrics WHERE assignment_id = ?").get(column.id);
    if (column) columns.push({ ...column, moduleTitle: m?.title || "", dueDate: item.dueDate || null, published: visible });
  }
  return columns;
}

async function cellFor(column, email) {
  if (column.type === "assignment") {
    const s = await localDb.prepare("SELECT body, grade, feedback, submitted_at, graded_at, is_late FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(column.id, email);
    const points = s?.grade == null ? null : Number(s.grade);
    // Grading work that was never handed in creates the row in the grading transaction, so its
    // submitted_at equals graded_at: that's no submission date.
    const handedIn = s && (s.body || !s.graded_at || new Date(s.submitted_at).getTime() !== new Date(s.graded_at).getTime());
    return {
      status: !s ? "not_submitted" : points == null ? "submitted" : "graded",
      submittedAt: handedIn ? s.submitted_at : null,
      points,
      pct: points == null || !column.pointsPossible ? null : Math.round((points / column.pointsPossible) * 1000) / 10,
      late: !!s?.is_late,
      feedback: s?.feedback || "",
    };
  }
  const latest = await localDb.prepare("SELECT score, score_pct, attempt_number, submitted_at FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?)").get(column.id, email);
  const attempt = latest ? await localDb.prepare("SELECT is_late FROM quiz_attempts WHERE id = (SELECT id FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?))").get(column.id, email) : null;
  return {
    status: latest ? "graded" : "not_submitted",
    submittedAt: latest?.submitted_at || null,
    points: latest ? Number(latest.score) : null,
    pct: latest?.score_pct == null ? null : Number(latest.score_pct),
    attempts: latest ? Number(latest.attempt_number) : 0,
    late: !!attempt?.is_late,
    feedback: "",
  };
}

// What a learner sees of a cell while the teacher keeps the item's scores hidden: that it was
// handed in (and when), not the mark or feedback.
function learnerCell(column, cell) {
  if (!column.scoresHidden || cell.status === "not_submitted") return cell;
  return { ...cell, status: "submitted", points: null, pct: null, feedback: "", scoresHidden: true };
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Points earned over points possible across the graded cells (9/10 and 5/10 make 70%), overall
 * and per type of work. Work without a type is grouped as "other". pct is null until something
 * has been marked.
 */
function totals(columns, cells) {
  const sum = () => ({ earned: 0, possible: 0, graded: 0, items: 0 });
  const overall = sum();
  const byCategory = new Map([...GRADE_CATEGORIES, "other"].map((k) => [k, sum()]));
  for (const c of columns) {
    const group = byCategory.get(c.category || "other");
    group.items += 1;
    const cell = cells[c.key];
    if (cell?.points == null || !c.pointsPossible) continue;
    for (const t of [overall, group]) {
      t.earned += cell.points;
      t.possible += c.pointsPossible;
      t.graded += 1;
    }
  }
  const pct = (t) => (t.possible > 0 ? round1((t.earned / t.possible) * 100) : null);
  return {
    totalPct: pct(overall),
    gradedCount: overall.graded,
    categories: [...byCategory].filter(([key, t]) => key !== "other" || t.items > 0)
      .map(([key, t]) => ({ key, items: t.items, graded: t.graded, earned: round1(t.earned), possible: round1(t.possible), pct: pct(t) })),
  };
}

router.get("/:id/grades", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    const auth = await requireNavVisible(req, res, courseId, "grades");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);
    // Observers have no grades of their own; an admin reading the course sees the class's.
    if (auth.enrollment.role === "observer" && !auth.enrollment.adminView) {
      return res.status(403).json({ message: "Observers don't have grades in this subject", code: "OBSERVER" });
    }
    const columns = await gradebookColumns(courseId, { includeUnpublished: isTeacher });

    if (!isTeacher && !auth.enrollment.adminView) {
      // Work given to other groups isn't this learner's.
      const groupHidden = await groupHiddenItems(courseId, auth.email);
      const mine = columns.filter((c) => !groupHidden.has(c.key));
      const cells = {};
      for (const c of mine) cells[c.key] = learnerCell(c, await cellFor(c, auth.email));
      const summary = totals(mine, cells);
      return res.json({
        role: "student",
        columns: mine,
        cells,
        ...summary,
        averagePct: summary.totalPct,
        // Older shape, kept for the existing student list.
        grades: mine.map((c) => ({ id: c.id, kind: c.type, title: c.title, pointsPossible: c.pointsPossible, grade: cells[c.key].points, pct: cells[c.key].pct, feedback: cells[c.key].feedback, status: cells[c.key].status, late: cells[c.key].late, dueDate: c.dueDate })),
      });
    }

    const students = await localDb.prepare("SELECT user_email FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active' ORDER BY user_email").all(courseId);
    const rows = [];
    for (const st of students) {
      const groupHidden = await groupHiddenItems(courseId, st.user_email);
      const theirs = columns.filter((c) => !groupHidden.has(c.key));
      const cells = {};
      for (const c of columns) cells[c.key] = groupHidden.has(c.key) ? { status: "not_assigned" } : await cellFor(c, st.user_email);
      const { totalPct, categories } = totals(theirs, cells);
      rows.push({ email: st.user_email, fullName: await userFullName(st.user_email), cells, averagePct: totalPct, categories });
    }
    return res.json({ role: "teacher", columns, rows, categoryKeys: [...GRADE_CATEGORIES, "other"] });
  } catch (error) {
    console.error("Error fetching grades:", error);
    return res.status(500).json({ message: error.message });
  }
});

// A teacher publishes or hides one gradebook column's scores: { key: "assignment:12" | "quiz:4", hidden }.
router.post("/:id/grades/visibility", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const [type, id] = String(req.body?.key || "").split(":");
    const table = { assignment: "assignments", quiz: "quizzes" }[type];
    if (!table || !/^\d+$/.test(id || "")) return res.status(400).json({ message: "key must look like assignment:12 or quiz:4" });
    if (typeof req.body.hidden !== "boolean") return res.status(400).json({ message: "hidden must be true or false" });
    const before = await localDb.prepare(`SELECT scores_hidden FROM ${table} WHERE id = ? AND course_id = ?`).get(Number(id), courseId);
    const row = await localDb.prepare(`UPDATE ${table} SET scores_hidden = ? WHERE id = ? AND course_id = ? RETURNING id, title`).get(req.body.hidden, Number(id), courseId);
    if (!row) return res.status(404).json({ message: "That material isn't in this subject" });
    // Publishing scores tells the learners who have one.
    if (before?.scores_hidden && !req.body.hidden) {
      const marked = type === "assignment"
        ? await localDb.prepare("SELECT scholar_email AS email FROM assignment_submissions WHERE assignment_id = ? AND grade IS NOT NULL").all(row.id)
        : await localDb.prepare("SELECT scholar_email AS email FROM quiz_submissions WHERE quiz_id = ?").all(row.id);
      await notify(marked.map((m) => m.email), "scoresPublished", { item: row.title, course: await courseTitle(courseId) }, `/course/${courseId}/grades`);
    }
    return res.json({ key: `${type}:${row.id}`, scoresHidden: req.body.hidden });
  } catch (error) {
    console.error("Error changing score visibility:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
