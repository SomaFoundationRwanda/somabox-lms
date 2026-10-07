// Phase 9: course Insights.
// - Every course gets an Insights nav item (teachers only by default); existing courses keep
//   their other nav choices.
// - AI class summaries run as jobs; their text result is stored on the job (it is teacher-only
//   commentary, never course content).
// - Retention for usage logs (usage_events, ai_calls), set by admins.
export async function up(client) {
    await client.query(`
        INSERT INTO course_nav_items (course_id, nav_key, label, position, visible_to_students, is_default)
        SELECT c.id, 'insights', 'Insights',
               COALESCE((SELECT MAX(position) + 1 FROM course_nav_items n WHERE n.course_id = c.id), 0), 0, 1
        FROM courses c
        ON CONFLICT (course_id, nav_key) DO NOTHING
    `);

    await client.query(`ALTER TABLE ai_jobs DROP CONSTRAINT IF EXISTS ai_jobs_kind_check`);
    await client.query(`
        ALTER TABLE ai_jobs ADD CONSTRAINT ai_jobs_kind_check CHECK (kind IN (
            'fill_week', 'story', 'outline', 'outcome_rewrite', 'quiz', 'rubric', 'grading', 'class_summary'
        ))
    `);
    await client.query(`ALTER TABLE ai_jobs ADD COLUMN result JSONB`);

    await client.query(`
        INSERT INTO system_settings (key, value, updated_by) VALUES ('usage_retention_days', '365', 'migration')
        ON CONFLICT (key) DO NOTHING
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS outcome_results_course_user_idx ON outcome_results (course_id, user_id)`);
}
