// Course groups: teachers make groups of enrolled learners; learners see the groups they're in.
// Which assignments and discussions are for which groups is in groups.js.
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import { courseExists, isTeacherRole, requireNavVisible, requireTeacher, userFullName } from "./shared.js";
import { learnerGroupIds } from "./groups.js";
import { deleteContent } from "./items.js";

const router = express.Router();

// The course's active learners among `emails` (lower-cased); a 400 message when one isn't.
async function checkMembers(courseId, emails) {
  if (emails === undefined) return { members: undefined };
  if (!Array.isArray(emails)) return { error: "memberEmails must be a list" };
  const members = [...new Set(emails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
  for (const email of members) {
    const row = await localDb.prepare(`
      SELECT 1 FROM enrollments WHERE course_id = ? AND LOWER(user_email) = ? AND role = 'student' AND status = 'active'
    `).get(courseId, email);
    if (!row) return { error: "Only learners enrolled in this course can be in its groups" };
  }
  return { members };
}

async function setMembers(groupId, members) {
  await localDb.prepare("DELETE FROM course_group_members WHERE group_id = ?").run(groupId);
  for (const email of members) {
    await localDb.prepare("INSERT INTO course_group_members (group_id, user_email) VALUES (?, ?)").run(groupId, email);
  }
}

// One group as a screen shows it. Staff also get members' emails and the group's work.
async function groupPayload(group, { staff }) {
  const memberRows = await localDb.prepare("SELECT user_email FROM course_group_members WHERE group_id = ? ORDER BY user_email").all(group.id);
  const members = await Promise.all(memberRows.map(async (m) => ({
    ...(staff ? { email: m.user_email } : {}),
    fullName: await userFullName(m.user_email),
  })));
  members.sort((a, b) => String(a.fullName || a.email).localeCompare(String(b.fullName || b.email)));
  const assignments = await localDb.prepare(`
    SELECT a.id, a.title FROM assignment_groups ag JOIN assignments a ON a.id = ag.assignment_id
    WHERE ag.group_id = ? ORDER BY a.title
  `).all(group.id);
  const discussions = await localDb.prepare("SELECT id, title FROM discussions WHERE group_id = ? ORDER BY created_at DESC").all(group.id);
  return {
    id: group.id,
    name: group.name,
    members,
    // Learners see the published work only (the lists below are links).
    assignments: staff ? assignments : (await Promise.all(assignments.map(async (a) => (
      Number((await localDb.prepare("SELECT published FROM assignments WHERE id = ?").get(a.id))?.published) === 1 ? a : null
    )))).filter(Boolean),
    discussions: staff ? discussions : (await Promise.all(discussions.map(async (d) => (
      Number((await localDb.prepare("SELECT published FROM discussions WHERE id = ?").get(d.id))?.published) === 1 ? d : null
    )))).filter(Boolean),
  };
}

router.get("/:id/groups", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    const auth = await requireNavVisible(req, res, courseId, "groups");
    if (!auth) return;
    const staff = isTeacherRole(auth.enrollment.role) || !!auth.enrollment.adminView;
    const groups = await localDb.prepare("SELECT * FROM course_groups WHERE course_id = ? ORDER BY LOWER(name)").all(courseId);
    const mine = staff ? null : await learnerGroupIds(courseId, auth.email);
    const shown = groups.filter((g) => staff || mine.has(Number(g.id)));
    return res.json({ role: staff ? "teacher" : "student", groups: await Promise.all(shown.map((g) => groupPayload(g, { staff }))) });
  } catch (error) {
    console.error("Error fetching groups:", error);
    return res.status(500).json({ message: error.message });
  }
});

// { name, memberEmails? }
router.post("/:id/groups", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ message: "Give the group a name" });
    const { members = [], error } = await checkMembers(courseId, req.body?.memberEmails);
    if (error) return res.status(400).json({ message: error });
    if (await localDb.prepare("SELECT 1 FROM course_groups WHERE course_id = ? AND LOWER(name) = LOWER(?)").get(courseId, name)) {
      return res.status(409).json({ message: "This subject already has a group with that name", code: "NAME_TAKEN" });
    }
    const group = await localDb.transaction(async () => {
      const row = await localDb.prepare("INSERT INTO course_groups (course_id, name, created_by) VALUES (?, ?, ?) RETURNING *").get(courseId, name, auth.email);
      await setMembers(row.id, members);
      return row;
    })();
    return res.status(201).json(await groupPayload(group, { staff: true }));
  } catch (error) {
    console.error("Error creating group:", error);
    return res.status(500).json({ message: error.message });
  }
});

// { name?, memberEmails? } (memberEmails replaces the members)
router.patch("/:id/groups/:groupId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const group = await localDb.prepare("SELECT * FROM course_groups WHERE id = ? AND course_id = ?").get(req.params.groupId, courseId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    const name = req.body?.name === undefined ? undefined : String(req.body.name || "").trim();
    if (name === "") return res.status(400).json({ message: "Give the group a name" });
    const { members, error } = await checkMembers(courseId, req.body?.memberEmails);
    if (error) return res.status(400).json({ message: error });
    if (name && await localDb.prepare("SELECT 1 FROM course_groups WHERE course_id = ? AND LOWER(name) = LOWER(?) AND id <> ?").get(courseId, name, group.id)) {
      return res.status(409).json({ message: "This subject already has a group with that name", code: "NAME_TAKEN" });
    }
    await localDb.transaction(async () => {
      if (name) await localDb.prepare("UPDATE course_groups SET name = ? WHERE id = ?").run(name, group.id);
      if (members) await setMembers(group.id, members);
    })();
    const row = await localDb.prepare("SELECT * FROM course_groups WHERE id = ?").get(group.id);
    return res.json(await groupPayload(row, { staff: true }));
  } catch (error) {
    console.error("Error updating group:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Deleting a group deletes its discussions; assignments it was given to go back to the whole class
// unless they were also given to another group.
router.delete("/:id/groups/:groupId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Subject not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const group = await localDb.prepare("SELECT id FROM course_groups WHERE id = ? AND course_id = ?").get(req.params.groupId, courseId);
    if (!group) return res.status(404).json({ message: "Group not found" });
    const discussions = await localDb.prepare("SELECT id FROM discussions WHERE group_id = ?").all(group.id);
    for (const d of discussions) await deleteContent(courseId, "discussion", d.id);
    await localDb.prepare("DELETE FROM course_groups WHERE id = ?").run(group.id);
    return res.status(204).end();
  } catch (error) {
    console.error("Error deleting group:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
