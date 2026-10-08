// Attendance: course staff take the register per session; learners see their own record.
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import { courseExists, requireTeacher, requireNavVisible, isTeacherRole } from "./shared.js";
import { schoolToday } from "./schedule.js";
import { STATUSES, ATTENDANCE_RULES, attendanceByLearner } from "./attendance.js";
import { courseLearners } from "../insights/metrics.js";

const router = express.Router();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Course staff take attendance; admins (not enrolled) may look but not mark.
async function staffOrAdmin(req, res, courseId, { write = false } = {}) {
  if (!await courseExists(courseId)) {
    res.status(404).json({ message: "Course not found" });
    return null;
  }
  if (req.user?.role === "admin" && !write) return { email: req.user.email };
  return requireTeacher(req, res, courseId);
}

function checkDate(date) {
  if (!DATE.test(String(date || "")) || Number.isNaN(Date.parse(date))) return "Choose a date (YYYY-MM-DD)";
  if (date > schoolToday()) return "Attendance can't be taken for a day that hasn't happened yet";
  return null;
}

async function sessionRow(courseId, sessionId) {
  return localDb.prepare("SELECT id, course_id, session_date::text AS date, title, created_by, created_at FROM attendance_sessions WHERE id = ? AND course_id = ?").get(sessionId, courseId);
}

// Sessions (newest first) with counts, and each learner's summary.
router.get("/:id/attendance", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await staffOrAdmin(req, res, courseId)) return;
    const from = DATE.test(String(req.query.from || "")) ? req.query.from : "0001-01-01";
    const to = DATE.test(String(req.query.to || "")) ? req.query.to : "9999-12-31";
    const learners = await courseLearners(courseId);
    const sessions = await localDb.prepare(`
      SELECT s.id, s.session_date::text AS date, s.title,
             COUNT(*) FILTER (WHERE r.status = 'present') AS present,
             COUNT(*) FILTER (WHERE r.status = 'late') AS late,
             COUNT(*) FILTER (WHERE r.status = 'absent') AS absent,
             COUNT(*) FILTER (WHERE r.status = 'excused') AS excused
      FROM attendance_sessions s LEFT JOIN attendance_records r ON r.session_id = s.id
      WHERE s.course_id = ? AND s.session_date BETWEEN ?::date AND ?::date
      GROUP BY s.id ORDER BY s.session_date DESC, s.id DESC
    `).all(courseId, from, to);
    const summaries = await attendanceByLearner(courseId, learners.map((l) => Number(l.id)));
    return res.json({
      today: schoolToday(),
      rules: ATTENDANCE_RULES,
      learnerCount: learners.length,
      sessions: sessions.map((s) => {
        const counts = { present: Number(s.present), late: Number(s.late), absent: Number(s.absent), excused: Number(s.excused) };
        const marked = counts.present + counts.late + counts.absent + counts.excused;
        return { id: s.id, date: s.date, title: s.title, counts, marked, unmarked: Math.max(0, learners.length - marked) };
      }),
      learners: learners.map((l) => ({ id: l.id, name: l.full_name || l.email, ...summaries.get(Number(l.id)) })),
    });
  } catch (error) {
    console.error("Error listing attendance:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/attendance/sessions", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const auth = await staffOrAdmin(req, res, courseId, { write: true });
    if (!auth) return;
    const date = String(req.body.date || schoolToday());
    const problem = checkDate(date);
    if (problem) return res.status(400).json({ message: problem });
    const title = String(req.body.title || "Class").trim().slice(0, 80) || "Class";
    const existing = await localDb.prepare("SELECT id FROM attendance_sessions WHERE course_id = ? AND session_date = ?::date AND title = ?").get(courseId, date, title);
    if (existing) return res.status(409).json({ message: `There's already a "${title}" register for ${date}`, sessionId: existing.id });
    const row = await localDb.prepare(`
      INSERT INTO attendance_sessions (course_id, session_date, title, created_by) VALUES (?, ?::date, ?, ?) RETURNING id
    `).get(courseId, date, title, auth.email);
    return res.status(201).json(await sessionRow(courseId, row.id));
  } catch (error) {
    console.error("Error creating attendance session:", error);
    return res.status(500).json({ message: error.message });
  }
});

// The register for one session: every current learner (and anyone already marked), with status.
router.get("/:id/attendance/sessions/:sessionId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await staffOrAdmin(req, res, courseId)) return;
    const session = await sessionRow(courseId, req.params.sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const learners = await courseLearners(courseId);
    const records = await localDb.prepare(`
      SELECT r.user_id, r.status, r.note, r.marked_by, r.marked_at, u.full_name, u.email
      FROM attendance_records r JOIN users u ON u.id = r.user_id WHERE r.session_id = ?
    `).all(session.id);
    const byUser = new Map(records.map((r) => [Number(r.user_id), r]));
    const roster = learners.map((l) => ({ userId: l.id, name: l.full_name || l.email, current: true }));
    for (const r of records) {
      if (!roster.some((x) => Number(x.userId) === Number(r.user_id))) roster.push({ userId: r.user_id, name: r.full_name || r.email, current: false });
    }
    return res.json({
      ...session,
      roster: roster.map((x) => {
        const r = byUser.get(Number(x.userId));
        return { ...x, status: r?.status ?? null, note: r?.note ?? "", markedBy: r?.marked_by ?? null, markedAt: r?.marked_at ?? null };
      }),
    });
  } catch (error) {
    console.error("Error reading attendance session:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Save marks: { records: [{ userId, status: present|late|absent|excused|null, note? }] }. null clears.
router.put("/:id/attendance/sessions/:sessionId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const auth = await staffOrAdmin(req, res, courseId, { write: true });
    if (!auth) return;
    const session = await sessionRow(courseId, req.params.sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const records = Array.isArray(req.body.records) ? req.body.records : null;
    if (!records) return res.status(400).json({ message: "records must be a list" });
    const learnerIds = new Set((await courseLearners(courseId)).map((l) => Number(l.id)));
    for (const [i, r] of records.entries()) {
      if (!learnerIds.has(Number(r?.userId))) return res.status(400).json({ message: `Entry ${i + 1} isn't a learner in this course` });
      if (r.status !== null && !STATUSES.includes(r.status)) return res.status(400).json({ message: `Entry ${i + 1}: status must be present, late, absent, or excused` });
    }
    await localDb.transaction(async () => {
      for (const r of records) {
        if (r.status === null) {
          await localDb.prepare("DELETE FROM attendance_records WHERE session_id = ? AND user_id = ?").run(session.id, r.userId);
          continue;
        }
        await localDb.prepare(`
          INSERT INTO attendance_records (session_id, user_id, status, note, marked_by) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (session_id, user_id) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note,
            marked_by = EXCLUDED.marked_by, marked_at = CURRENT_TIMESTAMP
          WHERE attendance_records.status IS DISTINCT FROM EXCLUDED.status OR attendance_records.note IS DISTINCT FROM EXCLUDED.note
        `).run(session.id, r.userId, r.status, String(r.note || "").slice(0, 300) || null, auth.email);
      }
    })();
    return res.json({ saved: records.length });
  } catch (error) {
    console.error("Error saving attendance:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/attendance/sessions/:sessionId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await staffOrAdmin(req, res, courseId, { write: true })) return;
    const session = await sessionRow(courseId, req.params.sessionId);
    if (!session) return res.status(404).json({ message: "Session not found" });
    const date = req.body.date !== undefined ? String(req.body.date) : session.date;
    const problem = checkDate(date);
    if (problem) return res.status(400).json({ message: problem });
    const title = req.body.title !== undefined ? String(req.body.title).trim().slice(0, 80) : session.title;
    if (!title) return res.status(400).json({ message: "Give the session a name" });
    const clash = await localDb.prepare("SELECT id FROM attendance_sessions WHERE course_id = ? AND session_date = ?::date AND title = ? AND id <> ?").get(courseId, date, title, session.id);
    if (clash) return res.status(409).json({ message: `There's already a "${title}" register for ${date}` });
    await localDb.prepare("UPDATE attendance_sessions SET session_date = ?::date, title = ? WHERE id = ?").run(date, title, session.id);
    return res.json(await sessionRow(courseId, session.id));
  } catch (error) {
    console.error("Error updating attendance session:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/attendance/sessions/:sessionId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await staffOrAdmin(req, res, courseId, { write: true })) return;
    const info = await localDb.prepare("DELETE FROM attendance_sessions WHERE id = ? AND course_id = ?").run(req.params.sessionId, courseId);
    if (!info.changes) return res.status(404).json({ message: "Session not found" });
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting attendance session:", error);
    return res.status(500).json({ message: error.message });
  }
});

// A learner's own attendance in the course.
router.get("/:id/attendance/me", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "attendance");
    if (!auth) return;
    if (isTeacherRole(auth.enrollment.role)) return res.status(400).json({ message: "This shows a learner's own attendance. Teachers see everyone's on the Attendance page." });
    const records = await localDb.prepare(`
      SELECT s.session_date::text AS date, s.title, r.status, r.note
      FROM attendance_sessions s LEFT JOIN attendance_records r ON r.session_id = s.id AND r.user_id = ?
      WHERE s.course_id = ? ORDER BY s.session_date DESC, s.id DESC
    `).all(req.user.id, courseId);
    const summary = (await attendanceByLearner(courseId, [Number(req.user.id)])).get(Number(req.user.id));
    return res.json({ summary, sessions: records.map((r) => ({ date: r.date, title: r.title, status: r.status ?? null, note: r.note ?? "" })) });
  } catch (error) {
    console.error("Error reading own attendance:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
