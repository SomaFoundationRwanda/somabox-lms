// /courses API. Each domain lives in src/services/courses/*.routes.js; shared helpers
// (auth checks, lookups) are in src/services/courses/shared.js.
import express from "express";
import courseRoutes from "./courses/course.routes.js";
import navRoutes from "./courses/nav.routes.js";
import peopleRoutes from "./courses/people.routes.js";
import learnerRoutes from "./courses/learners.routes.js";
import moduleRoutes from "./courses/modules.routes.js";
import assessmentRoutes from "./courses/assessments.routes.js";
import gradeRoutes from "./courses/grades.routes.js";
import contentRoutes from "./courses/content.routes.js";
import outcomeRoutes from "./courses/outcomes.routes.js";
import timelineRoutes from "./courses/timeline.routes.js";
import aiRoutes from "./courses/ai.routes.js";
import calendarRoutes from "./courses/calendar.routes.js";
import baselineRoutes from "./courses/baseline.routes.js";
import insightsRoutes from "./courses/insights.routes.js";
import bundleRoutes from "./courses/bundle.routes.js";
import attendanceRoutes from "./courses/attendance.routes.js";
import groupRoutes from "./courses/groups.routes.js";
import { announceVisible } from "./courses/notify.js";

const router = express.Router();

// After a change to a course succeeds, tell learners about work and discussions they can now see
// (publishing an item or a week, editing...). Each item is told once (courses/notify.js). One
// check at a time, after the response, so a burst of edits doesn't tie up database connections.
let announcing = Promise.resolve();
router.use("/:id", (req, res, next) => {
  if (req.method !== "GET") {
    const courseId = String(req.params.id);
    res.on("finish", () => {
      if (res.statusCode >= 400) return;
      announcing = announcing
        .then(() => announceVisible(courseId))
        .catch((err) => console.error("Announcing new work failed:", err));
    });
  }
  next();
});

// courseRoutes goes first: it defines "/mine" and "/public" ahead of "/:id".
for (const domain of [
  courseRoutes,
  navRoutes,
  peopleRoutes,
  learnerRoutes,
  moduleRoutes,
  assessmentRoutes,
  gradeRoutes,
  contentRoutes,
  outcomeRoutes,
  baselineRoutes,
  timelineRoutes,
  calendarRoutes,
  aiRoutes,
  insightsRoutes,
  bundleRoutes,
  attendanceRoutes,
  groupRoutes,
]) {
  router.use(domain);
}

export default router;
