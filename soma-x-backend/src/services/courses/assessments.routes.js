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
  scheduleSpacedReview,
  userFullName,
} from "./shared.js";
import { recordBaselineResults } from "./setup.js";
import { recordQuizAttemptResults, recordSubmissionResults, rubricGrade } from "./results.js";
import { contentDeadlines } from "./schedule.js";
import { saveRubric } from "./rubrics.js";
import { recordEditAfterPublish } from "../insights/events.js";
import {
  OUTCOME_REQUIRED_MESSAGE,
  deleteContent,
  moduleSummary,
  moveContentToModule,
  needsOutcomeBeforePublish,
  sendItemError,
  syncListingPublished,
  updateItemDays,
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
      const submissions = await Promise.all(rawSubs.map(async (s) => ({
        ...s,
        fullName: await userFullName(s.scholar_email),
        rubricScores: await localDb.prepare("SELECT criterion_id, points, level, source FROM submission_scores WHERE submission_id = ?").all(s.id),
      })));
      return res.json({ ...assignment, submissions });
    }

    if (Number(row.published) !== 1) return res.status(404).json({ message: "Assignment not found" });
    const mySubmission = await localDb.prepare("SELECT * FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(assignment.id, auth.email);
    const rubricScores = mySubmission
      ? await localDb.prepare("SELECT criterion_id, points, level FROM submission_scores WHERE submission_id = ?").all(mySubmission.id)
      : [];
    const deadlines = await contentDeadlines(courseId, "assignment", assignment.id);
    return res.json({
      ...assignment,
      mySubmission: mySubmission ? { ...mySubmission, rubricScores } : null,
      deadlines: { releaseDate: deadlines.releaseDate, dueDate: deadlines.dueDate, closeDate: deadlines.closeDate, isLate: deadlines.isLate, isClosed: deadlines.isClosed, notOpenYet: deadlines.notOpenYet },
    });
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

    const { title, description, pointsPossible, published, moduleId } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (pointsPossible !== undefined) { updates.push("points_possible = ?"); params.push(Number(pointsPossible)); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    const hasDays = ["releaseDay", "dueDay", "closeDay"].some((k) => req.body[k] !== undefined);
    if (!updates.length && moduleId === undefined && !hasDays) return res.status(400).json({ message: "No fields to update" });
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
      await updateItemDays(courseId, "assignment", existing.id, req.body);
    })();
    await recordEditAfterPublish(req, courseId, "assignment", existing.id, existing.published);
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
    const isLearner = !isTeacherRole(auth.enrollment.role);
    if (isLearner && Number(assignment.published) !== 1) {
      return res.status(404).json({ message: "Assignment not found" });
    }
    const deadlines = await contentDeadlines(courseId, "assignment", assignment.id);
    if (isLearner && deadlines.notOpenYet) return res.status(409).json({ message: `This assignment opens on ${deadlines.releaseDate}`, code: "NOT_OPEN_YET" });
    if (isLearner && deadlines.isClosed) return res.status(409).json({ message: `This assignment closed on ${deadlines.closeDate}`, code: "CLOSED" });

    const alreadySubmitted = await localDb.prepare("SELECT 1 FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(assignment.id, auth.email);

    await localDb.prepare(`
      INSERT INTO assignment_submissions (assignment_id, scholar_email, body, submitted_at, is_late)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT(assignment_id, scholar_email) DO UPDATE SET body = excluded.body, submitted_at = CURRENT_TIMESTAMP, is_late = excluded.is_late
    `).run(assignment.id, auth.email, req.body.body || "", deadlines.isLate);

    if (!alreadySubmitted) {
      await scheduleSpacedReview(auth.email, `assignment_${assignment.id}`, assignment.title);
    }

    return res.status(201).json({ message: deadlines.isLate ? "Submitted late" : "Submitted", late: deadlines.isLate });
  } catch (error) {
    console.error("Error submitting assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Teachers grade their course; admins may override any grade but must give a reason.
async function requireGrader(req, res, courseId) {
  if (req.user?.role === "admin") {
    const reason = String(req.body?.reason || "").trim();
    if (reason.length < 5) {
      res.status(400).json({ message: "Admins must give a reason for changing a grade" });
      return null;
    }
    return { email: req.user.email, role: "admin", kind: "override", reason };
  }
  const auth = await requireTeacher(req, res, courseId);
  if (!auth) return null;
  return { email: auth.email, role: auth.enrollment.role, kind: "grade", reason: req.body?.reason || null };
}

async function gradeTarget(res, courseId, assignmentId, scholarEmailParam) {
  const assignment = await localDb.prepare("SELECT id, points_possible FROM assignments WHERE id = ? AND course_id = ?").get(assignmentId, courseId);
  if (!assignment) { res.status(404).json({ message: "Assignment not found" }); return null; }
  const scholarEmail = normalizeEmail(scholarEmailParam);
  const learner = await localDb.prepare("SELECT role FROM enrollments WHERE course_id = ? AND LOWER(user_email) = LOWER(?)").get(courseId, scholarEmail);
  if (!learner || learner.role !== "student") { res.status(404).json({ message: "That learner isn't in this course" }); return null; }
  return { assignment, scholarEmail };
}

async function saveGrade({ courseId, assignment, scholarEmail, grade, feedback, grader, changeKind }) {
  return await localDb.transaction(async () => {
    const previous = await localDb.prepare("SELECT id, grade FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(assignment.id, scholarEmail);
    const saved = await localDb.prepare(`
      INSERT INTO assignment_submissions (assignment_id, scholar_email, grade, graded_at, graded_by_teacher_email, feedback)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
      ON CONFLICT(assignment_id, scholar_email) DO UPDATE SET
        grade = excluded.grade, graded_at = CURRENT_TIMESTAMP, graded_by_teacher_email = excluded.graded_by_teacher_email,
        feedback = COALESCE(?, assignment_submissions.feedback)
      RETURNING id
    `).get(assignment.id, scholarEmail, grade, grader.email, feedback ?? "", feedback ?? null);
    // Every grade change is recorded (who, in what role, how, from what, to what, why).
    await localDb.prepare(`
      INSERT INTO grade_audit_log (submission_id, assignment_id, scholar_email, old_grade, new_grade, changed_by, reason, change_kind, actor_role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(saved.id, assignment.id, scholarEmail, previous?.grade ?? null, grade, grader.email, grader.reason, changeKind, grader.role);
    await recordSubmissionResults({ courseId, assignmentId: assignment.id, submissionId: saved.id });
    return saved.id;
  })();
}

router.patch("/:id/assignments/:assignmentId/grade/:scholarEmail", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const grader = await requireGrader(req, res, courseId);
    if (!grader) return;
    const target = await gradeTarget(res, courseId, req.params.assignmentId, req.params.scholarEmail);
    if (!target) return;
    const { assignment, scholarEmail } = target;

    // With a rubric, teachers grade criterion by criterion; only an admin override sets a total.
    const rubric = await localDb.prepare("SELECT id FROM rubrics WHERE assignment_id = ?").get(assignment.id);
    if (rubric && grader.kind !== "override") {
      return res.status(409).json({ message: "This assignment has a rubric: score each criterion instead", code: "RUBRIC_REQUIRED" });
    }

    const grade = Number(req.body.grade);
    const possible = Number(assignment.points_possible);
    if (req.body.grade === "" || req.body.grade === null || Number.isNaN(grade)) return res.status(400).json({ message: "grade must be a number" });
    if (grade < 0 || (possible > 0 && grade > possible)) {
      return res.status(400).json({ message: `grade must be between 0 and ${possible}` });
    }

    await saveGrade({ courseId, assignment, scholarEmail, grade, feedback: req.body.feedback, grader, changeKind: grader.kind });
    return res.json({ message: grader.kind === "override" ? "Grade overridden" : "Graded", grade });
  } catch (error) {
    console.error("Error grading assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Rubric grading: { scores: [{ criterionId, points, level? }], feedback?, reason?, source? }.
// The grade is computed from the criteria (weighted, scaled to the assignment's points).
router.put("/:id/assignments/:assignmentId/grade/:scholarEmail/rubric", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const grader = await requireGrader(req, res, courseId);
    if (!grader) return;
    const target = await gradeTarget(res, courseId, req.params.assignmentId, req.params.scholarEmail);
    if (!target) return;
    const { assignment, scholarEmail } = target;

    const rubric = await localDb.prepare("SELECT id FROM rubrics WHERE assignment_id = ?").get(assignment.id);
    if (!rubric) return res.status(404).json({ message: "This assignment has no rubric" });
    const criteria = await localDb.prepare("SELECT * FROM rubric_criteria WHERE rubric_id = ? ORDER BY position").all(rubric.id);
    const byId = new Map(criteria.map((c) => [Number(c.id), c]));
    const scores = Array.isArray(req.body.scores) ? req.body.scores : [];
    // When the teacher saves after an AI suggestion (aiDraftId), scores they kept unchanged are
    // recorded as "ai_suggested_accepted"; the draft records whether they edited it.
    const aiDraft = req.body.aiDraftId
      ? await localDb.prepare(`
          SELECT * FROM ai_drafts WHERE id = ? AND course_id = ? AND type = 'grading' AND status = 'pending'
            AND assignment_id = ? AND LOWER(scholar_email) = LOWER(?)
        `).get(req.body.aiDraftId, courseId, assignment.id, scholarEmail)
      : null;
    if (req.body.aiDraftId && !aiDraft) return res.status(404).json({ message: "That AI suggestion isn't available for this learner" });
    const suggested = new Map((aiDraft?.payload?.scores || []).map((s) => [Number(s.criterionId), Number(s.points)]));

    const parsed = new Map();
    for (const sc of scores) {
      const c = byId.get(Number(sc?.criterionId));
      if (!c) return res.status(400).json({ message: "A score refers to a criterion that isn't on this rubric" });
      const pts = Number(sc.points);
      if (sc.points === "" || sc.points == null || !Number.isFinite(pts) || pts < 0 || pts > Number(c.points)) {
        return res.status(400).json({ message: `"${c.title}" must be scored between 0 and ${Number(c.points)}` });
      }
      parsed.set(Number(c.id), {
        points: pts,
        level: sc.level ? String(sc.level).slice(0, 100) : null,
        source: aiDraft && suggested.get(Number(c.id)) === pts ? "ai_suggested_accepted" : "teacher",
      });
    }
    const missing = criteria.filter((c) => !parsed.has(Number(c.id)));
    if (missing.length) return res.status(400).json({ message: `Score every criterion (missing: ${missing.map((c) => c.title).join(", ")})` });

    const grade = rubricGrade(criteria, new Map([...parsed].map(([id, v]) => [id, v.points])), assignment.points_possible);
    await localDb.transaction(async () => {
      const submissionId = await saveGrade({ courseId, assignment, scholarEmail, grade, feedback: req.body.feedback, grader, changeKind: grader.kind === "override" ? "override" : "rubric" });
      for (const [criterionId, v] of parsed) {
        await localDb.prepare(`
          INSERT INTO submission_scores (submission_id, criterion_id, level, points, graded_by, source)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT (submission_id, criterion_id) DO UPDATE SET level = excluded.level, points = excluded.points,
            graded_by = excluded.graded_by, source = excluded.source, created_at = CURRENT_TIMESTAMP
        `).run(submissionId, criterionId, v.level, v.points, grader.email, v.source);
      }
      if (aiDraft) {
        const edited = [...parsed].some(([id, v]) => suggested.get(id) !== v.points)
          || (req.body.feedback !== undefined && req.body.feedback !== aiDraft.payload.feedback);
        await localDb.prepare(`
          UPDATE ai_drafts SET status = 'approved', edited = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP, result_refs = ?::jsonb WHERE id = ?
        `).run(edited, grader.email, JSON.stringify({ submissionId }), aiDraft.id);
      }
      // Recompute now that the per-criterion scores exist (outcome results use them).
      await recordSubmissionResults({ courseId, assignmentId: assignment.id, submissionId });
    })();

    return res.json({ message: "Graded with rubric", grade });
  } catch (error) {
    console.error("Error grading with rubric:", error);
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
    const allowed = await attemptLimit(quiz, req.user.id);
    const attemptsRemaining = allowed == null ? null : Math.max(0, allowed - attemptsUsed);
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

    const { title, description, published, moduleId } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    const hasDays = ["releaseDay", "dueDay", "closeDay"].some((k) => req.body[k] !== undefined);
    if (!updates.length && moduleId === undefined && !hasDays) return res.status(400).json({ message: "No fields to update" });
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
      await updateItemDays(courseId, "quiz", existing.id, req.body);
    })();
    await recordEditAfterPublish(req, courseId, "quiz", existing.id, existing.published);
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
    const isLearner = !isTeacherRole(auth.enrollment.role);
    if (isLearner && Number(quiz.published) !== 1) {
      return res.status(404).json({ message: "Quiz not found" });
    }
    const deadlines = await contentDeadlines(courseId, "quiz", quiz.id);
    if (isLearner && deadlines.notOpenYet) return res.status(409).json({ message: `This quiz opens on ${deadlines.releaseDate}`, code: "NOT_OPEN_YET" });
    if (isLearner && deadlines.isClosed) return res.status(409).json({ message: `This quiz closed on ${deadlines.closeDate}`, code: "CLOSED" });
    const allowed = await attemptLimit(quiz, req.user.id);

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
      if (allowed != null && attemptNumber > allowed) return null;
      const saved = await localDb.prepare(`
        INSERT INTO quiz_attempts (quiz_id, user_id, attempt_number, answers, started_at, submitted_at, score_points, score_pct, is_late)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?)
        RETURNING id
      `).get(quiz.id, req.user.id, attemptNumber, JSON.stringify(answers), score, scorePct, deadlines.isLate);
      // A learner's first baseline attempt sets their per-outcome starting point.
      if (quiz.kind === "baseline" && attemptNumber === 1 && auth.enrollment.role === "student") {
        await recordBaselineResults({ courseId, quizId: quiz.id, userId: req.user.id, email: auth.email, attemptId: saved.id, answers });
      }
      // Graded quizzes feed outcome mastery (practice quizzes don't count; baselines are separate).
      if (quiz.kind === "graded" && auth.enrollment.role === "student") {
        await recordQuizAttemptResults({ courseId, quizId: quiz.id, userId: req.user.id, attemptId: saved.id, answers });
      }
      return attemptNumber;
    })();
    if (attempt === null) {
      return res.status(409).json({ message: "You've used all your attempts for this quiz", code: "NO_ATTEMPTS_LEFT" });
    }

    if (attempt === 1) {
      await scheduleSpacedReview(auth.email, `quiz_${quiz.id}`, quiz.title);
    }

    const attemptsRemaining = allowed == null ? null : Math.max(0, allowed - attempt);
    return res.status(201).json({ message: deadlines.isLate ? "Submitted late" : "Submitted", score, scorePct, attemptNumber: attempt, attemptsRemaining, late: deadlines.isLate });
  } catch (error) {
    console.error("Error submitting quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});


// Attempts a learner may make: the quiz's limit plus any extra attempts their teacher granted.
async function attemptLimit(quiz, userId) {
  if (quiz.attempts_allowed == null) return null;
  const granted = await localDb.prepare("SELECT COALESCE(SUM(extra_attempts), 0) AS n FROM quiz_attempt_grants WHERE quiz_id = ? AND user_id = ?").get(quiz.id, userId);
  return Number(quiz.attempts_allowed) + Number(granted?.n || 0);
}

// A teacher lets one learner retake a limited quiz: { scholarEmail, extra?: 1-5, reason? }.
router.post("/:id/quizzes/:quizId/grant-attempt", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;
    const quiz = await localDb.prepare("SELECT * FROM quizzes WHERE id = ? AND course_id = ?").get(req.params.quizId, courseId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });
    if (quiz.kind === "baseline") return res.status(400).json({ message: "The baseline is taken once, before teaching, so it can't be retaken" });
    if (quiz.attempts_allowed == null) return res.status(400).json({ message: "This quiz already allows unlimited attempts" });

    const scholarEmail = normalizeEmail(req.body.scholarEmail);
    const learner = await localDb.prepare(`
      SELECT u.id FROM enrollments e JOIN users u ON LOWER(u.email) = LOWER(e.user_email)
      WHERE e.course_id = ? AND LOWER(e.user_email) = LOWER(?) AND e.role = 'student'
    `).get(courseId, scholarEmail);
    if (!learner) return res.status(404).json({ message: "That learner isn't in this course" });
    const extra = Number(req.body.extra ?? 1);
    if (!Number.isInteger(extra) || extra < 1 || extra > 5) return res.status(400).json({ message: "extra must be 1 to 5 attempts" });

    await localDb.prepare(`
      INSERT INTO quiz_attempt_grants (quiz_id, user_id, extra_attempts, granted_by, reason) VALUES (?, ?, ?, ?, ?)
    `).run(quiz.id, learner.id, extra, auth.email, req.body.reason || null);
    const used = Number((await localDb.prepare("SELECT COUNT(*) AS c FROM quiz_attempts WHERE quiz_id = ? AND user_id = ?").get(quiz.id, learner.id))?.c || 0);
    const allowed = await attemptLimit(quiz, learner.id);
    return res.json({ message: `Granted ${extra} more attempt${extra === 1 ? "" : "s"}`, attemptsAllowed: allowed, attemptsUsed: used, attemptsRemaining: Math.max(0, allowed - used) });
  } catch (error) {
    console.error("Error granting attempt:", error);
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

    const rubricId = await saveRubric(courseId, assignment, req.body);
    return res.json(await loadRubric(await localDb.prepare("SELECT * FROM rubrics WHERE id = ?").get(rubricId)));
  } catch (error) {
    if (sendItemError(res, error)) return;
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
