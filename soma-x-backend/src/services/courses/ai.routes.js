// Template-based AI stubs (to be replaced by the real gateway in Phase 8).
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import {
  requireTeacher,
  courseExists,
} from "./shared.js";
import { createModuleContent, sendItemError } from "./items.js";

const router = express.Router();

// ==========================================
// AI ASSISTANCE ENDPOINTS
// ==========================================

router.post("/:id/ai/propose-outline", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const topic = String(req.body.topic || "Core Subject Concepts").trim();

    const proposedOutcomes = [
      { code: "OUT-1", title: `Understand core principles of ${topic}`, description: "Demonstrates foundational concepts and definitions." },
      { code: "OUT-2", title: `Apply ${topic} methods to solve practical problems`, description: "Applies techniques accurately to standard problem sets." },
      { code: "OUT-3", title: `Analyze and evaluate complex ${topic} scenarios`, description: "Critically evaluates solutions and explains reasoning." }
    ];

    const proposedModules = [
      { week_offset: 1, title: `Introduction to ${topic}`, description: "Foundational definitions and key concepts" },
      { week_offset: 2, title: `Core Methods & Applications`, description: "Guided practice and problem solving" },
      { week_offset: 3, title: `Advanced Topics & Case Studies`, description: "In-depth analysis and real-world problems" },
      { week_offset: 4, title: `Synthesis & Mastery Assessment`, description: "Final projects and comprehensive review" }
    ];

    return res.json({ topic, outcomes: proposedOutcomes, modules: proposedModules });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/ai/rewrite-outcomes", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    if (!await requireTeacher(req, res, courseId)) return;

    const rawGoal = String(req.body.goal || "Students should learn the topic").trim();

    const refinedOutcome = {
      title: `Demonstrate proficiency in ${rawGoal}`,
      description: `Students independently apply core principles of ${rawGoal} to analyze scenarios and solve multi-step problems with accuracy.`,
      masteryLevels: [
        { level: "Exceeds Mastery", points: 4, description: "Flawlessly solves complex problems and explains underlying concepts to peers." },
        { level: "Meets Mastery", points: 3, description: "Correctly applies concepts to standard problems with minor guidance." },
        { level: "Approaching Mastery", points: 2, description: "Demonstrates partial understanding; requires scaffolding." },
        { level: "Below Mastery", points: 1, description: "Struggles with basic concepts; needs targeted reteaching." }
      ]
    };

    return res.json(refinedOutcome);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

router.post("/:id/ai/fill-module", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const moduleId = Number(req.body.moduleId);
    if (!moduleId) return res.status(400).json({ message: "moduleId required" });

    const mod = await localDb.prepare("SELECT * FROM modules WHERE id = ? AND course_id = ?").get(moduleId, courseId);
    if (!mod) return res.status(404).json({ message: "Module not found" });

    const primaryOutcome = await localDb.prepare("SELECT id FROM outcomes WHERE course_id = ? ORDER BY id LIMIT 1").get(courseId);
    const outcomeIds = primaryOutcome ? [primaryOutcome.id] : [];
    const draft = { courseId, moduleId: mod.id, actorEmail: auth.email, publish: false };

    await localDb.transaction(async () => {
      await createModuleContent({ ...draft, itemType: "page", data: {
        title: `${mod.title}: Reading & Core Concepts`,
        body: `<p>Welcome to <strong>${escapeHtml(mod.title)}</strong>! In this lesson, we explore foundational concepts and practical applications.</p>`,
      } });
      await createModuleContent({ ...draft, itemType: "quiz", data: {
        title: `${mod.title} Comprehension Quiz`,
        description: `Test your understanding of ${mod.title}`,
        outcomeIds,
        questions: [{
          prompt: "Which concept is central to this week topic?",
          options: ["Option A: Core Principle", "Option B: Incorrect distractor", "Option C: Irrelevant statement"],
          correctOption: "Option A: Core Principle",
          points: 10,
          outcomeId: primaryOutcome?.id,
        }],
      } });
      await createModuleContent({ ...draft, itemType: "assignment", data: {
        title: `${mod.title} Practice Assignment`,
        description: `Complete the practical exercise for ${mod.title}. Show all work and explain your reasoning.`,
        pointsPossible: 100,
        outcomeIds,
      } });
    })();

    return res.json({ message: "Draft page, quiz, and assignment added to the module. They are unpublished: review and edit them before publishing.", moduleId });
  } catch (error) {
    if (sendItemError(res, error)) return;
    return res.status(500).json({ message: error.message });
  }
});

router.post("/:id/ai/generate-story", async (req, res) => {
  try {
    const courseId = String(req.params.id || "").trim();
    if (!await courseExists(courseId)) return res.status(404).json({ message: "Course not found" });
    const auth = await requireTeacher(req, res, courseId);
    if (!auth) return;

    const idea = String(req.body.idea || "A student exploring a new subject").trim();
    const moduleId = Number(req.body.moduleId);
    if (!moduleId) return res.status(400).json({ message: "Choose the module the story belongs to (moduleId)" });
    const mod = await localDb.prepare("SELECT id FROM modules WHERE id = ? AND course_id = ?").get(moduleId, courseId);
    if (!mod) return res.status(404).json({ message: "Module not found" });

    const safeIdea = escapeHtml(idea);
    const title = `Story: ${idea.slice(0, 30)}...`;
    const storyBody = `<div class="prose"><h3>Story Reading</h3><p>Once upon a time, ${safeIdea}. Through this journey, important lessons were discovered about curiosity, logic, and perseverance.</p></div>`;
    const draft = { courseId, moduleId: mod.id, actorEmail: auth.email, publish: false };

    const [page, discussion] = await localDb.transaction(async () => [
      await createModuleContent({ ...draft, itemType: "page", data: { title, body: storyBody } }),
      await createModuleContent({ ...draft, itemType: "discussion", data: {
        title: `Discussion: ${idea.slice(0, 25)}`,
        body: `What did you learn from the story about ${safeIdea}? Share your reflection below.`,
      } }),
    ])();

    return res.json({ message: "Draft story page and discussion created. They are unpublished: review and edit them before publishing.", pageId: page.contentId, discId: discussion.contentId });
  } catch (error) {
    if (sendItemError(res, error)) return;
    return res.status(500).json({ message: error.message });
  }
});

export default router;
