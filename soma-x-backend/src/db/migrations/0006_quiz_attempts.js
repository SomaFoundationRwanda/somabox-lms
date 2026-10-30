// Phase 2 (guide §5.4): quizzes have a kind and attempt settings, questions can be tagged with
// an outcome, and every submission is kept as an attempt instead of overwriting the last one.
// quiz_submissions becomes a view of each learner's latest submitted attempt, so existing
// readers (grades, mastery, interleaving) keep working unchanged.
const MIGRATION = '0006_quiz_attempts';

export async function up(client) {
    await client.query(`
        ALTER TABLE quizzes ADD COLUMN kind TEXT NOT NULL DEFAULT 'graded'
            CHECK (kind IN ('baseline', 'practice', 'graded'))
    `);
    // NULL = unlimited. Existing quizzes stay unlimited (that was the old behaviour);
    // the default retake policy is an open decision (guide §12.8).
    await client.query(`ALTER TABLE quizzes ADD COLUMN attempts_allowed INTEGER CHECK (attempts_allowed IS NULL OR attempts_allowed >= 1)`);
    await client.query(`ALTER TABLE quizzes ADD COLUMN time_limit_minutes INTEGER CHECK (time_limit_minutes IS NULL OR time_limit_minutes >= 1)`);
    const baselineQuizzes = (await client.query(`
        UPDATE quizzes q SET kind = 'baseline' FROM modules m
        WHERE q.module_id = m.id AND m.kind = 'baseline'
        RETURNING q.id, q.course_id
    `)).rows;
    for (const q of baselineQuizzes) {
        await client.query(
            `INSERT INTO migration_report (migration_id, course_id, entity, entity_id, action) VALUES ($1, $2, 'quiz', $3, 'marked_baseline_quiz')`,
            [MIGRATION, q.course_id, String(q.id)]
        );
    }

    await client.query(`ALTER TABLE quiz_questions ADD COLUMN outcome_id INTEGER REFERENCES outcomes(id) ON DELETE SET NULL`);

    await client.query(`
        CREATE TABLE quiz_attempts (
            id SERIAL PRIMARY KEY,
            quiz_id INTEGER NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
            answers TEXT NOT NULL DEFAULT '{}',
            started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            submitted_at TIMESTAMP WITH TIME ZONE,
            score_points NUMERIC,
            score_pct NUMERIC,
            UNIQUE (quiz_id, user_id, attempt_number)
        )
    `);
    await client.query(`CREATE INDEX quiz_attempts_user_idx ON quiz_attempts (user_id)`);

    // Existing submissions become attempt 1 (the only one that survived the old overwrite).
    await client.query(`
        INSERT INTO quiz_attempts (quiz_id, user_id, attempt_number, answers, started_at, submitted_at, score_points, score_pct)
        SELECT qs.quiz_id, u.id, 1, COALESCE(qs.answers, '{}'), COALESCE(qs.submitted_at, CURRENT_TIMESTAMP),
               COALESCE(qs.submitted_at, CURRENT_TIMESTAMP), qs.score,
               CASE WHEN tot.total > 0 AND qs.score IS NOT NULL THEN ROUND(qs.score / tot.total * 100, 2) END
        FROM quiz_submissions qs
        JOIN users u ON LOWER(u.email) = LOWER(qs.scholar_email)
        LEFT JOIN (SELECT quiz_id, SUM(points) AS total FROM quiz_questions GROUP BY quiz_id) tot ON tot.quiz_id = qs.quiz_id
    `);
    // Submissions from emails with no account can't become attempts: keep them in quarantine.
    await client.query(`
        INSERT INTO migration_quarantine (migration_id, source_table, source_id, course_id, reason, payload)
        SELECT $1, 'quiz_submissions', qs.id::text, q.course_id, 'no user account for scholar_email', to_jsonb(qs)
        FROM quiz_submissions qs JOIN quizzes q ON q.id = qs.quiz_id
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(qs.scholar_email))
    `, [MIGRATION]);

    await client.query(`DROP TABLE quiz_submissions`);
    await client.query(`
        CREATE VIEW quiz_submissions AS
        SELECT DISTINCT ON (a.quiz_id, a.user_id)
               a.id, a.quiz_id, LOWER(u.email) AS scholar_email, a.answers,
               a.score_points AS score, a.score_pct, a.submitted_at, a.attempt_number
        FROM quiz_attempts a
        JOIN users u ON u.id = a.user_id
        WHERE a.submitted_at IS NOT NULL
        ORDER BY a.quiz_id, a.user_id, a.attempt_number DESC
    `);
}
