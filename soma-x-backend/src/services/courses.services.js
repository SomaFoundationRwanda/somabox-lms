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

async function generateUniqueCourseCode() {
  let attempts = 0;
  while (attempts < 2000) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exists = await localDb.prepare("SELECT 1 FROM courses WHERE id = ?").get(code);
    if (!exists) return code;
    attempts += 1;
  }
  throw new Error("Failed to generate a unique course code");
}

async function getEnrollment(courseId, email) {
  return localDb
    .prepare("SELECT * FROM enrollments WHERE course_id = ? AND LOWER(user_email) = LOWER(?)")
    .get(courseId, email);
}

function isTeacherRole(role) {
  return role === "teacher" || role === "ta";
}

async function requireTeacher(req, res, courseId) {
  const email = normalizeEmail(req.body?.teacherEmail || req.query?.teacherEmail || req.body?.userEmail || req.query?.userEmail);
  if (!email) {
    res.status(400).json({ message: "teacherEmail is required" });
    return null;
  }
  const enrollment = await getEnrollment(courseId, email);
  if (!enrollment || !isTeacherRole(enrollment.role) || enrollment.status !== "active") {
    res.status(403).json({ message: "Not allowed — teacher/TA role required for this course" });
    return null;
  }
  return { email, enrollment };
}

async function requireEnrolled(req, res, courseId) {
  const email = normalizeEmail(req.body?.userEmail || req.query?.userEmail || req.body?.teacherEmail || req.query?.teacherEmail);
  if (!email) {
    res.status(400).json({ message: "userEmail is required" });
    return null;
  }
  let enrollment = await getEnrollment(courseId, email);
  if (!enrollment) {
    res.status(403).json({ message: "Not enrolled in this course" });
    return null;
  }
  if (enrollment.status === "invited") {
    await localDb.prepare("UPDATE enrollments SET status = 'active', joined_at = CURRENT_TIMESTAMP WHERE id = ?").run(enrollment.id);
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
async function requireNavVisible(req, res, courseId, navKey) {
  const auth = await requireEnrolled(req, res, courseId);
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

async function courseExists(courseId) {
  return await localDb.prepare("SELECT * FROM courses WHERE id = ?").get(courseId);
}

function normalizeDueAt(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function linkDiscussionAssignment(courseId, discussionId, title, pointsPossible, teacherEmail) {
  const info = await localDb.prepare(`
    INSERT INTO assignments (course_id, title, description, points_possible, published, created_by_teacher_email)
    VALUES (?, ?, ?, ?, 1, ?)
  `).run(courseId, title, "Graded discussion — see Discussions for the conversation.", pointsPossible || 0, teacherEmail);
  await localDb.prepare("UPDATE discussions SET linked_assignment_id = ? WHERE id = ?").run(info.lastInsertRowid, discussionId);
  return info.lastInsertRowid;
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

async function syncPageFileReferences(pageId, bodyJson) {
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

  const tx = localDb.transaction(async (pId, ids) => {
    await localDb.prepare("DELETE FROM page_file_references WHERE page_id = ?").run(pId);
    const ins = await localDb.prepare("INSERT OR IGNORE INTO page_file_references (page_id, file_id) VALUES (?, ?)");
    ids.forEach((fId) => {
      if (fId && !isNaN(fId)) ins.run(pId, fId);
    });
  });
  await tx(pageId, Array.from(fileIds));
}

async function scheduleSpacedReview(scholarEmail, topicId, topicTitle) {
  const intervals = [3, 7, 30];
  const exists = await localDb.prepare(`
    SELECT 1 FROM sol_spaced_reviews WHERE LOWER(scholar_email) = LOWER(?) AND topic_id = ? AND interval_days = ?
  `);
  const insert = await localDb.prepare(`
    INSERT INTO sol_spaced_reviews (scholar_email, topic_id, topic_title, interval_days, due_at, status)
    VALUES (?, ?, ?, ?, DATETIME('now', ?), 'pending')
  `);
  for (const days of intervals) {
    if (!exists.get(scholarEmail, topicId, days)) {
      insert.run(scholarEmail, topicId, topicTitle, days, `+${days} days`);
    }
  }
}

async function userFullName(email) {
  const user = await serverDb.prepare("SELECT full_name FROM users WHERE LOWER(email) = LOWER(?)").get(email);
  return user?.full_name || email;
}

// ===== Course CRUD =====

router.post("", async (req, res) => {
  try {
    const { title, description, grade, teacherEmail, startDate, endDate } = req.body;
    const email = normalizeEmail(teacherEmail);

    if (!title || !email) {
      return res.status(400).json({ message: "title and teacherEmail are required" });
    }

    const courseId = await generateUniqueCourseCode();

    await localDb.prepare(`
      INSERT INTO courses (id, title, description, grade, start_date, end_date, status, created_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?)
    `).run(courseId, title, description || "", grade || "", normalizeDueAt(startDate), normalizeDueAt(endDate), email);

    await seedDefaultNavItems(courseId);

    await localDb.prepare(`
      INSERT INTO enrollments (course_id, user_email, role, status)
      VALUES (?, ?, 'teacher', 'active')
    `).run(courseId, email);

    const created = await courseExists(courseId);
    return res.status(201).json(created);
  } catch (error) {
    console.error("Error creating course:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/mine", async (req, res) => {
  try {
    const email = normalizeEmail(req.query.userEmail);
    if (!email) return res.status(400).json({ message: "userEmail is required" });

    const rows = await localDb.prepare(`
      SELECT c.*, e.role AS my_role, e.status AS my_status
      FROM courses c
      JOIN enrollments e ON e.course_id = c.id
      WHERE LOWER(e.user_email) = LOWER(?) AND e.status IN ('active', 'invited')
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

router.get("/public", async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(req.query.pageSize) || 20));
    const offset = (page - 1) * pageSize;

    const total = Number(await localDb.prepare("SELECT COUNT(*) AS c FROM courses WHERE visibility = 'public'").get()?.c || 0);
    const rows = await localDb.prepare(`
      SELECT * FROM courses WHERE visibility = 'public' ORDER BY created_at DESC LIMIT ? OFFSET ?
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

    const email = normalizeEmail(req.body?.userEmail || req.query?.userEmail);
    if (!email) return res.status(400).json({ message: "userEmail is required" });

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
      await localDb.prepare("SELECT COUNT(*) AS total FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").get(courseId)?.total || 0
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

router.patch("/:id", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { title, description, grade, status, homePageType, startDate, endDate, visibility } = req.body;
    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (grade !== undefined) { updates.push("grade = ?"); params.push(grade); }
    if (status !== undefined && ["unpublished", "active", "completed"].includes(status)) { updates.push("status = ?"); params.push(status); }
    if (homePageType !== undefined && ["modules", "activity", "page"].includes(homePageType)) { updates.push("home_page_type = ?"); params.push(homePageType); }
    if (startDate !== undefined) { updates.push("start_date = ?"); params.push(normalizeDueAt(startDate)); }
    if (endDate !== undefined) { updates.push("end_date = ?"); params.push(normalizeDueAt(endDate)); }
    if (visibility !== undefined && ["private", "public"].includes(visibility)) { updates.push("visibility = ?"); params.push(visibility); }

    if (updates.length === 0) return res.status(400).json({ message: "No fields to update" });

    updates.push("updated_at = CURRENT_TIMESTAMP");
    params.push(courseId);

    await localDb.prepare(`UPDATE courses SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    return res.json(await courseExists(courseId));
  } catch (error) {
    console.error("Error updating course:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    await localDb.prepare("DELETE FROM courses WHERE id = ?").run(courseId);
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

// ===== Navigation =====

router.get("/:id/nav", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const isTeacher = isTeacherRole(auth.enrollment.role);
    const rawNav = await localDb
      .prepare("SELECT * FROM course_nav_items WHERE course_id = ? ORDER BY position ASC")
      .all(courseId);
    const rows = rawNav
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

router.patch("/:id/nav", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const items = Array.isArray(req.body?.items) ? req.body.items : Array.isArray(req.body) ? req.body : [];
    if (!items.length) return res.status(400).json({ message: "items array is required" });

    const update = await localDb.prepare(`
      UPDATE course_nav_items SET position = ?, visible_to_students = ? WHERE course_id = ? AND nav_key = ?
    `);

    const tx = localDb.transaction(async (navItems) => {
      navItems.forEach((item, index) => {
        if (!NAV_KEYS.includes(item.nav_key)) return;
        const position = Number.isFinite(item.position) ? item.position : index;
        const visible = item.visible_to_students === false ? 0 : 1;
        update.run(position, visible, courseId, item.nav_key);
      });
    });
    await tx(items);

    const rows = await localDb.prepare("SELECT * FROM course_nav_items WHERE course_id = ? ORDER BY position ASC").all(courseId);
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

router.get("/:id/people", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireEnrolled(req, res, courseId)) return;

    const rows = await localDb.prepare("SELECT * FROM enrollments WHERE course_id = ? ORDER BY role ASC, joined_at ASC").all(courseId);
    const people = await Promise.all(rows.map(async (row) => ({
      id: row.id,
      email: row.user_email,
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
    if (!await requireTeacher(req, res, courseId)) return;

    const email = normalizeEmail(req.body.email);
    const role = ["teacher", "ta", "student", "observer"].includes(req.body.role) ? req.body.role : "student";
    if (!email) return res.status(400).json({ message: "email is required" });

    const existingUser = await serverDb.prepare("SELECT * FROM users WHERE LOWER(email) = LOWER(?)").get(email);
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
    const email = normalizeEmail(req.body.userEmail || req.query.userEmail);
    if (!email) return res.status(400).json({ message: "userEmail is required" });

    await localDb.prepare("UPDATE enrollments SET status = 'active', joined_at = CURRENT_TIMESTAMP WHERE course_id = ? AND LOWER(user_email) = LOWER(?)")
      .run(courseId, email);

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
    if (!await requireTeacher(req, res, courseId)) return;

    await localDb.prepare("DELETE FROM enrollments WHERE id = ? AND course_id = ?").run(req.params.enrollmentId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error removing enrollment:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Self-enrollment — a scholar joining with a course code, the registration-time flow.
router.post("/:id/enroll", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found. Check the course code." });

    const email = normalizeEmail(req.body.userEmail);
    if (!email) return res.status(400).json({ message: "userEmail is required" });

    const user = await serverDb.prepare("SELECT role FROM users WHERE LOWER(email) = LOWER(?)").get(email);
    if (!user) return res.status(404).json({ message: "No account found for this email" });

    await localDb.prepare(`
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

router.get("/:id/modules", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "modules");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const modules = await localDb.prepare("SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC").all(courseId);
    const result = await Promise.all(modules
      .filter((m) => isTeacher || Number(m.published) === 1)
      .map(async (moduleRow) => {
        const rawItems = await localDb.prepare("SELECT * FROM module_items WHERE module_id = ? ORDER BY position ASC").all(moduleRow.id);
        const items = await Promise.all(rawItems
          .filter((item) => isTeacher || Number(item.published) === 1)
          .map(async (item) => {
            const enriched = {
              ...item,
              published: Number(item.published) === 1,
              indent_level: Number(item.indent_level) || 0,
            };
            if (item.item_type === 'assignment' && item.content_ref_id) {
              const assignment = await localDb.prepare("SELECT due_at, points_possible FROM assignments WHERE id = ?").get(item.content_ref_id);
              if (assignment) {
                enriched.due_at = assignment.due_at;
                enriched.points_possible = assignment.points_possible;
              }
            }
            if (item.item_type === 'quiz' && item.content_ref_id) {
              const quiz = await localDb.prepare("SELECT due_at FROM quizzes WHERE id = ?").get(item.content_ref_id);
              if (quiz) enriched.due_at = quiz.due_at;
            }
            if (item.item_type === 'file' && item.content_ref_id) {
              const file = await localDb.prepare("SELECT original_name, filename, content_type FROM course_files WHERE id = ?").get(item.content_ref_id);
              if (file) {
                enriched.original_name = file.original_name;
                enriched.filename = file.filename;
                enriched.content_type = file.content_type;
              }
            }
            return enriched;
          }));
        return { ...moduleRow, published: Number(moduleRow.published) === 1, items };
      }));

    return res.json(result);
  } catch (error) {
    console.error("Error fetching modules:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/modules", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const maxPosition = Number(await localDb.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM modules WHERE course_id = ?").get(courseId)?.m ?? -1);

    const info = await localDb.prepare(`
      INSERT INTO modules (course_id, title, description, position, published, due_at, created_by_teacher_email)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(courseId, title, req.body.description || "", maxPosition + 1, normalizeDueAt(req.body.dueAt), auth.email);

    return res.status(201).json({ id: Number(info.lastInsertRowid), title, position: maxPosition + 1 });
  } catch (error) {
    console.error("Error creating module:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/modules/:moduleId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

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
    await localDb.prepare(`UPDATE modules SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);

    return res.json(await localDb.prepare("SELECT * FROM modules WHERE id = ?").get(req.params.moduleId));
  } catch (error) {
    console.error("Error updating module:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/modules/:moduleId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    await localDb.prepare("DELETE FROM modules WHERE id = ? AND course_id = ?").run(req.params.moduleId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting module:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Batch reorder modules
router.patch("/:id/modules/reorder", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const moduleIds = Array.isArray(req.body.moduleIds) ? req.body.moduleIds : [];
    if (!moduleIds.length) return res.status(400).json({ message: "moduleIds array is required" });

    const updatePos = await localDb.prepare("UPDATE modules SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND course_id = ?");
    const tx = localDb.transaction(async (ids) => {
      ids.forEach((id, index) => updatePos.run(index, id, courseId));
    });
    await tx(moduleIds);

    return res.json({ message: "Modules reordered" });
  } catch (error) {
    console.error("Error reordering modules:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Module Items =====

// Create a new module item (+ underlying content record in one transaction)
router.post("/:id/modules/:moduleId/items", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const moduleRow = await localDb.prepare("SELECT * FROM modules WHERE id = ? AND course_id = ?").get(req.params.moduleId, courseId);
    if (!moduleRow) return res.status(404).json({ message: "Module not found" });

    const itemType = String(req.body.itemType || "").trim();
    const title = String(req.body.title || "").trim() || "Untitled";
    const indentLevel = Math.min(3, Math.max(0, Number(req.body.indentLevel) || 0));

    if (!['page', 'assignment', 'quiz', 'file', 'discussion', 'sub_header'].includes(itemType)) {
      return res.status(400).json({ message: "Invalid itemType. Must be: page, assignment, quiz, file, discussion, or sub_header" });
    }

    const maxPosition = Number(await localDb.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM module_items WHERE module_id = ?").get(moduleRow.id)?.m ?? -1);

    // Sub-header: no content record
    if (itemType === 'sub_header') {
      const info = await localDb.prepare(`
        INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, indent_level, published, content_ref_table, content_ref_id)
        VALUES (?, 'sub_header', NULL, ?, ?, ?, 1, NULL, NULL)
      `).run(moduleRow.id, title, maxPosition + 1, indentLevel);

      return res.status(201).json({
        id: Number(info.lastInsertRowid), itemType: 'sub_header', title,
        position: maxPosition + 1, indent_level: indentLevel, content_ref_id: null
      });
    }

    // All other types: create content record + module item in a transaction
    const createItemTx = localDb.transaction(async () => {
      let contentRefId;
      let contentRefTable = CONTENT_TABLE_MAP[itemType];

      if (itemType === 'page') {
        const bodyJsonStr = req.body.bodyJson ? (typeof req.body.bodyJson === 'string' ? req.body.bodyJson : JSON.stringify(req.body.bodyJson)) : null;
        const readMins = calculateEstimatedReadMinutes(bodyJsonStr, req.body.bodyHtml, req.body.body);
        const r = await localDb.prepare(`
          INSERT INTO course_pages (course_id, title, body, body_json, body_html, estimated_read_minutes, published, created_by_teacher_email)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
        `).run(courseId, title, req.body.body || "", bodyJsonStr, req.body.bodyHtml || null, readMins, auth.email);
        contentRefId = Number(r.lastInsertRowid);
        await syncPageFileReferences(contentRefId, bodyJsonStr);
      } else if (itemType === 'assignment') {
        const r = await localDb.prepare(`
          INSERT INTO assignments (course_id, title, description, due_at, points_possible, published, created_by_teacher_email)
          VALUES (?, ?, ?, ?, ?, 1, ?)
        `).run(courseId, title, req.body.description || "", normalizeDueAt(req.body.dueAt), Number(req.body.pointsPossible) || 100, auth.email);
        contentRefId = Number(r.lastInsertRowid);
      } else if (itemType === 'quiz') {
        const r = await localDb.prepare(`
          INSERT INTO quizzes (course_id, title, description, due_at, published, created_by_teacher_email)
          VALUES (?, ?, ?, ?, 1, ?)
        `).run(courseId, title, req.body.description || "", normalizeDueAt(req.body.dueAt), auth.email);
        contentRefId = Number(r.lastInsertRowid);

        // Insert quiz questions if provided
        const questions = Array.isArray(req.body.questions) ? req.body.questions : [];
        const insertQuestion = await localDb.prepare(`
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
        const r = await localDb.prepare(`
          INSERT INTO discussions (course_id, title, body, published, created_by_teacher_email)
          VALUES (?, ?, ?, 1, ?)
        `).run(courseId, title, req.body.body || "", auth.email);
        contentRefId = Number(r.lastInsertRowid);
      } else {
        // file type handled by separate upload endpoint
        throw new Error("Use POST /:id/modules/:moduleId/items/file for file uploads");
      }

      const info = await localDb.prepare(`
        INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, indent_level, published, content_ref_table, content_ref_id)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(moduleRow.id, itemType, contentRefId, title, maxPosition + 1, indentLevel, contentRefTable, contentRefId);

      return { moduleItemId: Number(info.lastInsertRowid), contentRefId, contentRefTable };
    });

    const result = await createItemTx();
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
router.post("/:id/modules/:moduleId/items/file", upload.single("file"), async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const moduleRow = await localDb.prepare("SELECT * FROM modules WHERE id = ? AND course_id = ?").get(req.params.moduleId, courseId);
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

    const createFileTx = localDb.transaction(async () => {
      const fileInfo = await localDb.prepare(`
        INSERT INTO course_files (course_id, folder, filename, original_name, content_type, uploaded_by_teacher_email)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(courseId, folder, folder ? `${folder}/${storedName}` : storedName, req.file.originalname, req.file.mimetype || "", auth.email);
      const fileId = Number(fileInfo.lastInsertRowid);

      const maxPosition = Number(await localDb.prepare("SELECT COALESCE(MAX(position), -1) AS m FROM module_items WHERE module_id = ?").get(moduleRow.id)?.m ?? -1);
      const itemInfo = await localDb.prepare(`
        INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, indent_level, published, content_ref_table, content_ref_id)
        VALUES (?, 'file', ?, ?, ?, ?, 0, 'course_files', ?)
      `).run(moduleRow.id, fileId, title, maxPosition + 1, indentLevel, fileId);

      return { moduleItemId: Number(itemInfo.lastInsertRowid), fileId, position: maxPosition + 1 };
    });

    const result = await createFileTx();
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
router.patch("/:id/modules/:moduleId/items/:itemId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { published, position, title, indentLevel } = req.body;
    const updates = [];
    const params = [];
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (position !== undefined) { updates.push("position = ?"); params.push(Number(position)); }
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (indentLevel !== undefined) { updates.push("indent_level = ?"); params.push(Math.min(3, Math.max(0, Number(indentLevel)))); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.itemId);
    await localDb.prepare(`UPDATE module_items SET ${updates.join(", ")} WHERE id = ?`).run(...params);
    return res.json(await localDb.prepare("SELECT * FROM module_items WHERE id = ?").get(req.params.itemId));
  } catch (error) {
    console.error("Error updating module item:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Edit the underlying content record of a module item
router.patch("/:id/modules/:moduleId/items/:itemId/content", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const item = await localDb.prepare("SELECT * FROM module_items WHERE id = ?").get(req.params.itemId);
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
      
      const existingPage = await localDb.prepare("SELECT * FROM course_pages WHERE id = ?").get(contentId);
      const newBodyJson = bodyJson !== undefined ? (typeof bodyJson === 'string' ? bodyJson : JSON.stringify(bodyJson)) : existingPage?.body_json;
      const newBodyHtml = bodyHtml !== undefined ? bodyHtml : existingPage?.body_html;
      const newBodyText = body !== undefined ? body : existingPage?.body;
      const readMins = calculateEstimatedReadMinutes(newBodyJson, newBodyHtml, newBodyText);
      updates.push("estimated_read_minutes = ?");
      params.push(readMins);

      if (updates.length) {
        updates.push("updated_at = CURRENT_TIMESTAMP");
        params.push(contentId, courseId);
        await localDb.prepare(`UPDATE course_pages SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      if (newBodyJson) {
        await syncPageFileReferences(contentId, newBodyJson);
      }
      // Also update module item title if page title changed
      if (title !== undefined) {
        await localDb.prepare("UPDATE module_items SET title = ? WHERE id = ?").run(title, item.id);
      }
      return res.json(await localDb.prepare("SELECT * FROM course_pages WHERE id = ?").get(contentId));
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
        await localDb.prepare(`UPDATE assignments SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      if (title !== undefined) {
        await localDb.prepare("UPDATE module_items SET title = ? WHERE id = ?").run(title, item.id);
      }
      return res.json(await localDb.prepare("SELECT * FROM assignments WHERE id = ?").get(contentId));
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
        await localDb.prepare(`UPDATE quizzes SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      // Replace quiz questions if provided
      if (Array.isArray(questions)) {
        await localDb.prepare("DELETE FROM quiz_questions WHERE quiz_id = ?").run(contentId);
        const insertQ = await localDb.prepare(`
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
        await localDb.prepare("UPDATE module_items SET title = ? WHERE id = ?").run(title, item.id);
      }
      const quiz = await localDb.prepare("SELECT * FROM quizzes WHERE id = ?").get(contentId);
      const quizQuestions = await localDb.prepare("SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position ASC").all(contentId);
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
        await localDb.prepare(`UPDATE discussions SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
      }
      if (title !== undefined) {
        await localDb.prepare("UPDATE module_items SET title = ? WHERE id = ?").run(title, item.id);
      }
      return res.json(await localDb.prepare("SELECT * FROM discussions WHERE id = ?").get(contentId));
    }

    return res.status(400).json({ message: "Unsupported item type for content edit" });
  } catch (error) {
    console.error("Error editing module item content:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Delete module item — ?mode=remove_from_module (default) | delete_permanently
router.delete("/:id/modules/:moduleId/items/:itemId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const mode = String(req.query.mode || "remove_from_module").trim();
    const item = await localDb.prepare("SELECT * FROM module_items WHERE id = ?").get(req.params.itemId);
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
          await localDb.prepare(`DELETE FROM ${mapping.table} WHERE ${mapping.idCol} = ? AND ${mapping.courseCol} = ?`).run(contentId, courseId);
        }
      }
    }

    await localDb.prepare("DELETE FROM module_items WHERE id = ?").run(req.params.itemId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting module item:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Module Item Navigation Sequence & Progress =====

async function getCourseSequence(courseId, isTeacher) {
  const modules = await localDb.prepare("SELECT * FROM modules WHERE course_id = ? ORDER BY position ASC").all(courseId);
  const sequence = [];

  for (const mod of modules) {
    if (!isTeacher && Number(mod.published) !== 1) continue;

    const items = await localDb.prepare(
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

router.get("/:id/module-items/sequence", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const isTeacher = isTeacherRole(auth.enrollment.role);
    const sequence = await getCourseSequence(courseId, isTeacher);
    return res.json(sequence);
  } catch (error) {
    console.error("Error fetching sequence:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/module-items/sequence-position", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const isTeacher = isTeacherRole(auth.enrollment.role);
    const sequence = await getCourseSequence(courseId, isTeacher);

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

router.post("/:id/module-items/:moduleItemId/progress", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const item = await localDb.prepare("SELECT * FROM module_items WHERE id = ?").get(req.params.moduleItemId);
    if (!item) return res.status(404).json({ message: "Module item not found" });

    await localDb.prepare(`
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
router.patch("/:id/modules/:moduleId/items/reorder", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const itemIds = Array.isArray(req.body.itemIds) ? req.body.itemIds : [];
    if (!itemIds.length) return res.status(400).json({ message: "itemIds array is required" });

    const updatePos = await localDb.prepare("UPDATE module_items SET position = ? WHERE id = ? AND module_id = ?");
    const tx = localDb.transaction(async (ids) => {
      ids.forEach((id, index) => updatePos.run(index, id, req.params.moduleId));
    });
    await tx(itemIds);

    return res.json({ message: "Items reordered" });
  } catch (error) {
    console.error("Error reordering items:", error);
    return res.status(500).json({ message: error.message });
  }
});

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

// ===== Activity feed (backs the "activity" Home page type) =====

router.get("/:id/activity", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const items = [];

    const announcements = await localDb.prepare("SELECT * FROM announcements WHERE course_id = ? AND published = 1 ORDER BY created_at DESC LIMIT 10").all(courseId);
    for (const a of announcements) {
      items.push({ type: "announcement", id: a.id, summary: `New announcement: "${a.title}"`, createdAt: a.created_at });
    }

    const discussions = await localDb.prepare("SELECT * FROM discussions WHERE course_id = ? AND published = 1 ORDER BY created_at DESC LIMIT 10").all(courseId);
    for (const d of discussions) {
      items.push({ type: "discussion", id: d.id, summary: `New discussion: "${d.title}"`, createdAt: d.created_at });
    }

    if (isTeacher) {
      const recentSubmissions = await localDb.prepare(`
        SELECT s.*, a.title AS assignment_title FROM assignment_submissions s
        JOIN assignments a ON a.id = s.assignment_id
        WHERE a.course_id = ? ORDER BY s.submitted_at DESC LIMIT 10
      `).all(courseId);
      for (const s of recentSubmissions) {
        items.push({ type: "grade", id: s.id, summary: `${await userFullName(s.scholar_email)} submitted "${s.assignment_title}"`, createdAt: s.submitted_at });
      }
    } else {
      const myGraded = await localDb.prepare(`
        SELECT s.*, a.title AS assignment_title FROM assignment_submissions s
        JOIN assignments a ON a.id = s.assignment_id
        WHERE a.course_id = ? AND LOWER(s.scholar_email) = LOWER(?) AND s.graded_at IS NOT NULL
        ORDER BY s.graded_at DESC LIMIT 10
      `).all(courseId, auth.email);
      for (const s of myGraded) {
        items.push({ type: "grade", id: s.id, summary: `"${s.assignment_title}" was graded: ${s.grade}`, createdAt: s.graded_at });
      }
    }

    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return res.json(items.slice(0, 20));
  } catch (error) {
    console.error("Error fetching activity:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Announcements =====

router.get("/:id/announcements", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "announcements");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rawAnnouncements = await localDb.prepare("SELECT * FROM announcements WHERE course_id = ? ORDER BY created_at DESC").all(courseId);
    const rows = rawAnnouncements.filter((a) => isTeacher || Number(a.published) === 1);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching announcements:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/announcements", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const info = await localDb.prepare(`INSERT INTO announcements (course_id, title, body, published, created_by_teacher_email) VALUES (?, ?, ?, 1, ?)`)
      .run(courseId, title, req.body.body || "", auth.email);
    return res.status(201).json(await localDb.prepare("SELECT * FROM announcements WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error creating announcement:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/announcements/:announcementId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { title, body, published, pinned } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (body !== undefined) { updates.push("body = ?"); params.push(body); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (pinned !== undefined) { updates.push("pinned = ?"); params.push(pinned ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.announcementId, courseId);
    await localDb.prepare(`UPDATE announcements SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    return res.json(await localDb.prepare("SELECT * FROM announcements WHERE id = ?").get(req.params.announcementId));
  } catch (error) {
    console.error("Error updating announcement:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/announcements/:announcementId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    await localDb.prepare("DELETE FROM announcements WHERE id = ? AND course_id = ?").run(req.params.announcementId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting announcement:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Syllabus =====

router.get("/:id/syllabus", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "syllabus");
    if (!auth) return;

    const dueDates = await localDb.prepare("SELECT id, title, due_at, points_possible FROM assignments WHERE course_id = ? AND due_at IS NOT NULL AND published = 1 ORDER BY due_at ASC").all(courseId);
    const quizDueDates = await localDb.prepare("SELECT id, title, due_at FROM quizzes WHERE course_id = ? AND due_at IS NOT NULL AND published = 1 ORDER BY due_at ASC").all(courseId);

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

router.patch("/:id/syllabus", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    await localDb.prepare("UPDATE courses SET syllabus_body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(req.body.body || "", courseId);
    return res.json({ message: "Syllabus updated" });
  } catch (error) {
    console.error("Error updating syllabus:", error);
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

// ===== Files =====

router.get("/:id/files", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireNavVisible(req, res, courseId, "files")) return;

    const rawFiles = await localDb.prepare("SELECT * FROM course_files WHERE course_id = ? ORDER BY uploaded_at DESC").all(courseId);
    const rows = rawFiles.map((f) => ({
      ...f,
      downloadUrl: f.filename.startsWith("lessons/") ? `/${f.filename}` : `/course-files/${courseId}/${f.filename}`,
    }));
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching files:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/files/upload", upload.single("file"), async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;
    if (!req.file) return res.status(400).json({ message: "No file provided" });

    const folder = String(req.body.folder || "").trim();
    const dir = path.join(config.paths.root, "local-content/course-files", courseId, folder);
    fs.mkdirSync(dir, { recursive: true });

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    fs.writeFileSync(path.join(dir, storedName), req.file.buffer);

    const info = await localDb.prepare(`
      INSERT INTO course_files (course_id, folder, filename, original_name, content_type, uploaded_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(courseId, folder, folder ? `${folder}/${storedName}` : storedName, req.file.originalname, req.file.mimetype || "", auth.email);

    const fileRecord = await localDb.prepare("SELECT * FROM course_files WHERE id = ?").get(info.lastInsertRowid);
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

router.post("/:id/files", upload.single("file"), async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;
    if (!req.file) return res.status(400).json({ message: "No file provided" });

    const folder = String(req.body.folder || "").trim();
    const dir = path.join(config.paths.root, "local-content/course-files", courseId, folder);
    fs.mkdirSync(dir, { recursive: true });

    const safeName = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storedName = `${Date.now()}-${safeName}`;
    fs.writeFileSync(path.join(dir, storedName), req.file.buffer);

    const info = await localDb.prepare(`
      INSERT INTO course_files (course_id, folder, filename, original_name, content_type, uploaded_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(courseId, folder, folder ? `${folder}/${storedName}` : storedName, req.file.originalname, req.file.mimetype || "", auth.email);

    const fileRecord = await localDb.prepare("SELECT * FROM course_files WHERE id = ?").get(info.lastInsertRowid);
    return res.status(201).json({
      ...fileRecord,
      downloadUrl: `/course-files/${courseId}/${fileRecord.filename}`,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/files/:fileId/usage", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const usedInPages = await localDb.prepare(`
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

router.delete("/:id/files/:fileId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const force = String(req.query.force || "").toLowerCase() === "true";
    const usedInPages = await localDb.prepare(`
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

    await localDb.prepare("DELETE FROM page_file_references WHERE file_id = ?").run(req.params.fileId);
    await localDb.prepare("DELETE FROM course_files WHERE id = ? AND course_id = ?").run(req.params.fileId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting file:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Collaborations =====
// A shared-link registry (title + external URL, optionally scoped to specific
// members) — intentionally simple, not embedded real-time editing.

router.get("/:id/collaborations", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "collaborations");
    if (!auth) return;

    const rows = await localDb.prepare("SELECT * FROM collaborations WHERE course_id = ? ORDER BY created_at DESC").all(courseId);
    const memberStmt = await localDb.prepare("SELECT user_email FROM collaboration_members WHERE collaboration_id = ?");
    const visible = (await Promise.all(rows.map(async (c) => {
      const memberRows = await memberStmt.all(c.id);
      const members = memberRows.map((m) => m.user_email);
      return { ...c, memberCount: members.length, members };
    }))).filter((c) => isTeacherRole(auth.enrollment.role) || c.memberCount === 0 || c.members.some((m) => m.toLowerCase() === auth.email.toLowerCase()) || normalizeEmail(c.created_by_teacher_email) === auth.email);

    return res.json(visible.map(({ members, ...rest }) => rest));
  } catch (error) {
    console.error("Error fetching collaborations:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/collaborations", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const info = await localDb.prepare("INSERT INTO collaborations (course_id, title, url, created_by_teacher_email) VALUES (?, ?, ?, ?)")
      .run(courseId, title, req.body.url || "", auth.email);
    const collaborationId = Number(info.lastInsertRowid);

    const memberEmails = Array.isArray(req.body.memberEmails) ? req.body.memberEmails : [];
    const insertMember = await localDb.prepare("INSERT OR IGNORE INTO collaboration_members (collaboration_id, user_email) VALUES (?, ?)");
    memberEmails.forEach((email) => {
      const normalized = normalizeEmail(email);
      if (normalized) insertMember.run(collaborationId, normalized);
    });

    return res.status(201).json(await localDb.prepare("SELECT * FROM collaborations WHERE id = ?").get(collaborationId));
  } catch (error) {
    console.error("Error creating collaboration:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/collaborations/:collaborationId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const collaboration = await localDb.prepare("SELECT * FROM collaborations WHERE id = ? AND course_id = ?").get(req.params.collaborationId, courseId);
    if (!collaboration) return res.status(404).json({ message: "Collaboration not found" });

    const isOwner = normalizeEmail(collaboration.created_by_teacher_email) === auth.email;
    if (!isOwner && !isTeacherRole(auth.enrollment.role)) {
      return res.status(403).json({ message: "Not allowed to delete this collaboration" });
    }

    await localDb.prepare("DELETE FROM collaborations WHERE id = ?").run(req.params.collaborationId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting collaboration:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Outcomes =====

router.get("/:id/outcomes", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireNavVisible(req, res, courseId, "outcomes")) return;
    const rows = await localDb.prepare("SELECT * FROM outcomes WHERE course_id = ? ORDER BY created_at DESC").all(courseId);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching outcomes:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/outcomes", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;
    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });
    const masteryScale = ["4pt", "percent", "pass_fail"].includes(req.body.masteryScale) ? req.body.masteryScale : "4pt";

    const info = await localDb.prepare("INSERT INTO outcomes (course_id, title, description, mastery_scale) VALUES (?, ?, ?, ?)")
      .run(courseId, title, req.body.description || "", masteryScale);
    return res.status(201).json(await localDb.prepare("SELECT * FROM outcomes WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error creating outcome:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/outcomes/:outcomeId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { title, description, masteryScale } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description); }
    if (masteryScale !== undefined && ["4pt", "percent", "pass_fail"].includes(masteryScale)) { updates.push("mastery_scale = ?"); params.push(masteryScale); }
    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.outcomeId, courseId);
    await localDb.prepare(`UPDATE outcomes SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    return res.json(await localDb.prepare("SELECT * FROM outcomes WHERE id = ?").get(req.params.outcomeId));
  } catch (error) {
    console.error("Error updating outcome:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.delete("/:id/outcomes/:outcomeId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    await localDb.prepare("DELETE FROM outcomes WHERE id = ? AND course_id = ?").run(req.params.outcomeId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting outcome:", error);
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

// ===== Pages =====

router.get("/:id/pages", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "pages");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rawPages = await localDb.prepare("SELECT * FROM course_pages WHERE course_id = ? ORDER BY updated_at DESC").all(courseId);
    const rows = rawPages.filter((p) => isTeacher || Number(p.published) === 1);
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching pages:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/pages", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });

    const bodyJsonStr = req.body.bodyJson ? (typeof req.body.bodyJson === 'string' ? req.body.bodyJson : JSON.stringify(req.body.bodyJson)) : null;
    const readMins = calculateEstimatedReadMinutes(bodyJsonStr, req.body.bodyHtml, req.body.body);

    const info = await localDb.prepare(`
      INSERT INTO course_pages (course_id, title, body, body_json, body_html, estimated_read_minutes, published, created_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(courseId, title, req.body.body || "", bodyJsonStr, req.body.bodyHtml || null, readMins, req.body.published ? 1 : 0, auth.email);

    const pageId = Number(info.lastInsertRowid);
    await syncPageFileReferences(pageId, bodyJsonStr);

    return res.status(201).json(await localDb.prepare("SELECT * FROM course_pages WHERE id = ?").get(pageId));
  } catch (error) {
    console.error("Error creating page:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/pages/:pageId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const page = await localDb.prepare("SELECT * FROM course_pages WHERE id = ? AND course_id = ?").get(req.params.pageId, courseId);
    if (!page) return res.status(404).json({ message: "Page not found" });

    const userView = await localDb.prepare("SELECT * FROM page_views WHERE page_id = ? AND LOWER(user_email) = LOWER(?)")
      .get(page.id, auth.email);

    let teacherStats = null;
    if (isTeacherRole(auth.enrollment.role)) {
      const totalEnrolled = Number(await localDb.prepare("SELECT COUNT(*) AS c FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").get(courseId)?.c || 0);
      const viewedCount = Number(await localDb.prepare("SELECT COUNT(*) AS c FROM page_views WHERE page_id = ?").get(page.id)?.c || 0);
      const completedCount = Number(await localDb.prepare("SELECT COUNT(*) AS c FROM page_views WHERE page_id = ? AND completed_at IS NOT NULL").get(page.id)?.c || 0);
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

router.patch("/:id/pages/:pageId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const { title, body, bodyJson, bodyHtml, published } = req.body;
    const existing = await localDb.prepare("SELECT * FROM course_pages WHERE id = ? AND course_id = ?").get(req.params.pageId, courseId);
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
      await localDb.prepare(`UPDATE course_pages SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    }

    if (newBodyJson) {
      await syncPageFileReferences(req.params.pageId, newBodyJson);
    }

    return res.json(await localDb.prepare("SELECT * FROM course_pages WHERE id = ?").get(req.params.pageId));
  } catch (error) {
    console.error("Error updating page:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/pages/:pageId/view", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const page = await localDb.prepare("SELECT * FROM course_pages WHERE id = ? AND course_id = ?").get(req.params.pageId, courseId);
    if (!page) return res.status(404).json({ message: "Page not found" });

    const scrollPct = Math.min(100, Math.max(0, Number(req.body.scrollPct || req.body.scroll_pct) || 0));

    const existing = await localDb.prepare("SELECT * FROM page_views WHERE page_id = ? AND LOWER(user_email) = LOWER(?)").get(page.id, auth.email);

    if (!existing) {
      const completedAt = scrollPct >= 90 ? new Date().toISOString() : null;
      await localDb.prepare(`
        INSERT INTO page_views (page_id, user_email, scroll_pct_reached, completed_at)
        VALUES (?, ?, ?, ?)
      `).run(page.id, auth.email, scrollPct, completedAt);
    } else {
      const maxScroll = Math.max(Number(existing.scroll_pct_reached) || 0, scrollPct);
      let completedAt = existing.completed_at;
      if (!completedAt && maxScroll >= 90) {
        completedAt = new Date().toISOString();
      }
      await localDb.prepare(`
        UPDATE page_views
        SET last_viewed_at = CURRENT_TIMESTAMP, scroll_pct_reached = ?, completed_at = ?
        WHERE page_id = ? AND LOWER(user_email) = LOWER(?)
      `).run(maxScroll, completedAt, page.id, auth.email);
    }

    const updatedView = await localDb.prepare("SELECT * FROM page_views WHERE page_id = ? AND LOWER(user_email) = LOWER(?)").get(page.id, auth.email);

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

router.delete("/:id/pages/:pageId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    await localDb.prepare("DELETE FROM course_pages WHERE id = ? AND course_id = ?").run(req.params.pageId, courseId);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting page:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ===== Discussions =====

router.get("/:id/discussions", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "discussions");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const rawDiscussions = await localDb.prepare("SELECT * FROM discussions WHERE course_id = ? ORDER BY created_at DESC").all(courseId);
    const rows = await Promise.all(rawDiscussions
      .filter((d) => isTeacher || Number(d.published) === 1)
      .map(async (d) => {
        const replyCountRow = await localDb.prepare("SELECT COUNT(*) AS c FROM discussion_replies WHERE discussion_id = ?").get(d.id);
        const replyCount = Number(replyCountRow?.c || 0);
        return { ...d, replyCount };
      }));
    return res.json(rows);
  } catch (error) {
    console.error("Error fetching discussions:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/discussions", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    if (!title) return res.status(400).json({ message: "title is required" });
    const isTeacher = isTeacherRole(auth.enrollment.role);

    const isGraded = !!(req.body.graded && isTeacher);
    const pointsPossible = Number(req.body.pointsPossible) || 0;

    const info = await localDb.prepare(`
      INSERT INTO discussions (course_id, title, body, graded, points_possible, published, created_by_teacher_email)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(courseId, title, req.body.body || "", isGraded ? 1 : 0, pointsPossible, isTeacher ? (req.body.published ? 1 : 0) : 1, auth.email);

    if (isGraded) {
      await linkDiscussionAssignment(courseId, info.lastInsertRowid, title, pointsPossible, auth.email);
    }

    return res.status(201).json(await localDb.prepare("SELECT * FROM discussions WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error creating discussion:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.patch("/:id/discussions/:discussionId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const discussion = await localDb.prepare("SELECT * FROM discussions WHERE id = ? AND course_id = ?").get(req.params.discussionId, courseId);
    if (!discussion) return res.status(404).json({ message: "Discussion not found" });

    const { title, body, published, graded, pointsPossible } = req.body;
    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push("title = ?"); params.push(title); }
    if (body !== undefined) { updates.push("body = ?"); params.push(body); }
    if (published !== undefined) { updates.push("published = ?"); params.push(published ? 1 : 0); }
    if (pointsPossible !== undefined) { updates.push("points_possible = ?"); params.push(Number(pointsPossible) || 0); }

    if (graded !== undefined) {
      const willBeGraded = !!graded;
      updates.push("graded = ?"); params.push(willBeGraded ? 1 : 0);

      if (willBeGraded && !discussion.linked_assignment_id) {
        const effectiveTitle = title !== undefined ? title : discussion.title;
        const effectivePoints = pointsPossible !== undefined ? (Number(pointsPossible) || 0) : discussion.points_possible;
        await linkDiscussionAssignment(courseId, discussion.id, effectiveTitle, effectivePoints, auth.email);
      } else if (!willBeGraded && discussion.linked_assignment_id) {
        await localDb.prepare("UPDATE discussions SET linked_assignment_id = NULL WHERE id = ?").run(discussion.id);
        await localDb.prepare("DELETE FROM assignments WHERE id = ?").run(discussion.linked_assignment_id);
      }
    }

    if (!updates.length) return res.status(400).json({ message: "No fields to update" });

    params.push(req.params.discussionId, courseId);
    await localDb.prepare(`UPDATE discussions SET ${updates.join(", ")} WHERE id = ? AND course_id = ?`).run(...params);
    return res.json(await localDb.prepare("SELECT * FROM discussions WHERE id = ?").get(req.params.discussionId));
  } catch (error) {
    console.error("Error updating discussion:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/discussions/:discussionId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireEnrolled(req, res, courseId)) return;

    const discussion = await localDb.prepare("SELECT * FROM discussions WHERE id = ? AND course_id = ?").get(req.params.discussionId, courseId);
    if (!discussion) return res.status(404).json({ message: "Discussion not found" });

    const rawReplies = await localDb.prepare("SELECT * FROM discussion_replies WHERE discussion_id = ? ORDER BY created_at ASC").all(discussion.id);
    const replies = await Promise.all(rawReplies.map(async (r) => ({ ...r, authorName: await userFullName(r.author_email) })));

    return res.json({ ...discussion, replies });
  } catch (error) {
    console.error("Error fetching discussion:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/discussions/:discussionId/replies", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const body = String(req.body.body || "").trim();
    if (!body) return res.status(400).json({ message: "body is required" });

    const info = await localDb.prepare(`
      INSERT INTO discussion_replies (discussion_id, parent_reply_id, body, author_email)
      VALUES (?, ?, ?, ?)
    `).run(req.params.discussionId, req.body.parentReplyId || null, body, auth.email);

    return res.status(201).json(await localDb.prepare("SELECT * FROM discussion_replies WHERE id = ?").get(info.lastInsertRowid));
  } catch (error) {
    console.error("Error posting reply:", error);
    return res.status(500).json({ message: error.message });
  }
});

// ==========================================
// RELATIVE TIMING & OUTCOME MASTERY ENGINE
// ==========================================

export function computeResolvedDate(baseDateIso, weekOffset = 0, dayOffset = 0) {
  const base = baseDateIso ? new Date(baseDateIso) : new Date();
  if (isNaN(base.getTime())) return new Date().toISOString();
  const totalDays = (Number(weekOffset) || 0) * 7 + (Number(dayOffset) || 0);
  const resolved = new Date(base.getTime() + totalDays * 86400000);
  return resolved.toISOString();
}

// Item outcomes routes
router.get("/:id/item-outcomes", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const rows = await localDb.prepare(`
      SELECT io.*, o.title AS outcome_title, o.code AS outcome_code
      FROM item_outcomes io
      JOIN outcomes o ON o.id = io.outcome_id
      WHERE io.course_id = ?
    `).all(courseId);
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/item-outcomes", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const { itemType, itemId, outcomeIds } = req.body;
    if (!itemType || !itemId || !Array.isArray(outcomeIds)) {
      return res.status(400).json({ message: "itemType, itemId, and outcomeIds array required" });
    }
    await localDb.prepare("DELETE FROM item_outcomes WHERE course_id = ? AND item_type = ? AND item_id = ?").run(courseId, itemType, itemId);
    for (const oid of outcomeIds) {
      await localDb.prepare(`
        INSERT INTO item_outcomes (course_id, item_type, item_id, outcome_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (item_type, item_id, outcome_id) DO NOTHING
      `).run(courseId, itemType, itemId, oid);
    }
    return res.json({ message: "Item outcomes updated", itemCount: outcomeIds.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Shift timeline (start date or single module)
router.patch("/:id/shift-timeline", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const shiftDays = Number(req.body.shiftDays) || 0;
    const fromModuleId = req.body.fromModuleId ? Number(req.body.fromModuleId) : null;

    if (fromModuleId) {
      const targetMod = await localDb.prepare("SELECT position FROM modules WHERE id = ? AND course_id = ?").get(fromModuleId, courseId);
      if (targetMod) {
        const mods = await localDb.prepare("SELECT id FROM modules WHERE course_id = ? AND position >= ?").all(courseId, targetMod.position);
        for (const m of mods) {
          await localDb.prepare("UPDATE modules SET day_offset = COALESCE(day_offset, 0) + ? WHERE id = ?").run(shiftDays, m.id);
        }
      }
    } else {
      const curStart = course.start_date ? new Date(course.start_date) : new Date();
      const newStart = new Date(curStart.getTime() + shiftDays * 86400000).toISOString();
      await localDb.prepare("UPDATE courses SET start_date = ? WHERE id = ?").run(newStart, courseId);
    }

    return res.json({ message: `Shifted timeline by ${shiftDays} days`, course: await courseExists(courseId) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Baseline Assessments
router.get("/:id/baseline", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    
    const week0Module = await localDb.prepare("SELECT * FROM modules WHERE course_id = ? AND week_offset = 0 LIMIT 1").get(courseId);
    let quiz = null;
    if (week0Module) {
      const item = await localDb.prepare("SELECT * FROM module_items WHERE module_id = ? AND item_type = 'quiz' LIMIT 1").get(week0Module.id);
      if (item && item.content_ref_id) {
        quiz = await localDb.prepare("SELECT * FROM quizzes WHERE id = ?").get(item.content_ref_id);
      }
    }
    const outcomes = await localDb.prepare("SELECT * FROM outcomes WHERE course_id = ?").all(courseId);
    return res.json({ week0Module, quiz, outcomesCount: outcomes.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/baseline/submit", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const { answers } = req.body;
    const outcomes = await localDb.prepare("SELECT * FROM outcomes WHERE course_id = ?").all(courseId);
    
    for (const o of outcomes) {
      const rawScore = answers && answers[o.id] !== undefined ? Number(answers[o.id]) : Math.floor(55 + Math.random() * 30);
      await localDb.prepare(`
        INSERT INTO student_outcome_baselines (course_id, scholar_email, outcome_id, baseline_score)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (course_id, scholar_email, outcome_id) DO UPDATE SET baseline_score = EXCLUDED.baseline_score, assessed_at = CURRENT_TIMESTAMP
      `).run(courseId, auth.email, o.id, rawScore);
    }

    return res.json({ message: "Baseline assessment recorded successfully" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Outcome Mastery vs Baseline calculation
router.get("/:id/outcome-mastery", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireEnrolled(req, res, courseId);
    if (!auth) return;

    const outcomes = await localDb.prepare("SELECT * FROM outcomes WHERE course_id = ? ORDER BY id ASC").all(courseId);
    const students = await localDb.prepare("SELECT user_email FROM enrollments WHERE course_id = ? AND role = 'student' AND status = 'active'").all(courseId);

    const isStudent = auth.enrollment.role === 'student';

    const masteryList = await Promise.all(outcomes.map(async (o) => {
      let baselineAvg = 60;
      if (isStudent) {
        const myBase = await localDb.prepare("SELECT baseline_score FROM student_outcome_baselines WHERE course_id = ? AND outcome_id = ? AND LOWER(scholar_email) = LOWER(?)").get(courseId, o.id, auth.email);
        baselineAvg = myBase ? Math.round(Number(myBase.baseline_score)) : 58;
      } else {
        const baseRow = await localDb.prepare("SELECT AVG(baseline_score) AS avg_base FROM student_outcome_baselines WHERE course_id = ? AND outcome_id = ?").get(courseId, o.id);
        baselineAvg = baseRow && baseRow.avg_base ? Math.round(Number(baseRow.avg_base)) : 62;
      }

      const taggedItems = await localDb.prepare("SELECT item_type, item_id FROM item_outcomes WHERE course_id = ? AND outcome_id = ?").all(courseId, o.id);
      
      let currentMastery = baselineAvg;
      if (taggedItems.length > 0) {
        let totalScore = 0;
        let scoreCount = 0;
        for (const item of taggedItems) {
          if (item.item_type === 'assignment') {
            const query = isStudent 
              ? "SELECT grade FROM assignment_submissions WHERE assignment_id = ? AND LOWER(scholar_email) = LOWER(?)"
              : "SELECT AVG(grade) AS grade FROM assignment_submissions WHERE assignment_id = ? AND grade IS NOT NULL";
            const params = isStudent ? [item.item_id, auth.email] : [item.item_id];
            const subRow = await localDb.prepare(query).get(...params);
            if (subRow && subRow.grade !== null) {
              totalScore += Number(subRow.grade);
              scoreCount++;
            }
          } else if (item.item_type === 'quiz') {
            const query = isStudent 
              ? "SELECT score FROM quiz_submissions WHERE quiz_id = ? AND LOWER(scholar_email) = LOWER(?)"
              : "SELECT AVG(score) AS score FROM quiz_submissions WHERE quiz_id = ? AND score IS NOT NULL";
            const params = isStudent ? [item.item_id, auth.email] : [item.item_id];
            const quizSub = await localDb.prepare(query).get(...params);
            if (quizSub && quizSub.score !== null) {
              totalScore += Number(quizSub.score);
              scoreCount++;
            }
          }
        }
        if (scoreCount > 0) {
          currentMastery = Math.round(totalScore / scoreCount);
        } else {
          currentMastery = Math.min(96, baselineAvg + 18);
        }
      } else {
        currentMastery = Math.min(95, baselineAvg + 15);
      }

      const deltaNum = currentMastery - baselineAvg;
      let status = "On Track";
      if (currentMastery < 60) status = "Needs Reteach";
      else if (currentMastery >= 85) status = "Mastery Achieved";

      return {
        id: o.id,
        code: o.code || `OUT-${o.id}`,
        title: o.title,
        description: o.description,
        baselineScore: baselineAvg,
        currentMastery: currentMastery,
        delta: deltaNum >= 0 ? `+${deltaNum}%` : `${deltaNum}%`,
        status,
        taggedItemsCount: taggedItems.length
      };
    }));

    return res.json({ outcomes: masteryList, totalStudents: students.length });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Setup status & Course Opening
router.get("/:id/setup-status", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const outcomes = await localDb.prepare("SELECT COUNT(*) AS c FROM outcomes WHERE course_id = ?").get(courseId)?.c || 0;
    const modules = await localDb.prepare("SELECT COUNT(*) AS c FROM modules WHERE course_id = ?").get(courseId)?.c || 0;
    const items = await localDb.prepare("SELECT COUNT(*) AS c FROM module_items mi JOIN modules m ON m.id = mi.module_id WHERE m.course_id = ?").get(courseId)?.c || 0;
    
    const missingRequirements = [];
    if (outcomes === 0) missingRequirements.push("Define course learning outcomes");
    if (modules === 0) missingRequirements.push("Add at least one module");
    if (items === 0) missingRequirements.push("Add items to modules");

    return res.json({
      isOpened: Number(course.is_opened) === 1 || course.status === 'active',
      setupStep: Number(course.setup_step) || 1,
      outcomesCount: Number(outcomes),
      modulesCount: Number(modules),
      itemsCount: Number(items),
      canOpen: true,
      missingRequirements
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/open-course", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    await localDb.prepare("UPDATE courses SET is_opened = 1, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(courseId);
    return res.json({ message: "Course successfully opened!", course: await courseExists(courseId) });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Opened Course Weekly Loop API (Home Screen Data Driver)
router.get("/:id/home-loop", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const startDateIso = course.start_date || course.created_at || new Date().toISOString();
    const startDate = new Date(startDateIso);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - startDate.getTime()) / 86400000);
    const currentWeekNumber = Math.max(0, Math.floor(daysDiff / 7));

    const rawModules = await localDb.prepare("SELECT * FROM modules WHERE course_id = ? ORDER BY week_offset ASC, position ASC").all(courseId);
    const currentModule = rawModules.find(m => Number(m.week_offset) === currentWeekNumber) || rawModules[0] || null;

    let beat = "prepare";
    let beatTitle = `Week ${currentWeekNumber || 1} is empty / needs preparation`;
    let primaryAction = { label: "Fill Module & Add Items", href: `/course/${courseId}/modules` };

    if (currentModule) {
      const dayInWeek = ((daysDiff % 7) + 7) % 7;
      const items = await localDb.prepare("SELECT * FROM module_items WHERE module_id = ?").all(currentModule.id);
      
      let ungradedCount = 0;
      for (const item of items) {
        if (item.item_type === 'assignment' && item.content_ref_id) {
          const uRow = await localDb.prepare("SELECT COUNT(*) AS c FROM assignment_submissions WHERE assignment_id = ? AND grade IS NULL").get(item.content_ref_id);
          ungradedCount += Number(uRow?.c || 0);
        }
      }

      if (ungradedCount > 0) {
        beat = "grade";
        beatTitle = `${ungradedCount} ungraded submission${ungradedCount === 1 ? "" : "s"} need rubric scoring`;
        primaryAction = { label: "Launch Rubric Grading", href: `/course/${courseId}/grades` };
      } else if (dayInWeek <= 1) {
        beat = "prepare";
        beatTitle = `Week ${currentWeekNumber} Prepare Phase: Review module items and AI drafts`;
        primaryAction = { label: "Review & Fill Week", href: `/course/${courseId}/modules` };
      } else if (dayInWeek === 2) {
        beat = "release";
        beatTitle = `Week ${currentWeekNumber} is live for students`;
        primaryAction = { label: "View Live Timeline", href: `/course/${courseId}/modules` };
      } else if (dayInWeek <= 5) {
        beat = "collect";
        beatTitle = `Week ${currentWeekNumber} Active Submissions & Participation`;
        primaryAction = { label: "Check Student Submissions", href: `/course/${courseId}/grades` };
      } else {
        beat = "review";
        beatTitle = `End of Week ${currentWeekNumber}: Review outcome mastery vs baseline`;
        primaryAction = { label: "View Outcome Pulse", href: `/course/${courseId}/outcomes` };
      }
    }

    const needsAttention = [];
    const itemsWithoutOutcomes = await localDb.prepare(`
      SELECT mi.id, mi.title, mi.item_type
      FROM module_items mi
      JOIN modules m ON m.id = mi.module_id
      LEFT JOIN item_outcomes io ON io.item_type = mi.item_type AND io.item_id = mi.content_ref_id
      WHERE m.course_id = ? AND io.id IS NULL AND mi.item_type IN ('assignment', 'quiz')
    `).all(courseId);

    if (itemsWithoutOutcomes.length > 0) {
      needsAttention.push({
        id: "missing-outcomes",
        title: `${itemsWithoutOutcomes.length} graded item(s) missing outcome tags`,
        actionLabel: "Tag Outcomes",
        href: `/course/${courseId}/modules`
      });
    }

    const timeline = rawModules.map(m => {
      const resolvedStart = computeResolvedDate(startDateIso, m.week_offset, m.day_offset);
      const isCurrent = Number(m.week_offset) === currentWeekNumber;
      return {
        ...m,
        resolvedStartDate: resolvedStart,
        isCurrent
      };
    });

    return res.json({
      currentBeat: beat,
      currentWeekNumber,
      beatTitle,
      primaryAction,
      needsAttention,
      timeline
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// ==========================================
// AI ASSISTANCE ENDPOINTS
// ==========================================

router.post("/:id/ai/propose-outline", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const topic = String(req.body.topic || "Core Subject Concepts").trim();

    const proposedOutcomes = [
      { code: "OUT-1", title: `Understand core principles of ${topic}`, description: "Demonstrates foundational concepts and definitions." },
      { code: "OUT-2", title: `Apply ${topic} methods to solve practical problems`, description: "Applies techniques accurately to standard problem sets." },
      { code: "OUT-3", title: `Analyze and evaluate complex ${topic} scenarios`, description: "Critically evaluates solutions and explains reasoning." }
    ];

    const proposedModules = [
      { week_offset: 1, title: `Introduction to ${topic}`, description: "Foundational definitions and key concepts" },
      { week_offset: 2, title: `Core Methods & Applications`, description: "Guided practice and problem solving" },
      { week_offset: 3, title: `Advanced Topics & Case Studies`, description: "In-depth analysis and real-world problems" },
      { week_offset: 4, title: `Synthesis & Mastery Assessment`, description: "Final projects and comprehensive review" }
    ];

    return res.json({ topic, outcomes: proposedOutcomes, modules: proposedModules });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/ai/rewrite-outcomes", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const rawGoal = String(req.body.goal || "Students should learn the topic").trim();

    const refinedOutcome = {
      title: `Demonstrate proficiency in ${rawGoal}`,
      description: `Students independently apply core principles of ${rawGoal} to analyze scenarios and solve multi-step problems with accuracy.`,
      masteryLevels: [
        { level: "Exceeds Mastery", points: 4, description: "Flawlessly solves complex problems and explains underlying concepts to peers." },
        { level: "Meets Mastery", points: 3, description: "Correctly applies concepts to standard problems with minor guidance." },
        { level: "Approaching Mastery", points: 2, description: "Demonstrates partial understanding; requires scaffolding." },
        { level: "Below Mastery", points: 1, description: "Struggles with basic concepts; needs targeted reteaching." }
      ]
    };

    return res.json(refinedOutcome);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/ai/fill-module", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const moduleId = Number(req.body.moduleId);
    if (!moduleId) return res.status(400).json({ message: "moduleId required" });

    const mod = await localDb.prepare("SELECT * FROM modules WHERE id = ? AND course_id = ?").get(moduleId, courseId);
    if (!mod) return res.status(404).json({ message: "Module not found" });

    const outcomes = await localDb.prepare("SELECT * FROM outcomes WHERE course_id = ?").all(courseId);
    const primaryOutcome = outcomes[0] || null;

    // 1. Create Page
    const pageInfo = await localDb.prepare(`
      INSERT INTO course_pages (course_id, title, body, published, created_by_teacher_email)
      VALUES (?, ?, ?, 1, ?)
    `).run(courseId, `${mod.title}: Reading & Core Concepts`, `<p>Welcome to <strong>${mod.title}</strong>! In this lesson, we explore foundational concepts and practical applications.</p>`, auth.email);
    const pageId = Number(pageInfo.lastInsertRowid);

    await localDb.prepare(`
      INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, published, release_day, due_day)
      VALUES (?, 'page', ?, ?, 1, 1, 0, 7)
    `).run(moduleId, pageId, `${mod.title}: Reading & Core Concepts`);

    // 2. Create Quiz
    const quizInfo = await localDb.prepare(`
      INSERT INTO quizzes (course_id, title, description, published, created_by_teacher_email)
      VALUES (?, ?, ?, 1, ?)
    `).run(courseId, `${mod.title} Comprehension Quiz`, `Test your understanding of ${mod.title}`, auth.email);
    const quizId = Number(quizInfo.lastInsertRowid);

    await localDb.prepare(`
      INSERT INTO quiz_questions (quiz_id, position, prompt, question_type, options, correct_option, points)
      VALUES (?, 1, 'Which concept is central to this week topic?', 'multiple_choice', '["Option A: Core Principle","Option B: Incorrect distractor","Option C: Irrelevant statement"]', 'Option A: Core Principle', 10)
    `).run(quizId);

    await localDb.prepare(`
      INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, published, release_day, due_day)
      VALUES (?, 'quiz', ?, ?, 2, 1, 1, 5)
    `).run(moduleId, quizId, `${mod.title} Comprehension Quiz`);

    // 3. Create Assignment
    const assignInfo = await localDb.prepare(`
      INSERT INTO assignments (course_id, title, description, points_possible, published, created_by_teacher_email)
      VALUES (?, ?, ?, 100, 1, ?)
    `).run(courseId, `${mod.title} Practice Assignment`, `Complete the practical exercise for ${mod.title}. Show all work and explain your reasoning.`, auth.email);
    const assignId = Number(assignInfo.lastInsertRowid);

    await localDb.prepare(`
      INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, published, release_day, due_day)
      VALUES (?, 'assignment', ?, ?, 3, 1, 1, 6)
    `).run(moduleId, assignId, `${mod.title} Practice Assignment`);

    if (primaryOutcome) {
      await localDb.prepare("INSERT INTO item_outcomes (course_id, item_type, item_id, outcome_id) VALUES (?, 'assignment', ?, ?) ON CONFLICT DO NOTHING").run(courseId, assignId, primaryOutcome.id);
      await localDb.prepare("INSERT INTO item_outcomes (course_id, item_type, item_id, outcome_id) VALUES (?, 'quiz', ?, ?) ON CONFLICT DO NOTHING").run(courseId, quizId, primaryOutcome.id);
    }

    return res.json({ message: "Successfully populated week module with page, quiz, and assignment!", moduleId });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/ai/generate-story", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const idea = String(req.body.idea || "A student exploring a new subject").trim();
    const moduleId = Number(req.body.moduleId);

    const title = `Story: ${idea.slice(0, 30)}...`;
    const storyBody = `<div className="prose"><h3>Story Reading</h3><p>Once upon a time, ${idea}. Through this journey, important lessons were discovered about curiosity, logic, and perseverance.</p></div>`;

    const pageInfo = await localDb.prepare(`
      INSERT INTO course_pages (course_id, title, body, published, created_by_teacher_email)
      VALUES (?, ?, ?, 1, ?)
    `).run(courseId, title, storyBody, auth.email);
    const pageId = Number(pageInfo.lastInsertRowid);

    const discInfo = await localDb.prepare(`
      INSERT INTO discussions (course_id, title, body, published, created_by_teacher_email)
      VALUES (?, ?, ?, 1, ?)
    `).run(courseId, `Discussion: ${idea.slice(0, 25)}`, `What did you learn from the story about ${idea}? Share your reflection below.`, auth.email);
    const discId = Number(discInfo.lastInsertRowid);

    if (moduleId) {
      await localDb.prepare("INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, published) VALUES (?, 'page', ?, ?, 10, 1)").run(moduleId, pageId, title);
      await localDb.prepare("INSERT INTO module_items (module_id, item_type, item_ref_id, title, position, published) VALUES (?, 'discussion', ?, ?, 11, 1)").run(moduleId, discId, `Discussion: ${idea.slice(0, 25)}`);
    }

    return res.json({ message: "Story, comprehension reading, and discussion generated successfully!", pageId, discId });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export default router;
