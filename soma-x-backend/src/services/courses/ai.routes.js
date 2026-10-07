// Template-based AI stubs (to be replaced by the real gateway in Phase 8).
import express from "express";
import { localDb } from "../../helpers/db-manager.js";
import {
  requireTeacher,
  courseExists,
} from "./shared.js";

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

    const outcomes = await localDb.prepare("SELECT * FROM outcomes WHERE course_id = ?").all(courseId);
    const primaryOutcome = outcomes[0] || null;

    // 1. Create Page
    const pageInfo = await localDb.prepare(`
      INSERT INTO course_pages (course_id, title, body, published, created_by_teacher_email)
      VALUES (?, ?, ?, 0, ?)
    `).run(courseId, `${mod.title}: Reading & Core Concepts`, `<p>Welcome to <strong>${mod.title}</strong>! In this lesson, we explore foundational concepts and practical applications.</p>`, auth.email);
    const pageId = Number(pageInfo.lastInsertRowid);

    await localDb.prepare(`
      INSERT INTO module_items (module_id, item_type, item_ref_id, content_ref_table, content_ref_id, title, position, published, release_day, due_day)
      VALUES (?, 'page', ?, 'course_pages', ?, ?, 1, 0, 0, 7)
    `).run(moduleId, pageId, pageId, `${mod.title}: Reading & Core Concepts`);

    // 2. Create Quiz
    const quizInfo = await localDb.prepare(`
      INSERT INTO quizzes (course_id, title, description, published, created_by_teacher_email)
      VALUES (?, ?, ?, 0, ?)
    `).run(courseId, `${mod.title} Comprehension Quiz`, `Test your understanding of ${mod.title}`, auth.email);
    const quizId = Number(quizInfo.lastInsertRowid);

    await localDb.prepare(`
      INSERT INTO quiz_questions (quiz_id, position, prompt, question_type, options, correct_option, points)
      VALUES (?, 1, 'Which concept is central to this week topic?', 'multiple_choice', '["Option A: Core Principle","Option B: Incorrect distractor","Option C: Irrelevant statement"]', 'Option A: Core Principle', 10)
    `).run(quizId);

    await localDb.prepare(`
      INSERT INTO module_items (module_id, item_type, item_ref_id, content_ref_table, content_ref_id, title, position, published, release_day, due_day)
      VALUES (?, 'quiz', ?, 'quizzes', ?, ?, 2, 0, 1, 5)
    `).run(moduleId, quizId, quizId, `${mod.title} Comprehension Quiz`);

    // 3. Create Assignment
    const assignInfo = await localDb.prepare(`
      INSERT INTO assignments (course_id, title, description, points_possible, published, created_by_teacher_email)
      VALUES (?, ?, ?, 100, 0, ?)
    `).run(courseId, `${mod.title} Practice Assignment`, `Complete the practical exercise for ${mod.title}. Show all work and explain your reasoning.`, auth.email);
    const assignId = Number(assignInfo.lastInsertRowid);

    await localDb.prepare(`
      INSERT INTO module_items (module_id, item_type, item_ref_id, content_ref_table, content_ref_id, title, position, published, release_day, due_day)
      VALUES (?, 'assignment', ?, 'assignments', ?, ?, 3, 0, 1, 6)
    `).run(moduleId, assignId, assignId, `${mod.title} Practice Assignment`);

    if (primaryOutcome) {
      await localDb.prepare("INSERT INTO item_outcomes (course_id, item_type, item_id, outcome_id) VALUES (?, 'assignment', ?, ?) ON CONFLICT DO NOTHING").run(courseId, assignId, primaryOutcome.id);
      await localDb.prepare("INSERT INTO item_outcomes (course_id, item_type, item_id, outcome_id) VALUES (?, 'quiz', ?, ?) ON CONFLICT DO NOTHING").run(courseId, quizId, primaryOutcome.id);
    }

    return res.json({ message: "Draft page, quiz, and assignment added to the module. They are unpublished: review and edit them before publishing.", moduleId });
  } catch (error) {
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
    if (moduleId) {
      const mod = await localDb.prepare("SELECT id FROM modules WHERE id = ? AND course_id = ?").get(moduleId, courseId);
      if (!mod) return res.status(404).json({ message: "Module not found" });
    }

    const safeIdea = idea.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const title = `Story: ${idea.slice(0, 30)}...`;
    const storyBody = `<div class="prose"><h3>Story Reading</h3><p>Once upon a time, ${safeIdea}. Through this journey, important lessons were discovered about curiosity, logic, and perseverance.</p></div>`;

    const pageInfo = await localDb.prepare(`
      INSERT INTO course_pages (course_id, title, body, published, created_by_teacher_email)
      VALUES (?, ?, ?, 0, ?)
    `).run(courseId, title, storyBody, auth.email);
    const pageId = Number(pageInfo.lastInsertRowid);

    const discInfo = await localDb.prepare(`
      INSERT INTO discussions (course_id, title, body, published, created_by_teacher_email)
      VALUES (?, ?, ?, 0, ?)
    `).run(courseId, `Discussion: ${idea.slice(0, 25)}`, `What did you learn from the story about ${safeIdea}? Share your reflection below.`, auth.email);
    const discId = Number(discInfo.lastInsertRowid);

    if (moduleId) {
      await localDb.prepare("INSERT INTO module_items (module_id, item_type, item_ref_id, content_ref_table, content_ref_id, title, position, published) VALUES (?, 'page', ?, 'course_pages', ?, ?, 10, 0)").run(moduleId, pageId, pageId, title);
      await localDb.prepare("INSERT INTO module_items (module_id, item_type, item_ref_id, content_ref_table, content_ref_id, title, position, published) VALUES (?, 'discussion', ?, 'discussions', ?, ?, 11, 0)").run(moduleId, discId, discId, `Discussion: ${idea.slice(0, 25)}`);
    }

    return res.json({ message: "Draft story page and discussion created. They are unpublished: review and edit them before publishing.", pageId, discId });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

export default router;
