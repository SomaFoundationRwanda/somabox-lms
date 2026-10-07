// Phase 2 (guide §5.1): one course lifecycle field, plus the bookkeeping tables later
// integrity migrations use to report what they changed and quarantine what they couldn't
// migrate (never silently dropped). Also adds outcomes.mastery_scale, which the outcome
// routes already wrote but no schema ever created (creating an outcome failed).
export async function up(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS migration_quarantine (
            id SERIAL PRIMARY KEY,
            migration_id TEXT NOT NULL,
            source_table TEXT NOT NULL,
            source_id TEXT,
            course_id TEXT,
            reason TEXT NOT NULL,
            payload JSONB,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await client.query(`
        CREATE TABLE IF NOT EXISTS migration_report (
            id SERIAL PRIMARY KEY,
            migration_id TEXT NOT NULL,
            course_id TEXT,
            entity TEXT NOT NULL,
            entity_id TEXT,
            action TEXT NOT NULL,
            details TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await client.query(`
        ALTER TABLE outcomes ADD COLUMN IF NOT EXISTS mastery_scale TEXT NOT NULL DEFAULT '4pt'
            CHECK (mastery_scale IN ('4pt', 'percent', 'pass_fail'))
    `);

    // draft: being set up (only staff can see it). open: running. closed: finished,
    // read-only for learners. archived: hidden from lists.
    await client.query(`
        ALTER TABLE courses ADD COLUMN lifecycle TEXT NOT NULL DEFAULT 'draft'
            CHECK (lifecycle IN ('draft', 'open', 'closed', 'archived'))
    `);
    await client.query(`
        UPDATE courses SET lifecycle = CASE
            WHEN status = 'completed' THEN 'closed'
            WHEN COALESCE(is_opened, 0) = 1 OR status = 'active' THEN 'open'
            ELSE 'draft'
        END
    `);
    await client.query(`
        INSERT INTO migration_report (migration_id, course_id, entity, entity_id, action, details)
        SELECT '0004_lifecycle_and_quarantine', id, 'course', id, 'set_lifecycle',
               'status=' || status || ', is_opened=' || COALESCE(is_opened, 0) || ' -> ' || lifecycle
        FROM courses
    `);
    await client.query(`ALTER TABLE courses DROP COLUMN status`);
    await client.query(`ALTER TABLE courses DROP COLUMN is_opened`);
}
