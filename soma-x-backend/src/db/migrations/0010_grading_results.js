// Phase 6: outcome_results becomes the only source for mastery and growth.
// - Late flags on submissions and quiz attempts; extra quiz attempts a teacher can grant.
// - Audit log records what kind of change it was (grade, rubric, override) and by which role.
// - Backfill outcome_results from existing graded assignments and quiz attempts, so mastery
//   history isn't lost when it switches source. Legacy student_outcome_baselines rows are NOT
//   copied: before Phase 0 they could hold randomly generated scores. Real baselines (computed
//   from answers since Phase 4) are already in outcome_results.
const MIGRATION = '0010_grading_results';

/** Per-outcome percentages for one quiz attempt (same rules as the live code in results.js). */
function quizOutcomePcts(questions, answers, itemOutcomeIds) {
    const groups = new Map();
    const untagged = { earned: 0, possible: 0 };
    let earnedAll = 0;
    let possibleAll = 0;
    for (const q of questions) {
        const points = Number(q.points) || 0;
        const right = q.question_type === 'multiple_choice' && q.correct_option && answers[String(q.id)] === q.correct_option;
        possibleAll += points;
        if (right) earnedAll += points;
        const bucket = q.outcome_id ? (groups.get(Number(q.outcome_id)) || { earned: 0, possible: 0 }) : untagged;
        bucket.possible += points;
        if (right) bucket.earned += points;
        if (q.outcome_id) groups.set(Number(q.outcome_id), bucket);
    }
    const result = new Map();
    for (const [id, g] of groups) if (g.possible > 0) result.set(id, (g.earned / g.possible) * 100);
    const fallback = untagged.possible > 0 ? (untagged.earned / untagged.possible) * 100
        : (groups.size === 0 && possibleAll > 0 ? (earnedAll / possibleAll) * 100 : null);
    if (fallback !== null) {
        for (const id of itemOutcomeIds) if (!result.has(Number(id))) result.set(Number(id), fallback);
    }
    return result;
}

const round2 = (n) => Math.round(Math.min(100, Math.max(0, n)) * 100) / 100;

export async function up(client) {
    await client.query(`ALTER TABLE assignment_submissions ADD COLUMN is_late BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`ALTER TABLE quiz_attempts ADD COLUMN is_late BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`
        CREATE TABLE quiz_attempt_grants (
            id SERIAL PRIMARY KEY,
            quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            extra_attempts INTEGER NOT NULL CHECK (extra_attempts >= 1),
            granted_by TEXT NOT NULL,
            reason TEXT,
            granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await client.query(`CREATE INDEX quiz_attempt_grants_quiz_user_idx ON quiz_attempt_grants (quiz_id, user_id)`);
    await client.query(`
        ALTER TABLE grade_audit_log
            ADD COLUMN change_kind TEXT NOT NULL DEFAULT 'grade' CHECK (change_kind IN ('grade', 'rubric', 'override')),
            ADD COLUMN actor_role TEXT
    `);

    // ---- Backfill: graded assignments -> one result per tagged outcome --------------------
    const graded = (await client.query(`
        SELECT s.id AS submission_id, a.id AS assignment_id, a.course_id, a.points_possible, s.grade, s.graded_at, u.id AS user_id
        FROM assignment_submissions s
        JOIN assignments a ON a.id = s.assignment_id
        JOIN users u ON LOWER(u.email) = LOWER(s.scholar_email)
        WHERE s.grade IS NOT NULL AND a.points_possible > 0
    `)).rows;
    let assignmentRows = 0;
    for (const g of graded) {
        const outcomes = (await client.query(`SELECT outcome_id FROM item_outcomes WHERE item_type = 'assignment' AND item_id = $1`, [g.assignment_id])).rows;
        const pct = round2((Number(g.grade) / Number(g.points_possible)) * 100);
        for (const o of outcomes) {
            await client.query(`
                INSERT INTO outcome_results (user_id, course_id, outcome_id, source_type, source_id, pct, assessed_at)
                VALUES ($1, $2, $3, 'assignment_submission', $4, $5, COALESCE($6, CURRENT_TIMESTAMP))
                ON CONFLICT (user_id, outcome_id, source_type, source_id) DO NOTHING
            `, [g.user_id, g.course_id, o.outcome_id, g.submission_id, pct, g.graded_at]);
            assignmentRows += 1;
        }
    }

    // ---- Backfill: graded-quiz attempts -> per-outcome results --------------------------------
    const attempts = (await client.query(`
        SELECT qa.id, qa.quiz_id, qa.user_id, qa.answers, qa.submitted_at, q.course_id
        FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
        WHERE qa.submitted_at IS NOT NULL AND q.kind = 'graded'
    `)).rows;
    let quizRows = 0;
    for (const at of attempts) {
        const questions = (await client.query(`SELECT * FROM quiz_questions WHERE quiz_id = $1`, [at.quiz_id])).rows;
        const itemOutcomes = (await client.query(`SELECT outcome_id FROM item_outcomes WHERE item_type = 'quiz' AND item_id = $1`, [at.quiz_id])).rows.map((r) => r.outcome_id);
        let answers = {};
        try { answers = JSON.parse(at.answers || '{}'); } catch { answers = {}; }
        for (const [outcomeId, pct] of quizOutcomePcts(questions, answers, itemOutcomes)) {
            await client.query(`
                INSERT INTO outcome_results (user_id, course_id, outcome_id, source_type, source_id, pct, assessed_at)
                VALUES ($1, $2, $3, 'quiz_attempt', $4, $5, $6)
                ON CONFLICT (user_id, outcome_id, source_type, source_id) DO NOTHING
            `, [at.user_id, at.course_id, outcomeId, at.id, round2(pct), at.submitted_at]);
            quizRows += 1;
        }
    }

    const legacyBaselines = (await client.query(`SELECT COUNT(*)::int AS c FROM student_outcome_baselines`)).rows[0].c;
    await client.query(
        `INSERT INTO migration_report (migration_id, entity, action, details) VALUES ($1, 'outcome_results', 'backfilled', $2)`,
        [MIGRATION, `${assignmentRows} results from graded assignments, ${quizRows} from graded quiz attempts; ${legacyBaselines} legacy student_outcome_baselines rows not used (pre-Phase-0 rows may be fabricated)`]
    );
}
