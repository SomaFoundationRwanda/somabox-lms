// Phase 4: the baseline decision is part of course setup. A course's baseline is pending
// until the teacher approves a baseline quiz or skips it with a reason (guide §12.4: skippable,
// with the reason recorded). Courses already opened are recorded as skipped so nothing
// changes for them.
//
// Also: a quiz is tagged with every outcome its questions are tagged with, so tagging
// questions satisfies "graded items need an outcome".
export async function up(client) {
    await client.query(`
        ALTER TABLE courses
            ADD COLUMN baseline_status TEXT NOT NULL DEFAULT 'pending' CHECK (baseline_status IN ('pending', 'approved', 'skipped')),
            ADD COLUMN baseline_skip_reason TEXT,
            ADD COLUMN baseline_decided_by TEXT,
            ADD COLUMN baseline_decided_at TIMESTAMP WITH TIME ZONE
    `);
    await client.query(`
        UPDATE courses
        SET baseline_status = 'skipped', baseline_skip_reason = 'Course opened before baseline decisions were recorded',
            baseline_decided_by = 'migration', baseline_decided_at = CURRENT_TIMESTAMP
        WHERE lifecycle <> 'draft'
    `);
    await client.query(`
        INSERT INTO migration_report (migration_id, course_id, entity, entity_id, action, details)
        SELECT '0009_course_setup', id, 'course', id, 'baseline_marked_skipped', 'already open when baseline decisions were introduced'
        FROM courses WHERE baseline_decided_by = 'migration'
    `);
    await client.query(`
        ALTER TABLE courses ADD CONSTRAINT courses_baseline_skip_has_reason
            CHECK (baseline_status <> 'skipped' OR length(trim(COALESCE(baseline_skip_reason, ''))) >= 10)
    `);

    await client.query(`
        INSERT INTO item_outcomes (course_id, item_type, item_id, outcome_id)
        SELECT DISTINCT q.course_id, 'quiz', q.id, qq.outcome_id
        FROM quiz_questions qq JOIN quizzes q ON q.id = qq.quiz_id
        WHERE qq.outcome_id IS NOT NULL
        ON CONFLICT (item_type, item_id, outcome_id) DO NOTHING
    `);
}
