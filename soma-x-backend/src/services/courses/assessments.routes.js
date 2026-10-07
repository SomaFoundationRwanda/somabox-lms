// Assignments, quizzes, and rubrics.
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import {
  normalizeEmail,
  isTeacherRole,
  requireTeacher,
  requireEnrolled,
  requireNavVisible,
  courseExists,
  normalizeDueAt,
  scheduleSpacedReview,
  userFullName,
} from "./shared.js";

const router = express.Router();

// ===== Assignments (birds-eye: assignments + quizzes + graded discussions) =====

router.get("/:id/assignments", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "assignments");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rawAssignments = await localDb.prepare("SELECT * FROM assignments WHERE course_id = ?").all(courseId);
    const assignments = rawAssignments
      .filter((a) => isTeacher || Number(a.published) === 1)
      .map((a) => ({ id: a.id, kind: "assignment", title: a.title, dueAt: a.due_at, pointsPossible: a.points_possible, published: Number(a.published) === 1 }));

    const rawQuizzes = await localDb.prepare("SELECT * FROM quizzes WHERE course_id = ?").all(courseId);
    const quizzes = await Promise.all(rawQuizzes
      .filter((q) => isTeacher || Number(q.published) === 1)
      .map(async (q) => {
        const ptsRow = await localDb.prepare("SELECT COALESCE(SUM(points),0) AS total FROM quiz_questions WHERE quiz_id = ?").get(q.id);
        const points = Number(ptsRow?.total || 0);
        return { id: q.id, kind: "quiz", title: q.title, dueAt: q.due_at, pointsPossible: points, published: Number(q.published) === 1 };
      }));

    const rawDiscussions = await localDb.prepare("SELECT * FROM discussions WHERE course_id = ? AND graded = 1 AND linked_assignment_id IS NULL").all(courseId);
    const discussions = rawDiscussions
      .filter((d) => isTeacher || Number(d.published) === 1)
      .map((d) => ({ id: d.id, kind: "discussion", title: d.title, dueAt: null, pointsPossible: d.points_possible, published: Number(d.published) === 1 }));

    const combined = [...assignments, ...quizzes, ...discussions].sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return 0;
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt) - new Date(b.dueAt);
    });

    return res.json(combined);
  } catch (error) {
    console.error("Error fetching assignments:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/assignments", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const info = await localDb.prepare(`
      INSERT INTO assignments (course_id, title, description, due_at, points_possible, published, created_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(courseId, title, req.body.description || "", normalizeDueAt(req.body.dueAt), Number(req.body.pointsPossible) || 100, req.body.published ? 1 : 0, auth.email);

    return res.status(201).json(await localDb.prepare("SELECT * FROM assignments WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error creating assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/assignments/:assignmentId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const assignment = await localDb.prepare("SELECT * FROM assignments WHERE id = ? AND course_id = ?").get(req.params.assignmentId, courseId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    if (isTeacherRole(auth.enrollment.role)) {
      const rawSubs = await localDb.prepare("SELECT * FROM assignment_submissions WHERE assignment_id = ?").all(assignment.id);
      const submissions = await Promise.all(rawSubs.map(async (s) => ({ ...s, fullName: await userFullName(s.scholar_email) })));
      return res.json({ ...assignment, submissions });
    }

    const mySubmission = await localDb.prepare("SELECT * FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(assignment.id, auth.email);
    return res.json({ ...assignment, mySubmission: mySubmission || null });
  } catch (error) {
    console.error("Error fetching assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/assignments/:assignmentId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { title, description, dueAt, pointsPossible, published } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (dueAt !== undefined) { updates.push("due_at = ?"); params.push(normalizeDueAt(dueAt)); }
    if (pointsPossible !== undefined) { updates.push("points_possible = ?"); params.push(Number(pointsPossible)); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(req.params.assignmentId, courseId);
    await localDb.prepare(`UPDATE assignments SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    return res.json(await localDb.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.assignmentId));
  } catch (error) {
    console.error("Error updating assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/assignments/:assignmentId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    await localDb.prepare("DELETE FROM assignments WHERE id = ? AND course_id = ?").run(req.params.assignmentId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/assignments/:assignmentId/submit", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const assignment = await localDb.prepare("SELECT * FROM assignments WHERE id = ? AND course_id = ?").get(req.params.assignmentId, courseId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    const alreadySubmitted = await localDb.prepare("SELECT 1 FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(assignment.id, auth.email);

    await localDb.prepare(`
      INSERT INTO assignment_submissions (assignment_id, scholar_email, body, submitted_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(assignment_id, scholar_email) DO UPDATE SET body = excluded.body, submitted_at = CURRENT_TIMESTAMP
    `).run(assignment.id, auth.email, req.body.body || "");

    if (!alreadySubmitted) {
      await scheduleSpacedReview(auth.email, `assignment_${assignment.id}`, assignment.title);
    }

    return res.status(201).json({ message: "Submitted" });
  } catch (error) {
    console.error("Error submitting assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/assignments/:assignmentId/grade/:scholarEmail", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const scholarEmail = normalizeEmail(req.params.scholarEmail);
    const grade = Number(req.body.grade);
    if (Number.isNaN(grade)) return res.status(400).json({ message: "grade must be a number" });

    await localDb.prepare(`
      INSERT INTO assignment_submissions (assignment_id, scholar_email, grade, graded_at, graded_by_teacher_email, feedback)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
      ON CONFLICT(assignment_id, scholar_email) DO UPDATE SET
        grade = excluded.grade, graded_at = CURRENT_TIMESTAMP, graded_by_teacher_email = excluded.graded_by_teacher_email, feedback = excluded.feedback
    `).run(req.params.assignmentId, scholarEmail, grade, auth.email, req.body.feedback || "");

    return res.json({ message: "Graded", grade });
  } catch (error) {
    console.error("Error grading assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});


// ===== Quizzes =====

router.get("/:id/quizzes", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "quizzes");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rawQuizzesList = await localDb.prepare("SELECT * FROM quizzes WHERE course_id = ? ORDER BY created_at DESC").all(courseId);
    const rows = await Promise.all(rawQuizzesList
      .filter((q) => isTeacher || Number(q.published) === 1)
      .map(async (q) => {
        const questionCountRow = await localDb.prepare("SELECT COUNT(*) AS c FROM quiz_questions WHERE quiz_id = ?").get(q.id);
        const questionCount = Number(questionCountRow?.c || 0);
        const mySubmission = !isTeacher
          ? await localDb.prepare("SELECT score FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?)").get(q.id, auth.email)
          : null;
        return { ...q, published: Number(q.published) === 1, questionCount, myScore: mySubmission?.score ?? null };
      }));
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching quizzes:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/quizzes", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const info = await localDb.prepare(`
      INSERT INTO quizzes (course_id, title, description, due_at, published, created_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(courseId, title, req.body.description || "", normalizeDueAt(req.body.dueAt), req.body.published ? 1 : 0, auth.email);
    const quizId = Number(info.lastInsertRowid);

    const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
    const insertQuestion = await localDb.prepare(`
      INSERT INTO quiz_questions (quiz_id, position, prompt, question_type, options, correct_option, points)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    questions.forEach((q, index) => {
      insertQuestion.run(
        quizId, index,
        String(q?.prompt || "").trim() || "Untitled question",
        q?.questionType === "open" ? "open" : "multiple_choice",
        JSON.stringify(Array.isArray(q?.options) ? q.options : []),
        q?.correctOption || null,
        Number(q?.points) || 1
      );
    });

    return res.status(201).json(await localDb.prepare("SELECT * FROM quizzes WHERE id = ?").get(quizId));
  } catch (error) {
    console.error("Error creating quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/quizzes/:quizId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const quiz = await localDb.prepare("SELECT * FROM quizzes WHERE id = ? AND course_id = ?").get(req.params.quizId, courseId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    const isTeacher = isTeacherRole(auth.enrollment.role);
    const rawQuestions = await localDb.prepare("SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position ASC").all(quiz.id);
    const questions = rawQuestions.map((q) => ({
      ...q,
      options: JSON.parse(q.options || "[]"),
      correctOption: isTeacher ? q.correct_option : undefined,
    }));

    if (isTeacher) {
      const rawQuizSubs = await localDb.prepare("SELECT * FROM quiz_submissions WHERE quiz_id = ?").all(quiz.id);
      const submissions = await Promise.all(rawQuizSubs.map(async (s) => ({ ...s, fullName: await userFullName(s.scholar_email) })));
      return res.json({ ...quiz, questions, submissions });
    }

    const mySubmission = await localDb.prepare("SELECT * FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?)").get(quiz.id, auth.email);
    return res.json({ ...quiz, questions, mySubmission: mySubmission || null });
  } catch (error) {
    console.error("Error fetching quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/quizzes/:quizId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { title, description, dueAt, published } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (dueAt !== undefined) { updates.push("due_at = ?"); params.push(normalizeDueAt(dueAt)); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.quizId, courseId);
    await localDb.prepare(`UPDATE quizzes SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    return res.json(await localDb.prepare("SELECT * FROM quizzes WHERE id = ?").get(req.params.quizId));
  } catch (error) {
    console.error("Error updating quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/quizzes/:quizId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    await localDb.prepare("DELETE FROM quizzes WHERE id = ? AND course_id = ?").run(req.params.quizId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/quizzes/:quizId/submit", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const quiz = await localDb.prepare("SELECT * FROM quizzes WHERE id = ? AND course_id = ?").get(req.params.quizId, courseId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    const answers = req.body.answers && typeof req.body.answers === "object" ? req.body.answers : {};
    const questions = await localDb.prepare("SELECT * FROM quiz_questions WHERE quiz_id = ?").all(quiz.id);

    let score = 0;
    for (const question of questions) {
      const given = answers[String(question.id)];
      if (question.question_type === "multiple_choice" && question.correct_option && given === question.correct_option) {
        score += Number(question.points) || 0;
      }
    }

    const alreadySubmitted = await localDb.prepare("SELECT 1 FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?)").get(quiz.id, auth.email);

    await localDb.prepare(`
      INSERT INTO quiz_submissions (quiz_id, scholar_email, answers, score, submitted_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(quiz_id, scholar_email) DO UPDATE SET answers = excluded.answers, score = excluded.score, submitted_at = CURRENT_TIMESTAMP
    `).run(quiz.id, auth.email, JSON.stringify(answers), score);

    if (!alreadySubmitted) {
      await scheduleSpacedReview(auth.email, `quiz_${quiz.id}`, quiz.title);
    }

    return res.status(201).json({ message: "Submitted", score });
  } catch (error) {
    console.error("Error submitting quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});


// ===== Rubrics =====

router.get("/:id/rubrics", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "rubrics");
    if (!auth) return;

    const rawRubrics = await localDb.prepare("SELECT * FROM rubrics WHERE course_id = ? ORDER BY created_at DESC").all(courseId);
    const rows = rawRubrics.map((r) => ({ ...r, criteria: JSON.parse(r.criteria || "[]") }));
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching rubrics:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/rubrics", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });
    const criteria = Array.isArray(req.body.criteria) ? req.body.criteria : [];

    const info = await localDb.prepare("INSERT INTO rubrics (course_id, title, criteria) VALUES (?, ?, ?)")
      .run(courseId, title, JSON.stringify(criteria));
    return res.status(201).json({ id: Number(info.lastInsertRowid), title, criteria });
  } catch (error) {
    console.error("Error creating rubric:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/rubrics/:rubricId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { title, criteria } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (criteria !== undefined) { updates.push("criteria = ?"); params.push(JSON.stringify(criteria)); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.rubricId, courseId);
    await localDb.prepare(`UPDATE rubrics SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    return res.json({ message: "Rubric updated" });
  } catch (error) {
    console.error("Error updating rubric:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/rubrics/:rubricId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    await localDb.prepare("DELETE FROM rubrics WHERE id = ? AND course_id = ?").run(req.params.rubricId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting rubric:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/rubrics/:rubricId/link", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const assignmentId = Number(req.body.assignmentId);
    if (!assignmentId) return res.status(400).json({ message: "assignmentId is required" });

    await localDb.prepare("INSERT OR IGNORE INTO rubric_assignment_links (rubric_id, assignment_id) VALUES (?, ?)")
      .run(req.params.rubricId, assignmentId);
    return res.status(201).json({ message: "Linked" });
  } catch (error) {
    console.error("Error linking rubric:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
