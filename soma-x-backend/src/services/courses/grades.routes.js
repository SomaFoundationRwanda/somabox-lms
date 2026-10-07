// Gradebook.
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import {
  isTeacherRole,
  requireNavVisible,
  courseExists,
  userFullName,
} from "./shared.js";

const router = express.Router();

// ===== Grades =====

router.get("/:id/grades", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "grades");
    if (!auth) return;

    const assignments = await localDb.prepare("SELECT id, title, points_possible FROM assignments WHERE course_id = ? AND published = 1").all(courseId);
    const quizzes = await localDb.prepare("SELECT id, title FROM quizzes WHERE course_id = ? AND published = 1").all(courseId);

    if (!isTeacherRole(auth.enrollment.role)) {
      const myAssignmentGrades = await Promise.all(assignments.map(async (a) => {
        const submission = await localDb.prepare("SELECT grade, feedback FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(a.id, auth.email);
        const status = !submission ? "not_submitted" : submission.grade != null ? "graded" : "submitted";
        return { id: a.id, kind: "assignment", title: a.title, pointsPossible: a.points_possible, grade: submission?.grade ?? null, feedback: submission?.feedback || "", status };
      }));
      const myQuizGrades = await Promise.all(quizzes.map(async (q) => {
        const submission = await localDb.prepare("SELECT score FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?)").get(q.id, auth.email);
        const status = !submission ? "not_submitted" : submission.score != null ? "graded" : "submitted";
        return { id: q.id, kind: "quiz", title: q.title, pointsPossible: null, grade: submission?.score ?? null, feedback: "", status };
      }));
      return res.json({ role: "student", grades: [...myAssignmentGrades, ...myQuizGrades] });
    }

    const students = await localDb.prepare("SELECT user_email FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").all(courseId);
    const grid = await Promise.all(students.map(async (student) => {
      const assignmentGrades = await Promise.all(assignments.map(async (a) => {
        const submission = await localDb.prepare("SELECT grade FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(a.id, student.user_email);
        const status = !submission ? "not_submitted" : submission.grade != null ? "graded" : "submitted";
        return { assignmentId: a.id, title: a.title, grade: submission?.grade ?? null, status };
      }));
      return { email: student.user_email, fullName: await userFullName(student.user_email), assignmentGrades };
    }));

    return res.json({ role: "teacher", assignments, grid });
  } catch (error) {
    console.error("Error fetching grades:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
