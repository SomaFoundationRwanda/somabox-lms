// Per-course navigation (order and student visibility).
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import {
  NAV_KEYS,
  isTeacherRole,
  requireTeacher,
  requireEnrolled,
  courseExists,
} from "./shared.js";

const router = express.Router();

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
      for (const [index, item] of navItems.entries()) {
        if (!NAV_KEYS.includes(item.nav_key)) continue;
        const position = Number.isFinite(item.position) ? item.position : index;
        const visible = item.visible_to_students === false ? 0 : 1;
        await update.run(position, visible, courseId, item.nav_key);
      }
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

export default router;
