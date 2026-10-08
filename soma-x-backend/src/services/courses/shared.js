// Helpers shared by the course routers (src/services/courses/*.routes.js).
import multer from "multer";
import { localDb, serverDb, DEFAULT_NAV_ITEMS } from "../../helpers/db-manager.js";

// In-memory uploads (cover images, course files); routes write the files themselves.
export const upload = multer({ storage: multer.memoryStorage() });


export const NAV_KEYS = DEFAULT_NAV_ITEMS.map((item) => item.nav_key);

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export async function generateUniqueCourseCode() {
  let attempts = 0;
  while (attempts < 2000) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const exists = await localDb.prepare("SELECT 1 FROM courses WHERE id = ?").get(code);
    if (!exists) return code;
    attempts += 1;
  }
  throw new Error("Failed to generate a unique course code");
}

export async function getEnrollment(courseId, email) {
  return localDb
    .prepare("SELECT * FROM enrollments WHERE course_id = ? AND LOWER(user_email) = LOWER(?)")
    .get(courseId, email);
}

export function isTeacherRole(role) {
  return role === "teacher" || role === "ta";
}

// The caller is always the session user (req.user, set by the global auth gate).
// Client-sent userEmail/teacherEmail parameters are ignored.
export async function requireTeacher(req, res, courseId) {
  if (!req.user) {
    res.status(401).json({ message: "Please log in to continue" });
    return null;
  }
  const email = req.user.email;
  const enrollment = await getEnrollment(courseId, email);
  if (!enrollment || !isTeacherRole(enrollment.role) || enrollment.status !== "active") {
    res.status(403).json({ message: "Not allowed — teacher/TA role required for this course" });
    return null;
  }
  return { email, enrollment };
}

export async function requireEnrolled(req, res, courseId) {
  if (!req.user) {
    res.status(401).json({ message: "Please log in to continue" });
    return null;
  }
  const email = req.user.email;
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
  // Learners can't see a course while it's still being set up.
  if (!isTeacherRole(enrollment.role)) {
    const course = await localDb.prepare("SELECT lifecycle FROM courses WHERE id = ?").get(courseId);
    if (course?.lifecycle === "draft") {
      res.status(403).json({ message: "This course hasn't opened yet", code: "COURSE_NOT_OPEN" });
      return null;
    }
  }
  return { email, enrollment };
}

// Returns { email, enrollment } or null (having already sent a 403) if a student tries to
// hit a nav section that's been hidden from students — enforced server-side, not just in the UI.
export async function requireNavVisible(req, res, courseId, navKey) {
  const auth = await requireEnrolled(req, res, courseId);
  if (!auth) return null;
  if (isTeacherRole(auth.enrollment.role)) return auth;

  const navItem = await localDb
    .prepare("SELECT visible_to_students FROM course_nav_items WHERE course_id = ? AND nav_key = ?")
    .get(courseId, navKey);
  if (navItem && Number(navItem.visible_to_students) !== 1) {
    res.status(403).json({ message: "This section is not available" });
    return null;
  }
  return auth;
}

// Looks up a module item only if it belongs to the given course (prevents acting on
// another course's items by id).
export async function getCourseModuleItem(courseId, itemId) {
  return await localDb.prepare(`
    SELECT mi.* FROM module_items mi
    JOIN modules m ON m.id = mi.module_id
    WHERE mi.id = ? AND m.course_id = ?
  `).get(itemId, courseId);
}

export async function courseExists(courseId) {
  return await localDb.prepare("SELECT * FROM courses WHERE id = ?").get(courseId);
}

export function normalizeDueAt(value) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// A graded discussion is graded through a linked assignment in the discussion's module.
// It starts unpublished: it's published with its discussion once it has an outcome.
export async function linkDiscussionAssignment(courseId, discussionId, title, pointsPossible, teacherEmail) {
  const discussion = await localDb.prepare("SELECT module_id FROM discussions WHERE id = ? AND course_id = ?").get(discussionId, courseId);
  const info = await localDb.prepare(`
    INSERT INTO assignments (course_id, module_id, title, description, points_possible, published, created_by_teacher_email)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(courseId, discussion.module_id, title, "Graded discussion — see Discussions for the conversation.", pointsPossible || 0, teacherEmail);
  await localDb.prepare("UPDATE discussions SET linked_assignment_id = ? WHERE id = ?").run(info.lastInsertRowid, discussionId);
  return info.lastInsertRowid;
}

export function calculateEstimatedReadMinutes(bodyJson, bodyHtml, bodyText) {
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

export async function syncPageFileReferences(pageId, bodyJson) {
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
    for (const fId of ids) {
      if (fId && !isNaN(fId)) await ins.run(pId, fId);
    }
  });
  await tx(pageId, Array.from(fileIds));
}

export async function scheduleSpacedReview(scholarEmail, topicId, topicTitle) {
  const intervals = [3, 7, 30];
  const exists = await localDb.prepare(`
    SELECT 1 FROM sol_spaced_reviews WHERE LOWER(scholar_email) = LOWER(?) AND topic_id = ? AND interval_days = ?
  `);
  const insert = await localDb.prepare(`
    INSERT INTO sol_spaced_reviews (scholar_email, topic_id, topic_title, interval_days, due_at, status)
    VALUES (?, ?, ?, ?, NOW() + make_interval(days => ?), 'pending')
  `);
  for (const days of intervals) {
    if (!await exists.get(scholarEmail, topicId, days)) {
      await insert.run(scholarEmail, topicId, topicTitle, days, days);
    }
  }
}

export async function userFullName(email) {
  const user = await serverDb.prepare("SELECT full_name FROM users WHERE LOWER(email) = LOWER(?)").get(email);
  return user?.full_name || email;
}


/**
 * An outcome code that's free in the course: `wanted` if given and unused, else the next
 * OUT-n. (The column default used to give every outcome "OUT-1".)
 */
export async function freeOutcomeCode(courseId, wanted = null) {
  const taken = new Set((await localDb.prepare("SELECT LOWER(code) AS code FROM outcomes WHERE course_id = ? AND code IS NOT NULL").all(courseId)).map((r) => r.code));
  const clean = String(wanted || "").trim().slice(0, 40);
  if (clean && !taken.has(clean.toLowerCase())) return clean;
  let n = taken.size + 1;
  while (taken.has(`out-${n}`)) n += 1;
  return `OUT-${n}`;
}
