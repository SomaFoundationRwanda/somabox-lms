// Course CRUD, course lists, joining, and cover images.
import express from "express";
import { dateIn } from "@somabox/timeline";
import { SCHOOL_TIMEZONE, refreshDueDates } from "./schedule.js";
import fs from "fs";
import path from "path";
import { localDb, seedDefaultNavItems } from "../../helpers/db-manager.js";
import { config } from "../../config/index.js";
import {
  normalizeEmail,
  generateUniqueCourseCode,
  getEnrollment,
  requireTeacher,
  requireEnrolled,
  courseExists,
  upload,
} from "./shared.js";

const router = express.Router();

// ===== Course CRUD =====

router.post("", async (req, res) => {
  try {
    if (!["teacher", "admin"].includes(req.user?.role)) {
      return res.status(403).json({ message: "Only teachers can create courses" });
    }
    const { title, description, grade, startDate, endDate } = req.body;
    const email = req.user.email;

    if (!title) {
      return res.status(400).json({ message: "title is required" });
    }

    const courseId = await generateUniqueCourseCode();

    await localDb.prepare(`
      INSERT INTO courses (id, title, description, grade, start_date, end_date, lifecycle, created_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(courseId, title, description || "", grade || "", parseCourseDate(startDate), parseCourseDate(endDate), email);

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

router.get("/mine", async (req, res) => {
  try {
    // Admins may look up another user's courses (admin user detail page).
    const requested = normalizeEmail(req.query.userEmail);
    if (requested && requested !== req.user.email && req.user.role !== "admin") {
      return res.status(403).json({ message: "You can only view your own courses" });
    }
    const email = requested || req.user.email;

    const rows = await localDb.prepare(`
      SELECT c.*, e.role AS my_role, e.status AS my_status
      FROM courses c
      JOIN enrollments e ON e.course_id = c.id
      WHERE LOWER(e.user_email) = LOWER(?) AND e.status IN ('active', 'invited')
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
               WHERE e.course_id = c.id AND e.role = 'teacher' AND e.status = 'active') AS teachers
      FROM courses c ORDER BY c.created_at DESC
    `).all();
    return res.json(rows.map((r) => ({ ...r, learners: Number(r.learners) || 0 })));
  } catch (error) {
    console.error("Error listing all courses:", error);
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

router.post("/:id/join", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (course.visibility !== "public") return res.status(403).json({ message: "This course is private and requires an invite" });
    if (course.lifecycle !== "open") return res.status(400).json({ message: "This course isn't open for joining" });

    const email = req.user.email;

    const existing = await getEnrollment(courseId, email);
    if (existing) {
      if (existing.status !== "active") {
        await localDb.prepare("UPDATE enrollments SET status = 'active' WHERE course_id = ? AND LOWER(user_email) = LOWER(?)").run(courseId, email);
      }
    } else {
      await localDb.prepare(`
        INSERT INTO enrollments (course_id, user_email, role, status)
        VALUES (?, ?, 'student', 'active')
      `).run(courseId, email);
    }

    return res.status(200).json({ message: "Joined course", course: await courseExists(courseId) });
  } catch (error) {
    console.error("Error joining course:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

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
    if (!existingCourse) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { title, description, grade, lifecycle, homePageType, startDate, endDate, visibility } = req.body;
    if (lifecycle !== undefined && lifecycle !== existingCourse.lifecycle) {
      const problem = lifecycleChangeProblem(existingCourse.lifecycle, lifecycle);
      if (problem) return res.status(400).json({ message: problem });
    }
    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (grade !== undefined) { updates.push("grade = ?"); params.push(grade); }
    if (lifecycle !== undefined && lifecycle !== existingCourse.lifecycle) { updates.push("lifecycle = ?"); params.push(lifecycle); }
    if (homePageType !== undefined && ["modules", "activity", "page"].includes(homePageType)) { updates.push("home_page_type = ?"); params.push(homePageType); }
    const newStart = startDate !== undefined ? parseCourseDate(startDate) : existingCourse.start_date;
    const newEnd = endDate !== undefined ? parseCourseDate(endDate) : existingCourse.end_date;
    if (newStart && newEnd && newEnd < newStart) return res.status(400).json({ message: "The end date can't be before the start date" });
    if (startDate !== undefined) { updates.push("start_date = ?"); params.push(newStart); }
    if (endDate !== undefined) { updates.push("end_date = ?"); params.push(newEnd); }
    if (visibility !== undefined && ["private", "public"].includes(visibility)) { updates.push("visibility = ?"); params.push(visibility); }

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
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const isAdmin = req.user?.role === "admin";
    if (!isAdmin && !await requireTeacher(req, res, courseId)) return;

    // Deleting can't be undone. A course holding learners' work is archived instead, unless an
    // admin deliberately forces it.
    const learnerWork = await localDb.prepare(`
      SELECT (SELECT COUNT(*) FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.course_id = ?)
           + (SELECT COUNT(*) FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id WHERE q.course_id = ?)
           + (SELECT COUNT(*) FROM outcome_results WHERE course_id = ?) AS n
    `).get(courseId, courseId, courseId);
    if (Number(learnerWork.n) > 0 && !(isAdmin && req.query.force === "true")) {
      return res.status(409).json({
        message: "This course has learners' work in it, so it can't be deleted. Archive it instead: learners no longer see it in their course list, and grades and results are kept.",
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
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
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
