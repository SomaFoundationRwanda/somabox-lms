// Enrollments: people list, invites, self-enrollment.
import express from "express";
import { localDb, serverDb } from "../../helpers/db-manager.js";
import {
  normalizeEmail,
  requireTeacher,
  requireEnrolled,
  courseExists,
  userFullName,
} from "./shared.js";

const router = express.Router();

// ===== People / Enrollments =====

router.get("/:id/people", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireEnrolled(req, res, courseId)) return;

    const rows = await localDb.prepare("SELECT * FROM enrollments WHERE course_id = ? ORDER BY role ASC, joined_at ASC").all(courseId);
    const people = await Promise.all(rows.map(async (row) => ({
      id: row.id,
      email: row.user_email,
      fullName: await userFullName(row.user_email),
      role: row.role,
      status: row.status,
      joinedAt: row.joined_at,
    })));
    return res.json(people);
  } catch (error) {
    console.error("Error fetching people:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/people", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const email = normalizeEmail(req.body.email);
    const role = ["teacher", "ta", "student", "observer"].includes(req.body.role) ? req.body.role : "student";
    if (!email) return res.status(400).json({ message: "email is required" });

    const existingUser = await serverDb.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(email);
    const initialStatus = (role === "teacher" || role === "ta" || existingUser) ? "active" : "invited";

    await localDb.prepare(`
      INSERT INTO enrollments (course_id, user_email, role, status)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(course_id, user_email) DO UPDATE SET role = excluded.role, status = 'active'
    `).run(courseId, email, role, initialStatus);

    return res.status(201).json({ message: "Enrolled", email, role, status: initialStatus });
  } catch (error) {
    console.error("Error adding enrollment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/accept-invite", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const email = req.user.email;

    await localDb.prepare("UPDATE enrollments SET status = 'active', joined_at = CURRENT_TIMESTAMP WHERE course_id = ? AND LOWER(user_email) = LOWER(?)")
      .run(courseId, email);

    return res.json({ message: "Invitation accepted", status: "active" });
  } catch (error) {
    console.error("Error accepting invite:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/people/:enrollmentId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    await localDb.prepare("DELETE FROM enrollments WHERE id = ? AND course_id = ?").run(req.params.enrollmentId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error removing enrollment:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Self-enrollment — a scholar joining with a course code, the registration-time flow.
router.post("/:id/enroll", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found. Check the course code." });

    const email = req.user.email;

    await localDb.prepare(`
      INSERT INTO enrollments (course_id, user_email, role, status)
      VALUES (?, ?, 'student', 'active')
      ON CONFLICT(course_id, user_email) DO UPDATE SET status = 'active'
    `).run(courseId, email);

    return res.status(201).json({ message: "Enrolled successfully", courseId });
  } catch (error) {
    console.error("Error self-enrolling:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
