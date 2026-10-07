// Who may see whose learning data. Learners: only their own. Teachers (and TAs): learners who
// are active students in a course they actively teach. Admins: everyone.
import { localDb } from "../../helpers/db-manager.js";

/** Lower-cased emails of every learner the teacher teaches, across their active courses. */
export async function taughtLearnerEmails(teacherEmail) {
  const rows = await localDb.prepare(`
    SELECT DISTINCT LOWER(s.user_email) AS email
    FROM enrollments t
    JOIN enrollments s ON s.course_id = t.course_id AND s.role = 'student' AND s.status = 'active'
    WHERE LOWER(t.user_email) = LOWER(?) AND t.role IN ('teacher', 'ta') AND t.status = 'active'
  `).all(teacherEmail);
  return rows.map((r) => r.email);
}

export async function teachesLearner(teacherEmail, learnerEmail) {
  const row = await localDb.prepare(`
    SELECT 1 FROM enrollments t
    JOIN enrollments s ON s.course_id = t.course_id AND s.role = 'student' AND s.status = 'active'
    WHERE LOWER(t.user_email) = LOWER(?) AND t.role IN ('teacher', 'ta') AND t.status = 'active'
      AND LOWER(s.user_email) = LOWER(?)
    LIMIT 1
  `).get(teacherEmail, learnerEmail);
  return !!row;
}

/** True if `user` may see learning data about the learner with `learnerEmail`. */
export async function canViewLearner(user, learnerEmail) {
  const target = String(learnerEmail || "").trim().toLowerCase();
  if (!target) return false;
  if (target === String(user.email).toLowerCase()) return true;
  if (user.role === "admin") return true;
  if (user.role === "teacher" || user.role === "ta") return teachesLearner(user.email, target);
  return false;
}

/**
 * The set of learners a cross-course analytics request covers.
 * - requested email: that learner, if the caller may view them (else { forbidden: true })
 * - none: learners see themselves; teachers their own learners; admins everyone (all: true)
 * Returns { emails: [..] } | { all: true } | { forbidden: true }.
 */
export async function analyticsScope(user, requestedEmail) {
  const requested = String(requestedEmail || "").trim().toLowerCase();
  if (requested) return (await canViewLearner(user, requested)) ? { emails: [requested] } : { forbidden: true };
  if (user.role === "admin") return { all: true };
  if (user.role === "teacher" || user.role === "ta") return { emails: await taughtLearnerEmails(user.email) };
  return { emails: [String(user.email).toLowerCase()] };
}
