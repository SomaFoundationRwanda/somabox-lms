// Course calendar: every dated module and item, drag-to-reschedule for teachers, .ics export.
import express from "express";
import { isDateString } from "@somabox/timeline";
import { localDb } from "../../helpers/db-manager.js";
import { buildIcs } from "../../helpers/ics.js";
import { isTeacherRole, requireTeacher, requireNavVisible, courseExists, getCourseModuleItem } from "./shared.js";
import {
  ScheduleError, courseEvents, dayOffsetFor, icsEvents, loadCourseTimeline, parseItemDays, refreshDueDates,
} from "./schedule.js";

const router = express.Router();

function rangeFrom(query) {
  const from = query.from ? String(query.from) : null;
  const to = query.to ? String(query.to) : null;
  if ((from && !isDateString(from)) || (to && !isDateString(to))) throw new ScheduleError("from and to must look like YYYY-MM-DD");
  return { from, to };
}

router.get("/:id/calendar", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "calendar");
    if (!auth) return;
    const isTeacher = isTeacherRole(auth.enrollment.role);
    const tl = await loadCourseTimeline(courseId);
    return res.json({
      today: tl.today,
      startDate: tl.startDate,
      events: courseEvents(tl, { isTeacher, ...rangeFrom(req.query) }),
    });
  } catch (error) {
    if (error instanceof ScheduleError) return res.status(400).json({ message: error.message });
    console.error("Error building course calendar:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/:id/calendar.ics", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireNavVisible(req, res, courseId, "calendar");
    if (!auth) return;
    const tl = await loadCourseTimeline(courseId);
    const events = courseEvents(tl, { isTeacher: isTeacherRole(auth.enrollment.role) });
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="course-${courseId}.ics"`);
    return res.send(buildIcs(tl.course.title, icsEvents(events)));
  } catch (error) {
    console.error("Error exporting course calendar:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Drag-to-reschedule: { field: 'due' | 'release' | 'close', date: 'YYYY-MM-DD' } becomes
// the matching day offset within the item's module.
router.patch("/:id/calendar/items/:moduleItemId", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const item = await getCourseModuleItem(courseId, req.params.moduleItemId);
    if (!item) return res.status(404).json({ message: "Module item not found" });
    const field = String(req.body.field || "due");
    const key = { release: "releaseDay", due: "dueDay", close: "closeDay" }[field];
    if (!key) return res.status(400).json({ message: "field must be release, due, or close" });

    const tl = await loadCourseTimeline(courseId);
    const mod = tl.modules.find((m) => Number(m.id) === Number(item.module_id));
    const offset = dayOffsetFor(mod?.startDate, req.body.date);
    const days = parseItemDays(item.item_type, { [key]: offset }, item);
    if (field !== "release" && days[`${field}_day`] === null) {
      return res.status(400).json({ message: "This kind of item has no due date" });
    }
    await localDb.prepare("UPDATE module_items SET release_day = ?, due_day = ?, close_day = ? WHERE id = ?")
      .run(days.release_day, days.due_day, days.close_day, item.id);
    await refreshDueDates(courseId);

    const updated = (await loadCourseTimeline(courseId)).items.find((i) => Number(i.id) === Number(item.id));
    return res.json({
      moduleItemId: item.id, releaseDay: days.release_day, dueDay: days.due_day, closeDay: days.close_day,
      releaseDate: updated.releaseDate, dueDate: updated.dueDate, closeDate: updated.closeDate,
    });
  } catch (error) {
    if (error instanceof ScheduleError) return res.status(400).json({ message: error.message });
    console.error("Error rescheduling item:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
