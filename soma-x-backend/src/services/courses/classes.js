// Learners' classes: their own class (users.grade_level, e.g. "S1B") and annex classes they were
// placed in through a course of another class. Class names are the school's own; "S1B" and
// "s1 b" are the same class, and "S1B" is at level "S1".
import { localDb } from "../../helpers/db-manager.js";

const norm = (v) => String(v || "").replace(/\s+/g, "").toUpperCase();

export const sameClass = (a, b) => !!norm(a) && norm(a) === norm(b);

/** The level of a class: "S1" for "S1B" or "S1 beta-B", "P4" for "P4A"; null when it has none. */
export function classLevel(name) {
  const m = /^([PS])(\d)/.exec(norm(name));
  return m ? `${m[1]}${m[2]}` : null;
}

/** A learner's classes (own first, then annex), as stored. */
export function learnerClasses(user) {
  const annex = Array.isArray(user?.annex_classes) ? user.annex_classes : [];
  return [user?.grade_level, ...annex].filter(Boolean);
}

/**
 * Whether a course's teacher may give this learner (an account of theirs in the course) a new
 * password: only for the course's class, the learner's own or an annex one. A teacher of S1B
 * English can't reset the password of a learner from another class who joined the course.
 * Courses or learners without a class keep the course-only rule.
 */
export function teachesLearnersClass(course, learner) {
  const classes = learnerClasses(learner);
  if (!course?.grade || !classes.length) return true;
  return classes.some((c) => sameClass(c, course.grade));
}

/**
 * Puts a learner who joins a course into its class: as their own class when they have none,
 * else as an annex class (they keep their own). Nothing for a course without a class.
 */
export async function placeInClass(courseId, email) {
  const course = await localDb.prepare("SELECT grade FROM courses WHERE id = ?").get(courseId);
  if (!course?.grade) return;
  const user = await localDb.prepare("SELECT id, role, grade_level, annex_classes FROM users WHERE LOWER(email) = LOWER(?)").get(email);
  if (!user || user.role !== "scholar") return;
  if (!user.grade_level) {
    await localDb.prepare("UPDATE users SET grade_level = ? WHERE id = ?").run(course.grade, user.id);
    return;
  }
  if (learnerClasses(user).some((c) => sameClass(c, course.grade))) return;
  const annex = [...(Array.isArray(user.annex_classes) ? user.annex_classes : []), course.grade];
  await localDb.prepare("UPDATE users SET annex_classes = ?::jsonb WHERE id = ?").run(JSON.stringify(annex), user.id);
}
