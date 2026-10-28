// Course CRUD, course lists, joining, and cover images.
import express from "express";
import { dateIn } from "@somabox/timeline";
import { SCHOOL_TIMEZONE, refreshDueDates } from "./schedule.js";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { localDb, seedDefaultNavItems } from "../../helpers/db-manager.js";
import { logAdminAuditAction } from "../users.service.js";
import { membershipChanged, publishCourse } from "../../helpers/live.js";
import { config } from "../../config/index.js";
import {
  normalizeEmail,
  generateUniqueCourseCode,
  getEnrollment,
  requireTeacher,
  requireEnrolled,
  courseExists,
  upload,
  requireCourseTeacher,
  userFullName,
  teachesLearnersClass,
} from "./shared.js";
import { notify, notifyAddedToCourse } from "./notify.js";
import { placeInClass } from "./classes.js";

const router = express.Router();

// ===== Course CRUD =====

router.post("", async (req, res) => {
  try {
    if (!["teacher", "admin"].includes(req.user?.role)) {
      return res.status(403).json({ message: "Only teachers can create subjects" });
    }
    const { title, description, grade, startDate, endDate } = req.body;
    const subject = String(req.body.subject || "").trim().slice(0, 60) || null;
    const email = req.user.email;

    if (!title) {
      return res.status(400).json({ message: "title is required" });
    }

    const courseId = await generateUniqueCourseCode();

    await localDb.prepare(`
      INSERT INTO courses (id, title, description, grade, subject, start_date, end_date, lifecycle, created_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(courseId, title, description || "", grade || "", subject, parseCourseDate(startDate), parseCourseDate(endDate), email);

    await seedDefaultNavItems(courseId);

    await localDb.prepare(`
      INSERT INTO enrollments (course_id, user_email, role, status)
      VALUES (?, ?, 'teacher', 'active')
    `).run(courseId, email);

    const created = await courseExists(courseId);
    return res.status(201).json(created);
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error("Error creating course:", error);
    return res.status(500).json({ message: error.message });
  }
});

// The learners in the courses this teacher teaches (the teacher's Learners page): one row per
// learner, with their courses and the course where the teacher may reset their password.
router.get("/mine/learners", async (req, res) => {
  try {
    if (!["teacher", "admin"].includes(req.user.role)) return res.status(403).json({ message: "Only teachers have learners" });
    const rows = await localDb.prepare(`
      SELECT c.id AS course_id, c.title, c.grade, e.id AS enrollment_id, e.status,
             u.id AS user_id, u.full_name, u.learner_code, u.role AS account_role, u.grade_level, u.annex_classes
      FROM enrollments t
      JOIN courses c ON c.id = t.course_id
      JOIN enrollments e ON e.course_id = c.id AND e.role = 'student' AND e.status IN ('active', 'invited')
      JOIN users u ON LOWER(u.email) = LOWER(e.user_email)
      WHERE LOWER(t.user_email) = LOWER(?) AND t.role = 'teacher' AND t.status = 'active'
      ORDER BY u.full_name ASC, c.title ASC
    `).all(req.user.email);
    const byUser = new Map();
    for (const row of rows) {
      const learner = byUser.get(row.user_id) || {
        id: row.user_id,
        fullName: row.full_name || "",
        learnerCode: row.learner_code || null,
        className: row.grade_level || null,
        courses: [],
        resetIn: null,
      };
      learner.courses.push({ id: row.course_id, title: row.title });
      // Same rule as the reset itself: a learner account, active in a course of their class.
      if (!learner.resetIn && row.account_role === "scholar" && row.status === "active" && teachesLearnersClass({ grade: row.grade }, row)) {
        learner.resetIn = { courseId: row.course_id, enrollmentId: row.enrollment_id };
      }
      byUser.set(row.user_id, learner);
    }
    return res.json([...byUser.values()]);
  } catch (error) {
    console.error("Error listing a teacher's learners:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/mine", async (req, res) => {
  try {
    // Admins may look up another user's courses (admin user detail page).
    const requested = normalizeEmail(req.query.userEmail);
    if (requested && requested !== req.user.email && req.user.role !== "admin") {
      return res.status(403).json({ message: "You can only view your own subjects" });
    }
    const email = requested || req.user.email;

    const rows = await localDb.prepare(`
      SELECT c.*, e.role AS my_role, e.status AS my_status
      FROM courses c
      JOIN enrollments e ON e.course_id = c.id
      -- 'pending': asked to join with the code, waiting for the teacher (shown as waiting).
      WHERE LOWER(e.user_email) = LOWER(?) AND e.status IN ('active', 'invited', 'pending')
        -- learners don't see courses that are still being set up, or archived ones
        AND (e.role IN ('teacher', 'ta') OR c.lifecycle NOT IN ('draft', 'archived'))
      ORDER BY c.created_at DESC
    `).all(email);

    const withCounts = await Promise.all(rows.map(async (course) => {
      const cnt = await localDb.prepare("SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ? AND role = 'student' AND status IN ('active', 'invited')").get(course.id);
      const studentCount = Number(cnt?.total || 0);
      return { ...course, studentCount, coverImageUrl: course.cover_image ? `/course-covers/${course.cover_image}` : null };
    }));

    return res.json(withCounts);
  } catch (error) {
    console.error("Error listing courses:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Admins: every course on the box (must be registered before "/:id").
router.get("/all", async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "You do not have permission to do this" });
    const rows = await localDb.prepare(`
      SELECT c.id, c.title, c.grade, c.lifecycle, c.visibility, c.start_date, c.end_date, c.created_at,
             c.created_by_teacher_email,
             (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id AND e.role = 'student' AND e.status = 'active') AS learners,
             (SELECT string_agg(e.user_email, ', ' ORDER BY e.user_email) FROM enrollments e
               JOIN users u ON LOWER(u.email) = LOWER(e.user_email) AND u.is_active = 1
               WHERE e.course_id = c.id AND e.role = 'teacher' AND e.status = 'active') AS teachers
      FROM courses c ORDER BY c.created_at DESC
    `).all();
    return res.json(rows.map((r) => ({ ...r, learners: Number(r.learners) || 0 })));
  } catch (error) {
    console.error("Error listing all courses:", error);
    return res.status(500).json({ message: error.message });
  }
});

/**
 * Admins: makes a teacher account a course's teacher, e.g. when its teacher left the school.
 * { email, removeOthers? } — removeOthers takes the course's other teachers off it (assistants,
 * learners and their work stay).
 */
router.put("/:id/teacher", async (req, res) => {
  try {
    if (req.user.role !== "admin") return res.status(403).json({ message: "You do not have permission to do this" });
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Subject not found" });
    const email = normalizeEmail(req.body.email);
    const account = email ? await localDb.prepare("SELECT role, is_active FROM users WHERE LOWER(email) = ?").get(email) : null;
    if (!account) return res.status(404).json({ message: "There's no account with this email", code: "NO_ACCOUNT" });
    if (!["teacher", "admin"].includes(account.role)) return res.status(400).json({ message: "Only teacher accounts can teach a subject" });
    if (Number(account.is_active) === 0) return res.status(400).json({ message: "This account is deactivated. Reactivate it first." });

    const removeOthers = req.body.removeOthers === true;
    const others = removeOthers
      ? (await localDb.prepare("SELECT user_email FROM enrollments WHERE course_id = ? AND role = 'teacher' AND LOWER(user_email) <> ?").all(courseId, email)).map((r) => r.user_email)
      : [];
    await localDb.transaction(async () => {
      await localDb.prepare(`
        INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'teacher', 'active')
        ON CONFLICT (course_id, user_email) DO UPDATE SET role = 'teacher', status = 'active'
      `).run(courseId, email);
      if (removeOthers) {
        await localDb.prepare("DELETE FROM enrollments WHERE course_id = ? AND role = 'teacher' AND LOWER(user_email) <> ?").run(courseId, email);
      }
    })();
    await notifyAddedToCourse(courseId, email, "teacher");
    await logAdminAuditAction({
      adminEmail: req.user.email,
      action: "ASSIGN_COURSE_TEACHER",
      targetUserEmail: email,
      details: `${removeOthers ? "Made" : "Added"} ${email} teacher of course ${courseId} (${course.title})`,
    });
    membershipChanged(courseId, [email, ...others]);
    publishCourse("course", courseId);
    const teachers = await localDb.prepare("SELECT user_email FROM enrollments WHERE course_id = ? AND role = 'teacher' AND status = 'active' ORDER BY user_email").all(courseId);
    return res.json({ courseId, teachers: teachers.map((t) => t.user_email) });
  } catch (error) {
    console.error("Error assigning a course teacher:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/public", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const total = Number((await localDb.prepare("SELECT COUNT(*) AS c FROM courses WHERE visibility = 'public' AND lifecycle = 'open'").get())?.c || 0);
    const rows = await localDb.prepare(`
      SELECT * FROM courses WHERE visibility = 'public' AND lifecycle = 'open' ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(pageSize, offset);

    const courses = await Promise.all(rows.map(async (course) => {
      const cnt = await localDb.prepare("SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").get(course.id);
      const studentCount = Number(cnt?.total || 0);
      return { ...course, studentCount, coverImageUrl: course.cover_image ? `/course-covers/${course.cover_image}` : null };
    }));

    return res.json({ courses, page, pageSize, total });
  } catch (error) {
    console.error("Error listing public courses:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Join codes =====
// A teacher turns on a short code; learners type it to join, even when the course is private.
// Codes live in course_join_codes (never in course rows, which learners and the cloud receive).

// No 0/O, 1/I/L: codes are read aloud and copied from a board.
const JOIN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const JOIN_CODE_LENGTH = 6;
const normalizeJoinCode = (raw) => String(raw || "").toUpperCase().replace(/[^0-9A-Z]/g, "");

async function newJoinCode() {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = "";
    for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += JOIN_ALPHABET[crypto.randomInt(JOIN_ALPHABET.length)];
    if (!await localDb.prepare("SELECT 1 FROM course_join_codes WHERE code = ?").get(code)) return code;
  }
  throw new Error("Failed to generate a join code");
}

// Wrong codes per user, to make guessing impractical: at most JOIN_MAX_MISSES per window.
const JOIN_WINDOW_MS = 10 * 60 * 1000;
const JOIN_MAX_MISSES = 10;
const joinMisses = new Map(); // email -> [timestamps]
const recentMisses = (email) => (joinMisses.get(email) || []).filter((t) => Date.now() - t < JOIN_WINDOW_MS);

router.post("/join-by-code", async (req, res) => {
  try {
    const email = req.user.email;
    if (recentMisses(email).length >= JOIN_MAX_MISSES) {
      return res.status(429).json({ message: "Too many wrong codes. Wait a few minutes and try again.", code: "TOO_MANY" });
    }
    const row = await localDb.prepare("SELECT course_id FROM course_join_codes WHERE code = ?").get(normalizeJoinCode(req.body?.code));
    const course = row ? await courseExists(row.course_id) : null;
    if (!course) {
      joinMisses.set(email, [...recentMisses(email), Date.now()]);
      return res.status(404).json({ message: "No subject has this code. Check it with your teacher.", code: "INVALID_CODE" });
    }
    if (course.lifecycle !== "open") {
      return res.status(400).json({ message: "This subject isn't open yet. Ask your teacher.", code: "NOT_OPEN" });
    }

    // Someone already in the course (a teacher included) keeps their place.
    const existing = await getEnrollment(course.id, email);
    if (existing?.status === "active") return res.json({ message: "Joined subject", status: "active", courseId: course.id, title: course.title });
    if (existing?.status === "pending") return res.json({ message: "Waiting for your teacher to approve", status: "pending", courseId: course.id, title: course.title });

    // A code can reach learners outside the class: joining with it asks the course's teachers.
    if (existing) {
      await localDb.prepare("UPDATE enrollments SET status = 'pending', role = 'student' WHERE course_id = ? AND LOWER(user_email) = LOWER(?)").run(course.id, email);
    } else {
      await localDb.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'student', 'pending')").run(course.id, email);
    }
    const teachers = await localDb.prepare("SELECT user_email FROM enrollments WHERE course_id = ? AND role = 'teacher' AND status = 'active'").all(course.id);
    await notify(teachers.map((t) => t.user_email), "joinRequest", { name: await userFullName(email) || email, course: course.title }, `/course/${course.id}/people`);
    membershipChanged(course.id, [email]);
    return res.json({ message: "Waiting for your teacher to approve", status: "pending", courseId: course.id, title: course.title });
  } catch (error) {
    console.error("Error joining by code:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/join-code", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const row = await localDb.prepare("SELECT code FROM course_join_codes WHERE course_id = ?").get(courseId);
    return res.json({ code: row?.code || null });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// body.action: "on" (keep the current code, or make one), "new" (replace it), "off" (remove it).
router.post("/:id/join-code", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    const auth = await requireCourseTeacher(req, res, courseId);
    if (!auth) return;
    const action = req.body?.action;
    if (!["on", "new", "off"].includes(action)) return res.status(400).json({ message: "action must be on, new or off" });

    if (action === "off") {
      await localDb.prepare("DELETE FROM course_join_codes WHERE course_id = ?").run(courseId);
      return res.json({ code: null });
    }
    const current = await localDb.prepare("SELECT code FROM course_join_codes WHERE course_id = ?").get(courseId);
    if (current && action === "on") return res.json({ code: current.code });
    const code = await newJoinCode();
    await localDb.prepare(`
      INSERT INTO course_join_codes (course_id, code, created_by) VALUES (?, ?, ?)
      ON CONFLICT (course_id) DO UPDATE SET code = EXCLUDED.code, created_by = EXCLUDED.created_by, created_at = CURRENT_TIMESTAMP
    `).run(courseId, code, auth.email);
    return res.json({ code });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/join", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Subject not found" });
    if (course.visibility !== "public") return res.status(403).json({ message: "This subject is private and requires an invite" });
    if (course.lifecycle !== "open") return res.status(400).json({ message: "This subject isn't open for joining" });

    const email = req.user.email;

    const existing = await getEnrollment(courseId, email);
    // Nobody switches back on a place a teacher switched off (as with a join code).
    if (existing && existing.status !== "active") {
      return res.status(403).json({ message: "Your place in this subject was removed. Ask your teacher to add you again.", code: "REMOVED" });
    }
    if (!existing) {
      await localDb.prepare(`
        INSERT INTO enrollments (course_id, user_email, role, status)
        VALUES (?, ?, 'student', 'active')
      `).run(courseId, email);
      await placeInClass(courseId, email);
    }

    membershipChanged(courseId, [email]);
    return res.status(200).json({ message: "Joined subject", course: await courseExists(courseId) });
  } catch (error) {
    console.error("Error joining course:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Subject not found" });

    // Someone signed in who isn't in the course: say so, and for a public, open course show what
    // it is so they can join it (POST /:id/join). A private course stays a name-less refusal.
    if (req.user && req.user.role !== "admin") {
      const mine = await getEnrollment(courseId, req.user.email);
      if (!mine || mine.status !== "active") {
        const joinable = !mine && course.visibility === "public" && course.lifecycle === "open";
        if (mine?.status === "pending") {
          return res.status(403).json({ message: "Waiting for your teacher to approve", code: "PENDING", course: { id: course.id, title: course.title, description: course.description, grade: course.grade } });
        }
        return res.status(403).json({
          message: "Not enrolled in this subject",
          code: mine ? "REMOVED" : "NOT_ENROLLED",
          course: joinable ? { id: course.id, title: course.title, description: course.description, grade: course.grade } : null,
        });
      }
    }

    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const studentCount = Number(
      (await localDb.prepare("SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").get(courseId))?.total || 0
    );

    return res.json({
      ...course,
      coverImageUrl: course.cover_image ? `/course-covers/${course.cover_image}` : null,
      studentCount,
      myRole: auth.enrollment.role,
      // An admin reading a course they aren't in (read-only).
      adminView: !!auth.enrollment.adminView,
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Allowed lifecycle moves through PATCH. Opening a draft goes through POST /:id/open-course
// so the setup checks can't be bypassed, and an opened course never returns to draft.
const LIFECYCLE_MOVES = {
  open: ["closed", "archived"],
  closed: ["open", "archived"],
  archived: ["closed"],
};

function lifecycleChangeProblem(from, to) {
  if (!["draft", "open", "closed", "archived"].includes(to)) return "lifecycle must be draft, open, closed, or archived";
  if (from === "draft") return to === "open"
    ? "Finish course setup and use Open Course to open this course"
    : "A draft course can only be opened";
  if (to === "draft") return "An opened course can't go back to draft";
  if (!(LIFECYCLE_MOVES[from] || []).includes(to)) return `A ${from} course can't be moved to ${to}`;
  return null;
}

// Course start/end are calendar dates ('YYYY-MM-DD'); timestamps are read in the school's time zone.
function parseCourseDate(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = dateIn(value, SCHOOL_TIMEZONE);
  if (!date) throw Object.assign(new Error("Dates must look like YYYY-MM-DD"), { status: 400 });
  return date;
}

router.patch("/:id", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const existingCourse = await courseExists(courseId);
    if (!existingCourse) return res.status(404).json({ message: "Subject not found" });
    if (!await requireCourseTeacher(req, res, courseId)) return;

    const { title, description, grade, lifecycle, homePageType, startDate, endDate, visibility, lengthWeeks } = req.body;
    if (lifecycle !== undefined && lifecycle !== existingCourse.lifecycle) {
      const problem = lifecycleChangeProblem(existingCourse.lifecycle, lifecycle);
      if (problem) return res.status(400).json({ message: problem });
    }
    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (grade !== undefined) { updates.push("grade = ?"); params.push(grade); }
    if (req.body.subject !== undefined) { updates.push("subject = ?"); params.push(String(req.body.subject || "").trim().slice(0, 60) || null); }
    if (lifecycle !== undefined && lifecycle !== existingCourse.lifecycle) { updates.push("lifecycle = ?"); params.push(lifecycle); }
    if (homePageType !== undefined && ["modules", "activity", "page"].includes(homePageType)) { updates.push("home_page_type = ?"); params.push(homePageType); }
    const newStart = startDate !== undefined ? parseCourseDate(startDate) : existingCourse.start_date;
    const newEnd = endDate !== undefined ? parseCourseDate(endDate) : existingCourse.end_date;
    if (newStart && newEnd && newEnd < newStart) return res.status(400).json({ message: "The end date can't be before the start date" });
    if (startDate !== undefined) { updates.push("start_date = ?"); params.push(newStart); }
    if (endDate !== undefined) { updates.push("end_date = ?"); params.push(newEnd); }
    if (visibility !== undefined && ["private", "public"].includes(visibility)) { updates.push("visibility = ?"); params.push(visibility); }
    if (lengthWeeks !== undefined) {
      const n = Number(lengthWeeks);
      if (!Number.isInteger(n) || n < 1 || n > 52) return res.status(400).json({ message: "lengthWeeks must be a whole number from 1 to 52" });
      updates.push("length_weeks = ?"); params.push(n);
    }

    if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(courseId);

    await localDb.prepare(`UPDATE courses SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    // Every module and item date follows the start date.
    if (startDate !== undefined) await refreshDueDates(courseId);
    return res.json(await courseExists(courseId));
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    console.error("Error updating course:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    const isAdmin = req.user?.role === "admin";
    if (!isAdmin && !await requireCourseTeacher(req, res, courseId)) return;

    // Deleting can't be undone. A course holding learners' work is archived instead, unless an
    // admin deliberately forces it.
    const learnerWork = await localDb.prepare(`
      SELECT (SELECT COUNT(*) FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.course_id = ?)
           + (SELECT COUNT(*) FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id WHERE q.course_id = ?)
           + (SELECT COUNT(*) FROM outcome_results WHERE course_id = ?) AS n
    `).get(courseId, courseId, courseId);
    if (Number(learnerWork.n) > 0 && !(isAdmin && req.query.force === "true")) {
      return res.status(409).json({
        message: "This subject has learners' work in it, so it can't be deleted. Archive it instead: learners no longer see it in their subject list, and grades and results are kept.",
        code: "HAS_LEARNER_WORK",
      });
    }

    const course = await localDb.prepare("SELECT cover_image FROM courses WHERE id = ?").get(courseId);
    await localDb.prepare("DELETE FROM courses WHERE id = ?").run(courseId);
    // Its uploaded files and cover go too.
    fs.rmSync(path.join(config.paths.courseFiles, courseId), { recursive: true, force: true });
    if (course?.cover_image && !course.cover_image.includes("/")) {
      fs.rmSync(path.join(config.paths.courseCovers, course.cover_image), { force: true });
    }
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting course:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/cover-image", upload.single("image"), async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    if (!await requireCourseTeacher(req, res, courseId)) return;
    if (!req.file) return res.status(400).json({ message: "No image file provided" });

    fs.mkdirSync(config.paths.courseCovers, { recursive: true });
    const filename = `${courseId}.jpg`;
    const sharp = (await import("sharp")).default;
    await sharp(req.file.buffer).resize(1200, 400, { fit: "cover" }).jpeg({ quality: 85 }).toFile(path.join(config.paths.courseCovers, filename));

    await localDb.prepare("UPDATE courses SET cover_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(filename, courseId);
    return res.json({ message: "Cover image updated", cover_image: filename });
  } catch (error) {
    console.error("Error uploading course cover image:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
