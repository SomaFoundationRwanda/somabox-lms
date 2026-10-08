// Export a course as a bundle (structure and content with relative days; no learner data).
import express from "express";
import { courseExists, requireTeacher } from "./shared.js";
import { sendItemError } from "./items.js";
import { exportBundle } from "../bundles/bundle.js";

const router = express.Router();

router.get("/:id/bundle", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;
    const { bundle } = await exportBundle(courseId, req.user.email);
    const name = `${bundle.course.title.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "course"}-v${bundle.version}.somabox.json`;
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    return res.json(bundle);
  } catch (error) {
    if (sendItemError(res, error)) return;
    console.error("Error exporting bundle:", error);
    return res.status(500).json({ message: error.message });
  }
});

export default router;
