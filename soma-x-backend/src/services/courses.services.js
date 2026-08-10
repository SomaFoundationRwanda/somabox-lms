import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import { localDb, serverDb } from "../helpers/db-manager.js";
import { seedDefaultNavItems, DEFAULT_NAV_ITEMS } from "../helpers/db-manager.js";
import { config } from "../config/index.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const NAV_KEYS = DEFAULT_NAV_ITEMS.map((item) => item.nav_key);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function generateUniqueCourseCode() {
  let attempts = 0;
  while (attempts < 2000) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exists = localDb.prepare("SELECT 1 FROM courses WHERE id = ?").get(code);
    if (!exists) return code;
    attempts += 1;
  }
  throw new Error("Failed to generate a unique course code");
}

function getEnrollment(courseId, email) {
  return localDb
    .prepare("SELECT * FROM enrollments WHERE course_id = ? AND LOWER(user_email) = LOWER(?)")
    .get(courseId, email);
}

function isTeacherRole(role) {
  return role === "teacher" || role === "ta";
}

function requireTeacher(req, res, courseId) {
  const email = normalizeEmail(req.body?.teacherEmail || req.query?.teacherEmail || req.body?.userEmail || req.query?.userEmail);
  if (!email) {
    res.status(400).json({ message: "teacherEmail is required" });
    return null;
  }
  const enrollment = getEnrollment(courseId, email);
  if (!enrollment || !isTeacherRole(enrollment.role) || enrollment.status !== "active") {
    res.status(403).json({ message: "Not allowed — teacher/TA role required for this course" });
    return null;
  }
  return { email, enrollment };
}

function requireEnrolled(req, res, courseId) {
  const email = normalizeEmail(req.body?.userEmail || req.query?.userEmail || req.body?.teacherEmail || req.query?.teacherEmail);
  if (!email) {
    res.status(400).json({ message: "userEmail is required" });
    return null;
  }
  let enrollment = getEnrollment(courseId, email);
  if (!enrollment) {
    res.status(403).json({ message: "Not enrolled in this course" });
    return null;
  }
  if (enrollment.status === "invited") {
    localDb.prepare("UPDATE enrollments SET status = 'active', joined_at = CURRENT_TIMESTAMP WHERE id = ?").run(enrollment.id);
    enrollment.status = "active";
  }
  if (enrollment.status !== "active") {
    res.status(403).json({ message: "Not enrolled in this course" });
    return null;
  }
  return { email, enrollment };
}

// Returns { email, enrollment } or null (having already sent a 403) if a student tries to
// hit a nav section that's been hidden from students — enforced server-side, not just in the UI.
function requireNavVisible(req, res, courseId, navKey) {
  const auth = requireEnrolled(req, res, courseId);
  if (!auth) return null;
  if (isTeacherRole(auth.enrollment.role)) return auth;

  const navItem = localDb
    .prepare("SELECT visible_to_students FROM course_nav_items WHERE course_id = ? AND nav_key = ?")
    .get(courseId, navKey);
  if (navItem && Number(navItem.visible_to_students) !== 1) {
    res.status(403).json({ message: "This section is not available" });
    return null;
  }
  return auth;
}

function courseExists(courseId) {
  return localDb.prepare("SELECT * FROM courses WHERE id = ?").get(courseId);
}

function normalizeDueAt(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function calculateEstimatedReadMinutes(bodyJson, bodyHtml, bodyText) {
  let text = "";
  if (bodyJson) {
    try {
      const parsed = typeof bodyJson === 'string' ? JSON.parse(bodyJson) : bodyJson;
      const extractText = (node) => {
        if (!node) return "";
        if (node.text) return node.text + " ";
        if (Array.isArray(node.content)) {
          return node.content.map(extractText).join("");
        }
        return "";
      };
      text = extractText(parsed);
    } catch { /* fallback */ }
  }
  if (!text && bodyHtml) {
    text = bodyHtml.replace(/<[^>]+>/g, " ");
  }
  if (!text && bodyText) {
    text = bodyText;
  }
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

function syncPageFileReferences(pageId, bodyJson) {
  if (!pageId) return;
  const fileIds = new Set();
  if (bodyJson) {
    try {
      const parsed = typeof bodyJson === 'string' ? JSON.parse(bodyJson) : bodyJson;
      const findFileIds = (node) => {
        if (!node) return;
        if (node.attrs) {
          if (node.attrs.file_id != null) fileIds.add(Number(node.attrs.file_id));
          if (node.attrs.fileId != null) fileIds.add(Number(node.attrs.fileId));
        }
        if (Array.isArray(node.content)) {
          node.content.forEach(findFileIds);
        }
      };
      findFileIds(parsed);
    } catch { /* ignore parse error */ }
  }

  const tx = localDb.transaction((pId, ids) => {
    localDb.prepare("DELETE FROM page_file_references WHERE page_id = ?").run(pId);
    const ins = localDb.prepare("INSERT OR IGNORE INTO page_file_references (page_id, file_id) VALUES (?, ?)");
    ids.forEach((fId) => {
      if (fId && !isNaN(fId)) ins.run(pId, fId);
    });
  });
  tx(pageId, Array.from(fileIds));
}

function scheduleSpacedReview(scholarEmail, topicId, topicTitle) {
  const intervals = [3, 7, 30];
  const exists = localDb.prepare(`
    SELECT 1 FROM sol_spaced_reviews WHERE LOWER(scholar_email) = LOWER(?) AND topic_id = ? AND interval_days = ?
  `);
  const insert = localDb.prepare(`
    INSERT INTO sol_spaced_reviews (scholar_email, topic_id, topic_title, interval_days, due_at, status)
    VALUES (?, ?, ?, ?, DATETIME('now', ?), 'pending')
  `);
  for (const days of intervals) {
    if (!exists.get(scholarEmail, topicId, days)) {
      insert.run(scholarEmail, topicId, topicTitle, days, `+${days} days`);
    }
  }
}

function userFullName(email) {
  const user = serverDb.prepare("SELECT full_name FROM users WHERE LOWER(email) = LOWER(?)").get(email);
  return user?.full_name || email;
}

// ===== Course CRUD =====

router.post("", (req, res) => {
  try {
    const { title, description, grade, teacherEmail, startDate, endDate } = req.body;
    const email = normalizeEmail(teacherEmail);

    if (!title || !email) {
      return res.status(400).json({ message: "title and teacherEmail are required" });
    }

    const courseId = generateUniqueCourseCode();

    localDb.prepare(`
      INSERT INTO courses (id, title, description, grade, start_date, end_date, status, created_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(courseId, title, description || "", grade || "", normalizeDueAt(startDate), normalizeDueAt(endDate), email);

    seedDefaultNavItems(courseId);

    localDb.prepare(`
      INSERT INTO enrollments (course_id, user_email, role, status)
      VALUES (?, ?, 'teacher', 'active')
    `).run(courseId, email);

    const created = courseExists(courseId);
    return res.status(201).json(created);
  } catch (error) {
    console.error("Error creating course:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/mine", (req, res) => {
  try {
    const email = normalizeEmail(req.query.userEmail);
    if (!email) return res.status(400).json({ message: "userEmail is required" });

    const rows = localDb.prepare(`
      SELECT c.*, e.role AS my_role, e.status AS my_status
      FROM courses c
      JOIN enrollments e ON e.course_id = c.id
      WHERE LOWER(e.user_email) = LOWER(?) AND e.status IN ('active', 'invited')
      ORDER BY c.created_at DESC
    `).all(email);

    const withCounts = rows.map((course) => {
      const studentCount = Number(
        localDb.prepare("SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ? AND role = 'student' AND status IN ('active', 'invited')").get(course.id)?.total || 0
      );
      return { ...course, studentCount, coverImageUrl: course.cover_image ? `/course-covers/${course.cover_image}` : null };
    });

    return res.json(withCounts);
  } catch (error) {
    console.error("Error listing courses:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const studentCount = Number(
      localDb.prepare("SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").get(courseId)?.total || 0
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

router.patch("/:id", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const { title, description, grade, status, homePageType, startDate, endDate } = req.body;
    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (grade !== undefined) { updates.push("grade = ?"); params.push(grade); }
    if (status !== undefined && ["unpublished", "active", "completed"].includes(status)) { updates.push("status = ?"); params.push(status); }
    if (homePageType !== undefined && ["modules", "activity", "page"].includes(homePageType)) { updates.push("home_page_type = ?"); params.push(homePageType); }
    if (startDate !== undefined) { updates.push("start_date = ?"); params.push(normalizeDueAt(startDate)); }
    if (endDate !== undefined) { updates.push("end_date = ?"); params.push(normalizeDueAt(endDate)); }

    if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(courseId);

    localDb.prepare(`UPDATE courses SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    return res.json(courseExists(courseId));
  } catch (error) {
    console.error("Error updating course:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    localDb.prepare("DELETE FROM courses WHERE id = ?").run(courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting course:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/cover-image", upload.single("image"), async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;
    if (!req.file) return res.status(400).json({ message: "No image file provided" });

    fs.mkdirSync(config.paths.courseCovers, { recursive: true });
    const filename = `${courseId}.jpg`;
    const sharp = (await import("sharp")).default;
    await sharp(req.file.buffer).resize(1200, 400, { fit: "cover" }).jpeg({ quality: 85 }).toFile(path.join(config.paths.courseCovers, filename));

    localDb.prepare("UPDATE courses SET cover_image = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(filename, courseId);
    return res.json({ message: "Cover image updated", cover_image: filename });
  } catch (error) {
    console.error("Error uploading course cover image:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Navigation =====

router.get("/:id/nav", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const isTeacher = isTeacherRole(auth.enrollment.role);
    const rows = localDb
      .prepare("SELECT * FROM course_nav_items WHERE course_id = ? ORDER BY position ASC")
      .all(courseId)
      .filter((item) => isTeacher || Number(item.visible_to_students) === 1)
      .map((item) => ({
        navKey: item.nav_key,
        label: item.label,
        position: item.position,
        visibleToStudents: Number(item.visible_to_students) === 1,
        isDefault: Number(item.is_default) === 1,
      }));

    return res.json(rows);
  } catch (error) {
    console.error("Error fetching nav:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/nav", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const items = Array.isArray(req.body?.items) ? req.body.items : Array.isArray(req.body) ? req.body : [];
    if (!items.length) return res.status(400).json({ message: "items array is required" });

    const update = localDb.prepare(`
      UPDATE course_nav_items SET position = ?, visible_to_students = ? WHERE course_id = ? AND nav_key = ?
    `);

    const tx = localDb.transaction((navItems) => {
      navItems.forEach((item, index) => {
        if (!NAV_KEYS.includes(item.nav_key)) return;
        const position = Number.isFinite(item.position) ? item.position : index;
        const visible = item.visible_to_students === false ? 0 : 1;
        update.run(position, visible, courseId, item.nav_key);
      });
    });
    tx(items);

    const rows = localDb.prepare("SELECT * FROM course_nav_items WHERE course_id = ? ORDER BY position ASC").all(courseId);
    return res.json(rows.map((item) => ({
      navKey: item.nav_key,
      label: item.label,
      position: item.position,
      visibleToStudents: Number(item.visible_to_students) === 1,
      isDefault: Number(item.is_default) === 1,
    })));
  } catch (error) {
    console.error("Error updating nav:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== People / Enrollments =====

router.get("/:id/people", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireEnrolled(req, res, courseId)) return;

    const rows = localDb.prepare("SELECT * FROM enrollments WHERE course_id = ? ORDER BY role ASC, joined_at ASC").all(courseId);
    const people = rows.map((row) => ({
      id: row.id,
      email: row.user_email,
      fullName: userFullName(row.user_email),
      role: row.role,
      status: row.status,
      joinedAt: row.joined_at,
    }));
    return res.json(people);
  } catch (error) {
    console.error("Error fetching people:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/people", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const email = normalizeEmail(req.body.email);
    const role = ["teacher", "ta", "student", "observer"].includes(req.body.role) ? req.body.role : "student";
    if (!email) return res.status(400).json({ message: "email is required" });

    const existingUser = serverDb.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(email);
    const initialStatus = (role === "teacher" || role === "ta" || existingUser) ? "active" : "invited";

    localDb.prepare(`
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

router.post("/:id/accept-invite", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const email = normalizeEmail(req.body.userEmail || req.query.userEmail);
    if (!email) return res.status(400).json({ message: "userEmail is required" });

    localDb.prepare("UPDATE enrollments SET status = 'active', joined_at = CURRENT_TIMESTAMP WHERE course_id = ? AND LOWER(user_email) = LOWER(?)")
      .run(courseId, email);

    return res.json({ message: "Invitation accepted", status: "active" });
  } catch (error) {
    console.error("Error accepting invite:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/people/:enrollmentId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    localDb.prepare("DELETE FROM enrollments WHERE id = ? AND course_id = ?").run(req.params.enrollmentId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error removing enrollment:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Self-enrollment — a scholar joining with a course code, the registration-time flow.
router.post("/:id/enroll", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found. Check the course code." });

    const email = normalizeEmail(req.body.userEmail);
    if (!email) return res.status(400).json({ message: "userEmail is required" });

    const user = serverDb.prepare("SELECT role FROM users WHERE LOWER(email) = LOWER(?)").get(email);
    if (!user) return res.status(404).json({ message: "No account found for this email" });

    localDb.prepare(`
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

// ===== Modules =====

const CONTENT_TABLE_MAP = {
  page: 'course_pages',
  assignment: 'assignments',
  quiz: 'quizzes',
  file: 'course_files',
  discussion: 'discussions',
};

router.get("/:id/modules", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireNavVisible(req, res, courseId, "modules");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const modules = localDb.prepare("SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC").all(courseId);
    const result = modules
      .filter((m) => isTeacher || Number(m.published) === 1)
      .map((moduleRow) => {
        const items = localDb.prepare("SELECT * FROM module_items WHERE module_id = ? ORDER BY position ASC").all(moduleRow.id)
          .filter((item) => isTeacher || Number(item.published) === 1)
          .map((item) => {
            const enriched = {
              ...item,
              published: Number(item.published) === 1,
              indent_level: Number(item.indent_level) || 0,
            };
            // Enrich assignment items with due_at
            if (item.item_type === 'assignment' && item.content_ref_id) {
              const assignment = localDb.prepare("SELECT due_at, points_possible FROM assignments WHERE id = ?").get(item.content_ref_id);
              if (assignment) {
                enriched.due_at = assignment.due_at;
                enriched.points_possible = assignment.points_possible;
              }
            }
            // Enrich quiz items with due_at
            if (item.item_type === 'quiz' && item.content_ref_id) {
              const quiz = localDb.prepare("SELECT due_at FROM quizzes WHERE id = ?").get(item.content_ref_id);
              if (quiz) enriched.due_at = quiz.due_at;
            }
            // Enrich file items with download info
            if (item.item_type === 'file' && item.content_ref_id) {
              const file = localDb.prepare("SELECT original_name, filename, content_type FROM course_files WHERE id = ?").get(item.content_ref_id);
              if (file) {
                enriched.original_name = file.original_name;
                enriched.content_type = file.content_type;
                enriched.downloadUrl = file.filename.startsWith("lessons/") ? `/${file.filename}` : `/course-files/${courseId}/${file.filename}`;
              }
            }
            // Enrich page, assignment, quiz, discussion, file items with completion stats
            if (['page', 'assignment', 'quiz', 'discussion', 'file'].includes(item.item_type)) {
              const totalEnrolled = Number(localDb.prepare("SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ? AND role = 'student' AND status IN ('active', 'invited')").get(courseId)?.c || 0);

              let viewedCount = Number(localDb.prepare("SELECT COUNT(DISTINCT user_email) AS c FROM module_item_progress WHERE module_item_id = ?").get(item.id)?.c || 0);
              let completedCount = Number(localDb.prepare("SELECT COUNT(DISTINCT user_email) AS c FROM module_item_progress WHERE module_item_id = ? AND completed_at IS NOT NULL").get(item.id)?.c || 0);

              if (item.item_type === 'page' && item.content_ref_id) {
                const pvViewed = Number(localDb.prepare("SELECT COUNT(*) AS c FROM page_views WHERE page_id = ?").get(item.content_ref_id)?.c || 0);
                const pvCompleted = Number(localDb.prepare("SELECT COUNT(*) AS c FROM page_views WHERE page_id = ? AND completed_at IS NOT NULL").get(item.content_ref_id)?.c || 0);
                viewedCount = Math.max(viewedCount, pvViewed);
                completedCount = Math.max(completedCount, pvCompleted);
              }

              enriched.viewed_count = viewedCount;
              enriched.completed_count = completedCount;
              enriched.total_enrolled = totalEnrolled;
            }
            return enriched;
          });
        return { ...moduleRow, published: Number(moduleRow.published) === 1, items };
      });

    return res.json(result);
  } catch (error) {
    console.error("Error fetching modules:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/modules", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireTeacher(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const maxPosition = Number(localDb.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM modules WHERE course_id = ?").get(courseId)?.m ?? -1);

    const info = localDb.prepare(`
      INSERT INTO modules (course_id, title, description, position, published, due_at, created_by_teacher_email)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(courseId, title, req.body.description || "", maxPosition + 1, normalizeDueAt(req.body.dueAt), auth.email);

    return res.status(201).json({ id: Number(info.lastInsertRowid), title, position: maxPosition + 1 });
  } catch (error) {
    console.error("Error creating module:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/modules/:moduleId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const { title, description, published, position, dueAt } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (position !== undefined) { updates.push("position = ?"); params.push(Number(position)); }
    if (dueAt !== undefined) { updates.push("due_at = ?"); params.push(normalizeDueAt(dueAt)); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(req.params.moduleId, courseId);
    localDb.prepare(`UPDATE modules SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);

    return res.json(localDb.prepare("SELECT * FROM modules WHERE id = ?").get(req.params.moduleId));
  } catch (error) {
    console.error("Error updating module:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/modules/:moduleId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    localDb.prepare("DELETE FROM modules WHERE id = ? AND course_id = ?").run(req.params.moduleId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting module:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Batch reorder modules
router.patch("/:id/modules/reorder", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const moduleIds = Array.isArray(req.body.moduleIds) ? req.body.moduleIds : [];
    if (!moduleIds.length) return res.status(400).json({ message: "moduleIds array is required" });

    const updatePos = localDb.prepare("UPDATE modules SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND course_id = ?");
    const tx = localDb.transaction((ids) => {
      ids.forEach((id, index) => updatePos.run(index, id, courseId));
    });
    tx(moduleIds);

    return res.json({ message: "Modules reordered" });
  } catch (error) {
    console.error("Error reordering modules:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Module Items =====

// Create a new module item (+ underlying content record in one transaction)
router.post("/:id/modules/:moduleId/items", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireTeacher(req, res, courseId);
    if (!auth) return;

    const moduleRow = localDb.prepare("SELECT * FROM modules WHERE id = ? AND course_id = ?").get(req.params.moduleId, courseId);
    if (!moduleRow) return res.status(404).json({ message: "Module not found" });

    const itemType = String(req.body.itemType || "").trim();
    const title = String(req.body.title || "").trim() || "Untitled";
    const indentLevel = Math.min(3, Math.max(0, Number(req.body.indentLevel) || 0));

    if (!['page', 'assignment', 'quiz', 'file', 'discussion', 'sub_header'].includes(itemType)) {
      return res.status(400).json({ message: "Invalid itemType. Must be: page, assignment, quiz, file, discussion, or sub_header" });
    }

    const maxPosition = Number(localDb.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM module_items WHERE module_id = ?").get(moduleRow.id)?.m ?? -1);

    // Sub-header: no content record
    if (itemType === 'sub_header') {
      const info = localDb.prepare(`
        INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, indent_level, published, content_ref_table, content_ref_id)
        VALUES (?, 'sub_header', NULL, ?, ?, ?, 1, NULL, NULL)
      `).run(moduleRow.id, title, maxPosition + 1, indentLevel);

      return res.status(201).json({
        id: Number(info.lastInsertRowid), itemType: 'sub_header', title,
        position: maxPosition + 1, indent_level: indentLevel, content_ref_id: null
      });
    }

    // All other types: create content record + module item in a transaction
    const createItemTx = localDb.transaction(() => {
      let contentRefId;
      let contentRefTable = CONTENT_TABLE_MAP[itemType];

      if (itemType === 'page') {
        const bodyJsonStr = req.body.bodyJson ? (typeof req.body.bodyJson === 'string' ? req.body.bodyJson : JSON.stringify(req.body.bodyJson)) : null;
        const readMins = calculateEstimatedReadMinutes(bodyJsonStr, req.body.bodyHtml, req.body.body);
        const r = localDb.prepare(`
          INSERT INTO course_pages (course_id, title, body, body_json, body_html, estimated_read_minutes, published, created_by_teacher_email)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `).run(courseId, title, req.body.body || "", bodyJsonStr, req.body.bodyHtml || null, readMins, auth.email);
        contentRefId = Number(r.lastInsertRowid);
        syncPageFileReferences(contentRefId, bodyJsonStr);
      } else if (itemType === 'assignment') {
        const r = localDb.prepare(`
          INSERT INTO assignments (course_id, title, description, due_at, points_possible, published, created_by_teacher_email)
          VALUES (?, ?, ?, ?, ?, 1, ?)
        `).run(courseId, title, req.body.description || "", normalizeDueAt(req.body.dueAt), Number(req.body.pointsPossible) || 100, auth.email);
        contentRefId = Number(r.lastInsertRowid);
      } else if (itemType === 'quiz') {
        const r = localDb.prepare(`
          INSERT INTO quizzes (course_id, title, description, due_at, published, created_by_teacher_email)
          VALUES (?, ?, ?, ?, 1, ?)
        `).run(courseId, title, req.body.description || "", normalizeDueAt(req.body.dueAt), auth.email);
        contentRefId = Number(r.lastInsertRowid);

        // Insert quiz questions if provided
        const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
        const insertQuestion = localDb.prepare(`
          INSERT INTO quiz_questions (quiz_id, position, prompt, question_type, options, correct_option, points)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        questions.forEach((q, idx) => {
          const opts = Array.isArray(q.options) ? JSON.stringify(q.options) : JSON.stringify([]);
          insertQuestion.run(
            contentRefId, idx,
            String(q?.prompt || "").trim() || "Untitled question",
            q?.questionType === "open" ? "open" : "multiple_choice",
            opts,
            q?.correctOption || null,
            Number(q?.points) || 1
          );
        });
      } else if (itemType === 'discussion') {
        const r = localDb.prepare(`
          INSERT INTO discussions (course_id, title, body, published, created_by_teacher_email)
          VALUES (?, ?, ?, 1, ?)
        `).run(courseId, title, req.body.body || "", auth.email);
        contentRefId = Number(r.lastInsertRowid);
      } else {
        // file type handled by separate upload endpoint
        throw new Error("Use POST /:id/modules/:moduleId/items/file for file uploads");
      }

      const info = localDb.prepare(`
        INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, indent_level, published, content_ref_table, content_ref_id)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(moduleRow.id, itemType, contentRefId, title, maxPosition + 1, indentLevel, contentRefTable, contentRefId);

      return { moduleItemId: Number(info.lastInsertRowid), contentRefId, contentRefTable };
    });

    const result = createItemTx();
    return res.status(201).json({
      id: result.moduleItemId, itemType, title, position: maxPosition + 1,
      indent_level: indentLevel, content_ref_id: result.contentRefId, content_ref_table: result.contentRefTable
    });
  } catch (error) {
    console.error("Error adding module item:", error);
    return res.status(500).json({ message: error.message });
  }
});

// File upload to module — creates course_files row + module_items link
router.post("/:id/modules/:moduleId/items/file", upload.single("file"), (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireTeacher(req, res, courseId);
    if (!auth) return;

    const moduleRow = localDb.prepare("SELECT * FROM modules WHERE id = ? AND course_id = ?").get(req.params.moduleId, courseId);
    if (!moduleRow) return res.status(404).json({ message: "Module not found" });
    if (!req.file) return res.status(400).json({ message: "No file provided" });

    const title = String(req.body.title || req.file.originalname || "").trim() || "Untitled File";
    const indentLevel = Math.min(3, Math.max(0, Number(req.body.indentLevel) || 0));
    const folder = String(req.body.folder || "").trim();
    const dir = path.join(config.paths.root, "local-content/course-files", courseId, folder);
    fs.mkdirSync(dir, { recursive: true });

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    fs.writeFileSync(path.join(dir, storedName), req.file.buffer);

    const createFileTx = localDb.transaction(() => {
      const fileInfo = localDb.prepare(`
        INSERT INTO course_files (course_id, folder, filename, original_name, content_type, uploaded_by_teacher_email)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(courseId, folder, folder ? `${folder}/${storedName}` : storedName, req.file.originalname, req.file.mimetype || "", auth.email);
      const fileId = Number(fileInfo.lastInsertRowid);

      const maxPosition = Number(localDb.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM module_items WHERE module_id = ?").get(moduleRow.id)?.m ?? -1);
      const itemInfo = localDb.prepare(`
        INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, indent_level, published, content_ref_table, content_ref_id)
        VALUES (?, 'file', ?, ?, ?, ?, 0, 'course_files', ?)
      `).run(moduleRow.id, fileId, title, maxPosition + 1, indentLevel, fileId);

      return { moduleItemId: Number(itemInfo.lastInsertRowid), fileId, position: maxPosition + 1 };
    });

    const result = createFileTx();
    return res.status(201).json({
      id: result.moduleItemId, itemType: 'file', title, position: result.position,
      indent_level: indentLevel, content_ref_id: result.fileId, content_ref_table: 'course_files',
      original_name: req.file.originalname, downloadUrl: `/course-files/${courseId}/${folder ? `${folder}/` : ''}${storedName}`
    });
  } catch (error) {
    console.error("Error uploading file to module:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Edit module item metadata (position, indent, publish, title)
router.patch("/:id/modules/:moduleId/items/:itemId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const { published, position, title, indentLevel } = req.body;
    const updates = [];
    const params = [];
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (position !== undefined) { updates.push("position = ?"); params.push(Number(position)); }
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (indentLevel !== undefined) { updates.push("indent_level = ?"); params.push(Math.min(3, Math.max(0, Number(indentLevel)))); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.itemId);
    localDb.prepare(`UPDATE module_items SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    return res.json(localDb.prepare("SELECT * FROM module_items WHERE id = ?").get(req.params.itemId));
  } catch (error) {
    console.error("Error updating module item:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Edit the underlying content record of a module item
router.patch("/:id/modules/:moduleId/items/:itemId/content", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const item = localDb.prepare("SELECT * FROM module_items WHERE id = ?").get(req.params.itemId);
    if (!item) return res.status(404).json({ message: "Module item not found" });
    if (item.item_type === 'sub_header') return res.status(400).json({ message: "Sub-headers have no content to edit" });

    const contentId = item.content_ref_id || item.item_ref_id;
    if (!contentId) return res.status(400).json({ message: "No content record linked" });

    if (item.item_type === 'page') {
      const { title, body, bodyJson, bodyHtml, published } = req.body;
      const updates = [];
      const params = [];
      if (title !== undefined) { updates.push("title = ?"); params.push(title); }
      if (body !== undefined) { updates.push("body = ?"); params.push(body); }
      if (bodyJson !== undefined) { updates.push("body_json = ?"); params.push(typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson)); }
      if (bodyHtml !== undefined) { updates.push("body_html = ?"); params.push(bodyHtml); }
      if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
      
      const existingPage = localDb.prepare("SELECT * FROM course_pages WHERE id = ?").get(contentId);
      const newBodyJson = bodyJson !== undefined ? (typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson)) : existingPage?.body_json;
      const newBodyHtml = bodyHtml !== undefined ? bodyHtml : existingPage?.body_html;
      const newBodyText = body !== undefined ? body : existingPage?.body;
      const readMins = calculateEstimatedReadMinutes(newBodyJson, newBodyHtml, newBodyText);
      updates.push("estimated_read_minutes = ?");
      params.push(readMins);

      if (updates.length) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        params.push(contentId, courseId);
        localDb.prepare(`UPDATE course_pages SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      if (newBodyJson) {
        syncPageFileReferences(contentId, newBodyJson);
      }
      // Also update module item title if page title changed
      if (title !== undefined) {
        localDb.prepare("UPDATE module_items SET title = ? WHERE id = ?").run(title, item.id);
      }
      return res.json(localDb.prepare("SELECT * FROM course_pages WHERE id = ?").get(contentId));
    }

    if (item.item_type === 'assignment') {
      const { title, description, dueAt, pointsPossible, published } = req.body;
      const updates = [];
      const params = [];
      if (title !== undefined) { updates.push("title = ?"); params.push(title); }
      if (description !== undefined) { updates.push("description = ?"); params.push(description); }
      if (dueAt !== undefined) { updates.push("due_at = ?"); params.push(normalizeDueAt(dueAt)); }
      if (pointsPossible !== undefined) { updates.push("points_possible = ?"); params.push(Number(pointsPossible)); }
      if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
      if (updates.length) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        params.push(contentId, courseId);
        localDb.prepare(`UPDATE assignments SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      if (title !== undefined) {
        localDb.prepare("UPDATE module_items SET title = ? WHERE id = ?").run(title, item.id);
      }
      return res.json(localDb.prepare("SELECT * FROM assignments WHERE id = ?").get(contentId));
    }

    if (item.item_type === 'quiz') {
      const { title, description, dueAt, published, questions } = req.body;
      const updates = [];
      const params = [];
      if (title !== undefined) { updates.push("title = ?"); params.push(title); }
      if (description !== undefined) { updates.push("description = ?"); params.push(description); }
      if (dueAt !== undefined) { updates.push("due_at = ?"); params.push(normalizeDueAt(dueAt)); }
      if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
      if (updates.length) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        params.push(contentId, courseId);
        localDb.prepare(`UPDATE quizzes SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      // Replace quiz questions if provided
      if (Array.isArray(questions)) {
        localDb.prepare("DELETE FROM quiz_questions WHERE quiz_id = ?").run(contentId);
        const insertQ = localDb.prepare(`
          INSERT INTO quiz_questions (quiz_id, position, prompt, question_type, options, correct_option, points)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        questions.forEach((q, idx) => {
          insertQ.run(
            contentId, idx,
            String(q?.prompt || "").trim() || "Untitled question",
            q?.questionType === "open" ? "open" : "multiple_choice",
            JSON.stringify(Array.isArray(q?.options) ? q.options : []),
            q?.correctOption || null,
            Number(q?.points) || 1
          );
        });
      }
      if (title !== undefined) {
        localDb.prepare("UPDATE module_items SET title = ? WHERE id = ?").run(title, item.id);
      }
      const quiz = localDb.prepare("SELECT * FROM quizzes WHERE id = ?").get(contentId);
      const quizQuestions = localDb.prepare("SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position ASC").all(contentId);
      return res.json({ ...quiz, questions: quizQuestions });
    }

    if (item.item_type === 'discussion') {
      const { title, body, published } = req.body;
      const updates = [];
      const params = [];
      if (title !== undefined) { updates.push("title = ?"); params.push(title); }
      if (body !== undefined) { updates.push("body = ?"); params.push(body); }
      if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
      if (updates.length) {
        params.push(contentId, courseId);
        localDb.prepare(`UPDATE discussions SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      if (title !== undefined) {
        localDb.prepare("UPDATE module_items SET title = ? WHERE id = ?").run(title, item.id);
      }
      return res.json(localDb.prepare("SELECT * FROM discussions WHERE id = ?").get(contentId));
    }

    return res.status(400).json({ message: "Unsupported item type for content edit" });
  } catch (error) {
    console.error("Error editing module item content:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Delete module item — ?mode=remove_from_module (default) | delete_permanently
router.delete("/:id/modules/:moduleId/items/:itemId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const mode = String(req.query.mode || "remove_from_module").trim();
    const item = localDb.prepare("SELECT * FROM module_items WHERE id = ?").get(req.params.itemId);
    if (!item) return res.status(404).json({ message: "Module item not found" });

    if (mode === 'delete_permanently' && item.item_type !== 'sub_header') {
      const contentId = item.content_ref_id || item.item_ref_id;
      if (contentId) {
        const tableMap = {
          page: { table: 'course_pages', idCol: 'id', courseCol: 'course_id' },
          assignment: { table: 'assignments', idCol: 'id', courseCol: 'course_id' },
          quiz: { table: 'quizzes', idCol: 'id', courseCol: 'course_id' },
          file: { table: 'course_files', idCol: 'id', courseCol: 'course_id' },
          discussion: { table: 'discussions', idCol: 'id', courseCol: 'course_id' },
        };
        const mapping = tableMap[item.item_type];
        if (mapping) {
          localDb.prepare(`DELETE FROM ${mapping.table} WHERE ${mapping.idCol} = ? AND ${mapping.courseCol} = ?`).run(contentId, courseId);
        }
      }
    }

    localDb.prepare("DELETE FROM module_items WHERE id = ?").run(req.params.itemId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting module item:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Module Item Navigation Sequence & Progress =====

function getCourseSequence(courseId, isTeacher) {
  const modules = localDb.prepare("SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC").all(courseId);
  const sequence = [];

  for (const mod of modules) {
    if (!isTeacher && Number(mod.published) !== 1) continue;

    const items = localDb.prepare(
      "SELECT * FROM module_items WHERE module_id = ? AND item_type != 'sub_header' ORDER BY position ASC"
    ).all(mod.id);

    for (const item of items) {
      if (!isTeacher && Number(item.published) !== 1) continue;

      let targetUrl = "";
      if (item.item_type === "page" && item.content_ref_id) {
        targetUrl = `/course/${courseId}/pages/${item.content_ref_id}`;
      } else if (item.item_type === "assignment" && item.content_ref_id) {
        targetUrl = `/course/${courseId}/assignments/${item.content_ref_id}`;
      } else if (item.item_type === "quiz" && item.content_ref_id) {
        targetUrl = `/course/${courseId}/quizzes/${item.content_ref_id}`;
      } else if (item.item_type === "discussion" && item.content_ref_id) {
        targetUrl = `/course/${courseId}/discussions/${item.content_ref_id}`;
      } else if (item.item_type === "file") {
        targetUrl = `/course/${courseId}/files`;
      }

      sequence.push({
        module_item_id: item.id,
        module_id: mod.id,
        item_type: item.item_type,
        content_ref_id: item.content_ref_id,
        title: item.title,
        module_title: mod.title,
        url: targetUrl,
        published: Number(item.published) === 1,
      });
    }
  }

  return sequence;
}

router.get("/:id/module-items/sequence", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const isTeacher = isTeacherRole(auth.enrollment.role);
    const sequence = getCourseSequence(courseId, isTeacher);
    return res.json(sequence);
  } catch (error) {
    console.error("Error fetching sequence:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/module-items/sequence-position", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const isTeacher = isTeacherRole(auth.enrollment.role);
    const sequence = getCourseSequence(courseId, isTeacher);

    const { moduleItemId, itemType, contentRefId } = req.query;
    let idx = -1;

    if (moduleItemId) {
      idx = sequence.findIndex((s) => String(s.module_item_id) === String(moduleItemId));
    } else if (itemType && contentRefId) {
      idx = sequence.findIndex(
        (s) => s.item_type === itemType && String(s.content_ref_id) === String(contentRefId)
      );
    }

    if (idx === -1) {
      return res.json({ index: 0, total: sequence.length, current: null, prev: null, next: null });
    }

    return res.json({
      index: idx + 1,
      total: sequence.length,
      current: sequence[idx],
      prev: idx > 0 ? sequence[idx - 1] : null,
      next: idx < sequence.length - 1 ? sequence[idx + 1] : null,
    });
  } catch (error) {
    console.error("Error fetching sequence position:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/module-items/:moduleItemId/progress", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const item = localDb.prepare("SELECT * FROM module_items WHERE id = ?").get(req.params.moduleItemId);
    if (!item) return res.status(404).json({ message: "Module item not found" });

    localDb.prepare(`
      INSERT INTO module_item_progress (module_item_id, user_email, first_viewed_at, last_viewed_at, completed_at)
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(module_item_id, user_email) DO UPDATE SET last_viewed_at = CURRENT_TIMESTAMP, completed_at = CURRENT_TIMESTAMP
    `).run(item.id, auth.email);

    return res.json({ message: "Progress recorded", module_item_id: item.id });
  } catch (error) {
    console.error("Error recording progress:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Batch reorder items within a module
router.patch("/:id/modules/:moduleId/items/reorder", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const itemIds = Array.isArray(req.body.itemIds) ? req.body.itemIds : [];
    if (!itemIds.length) return res.status(400).json({ message: "itemIds array is required" });

    const updatePos = localDb.prepare("UPDATE module_items SET position = ? WHERE id = ? AND module_id = ?");
    const tx = localDb.transaction((ids) => {
      ids.forEach((id, index) => updatePos.run(index, id, req.params.moduleId));
    });
    tx(itemIds);

    return res.json({ message: "Items reordered" });
  } catch (error) {
    console.error("Error reordering items:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Assignments (birds-eye: assignments + quizzes + graded discussions) =====

router.get("/:id/assignments", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireNavVisible(req, res, courseId, "assignments");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const assignments = localDb.prepare("SELECT * FROM assignments WHERE course_id = ?").all(courseId)
      .filter((a) => isTeacher || Number(a.published) === 1)
      .map((a) => ({ id: a.id, kind: "assignment", title: a.title, dueAt: a.due_at, pointsPossible: a.points_possible, published: Number(a.published) === 1 }));

    const quizzes = localDb.prepare("SELECT * FROM quizzes WHERE course_id = ?").all(courseId)
      .filter((q) => isTeacher || Number(q.published) === 1)
      .map((q) => {
        const points = Number(localDb.prepare("SELECT COALESCE(SUM(points),0) AS total FROM quiz_questions WHERE quiz_id = ?").get(q.id)?.total || 0);
        return { id: q.id, kind: "quiz", title: q.title, dueAt: q.due_at, pointsPossible: points, published: Number(q.published) === 1 };
      });

    const discussions = localDb.prepare("SELECT * FROM discussions WHERE course_id = ? AND graded = 1").all(courseId)
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

router.post("/:id/assignments", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireTeacher(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const info = localDb.prepare(`
      INSERT INTO assignments (course_id, title, description, due_at, points_possible, published, created_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(courseId, title, req.body.description || "", normalizeDueAt(req.body.dueAt), Number(req.body.pointsPossible) || 100, req.body.published ? 1 : 0, auth.email);

    return res.status(201).json(localDb.prepare("SELECT * FROM assignments WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error creating assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/assignments/:assignmentId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const assignment = localDb.prepare("SELECT * FROM assignments WHERE id = ? AND course_id = ?").get(req.params.assignmentId, courseId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    if (isTeacherRole(auth.enrollment.role)) {
      const submissions = localDb.prepare("SELECT * FROM assignment_submissions WHERE assignment_id = ?").all(assignment.id)
        .map((s) => ({ ...s, fullName: userFullName(s.scholar_email) }));
      return res.json({ ...assignment, submissions });
    }

    const mySubmission = localDb.prepare("SELECT * FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(assignment.id, auth.email);
    return res.json({ ...assignment, mySubmission: mySubmission || null });
  } catch (error) {
    console.error("Error fetching assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/assignments/:assignmentId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

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
    localDb.prepare(`UPDATE assignments SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    return res.json(localDb.prepare("SELECT * FROM assignments WHERE id = ?").get(req.params.assignmentId));
  } catch (error) {
    console.error("Error updating assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/assignments/:assignmentId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;
    localDb.prepare("DELETE FROM assignments WHERE id = ? AND course_id = ?").run(req.params.assignmentId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/assignments/:assignmentId/submit", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const assignment = localDb.prepare("SELECT * FROM assignments WHERE id = ? AND course_id = ?").get(req.params.assignmentId, courseId);
    if (!assignment) return res.status(404).json({ message: "Assignment not found" });

    const alreadySubmitted = localDb.prepare("SELECT 1 FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(assignment.id, auth.email);

    localDb.prepare(`
      INSERT INTO assignment_submissions (assignment_id, scholar_email, body, submitted_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(assignment_id, scholar_email) DO UPDATE SET body = excluded.body, submitted_at = CURRENT_TIMESTAMP
    `).run(assignment.id, auth.email, req.body.body || "");

    if (!alreadySubmitted) {
      scheduleSpacedReview(auth.email, `assignment_${assignment.id}`, assignment.title);
    }

    return res.status(201).json({ message: "Submitted" });
  } catch (error) {
    console.error("Error submitting assignment:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/assignments/:assignmentId/grade/:scholarEmail", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireTeacher(req, res, courseId);
    if (!auth) return;

    const scholarEmail = normalizeEmail(req.params.scholarEmail);
    const grade = Number(req.body.grade);
    if (Number.isNaN(grade)) return res.status(400).json({ message: "grade must be a number" });

    localDb.prepare(`
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

// ===== Grades =====

router.get("/:id/grades", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireNavVisible(req, res, courseId, "grades");
    if (!auth) return;

    const assignments = localDb.prepare("SELECT id, title, points_possible FROM assignments WHERE course_id = ? AND published = 1").all(courseId);
    const quizzes = localDb.prepare("SELECT id, title FROM quizzes WHERE course_id = ? AND published = 1").all(courseId);

    if (!isTeacherRole(auth.enrollment.role)) {
      const myAssignmentGrades = assignments.map((a) => {
        const submission = localDb.prepare("SELECT grade, feedback FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(a.id, auth.email);
        return { id: a.id, kind: "assignment", title: a.title, pointsPossible: a.points_possible, grade: submission?.grade ?? null, feedback: submission?.feedback || "" };
      });
      const myQuizGrades = quizzes.map((q) => {
        const submission = localDb.prepare("SELECT score FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?)").get(q.id, auth.email);
        return { id: q.id, kind: "quiz", title: q.title, pointsPossible: null, grade: submission?.score ?? null, feedback: "" };
      });
      return res.json({ role: "student", grades: [...myAssignmentGrades, ...myQuizGrades] });
    }

    const students = localDb.prepare("SELECT user_email FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").all(courseId);
    const grid = students.map((student) => {
      const assignmentGrades = assignments.map((a) => {
        const submission = localDb.prepare("SELECT grade FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)").get(a.id, student.user_email);
        return { assignmentId: a.id, title: a.title, grade: submission?.grade ?? null };
      });
      return { email: student.user_email, fullName: userFullName(student.user_email), assignmentGrades };
    });

    return res.json({ role: "teacher", assignments, grid });
  } catch (error) {
    console.error("Error fetching grades:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Announcements =====

router.get("/:id/announcements", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireNavVisible(req, res, courseId, "announcements");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rows = localDb.prepare("SELECT * FROM announcements WHERE course_id = ? ORDER BY created_at DESC").all(courseId)
      .filter((a) => isTeacher || Number(a.published) === 1);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching announcements:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/announcements", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireTeacher(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const info = localDb.prepare(`INSERT INTO announcements (course_id, title, body, published, created_by_teacher_email) VALUES (?, ?, ?, 1, ?)`)
      .run(courseId, title, req.body.body || "", auth.email);
    return res.status(201).json(localDb.prepare("SELECT * FROM announcements WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error creating announcement:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/announcements/:announcementId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const { title, body, published } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (body !== undefined) { updates.push("body = ?"); params.push(body); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.announcementId, courseId);
    localDb.prepare(`UPDATE announcements SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    return res.json(localDb.prepare("SELECT * FROM announcements WHERE id = ?").get(req.params.announcementId));
  } catch (error) {
    console.error("Error updating announcement:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/announcements/:announcementId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;
    localDb.prepare("DELETE FROM announcements WHERE id = ? AND course_id = ?").run(req.params.announcementId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting announcement:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Syllabus =====

router.get("/:id/syllabus", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    const auth = requireNavVisible(req, res, courseId, "syllabus");
    if (!auth) return;

    const dueDates = localDb.prepare("SELECT id, title, due_at, points_possible FROM assignments WHERE course_id = ? AND due_at IS NOT NULL AND published = 1 ORDER BY due_at ASC").all(courseId);
    const quizDueDates = localDb.prepare("SELECT id, title, due_at FROM quizzes WHERE course_id = ? AND due_at IS NOT NULL AND published = 1 ORDER BY due_at ASC").all(courseId);

    return res.json({
      body: course.syllabus_body || "",
      schedule: [
        ...dueDates.map((d) => ({ kind: "assignment", ...d })),
        ...quizDueDates.map((d) => ({ kind: "quiz", ...d, points_possible: null })),
      ].sort((a, b) => new Date(a.due_at) - new Date(b.due_at)),
    });
  } catch (error) {
    console.error("Error fetching syllabus:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/syllabus", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    localDb.prepare("UPDATE courses SET syllabus_body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.body.body || "", courseId);
    return res.json({ message: "Syllabus updated" });
  } catch (error) {
    console.error("Error updating syllabus:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Rubrics =====

router.get("/:id/rubrics", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireNavVisible(req, res, courseId, "rubrics");
    if (!auth) return;

    const rows = localDb.prepare("SELECT * FROM rubrics WHERE course_id = ? ORDER BY created_at DESC").all(courseId)
      .map((r) => ({ ...r, criteria: JSON.parse(r.criteria || "[]") }));
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching rubrics:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/rubrics", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });
    const criteria = Array.isArray(req.body.criteria) ? req.body.criteria : [];

    const info = localDb.prepare("INSERT INTO rubrics (course_id, title, criteria) VALUES (?, ?, ?)")
      .run(courseId, title, JSON.stringify(criteria));
    return res.status(201).json({ id: Number(info.lastInsertRowid), title, criteria });
  } catch (error) {
    console.error("Error creating rubric:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/rubrics/:rubricId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const { title, criteria } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (criteria !== undefined) { updates.push("criteria = ?"); params.push(JSON.stringify(criteria)); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.rubricId, courseId);
    localDb.prepare(`UPDATE rubrics SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    return res.json({ message: "Rubric updated" });
  } catch (error) {
    console.error("Error updating rubric:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/rubrics/:rubricId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;
    localDb.prepare("DELETE FROM rubrics WHERE id = ? AND course_id = ?").run(req.params.rubricId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting rubric:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/rubrics/:rubricId/link", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const assignmentId = Number(req.body.assignmentId);
    if (!assignmentId) return res.status(400).json({ message: "assignmentId is required" });

    localDb.prepare("INSERT OR IGNORE INTO rubric_assignment_links (rubric_id, assignment_id) VALUES (?, ?)")
      .run(req.params.rubricId, assignmentId);
    return res.status(201).json({ message: "Linked" });
  } catch (error) {
    console.error("Error linking rubric:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Files =====

router.get("/:id/files", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireNavVisible(req, res, courseId, "files")) return;

    const rows = localDb.prepare("SELECT * FROM course_files WHERE course_id = ? ORDER BY uploaded_at DESC").all(courseId)
      .map((f) => ({
        ...f,
        downloadUrl: f.filename.startsWith("lessons/") ? `/${f.filename}` : `/course-files/${courseId}/${f.filename}`,
      }));
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching files:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/files/upload", upload.single("file"), (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireTeacher(req, res, courseId);
    if (!auth) return;
    if (!req.file) return res.status(400).json({ message: "No file provided" });

    const folder = String(req.body.folder || "").trim();
    const dir = path.join(config.paths.root, "local-content/course-files", courseId, folder);
    fs.mkdirSync(dir, { recursive: true });

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    fs.writeFileSync(path.join(dir, storedName), req.file.buffer);

    const info = localDb.prepare(`
      INSERT INTO course_files (course_id, folder, filename, original_name, content_type, uploaded_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(courseId, folder, folder ? `${folder}/${storedName}` : storedName, req.file.originalname, req.file.mimetype || "", auth.email);

    const fileRecord = localDb.prepare("SELECT * FROM course_files WHERE id = ?").get(info.lastInsertRowid);
    const downloadUrl = `/course-files/${courseId}/${fileRecord.filename}`;

    return res.status(201).json({
      file_id: fileRecord.id,
      fileId: fileRecord.id,
      url: downloadUrl,
      downloadUrl,
      mime_type: fileRecord.content_type,
      original_name: fileRecord.original_name,
      size: req.file.size || 0,
    });
  } catch (error) {
    console.error("Error uploading file to editor:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/files", upload.single("file"), (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireTeacher(req, res, courseId);
    if (!auth) return;
    if (!req.file) return res.status(400).json({ message: "No file provided" });

    const folder = String(req.body.folder || "").trim();
    const dir = path.join(config.paths.root, "local-content/course-files", courseId, folder);
    fs.mkdirSync(dir, { recursive: true });

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    fs.writeFileSync(path.join(dir, storedName), req.file.buffer);

    const info = localDb.prepare(`
      INSERT INTO course_files (course_id, folder, filename, original_name, content_type, uploaded_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(courseId, folder, folder ? `${folder}/${storedName}` : storedName, req.file.originalname, req.file.mimetype || "", auth.email);

    const fileRecord = localDb.prepare("SELECT * FROM course_files WHERE id = ?").get(info.lastInsertRowid);
    return res.status(201).json({
      ...fileRecord,
      downloadUrl: `/course-files/${courseId}/${fileRecord.filename}`,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/files/:fileId/usage", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const usedInPages = localDb.prepare(`
      SELECT p.id, p.title
      FROM page_file_references r
      JOIN course_pages p ON r.page_id = p.id
      WHERE r.file_id = ? AND p.course_id = ?
    `).all(req.params.fileId, courseId);

    return res.json({ fileId: Number(req.params.fileId), usedInPages });
  } catch (error) {
    console.error("Error checking file usage:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/files/:fileId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const force = String(req.query.force || "").toLowerCase() === "true";
    const usedInPages = localDb.prepare(`
      SELECT p.id, p.title
      FROM page_file_references r
      JOIN course_pages p ON r.page_id = p.id
      WHERE r.file_id = ? AND p.course_id = ?
    `).all(req.params.fileId, courseId);

    if (usedInPages.length > 0 && !force) {
      return res.status(409).json({
        message: `This file is currently used in ${usedInPages.length} page(s).`,
        usedInPages,
      });
    }

    localDb.prepare("DELETE FROM page_file_references WHERE file_id = ?").run(req.params.fileId);
    localDb.prepare("DELETE FROM course_files WHERE id = ? AND course_id = ?").run(req.params.fileId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting file:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Collaborations (stub) =====

router.get("/:id/collaborations", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireNavVisible(req, res, courseId, "collaborations")) return;
    const rows = localDb.prepare("SELECT * FROM collaborations WHERE course_id = ? ORDER BY created_at DESC").all(courseId);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching collaborations:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/collaborations", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireTeacher(req, res, courseId);
    if (!auth) return;
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const info = localDb.prepare("INSERT INTO collaborations (course_id, title, url, created_by_teacher_email) VALUES (?, ?, ?, ?)")
      .run(courseId, title, req.body.url || "", auth.email);
    return res.status(201).json(localDb.prepare("SELECT * FROM collaborations WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error creating collaboration:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Outcomes (stub) =====

router.get("/:id/outcomes", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireNavVisible(req, res, courseId, "outcomes")) return;
    const rows = localDb.prepare("SELECT * FROM outcomes WHERE course_id = ? ORDER BY created_at DESC").all(courseId);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching outcomes:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/outcomes", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireTeacher(req, res, courseId);
    if (!auth) return;
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const info = localDb.prepare("INSERT INTO outcomes (course_id, title, description) VALUES (?, ?, ?)")
      .run(courseId, title, req.body.description || "");
    return res.status(201).json(localDb.prepare("SELECT * FROM outcomes WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error creating outcome:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Quizzes =====

router.get("/:id/quizzes", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireNavVisible(req, res, courseId, "quizzes");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rows = localDb.prepare("SELECT * FROM quizzes WHERE course_id = ? ORDER BY created_at DESC").all(courseId)
      .filter((q) => isTeacher || Number(q.published) === 1)
      .map((q) => {
        const questionCount = Number(localDb.prepare("SELECT COUNT(*) AS c FROM quiz_questions WHERE quiz_id = ?").get(q.id)?.c || 0);
        const mySubmission = !isTeacher
          ? localDb.prepare("SELECT score FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?)").get(q.id, auth.email)
          : null;
        return { ...q, published: Number(q.published) === 1, questionCount, myScore: mySubmission?.score ?? null };
      });
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching quizzes:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/quizzes", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireTeacher(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const info = localDb.prepare(`
      INSERT INTO quizzes (course_id, title, description, due_at, published, created_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(courseId, title, req.body.description || "", normalizeDueAt(req.body.dueAt), req.body.published ? 1 : 0, auth.email);
    const quizId = Number(info.lastInsertRowid);

    const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
    const insertQuestion = localDb.prepare(`
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

    return res.status(201).json(localDb.prepare("SELECT * FROM quizzes WHERE id = ?").get(quizId));
  } catch (error) {
    console.error("Error creating quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/quizzes/:quizId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const quiz = localDb.prepare("SELECT * FROM quizzes WHERE id = ? AND course_id = ?").get(req.params.quizId, courseId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    const isTeacher = isTeacherRole(auth.enrollment.role);
    const questions = localDb.prepare("SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position ASC").all(quiz.id)
      .map((q) => ({
        ...q,
        options: JSON.parse(q.options || "[]"),
        correctOption: isTeacher ? q.correct_option : undefined,
      }));

    if (isTeacher) {
      const submissions = localDb.prepare("SELECT * FROM quiz_submissions WHERE quiz_id = ?").all(quiz.id)
        .map((s) => ({ ...s, fullName: userFullName(s.scholar_email) }));
      return res.json({ ...quiz, questions, submissions });
    }

    const mySubmission = localDb.prepare("SELECT * FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?)").get(quiz.id, auth.email);
    return res.json({ ...quiz, questions, mySubmission: mySubmission || null });
  } catch (error) {
    console.error("Error fetching quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/quizzes/:quizId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const { title, description, dueAt, published } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (dueAt !== undefined) { updates.push("due_at = ?"); params.push(normalizeDueAt(dueAt)); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.quizId, courseId);
    localDb.prepare(`UPDATE quizzes SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    return res.json(localDb.prepare("SELECT * FROM quizzes WHERE id = ?").get(req.params.quizId));
  } catch (error) {
    console.error("Error updating quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/quizzes/:quizId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;
    localDb.prepare("DELETE FROM quizzes WHERE id = ? AND course_id = ?").run(req.params.quizId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/quizzes/:quizId/submit", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const quiz = localDb.prepare("SELECT * FROM quizzes WHERE id = ? AND course_id = ?").get(req.params.quizId, courseId);
    if (!quiz) return res.status(404).json({ message: "Quiz not found" });

    const answers = req.body.answers && typeof req.body.answers === "object" ? req.body.answers : {};
    const questions = localDb.prepare("SELECT * FROM quiz_questions WHERE quiz_id = ?").all(quiz.id);

    let score = 0;
    for (const question of questions) {
      const given = answers[String(question.id)];
      if (question.question_type === "multiple_choice" && question.correct_option && given === question.correct_option) {
        score += Number(question.points) || 0;
      }
    }

    const alreadySubmitted = localDb.prepare("SELECT 1 FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?)").get(quiz.id, auth.email);

    localDb.prepare(`
      INSERT INTO quiz_submissions (quiz_id, scholar_email, answers, score, submitted_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(quiz_id, scholar_email) DO UPDATE SET answers = excluded.answers, score = excluded.score, submitted_at = CURRENT_TIMESTAMP
    `).run(quiz.id, auth.email, JSON.stringify(answers), score);

    if (!alreadySubmitted) {
      scheduleSpacedReview(auth.email, `quiz_${quiz.id}`, quiz.title);
    }

    return res.status(201).json({ message: "Submitted", score });
  } catch (error) {
    console.error("Error submitting quiz:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Pages =====

router.get("/:id/pages", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireNavVisible(req, res, courseId, "pages");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rows = localDb.prepare("SELECT * FROM course_pages WHERE course_id = ? ORDER BY updated_at DESC").all(courseId)
      .filter((p) => isTeacher || Number(p.published) === 1);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching pages:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/pages", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireTeacher(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const bodyJsonStr = req.body.bodyJson ? (typeof req.body.bodyJson === 'string' ? req.body.bodyJson : JSON.stringify(req.body.bodyJson)) : null;
    const readMins = calculateEstimatedReadMinutes(bodyJsonStr, req.body.bodyHtml, req.body.body);

    const info = localDb.prepare(`
      INSERT INTO course_pages (course_id, title, body, body_json, body_html, estimated_read_minutes, published, created_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(courseId, title, req.body.body || "", bodyJsonStr, req.body.bodyHtml || null, readMins, req.body.published ? 1 : 0, auth.email);

    const pageId = Number(info.lastInsertRowid);
    syncPageFileReferences(pageId, bodyJsonStr);

    return res.status(201).json(localDb.prepare("SELECT * FROM course_pages WHERE id = ?").get(pageId));
  } catch (error) {
    console.error("Error creating page:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/pages/:pageId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const page = localDb.prepare("SELECT * FROM course_pages WHERE id = ? AND course_id = ?").get(req.params.pageId, courseId);
    if (!page) return res.status(404).json({ message: "Page not found" });

    const userView = localDb.prepare("SELECT * FROM page_views WHERE page_id = ? AND LOWER(user_email) = LOWER(?)")
      .get(page.id, auth.email);

    let teacherStats = null;
    if (isTeacherRole(auth.enrollment.role)) {
      const totalEnrolled = Number(localDb.prepare("SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").get(courseId)?.c || 0);
      const viewedCount = Number(localDb.prepare("SELECT COUNT(*) AS c FROM page_views WHERE page_id = ?").get(page.id)?.c || 0);
      const completedCount = Number(localDb.prepare("SELECT COUNT(*) AS c FROM page_views WHERE page_id = ? AND completed_at IS NOT NULL").get(page.id)?.c || 0);
      teacherStats = { totalEnrolled, viewedCount, completedCount };
    }

    return res.json({
      ...page,
      myView: userView ? {
        first_viewed_at: userView.first_viewed_at,
        last_viewed_at: userView.last_viewed_at,
        scroll_pct_reached: Number(userView.scroll_pct_reached) || 0,
        completed: Boolean(userView.completed_at),
        completed_at: userView.completed_at,
      } : null,
      teacherStats,
    });
  } catch (error) {
    console.error("Error fetching page:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/pages/:pageId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;

    const { title, body, bodyJson, bodyHtml, published } = req.body;
    const existing = localDb.prepare("SELECT * FROM course_pages WHERE id = ? AND course_id = ?").get(req.params.pageId, courseId);
    if (!existing) return res.status(404).json({ message: "Page not found" });

    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (body !== undefined) { updates.push("body = ?"); params.push(body); }
    if (bodyJson !== undefined) { updates.push("body_json = ?"); params.push(typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson)); }
    if (bodyHtml !== undefined) { updates.push("body_html = ?"); params.push(bodyHtml); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }

    const newBodyJson = bodyJson !== undefined ? (typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson)) : existing.body_json;
    const newBodyHtml = bodyHtml !== undefined ? bodyHtml : existing.body_html;
    const newBodyText = body !== undefined ? body : existing.body;
    const readMins = calculateEstimatedReadMinutes(newBodyJson, newBodyHtml, newBodyText);
    updates.push("estimated_read_minutes = ?");
    params.push(readMins);

    if (updates.length) {
      updates.push("updated_at = CURRENT_TIMESTAMP");
      params.push(req.params.pageId, courseId);
      localDb.prepare(`UPDATE course_pages SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    }

    if (newBodyJson) {
      syncPageFileReferences(req.params.pageId, newBodyJson);
    }

    return res.json(localDb.prepare("SELECT * FROM course_pages WHERE id = ?").get(req.params.pageId));
  } catch (error) {
    console.error("Error updating page:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/pages/:pageId/view", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const page = localDb.prepare("SELECT * FROM course_pages WHERE id = ? AND course_id = ?").get(req.params.pageId, courseId);
    if (!page) return res.status(404).json({ message: "Page not found" });

    const scrollPct = Math.min(100, Math.max(0, Number(req.body.scrollPct || req.body.scroll_pct) || 0));

    const existing = localDb.prepare("SELECT * FROM page_views WHERE page_id = ? AND LOWER(user_email) = LOWER(?)").get(page.id, auth.email);

    if (!existing) {
      const completedAt = scrollPct >= 90 ? new Date().toISOString() : null;
      localDb.prepare(`
        INSERT INTO page_views (page_id, user_email, scroll_pct_reached, completed_at)
        VALUES (?, ?, ?, ?)
      `).run(page.id, auth.email, scrollPct, completedAt);
    } else {
      const maxScroll = Math.max(Number(existing.scroll_pct_reached) || 0, scrollPct);
      let completedAt = existing.completed_at;
      if (!completedAt && maxScroll >= 90) {
        completedAt = new Date().toISOString();
      }
      localDb.prepare(`
        UPDATE page_views
        SET last_viewed_at = CURRENT_TIMESTAMP, scroll_pct_reached = ?, completed_at = ?
        WHERE page_id = ? AND LOWER(user_email) = LOWER(?)
      `).run(maxScroll, completedAt, page.id, auth.email);
    }

    const updatedView = localDb.prepare("SELECT * FROM page_views WHERE page_id = ? AND LOWER(user_email) = LOWER(?)").get(page.id, auth.email);

    return res.json({
      pageId: page.id,
      completed: Boolean(updatedView.completed_at),
      completed_at: updatedView.completed_at,
      scroll_pct_reached: Number(updatedView.scroll_pct_reached),
    });
  } catch (error) {
    console.error("Error recording page view:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/pages/:pageId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireTeacher(req, res, courseId)) return;
    localDb.prepare("DELETE FROM course_pages WHERE id = ? AND course_id = ?").run(req.params.pageId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting page:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Discussions =====

router.get("/:id/discussions", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireNavVisible(req, res, courseId, "discussions");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rows = localDb.prepare("SELECT * FROM discussions WHERE course_id = ? ORDER BY created_at DESC").all(courseId)
      .filter((d) => isTeacher || Number(d.published) === 1)
      .map((d) => {
        const replyCount = Number(localDb.prepare("SELECT COUNT(*) AS c FROM discussion_replies WHERE discussion_id = ?").get(d.id)?.c || 0);
        return { ...d, replyCount };
      });
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching discussions:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/discussions", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const info = localDb.prepare(`
      INSERT INTO discussions (course_id, title, body, graded, points_possible, published, created_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(courseId, title, req.body.body || "", req.body.graded && isTeacher ? 1 : 0, Number(req.body.pointsPossible) || 0, isTeacher ? (req.body.published ? 1 : 0) : 1, auth.email);
    return res.status(201).json(localDb.prepare("SELECT * FROM discussions WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error creating discussion:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/discussions/:discussionId", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!requireEnrolled(req, res, courseId)) return;

    const discussion = localDb.prepare("SELECT * FROM discussions WHERE id = ? AND course_id = ?").get(req.params.discussionId, courseId);
    if (!discussion) return res.status(404).json({ message: "Discussion not found" });

    const replies = localDb.prepare("SELECT * FROM discussion_replies WHERE discussion_id = ? ORDER BY created_at ASC").all(discussion.id)
      .map((r) => ({ ...r, authorName: userFullName(r.author_email) }));

    return res.json({ ...discussion, replies });
  } catch (error) {
    console.error("Error fetching discussion:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/discussions/:discussionId/replies", (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = requireEnrolled(req, res, courseId);
    if (!auth) return;

    const body = String(req.body.body || "").trim();
    if (!body) return res.status(400).json({ message: "body is required" });

    const info = localDb.prepare(`
      INSERT INTO discussion_replies (discussion_id, parent_reply_id, body, author_email)
      VALUES (?, ?, ?, ?)
    `).run(req.params.discussionId, req.body.parentReplyId || null, body, auth.email);

    return res.status(201).json(localDb.prepare("SELECT * FROM discussion_replies WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error posting reply:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
