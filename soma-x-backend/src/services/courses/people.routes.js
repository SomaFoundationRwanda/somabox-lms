// Enrollments: people list, adding people (who must already have an account), self-enrollment.
// There are no invitations by email: a place saved for an email without an account could be
// claimed by whoever signed up with that email first.
import express from "express";
import { localDb, serverDb } from "../../helpers/db-manager.js";
import { isInternalEmail } from "../../helpers/identity.js";
import { membershipChanged } from "../../helpers/live.js";
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
 * - teachers and assistants must have teacher (or admin) accounts: an assistant sees the whole
 *   class's work and marks, so a learner can't be one;
 * - a course always keeps at least one active teacher.
 * Returns { status, message } or null when allowed.
 */
async function staffChangeProblem(auth, courseId, current, newRole, existingUser) {
  const touchesStaff = isTeacherRole(newRole) || isTeacherRole(current?.role);
  if (touchesStaff && auth.enrollment.role !== "teacher") {
    return { status: 403, message: "Only the course's teacher can add or change teachers and assistants" };
  }
  if (isTeacherRole(newRole) && existingUser && !["teacher", "admin"].includes(existingUser.role)) {
    return { status: 400, message: "Only teacher accounts can teach or assist in a course" };
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
    const staff = isTeacherRole(auth.enrollment.role) || auth.enrollment.adminView;

    const rows = await localDb.prepare(`
      SELECT e.*, u.learner_code, u.role AS account_role FROM enrollments e
      LEFT JOIN users u ON LOWER(u.email) = LOWER(e.user_email)
      WHERE e.course_id = ? ORDER BY e.role ASC, e.joined_at ASC
    `).all(courseId);
    const people = await Promise.all(rows.map(async (row) => ({
      id: row.id,
      // Learners without an email have an internal address: never shown.
      email: (staff || String(row.user_email).toLowerCase() === auth.email.toLowerCase()) && !isInternalEmail(row.user_email) ? row.user_email : null,
      learnerCode: staff ? row.learner_code || null : null,
      // Who the person is, for staff actions that name them (e.g. grading someone who handed
      // nothing in): their address even when it's an internal one that's never shown.
      account: staff ? row.user_email : null,
      // Teachers may give a learner (a learner account) a new temporary password.
      canResetPassword: staff && !auth.enrollment.adminView && row.role === "student" && row.account_role === "scholar",
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

    const role = ["teacher", "ta", "student", "observer"].includes(req.body.role) ? req.body.role : "student";
    // Someone with an account, by email, learner code, or id (from the learner search).
    let existingUser = null;
    if (req.body.userId !== undefined) {
      existingUser = await serverDb.prepare("SELECT * FROM users WHERE id = ?").get(Number(req.body.userId) || 0);
    } else if (req.body.learnerCode) {
      existingUser = await serverDb.prepare("SELECT * FROM users WHERE UPPER(learner_code) = UPPER(?)").get(String(req.body.learnerCode).trim());
    } else {
      const given = normalizeEmail(req.body.email);
      if (!given) return res.status(400).json({ message: "email is required" });
      existingUser = await serverDb.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(given);
    }
    if (!existingUser) {
      const message = req.body.email !== undefined
        ? "There's no account with this email. Ask the school's admin to create it first."
        : "There's no learner with this code";
      return res.status(404).json({ message, code: "NO_ACCOUNT" });
    }
    const email = normalizeEmail(existingUser.email);
    const current = await getEnrollment(courseId, email);
    const problem = await staffChangeProblem(auth, courseId, current, role, existingUser);
    if (problem) return res.status(problem.status).json({ message: problem.message });

    await localDb.prepare(`
      INSERT INTO enrollments (course_id, user_email, role, status)
      VALUES (?, ?, ?, 'active')
      ON CONFLICT(course_id, user_email) DO UPDATE SET role = excluded.role, status = 'active'
    `).run(courseId, email, role);
    membershipChanged(courseId, [email]);

    return res.status(201).json({ message: "Enrolled", email, role, status: "active" });
  } catch (error) {
    console.error("Error adding enrollment:", error);
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
    membershipChanged(courseId, [target.user_email]);
    return res.status(204).end();
  } catch (error) {
    console.error("Error removing enrollment:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Self-enrollment with a course code. Course codes are short and guessable, so a code alone
// only opens PUBLIC courses that are open; the teacher adds people to a private course (or
// gives out its join code), and nobody can re-activate an enrollment a teacher switched off.
router.post("/:id/enroll", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found. Check the course code." });

    const email = req.user.email;
    const existing = await getEnrollment(courseId, email);
    if (existing?.status === "active") return res.status(200).json({ message: "You're already in this course", courseId });
    if (existing) return res.status(403).json({ message: "Your place in this course was removed. Ask your teacher to add you again." });
    if (course.visibility !== "public") return res.status(403).json({ message: "This course is private. Ask your teacher to add you." });
    if (course.lifecycle !== "open") return res.status(400).json({ message: "This course isn't open for joining yet" });

    await localDb.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'student', 'active')").run(courseId, email);
    membershipChanged(courseId, [email]);
    return res.status(201).json({ message: "Enrolled successfully", courseId });
  } catch (error) {
    console.error("Error self-enrolling:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
