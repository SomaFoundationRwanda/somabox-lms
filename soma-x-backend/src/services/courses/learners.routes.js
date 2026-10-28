// Teachers managing the learners of their course: finding learners who already have an account
// (by name or learner code), creating accounts for new ones (pupils usually have no email), and
// giving a learner of their course a new temporary password. The accounts belong to the school:
// admins see and manage them, and they stay when a teacher takes someone off a course.
//
// Temporary passwords are made here and returned once, for the teacher's class sheet. The
// learner must choose their own at first sign-in. Creating accounts and resetting passwords
// are written to the audit log under the teacher's email.
import crypto from "crypto";
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import { revokeUserSessions } from "../../helpers/auth.js";
import { hashPassword, logAdminAuditAction } from "../users.service.js";
import { applySchoolToUser, assignLearnerCode } from "../school.js";
import { courseExists, requireTeacher,
  requireCourseTeacher, teachesLearnersClass } from "./shared.js";
import { LEARNER_EMAIL_DOMAIN } from "../../helpers/identity.js";
import { membershipChanged } from "../../helpers/live.js";
import { notifyAddedToCourse } from "./notify.js";
import { classLevel, learnerClasses, placeInClass, sameClass } from "./classes.js";

const router = express.Router();


// Easy to read aloud and copy from paper: no 0/o, 1/l/i.
const LETTERS = "abcdefghjkmnpqrstuvwxyz";
export function temporaryPassword() {
  const bytes = crypto.randomBytes(8);
  const letters = Array.from(bytes.subarray(0, 4), (b) => LETTERS[b % LETTERS.length]).join("");
  const digits = Array.from(bytes.subarray(4), (b) => String(b % 10)).join("");
  return `${letters}-${digits}`;
}

const MAX_BATCH = 100;
const cleanName = (name) => String(name || "").replace(/\s+/g, " ").trim().slice(0, 200);

async function learnersNamed(name, courseId) {
  const rows = await localDb.prepare(`
    SELECT u.id, u.full_name, u.learner_code, u.grade_level,
           EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = ? AND LOWER(e.user_email) = LOWER(u.email) AND e.status = 'active') AS in_course
    FROM users u
    WHERE u.role = 'scholar' AND LOWER(TRIM(u.full_name)) = LOWER(?)
    ORDER BY u.learner_code
  `).all(courseId, name);
  return rows.map(publicLearner);
}

const publicLearner = (u) => ({
  id: u.id,
  fullName: u.full_name || "",
  learnerCode: u.learner_code || null,
  grade: u.grade_level || null,
  inCourse: u.in_course === true || Number(u.in_course) === 1,
});

// placeClass: false for an account just made with the class the teacher chose (it keeps that
// class only); an existing learner added to the course also gets the course's class.
async function enrollLearner(courseId, email, { placeClass = true } = {}) {
  const before = await localDb.prepare("SELECT status FROM enrollments WHERE course_id = ? AND LOWER(user_email) = LOWER(?)").get(courseId, email);
  if (before?.status !== "active") await notifyAddedToCourse(courseId, email, "student");
  if (placeClass) await placeInClass(courseId, email);
  await localDb.prepare(`
    INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'student', 'active')
    ON CONFLICT (course_id, user_email) DO UPDATE SET status = 'active'
  `).run(courseId, email);
}

// Learners the teacher is likely to add, without knowing their code: those of the course's class
// (own or annex), then those at the same level (S1A when the course is S1B). Not those already
// in the course. { course: { grade }, sameClass: [...], sameLevel: [...] }.
router.get("/:id/learner-suggestions", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    const course = await courseExists(courseId);
    if (!course) return res.status(404).json({ message: "Subject not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    if (!course.grade) return res.json({ course: { grade: null }, sameClass: [], sameLevel: [] });
    const rows = await localDb.prepare(`
      SELECT u.id, u.full_name, u.learner_code, u.grade_level, u.annex_classes FROM users u
      WHERE u.role = 'scholar' AND u.is_active = 1
        AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = ? AND LOWER(e.user_email) = LOWER(u.email) AND e.status IN ('active', 'pending'))
      ORDER BY u.full_name, u.learner_code
    `).all(courseId);
    const level = classLevel(course.grade);
    const same = [];
    const near = [];
    for (const u of rows) {
      const classes = learnerClasses(u);
      if (classes.some((c) => sameClass(c, course.grade))) same.push(u);
      else if (level && classes.some((c) => classLevel(c) === level)) near.push(u);
    }
    const shown = (u) => ({ ...publicLearner({ ...u, in_course: false }), annexClasses: u.annex_classes || [] });
    return res.json({ course: { grade: course.grade }, sameClass: same.slice(0, 200).map(shown), sameLevel: near.slice(0, 200).map(shown) });
  } catch (error) {
    console.error("Error suggesting learners:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Learners of the school, by name or learner code (no email addresses), for adding to the course.
router.get("/:id/learner-search", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const q = String(req.query.q || "").trim().toLowerCase();
    if (q.length < 2) return res.json([]);
    const rows = await localDb.prepare(`
      SELECT u.id, u.full_name, u.learner_code, u.grade_level,
             EXISTS (SELECT 1 FROM enrollments e WHERE e.course_id = ? AND LOWER(e.user_email) = LOWER(u.email) AND e.status = 'active') AS in_course
      FROM users u
      WHERE u.role = 'scholar' AND u.is_active = 1
        AND (LOWER(u.full_name) LIKE ? OR LOWER(COALESCE(u.learner_code, '')) LIKE ?)
      ORDER BY u.full_name, u.learner_code
      LIMIT 20
    `).all(courseId, `%${q}%`, `${q}%`);
    return res.json(rows.map(publicLearner));
  } catch (error) {
    console.error("Error searching learners:", error);
    return res.status(500).json({ message: error.message });
  }
});

/**
 * New learner accounts, straight into this course. { names: [..], grade, duplicates, passwordMode }.
 * passwordMode "temporary" (default): they choose their own password at first sign-in;
 * "permanent": the password given here stays theirs. Either way the teacher already knows who they
 * are, so the first-visit questions can wait (profile_deferred).
 * A name that matches an existing learner (same name, any class) is a possible duplicate:
 * - duplicates "ask" (default): nothing is created; 409 lists the matches;
 * - "add": a name with exactly one match adds that learner instead (several: left for the
 *   teacher to pick, in `ambiguous`);
 * - "create": new accounts anyway.
 * 201 { created: [{ id, fullName, grade, learnerCode, temporaryPassword }], added, ambiguous }.
 */
router.post("/:id/learners", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const names = [...new Set((Array.isArray(req.body.names) ? req.body.names : []).map(cleanName).filter(Boolean))];
    const grade = String(req.body.grade || "").trim().slice(0, 50);
    const duplicates = ["ask", "add", "create"].includes(req.body.duplicates) ? req.body.duplicates : "ask";
    const permanent = req.body.passwordMode === "permanent";
    if (!names.length) return res.status(400).json({ message: "Write at least one learner's name" });
    if (names.length > MAX_BATCH) return res.status(400).json({ message: `Add at most ${MAX_BATCH} learners at a time` });
    if (!grade) return res.status(400).json({ message: "Choose the learners' class" });

    const matches = [];
    for (const name of names) {
      const found = await learnersNamed(name, courseId);
      if (found.length) matches.push({ name, matches: found });
    }
    if (matches.length && duplicates === "ask") {
      return res.status(409).json({ message: "Some of these learners may already have an account", code: "POSSIBLE_DUPLICATES", duplicates: matches });
    }

    const matched = new Map(matches.map((m) => [m.name, m.matches]));
    const created = [];
    const added = [];
    const ambiguous = [];
    for (const name of names) {
      const existing = matched.get(name);
      if (existing && duplicates === "add") {
        if (existing.length === 1) {
          const account = await localDb.prepare("SELECT email FROM users WHERE id = ?").get(existing[0].id);
          await enrollLearner(courseId, account.email);
          added.push(existing[0]);
        } else {
          ambiguous.push({ name, matches: existing });
        }
        continue;
      }
      const password = temporaryPassword();
      const hash = await hashPassword(password);
      const learner = await localDb.transaction(async () => {
        const row = await localDb.prepare(`
          INSERT INTO users (email, full_name, password_hash, role, grade_level, must_change_password, profile_deferred)
          VALUES (?, ?, ?, 'scholar', ?, ?, true) RETURNING id
        `).get(`pending-${crypto.randomUUID()}@${LEARNER_EMAIL_DOMAIN}`, name, hash, grade, permanent ? 0 : 1);
        await applySchoolToUser(row.id);
        const code = await assignLearnerCode(row.id);
        const email = `${code.toLowerCase()}@${LEARNER_EMAIL_DOMAIN}`;
        await localDb.prepare("UPDATE users SET email = ? WHERE id = ?").run(email, row.id);
        await enrollLearner(courseId, email, { placeClass: false });
        return { id: row.id, code, email };
      })();
      created.push({ id: learner.id, fullName: name, grade, learnerCode: learner.code, temporaryPassword: password, permanent });
      await logAdminAuditAction({
        adminEmail: auth.email,
        action: "TEACHER_CREATE_LEARNER",
        targetUserId: learner.id,
        targetUserEmail: learner.email,
        details: `Created learner ${name} (${learner.code}) in course ${courseId}`,
      });
    }
    if (added.length) {
      const emails = await Promise.all(added.map(async (l) => (await localDb.prepare("SELECT email FROM users WHERE id = ?").get(l.id))?.email));
      membershipChanged(courseId, emails);
    }
    return res.status(201).json({ created, added, ambiguous });
  } catch (error) {
    console.error("Error creating learners:", error);
    return res.status(500).json({ message: error.message });
  }
});

// A new temporary password for a learner of this course (they choose their own at next sign-in).
router.post("/:id/people/:enrollmentId/reset-password", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    const auth = await requireCourseTeacher(req, res, courseId);
    if (!auth) return;
    const learner = await localDb.prepare(`
      SELECT u.id, u.email, u.full_name, u.learner_code, u.role, u.grade_level, u.annex_classes FROM enrollments e
      JOIN users u ON LOWER(u.email) = LOWER(e.user_email)
      WHERE e.id = ? AND e.course_id = ? AND e.role = 'student' AND e.status = 'active'
    `).get(req.params.enrollmentId, courseId);
    if (!learner) return res.status(404).json({ message: "This learner isn't in the subject" });
    // Only learners' passwords: never a teacher's or an admin's, even one enrolled as a student.
    if (learner.role !== "scholar") return res.status(403).json({ message: "Only the school's admin can reset this person's password" });
    if (!teachesLearnersClass(await courseExists(courseId), learner)) {
      return res.status(403).json({ message: "This learner is in another class. Their own class's teacher or the admin can reset it.", code: "OTHER_CLASS" });
    }

    const password = temporaryPassword();
    await localDb.prepare("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?").run(await hashPassword(password), learner.id);
    await revokeUserSessions(learner.id);
    await logAdminAuditAction({
      adminEmail: auth.email,
      action: "TEACHER_RESET_PASSWORD",
      targetUserId: learner.id,
      targetUserEmail: learner.email,
      details: `Reset the password of ${learner.full_name || learner.email} in course ${courseId}`,
    });
    return res.json({ fullName: learner.full_name || "", learnerCode: learner.learner_code || null, temporaryPassword: password });
  } catch (error) {
    console.error("Error resetting a learner's password:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
