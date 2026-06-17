import express from "express";
import { localDb, serverDb } from "../helpers/db-manager.js";
import fs from "fs";
import path from "path";
import { config } from "../config/index.js";
import multer from "multer";
import bcrypt from "bcrypt";

const router = express.Router();

const ASSIGNMENT_STATUSES = new Set(["assigned", "in_progress", "completed"]);
const LESSON_PROGRESS_STATUSES = new Set(["not_started", "in_progress", "completed"]);

const tempUploadsDir = path.join(config.paths.content, "temp-uploads");
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    fs.mkdirSync(tempUploadsDir, { recursive: true });
    cb(null, tempUploadsDir);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

function saveUploadedFile(tempPath, destPath) {
  try {
    fs.renameSync(tempPath, destPath);
  } catch (error) {
    if (error.code === 'EXDEV') {
      fs.copyFileSync(tempPath, destPath);
      fs.unlinkSync(tempPath);
    } else {
      throw error;
    }
  }
}

const cleanupTempFiles = (files) => {
  if (Array.isArray(files)) {
    for (const file of files) {
      if (file.path && fs.existsSync(file.path)) {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {
          console.error("Failed to delete temp file:", file.path, err);
        }
      }
    }
  } else if (files && typeof files === 'object') {
    if (files.path && fs.existsSync(files.path)) {
      try {
        fs.unlinkSync(files.path);
      } catch (err) {
        console.error("Failed to delete temp file:", files.path, err);
      }
    }
  }
};

const DEFAULT_MOCK_STUDENT_COUNT = 5;
const DEFAULT_MOCK_STUDENT_PASSWORD = "scholar123";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function parseScholarEmailInput(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeEmail).filter(Boolean);
  }

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map(normalizeEmail).filter(Boolean);
      }
      return [];
    } catch {
      return raw
        .split(",")
        .map(normalizeEmail)
        .filter(Boolean);
    }
  }

  return [];
}

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function sanitizeFilename(filename) {
  return String(filename || "file")
    .replace(/[\\/]/g, "-")
    .replace(/\s+/g, "-");
}

function parseStepMetadata(value) {
  if (!value) return {};

  if (typeof value === "object" && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      return {};
    } catch {
      return {};
    }
  }

  return {};
}

function toVisibilityFlag(value) {
  if (value === undefined || value === null) return 1;
  const normalized = String(value).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) return 0;
  return 1;
}

function normalizeDueAt(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeQuestionItem(question, fallbackPrompt = "") {
  const prompt = String(question?.prompt || fallbackPrompt || "").trim();
  const questionType = String(question?.questionType || "open").trim() === "multiple_choice"
    ? "multiple_choice"
    : "open";
  const required = question?.required !== false;
  const options = questionType === "multiple_choice"
    ? (Array.isArray(question?.options) ? question.options : [])
      .map((option) => String(option || "").trim())
      .filter(Boolean)
    : [];

  return {
    prompt,
    questionType,
    required,
    options,
  };
}

function normalizeStepQuestions(stepBody, metadata) {
  const parsedMetadata = parseStepMetadata(metadata);
  const fromArray = Array.isArray(parsedMetadata.questions)
    ? parsedMetadata.questions.map((question) => normalizeQuestionItem(question))
    : [];

  const validFromArray = fromArray.filter((question) => question.prompt);
  if (validFromArray.length > 0) {
    return validFromArray;
  }

  const fallbackQuestion = normalizeQuestionItem(
    {
      prompt: String(stepBody || "").trim(),
      questionType: parsedMetadata.questionType,
      options: parsedMetadata.options,
    },
    String(stepBody || "").trim()
  );

  return fallbackQuestion.prompt ? [fallbackQuestion] : [];
}

function mapQuestionResponsesByStep(rows) {
  const grouped = {};

  for (const row of rows || []) {
    const qIdx = Number(row.question_index);
    if (qIdx >= 1000) continue; // checkpoint responses — handled separately
    const stepId = Number(row.step_id);
    if (!grouped[stepId]) grouped[stepId] = [];

    grouped[stepId].push({
      questionIndex: qIdx,
      responseText: String(row.response_text || ""),
      selectedOption: String(row.selected_option || ""),
      updatedAt: row.updated_at,
    });
  }

  Object.keys(grouped).forEach((stepId) => {
    grouped[stepId] = grouped[stepId].sort((a, b) => a.questionIndex - b.questionIndex);
  });

  return grouped;
}

// Checkpoint responses are stored with question_index = (checkpointIndex + 1) * 1000 + questionIndex
// so they never collide with regular question responses (which are 0-999).
function mapCheckpointResponsesByStep(rows) {
  const grouped = {};

  for (const row of rows || []) {
    const qIdx = Number(row.question_index);
    if (qIdx < 1000) continue; // regular question response — not a checkpoint
    const stepId = Number(row.step_id);
    const checkpointIndex = Math.floor(qIdx / 1000) - 1;
    const questionIndex = qIdx % 1000;

    if (!grouped[stepId]) grouped[stepId] = {};
    if (!grouped[stepId][checkpointIndex]) grouped[stepId][checkpointIndex] = [];

    grouped[stepId][checkpointIndex].push({
      questionIndex,
      responseText: String(row.response_text || ""),
      selectedOption: String(row.selected_option || ""),
      updatedAt: row.updated_at,
    });
  }

  return grouped;
}

function getMissingRequiredQuestions(lessonId, scholarEmail) {
  const questionSteps = localDb
    .prepare(`
      SELECT id, step_order, title, body, metadata
      FROM class_lesson_steps
      WHERE lesson_id = ? AND step_type = 'question'
      ORDER BY step_order ASC
    `)
    .all(lessonId);

  const responsesByStep = mapQuestionResponsesByStep(
    localDb
      .prepare(`
        SELECT step_id, question_index, response_text, selected_option, updated_at
        FROM class_lesson_question_responses
        WHERE lesson_id = ? AND scholar_email = ?
      `)
      .all(lessonId, scholarEmail)
  );

  const missing = [];

  for (const step of questionSteps) {
    const questions = normalizeStepQuestions(step.body, step.metadata);
    const responses = Array.isArray(responsesByStep[Number(step.id)]) ? responsesByStep[Number(step.id)] : [];

    for (let index = 0; index < questions.length; index += 1) {
      const question = questions[index];
      if (!question.required) continue;

      const response = responses.find((item) => Number(item.questionIndex) === index);
      const answered = question.questionType === "multiple_choice"
        ? Boolean(String(response?.selectedOption || "").trim())
        : Boolean(String(response?.responseText || "").trim());

      if (!answered) {
        missing.push({
          stepId: Number(step.id),
          stepOrder: Number(step.step_order),
          stepTitle: String(step.title || "").trim() || null,
          questionIndex: index,
          questionPrompt: String(question.prompt || "").trim() || `Question ${index + 1}`,
        });
      }
    }
  }

  return missing;
}

function recomputeSubmissionGradeFromFeedback(submissionId, teacherEmail) {
  const aggregate = localDb
    .prepare(`
      SELECT
        COUNT(CASE WHEN awarded_points IS NOT NULL THEN 1 END) AS graded_items,
        COALESCE(SUM(CASE WHEN awarded_points IS NOT NULL THEN awarded_points ELSE 0 END), 0) AS grade_sum,
        COALESCE(SUM(CASE WHEN possible_points IS NOT NULL THEN possible_points ELSE 0 END), 0) AS points_sum
      FROM lesson_feedback_comments
      WHERE submission_id = ?
        AND question_index IS NOT NULL
    `)
    .get(submissionId);

  const gradedItems = Number(aggregate?.graded_items || 0);
  if (gradedItems <= 0) {
    localDb.prepare("DELETE FROM lesson_grades WHERE submission_id = ?").run(submissionId);
    return null;
  }

  const grade = Number(aggregate?.grade_sum || 0);
  const totalPoints = Number(aggregate?.points_sum || 0);

  localDb
    .prepare(`
      INSERT INTO lesson_grades (submission_id, grade, total_points, graded_by_teacher_email, graded_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(submission_id)
      DO UPDATE SET
        grade = excluded.grade,
        total_points = excluded.total_points,
        graded_by_teacher_email = excluded.graded_by_teacher_email,
        graded_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `)
    .run(submissionId, grade, totalPoints, teacherEmail);

  return { grade, total_points: totalPoints };
}

function isValidClassCode(classCode) {
  return /^\d{6}$/.test(String(classCode || "").trim());
}

function generateUniqueClassCode() {
  let attempts = 0;

  while (attempts < 2000) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exists = localDb
      .prepare("SELECT 1 FROM classes WHERE id = ?")
      .get(code);

    if (!exists) return code;
    attempts += 1;
  }

  throw new Error("Unable to generate a unique 6-digit class code");
}

function classExists(classId) {
  return localDb.prepare("SELECT * FROM classes WHERE id = ?").get(classId);
}

function teacherOwnsClass(classId, teacherEmail) {
  return localDb
    .prepare("SELECT 1 FROM classes WHERE id = ? AND teacher_email = ?")
    .get(classId, teacherEmail);
}

function scholarExists(scholarEmail) {
  return serverDb
    .prepare("SELECT 1 FROM users WHERE LOWER(email) = LOWER(?) AND LOWER(role) IN ('scholar', 'student')")
    .get(scholarEmail);
}

function scholarInClass(classId, scholarEmail) {
  return localDb
    .prepare("SELECT 1 FROM class_memberships WHERE class_id = ? AND scholar_email = ?")
    .get(classId, scholarEmail);
}

function getClassMemberScholarEmails(classId) {
  const rows = localDb
    .prepare("SELECT scholar_email FROM class_memberships WHERE class_id = ?")
    .all(classId);

  return rows
    .map((row) => normalizeEmail(row.scholar_email))
    .filter(Boolean);
}

function normalizeTargetScholarsForClass(classId, emails) {
  const classMembers = new Set(getClassMemberScholarEmails(classId));
  const uniqueRequested = Array.from(new Set((emails || []).map(normalizeEmail).filter(Boolean)));
  return uniqueRequested.filter((email) => classMembers.has(email));
}

function seedMockScholarsForClass(classId, count = DEFAULT_MOCK_STUDENT_COUNT) {
  const classRow = classExists(classId);
  if (!classRow) return { created: 0, total: 0 };

  const existingCount = Number(
    localDb
      .prepare("SELECT COUNT(*) AS total FROM class_memberships WHERE class_id = ?")
      .get(classId)?.total || 0
  );

  if (existingCount > 0) {
    return { created: 0, total: existingCount };
  }

  const passwordHash = bcrypt.hashSync(DEFAULT_MOCK_STUDENT_PASSWORD, 10);
  const insertUser = serverDb.prepare(`
    INSERT OR IGNORE INTO users (email, full_name, password_hash, role)
    VALUES (?, ?, ?, 'scholar')
  `);
  const insertMembership = localDb.prepare(`
    INSERT OR IGNORE INTO class_memberships (class_id, scholar_email, joined_via)
    VALUES (?, ?, 'mock_seed')
  `);

  let createdMemberships = 0;
  for (let index = 1; index <= Number(count || 0); index += 1) {
    const scholarEmail = `mock.${classId}.${index}@soma.local`;
    const scholarName = `Mock Student ${index}`;

    insertUser.run(scholarEmail, scholarName, passwordHash);
    const membershipInfo = insertMembership.run(classId, scholarEmail);
    createdMemberships += Number(membershipInfo.changes || 0);
  }

  const membershipCount = Number(
    localDb
      .prepare("SELECT COUNT(*) AS total FROM class_memberships WHERE class_id = ?")
      .get(classId)?.total || 0
  );

  localDb
    .prepare("UPDATE classes SET students = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(membershipCount, classId);

  return {
    created: createdMemberships,
    total: membershipCount,
  };
}

function syncLessonTargetsAndProgress(lessonId, classId, targetType, requestedScholarEmails = []) {
  const memberEmails = getClassMemberScholarEmails(classId);
  const memberSet = new Set(memberEmails);
  const resolvedTargetEmails =
    targetType === "scholars"
      ? Array.from(new Set(requestedScholarEmails.map(normalizeEmail).filter(Boolean))).filter((email) => memberSet.has(email))
      : memberEmails;

  localDb.prepare("DELETE FROM class_lesson_targets WHERE lesson_id = ?").run(lessonId);

  if (targetType === "scholars") {
    const insertTarget = localDb.prepare(`
      INSERT OR IGNORE INTO class_lesson_targets (lesson_id, scholar_email)
      VALUES (?, ?)
    `);

    for (const scholarEmail of resolvedTargetEmails) {
      insertTarget.run(lessonId, scholarEmail);
    }
  }

  const deleteNonTargets = (tableName) => {
    if (resolvedTargetEmails.length === 0) {
      localDb.prepare(`DELETE FROM ${tableName} WHERE lesson_id = ?`).run(lessonId);
      return;
    }

    const placeholders = resolvedTargetEmails.map(() => "?").join(", ");
    localDb
      .prepare(`DELETE FROM ${tableName} WHERE lesson_id = ? AND scholar_email NOT IN (${placeholders})`)
      .run(lessonId, ...resolvedTargetEmails);
  };

  deleteNonTargets("class_lesson_progress");
  deleteNonTargets("class_lesson_question_responses");

  if (resolvedTargetEmails.length > 0) {
    const insertProgress = localDb.prepare(`
      INSERT OR IGNORE INTO class_lesson_progress (lesson_id, scholar_email, status, current_step)
      VALUES (?, ?, 'not_started', 1)
    `);

    for (const scholarEmail of resolvedTargetEmails) {
      insertProgress.run(lessonId, scholarEmail);
    }
  }

  return {
    targetScholarEmails: resolvedTargetEmails,
    targetCount: resolvedTargetEmails.length,
  };
}

function ensureLessonProgressForScholarInClass(classId, scholarEmail) {
  localDb
    .prepare(`
      INSERT OR IGNORE INTO class_lesson_progress (lesson_id, scholar_email, status, current_step)
      SELECT cl.id, ?, 'not_started', 1
      FROM class_lessons cl
      LEFT JOIN class_lesson_targets clt
        ON clt.lesson_id = cl.id
       AND clt.scholar_email = ?
      WHERE cl.class_id = ?
        AND (
          cl.target_type = 'class'
          OR (cl.target_type = 'scholars' AND clt.id IS NOT NULL)
        )
    `)
    .run(scholarEmail, scholarEmail, classId);
}

function resolveContentMeta(contentPathKey) {
  const normalizedPath = String(contentPathKey || "").replace(/^\/+/, "");
  const normalizedUrl = `/${normalizedPath}`;

  const localMatch = localDb
    .prepare(`
      SELECT title, type, url, path_key
      FROM content_items
      WHERE path_key = ? OR url = ?
      LIMIT 1
    `)
    .get(normalizedPath, normalizedUrl);

  if (localMatch) return localMatch;

  const serverMatch = serverDb
    .prepare(`
      SELECT title, type, path_key
      FROM content_items
      WHERE path_key = ? OR path_key = ?
      LIMIT 1
    `)
    .get(normalizedPath, normalizedUrl);

  if (!serverMatch) return null;

  return {
    ...serverMatch,
    url: `/${serverMatch.path_key.replace(/^\/+/, "")}`,
  };
}

function assignmentVisibleToScholar(assignmentId, scholarEmail) {
  const assignment = localDb
    .prepare("SELECT id, class_id, target_type FROM lesson_assignments WHERE id = ?")
    .get(assignmentId);

  if (!assignment) return false;

  const isMember = scholarInClass(assignment.class_id, scholarEmail);
  if (!isMember) return false;

  if (assignment.target_type === "class") return true;

  const targeted = localDb
    .prepare("SELECT 1 FROM lesson_assignment_targets WHERE assignment_id = ? AND scholar_email = ?")
    .get(assignmentId, scholarEmail);

  return Boolean(targeted);
}

router.get("/mine", (req, res) => {
  try {
    const scholarEmail = normalizeEmail(req.query.scholarEmail);

    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }

    const rows = localDb
      .prepare(`
        SELECT c.*, cm.joined_at
        FROM classes c
        INNER JOIN class_memberships cm ON cm.class_id = c.id
        WHERE cm.scholar_email = ?
        ORDER BY cm.joined_at DESC
      `)
      .all(scholarEmail);

    return res.json(rows);
  } catch (error) {
    console.error("Error fetching scholar classes:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/join", (req, res) => {
  try {
    const classCode = String(req.body.classCode || "").trim();
    const scholarEmail = normalizeEmail(req.body.scholarEmail);

    if (!isValidClassCode(classCode)) {
      return res.status(400).json({ message: "classCode must be a 6-digit code" });
    }

    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }

    const classRow = classExists(classCode);
    if (!classRow) {
      return res.status(404).json({ message: "Invalid class code" });
    }

    const scholar = scholarExists(scholarEmail);
    if (!scholar) {
      return res.status(400).json({ message: "Scholar account not found" });
    }

    const existingMembership = localDb
      .prepare("SELECT * FROM class_memberships WHERE class_id = ? AND scholar_email = ?")
      .get(classCode, scholarEmail);

    if (existingMembership) {
      return res.json({
        message: "Already joined this class",
        class: classRow,
      });
    }

    localDb
      .prepare("INSERT INTO class_memberships (class_id, scholar_email, joined_via) VALUES (?, ?, 'code')")
      .run(classCode, scholarEmail);

    ensureLessonProgressForScholarInClass(classCode, scholarEmail);

    const membershipCount = localDb
      .prepare("SELECT COUNT(*) as total FROM class_memberships WHERE class_id = ?")
      .get(classCode);

    localDb
      .prepare("UPDATE classes SET students = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(Number(membershipCount?.total || 0), classCode);

    const updatedClass = classExists(classCode);

    return res.status(201).json({
      message: "Joined class successfully",
      class: updatedClass,
    });
  } catch (error) {
    console.error("Error joining class:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/assignments/mine", (req, res) => {
  try {
    const scholarEmail = normalizeEmail(req.query.scholarEmail);

    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }

    const rows = localDb
      .prepare(`
        SELECT
          la.id,
          la.class_id,
          la.content_path_key,
          la.assigned_by_teacher_email,
          la.target_type,
          la.due_at,
          la.assigned_at,
          c.name as class_name,
          c.grade as class_grade,
          lp.status,
          lp.last_position,
          lp.score,
          lp.started_at,
          lp.completed_at,
          lp.updated_at
        FROM lesson_assignments la
        INNER JOIN classes c ON c.id = la.class_id
        INNER JOIN class_memberships cm ON cm.class_id = la.class_id AND cm.scholar_email = ?
        LEFT JOIN lesson_progress lp ON lp.assignment_id = la.id AND lp.scholar_email = ?
        WHERE
          la.target_type = 'class'
          OR (
            la.target_type = 'scholars' AND EXISTS (
              SELECT 1
              FROM lesson_assignment_targets lat
              WHERE lat.assignment_id = la.id
                AND lat.scholar_email = ?
            )
          )
        ORDER BY la.assigned_at DESC
      `)
      .all(scholarEmail, scholarEmail, scholarEmail);

    const assignments = rows.map((row) => {
      const contentMeta = resolveContentMeta(row.content_path_key);
      return {
        id: row.id,
        classId: row.class_id,
        className: row.class_name,
        classGrade: row.class_grade,
        contentPathKey: row.content_path_key,
        contentTitle: contentMeta?.title || row.content_path_key,
        contentType: contentMeta?.type || "lesson",
        contentUrl: contentMeta?.url || `/${row.content_path_key}`,
        assignedByTeacherEmail: row.assigned_by_teacher_email,
        targetType: row.target_type,
        dueAt: row.due_at,
        assignedAt: row.assigned_at,
        progress: {
          status: row.status || "assigned",
          lastPosition: row.last_position,
          score: row.score,
          startedAt: row.started_at,
          completedAt: row.completed_at,
          updatedAt: row.updated_at,
        },
      };
    });

    return res.json(assignments);
  } catch (error) {
    console.error("Error fetching scholar assignments:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/lessons/mine", (req, res) => {
  try {
    const scholarEmail = normalizeEmail(req.query.scholarEmail);

    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }

    const lessonRows = localDb
      .prepare(`
        SELECT
          cl.id,
          cl.class_id,
          cl.title,
          cl.description,
          cl.due_at,
          cl.is_visible_to_students,
          cl.content_folder,
          cl.created_at,
          cl.updated_at,
          c.name AS class_name,
          c.grade AS class_grade
        FROM class_lessons cl
        INNER JOIN classes c ON c.id = cl.class_id
        INNER JOIN class_memberships cm ON cm.class_id = cl.class_id
        LEFT JOIN class_lesson_targets clt ON clt.lesson_id = cl.id AND clt.scholar_email = cm.scholar_email
        WHERE cm.scholar_email = ?
          AND cl.is_visible_to_students = 1
          AND (
            cl.target_type = 'class'
            OR (cl.target_type = 'scholars' AND clt.id IS NOT NULL)
          )
        ORDER BY c.name ASC, cl.created_at DESC
      `)
      .all(scholarEmail);

    const lessons = lessonRows.map((lesson) => {
      const steps = localDb
        .prepare(`
          SELECT id, step_order, step_type, title, body, metadata
          FROM class_lesson_steps
          WHERE lesson_id = ?
          ORDER BY step_order ASC
        `)
        .all(lesson.id)
        .map((step) => ({
          ...step,
          metadata: parseStepMetadata(step.metadata),
          fileUrl: step.step_type === "content" && String(step.body || "").startsWith("lessons/")
            ? `/${step.body}`
            : null,
        }));

      const submission = localDb
        .prepare(`
          SELECT
            ls.id,
            ls.submitted_at,
            ls.is_locked,
            lg.grade,
            lg.total_points,
            lg.graded_at
          FROM lesson_submissions ls
          LEFT JOIN lesson_grades lg ON lg.submission_id = ls.id
          WHERE ls.lesson_id = ? AND ls.scholar_email = ?
          LIMIT 1
        `)
        .get(lesson.id, scholarEmail);

      const feedbackCount = submission
        ? Number(
          localDb
            .prepare("SELECT COUNT(*) AS total FROM lesson_feedback_comments WHERE submission_id = ?")
            .get(submission.id)?.total || 0
        )
        : 0;

      return {
        id: lesson.id,
        classId: lesson.class_id,
        className: lesson.class_name,
        classGrade: lesson.class_grade,
        title: lesson.title,
        description: lesson.description,
        dueAt: lesson.due_at,
        isVisibleToStudents: Number(lesson.is_visible_to_students || 0) === 1,
        contentFolder: lesson.content_folder,
        createdAt: lesson.created_at,
        updatedAt: lesson.updated_at,
        isSubmitted: Boolean(
          localDb
            .prepare("SELECT 1 FROM lesson_submissions WHERE lesson_id = ? AND scholar_email = ?")
            .get(lesson.id, scholarEmail)
        ),
        progress:
          localDb
            .prepare(`
              SELECT status, current_step, started_at, completed_at, updated_at
              FROM class_lesson_progress
              WHERE lesson_id = ? AND scholar_email = ?
            `)
            .get(lesson.id, scholarEmail) || {
            status: "not_started",
            current_step: 1,
            started_at: null,
            completed_at: null,
            updated_at: null,
          },
        steps,
        stepCount: steps.length,
        submissionSummary: submission
          ? {
            submissionId: submission.id,
            submittedAt: submission.submitted_at,
            isLocked: Number(submission.is_locked || 0) === 1,
            grade: submission.grade,
            totalPoints: submission.total_points,
            gradedAt: submission.graded_at,
            feedbackCount,
          }
          : null,
      };
    });

    return res.json(lessons);
  } catch (error) {
    console.error("Error fetching scholar lessons:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/lessons/:lessonId", (req, res) => {
  try {
    const scholarEmail = normalizeEmail(req.query.scholarEmail);
    const lessonId = Number(req.params.lessonId);

    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }

    if (!lessonId || Number.isNaN(lessonId)) {
      return res.status(400).json({ message: "Invalid lessonId" });
    }

    const lesson = localDb
      .prepare(`
        SELECT
          cl.id,
          cl.class_id,
          cl.title,
          cl.description,
          cl.due_at,
          cl.is_visible_to_students,
          cl.content_folder,
          cl.created_at,
          cl.updated_at,
          cl.target_type,
          c.name AS class_name,
          c.grade AS class_grade
        FROM class_lessons cl
        INNER JOIN classes c ON c.id = cl.class_id
        WHERE cl.id = ?
      `)
      .get(lessonId);

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    if (Number(lesson.is_visible_to_students || 0) !== 1) {
      return res.status(403).json({ message: "This lesson is currently hidden by the teacher" });
    }

    const isMember = scholarInClass(lesson.class_id, scholarEmail);
    if (!isMember) {
      return res.status(403).json({ message: "Not allowed to view this lesson" });
    }

    if (lesson.target_type === "scholars") {
      const isTargeted = localDb
        .prepare("SELECT 1 FROM class_lesson_targets WHERE lesson_id = ? AND scholar_email = ?")
        .get(lessonId, scholarEmail);

      if (!isTargeted) {
        return res.status(403).json({ message: "This lesson is assigned to specific students only" });
      }
    }

    const steps = localDb
      .prepare(`
        SELECT id, step_order, step_type, title, body, metadata
        FROM class_lesson_steps
        WHERE lesson_id = ?
        ORDER BY step_order ASC
      `)
      .all(lessonId)
      .map((step) => ({
        ...step,
        metadata: parseStepMetadata(step.metadata),
        fileUrl:
          step.step_type === "content" && String(step.body || "").startsWith("lessons/")
            ? `/${step.body}`
            : null,
      }));

    const progress =
      localDb
        .prepare(`
          SELECT status, current_step, started_at, completed_at, updated_at
          FROM class_lesson_progress
          WHERE lesson_id = ? AND scholar_email = ?
        `)
        .get(lessonId, scholarEmail) || {
        status: "not_started",
        current_step: 1,
        started_at: null,
        completed_at: null,
        updated_at: null,
      };

    const questionResponseRows = localDb
      .prepare(`
        SELECT step_id, question_index, response_text, selected_option, updated_at
        FROM class_lesson_question_responses
        WHERE lesson_id = ? AND scholar_email = ?
        ORDER BY step_id ASC, question_index ASC
      `)
      .all(lessonId, scholarEmail);

    return res.json({
      id: lesson.id,
      classId: lesson.class_id,
      className: lesson.class_name,
      classGrade: lesson.class_grade,
      title: lesson.title,
      description: lesson.description,
      dueAt: lesson.due_at,
      isVisibleToStudents: Number(lesson.is_visible_to_students || 0) === 1,
      contentFolder: lesson.content_folder,
      createdAt: lesson.created_at,
      updatedAt: lesson.updated_at,
      isSubmitted: Boolean(
        localDb
          .prepare("SELECT 1 FROM lesson_submissions WHERE lesson_id = ? AND scholar_email = ?")
          .get(lessonId, scholarEmail)
      ),
      progress,
      questionResponsesByStep: mapQuestionResponsesByStep(questionResponseRows),
      checkpointResponsesByStep: mapCheckpointResponsesByStep(questionResponseRows),
      steps,
      stepCount: steps.length,
    });
  } catch (error) {
    console.error("Error fetching scholar lesson details:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/lessons/:lessonId/progress", (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId);
    const scholarEmail = normalizeEmail(req.body.scholarEmail);
    const status = req.body.status;
    const currentStepInput = req.body.currentStep;

    if (!lessonId || Number.isNaN(lessonId)) {
      return res.status(400).json({ message: "Invalid lessonId" });
    }

    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }

    if (status !== undefined && !LESSON_PROGRESS_STATUSES.has(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const lesson = localDb
      .prepare("SELECT id, class_id FROM class_lessons WHERE id = ?")
      .get(lessonId);

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const isMember = scholarInClass(lesson.class_id, scholarEmail);
    if (!isMember) {
      return res.status(403).json({ message: "Not allowed to update this lesson progress" });
    }

    const totalStepsRow = localDb
      .prepare("SELECT COUNT(*) as total FROM class_lesson_steps WHERE lesson_id = ?")
      .get(lessonId);
    const totalSteps = Number(totalStepsRow?.total || 0);

    const existing = localDb
      .prepare("SELECT * FROM class_lesson_progress WHERE lesson_id = ? AND scholar_email = ?")
      .get(lessonId, scholarEmail);

    const requestedStatus = status || existing?.status || "in_progress";
    if (requestedStatus === "completed") {
      const missingRequired = getMissingRequiredQuestions(lessonId, scholarEmail);
      if (missingRequired.length > 0) {
        return res.status(400).json({
          message: "Please answer all required questions before finishing this lesson",
          missingRequired,
        });
      }
    }

    const parsedCurrentStep =
      currentStepInput !== undefined && currentStepInput !== null
        ? Number(currentStepInput)
        : undefined;

    if (parsedCurrentStep !== undefined && Number.isNaN(parsedCurrentStep)) {
      return res.status(400).json({ message: "currentStep must be a number" });
    }

    const boundedStep = parsedCurrentStep !== undefined
      ? Math.max(1, Math.min(parsedCurrentStep, Math.max(totalSteps, 1)))
      : undefined;

    const nowIso = new Date().toISOString();

    if (!existing) {
      const nextStatus = status || "in_progress";
      localDb
        .prepare(`
          INSERT INTO class_lesson_progress (
            lesson_id,
            scholar_email,
            status,
            current_step,
            started_at,
            completed_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `)
        .run(
          lessonId,
          scholarEmail,
          nextStatus,
          boundedStep || 1,
          nextStatus === "not_started" ? null : nowIso,
          nextStatus === "completed" ? nowIso : null
        );
    } else {
      const nextStatus = status || existing.status || "in_progress";
      const nextStep = boundedStep || existing.current_step || 1;

      localDb
        .prepare(`
          UPDATE class_lesson_progress
          SET
            status = ?,
            current_step = ?,
            started_at = ?,
            completed_at = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE lesson_id = ? AND scholar_email = ?
        `)
        .run(
          nextStatus,
          nextStep,
          existing.started_at || (nextStatus === "not_started" ? null : nowIso),
          nextStatus === "completed" ? nowIso : null,
          lessonId,
          scholarEmail
        );

      // When lesson is completed, create a submission record if it doesn't exist
      if (nextStatus === "completed") {
        const existingSubmission = localDb
          .prepare("SELECT id FROM lesson_submissions WHERE lesson_id = ? AND scholar_email = ?")
          .get(lessonId, scholarEmail);

        if (!existingSubmission) {
          localDb
            .prepare(`
              INSERT INTO lesson_submissions (lesson_id, scholar_email, submitted_at, is_locked)
              VALUES (?, ?, CURRENT_TIMESTAMP, 1)
            `)
            .run(lessonId, scholarEmail);
        }
      }
    }

    const updated = localDb
      .prepare(`
        SELECT status, current_step, started_at, completed_at, updated_at
        FROM class_lesson_progress
        WHERE lesson_id = ? AND scholar_email = ?
      `)
      .get(lessonId, scholarEmail);

    return res.json(updated);
  } catch (error) {
    console.error("Error updating class lesson progress:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/lessons/:lessonId/responses", (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId);
    const scholarEmail = normalizeEmail(req.body.scholarEmail);
    const stepId = Number(req.body.stepId);
    const responses = Array.isArray(req.body.responses) ? req.body.responses : [];

    if (!lessonId || Number.isNaN(lessonId)) {
      return res.status(400).json({ message: "Invalid lessonId" });
    }

    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }

    if (!stepId || Number.isNaN(stepId)) {
      return res.status(400).json({ message: "Invalid stepId" });
    }

    const lesson = localDb
      .prepare("SELECT id, class_id FROM class_lessons WHERE id = ?")
      .get(lessonId);

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const isMember = scholarInClass(lesson.class_id, scholarEmail);
    if (!isMember) {
      return res.status(403).json({ message: "Not allowed to submit responses for this lesson" });
    }

    // Check if lesson submission is locked
    const submission = localDb
      .prepare("SELECT is_locked FROM lesson_submissions WHERE lesson_id = ? AND scholar_email = ?")
      .get(lessonId, scholarEmail);

    if (submission && submission.is_locked === 1) {
      return res.status(403).json({ message: "This lesson has been submitted and cannot be edited" });
    }

    const step = localDb
      .prepare("SELECT id, step_type, body, metadata FROM class_lesson_steps WHERE id = ? AND lesson_id = ?")
      .get(stepId, lessonId);

    if (!step) {
      return res.status(404).json({ message: "Lesson step not found" });
    }

    if (step.step_type !== "question") {
      return res.status(400).json({ message: "Responses can only be submitted for question steps" });
    }

    const questions = normalizeStepQuestions(step.body, step.metadata);
    if (!questions.length) {
      return res.status(400).json({ message: "This question step has no configured questions" });
    }

    const upsertResponse = localDb.prepare(`
      INSERT INTO class_lesson_question_responses (
        lesson_id,
        step_id,
        scholar_email,
        question_index,
        response_text,
        selected_option,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(lesson_id, step_id, scholar_email, question_index)
      DO UPDATE SET
        response_text = excluded.response_text,
        selected_option = excluded.selected_option,
        updated_at = CURRENT_TIMESTAMP
    `);

    const deleteResponse = localDb.prepare(`
      DELETE FROM class_lesson_question_responses
      WHERE lesson_id = ? AND step_id = ? AND scholar_email = ? AND question_index = ?
    `);

    for (const rawResponse of responses) {
      const questionIndex = Number(rawResponse?.questionIndex);

      if (Number.isNaN(questionIndex) || questionIndex < 0 || questionIndex >= questions.length) {
        return res.status(400).json({ message: "Invalid questionIndex in responses" });
      }

      const question = questions[questionIndex];
      const responseText = String(rawResponse?.responseText || "").trim();
      const selectedOption = String(rawResponse?.selectedOption || "").trim();

      if (question.questionType === "multiple_choice") {
        if (selectedOption && !question.options.includes(selectedOption)) {
          return res.status(400).json({ message: `Invalid choice selected for question ${questionIndex + 1}` });
        }

        if (!selectedOption) {
          deleteResponse.run(lessonId, stepId, scholarEmail, questionIndex);
        } else {
          upsertResponse.run(lessonId, stepId, scholarEmail, questionIndex, "", selectedOption);
        }
      } else {
        if (!responseText) {
          deleteResponse.run(lessonId, stepId, scholarEmail, questionIndex);
        } else {
          upsertResponse.run(lessonId, stepId, scholarEmail, questionIndex, responseText, "");
        }
      }
    }

    const savedRows = localDb
      .prepare(`
        SELECT question_index, response_text, selected_option, updated_at
        FROM class_lesson_question_responses
        WHERE lesson_id = ? AND step_id = ? AND scholar_email = ?
        ORDER BY question_index ASC
      `)
      .all(lessonId, stepId, scholarEmail)
      .map((row) => ({
        questionIndex: Number(row.question_index),
        responseText: String(row.response_text || ""),
        selectedOption: String(row.selected_option || ""),
        updatedAt: row.updated_at,
      }));

    return res.json({
      lessonId,
      stepId,
      responses: savedRows,
    });
  } catch (error) {
    console.error("Error saving class lesson question responses:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/lessons/:lessonId/checkpoint-responses", (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId);
    const scholarEmail = normalizeEmail(req.body.scholarEmail);
    const stepId = Number(req.body.stepId);
    const checkpointIndex = Number(req.body.checkpointIndex);
    const responses = Array.isArray(req.body.responses) ? req.body.responses : [];

    if (!lessonId || Number.isNaN(lessonId)) {
      return res.status(400).json({ message: "Invalid lessonId" });
    }
    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }
    if (!stepId || Number.isNaN(stepId)) {
      return res.status(400).json({ message: "Invalid stepId" });
    }
    if (Number.isNaN(checkpointIndex) || checkpointIndex < 0) {
      return res.status(400).json({ message: "Invalid checkpointIndex" });
    }

    const lesson = localDb
      .prepare("SELECT id, class_id FROM class_lessons WHERE id = ?")
      .get(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const isMember = scholarInClass(lesson.class_id, scholarEmail);
    if (!isMember) {
      return res.status(403).json({ message: "Not allowed to submit responses for this lesson" });
    }

    const submission = localDb
      .prepare("SELECT is_locked FROM lesson_submissions WHERE lesson_id = ? AND scholar_email = ?")
      .get(lessonId, scholarEmail);
    if (submission && submission.is_locked === 1) {
      return res.status(403).json({ message: "This lesson has been submitted and cannot be edited" });
    }

    const step = localDb
      .prepare("SELECT id, step_type, metadata FROM class_lesson_steps WHERE id = ? AND lesson_id = ?")
      .get(stepId, lessonId);
    if (!step) {
      return res.status(404).json({ message: "Lesson step not found" });
    }
    if (step.step_type !== "content") {
      return res.status(400).json({ message: "Checkpoint responses can only be submitted for content steps" });
    }

    const metadata = parseStepMetadata(step.metadata);
    const videoCheckpoints = Array.isArray(metadata.videoCheckpoints) ? metadata.videoCheckpoints : [];
    if (checkpointIndex >= videoCheckpoints.length) {
      return res.status(400).json({ message: "Invalid checkpointIndex" });
    }

    const checkpoint = videoCheckpoints[checkpointIndex];
    const questions = Array.isArray(checkpoint.questions) ? checkpoint.questions : [];

    const upsert = localDb.prepare(`
      INSERT INTO class_lesson_question_responses (
        lesson_id, step_id, scholar_email, question_index, response_text, selected_option, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(lesson_id, step_id, scholar_email, question_index)
      DO UPDATE SET
        response_text = excluded.response_text,
        selected_option = excluded.selected_option,
        updated_at = CURRENT_TIMESTAMP
    `);

    for (const rawResponse of responses) {
      const qi = Number(rawResponse?.questionIndex);
      if (Number.isNaN(qi) || qi < 0 || qi >= questions.length) {
        return res.status(400).json({ message: "Invalid questionIndex in checkpoint responses" });
      }

      const encodedQIndex = (checkpointIndex + 1) * 1000 + qi;
      const responseText = String(rawResponse?.responseText || "").trim();
      const selectedOption = String(rawResponse?.selectedOption || "").trim();

      upsert.run(lessonId, stepId, scholarEmail, encodedQIndex, responseText, selectedOption);
    }

    return res.json({ saved: true, checkpointIndex });
  } catch (error) {
    console.error("Error saving checkpoint responses:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Check if a lesson submission exists (locked status)
router.get("/lessons/:lessonId/submission-status", (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId);
    const scholarEmail = normalizeEmail(req.query.scholarEmail);

    if (!lessonId || Number.isNaN(lessonId)) {
      return res.status(400).json({ message: "Invalid lessonId" });
    }

    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }

    const lesson = localDb
      .prepare("SELECT id, class_id FROM class_lessons WHERE id = ?")
      .get(lessonId);

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const isMember = scholarInClass(lesson.class_id, scholarEmail);
    if (!isMember) {
      return res.status(403).json({ message: "Not allowed to check this lesson status" });
    }

    const submission = localDb
      .prepare("SELECT id, submitted_at, is_locked FROM lesson_submissions WHERE lesson_id = ? AND scholar_email = ?")
      .get(lessonId, scholarEmail);

    if (!submission) {
      return res.json({
        hasSubmission: false,
        isLocked: false,
        submittedAt: null,
        grades: null,
        feedback: [],
      });
    }

    const grades = localDb
      .prepare(`
        SELECT grade, total_points, graded_by_teacher_email, graded_at, updated_at
        FROM lesson_grades
        WHERE submission_id = ?
      `)
      .get(submission.id);

    const feedback = localDb
      .prepare(`
        SELECT id, step_id, question_index, comment_text, awarded_points, possible_points, teacher_email, created_at, updated_at
        FROM lesson_feedback_comments
        WHERE submission_id = ?
        ORDER BY created_at DESC
      `)
      .all(submission.id);

    return res.json({
      hasSubmission: true,
      isLocked: submission.is_locked === 1,
      submittedAt: submission.submitted_at,
      submissionId: submission.id,
      grades: grades || null,
      feedback,
    });
  } catch (error) {
    console.error("Error checking lesson submission status:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/assignments/:assignmentId/progress", (req, res) => {
  try {
    const assignmentId = Number(req.params.assignmentId);
    const scholarEmail = normalizeEmail(req.body.scholarEmail);
    const status = req.body.status;
    const lastPosition = req.body.lastPosition;
    const score = req.body.score;

    if (!assignmentId || Number.isNaN(assignmentId)) {
      return res.status(400).json({ message: "Invalid assignmentId" });
    }

    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }

    if (status !== undefined && !ASSIGNMENT_STATUSES.has(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    if (!assignmentVisibleToScholar(assignmentId, scholarEmail)) {
      return res.status(403).json({ message: "You are not allowed to update this assignment" });
    }

    const existing = localDb
      .prepare("SELECT * FROM lesson_progress WHERE assignment_id = ? AND scholar_email = ?")
      .get(assignmentId, scholarEmail);

    const nowIso = new Date().toISOString();
    const nextStatus = status || existing?.status || "assigned";
    const nextStartedAt =
      existing?.started_at ||
      (nextStatus === "in_progress" || nextStatus === "completed" ? nowIso : null);
    const nextCompletedAt = nextStatus === "completed" ? nowIso : null;

    if (!existing) {
      localDb
        .prepare(`
          INSERT INTO lesson_progress (
            assignment_id,
            scholar_email,
            status,
            last_position,
            score,
            started_at,
            completed_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `)
        .run(
          assignmentId,
          scholarEmail,
          nextStatus,
          lastPosition ?? null,
          score ?? null,
          nextStartedAt,
          nextCompletedAt
        );
    } else {
      localDb
        .prepare(`
          UPDATE lesson_progress
          SET
            status = ?,
            last_position = ?,
            score = ?,
            started_at = ?,
            completed_at = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE assignment_id = ? AND scholar_email = ?
        `)
        .run(
          nextStatus,
          lastPosition ?? existing.last_position,
          score ?? existing.score,
          existing.started_at || nextStartedAt,
          nextCompletedAt,
          assignmentId,
          scholarEmail
        );
    }

    const updated = localDb
      .prepare("SELECT * FROM lesson_progress WHERE assignment_id = ? AND scholar_email = ?")
      .get(assignmentId, scholarEmail);

    return res.json(updated);
  } catch (error) {
    console.error("Error updating lesson progress:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("", (req, res) => {
  try {
    const teacherEmail = normalizeEmail(req.query.teacherEmail);
    const scholarEmail = normalizeEmail(req.query.scholarEmail);
    const role = String(req.query.role || "").trim();

    if (teacherEmail) {
      const rows = localDb
        .prepare("SELECT * FROM classes WHERE teacher_email = ? ORDER BY created_at DESC")
        .all(teacherEmail);
      return res.json(rows);
    }

    if (role === "scholar" && scholarEmail) {
      const rows = localDb
        .prepare(`
          SELECT c.*, cm.joined_at
          FROM classes c
          INNER JOIN class_memberships cm ON cm.class_id = c.id
          WHERE cm.scholar_email = ?
          ORDER BY cm.joined_at DESC
        `)
        .all(scholarEmail);
      return res.json(rows);
    }

    const rows = localDb
      .prepare("SELECT * FROM classes ORDER BY created_at DESC")
      .all();
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching classes:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id", (req, res) => {
  try {
    const row = localDb
      .prepare("SELECT * FROM classes WHERE id = ?")
      .get(req.params.id);

    if (!row) return res.status(404).json({ message: "Class not found" });
    return res.json(row);
  } catch (error) {
    console.error("Error fetching class:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/members", (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const teacherEmail = normalizeEmail(req.query.teacherEmail);

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) {
      return res.status(403).json({ message: "Not allowed to view members for this class" });
    }

    let rows = localDb
      .prepare(`
        SELECT cm.scholar_email, cm.joined_at
        FROM class_memberships cm
        WHERE cm.class_id = ?
        ORDER BY cm.joined_at DESC
      `)
      .all(classId);

    if (rows.length === 0) {
      seedMockScholarsForClass(classId, DEFAULT_MOCK_STUDENT_COUNT);
      rows = localDb
        .prepare(`
          SELECT cm.scholar_email, cm.joined_at
          FROM class_memberships cm
          WHERE cm.class_id = ?
          ORDER BY cm.joined_at DESC
        `)
        .all(classId);
    }

    const rowsWithNames = rows.map((row) => {
      const user = serverDb
        .prepare("SELECT id, email, full_name, role FROM users WHERE LOWER(email) = LOWER(?)")
        .get(row.scholar_email);

      return {
        ...row,
        user_id: user?.id || null,
        email: user?.email || row.scholar_email,
        role: String(user?.role || "scholar").toLowerCase(),
        full_name: user?.full_name || "",
      };
    });

    return res.json(rowsWithNames);
  } catch (error) {
    console.error("Error fetching class members:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/members/:scholarEmail", (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const scholarEmail = normalizeEmail(req.params.scholarEmail);
    const teacherEmail = normalizeEmail(req.query.teacherEmail || req.body?.teacherEmail);

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) {
      return res.status(403).json({ message: "Not allowed to manage members for this class" });
    }

    const membership = localDb
      .prepare("SELECT 1 FROM class_memberships WHERE class_id = ? AND scholar_email = ?")
      .get(classId, scholarEmail);

    if (!membership) {
      return res.status(404).json({ message: "Student is not a member of this class" });
    }

    localDb
      .prepare("DELETE FROM class_memberships WHERE class_id = ? AND scholar_email = ?")
      .run(classId, scholarEmail);

    const classLessonIds = localDb
      .prepare("SELECT id FROM class_lessons WHERE class_id = ?")
      .all(classId)
      .map((row) => Number(row.id));

    if (classLessonIds.length > 0) {
      const placeholders = classLessonIds.map(() => "?").join(", ");
      localDb
        .prepare(`DELETE FROM class_lesson_targets WHERE scholar_email = ? AND lesson_id IN (${placeholders})`)
        .run(scholarEmail, ...classLessonIds);
      localDb
        .prepare(`DELETE FROM class_lesson_progress WHERE scholar_email = ? AND lesson_id IN (${placeholders})`)
        .run(scholarEmail, ...classLessonIds);
      localDb
        .prepare(`DELETE FROM class_lesson_question_responses WHERE scholar_email = ? AND lesson_id IN (${placeholders})`)
        .run(scholarEmail, ...classLessonIds);
    }

    const classAssignmentIds = localDb
      .prepare("SELECT id FROM lesson_assignments WHERE class_id = ?")
      .all(classId)
      .map((row) => Number(row.id));

    if (classAssignmentIds.length > 0) {
      const placeholders = classAssignmentIds.map(() => "?").join(", ");
      localDb
        .prepare(`DELETE FROM lesson_assignment_targets WHERE scholar_email = ? AND assignment_id IN (${placeholders})`)
        .run(scholarEmail, ...classAssignmentIds);
      localDb
        .prepare(`DELETE FROM lesson_progress WHERE scholar_email = ? AND assignment_id IN (${placeholders})`)
        .run(scholarEmail, ...classAssignmentIds);
    }

    const membershipCount = Number(
      localDb
        .prepare("SELECT COUNT(*) AS total FROM class_memberships WHERE class_id = ?")
        .get(classId)?.total || 0
    );

    localDb
      .prepare("UPDATE classes SET students = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(membershipCount, classId);

    return res.json({
      message: "Student removed from class",
      classId,
      scholarEmail,
      students: membershipCount,
    });
  } catch (error) {
    console.error("Error removing class member:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/lessons", (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const teacherEmail = normalizeEmail(req.query.teacherEmail);

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) {
      return res.status(403).json({ message: "Not allowed to view lessons for this class" });
    }

    const lessonRows = localDb
      .prepare(`
        SELECT id, class_id, title, description, due_at, content_folder, is_visible_to_students, target_type, created_by_teacher_email, created_at, updated_at
        FROM class_lessons
        WHERE class_id = ?
        ORDER BY created_at DESC
      `)
      .all(classId);

    const classMemberCount =
      localDb
        .prepare("SELECT COUNT(*) AS total FROM class_memberships WHERE class_id = ?")
        .get(classId)?.total || 0;

    const lessons = lessonRows.map((lesson) => {
      const steps = localDb
        .prepare(`
          SELECT id, step_order, step_type, title, body, metadata
          FROM class_lesson_steps
          WHERE lesson_id = ?
          ORDER BY step_order ASC
        `)
        .all(lesson.id)
        .map((step) => ({
          ...step,
          metadata: parseStepMetadata(step.metadata),
          fileUrl: step.step_type === "content" && String(step.body || "").startsWith("lessons/")
            ? `/${step.body}`
            : null,
        }));

      const progressStats =
        localDb
          .prepare(`
            SELECT
              SUM(CASE WHEN status IN ('in_progress', 'completed') THEN 1 ELSE 0 END) AS started_count,
              SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_count
            FROM class_lesson_progress
            WHERE lesson_id = ?
          `)
          .get(lesson.id) || {};

      // Get submission and grading stats
      const submissionStats = localDb
        .prepare(`
          SELECT
            COUNT(*) AS total_submissions,
            SUM(CASE WHEN EXISTS (SELECT 1 FROM lesson_grades WHERE submission_id = lesson_submissions.id) THEN 1 ELSE 0 END) AS graded_count
          FROM lesson_submissions
          WHERE lesson_id = ?
        `)
        .get(lesson.id) || {};

      return {
        ...lesson,
        dueAt: lesson.due_at,
        isVisibleToStudents: Number(lesson.is_visible_to_students || 0) === 1,
        targetType: lesson.target_type || "class",
        targetCount:
          lesson.target_type === "class"
            ? Number(classMemberCount || 0)
            : Number(
              localDb
                .prepare("SELECT COUNT(*) AS total FROM class_lesson_targets WHERE lesson_id = ?")
                .get(lesson.id)?.total || 0
            ),
        startedCount: Number(progressStats.started_count || 0),
        completedCount: Number(progressStats.completed_count || 0),
        completed_submissions: Number(submissionStats.total_submissions || 0),
        graded_count: Number(submissionStats.graded_count || 0),
        totalStudents:
          lesson.target_type === "class"
            ? Number(classMemberCount || 0)
            : Number(
              localDb
                .prepare("SELECT COUNT(*) AS total FROM class_lesson_targets WHERE lesson_id = ?")
                .get(lesson.id)?.total || 0
            ),
        steps,
        stepCount: steps.length,
      };
    });

    return res.json(lessons);
  } catch (error) {
    console.error("Error fetching class lessons:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/lessons", upload.any(), (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const teacherEmail = normalizeEmail(req.body.teacherEmail);
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const dueAt = normalizeDueAt(req.body.dueAt);
    const isVisibleToStudents = toVisibilityFlag(req.body.isVisibleToStudents);
    const targetType = String(req.body.targetType || "class").trim();
    const targetScholarEmails = parseScholarEmailInput(req.body.targetScholarEmails);
    const parsedSteps = typeof req.body.steps === "string"
      ? JSON.parse(req.body.steps || "[]")
      : req.body.steps;
    const steps = Array.isArray(parsedSteps) ? parsedSteps : [];
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    if (!title) {
      return res.status(400).json({ message: "title is required" });
    }

    if (steps.length === 0) {
      return res.status(400).json({ message: "At least one lesson step is required" });
    }

    if (!["class", "scholars"].includes(targetType)) {
      return res.status(400).json({ message: "targetType must be 'class' or 'scholars'" });
    }

    const resolvedTargetScholarEmails = normalizeTargetScholarsForClass(classId, targetScholarEmails);
    if (targetType === "scholars" && resolvedTargetScholarEmails.length === 0) {
      return res.status(400).json({ message: "Select at least one student in this class" });
    }

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) {
      return res.status(403).json({ message: "Not allowed to create lessons for this class" });
    }

    const lessonInsert = localDb
      .prepare(`
        INSERT INTO class_lessons (class_id, title, description, due_at, content_folder, is_visible_to_students, target_type, created_by_teacher_email)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(classId, title, description, dueAt, null, isVisibleToStudents, targetType, teacherEmail);

    const lessonId = Number(lessonInsert.lastInsertRowid);
    const titleSlug = toSlug(title) || "lesson";
    const contentFolder = `lessons/${titleSlug}-${lessonId}`;

    localDb
      .prepare(`
        UPDATE class_lessons
        SET content_folder = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `)
      .run(contentFolder, lessonId);

    fs.mkdirSync(path.join(config.paths.content, contentFolder), { recursive: true });

    const insertStep = localDb.prepare(`
      INSERT INTO class_lesson_steps (lesson_id, step_order, step_type, title, body, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (let index = 0; index < steps.length; index += 1) {
      const rawStep = steps[index] || {};
      const stepType = String(rawStep.stepType || rawStep.type || "").trim();
      const stepTitle = String(rawStep.title || "").trim();
      const stepBody = String(rawStep.body || rawStep.content || rawStep.question || "").trim();
      const contentMode = String(rawStep.contentMode || "type").trim();
      const fileField = String(rawStep.fileField || "").trim();
      const stepMetadata = parseStepMetadata(rawStep.metadata);

      if (!["question", "content"].includes(stepType)) {
        return res.status(400).json({ message: `Invalid step type at position ${index + 1}` });
      }

      let resolvedStepBody = stepBody;
      if (stepType === "content" && contentMode === "upload") {
        const matchingFile = uploadedFiles.find((file) => file.fieldname === fileField);
        if (!matchingFile) {
          return res.status(400).json({ message: `Upload file is required at position ${index + 1}` });
        }

        const safeFileName = sanitizeFilename(matchingFile.originalname || `content-${index + 1}`);
        const absoluteFilePath = path.join(config.paths.content, contentFolder, safeFileName);
        saveUploadedFile(matchingFile.path, absoluteFilePath);
        resolvedStepBody = `${contentFolder}/${safeFileName}`;
      }

      if (!resolvedStepBody) {
        if (stepType !== "question") {
          return res.status(400).json({ message: `Step body is required at position ${index + 1}` });
        }
      }

      if (stepType === "question") {
        const normalizedQuestions = normalizeStepQuestions(stepBody, stepMetadata);
        if (!normalizedQuestions.length) {
          return res.status(400).json({
            message: `Question steps must include at least 1 question at position ${index + 1}`,
          });
        }

        for (const question of normalizedQuestions) {
          if (question.questionType === "multiple_choice" && question.options.length < 2) {
            return res.status(400).json({
              message: `Multiple choice questions must include at least 2 options at position ${index + 1}`,
            });
          }
        }

        stepMetadata.questions = normalizedQuestions;
      }

      insertStep.run(
        lessonId,
        index + 1,
        stepType,
        stepTitle,
        resolvedStepBody,
        JSON.stringify(stepMetadata)
      );
    }

    const lessonTargets = syncLessonTargetsAndProgress(
      lessonId,
      classId,
      targetType,
      resolvedTargetScholarEmails
    );

    const createdLesson = localDb
      .prepare("SELECT * FROM class_lessons WHERE id = ?")
      .get(lessonId);
    const createdSteps = localDb
      .prepare(`
        SELECT id, step_order, step_type, title, body, metadata
        FROM class_lesson_steps
        WHERE lesson_id = ?
        ORDER BY step_order ASC
      `)
      .all(lessonId)
      .map((step) => ({
        ...step,
        metadata: parseStepMetadata(step.metadata),
        fileUrl: step.step_type === "content" && String(step.body || "").startsWith("lessons/")
          ? `/${step.body}`
          : null,
      }));

    return res.status(201).json({
      ...createdLesson,
      dueAt: createdLesson?.due_at,
      isVisibleToStudents: Number(createdLesson?.is_visible_to_students || 0) === 1,
      targetType: createdLesson?.target_type || "class",
      targetScholarEmails: lessonTargets.targetScholarEmails,
      targetCount: lessonTargets.targetCount,
      steps: createdSteps,
      stepCount: createdSteps.length,
    });
  } catch (error) {
    console.error("Error creating class lesson:", error);
    return res.status(500).json({ message: error.message });
  } finally {
    cleanupTempFiles(req.files);
  }
});

router.get("/:id/lessons/:lessonId", (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const lessonId = Number(req.params.lessonId);
    const teacherEmail = normalizeEmail(req.query.teacherEmail);

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    if (!lessonId || Number.isNaN(lessonId)) {
      return res.status(400).json({ message: "Invalid lessonId" });
    }

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) {
      return res.status(403).json({ message: "Not allowed to view this lesson" });
    }

    const lesson = localDb
      .prepare(`
        SELECT id, class_id, title, description, due_at, content_folder, is_visible_to_students, target_type, created_by_teacher_email, created_at, updated_at
        FROM class_lessons
        WHERE id = ? AND class_id = ?
      `)
      .get(lessonId, classId);

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const steps = localDb
      .prepare(`
        SELECT id, step_order, step_type, title, body, metadata
        FROM class_lesson_steps
        WHERE lesson_id = ?
        ORDER BY step_order ASC
      `)
      .all(lessonId)
      .map((step) => ({
        ...step,
        metadata: parseStepMetadata(step.metadata),
        fileUrl: step.step_type === "content" && String(step.body || "").startsWith("lessons/")
          ? `/${step.body}`
          : null,
      }));

    const targetScholarEmails = localDb
      .prepare("SELECT scholar_email FROM class_lesson_targets WHERE lesson_id = ? ORDER BY scholar_email ASC")
      .all(lessonId)
      .map((row) => row.scholar_email);

    return res.json({
      ...lesson,
      dueAt: lesson.due_at,
      isVisibleToStudents: Number(lesson.is_visible_to_students || 0) === 1,
      targetType: lesson.target_type || "class",
      targetScholarEmails,
      steps,
      stepCount: steps.length,
    });
  } catch (error) {
    console.error("Error fetching lesson details for teacher:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/lessons/:lessonId/student-progress", (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const lessonId = Number(req.params.lessonId);
    const teacherEmail = normalizeEmail(req.query.teacherEmail);

    if (!teacherEmail) return res.status(400).json({ message: "teacherEmail is required" });
    if (!lessonId || Number.isNaN(lessonId)) return res.status(400).json({ message: "Invalid lessonId" });

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) return res.status(403).json({ message: "Not allowed" });

    const lesson = localDb
      .prepare("SELECT id, title, description, is_visible_to_students FROM class_lessons WHERE id = ? AND class_id = ?")
      .get(lessonId, classId);
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    const memberRows = localDb
      .prepare(`
        SELECT
          cm.scholar_email,
          COALESCE(clp.status, 'not_started') AS status,
          clp.current_step,
          clp.updated_at
        FROM class_memberships cm
        LEFT JOIN class_lesson_progress clp
          ON clp.lesson_id = ? AND clp.scholar_email = cm.scholar_email
        WHERE cm.class_id = ?
        ORDER BY cm.scholar_email ASC
      `)
      .all(lessonId, classId);

    const students = memberRows.map((row) => {
      const user = serverDb
        .prepare("SELECT full_name FROM users WHERE LOWER(email) = LOWER(?)")
        .get(row.scholar_email);
      return {
        scholar_email: row.scholar_email,
        full_name: user?.full_name || row.scholar_email,
        status: row.status,
        current_step: row.current_step,
        updated_at: row.updated_at,
      };
    });

    return res.json({
      lesson: { ...lesson, isVisibleToStudents: Number(lesson.is_visible_to_students || 0) === 1 },
      students,
    });
  } catch (error) {
    console.error("Error fetching lesson student progress:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/lessons/:lessonId", upload.any(), (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const lessonId = Number(req.params.lessonId);
    const teacherEmail = normalizeEmail(req.body.teacherEmail);
    const title = String(req.body.title || "").trim();
    const description = String(req.body.description || "").trim();
    const dueAt = normalizeDueAt(req.body.dueAt);
    const isVisibleToStudents = toVisibilityFlag(req.body.isVisibleToStudents);
    const targetType = String(req.body.targetType || "class").trim();
    const targetScholarEmails = parseScholarEmailInput(req.body.targetScholarEmails);
    const parsedSteps = typeof req.body.steps === "string"
      ? JSON.parse(req.body.steps || "[]")
      : req.body.steps;
    const steps = Array.isArray(parsedSteps) ? parsedSteps : [];
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    if (!lessonId || Number.isNaN(lessonId)) {
      return res.status(400).json({ message: "Invalid lessonId" });
    }

    if (!title) {
      return res.status(400).json({ message: "title is required" });
    }

    if (steps.length === 0) {
      return res.status(400).json({ message: "At least one lesson step is required" });
    }

    if (!["class", "scholars"].includes(targetType)) {
      return res.status(400).json({ message: "targetType must be 'class' or 'scholars'" });
    }

    const resolvedTargetScholarEmails = normalizeTargetScholarsForClass(classId, targetScholarEmails);
    if (targetType === "scholars" && resolvedTargetScholarEmails.length === 0) {
      return res.status(400).json({ message: "Select at least one student in this class" });
    }

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) {
      return res.status(403).json({ message: "Not allowed to edit lessons for this class" });
    }

    const lesson = localDb
      .prepare("SELECT id, class_id, content_folder FROM class_lessons WHERE id = ? AND class_id = ?")
      .get(lessonId, classId);

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const contentFolder = String(lesson.content_folder || "").trim() || `lessons/lesson-${lessonId}`;
    fs.mkdirSync(path.join(config.paths.content, contentFolder), { recursive: true });

    localDb
      .prepare(`
        UPDATE class_lessons
        SET title = ?, description = ?, due_at = ?, is_visible_to_students = ?, target_type = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND class_id = ?
      `)
      .run(title, description, dueAt, isVisibleToStudents, targetType, lessonId, classId);

    localDb.prepare("DELETE FROM class_lesson_steps WHERE lesson_id = ?").run(lessonId);

    const insertStep = localDb.prepare(`
      INSERT INTO class_lesson_steps (lesson_id, step_order, step_type, title, body, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (let index = 0; index < steps.length; index += 1) {
      const rawStep = steps[index] || {};
      const stepType = String(rawStep.stepType || rawStep.type || "").trim();
      const stepTitle = String(rawStep.title || "").trim();
      const stepBody = String(rawStep.body || rawStep.content || rawStep.question || "").trim();
      const contentMode = String(rawStep.contentMode || "type").trim();
      const fileField = String(rawStep.fileField || "").trim();
      const stepMetadata = parseStepMetadata(rawStep.metadata);

      if (!["question", "content"].includes(stepType)) {
        return res.status(400).json({ message: `Invalid step type at position ${index + 1}` });
      }

      let resolvedStepBody = stepBody;
      if (stepType === "content" && contentMode === "upload") {
        const matchingFile = uploadedFiles.find((file) => file.fieldname === fileField);
        if (matchingFile) {
          const safeFileName = sanitizeFilename(matchingFile.originalname || `content-${index + 1}`);
          const absoluteFilePath = path.join(config.paths.content, contentFolder, safeFileName);
          saveUploadedFile(matchingFile.path, absoluteFilePath);
          resolvedStepBody = `${contentFolder}/${safeFileName}`;
        }
      }

      if (!resolvedStepBody) {
        if (stepType !== "question") {
          return res.status(400).json({ message: `Step body is required at position ${index + 1}` });
        }
      }

      if (stepType === "question") {
        const normalizedQuestions = normalizeStepQuestions(stepBody, stepMetadata);
        if (!normalizedQuestions.length) {
          return res.status(400).json({
            message: `Question steps must include at least 1 question at position ${index + 1}`,
          });
        }

        for (const question of normalizedQuestions) {
          if (question.questionType === "multiple_choice" && question.options.length < 2) {
            return res.status(400).json({
              message: `Multiple choice questions must include at least 2 options at position ${index + 1}`,
            });
          }
        }

        stepMetadata.questions = normalizedQuestions;
      }

      insertStep.run(
        lessonId,
        index + 1,
        stepType,
        stepTitle,
        resolvedStepBody,
        JSON.stringify(stepMetadata)
      );
    }

    const lessonTargets = syncLessonTargetsAndProgress(
      lessonId,
      classId,
      targetType,
      resolvedTargetScholarEmails
    );

    const updatedLesson = localDb
      .prepare("SELECT * FROM class_lessons WHERE id = ?")
      .get(lessonId);
    const updatedSteps = localDb
      .prepare(`
        SELECT id, step_order, step_type, title, body, metadata
        FROM class_lesson_steps
        WHERE lesson_id = ?
        ORDER BY step_order ASC
      `)
      .all(lessonId)
      .map((step) => ({
        ...step,
        metadata: parseStepMetadata(step.metadata),
        fileUrl: step.step_type === "content" && String(step.body || "").startsWith("lessons/")
          ? `/${step.body}`
          : null,
      }));

    return res.json({
      ...updatedLesson,
      dueAt: updatedLesson?.due_at,
      isVisibleToStudents: Number(updatedLesson?.is_visible_to_students || 0) === 1,
      targetType: updatedLesson?.target_type || "class",
      targetScholarEmails: lessonTargets.targetScholarEmails,
      targetCount: lessonTargets.targetCount,
      steps: updatedSteps,
      stepCount: updatedSteps.length,
    });
  } catch (error) {
    console.error("Error updating class lesson:", error);
    return res.status(500).json({ message: error.message });
  } finally {
    cleanupTempFiles(req.files);
  }
});

router.delete("/:id/lessons/:lessonId", (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const lessonId = Number(req.params.lessonId);
    const teacherEmail = normalizeEmail(req.query.teacherEmail || req.body?.teacherEmail);

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    if (!lessonId || Number.isNaN(lessonId)) {
      return res.status(400).json({ message: "Invalid lessonId" });
    }

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) {
      return res.status(403).json({ message: "Not allowed to delete lessons for this class" });
    }

    const lesson = localDb
      .prepare("SELECT id, class_id, content_folder FROM class_lessons WHERE id = ? AND class_id = ?")
      .get(lessonId, classId);

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    localDb.prepare("DELETE FROM class_lessons WHERE id = ? AND class_id = ?").run(lessonId, classId);

    const contentFolder = String(lesson.content_folder || "").trim();
    if (contentFolder) {
      const absoluteFolderPath = path.join(config.paths.content, contentFolder);
      try {
        fs.rmSync(absoluteFolderPath, { recursive: true, force: true });
      } catch (cleanupError) {
        console.warn("Lesson deleted but content cleanup failed:", cleanupError);
      }
    }

    return res.json({ message: "Lesson deleted successfully", lessonId });
  } catch (error) {
    console.error("Error deleting class lesson:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/assignments", (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const teacherEmail = normalizeEmail(req.query.teacherEmail);

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) {
      return res.status(403).json({ message: "Not allowed to view assignments for this class" });
    }

    const assignmentRows = localDb
      .prepare(`
        SELECT id, class_id, content_path_key, assigned_by_teacher_email, target_type, due_at, assigned_at
        FROM lesson_assignments
        WHERE class_id = ?
        ORDER BY assigned_at DESC
      `)
      .all(classId);

    const result = assignmentRows.map((row) => {
      const contentMeta = resolveContentMeta(row.content_path_key);
      const targetCount = row.target_type === "class"
        ? localDb.prepare("SELECT COUNT(*) AS total FROM class_memberships WHERE class_id = ?").get(classId)?.total || 0
        : localDb.prepare("SELECT COUNT(*) AS total FROM lesson_assignment_targets WHERE assignment_id = ?").get(row.id)?.total || 0;

      const completionCount = localDb
        .prepare("SELECT COUNT(*) AS total FROM lesson_progress WHERE assignment_id = ? AND status = 'completed'")
        .get(row.id)?.total || 0;

      return {
        id: row.id,
        classId: row.class_id,
        contentPathKey: row.content_path_key,
        contentTitle: contentMeta?.title || row.content_path_key,
        contentType: contentMeta?.type || "lesson",
        contentUrl: contentMeta?.url || `/${row.content_path_key}`,
        assignedByTeacherEmail: row.assigned_by_teacher_email,
        targetType: row.target_type,
        dueAt: row.due_at,
        assignedAt: row.assigned_at,
        targetCount,
        completionCount,
      };
    });

    return res.json(result);
  } catch (error) {
    console.error("Error fetching class assignments:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/assignments", (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const teacherEmail = normalizeEmail(req.body.teacherEmail);
    const contentPathKey = String(req.body.contentPathKey || "").replace(/^\/+/, "").trim();
    const targetType = String(req.body.targetType || "class").trim();
    const targetScholarEmails = Array.isArray(req.body.targetScholarEmails)
      ? req.body.targetScholarEmails.map(normalizeEmail).filter(Boolean)
      : [];
    const dueAt = req.body.dueAt || null;

    if (!teacherEmail || !contentPathKey) {
      return res.status(400).json({ message: "teacherEmail and contentPathKey are required" });
    }

    if (!["class", "scholars"].includes(targetType)) {
      return res.status(400).json({ message: "targetType must be 'class' or 'scholars'" });
    }

    if (targetType === "scholars" && targetScholarEmails.length === 0) {
      return res.status(400).json({ message: "targetScholarEmails are required when targetType is 'scholars'" });
    }

    const classRow = classExists(classId);
    if (!classRow) {
      return res.status(404).json({ message: "Class not found" });
    }

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) {
      return res.status(403).json({ message: "Not allowed to assign lessons for this class" });
    }

    const contentMeta = resolveContentMeta(contentPathKey);
    if (!contentMeta) {
      return res.status(404).json({ message: "Lesson content not found" });
    }

    const insertInfo = localDb
      .prepare(`
        INSERT INTO lesson_assignments (
          class_id,
          content_path_key,
          assigned_by_teacher_email,
          target_type,
          due_at
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(classId, contentPathKey, teacherEmail, targetType, dueAt);

    const assignmentId = Number(insertInfo.lastInsertRowid);

    if (targetType === "scholars") {
      const targetInsert = localDb.prepare(`
        INSERT OR IGNORE INTO lesson_assignment_targets (assignment_id, scholar_email)
        VALUES (?, ?)
      `);

      for (const scholarEmail of targetScholarEmails) {
        const scholarMember = scholarInClass(classId, scholarEmail);
        if (!scholarMember) continue;
        targetInsert.run(assignmentId, scholarEmail);
      }
    }

    const assignment = localDb
      .prepare("SELECT * FROM lesson_assignments WHERE id = ?")
      .get(assignmentId);

    return res.status(201).json({
      ...assignment,
      contentTitle: contentMeta.title,
      contentType: contentMeta.type,
      contentUrl: contentMeta.url,
    });
  } catch (error) {
    console.error("Error creating lesson assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("", (req, res) => {
  try {
    const { name, grade, students, schedule, notes, teacherEmail } = req.body;

    if (!name || !grade || !teacherEmail) {
      return res.status(400).json({ message: "name, grade, and teacherEmail are required" });
    }

    const classCode = generateUniqueClassCode();

    const stmt = localDb.prepare(`
      INSERT INTO classes (id, name, grade, students, schedule, notes, teacher_email)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      classCode,
      name,
      grade,
      Number(students || 0),
      schedule || "",
      notes || "",
      teacherEmail
    );

    seedMockScholarsForClass(classCode, DEFAULT_MOCK_STUDENT_COUNT);

    const created = localDb
      .prepare("SELECT * FROM classes WHERE id = ?")
      .get(classCode);

    return res.status(201).json(created);
  } catch (error) {
    console.error("Error creating class:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id", (req, res) => {
  try {
    const { name, grade, students, schedule, notes } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push("name = ?");
      params.push(name);
    }
    if (grade !== undefined) {
      updates.push("grade = ?");
      params.push(grade);
    }
    if (students !== undefined) {
      updates.push("students = ?");
      params.push(Number(students));
    }
    if (schedule !== undefined) {
      updates.push("schedule = ?");
      params.push(schedule);
    }
    if (notes !== undefined) {
      updates.push("notes = ?");
      params.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: "At least one field is required for update" });
    }

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(req.params.id);

    const query = `UPDATE classes SET ${updates.join(", ")} WHERE id = ?`;
    const info = localDb.prepare(query).run(...params);

    if (info.changes === 0) return res.status(404).json({ message: "Class not found" });

    const updated = localDb
      .prepare("SELECT * FROM classes WHERE id = ?")
      .get(req.params.id);

    return res.json(updated);
  } catch (error) {
    console.error("Error updating class:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const info = localDb.prepare("DELETE FROM classes WHERE id = ?").run(req.params.id);
    if (info.changes === 0) return res.status(404).json({ message: "Class not found" });
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting class:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== GRADING ENDPOINTS =====

// Submit lesson (locks it for editing)
router.post("/lessons/:lessonId/submit", (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId);
    const scholarEmail = normalizeEmail(req.body.scholarEmail);

    if (!lessonId || Number.isNaN(lessonId)) {
      return res.status(400).json({ message: "Invalid lessonId" });
    }

    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }

    const lesson = localDb
      .prepare("SELECT id, class_id FROM class_lessons WHERE id = ?")
      .get(lessonId);

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const isMember = scholarInClass(lesson.class_id, scholarEmail);
    if (!isMember) {
      return res.status(403).json({ message: "Not allowed to submit this lesson" });
    }

    const missingRequired = getMissingRequiredQuestions(lessonId, scholarEmail);
    if (missingRequired.length > 0) {
      return res.status(400).json({
        message: "Please answer all required questions before submitting this lesson",
        missingRequired,
      });
    }

    // Check if already submitted
    const existing = localDb
      .prepare("SELECT id FROM lesson_submissions WHERE lesson_id = ? AND scholar_email = ?")
      .get(lessonId, scholarEmail);

    if (existing) {
      return res.json({ 
        message: "Lesson already submitted",
        submission: existing
      });
    }

    // Create submission (locks the lesson)
    const insertInfo = localDb
      .prepare(`
        INSERT INTO lesson_submissions (lesson_id, scholar_email, submitted_at, is_locked)
        VALUES (?, ?, CURRENT_TIMESTAMP, 1)
      `)
      .run(lessonId, scholarEmail);

    // Update progress to completed if not already
    localDb
      .prepare(`
        UPDATE class_lesson_progress
        SET status = 'completed', submitted_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE lesson_id = ? AND scholar_email = ? AND status != 'completed'
      `)
      .run(lessonId, scholarEmail);

    return res.status(201).json({
      message: "Lesson submitted successfully",
      submissionId: insertInfo.lastInsertRowid,
      lessonId,
      scholarEmail
    });
  } catch (error) {
    console.error("Error submitting lesson:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Get all completed submissions for a lesson (teacher view)
router.get("/lessons/:lessonId/submissions", (req, res) => {
  try {
    const lessonId = Number(req.params.lessonId);
    const teacherEmail = normalizeEmail(req.query.teacherEmail);
    const scholarEmailFilter = req.query.scholarEmail ? normalizeEmail(req.query.scholarEmail) : null;

    if (!lessonId || Number.isNaN(lessonId)) {
      return res.status(400).json({ message: "Invalid lessonId" });
    }

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    // Verify teacher owns this lesson
    const lesson = localDb
      .prepare("SELECT id, class_id, created_by_teacher_email FROM class_lessons WHERE id = ?")
      .get(lessonId);

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    if (lesson.created_by_teacher_email !== teacherEmail) {
      return res.status(403).json({ message: "Not authorized to view submissions for this lesson" });
    }

    // Get all submissions for this lesson
    const submissions = localDb
      .prepare(`
        SELECT 
          ls.id,
          ls.lesson_id,
          ls.scholar_email,
          ls.submitted_at,
          ls.is_locked,
          lg.grade,
          lg.total_points,
          lg.graded_at,
          clp.status as progress_status,
          clp.current_step
        FROM lesson_submissions ls
        LEFT JOIN lesson_grades lg ON lg.submission_id = ls.id
        LEFT JOIN class_lesson_progress clp ON clp.lesson_id = ls.lesson_id AND clp.scholar_email = ls.scholar_email
        WHERE ls.lesson_id = ?
        ORDER BY ls.submitted_at DESC
      `)
      .all(lessonId);

    const filtered = scholarEmailFilter
      ? submissions.filter((s) => s.scholar_email.toLowerCase() === scholarEmailFilter)
      : submissions;

    const submissionsWithNames = filtered.map((submission) => {
      const scholar = serverDb
        .prepare("SELECT full_name FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1")
        .get(submission.scholar_email);

      return {
        ...submission,
        scholar_name: String(scholar?.full_name || "").trim() || null,
      };
    });

    return res.json(submissionsWithNames);
  } catch (error) {
    console.error("Error fetching lesson submissions:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Get submission details with responses
router.get("/submissions/:submissionId/details", (req, res) => {
  try {
    const submissionId = Number(req.params.submissionId);
    const teacherEmail = normalizeEmail(req.query.teacherEmail);

    if (!submissionId || Number.isNaN(submissionId)) {
      return res.status(400).json({ message: "Invalid submissionId" });
    }

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    const submission = localDb
      .prepare(`
        SELECT ls.id, ls.lesson_id, ls.scholar_email, ls.submitted_at, ls.is_locked,
               cl.title as lesson_title, cl.description, cl.created_by_teacher_email
        FROM lesson_submissions ls
        JOIN class_lessons cl ON cl.id = ls.lesson_id
        WHERE ls.id = ?
      `)
      .get(submissionId);

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    // Verify teacher owns this lesson
    if (submission.created_by_teacher_email !== teacherEmail) {
      return res.status(403).json({ message: "Not authorized to view this submission" });
    }

    // Get steps and responses
    const steps = localDb
      .prepare(`
        SELECT id, step_order, step_type, title, body, metadata
        FROM class_lesson_steps
        WHERE lesson_id = ?
        ORDER BY step_order ASC
      `)
      .all(submission.lesson_id);

    const responses = localDb
      .prepare(`
        SELECT step_id, question_index, response_text, selected_option, updated_at
        FROM class_lesson_question_responses
        WHERE lesson_id = ? AND scholar_email = ?
        ORDER BY step_id ASC, question_index ASC
      `)
      .all(submission.lesson_id, submission.scholar_email);

    const grades = localDb
      .prepare(`
        SELECT grade, total_points, graded_by_teacher_email, graded_at, updated_at
        FROM lesson_grades
        WHERE submission_id = ?
      `)
      .get(submissionId);

    const feedback = localDb
      .prepare(`
        SELECT id, step_id, question_index, comment_text, awarded_points, possible_points, teacher_email, created_at, updated_at
        FROM lesson_feedback_comments
        WHERE submission_id = ?
        ORDER BY created_at DESC
      `)
      .all(submissionId);

    const scholar = serverDb
      .prepare("SELECT full_name FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1")
      .get(submission.scholar_email);

    return res.json({
      submission: {
        id: submission.id,
        lessonId: submission.lesson_id,
        scholarEmail: submission.scholar_email,
        scholarName: String(scholar?.full_name || "").trim() || null,
        submittedAt: submission.submitted_at,
        isLocked: submission.is_locked === 1,
        lessonTitle: submission.lesson_title,
        lessonDescription: submission.description
      },
      steps: steps.map(step => ({
        ...step,
        metadata: parseStepMetadata(step.metadata)
      })),
      responses: mapQuestionResponsesByStep(responses),
      checkpointResponses: mapCheckpointResponsesByStep(responses),
      grades: grades || null,
      feedback: feedback
    });
  } catch (error) {
    console.error("Error fetching submission details:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Save grades for a submission
router.post("/submissions/:submissionId/grade", (req, res) => {
  try {
    const submissionId = Number(req.params.submissionId);
    const teacherEmail = normalizeEmail(req.body.teacherEmail);
    const grade = req.body.grade !== undefined && req.body.grade !== null && String(req.body.grade).trim() !== "" ? Number(req.body.grade) : null;
    const totalPoints = req.body.totalPoints !== undefined && req.body.totalPoints !== null && String(req.body.totalPoints).trim() !== "" ? Number(req.body.totalPoints) : null;

    if (!submissionId || Number.isNaN(submissionId)) {
      return res.status(400).json({ message: "Invalid submissionId" });
    }

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    // Verify submission exists and teacher owns it
    const submission = localDb
      .prepare(`
        SELECT ls.id, ls.lesson_id, cl.created_by_teacher_email
        FROM lesson_submissions ls
        JOIN class_lessons cl ON cl.id = ls.lesson_id
        WHERE ls.id = ?
      `)
      .get(submissionId);

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (submission.created_by_teacher_email !== teacherEmail) {
      return res.status(403).json({ message: "Not authorized to grade this submission" });
    }

    if ((grade === null && totalPoints !== null) || (grade !== null && totalPoints === null)) {
      return res.status(400).json({ message: "Both grade and totalPoints are required to save a direct grade" });
    }

    if (grade !== null) {
      if (Number.isNaN(grade)) {
        return res.status(400).json({ message: "Invalid grade" });
      }
      if (Number.isNaN(totalPoints)) {
        return res.status(400).json({ message: "Invalid totalPoints" });
      }
      if (grade < 0) {
        return res.status(400).json({ message: "grade must be >= 0" });
      }
      if (totalPoints < 0) {
        return res.status(400).json({ message: "totalPoints must be >= 0" });
      }
      if (grade > totalPoints) {
        return res.status(400).json({ message: "grade cannot exceed totalPoints" });
      }

      localDb
        .prepare(`
          INSERT INTO lesson_grades (submission_id, grade, total_points, graded_by_teacher_email, graded_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(submission_id)
          DO UPDATE SET
            grade = excluded.grade,
            total_points = excluded.total_points,
            graded_by_teacher_email = excluded.graded_by_teacher_email,
            graded_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        `)
        .run(submissionId, grade, totalPoints, teacherEmail);

      const updated = localDb
        .prepare("SELECT grade, total_points, graded_by_teacher_email, graded_at, updated_at FROM lesson_grades WHERE submission_id = ?")
        .get(submissionId);

      return res.json({
        message: "Grade updated successfully",
        grades: updated
      });
    }

    const cumulative = recomputeSubmissionGradeFromFeedback(submissionId, teacherEmail);

    const updated = cumulative
      ? localDb
        .prepare("SELECT grade, total_points, graded_by_teacher_email, graded_at FROM lesson_grades WHERE submission_id = ?")
        .get(submissionId)
      : null;

    return res.json({
      message: cumulative ? "Cumulative grade updated successfully" : "No per-question grades found yet",
      grades: updated
    });
  } catch (error) {
    console.error("Error saving grade:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Add feedback comment
router.post("/submissions/:submissionId/feedback", (req, res) => {
  try {
    const submissionId = Number(req.params.submissionId);
    const teacherEmail = normalizeEmail(req.body.teacherEmail);
    const commentText = String(req.body.commentText || "").trim();
    const stepId = req.body.stepId ? Number(req.body.stepId) : null;
    const questionIndex = req.body.questionIndex !== undefined ? Number(req.body.questionIndex) : null;
    const awardedPoints = req.body.awardedPoints !== undefined && req.body.awardedPoints !== null && String(req.body.awardedPoints).trim() !== ""
      ? Number(req.body.awardedPoints)
      : null;
    const possiblePoints = req.body.totalPoints !== undefined && req.body.totalPoints !== null && String(req.body.totalPoints).trim() !== ""
      ? Number(req.body.totalPoints)
      : null;

    if (!submissionId || Number.isNaN(submissionId)) {
      return res.status(400).json({ message: "Invalid submissionId" });
    }

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    if (!commentText) {
      return res.status(400).json({ message: "Comment text is required" });
    }

    if (awardedPoints !== null && Number.isNaN(awardedPoints)) {
      return res.status(400).json({ message: "Invalid awardedPoints" });
    }

    if (possiblePoints !== null && Number.isNaN(possiblePoints)) {
      return res.status(400).json({ message: "Invalid totalPoints" });
    }

    if (possiblePoints !== null && possiblePoints < 0) {
      return res.status(400).json({ message: "totalPoints must be >= 0" });
    }

    if (awardedPoints !== null && awardedPoints < 0) {
      return res.status(400).json({ message: "awardedPoints must be >= 0" });
    }

    if (awardedPoints !== null && possiblePoints !== null && awardedPoints > possiblePoints) {
      return res.status(400).json({ message: "awardedPoints cannot exceed totalPoints" });
    }

    // Verify submission exists and teacher owns it
    const submission = localDb
      .prepare(`
        SELECT ls.id, ls.lesson_id, cl.created_by_teacher_email
        FROM lesson_submissions ls
        JOIN class_lessons cl ON cl.id = ls.lesson_id
        WHERE ls.id = ?
      `)
      .get(submissionId);

    if (!submission) {
      return res.status(404).json({ message: "Submission not found" });
    }

    if (submission.created_by_teacher_email !== teacherEmail) {
      return res.status(403).json({ message: "Not authorized to add feedback to this submission" });
    }

    const existingFeedback = localDb
      .prepare(`
        SELECT id
        FROM lesson_feedback_comments
        WHERE submission_id = ?
          AND teacher_email = ?
          AND ((step_id IS NULL AND ? IS NULL) OR step_id = ?)
          AND ((question_index IS NULL AND ? IS NULL) OR question_index = ?)
        ORDER BY id DESC
        LIMIT 1
      `)
      .get(submissionId, teacherEmail, stepId, stepId, questionIndex, questionIndex);

    let feedbackId;
    if (existingFeedback?.id) {
      localDb
        .prepare(`
          UPDATE lesson_feedback_comments
          SET comment_text = ?,
              awarded_points = ?,
              possible_points = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `)
        .run(commentText, awardedPoints, possiblePoints, existingFeedback.id);
      feedbackId = existingFeedback.id;
    } else {
      const insertInfo = localDb
        .prepare(`
          INSERT INTO lesson_feedback_comments (submission_id, teacher_email, comment_text, awarded_points, possible_points, step_id, question_index, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `)
        .run(submissionId, teacherEmail, commentText, awardedPoints, possiblePoints, stepId, questionIndex);
      feedbackId = insertInfo.lastInsertRowid;
    }

    const savedFeedback = localDb
      .prepare(`
        SELECT id, submission_id, teacher_email, comment_text, awarded_points, possible_points, step_id, question_index, created_at, updated_at
        FROM lesson_feedback_comments
        WHERE id = ?
      `)
      .get(feedbackId);

    const cumulativeGrades = recomputeSubmissionGradeFromFeedback(submissionId, teacherEmail);

    return res.status(existingFeedback?.id ? 200 : 201).json({
      message: existingFeedback?.id ? "Feedback updated successfully" : "Feedback added successfully",
      feedback: savedFeedback,
      grades: cumulativeGrades,
    });
  } catch (error) {
    console.error("Error adding feedback:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Delete feedback comment
router.delete("/feedback/:feedbackId", (req, res) => {
  try {
    const feedbackId = Number(req.params.feedbackId);
    const teacherEmail = normalizeEmail(req.query.teacherEmail);

    if (!feedbackId || Number.isNaN(feedbackId)) {
      return res.status(400).json({ message: "Invalid feedbackId" });
    }

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    // Verify teacher owns this feedback
    const feedback = localDb
      .prepare("SELECT submission_id, teacher_email FROM lesson_feedback_comments WHERE id = ?")
      .get(feedbackId);

    if (!feedback) {
      return res.status(404).json({ message: "Feedback not found" });
    }

    if (feedback.teacher_email !== teacherEmail) {
      return res.status(403).json({ message: "Not authorized to delete this feedback" });
    }

    localDb.prepare("DELETE FROM lesson_feedback_comments WHERE id = ?").run(feedbackId);
    recomputeSubmissionGradeFromFeedback(feedback.submission_id, teacherEmail);

    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting feedback:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/lessons/:lessonId/visibility", (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const lessonId = Number(req.params.lessonId);
    const teacherEmail = normalizeEmail(req.body.teacherEmail);
    const isVisible = req.body.isVisible === true || req.body.isVisible === "true" || req.body.isVisible === 1;

    if (!teacherEmail) return res.status(400).json({ message: "teacherEmail is required" });
    if (!lessonId || Number.isNaN(lessonId)) return res.status(400).json({ message: "Invalid lessonId" });

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) return res.status(403).json({ message: "Not allowed" });

    localDb
      .prepare("UPDATE class_lessons SET is_visible_to_students = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND class_id = ?")
      .run(isVisible ? 1 : 0, lessonId, classId);

    return res.json({ message: "Visibility updated" });
  } catch (error) {
    console.error("Error updating lesson visibility:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/lessons/:lessonId/targets/:scholarEmail", (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const lessonId = Number(req.params.lessonId);
    const scholarEmail = normalizeEmail(req.params.scholarEmail);
    const teacherEmail = normalizeEmail(req.query.teacherEmail || req.body?.teacherEmail);

    if (!teacherEmail) return res.status(400).json({ message: "teacherEmail is required" });
    if (!scholarEmail) return res.status(400).json({ message: "scholarEmail is required" });
    if (!lessonId || Number.isNaN(lessonId)) return res.status(400).json({ message: "Invalid lessonId" });

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) return res.status(403).json({ message: "Not allowed" });

    const lesson = localDb
      .prepare("SELECT id, target_type FROM class_lessons WHERE id = ? AND class_id = ?")
      .get(lessonId, classId);
    if (!lesson) return res.status(404).json({ message: "Lesson not found" });

    if (lesson.target_type === "class") {
      // Convert to scholars mode, targeting everyone except this student
      const allMembers = localDb
        .prepare("SELECT scholar_email FROM class_memberships WHERE class_id = ?")
        .all(classId)
        .map((r) => r.scholar_email)
        .filter((e) => e.toLowerCase() !== scholarEmail.toLowerCase());

      localDb.prepare("UPDATE class_lessons SET target_type = 'scholars', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(lessonId);
      localDb.prepare("DELETE FROM class_lesson_targets WHERE lesson_id = ?").run(lessonId);
      const insertTarget = localDb.prepare("INSERT OR IGNORE INTO class_lesson_targets (lesson_id, scholar_email) VALUES (?, ?)");
      for (const email of allMembers) insertTarget.run(lessonId, email);
    } else {
      localDb
        .prepare("DELETE FROM class_lesson_targets WHERE lesson_id = ? AND scholar_email = ?")
        .run(lessonId, scholarEmail);
    }

    return res.json({ message: "Student removed from lesson" });
  } catch (error) {
    console.error("Error removing student from lesson targets:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/image", upload.single("image"), async (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const teacherEmail = normalizeEmail(req.body.teacherEmail);

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) {
      return res.status(403).json({ message: "Not allowed to update this class" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const coversDir = path.join(config.paths.root, "local-content/class-covers");
    fs.mkdirSync(coversDir, { recursive: true });

    const filename = `${classId}.jpg`;
    const filepath = path.join(coversDir, filename);

    const sharp = (await import("sharp")).default;
    await sharp(req.file.path).resize(600, 400, { fit: "cover" }).jpeg({ quality: 85 }).toFile(filepath);

    localDb
      .prepare("UPDATE classes SET cover_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(filename, classId);

    return res.json({ message: "Class image updated", cover_image: filename });
  } catch (error) {
    console.error("Error uploading class image:", error);
    return res.status(500).json({ message: error.message });
  } finally {
    cleanupTempFiles(req.file);
  }
});

router.post("/:id/members", (req, res) => {
  try {
    const classId = String(req.params.id || "").trim();
    const teacherEmail = normalizeEmail(req.body.teacherEmail);
    const scholarEmail = normalizeEmail(req.body.scholarEmail);

    if (!teacherEmail) {
      return res.status(400).json({ message: "teacherEmail is required" });
    }

    if (!scholarEmail) {
      return res.status(400).json({ message: "scholarEmail is required" });
    }

    const ownsClass = teacherOwnsClass(classId, teacherEmail);
    if (!ownsClass) {
      return res.status(403).json({ message: "Not allowed to modify this class" });
    }

    const scholar = serverDb
      .prepare("SELECT id, email FROM users WHERE LOWER(email) = LOWER(?)")
      .get(scholarEmail);

    if (!scholar) {
      return res.status(404).json({ message: "Scholar account not found" });
    }

    const existing = localDb
      .prepare("SELECT 1 FROM class_memberships WHERE class_id = ? AND scholar_email = ?")
      .get(classId, scholarEmail);

    if (existing) {
      return res.status(409).json({ message: "Scholar is already in this class" });
    }

    localDb
      .prepare("INSERT INTO class_memberships (class_id, scholar_email, joined_via) VALUES (?, ?, 'teacher')")
      .run(classId, scholarEmail);

    ensureLessonProgressForScholarInClass(classId, scholarEmail);

    const memberCount = localDb
      .prepare("SELECT COUNT(*) as total FROM class_memberships WHERE class_id = ?")
      .get(classId)?.total || 0;

    localDb
      .prepare("UPDATE classes SET students = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .run(memberCount, classId);

    return res.status(201).json({ message: "Scholar added to class successfully" });
  } catch (error) {
    console.error("Error adding member to class:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;

