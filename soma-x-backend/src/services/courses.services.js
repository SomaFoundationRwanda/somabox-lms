// /courses API. Each domain lives in src/services/courses/*.routes.js; shared helpers
// (auth checks, lookups) are in src/services/courses/shared.js.
import express from "express";
import courseRoutes from "./courses/course.routes.js";
import navRoutes from "./courses/nav.routes.js";
import peopleRoutes from "./courses/people.routes.js";
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

const router = express.Router();

// courseRoutes goes first: it defines "/mine" and "/public" ahead of "/:id".
for (const domain of [
  courseRoutes,
  navRoutes,
  peopleRoutes,
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
]) {
  router.use(domain);
}

export default router;
