// Structured tasks: each has a JSON schema (enforced by llama.cpp's grammar-constrained
// decoding and checked again here), a prompt template in prompts/structured/<task>.txt,
// a token budget, and a function that renders the LMS-provided context as text.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const promptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../prompts/structured");

const str = (min = 1, max = 2000) => ({ type: "string", minLength: min, maxLength: max });
const obj = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required, additionalProperties: false });
const arr = (items, minItems, maxItems) => ({ type: "array", items, minItems, maxItems });
const outcomeCode = str(1, 40);

const mcQuestion = obj({
  prompt: str(3, 500),
  options: arr(str(1, 200), 2, 5),
  correctIndex: { type: "integer", minimum: 0, maximum: 4 },
  points: { type: "integer", minimum: 1, maximum: 10 },
  outcomeCode,
});

export const TASKS = {
  outline: {
    maxTokens: 1024,
    schema: obj({
      outcomes: arr(obj({ code: str(1, 20), title: str(5, 200), description: str(0, 400) }), 2, 8),
      modules: arr(obj({ week: { type: "integer", minimum: 1, maximum: 52 }, title: str(3, 120), description: str(0, 400) }), 1, 20),
    }),
  },
  outcome_rewrite: {
    maxTokens: 600,
    schema: obj({
      title: str(5, 200),
      description: str(5, 600),
      masteryLevels: arr(obj({ level: str(2, 60), points: { type: "integer", minimum: 1, maximum: 4 }, description: str(5, 300) }), 4, 4),
    }),
  },
  quiz: {
    maxTokens: 1400,
    schema: obj({ title: str(3, 150), questions: arr(mcQuestion, 1, 15) }),
  },
  rubric: {
    maxTokens: 900,
    schema: obj({ criteria: arr(obj({ title: str(2, 120), description: str(5, 400), points: { type: "integer", minimum: 1, maximum: 20 }, outcomeCode }), 2, 8) }),
  },
  story: {
    maxTokens: 1600,
    schema: obj({
      title: str(3, 150),
      paragraphs: arr(str(20, 1500), 2, 8),
      questions: arr(mcQuestion, 2, 6),
      discussionPrompt: str(10, 500),
    }),
  },
  page: {
    maxTokens: 1200,
    schema: obj({ title: str(3, 150), sections: arr(obj({ heading: str(2, 120), body: str(20, 2000) }), 1, 8) }),
  },
  assignment: {
    maxTokens: 700,
    schema: obj({ title: str(3, 150), instructions: str(20, 2000), pointsPossible: { type: "integer", minimum: 1, maximum: 100 }, outcomeCode }),
  },
  grading_suggestion: {
    maxTokens: 700,
    schema: obj({
      scores: arr(obj({ criterionId: { type: "integer", minimum: 1 }, points: { type: "number", minimum: 0 }, reason: str(3, 400) }), 1, 12),
      feedback: str(10, 1200),
    }),
  },
  // Summaries of Explore/Library books and videos for learners: long texts are read in parts
  // ("notes" per part), then the notes are turned into one summary.
  notes: {
    maxTokens: 500,
    schema: obj({ notes: arr(str(5, 300), 1, 8) }),
  },
  content_summary: {
    maxTokens: 900,
    schema: obj({ overview: str(40, 1500), keyPoints: arr(str(5, 300), 3, 8), questions: arr(str(5, 200), 0, 3) }),
  },
  class_summary: {
    maxTokens: 700,
    schema: obj({ summary: str(20, 1200), suggestions: arr(str(10, 400), 1, 5) }),
  },
};

export const LANGUAGE_NAMES = { en: "English", fr: "French", rw: "Kinyarwanda", sw: "Swahili", es: "Spanish" };

const templateCache = new Map();
function template(task) {
  if (!templateCache.has(task)) templateCache.set(task, fs.readFileSync(path.join(promptsDir, `${task}.txt`), "utf8"));
  return templateCache.get(task);
}

/** Readable context block from the input the LMS sends (outcomes, module, grade, source text...). */
export function renderContext(input, maxSourceLength) {
  const lines = [];
  if (input.courseTitle) lines.push(`Course: ${input.courseTitle}`);
  if (input.gradeLevel) lines.push(`Grade level: ${input.gradeLevel}`);
  if (input.moduleTitle) lines.push(`Week/module: ${input.moduleTitle}`);
  if (Array.isArray(input.outcomes) && input.outcomes.length) {
    lines.push("Course outcomes (use these codes exactly):");
    for (const o of input.outcomes) lines.push(`- ${o.code}: ${o.title}`);
  }
  if (Array.isArray(input.criteria) && input.criteria.length) {
    lines.push("Rubric criteria (use these ids exactly):");
    for (const c of input.criteria) lines.push(`- id ${c.id}: ${c.title} (0-${c.points} points)${c.description ? `: ${c.description}` : ""}`);
  }
  for (const [key, label] of [["topic", "Topic"], ["goal", "Teacher's goal"], ["idea", "Story idea"], ["assignmentTitle", "Assignment"], ["instructions", "Assignment instructions"], ["weeks", "Number of weeks"], ["count", "Number of questions"]]) {
    if (input[key] != null && input[key] !== "") lines.push(`${label}: ${input[key]}`);
  }
  if (input.stats) lines.push(`Class results: ${JSON.stringify(input.stats)}`);
  if (input.title) lines.push(`Title: ${input.title}`);
  if (input.kind) lines.push(`This is a ${input.kind === "video" ? "video (from its transcript)" : input.kind === "audio" ? "recording (from its transcript)" : "book or document"}.`);
  if (input.part) lines.push(`Part ${input.part}`);
  if (Array.isArray(input.notes) && input.notes.length) {
    lines.push("Notes taken while reading it:");
    for (const n of input.notes) lines.push(`- ${n}`);
  }
  if (input.sourceText) lines.push(`Source text (only use facts from here when given):\n${String(input.sourceText).slice(0, maxSourceLength)}`);
  if (input.submissionText) lines.push(`Learner's submission (anonymous):\n${String(input.submissionText).slice(0, maxSourceLength)}`);
  return lines.join("\n");
}

export function buildMessages(task, input, { maxSourceLength = 4000 } = {}) {
  const language = LANGUAGE_NAMES[input.language] || "English";
  const system = [
    "You are an offline assistant helping teachers in Somabox LMS classrooms.",
    `Write every piece of text for learners and teachers in ${language}.`,
    "Use simple, clear language suitable for the grade level. Never invent facts; if source text is given, stay within it.",
    "Respond ONLY with a JSON object that matches the required schema. No markdown, no commentary.",
  ].join(" ");
  const user = template(task).replace("{CONTEXT}", renderContext(input, maxSourceLength) || "None");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}
