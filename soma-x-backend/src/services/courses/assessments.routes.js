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
import {
  OUTCOME_REQUIRED_MESSAGE,
  deleteContent,
  moduleSummary,
  moveContentToModule,
  needsOutcomeBeforePublish,
  sendItemError,
  syncListingPublished,
} from "./items.js";

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

router.get("/:id/assignments/:assignmentId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const row = await localDb.prepare("SELECT * FROM assignments WHERE id = ? AND course_id = ?").get(req.params.assignmentId, courseId);
    if (!row) return res.status(404).json({ message: "Assignment not found" });
    const assignment = { ...row, module: await moduleSummary(row.module_id) };

    if (isTeacherRole(auth.enrollment.role)) {
      const rawSubs = await localDb.prepare("SELECT * FROM assignment_submissions WHERE assignment_id = ?").all(assignment.id);
      const submissions = await Promise.all(rawSubs.map(async (s) => ({ ...s, fullName: await userFullName(s.scholar_email) })));
      return res.json({ ...assignment, submissions });
    }

    if (Number(row.published) !== 1) return res.status(404).json({ message: "Assignment not found" });
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

    const existing = await localDb.prepare("SELECT * FROM assignments WHERE id = ? AND course_id = ?").get(req.params.assignmentId, courseId);
    if (!existing) return res.status(404).json({ message: "Assignment not found" });

    const { title, description, dueAt, pointsPossible, published, moduleId } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (dueAt !== undefined) { updates.push("due_at = ?"); params.push(normalizeDueAt(dueAt)); }
    if (pointsPossible !== undefined) { updates.push("points_possible = ?"); params.push(Number(pointsPossible)); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (!updates.length && moduleId === undefined) return res.status(400).json({ message: "No fields to update" });
    if (published && await needsOutcomeBeforePublish("assignment", existing.id)) {
      return res.status(422).json({ message: OUTCOME_REQUIRED_MESSAGE, code: "OUTCOME_REQUIRED" });
    }

    await localDb.transaction(async () => {
      if (moduleId !== undefined && Number(moduleId) !== Number(existing.module_id)) {
        await moveContentToModule(courseId, "assignment", existing.id, moduleId);
      }
      if (updates.length) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        await localDb.prepare(`UPDATE assignments SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params, existing.id, courseId);
      }
      if (title !== undefined) await localDb.prepare("UPDATE module_items SET title = ? WHERE item_type = 'assignment' AND content_id = ?").run(title, existing.id);
      if (published !== undefined) await syncListingPublished("assignment", existing.id, published);
    })();
    const row = await localDb.prepare("SELECT * FROM assignments WHERE id = ?").get(existing.id);
    return res.json({ ...row, module: await moduleSummary(row.module_id) });
  } catch (error) {
    if (sendItemError(res, error)) return;
    console.error("Error updating assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/assignments/:assignmentId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const existing = await localDb.prepare("SELECT id FROM assignments WHERE id = ? AND course_id = ?").get(req.params.assignmentId, courseId);
    if (!existing) return res.status(404).json({ message: "Assignment not found" });
    await deleteContent(courseId, "assignment", existing.id);
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
    if (!isTeacherRole(auth.enrollment.role) && Number(assignment.published) !== 1) {
      return res.status(404).json({ message: "Assignment not found" });
    }

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

    const assignment = await localDb.prepare("SELECT id, points_possible FROM assignments WHERE id = ? AND course_id = ?").get(req.params.assignmentId, courseId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    const scholarEmail = normalizeEmail(req.params.scholarEmail);
    const learner = await localDb.prepare("SELECT role FROM enrollments WHERE course_id = ? AND LOWER(user_email) = LOWER(?)").get(courseId, scholarEmail);
    if (!learner || learner.role !== "student") return res.status(404).json({ message: "That learner isn't in this course" });

    const grade = Number(req.body.grade);
    const possible = Number(assignment.points_possible);
    if (req.body.grade === "" || req.body.grade === null || Number.isNaN(grade)) return res.status(400).json({ message: "grade must be a number" });
    if (grade < 0 || (possible > 0 && grade > possible)) {
      return res.status(400).json({ message: `grade must be between 0 and ${possible}` });
    }

    await localDb.transaction(async () => {
      const previous = await localDb.prepare("SELECT id, grade FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(assignment.id, scholarEmail);
      const saved = await localDb.prepare(`
        INSERT INTO assignment_submissions (assignment_id, scholar_email, grade, graded_at, graded_by_teacher_email, feedback)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
        ON CONFLICT(assignment_id, scholar_email) DO UPDATE SET
          grade = excluded.grade, graded_at = CURRENT_TIMESTAMP, graded_by_teacher_email = excluded.graded_by_teacher_email, feedback = excluded.feedback
        RETURNING id
      `).get(assignment.id, scholarEmail, grade, auth.email, req.body.feedback || "");
      // Every grade change is recorded (who, from what, to what).
      await localDb.prepare(`
        INSERT INTO grade_audit_log (submission_id, assignment_id, scholar_email, old_grade, new_grade, changed_by, reason)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(saved.id, assignment.id, scholarEmail, previous?.grade ?? null, grade, auth.email, req.body.reason || null);
    })();

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

router.get("/:id/quizzes/:quizId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const quizRow = await localDb.prepare("SELECT * FROM quizzes WHERE id = ? AND course_id = ?").get(req.params.quizId, courseId);
    if (!quizRow) return res.status(404).json({ message: "Quiz not found" });
    const quiz = { ...quizRow, module: await moduleSummary(quizRow.module_id) };

    const isTeacher = isTeacherRole(auth.enrollment.role);
    if (!isTeacher && Number(quizRow.published) !== 1) return res.status(404).json({ message: "Quiz not found" });
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
    const attemptsUsed = Number((await localDb.prepare("SELECT COUNT(*) AS c FROM quiz_attempts WHERE quiz_id = ? AND user_id = ? AND submitted_at IS NOT NULL").get(quiz.id, req.user.id))?.c || 0);
    const attemptsRemaining = quiz.attempts_allowed == null ? null : Math.max(0, Number(quiz.attempts_allowed) - attemptsUsed);
    return res.json({ ...quiz, questions, mySubmission: mySubmission || null, attemptsUsed, attemptsRemaining });
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

    const existing = await localDb.prepare("SELECT * FROM quizzes WHERE id = ? AND course_id = ?").get(req.params.quizId, courseId);
    if (!existing) return res.status(404).json({ message: "Quiz not found" });

    const { title, description, dueAt, published, moduleId } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (dueAt !== undefined) { updates.push("due_at = ?"); params.push(normalizeDueAt(dueAt)); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (!updates.length && moduleId === undefined) return res.status(400).json({ message: "No fields to update" });
    if (published && await needsOutcomeBeforePublish("quiz", existing.id)) {
      return res.status(422).json({ message: OUTCOME_REQUIRED_MESSAGE, code: "OUTCOME_REQUIRED" });
    }

    await localDb.transaction(async () => {
      if (moduleId !== undefined && Number(moduleId) !== Number(existing.module_id)) {
        await moveContentToModule(courseId, "quiz", existing.id, moduleId);
      }
      if (updates.length) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        await localDb.prepare(`UPDATE quizzes SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params, existing.id, courseId);
      }
      if (title !== undefined) await localDb.prepare("UPDATE module_items SET title = ? WHERE item_type = 'quiz' AND content_id = ?").run(title, existing.id);
      if (published !== undefined) await syncListingPublished("quiz", existing.id, published);
    })();
    const row = await localDb.prepare("SELECT * FROM quizzes WHERE id = ?").get(existing.id);
    return res.json({ ...row, module: await moduleSummary(row.module_id) });
  } catch (error) {
    if (sendItemError(res, error)) return;
    console.error("Error updating quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/quizzes/:quizId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const existing = await localDb.prepare("SELECT id FROM quizzes WHERE id = ? AND course_id = ?").get(req.params.quizId, courseId);
    if (!existing) return res.status(404).json({ message: "Quiz not found" });
    await deleteContent(courseId, "quiz", existing.id);
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
    if (!isTeacherRole(auth.enrollment.role) && Number(quiz.published) !== 1) {
      return res.status(404).json({ message: "Quiz not found" });
    }

    const answers = req.body.answers && typeof req.body.answers === "object" ? req.body.answers : {};
    const questions = await localDb.prepare("SELECT * FROM quiz_questions WHERE quiz_id = ?").all(quiz.id);

    let score = 0;
    let possible = 0;
    for (const question of questions) {
      possible += Number(question.points) || 0;
      const given = answers[String(question.id)];
      if (question.question_type === "multiple_choice" && question.correct_option && given === question.correct_option) {
        score += Number(question.points) || 0;
      }
    }
    const scorePct = possible > 0 ? Math.round((score / possible) * 10000) / 100 : null;

    // Every submission is kept as a new attempt; the limit (if any) is per learner.
    const attempt = await localDb.transaction(async () => {
      const used = await localDb.prepare("SELECT COALESCE(MAX(attempt_number), 0) AS n FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?").get(quiz.id, req.user.id);
      const attemptNumber = Number(used?.n || 0) + 1;
      if (quiz.attempts_allowed != null && attemptNumber > Number(quiz.attempts_allowed)) return null;
      await localDb.prepare(`
        INSERT INTO quiz_attempts (quiz_id, user_id, attempt_number, answers, started_at, submitted_at, score_points, score_pct)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
      `).run(quiz.id, req.user.id, attemptNumber, JSON.stringify(answers), score, scorePct);
      return attemptNumber;
    })();
    if (attempt === null) {
      return res.status(409).json({ message: "You've used all your attempts for this quiz", code: "NO_ATTEMPTS_LEFT" });
    }

    if (attempt === 1) {
      await scheduleSpacedReview(auth.email, `quiz_${quiz.id}`, quiz.title);
    }

    const attemptsRemaining = quiz.attempts_allowed == null ? null : Math.max(0, Number(quiz.attempts_allowed) - attempt);
    return res.status(201).json({ message: "Submitted", score, scorePct, attemptNumber: attempt, attemptsRemaining });
  } catch (error) {
    console.error("Error submitting quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});


// ===== Rubrics =====
// A rubric belongs to exactly one assignment. Criteria are rows that can each point at an
// outcome. The course-level list is a read-only library; rubrics are edited on their assignment.

async function loadRubric(rubric) {
  const criteria = await localDb.prepare(`
    SELECT c.id, c.title, c.description, c.points, c.weight, c.position, c.outcome_id,
           o.code AS outcome_code, o.title AS outcome_title
    FROM rubric_criteria c LEFT JOIN outcomes o ON o.id = c.outcome_id
    WHERE c.rubric_id = ? ORDER BY c.position ASC, c.id ASC
  `).all(rubric.id);
  return {
    ...rubric,
    criteria: criteria.map((c) => ({ ...c, points: Number(c.points), weight: Number(c.weight) })),
  };
}

router.get("/:id/rubrics", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "rubrics");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rows = await localDb.prepare(`
      SELECT r.*, a.title AS assignment_title, a.published AS assignment_published
      FROM rubrics r JOIN assignments a ON a.id = r.assignment_id
      WHERE r.course_id = ? ORDER BY r.created_at ASC
    `).all(courseId);
    const visible = rows.filter((r) => isTeacher || Number(r.assignment_published) === 1);
    return res.json(await Promise.all(visible.map(loadRubric)));
  } catch (error) {
    console.error("Error fetching rubrics:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/assignments/:assignmentId/rubric", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const assignment = await localDb.prepare("SELECT id, published FROM assignments WHERE id = ? AND course_id = ?").get(req.params.assignmentId, courseId);
    if (!assignment || (!isTeacherRole(auth.enrollment.role) && Number(assignment.published) !== 1)) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    const rubric = await localDb.prepare("SELECT * FROM rubrics WHERE assignment_id = ?").get(assignment.id);
    return res.json(rubric ? await loadRubric(rubric) : null);
  } catch (error) {
    console.error("Error fetching rubric:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Creates or replaces the assignment's rubric: { title, criteria: [{ title, description, points, weight, outcomeId }] }
router.put("/:id/assignments/:assignmentId/rubric", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const assignment = await localDb.prepare("SELECT id, title FROM assignments WHERE id = ? AND course_id = ?").get(req.params.assignmentId, courseId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    const criteria = Array.isArray(req.body.criteria) ? req.body.criteria : null;
    if (!criteria || criteria.length === 0) return res.status(400).json({ message: "A rubric needs at least one criterion" });
    for (const [i, c] of criteria.entries()) {
      if (!String(c?.title || "").trim()) return res.status(400).json({ message: `Criterion ${i + 1} needs a title` });
      if (c?.points !== undefined && (!Number.isFinite(Number(c.points)) || Number(c.points) < 0)) {
        return res.status(400).json({ message: `Criterion ${i + 1}: points must be 0 or more` });
      }
      if (c?.outcomeId) {
        const outcome = await localDb.prepare("SELECT id FROM outcomes WHERE id = ? AND course_id = ?").get(c.outcomeId, courseId);
        if (!outcome) return res.status(400).json({ message: `Criterion ${i + 1} is tagged with an outcome from another course` });
      }
    }

    const rubricId = await localDb.transaction(async () => {
      const title = String(req.body.title || "").trim() || `${assignment.title} rubric`;
      const saved = await localDb.prepare(`
        INSERT INTO rubrics (course_id, assignment_id, title) VALUES (?, ?, ?)
        ON CONFLICT (assignment_id) DO UPDATE SET title = excluded.title
        RETURNING id
      `).get(courseId, assignment.id, title);
      await localDb.prepare("DELETE FROM rubric_criteria WHERE rubric_id = ?").run(saved.id);
      for (const [pos, c] of criteria.entries()) {
        await localDb.prepare(`
          INSERT INTO rubric_criteria (rubric_id, outcome_id, title, description, points, weight, position)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(saved.id, c.outcomeId || null, String(c.title).trim(), String(c.description || ""),
          c.points === undefined ? 4 : Number(c.points), Number(c.weight) > 0 ? Number(c.weight) : 1, pos);
      }
      return saved.id;
    })();

    return res.json(await loadRubric(await localDb.prepare("SELECT * FROM rubrics WHERE id = ?").get(rubricId)));
  } catch (error) {
    console.error("Error saving rubric:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/assignments/:assignmentId/rubric", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    await localDb.prepare("DELETE FROM rubrics WHERE assignment_id = ? AND course_id = ?").run(req.params.assignmentId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting rubric:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
