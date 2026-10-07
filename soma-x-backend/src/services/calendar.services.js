// Cross-course calendars: "My calendar" for every user, and a school-wide calendar for admins.
import express from "express";
import { isDateString } from "@somabox/timeline";
import { localDb } from "../helpers/db-manager.js";
import { buildIcs } from "../helpers/ics.js";
import { requireRole } from "../helpers/auth.js";
import { courseEvents, icsEvents, loadCourseTimeline, schoolToday } from "./courses/schedule.js";

const router = express.Router();

function range(query) {
  const from = query.from && isDateString(String(query.from)) ? String(query.from) : null;
  const to = query.to && isDateString(String(query.to)) ? String(query.to) : null;
  return { from, to };
}

async function myEvents(user, { from, to }) {
  // Learners see open/closed courses; staff also see their drafts.
  const enrollments = await localDb.prepare(`
    SELECT e.course_id, e.role, c.lifecycle FROM enrollments e JOIN courses c ON c.id = e.course_id
    WHERE LOWER(e.user_email) = LOWER(?) AND e.status = 'active' AND c.lifecycle <> 'archived'
  `).all(user.email);
  const events = [];
  for (const e of enrollments) {
    const isTeacher = e.role === "teacher" || e.role === "ta";
    if (!isTeacher && e.lifecycle === "draft") continue;
    const visible = await localDb.prepare("SELECT visible_to_students FROM course_nav_items WHERE course_id = ? AND nav_key = 'calendar'").get(e.course_id);
    if (!isTeacher && visible && Number(visible.visible_to_students) !== 1) continue;
    const tl = await loadCourseTimeline(e.course_id);
    events.push(...courseEvents(tl, { isTeacher, from, to, types: ["due", "close", "release"] }));
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

router.get("/me", async (req, res) => {
  try {
    return res.json({ today: schoolToday(), events: await myEvents(req.user, range(req.query)) });
  } catch (error) {
    console.error("Error building my calendar:", error);
    return res.status(500).json({ message: error.message });
  }
});

router.get("/me.ics", async (req, res) => {
  try {
    const events = await myEvents(req.user, {});
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="my-calendar.ics"');
    return res.send(buildIcs("My SOMABOX calendar", icsEvents(events)));
  } catch (error) {
    console.error("Error exporting my calendar:", error);
    return res.status(500).json({ message: error.message });
  }
});

// Admins: due dates across every open course in the school.
router.get("/school", requireRole("admin"), async (req, res) => {
  try {
    const { from, to } = range(req.query);
    const courses = await localDb.prepare("SELECT id FROM courses WHERE lifecycle = 'open' ORDER BY title").all();
    const events = [];
    for (const c of courses) {
      const tl = await loadCourseTimeline(c.id);
      events.push(...courseEvents(tl, { isTeacher: false, from, to, types: ["module", "due"] }));
    }
    events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return res.json({ today: schoolToday(), events: events.map((e) => ({ ...e, canReschedule: false })) });
  } catch (error) {
    console.error("Error building school calendar:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
