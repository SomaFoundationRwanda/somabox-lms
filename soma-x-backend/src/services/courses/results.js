// Outcome results: the only source for outcome mastery and growth. Every graded quiz
// attempt, graded assignment, and first baseline attempt writes one row per outcome it
// assessed, always as a percentage (0-100). Mastery is computed from these rows only.
import { localDb } from "../../helpers/db-manager.js";

const clampPct = (n) => Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;

/** A question the box can mark by itself (multiple choice with a correct option). */
export const autoMarked = (q) => q.question_type === "multiple_choice" && !!q.correct_option;

/**
 * Per-outcome percentages for a quiz attempt: questions tagged with an outcome score that
 * outcome; untagged questions (or the whole quiz, if nothing is tagged) score the quiz's own
 * outcome tags that no question covers. Returns Map(outcomeId -> pct).
 */
export function quizOutcomePcts(questions, answers, itemOutcomeIds) {
  const groups = new Map();
  const untagged = { earned: 0, possible: 0 };
  let earnedAll = 0;
  let possibleAll = 0;
  for (const q of questions) {
    // Only auto-marked questions count: an open question can't be marked yet, so counting its
    // points would understate what the learner knows.
    if (!autoMarked(q)) continue;
    const points = Number(q.points) || 0;
    const right = answers[String(q.id)] === q.correct_option;
    possibleAll += points;
    if (right) earnedAll += points;
    const key = q.outcome_id ? Number(q.outcome_id) : null;
    const bucket = key ? (groups.get(key) || { earned: 0, possible: 0 }) : untagged;
    bucket.possible += points;
    if (right) bucket.earned += points;
    if (key) groups.set(key, bucket);
  }
  const result = new Map();
  for (const [id, g] of groups) if (g.possible > 0) result.set(id, clampPct((g.earned / g.possible) * 100));
  const fallback = untagged.possible > 0 ? (untagged.earned / untagged.possible) * 100
    : (groups.size === 0 && possibleAll > 0 ? (earnedAll / possibleAll) * 100 : null);
  if (fallback !== null) {
    for (const id of itemOutcomeIds) if (!result.has(Number(id))) result.set(Number(id), clampPct(fallback));
  }
  return result;
}

async function writeResults(userId, courseId, sourceType, sourceId, pcts) {
  await localDb.prepare("DELETE FROM outcome_results WHERE user_id = ? AND source_type = ? AND source_id = ?").run(userId, sourceType, sourceId);
  for (const [outcomeId, pct] of pcts) {
    await localDb.prepare(`
      INSERT INTO outcome_results (user_id, course_id, outcome_id, source_type, source_id, pct)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, courseId, outcomeId, sourceType, sourceId, pct);
  }
}

/** Results for a graded quiz attempt (practice and baseline quizzes are handled elsewhere / not counted). */
export async function recordQuizAttemptResults({ courseId, quizId, userId, attemptId, answers }) {
  const questions = await localDb.prepare("SELECT * FROM quiz_questions WHERE quiz_id = ?").all(quizId);
  const itemOutcomes = (await localDb.prepare("SELECT outcome_id FROM item_outcomes WHERE item_type = 'quiz' AND item_id = ?").all(quizId)).map((r) => r.outcome_id);
  await writeResults(userId, courseId, "quiz_attempt", attemptId, quizOutcomePcts(questions, answers, itemOutcomes));
}

/**
 * Rubric total on the assignment's scale: points possible x (weighted mean of each criterion's
 * points / criterion max). Returns null if no criterion has a score.
 */
export function rubricGrade(criteria, scoresByCriterion, pointsPossible) {
  let weighted = 0;
  let weights = 0;
  for (const c of criteria) {
    const s = scoresByCriterion.get(Number(c.id));
    const max = Number(c.points);
    if (s == null || !(max > 0)) continue;
    weighted += Number(c.weight) * (Number(s) / max);
    weights += Number(c.weight);
  }
  if (weights === 0) return null;
  return Math.round(Number(pointsPossible) * (weighted / weights) * 100) / 100;
}

/**
 * Results for a graded assignment submission. With rubric scores: each outcome gets the
 * weighted mean of its criteria; outcome tags no criterion covers get the overall grade
 * percentage. Without a rubric: every tag gets the grade percentage. Ungraded: no results.
 */
export async function recordSubmissionResults({ courseId, assignmentId, submissionId }) {
  const submission = await localDb.prepare(`
    SELECT s.*, u.id AS user_id FROM assignment_submissions s
    JOIN users u ON LOWER(u.email) = LOWER(s.scholar_email) WHERE s.id = ?
  `).get(submissionId);
  if (!submission) return;
  const assignment = await localDb.prepare("SELECT points_possible FROM assignments WHERE id = ?").get(assignmentId);
  const possible = Number(assignment?.points_possible) || 0;
  const pcts = new Map();
  if (submission.grade != null && possible > 0) {
    const overall = clampPct((Number(submission.grade) / possible) * 100);
    const scored = await localDb.prepare(`
      SELECT c.outcome_id, c.points AS max, c.weight, ss.points
      FROM submission_scores ss JOIN rubric_criteria c ON c.id = ss.criterion_id
      WHERE ss.submission_id = ? AND c.outcome_id IS NOT NULL
    `).all(submissionId);
    const byOutcome = new Map();
    for (const r of scored) {
      if (!(Number(r.max) > 0)) continue;
      const entry = byOutcome.get(Number(r.outcome_id)) || { weighted: 0, weights: 0 };
      entry.weighted += Number(r.weight) * (Number(r.points) / Number(r.max));
      entry.weights += Number(r.weight);
      byOutcome.set(Number(r.outcome_id), entry);
    }
    for (const [id, e] of byOutcome) pcts.set(id, clampPct((e.weighted / e.weights) * 100));
    const tags = await localDb.prepare("SELECT outcome_id FROM item_outcomes WHERE item_type = 'assignment' AND item_id = ?").all(assignmentId);
    for (const t of tags) if (!pcts.has(Number(t.outcome_id))) pcts.set(Number(t.outcome_id), overall);
  }
  await writeResults(submission.user_id, courseId, "assignment_submission", submissionId, pcts);
}

export const MASTERY_THRESHOLD = 85;
export const RETEACH_THRESHOLD = 60;
export const statusFor = (pct) => (pct == null ? null : pct < RETEACH_THRESHOLD ? "Needs Reteach" : pct >= MASTERY_THRESHOLD ? "Mastery Achieved" : "On Track");

/**
 * Each learner's value per outcome: current = mean of their latest result per piece of work
 * (latest attempt per quiz; one per assignment submission), baseline = mean of their baseline
 * results. Returns { current: [{ outcome_id, user_id, pct, n }], baseline: [{ outcome_id, user_id, pct }] }.
 */
export async function learnerOutcomeValues(courseId, userIds) {
  if (!userIds.length) return { current: [], baseline: [] };
  const placeholders = userIds.map(() => "?").join(",");
  const current = await localDb.prepare(`
    WITH r AS (
      SELECT o.user_id, o.outcome_id, o.pct, o.assessed_at, qa.attempt_number,
             CASE WHEN o.source_type = 'quiz_attempt' THEN 'quiz:' || qa.quiz_id ELSE o.source_type || ':' || o.source_id END AS item_key
      FROM outcome_results o
      LEFT JOIN quiz_attempts qa ON o.source_type = 'quiz_attempt' AND qa.id = o.source_id
      WHERE o.course_id = ? AND o.source_type <> 'baseline' AND o.user_id IN (${placeholders})
    ), latest AS (
      SELECT DISTINCT ON (user_id, outcome_id, item_key) user_id, outcome_id, pct
      FROM r ORDER BY user_id, outcome_id, item_key, attempt_number DESC NULLS LAST, assessed_at DESC
    )
    SELECT outcome_id, user_id, AVG(pct) AS pct, COUNT(*) AS n FROM latest GROUP BY outcome_id, user_id
  `).all(courseId, ...userIds);
  const baseline = await localDb.prepare(`
    SELECT outcome_id, user_id, AVG(pct) AS pct FROM outcome_results
    WHERE course_id = ? AND source_type = 'baseline' AND user_id IN (${placeholders})
    GROUP BY outcome_id, user_id
  `).all(courseId, ...userIds);
  return { current, baseline };
}

/**
 * Mastery per outcome from outcome_results only.
 * - A learner's current mastery for an outcome = mean of their latest result per piece of work
 *   (latest attempt per quiz; one per assignment submission). Baselines are separate.
 * - The class value = mean of the learners' values (each learner counts once).
 * userId limits it to one learner. Returns [{ outcome fields, baselineScore, currentMastery,
 * delta, deltaPoints, normalizedGain, status, resultsCount, learnersWithData }].
 */
export async function computeMastery(courseId, { userId = null } = {}) {
  const outcomes = await localDb.prepare("SELECT * FROM outcomes WHERE course_id = ? ORDER BY id ASC").all(courseId);
  const learnerIds = (await localDb.prepare(`
    SELECT u.id FROM enrollments e JOIN users u ON LOWER(u.email) = LOWER(e.user_email)
    WHERE e.course_id = ? AND e.role = 'student' AND e.status = 'active'
  `).all(courseId)).map((r) => Number(r.id));
  const scope = userId ? [Number(userId)] : learnerIds;
  if (scope.length === 0) return outcomes.map((o) => emptyRow(o));

  const { current, baseline } = await learnerOutcomeValues(courseId, scope);

  const mean = (rows) => (rows.length ? rows.reduce((s, r) => s + Number(r.pct), 0) / rows.length : null);
  return outcomes.map((o) => {
    const cur = current.filter((r) => Number(r.outcome_id) === Number(o.id));
    const base = baseline.filter((r) => Number(r.outcome_id) === Number(o.id));
    const currentMastery = cur.length ? Math.round(mean(cur)) : null;
    const baselineScore = base.length ? Math.round(mean(base)) : null;
    const deltaPoints = currentMastery != null && baselineScore != null ? currentMastery - baselineScore : null;
    // Normalised gain: share of the possible improvement achieved; undefined at a 100% baseline.
    const normalizedGain = deltaPoints != null && baselineScore < 100
      ? Math.round((deltaPoints / (100 - baselineScore)) * 100) / 100 : null;
    return {
      id: o.id,
      code: o.code || `OUT-${o.id}`,
      title: o.title,
      description: o.description,
      baselineScore,
      currentMastery,
      deltaPoints,
      delta: deltaPoints == null ? null : `${deltaPoints >= 0 ? "+" : ""}${deltaPoints}%`,
      normalizedGain,
      status: statusFor(currentMastery),
      resultsCount: cur.reduce((s, r) => s + Number(r.n), 0),
      learnersWithData: cur.length,
    };
  });
}

function emptyRow(o) {
  return {
    id: o.id, code: o.code || `OUT-${o.id}`, title: o.title, description: o.description,
    baselineScore: null, currentMastery: null, deltaPoints: null, delta: null, normalizedGain: null,
    status: null, resultsCount: 0, learnersWithData: 0,
  };
}
