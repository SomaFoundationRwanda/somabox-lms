// Course setup: what must be true before a course can open (blocking), what is worth fixing
// (warnings), the teacher checklist built from both, and the baseline (Week 0) assessment.
import { localDb } from "../../helpers/db-manager.js";
import { loadCourseTimeline } from "./schedule.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const titles = (rows, max = 3) => {
  const names = rows.slice(0, max).map((r) => `"${r.title}"`).join(", ");
  return rows.length > max ? `${names} and ${rows.length - max} more` : names;
};

// ---------------------------------------------------------------- Baseline

/** The course's baseline module, quiz, and whether the quiz is ready to approve. */
export async function getBaselineState(courseId) {
  const course = await localDb.prepare("SELECT baseline_status, baseline_skip_reason, baseline_decided_by, baseline_decided_at FROM courses WHERE id = ?").get(courseId);
  const module = await localDb.prepare("SELECT * FROM modules WHERE course_id = ? AND kind = 'baseline'").get(courseId) || null;
  const quiz = module ? await localDb.prepare(`
    SELECT q.* FROM quizzes q JOIN module_items mi ON mi.item_type = 'quiz' AND mi.content_id = q.id
    WHERE q.module_id = ? AND q.kind = 'baseline' ORDER BY mi.position, q.id LIMIT 1
  `).get(module.id) || null : null;
  const questions = quiz ? await localDb.prepare("SELECT id, question_type, outcome_id, correct_option FROM quiz_questions WHERE quiz_id = ?").all(quiz.id) : [];
  const outcomes = await localDb.prepare("SELECT id, code, title FROM outcomes WHERE course_id = ? ORDER BY id").all(courseId);

  const covered = new Set(questions.filter((q) => q.outcome_id).map((q) => Number(q.outcome_id)));
  const untagged = questions.filter((q) => !q.outcome_id).length;
  const notScorable = questions.filter((q) => q.question_type !== "multiple_choice" || !q.correct_option).length;

  const problems = [];
  if (!module) problems.push("Add a baseline (Week 0) module");
  else if (!quiz) problems.push("Add a baseline quiz to the Week 0 module");
  else if (questions.length === 0) problems.push("Add questions to the baseline quiz");
  if (untagged > 0) problems.push(`Tag ${plural(untagged, "baseline question")} with an outcome`);
  if (notScorable > 0) problems.push(`${plural(notScorable, "baseline question")} can't be scored automatically: use multiple choice with a correct answer`);

  return {
    status: course?.baseline_status || "pending",
    skipReason: course?.baseline_skip_reason || null,
    decidedBy: course?.baseline_decided_by || null,
    decidedAt: course?.baseline_decided_at || null,
    moduleId: module?.id ?? null,
    quizId: quiz?.id ?? null,
    questionCount: questions.length,
    untaggedQuestionCount: untagged,
    outcomesCovered: outcomes.filter((o) => covered.has(Number(o.id))).map((o) => o.id),
    outcomesMissing: outcomes.filter((o) => !covered.has(Number(o.id))),
    canApprove: problems.length === 0,
    problems,
  };
}

/** Called when a baseline quiz's questions change: a draft course must re-approve it. */
export async function baselineQuestionsChanged(courseId, quizId) {
  const quiz = await localDb.prepare("SELECT kind FROM quizzes WHERE id = ?").get(quizId);
  if (quiz?.kind !== "baseline") return;
  await localDb.prepare(`
    UPDATE courses SET baseline_status = 'pending', baseline_decided_by = NULL, baseline_decided_at = NULL
    WHERE id = ? AND lifecycle = 'draft' AND baseline_status = 'approved'
  `).run(courseId);
}

/**
 * Per-outcome baseline from a learner's first baseline attempt, computed only from their
 * answers: for each outcome, points earned on its questions / points possible, as a percent.
 * Writes student_outcome_baselines (read by outcome mastery today) and outcome_results
 * (the source for mastery from Phase 6). Returns [{ outcomeId, pct }].
 */
export async function recordBaselineResults({ courseId, quizId, userId, email, attemptId, answers }) {
  const questions = await localDb.prepare(`
    SELECT id, outcome_id, correct_option, points FROM quiz_questions
    WHERE quiz_id = ? AND outcome_id IS NOT NULL AND question_type = 'multiple_choice' AND correct_option IS NOT NULL
  `).all(quizId);
  const byOutcome = new Map();
  for (const q of questions) {
    const entry = byOutcome.get(Number(q.outcome_id)) || { earned: 0, possible: 0 };
    const points = Number(q.points) || 0;
    entry.possible += points;
    if (answers[String(q.id)] === q.correct_option) entry.earned += points;
    byOutcome.set(Number(q.outcome_id), entry);
  }

  const results = [];
  for (const [outcomeId, { earned, possible }] of byOutcome) {
    if (possible <= 0) continue;
    const pct = Math.round((earned / possible) * 10000) / 100;
    await localDb.prepare(`
      INSERT INTO student_outcome_baselines (course_id, scholar_email, outcome_id, baseline_score)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (course_id, scholar_email, outcome_id) DO UPDATE SET baseline_score = EXCLUDED.baseline_score, assessed_at = CURRENT_TIMESTAMP
    `).run(courseId, email, outcomeId, pct);
    await localDb.prepare(`
      INSERT INTO outcome_results (user_id, course_id, outcome_id, source_type, source_id, pct)
      VALUES (?, ?, ?, 'baseline', ?, ?)
      ON CONFLICT (user_id, outcome_id, source_type, source_id) DO UPDATE SET pct = EXCLUDED.pct
    `).run(userId, courseId, outcomeId, attemptId, pct);
    results.push({ outcomeId, pct });
  }
  return results;
}

// ---------------------------------------------------------------- Opening gate

/**
 * Everything the teacher needs to open the course:
 * { canOpen, blocking: [{ id, message, href }], warnings: [{ id, message, href }],
 *   checklist: [{ id, label, done, blocking, href }], baseline, counts }
 */
export async function getSetupReport(courseId) {
  const base = `/course/${courseId}`;
  const tl = await loadCourseTimeline(courseId);
  const course = tl.course;
  const baseline = await getBaselineState(courseId);
  const outcomes = await localDb.prepare("SELECT id, code, title FROM outcomes WHERE course_id = ? ORDER BY id").all(courseId);

  const modules = tl.modules;
  const unassigned = modules.find((m) => m.kind === "unassigned");
  const regular = modules.filter((m) => m.kind === "regular");
  const contentItems = tl.items.filter((i) => i.item_type !== "sub_header");
  const inModule = (m) => contentItems.filter((i) => Number(i.module_id) === Number(m.id));
  const unassignedItems = unassigned ? inModule(unassigned) : [];
  const weeksWithContent = regular.filter((m) => inModule(m).length > 0);
  const emptyWeeks = regular.filter((m) => inModule(m).length === 0);

  // Graded work outside "Unassigned" with no outcome tag (practice quizzes are exempt;
  // baseline questions are checked by the baseline step).
  const untagged = await localDb.prepare(`
    SELECT mi.title, mi.item_type FROM module_items mi
    JOIN modules m ON m.id = mi.module_id
    LEFT JOIN quizzes q ON mi.item_type = 'quiz' AND q.id = mi.content_id
    WHERE m.course_id = ? AND m.kind <> 'unassigned' AND mi.item_type IN ('assignment', 'quiz')
      AND COALESCE(q.kind, 'graded') = 'graded'
      AND NOT EXISTS (SELECT 1 FROM item_outcomes io WHERE io.item_type = mi.item_type AND io.item_id = mi.content_id)
    ORDER BY m.position, mi.position
  `).all(courseId);

  const blocking = [];
  if (outcomes.length === 0) blocking.push({ id: "outcomes", message: "Add the course's learning outcomes", href: `${base}/outcomes` });
  if (!tl.startDate) blocking.push({ id: "start_date", message: "Set the course start date (the first day of Week 1)", href: `${base}/settings` });
  if (weeksWithContent.length === 0) blocking.push({ id: "content", message: "Add at least one week with learning content", href: `${base}/modules` });
  if (unassignedItems.length > 0) {
    blocking.push({ id: "unassigned", message: `Move ${plural(unassignedItems.length, "item")} out of "Unassigned (fix me)" into a week`, href: `${base}/modules` });
  }
  if (untagged.length > 0) {
    blocking.push({ id: "untagged", message: `Tag ${plural(untagged.length, "graded item")} with an outcome: ${titles(untagged)}`, href: `${base}/modules` });
  }
  if (baseline.status === "pending") {
    blocking.push({ id: "baseline", message: "Approve the baseline quiz, or skip the baseline and say why", href: `${base}/settings#course-setup` });
  }

  const warnings = [];
  const assessed = new Set((await localDb.prepare(`
    SELECT outcome_id FROM item_outcomes WHERE course_id = ?
    UNION SELECT qq.outcome_id FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id WHERE q.course_id = ? AND qq.outcome_id IS NOT NULL
  `).all(courseId, courseId)).map((r) => Number(r.outcome_id)));
  const unassessed = outcomes.filter((o) => !assessed.has(Number(o.id)));
  if (unassessed.length > 0) {
    warnings.push({ id: "unassessed_outcomes", message: `${plural(unassessed.length, "outcome")} not assessed by any graded work: ${titles(unassessed)}`, href: `${base}/outcomes` });
  }
  const hiddenWeeks = weeksWithContent.filter((m) => Number(m.published) !== 1);
  if (hiddenWeeks.length > 0) {
    warnings.push({ id: "unpublished_weeks", message: `${plural(hiddenWeeks.length, "week")} with content ${hiddenWeeks.length === 1 ? "is" : "are"} unpublished, so learners won't see ${hiddenWeeks.length === 1 ? "it" : "them"}`, href: `${base}/modules` });
  }
  const noDue = contentItems.filter((i) => ["assignment", "quiz"].includes(i.item_type) && i.due_day == null
    && modules.find((m) => Number(m.id) === Number(i.module_id))?.kind === "regular");
  if (noDue.length > 0) warnings.push({ id: "no_due_date", message: `${plural(noDue.length, "assignment or quiz")} ${noDue.length === 1 ? "has" : "have"} no due date`, href: `${base}/modules` });
  if (emptyWeeks.length > 0) warnings.push({ id: "empty_weeks", message: `${plural(emptyWeeks.length, "week")} ${emptyWeeks.length === 1 ? "has" : "have"} no content yet: ${titles(emptyWeeks)}`, href: `${base}/modules` });
  const lastEnd = regular.map((m) => m.endDate).filter(Boolean).sort().pop();
  if (tl.startDate && !course.end_date) {
    warnings.push({ id: "no_end_date", message: "The course has no end date", href: `${base}/settings` });
  } else if (lastEnd && course.end_date && course.end_date < lastEnd) {
    warnings.push({ id: "end_before_last_week", message: `The course ends on ${course.end_date}, before its last week ends (${lastEnd})`, href: `${base}/settings` });
  }
  if (baseline.status === "approved" && baseline.outcomesMissing.length > 0) {
    warnings.push({ id: "baseline_coverage", message: `The baseline doesn't cover ${plural(baseline.outcomesMissing.length, "outcome")}: ${titles(baseline.outcomesMissing)}`, href: `${base}/settings#course-setup` });
  }

  const has = (id) => blocking.some((b) => b.id === id);
  const checklist = [
    { id: "outcomes", label: "Learning outcomes added", done: !has("outcomes"), blocking: true, href: `${base}/outcomes` },
    { id: "start_date", label: "Start date set", done: !has("start_date"), blocking: true, href: `${base}/settings` },
    { id: "content", label: "Weeks have learning content", done: !has("content"), blocking: true, href: `${base}/modules` },
    ...(unassigned ? [{ id: "unassigned", label: "Nothing left in \"Unassigned\"", done: !has("unassigned"), blocking: true, href: `${base}/modules` }] : []),
    { id: "untagged", label: "Every graded item has an outcome", done: !has("untagged"), blocking: true, href: `${base}/modules` },
    {
      id: "baseline",
      label: baseline.status === "skipped" ? "Baseline skipped (reason recorded)" : "Baseline quiz approved",
      done: baseline.status !== "pending", blocking: true, href: `${base}/settings#course-setup`,
    },
    { id: "published", label: "Weeks with content are published", done: hiddenWeeks.length === 0, blocking: false, href: `${base}/modules` },
    { id: "open", label: "Course opened", done: course.lifecycle !== "draft", blocking: false, href: `${base}/home` },
  ];

  return {
    lifecycle: course.lifecycle,
    canOpen: blocking.length === 0,
    blocking,
    warnings,
    checklist,
    baseline,
    counts: {
      outcomes: outcomes.length,
      modules: regular.length,
      weeksWithContent: weeksWithContent.length,
      items: contentItems.length,
      unassignedItems: unassignedItems.length,
    },
  };
}
