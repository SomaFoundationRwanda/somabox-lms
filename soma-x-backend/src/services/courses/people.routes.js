// Enrollments: people list, invites, self-enrollment.
import express from "express";
import { localDb, serverDb } from "../../helpers/db-manager.js";
import {
  normalizeEmail,
  requireTeacher,
  requireEnrolled,
  courseExists,
  userFullName,
  getEnrollment,
  isTeacherRole,
} from "./shared.js";

const router = express.Router();

/**
 * Rules for changing who teaches a course (newRole null = removing the person):
 * - only a course teacher (not a TA) may add, change, or remove teachers and TAs;
 * - a course teacher must have a teacher or admin account;
 * - a course always keeps at least one active teacher.
 * Returns { status, message } or null when allowed.
 */
async function staffChangeProblem(auth, courseId, current, newRole, existingUser) {
  const touchesStaff = isTeacherRole(newRole) || isTeacherRole(current?.role);
  if (touchesStaff && auth.enrollment.role !== "teacher") {
    return { status: 403, message: "Only the course's teacher can add or change teachers and assistants" };
  }
  if (newRole === "teacher" && existingUser && !["teacher", "admin"].includes(existingUser.role)) {
    return { status: 400, message: "Only teacher accounts can be made a course teacher. Add them as an assistant instead." };
  }
  if (current?.role === "teacher" && newRole !== "teacher") {
    const teachers = await localDb.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE course_id = ? AND role = 'teacher' AND status = 'active'").get(courseId);
    if (Number(teachers.n) <= 1) return { status: 409, message: "A course needs at least one teacher. Add another teacher first." };
  }
  return null;
}

// ===== People / Enrollments =====

router.get("/:id/people", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;
    // Learners see who is in the class, but not everyone's email address.
    const staff = isTeacherRole(auth.enrollment.role);

    const rows = await localDb.prepare("SELECT * FROM enrollments WHERE course_id = ? ORDER BY role ASC, joined_at ASC").all(courseId);
    const people = await Promise.all(rows.map(async (row) => ({
      id: row.id,
      email: staff || String(row.user_email).toLowerCase() === auth.email.toLowerCase() ? row.user_email : null,
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
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const email = normalizeEmail(req.body.email);
    const role = ["teacher", "ta", "student", "observer"].includes(req.body.role) ? req.body.role : "student";
    if (!email) return res.status(400).json({ message: "email is required" });

    const existingUser = await serverDb.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(email);
    const current = await getEnrollment(courseId, email);
    const problem = await staffChangeProblem(auth, courseId, current, role, existingUser);
    if (problem) return res.status(problem.status).json({ message: problem.message });
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

    // Only an actual invitation can be accepted; a removed or switched-off place can't be revived.
    const info = await localDb.prepare("UPDATE enrollments SET status = 'active', joined_at = CURRENT_TIMESTAMP WHERE course_id = ? AND LOWER(user_email) = LOWER(?) AND status = 'invited'")
      .run(courseId, email);
    if (!info.changes) return res.status(404).json({ message: "There's no invitation to this course for you" });

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
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;
    const target = await localDb.prepare("SELECT * FROM enrollments WHERE id = ? AND course_id = ?").get(req.params.enrollmentId, courseId);
    if (!target) return res.status(404).json({ message: "This person isn't in the course" });
    const problem = await staffChangeProblem(auth, courseId, target, null, null);
    if (problem) return res.status(problem.status).json({ message: problem.message });

    await localDb.prepare("DELETE FROM enrollments WHERE id = ? AND course_id = ?").run(req.params.enrollmentId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error removing enrollment:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Self-enrollment with a course code. Course codes are short and guessable, so a code alone
// only opens PUBLIC courses that are open; a private course needs an invite from its teacher
// (an 'invited' enrollment), and nobody can re-activate an enrollment a teacher switched off.
router.post("/:id/enroll", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found. Check the course code." });

    const email = req.user.email;
    const existing = await getEnrollment(courseId, email);
    if (existing?.status === "active") return res.status(200).json({ message: "You're already in this course", courseId });
    if (existing?.status === "invited") {
      await localDb.prepare("UPDATE enrollments SET status = 'active', joined_at = CURRENT_TIMESTAMP WHERE id = ?").run(existing.id);
      return res.status(201).json({ message: "Enrolled successfully", courseId });
    }
    if (existing) return res.status(403).json({ message: "Your place in this course was removed. Ask your teacher to add you again." });
    if (course.visibility !== "public") return res.status(403).json({ message: "This course is private. Ask your teacher to invite you." });
    if (course.lifecycle !== "open") return res.status(400).json({ message: "This course isn't open for joining yet" });

    await localDb.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'student', 'active')").run(courseId, email);
    return res.status(201).json({ message: "Enrolled successfully", courseId });
  } catch (error) {
    console.error("Error self-enrolling:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
