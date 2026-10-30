// Course groups: who is in which group, and which assignments and discussions are only for
// some groups. An assignment tagged with groups is for their members only; a discussion with
// a group_id is that group's own conversation. Staff see everything.
import { localDb } from "../../helpers/db-manager.js";

export class GroupError extends Error {
  constructor(message) {
    super(message);
    this.name = "GroupError";
  }
}

/** Ids of the course's groups a learner is in. */
export async function learnerGroupIds(courseId, email) {
  const rows = await localDb.prepare(`
    SELECT g.id FROM course_groups g JOIN course_group_members m ON m.group_id = g.id
    WHERE g.course_id = ? AND LOWER(m.user_email) = LOWER(?)
  `).all(courseId, email);
  return new Set(rows.map((r) => Number(r.id)));
}

/**
 * The course's items a learner isn't given because of groups, as "assignment:12" and
 * "discussion:3" keys: assignments tagged only with groups they aren't in, and other groups'
 * discussions.
 */
export async function groupHiddenItems(courseId, email) {
  const mine = await learnerGroupIds(courseId, email);
  const hidden = new Set();
  const tags = await localDb.prepare(`
    SELECT ag.assignment_id, ag.group_id FROM assignment_groups ag JOIN assignments a ON a.id = ag.assignment_id
    WHERE a.course_id = ?
  `).all(courseId);
  const allowed = new Map();
  for (const t of tags) {
    const id = Number(t.assignment_id);
    allowed.set(id, (allowed.get(id) || false) || mine.has(Number(t.group_id)));
  }
  for (const [id, ok] of allowed) if (!ok) hidden.add(`assignment:${id}`);
  const discussions = await localDb.prepare("SELECT id, group_id FROM discussions WHERE course_id = ? AND group_id IS NOT NULL").all(courseId);
  for (const d of discussions) if (!mine.has(Number(d.group_id))) hidden.add(`discussion:${d.id}`);
  return hidden;
}

/** Whether groups keep one assignment or discussion row from this learner. */
export async function hiddenByGroup(courseId, email, itemType, row) {
  if (itemType === "discussion") {
    return row.group_id != null && !(await learnerGroupIds(courseId, email)).has(Number(row.group_id));
  }
  if (itemType !== "assignment") return false;
  const tags = await localDb.prepare("SELECT group_id FROM assignment_groups WHERE assignment_id = ?").all(row.id);
  if (!tags.length) return false;
  const mine = await learnerGroupIds(courseId, email);
  return !tags.some((t) => mine.has(Number(t.group_id)));
}

/**
 * For group work (an assignment with group_submission, given to groups): the group this learner
 * hands in with, as { id, name, members: [lower-cased emails] }; null for individual work.
 */
export async function submissionGroup(assignment, email) {
  if (!assignment?.group_submission) return null;
  const group = await localDb.prepare(`
    SELECT g.id, g.name FROM assignment_groups ag
    JOIN course_groups g ON g.id = ag.group_id
    JOIN course_group_members m ON m.group_id = g.id
    WHERE ag.assignment_id = ? AND LOWER(m.user_email) = LOWER(?)
    ORDER BY LOWER(g.name) LIMIT 1
  `).get(assignment.id, email);
  if (!group) return null;
  const members = await localDb.prepare(`
    SELECT LOWER(m.user_email) AS email FROM course_group_members m
    JOIN enrollments e ON LOWER(e.user_email) = LOWER(m.user_email) AND e.course_id = ? AND e.role = 'student' AND e.status = 'active'
    WHERE m.group_id = ?
  `).all(assignment.course_id, group.id);
  return { id: Number(group.id), name: group.name, members: members.map((m) => m.email) };
}

/** [{ id, name }] of the groups an assignment is for (none: the whole class). */
export async function assignmentGroups(assignmentId) {
  return await localDb.prepare(`
    SELECT g.id, g.name FROM assignment_groups ag JOIN course_groups g ON g.id = ag.group_id
    WHERE ag.assignment_id = ? ORDER BY LOWER(g.name)
  `).all(assignmentId);
}

/** Groups of this course among `ids`; throws GroupError when one isn't. */
async function courseGroupIds(courseId, ids) {
  const wanted = [...new Set((Array.isArray(ids) ? ids : []).map(Number))];
  if (wanted.some((id) => !Number.isInteger(id) || id <= 0)) throw new GroupError("groupIds must be group ids");
  for (const id of wanted) {
    if (!await localDb.prepare("SELECT 1 FROM course_groups WHERE id = ? AND course_id = ?").get(id, courseId)) {
      throw new GroupError("A group isn't in this course");
    }
  }
  return wanted;
}

/** Replaces the groups an assignment is for ([] gives it to the whole class). */
export async function setAssignmentGroups(courseId, assignmentId, groupIds) {
  const ids = await courseGroupIds(courseId, groupIds);
  await localDb.prepare("DELETE FROM assignment_groups WHERE assignment_id = ?").run(assignmentId);
  for (const id of ids) {
    await localDb.prepare("INSERT INTO assignment_groups (assignment_id, group_id) VALUES (?, ?)").run(assignmentId, id);
  }
}

/** A discussion's group, checked: a group of the course (that the poster is in, unless staff), or null. */
export async function discussionGroupId(courseId, groupId, { email, isStaff }) {
  if (groupId == null || groupId === "") return null;
  const [id] = await courseGroupIds(courseId, [groupId]);
  if (!isStaff && !(await learnerGroupIds(courseId, email)).has(id)) throw new GroupError("You can only start discussions in your own groups");
  return id;
}
