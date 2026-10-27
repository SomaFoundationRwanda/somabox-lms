// Helpers shared by the course routers (src/services/courses/*.routes.js).
import multer from "multer";
import { localDb, serverDb, DEFAULT_NAV_ITEMS } from "../../helpers/db-manager.js";
import { publishCourse } from "../../helpers/live.js";

// Changes that don't alter what the course's members see: no live update for them.
const QUIET_PATHS = [/\/ai\/jobs/, /\/reset-password$/, /\/learner-search$/];

/**
 * Once a change to the course succeeds, the browsers showing it are told (helpers/live.js):
 * a teacher's change reaches everyone in the course, a learner's work reaches the teachers.
 */
function announceWhenDone(req, res, courseId, kind) {
  if (req.method === "GET" || req.method === "HEAD" || QUIET_PATHS.some((re) => re.test(req.path))) return;
  res.on("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 300) publishCourse(kind, courseId);
  });
}

// In-memory uploads (cover images, course files); routes write the files themselves.
export const upload = multer({ storage: multer.memoryStorage() });


export const NAV_KEYS = DEFAULT_NAV_ITEMS.map((item) => item.nav_key);

// Sections only the course's staff ever see: a teacher can't show them to learners or observers.
// (Learners see their progress on My progress, and each assignment's rubric on the assignment.)
export const STAFF_ONLY_NAV = ["settings", "insights", "rubrics"];

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
  announceWhenDone(req, res, courseId, "course");
  return { email, enrollment };
}

/**
 * The course's own teachers only (not assistants): for what changes the course itself — its
 * settings, navigation, dates and timeline, opening it, its join code, deleting it — and for
 * giving learners new passwords. Assistants teach, grade, take attendance and post.
 */
export async function requireCourseTeacher(req, res, courseId) {
  const auth = await requireTeacher(req, res, courseId);
  if (!auth) return null;
  if (auth.enrollment.role !== "teacher") {
    res.status(403).json({ message: "Only the course's teacher can do this", code: "TEACHER_ONLY" });
    return null;
  }
  return auth;
}

/** True when the reader may only look: observers, and admins reading a course they're not in. */
export function isReadOnly(enrollment) {
  return enrollment?.role === "observer" || Boolean(enrollment?.adminView);
}

// For handing in work, taking quizzes and replying: enrolled, but not an observer (observers only
// look; work they handed in could never be graded).
export async function requireParticipant(req, res, courseId) {
  const auth = await requireEnrolled(req, res, courseId);
  if (!auth) return null;
  if (auth.enrollment.role === "observer") {
    res.status(403).json({ message: "Observers can view this course but can't hand in work or reply", code: "OBSERVER" });
    return null;
  }
  // A closed (or archived) course can still be read, but learners can't hand in anything new.
  if (!isTeacherRole(auth.enrollment.role)) {
    const course = await localDb.prepare("SELECT lifecycle FROM courses WHERE id = ?").get(courseId);
    if (course?.lifecycle === "closed" || course?.lifecycle === "archived") {
      res.status(409).json({ message: "This course has ended, so work can't be handed in any more", code: "COURSE_CLOSED" });
      return null;
    }
  }
  announceWhenDone(req, res, courseId, isTeacherRole(auth.enrollment.role) ? "course" : "course-work");
  return auth;
}

/**
 * Anyone who may read the course: its active members, and admins. An admin who isn't a member
 * reads it as an observer (enrollment.adminView): they see everything, change nothing, hand in
 * nothing. Teacher-only routes use requireTeacher, which admins don't pass on that basis.
 */
export async function requireEnrolled(req, res, courseId) {
  if (!req.user) {
    res.status(401).json({ message: "Please log in to continue" });
    return null;
  }
  const email = req.user.email;
  const enrollment = await getEnrollment(courseId, email);
  if (!enrollment || enrollment.status !== "active") {
    if (req.user.role === "admin") {
      return { email, enrollment: { course_id: courseId, user_email: email, role: "observer", status: "active", adminView: true } };
    }
    res.status(403).json({ message: "Not enrolled in this course" });
    return null;
  }
  // Learners can't see a course while it's still being set up.
  if (!isTeacherRole(enrollment.role) && req.user.role !== "admin") {
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
  if (STAFF_ONLY_NAV.includes(navKey)) {
    res.status(403).json({ message: "This section is not available" });
    return null;
  }

  const navItem = await localDb
    .prepare("SELECT visible_to_students FROM course_nav_items WHERE course_id = ? AND nav_key = ?")
    .get(courseId, navKey);
  if (navItem && Number(navItem.visible_to_students) !== 1) {
    res.status(403).json({ message: "This section is not available" });
    return null;
  }
  return auth;
}

/**
 * True when this item must stay out of sight for the reader: a learner or observer, and the item
 * is unpublished, or listed in a week (or as a week item) that isn't published. Staff, and admins
 * reading the course, see everything. itemType: page | assignment | quiz | discussion.
 */
export async function hiddenFromReader(enrollment, courseId, itemType, row) {
  if (isTeacherRole(enrollment?.role) || enrollment?.adminView) return false;
  if (Number(row.published) !== 1) return true;
  const listings = await localDb.prepare(`
    SELECT mi.published AS item_published, m.published AS module_published
    FROM module_items mi JOIN modules m ON m.id = mi.module_id
    WHERE mi.item_type = ? AND mi.content_id = ? AND m.course_id = ?
  `).all(itemType, row.id, courseId);
  return listings.length > 0 && listings.every((l) => Number(l.item_published) !== 1 || Number(l.module_published) !== 1);
}

/** The rows of one item type that the reader may see (see hiddenFromReader). */
export async function visibleToReader(enrollment, courseId, itemType, rows) {
  const out = [];
  for (const row of rows) if (!await hiddenFromReader(enrollment, courseId, itemType, row)) out.push(row);
  return out;
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
    const ins = await localDb.prepare("INSERT INTO page_file_references (page_id, file_id) VALUES (?, ?) ON CONFLICT DO NOTHING");
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
