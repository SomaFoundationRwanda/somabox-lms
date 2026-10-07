// Course insights: per-learner and per-class metrics computed from real records only
// (outcome_results, submissions, quiz attempts, page views, replies). Nothing is estimated or
// filled in: missing data is null and every figure says how many learners it is based on.
import { diffDays, compareDates } from "@somabox/timeline";
import { localDb } from "../../helpers/db-manager.js";
import { loadCourseTimeline, SCHOOL_TIMEZONE } from "../courses/schedule.js";
import { computeMastery, learnerOutcomeValues, MASTERY_THRESHOLD, RETEACH_THRESHOLD } from "../courses/results.js";

export const TRAJECTORY_LENGTH = 10;
export const RISK_RULES = {
  lowMastery: { below: RETEACH_THRESHOLD, minResults: 2 },
  missingWork: { atLeast: 2 },
  oftenLate: { atLeast: 2, share: 0.5 },
  inactive: { days: 14, courseRunningDays: 7 },
  falling: { window: 3, drop: 15 },
};

const round = (n) => (n == null ? null : Math.round(n));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + Number(x), 0) / xs.length : null);
const gain = (current, baseline) => (current != null && baseline != null && baseline < 100
  ? Math.round(((current - baseline) / (100 - baseline)) * 100) / 100 : null);

export async function courseLearners(courseId) {
  return localDb.prepare(`
    SELECT u.id, u.email, u.full_name FROM enrollments e JOIN users u ON LOWER(u.email) = LOWER(e.user_email)
    WHERE e.course_id = ? AND e.role = 'student' AND e.status = 'active'
    ORDER BY LOWER(COALESCE(u.full_name, u.email))
  `).all(courseId);
}

/**
 * Published graded work learners can see, with resolved dates: assignments, graded quizzes, and
 * graded discussions (as their linked assignment). Practice and baseline quizzes are excluded.
 */
async function gradedItems(tl) {
  const courseId = tl.course.id;
  const quizzes = new Map((await localDb.prepare("SELECT id, title, kind FROM quizzes WHERE course_id = ?").all(courseId)).map((q) => [Number(q.id), q]));
  const assignments = new Map((await localDb.prepare("SELECT id, title, points_possible FROM assignments WHERE course_id = ?").all(courseId)).map((a) => [Number(a.id), a]));
  const discussions = new Map((await localDb.prepare("SELECT id, title, linked_assignment_id FROM discussions WHERE course_id = ?").all(courseId)).map((d) => [Number(d.id), d]));
  const modules = new Map(tl.modules.map((m) => [Number(m.id), m]));
  const items = [];
  for (const it of tl.items) {
    if (Number(it.published) !== 1 || Number(it.module_published) !== 1) continue;
    const module = modules.get(Number(it.module_id));
    const base = {
      moduleItemId: it.id, title: it.title, releaseDate: it.releaseDate ?? null, dueDate: it.dueDate ?? null,
      closeDate: it.closeDate ?? null, status: it.status ?? "undated",
      module: module ? { id: module.id, title: module.title, kind: module.kind, week_offset: module.week_offset } : null,
    };
    if (it.item_type === "quiz") {
      const q = quizzes.get(Number(it.content_id));
      if (q && q.kind === "graded") items.push({ ...base, type: "quiz", contentId: q.id, title: q.title });
    } else if (it.item_type === "assignment") {
      const a = assignments.get(Number(it.content_id));
      if (a) items.push({ ...base, type: "assignment", contentId: a.id, title: a.title, pointsPossible: Number(a.points_possible) });
    } else if (it.item_type === "discussion") {
      const d = discussions.get(Number(it.content_id));
      const a = d?.linked_assignment_id ? assignments.get(Number(d.linked_assignment_id)) : null;
      if (a) items.push({ ...base, type: "discussion", contentId: d.id, assignmentId: a.id, title: d.title, pointsPossible: Number(a.points_possible) });
    }
  }
  return items;
}

/** Map key `${type}:${id}|${email}` -> { submittedAt, late, pct, attempts } for every learner. */
async function workRecords(courseId) {
  const records = new Map();
  const subs = await localDb.prepare(`
    SELECT s.assignment_id, LOWER(s.scholar_email) AS email, s.submitted_at, s.grade, s.is_late, a.points_possible
    FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
    WHERE a.course_id = ?
  `).all(courseId);
  for (const s of subs) {
    const possible = Number(s.points_possible);
    records.set(`assignment:${s.assignment_id}|${s.email}`, {
      submittedAt: s.submitted_at, late: !!s.is_late && !!s.submitted_at, attempts: s.submitted_at ? 1 : 0,
      pct: s.grade != null && possible > 0 ? Math.min(100, (Number(s.grade) / possible) * 100) : null,
    });
  }
  const attempts = await localDb.prepare(`
    SELECT qa.quiz_id, LOWER(u.email) AS email, qa.attempt_number, qa.submitted_at, qa.score_pct, qa.is_late
    FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id JOIN users u ON u.id = qa.user_id
    WHERE q.course_id = ? AND qa.submitted_at IS NOT NULL
    ORDER BY qa.attempt_number ASC
  `).all(courseId);
  for (const a of attempts) {
    const key = `quiz:${a.quiz_id}|${a.email}`;
    const prev = records.get(key);
    // Timeliness counts the first submission; the score is the latest attempt's.
    records.set(key, {
      submittedAt: prev?.submittedAt ?? a.submitted_at,
      late: prev ? prev.late : !!a.is_late,
      attempts: (prev?.attempts || 0) + 1,
      pct: a.score_pct != null ? Number(a.score_pct) : prev?.pct ?? null,
    });
  }
  return records;
}

const recordKey = (item, email) => (item.type === "quiz" ? `quiz:${item.contentId}|${email}`
  : `assignment:${item.assignmentId ?? item.contentId}|${email}`);

/** A learner's state for one item: done_on_time | done_late | missing | to_do | upcoming. */
function itemState(item, record, today) {
  if (record?.submittedAt) return record.late ? "done_late" : "done_on_time";
  if (item.releaseDate && compareDates(today, item.releaseDate) < 0) return "upcoming";
  if (item.dueDate && compareDates(today, item.dueDate) > 0) return "missing";
  return "to_do";
}

/** Last activity and active days per learner email, from submissions, attempts, views, replies. */
async function activity(courseId) {
  const rows = await localDb.prepare(`
    WITH a AS (
      SELECT LOWER(s.scholar_email) AS email, s.submitted_at AS at FROM assignment_submissions s
        JOIN assignments x ON x.id = s.assignment_id WHERE x.course_id = ? AND s.submitted_at IS NOT NULL
      UNION ALL SELECT LOWER(u.email), COALESCE(qa.submitted_at, qa.started_at) FROM quiz_attempts qa
        JOIN quizzes q ON q.id = qa.quiz_id JOIN users u ON u.id = qa.user_id WHERE q.course_id = ?
      UNION ALL SELECT LOWER(v.user_email), v.last_viewed_at FROM page_views v
        JOIN course_pages p ON p.id = v.page_id WHERE p.course_id = ?
      UNION ALL SELECT LOWER(mp.user_email), mp.last_viewed_at FROM module_item_progress mp
        JOIN module_items mi ON mi.id = mp.module_item_id JOIN modules m ON m.id = mi.module_id WHERE m.course_id = ?
      UNION ALL SELECT LOWER(r.author_email), r.created_at FROM discussion_replies r
        JOIN discussions d ON d.id = r.discussion_id WHERE d.course_id = ?
    )
    SELECT email, MAX(at) AS last_at,
           COUNT(DISTINCT (at AT TIME ZONE ?)::date) FILTER (WHERE at >= NOW() - INTERVAL '14 days') AS active_days_14,
           COUNT(DISTINCT (at AT TIME ZONE ?)::date) FILTER (WHERE at >= NOW() - INTERVAL '7 days') AS active_days_7
    FROM a WHERE at IS NOT NULL GROUP BY email
  `).all(courseId, courseId, courseId, courseId, courseId, SCHOOL_TIMEZONE, SCHOOL_TIMEZONE);
  return new Map(rows.map((r) => [r.email, { lastActivityAt: r.last_at, activeDays14: Number(r.active_days_14), activeDays7: Number(r.active_days_7) }]));
}

/** Non-baseline outcome results per user id, oldest first. */
async function resultRows(courseId) {
  const rows = await localDb.prepare(`
    SELECT o.user_id, o.outcome_id, o.source_type, o.source_id, o.pct, o.assessed_at,
           COALESCE(q.title, a.title) AS title, qa.attempt_number
    FROM outcome_results o
    LEFT JOIN quiz_attempts qa ON o.source_type = 'quiz_attempt' AND qa.id = o.source_id
    LEFT JOIN quizzes q ON q.id = qa.quiz_id
    LEFT JOIN assignment_submissions s ON o.source_type = 'assignment_submission' AND s.id = o.source_id
    LEFT JOIN assignments a ON a.id = s.assignment_id
    WHERE o.course_id = ? AND o.source_type <> 'baseline'
    ORDER BY o.assessed_at ASC, o.id ASC
  `).all(courseId);
  const byUser = new Map();
  for (const r of rows) {
    const id = Number(r.user_id);
    if (!byUser.has(id)) byUser.set(id, []);
    byUser.get(id).push(r);
  }
  return byUser;
}

/** One point per piece of evidence (its outcome results averaged), oldest first. */
function trajectory(rows) {
  const points = new Map();
  for (const r of rows) {
    const key = `${r.source_type}:${r.source_id}`;
    if (!points.has(key)) points.set(key, { sourceType: r.source_type, sourceId: Number(r.source_id), title: r.title, attempt: r.attempt_number ?? null, at: r.assessed_at, pcts: [] });
    points.get(key).pcts.push(Number(r.pct));
  }
  return [...points.values()].map(({ pcts, ...p }) => ({ ...p, pct: round(mean(pcts)) }));
}

/** Results needed to first reach mastery per outcome (null if not reached yet). */
function attemptsToMastery(rows) {
  const byOutcome = new Map();
  for (const r of rows) {
    const id = Number(r.outcome_id);
    const s = byOutcome.get(id) || { results: 0, reachedAt: null };
    s.results += 1;
    if (s.reachedAt == null && Number(r.pct) >= MASTERY_THRESHOLD) s.reachedAt = s.results;
    byOutcome.set(id, s);
  }
  return byOutcome;
}

/** Rule-based, explainable risk flags. Each reason: { code, message }. */
export function riskReasons({ overall, resultsCount, timeliness, engagement, points, courseRunningDays, today }) {
  const reasons = [];
  if (overall != null && overall < RISK_RULES.lowMastery.below && resultsCount >= RISK_RULES.lowMastery.minResults) {
    reasons.push({ code: "low_mastery", message: `Average across outcomes is ${overall}%, below ${RISK_RULES.lowMastery.below}%` });
  }
  if (timeliness.missing >= RISK_RULES.missingWork.atLeast) {
    reasons.push({ code: "missing_work", message: `${timeliness.missing} past-due items not handed in` });
  }
  const handedIn = timeliness.onTime + timeliness.late;
  if (timeliness.late >= RISK_RULES.oftenLate.atLeast && handedIn > 0 && timeliness.late / handedIn >= RISK_RULES.oftenLate.share) {
    reasons.push({ code: "often_late", message: `Handed in late ${timeliness.late} of ${handedIn} times` });
  }
  if (courseRunningDays != null && courseRunningDays >= RISK_RULES.inactive.courseRunningDays) {
    const idle = engagement.lastActivityAt ? diffDays(dateOnly(engagement.lastActivityAt), today) : null;
    if (idle == null) reasons.push({ code: "inactive", message: "No activity in this course yet" });
    else if (idle >= RISK_RULES.inactive.days) reasons.push({ code: "inactive", message: `No activity for ${idle} days` });
  }
  const w = RISK_RULES.falling.window;
  if (points.length >= w * 2) {
    const recent = mean(points.slice(-w).map((p) => p.pct));
    const before = mean(points.slice(-2 * w, -w).map((p) => p.pct));
    if (before - recent >= RISK_RULES.falling.drop) {
      reasons.push({ code: "falling", message: `Recent results dropped ${Math.round(before - recent)} points` });
    }
  }
  return reasons;
}

const dateOnly = (value) => new Date(value).toLocaleDateString("en-CA", { timeZone: SCHOOL_TIMEZONE });

/**
 * Everything Insights needs for one course, in a fixed number of queries:
 * { course, today, outcomes, items, learners: [learner metrics], class }
 * With userId, only that learner is computed (class figures then describe just them).
 */
export async function courseInsights(courseId, { userId = null } = {}) {
  const tl = await loadCourseTimeline(courseId);
  if (!tl) return null;
  const today = tl.today;
  const learners = (await courseLearners(courseId)).filter((l) => userId == null || Number(l.id) === Number(userId));
  const ids = learners.map((l) => Number(l.id));
  const [outcomes, items, records, act, results, values] = await Promise.all([
    localDb.prepare("SELECT id, code, title FROM outcomes WHERE course_id = ? ORDER BY id").all(courseId),
    gradedItems(tl),
    workRecords(courseId),
    activity(courseId),
    resultRows(courseId),
    learnerOutcomeValues(courseId, ids),
  ]);
  const courseRunningDays = tl.startDate && compareDates(today, tl.startDate) >= 0 ? diffDays(tl.startDate, today) : null;

  const learnerRows = learners.map((l) => {
    const email = String(l.email).toLowerCase();
    const id = Number(l.id);
    const cur = values.current.filter((r) => Number(r.user_id) === id);
    const base = values.baseline.filter((r) => Number(r.user_id) === id);
    const perOutcome = outcomes.map((o) => {
      const c = cur.find((r) => Number(r.outcome_id) === Number(o.id));
      const b = base.find((r) => Number(r.outcome_id) === Number(o.id));
      return { outcomeId: o.id, current: c ? round(c.pct) : null, baseline: b ? round(b.pct) : null, results: c ? Number(c.n) : 0 };
    });
    const withCurrent = perOutcome.filter((o) => o.current != null);
    const paired = perOutcome.filter((o) => o.current != null && o.baseline != null);
    const overall = round(mean(withCurrent.map((o) => o.current)));
    const overallBaseline = round(mean(perOutcome.filter((o) => o.baseline != null).map((o) => o.baseline)));
    const pairedCurrent = round(mean(paired.map((o) => o.current)));
    const pairedBaseline = round(mean(paired.map((o) => o.baseline)));

    const timeliness = { onTime: 0, late: 0, missing: 0, toDo: 0, upcoming: 0 };
    const work = items.map((item) => {
      const record = records.get(recordKey(item, email));
      const state = itemState(item, record, today);
      timeliness[{ done_on_time: "onTime", done_late: "late", missing: "missing", to_do: "toDo", upcoming: "upcoming" }[state]] += 1;
      return { moduleItemId: item.moduleItemId, type: item.type, contentId: item.contentId, title: item.title, dueDate: item.dueDate, state, pct: record?.pct != null ? round(record.pct) : null, attempts: record?.attempts || 0 };
    });
    const handedIn = timeliness.onTime + timeliness.late;
    timeliness.onTimeRate = handedIn ? Math.round((timeliness.onTime / handedIn) * 100) / 100 : null;

    const engagement = act.get(email) || { lastActivityAt: null, activeDays14: 0, activeDays7: 0 };
    const rows = results.get(id) || [];
    const points = trajectory(rows);
    const toMastery = attemptsToMastery(rows);
    const reasons = riskReasons({ overall, resultsCount: rows.length, timeliness, engagement, points, courseRunningDays, today });

    return {
      id, email: l.email, name: l.full_name || l.email,
      overall, overallBaseline,
      deltaPoints: pairedCurrent != null && pairedBaseline != null ? pairedCurrent - pairedBaseline : null,
      normalizedGain: gain(pairedCurrent, pairedBaseline),
      outcomes: perOutcome.map((o) => ({
        ...o,
        deltaPoints: o.current != null && o.baseline != null ? o.current - o.baseline : null,
        normalizedGain: gain(o.current, o.baseline),
        resultsToMastery: toMastery.get(Number(o.outcomeId))?.reachedAt ?? null,
      })),
      resultsCount: rows.length,
      trajectory: points.slice(-TRAJECTORY_LENGTH),
      timeliness,
      engagement,
      work,
      risk: { flagged: reasons.length > 0, reasons },
    };
  });

  const mastery = await computeMastery(courseId);
  const outcomeRows = mastery.map((m) => {
    const learnerValues = learnerRows.map((l) => l.outcomes.find((o) => Number(o.outcomeId) === Number(m.id)));
    const reached = learnerValues.map((v) => v?.resultsToMastery).filter((n) => n != null).sort((a, b) => a - b);
    return {
      ...m,
      bands: bands(learnerValues.map((v) => v?.current ?? null)),
      learnersReachedMastery: reached.length,
      medianResultsToMastery: reached.length ? reached[Math.floor((reached.length - 1) / 2)] : null,
    };
  });

  const itemRows = items.map((item) => {
    const states = learnerRows.map((l) => l.work.find((w) => w.moduleItemId === item.moduleItemId));
    const count = (s) => states.filter((w) => w?.state === s).length;
    const pcts = states.map((w) => w?.pct).filter((p) => p != null);
    return {
      ...item,
      learners: learnerRows.length,
      handedIn: count("done_on_time") + count("done_late"),
      onTime: count("done_on_time"), late: count("done_late"), missing: count("missing"),
      graded: pcts.length,
      averagePct: round(mean(pcts)),
    };
  });

  const withData = learnerRows.filter((l) => l.overall != null);
  const handedIn = learnerRows.reduce((s, l) => s + l.timeliness.onTime + l.timeliness.late, 0);
  const onTime = learnerRows.reduce((s, l) => s + l.timeliness.onTime, 0);
  const paired = learnerRows.filter((l) => l.deltaPoints != null);
  return {
    course: { id: tl.course.id, title: tl.course.title, startDate: tl.startDate, lifecycle: tl.course.lifecycle },
    today,
    thresholds: { mastery: MASTERY_THRESHOLD, reteach: RETEACH_THRESHOLD },
    riskRules: RISK_RULES,
    outcomes: outcomeRows,
    items: itemRows,
    learners: learnerRows,
    class: {
      learners: learnerRows.length,
      learnersWithData: withData.length,
      averageMastery: round(mean(withData.map((l) => l.overall))),
      averageBaseline: round(mean(learnerRows.filter((l) => l.overallBaseline != null).map((l) => l.overallBaseline))),
      averageDeltaPoints: round(mean(paired.map((l) => l.deltaPoints))),
      learnersWithGrowthData: paired.length,
      bands: bands(learnerRows.map((l) => l.overall)),
      onTimeRate: handedIn ? Math.round((onTime / handedIn) * 100) / 100 : null,
      missing: learnerRows.reduce((s, l) => s + l.timeliness.missing, 0),
      atRisk: learnerRows.filter((l) => l.risk.flagged).length,
      activeLast7Days: learnerRows.filter((l) => l.engagement.activeDays7 > 0).length,
    },
  };
}

function bands(values) {
  const b = { needsReteach: 0, onTrack: 0, mastered: 0, noData: 0 };
  for (const v of values) {
    if (v == null) b.noData += 1;
    else if (v < RETEACH_THRESHOLD) b.needsReteach += 1;
    else if (v >= MASTERY_THRESHOLD) b.mastered += 1;
    else b.onTrack += 1;
  }
  return b;
}

/**
 * Item analysis for a graded quiz: per question, the share of learners whose latest attempt
 * answered correctly (multiple choice only) and how often each option was chosen.
 */
export async function quizItemAnalysis(courseId, quizId) {
  const quiz = await localDb.prepare("SELECT id, title, kind FROM quizzes WHERE id = ? AND course_id = ?").get(quizId, courseId);
  if (!quiz) return null;
  const questions = await localDb.prepare("SELECT id, position, prompt, question_type, options, correct_option, points, outcome_id FROM quiz_questions WHERE quiz_id = ? ORDER BY position, id").all(quizId);
  const latest = await localDb.prepare(`
    SELECT DISTINCT ON (qa.user_id) qa.answers FROM quiz_attempts qa
    JOIN users u ON u.id = qa.user_id
    JOIN enrollments e ON e.course_id = ? AND LOWER(e.user_email) = LOWER(u.email) AND e.role = 'student'
    WHERE qa.quiz_id = ? AND qa.submitted_at IS NOT NULL
    ORDER BY qa.user_id, qa.attempt_number DESC
  `).all(courseId, quizId);
  const answerSets = latest.map((r) => { try { return JSON.parse(r.answers || "{}"); } catch { return {}; } });
  return {
    quiz: { id: quiz.id, title: quiz.title, kind: quiz.kind },
    learnersAnswered: answerSets.length,
    questions: questions.map((q) => {
      let options = [];
      try { options = JSON.parse(q.options || "[]"); } catch { options = []; }
      const answered = answerSets.filter((a) => a[String(q.id)] != null && a[String(q.id)] !== "");
      const correct = q.question_type === "multiple_choice" && q.correct_option
        ? answered.filter((a) => a[String(q.id)] === q.correct_option).length : null;
      return {
        id: q.id, position: q.position, prompt: q.prompt, type: q.question_type, outcomeId: q.outcome_id,
        answered: answered.length,
        correct,
        pctCorrect: correct != null && answered.length ? Math.round((correct / answered.length) * 100) : null,
        options: Array.isArray(options) ? options.map((o) => {
          const id = typeof o === "object" ? o.id : o;
          return { id, text: typeof o === "object" ? o.text : o, correct: id === q.correct_option, chosen: answered.filter((a) => a[String(q.id)] === id).length };
        }) : [],
      };
    }),
  };
}

/**
 * Plain aggregates for the AI class summary: outcome codes and numbers only, never names.
 * codeFor(outcomeId) gives each outcome's code as sent to the model (codes must be unique).
 */
export function classSummaryStats(insights, codeFor = (id) => insights.outcomes.find((o) => o.id === id)?.code) {
  const stats = {
    learners: insights.class.learners,
    learnersWithResults: insights.class.learnersWithData,
    averageMastery: insights.class.averageMastery,
    onTimeRate: insights.class.onTimeRate,
    missingItems: insights.class.missing,
    outcomes: {},
  };
  for (const o of insights.outcomes) {
    stats.outcomes[codeFor(o.id)] = {
      title: o.title, mastery: o.currentMastery, baseline: o.baselineScore,
      learnersWithResults: o.learnersWithData, needReteach: o.bands.needsReteach, mastered: o.bands.mastered,
    };
  }
  return stats;
}
