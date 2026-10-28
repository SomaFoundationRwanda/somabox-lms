// The learning record the foundation needs always reaches the cloud (sync/outbox.js, REQUIRED):
// lessons and their types (baseline, tests...), every result (baseline, quizzes, assignments,
// outcome mastery, progress over time), and how people use the box (lessons opened, items done,
// discussion replies, sign-ins and active days). Files and videos never leave the box.
//
// The tables below weren't synced before, so they get a sync_id and the outbox trigger. Then the
// whole record is queued again as snapshots: what boxes held before (including changes skipped
// while an admin had switched a kind off) reaches the cloud with this update, without anyone
// reinstalling anything.
export const LEARNING_TABLES = [
    'modules', 'module_items', 'assignments', 'quizzes', 'course_pages', 'discussions', 'item_outcomes',
    'student_outcome_baselines', 'diagnostic_results', 'longitudinal_progress',
    'module_item_progress', 'page_views', 'discussion_replies',
];

// Already synced, in the kinds that are now always sent.
const RESEND_TABLES = [
    'users', 'courses', 'outcomes', 'enrollments', 'assignment_submissions', 'submission_scores',
    'grade_audit_log', 'outcome_results', 'usage_events',
];

// Views are updated on every visit: only a new day or finishing counts as a change.
const VIEW_TABLES = ['module_item_progress', 'page_views'];

export async function up(client) {
    for (const table of LEARNING_TABLES) {
        await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS sync_id UUID NOT NULL DEFAULT gen_random_uuid()`);
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${table}_sync_id_idx ON ${table} (sync_id)`);
        if (VIEW_TABLES.includes(table)) {
            await client.query(`CREATE TRIGGER ${table}_sync AFTER INSERT OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION sync_enqueue()`);
            await client.query(`
                CREATE TRIGGER ${table}_sync_update AFTER UPDATE ON ${table} FOR EACH ROW
                WHEN (OLD.completed_at IS DISTINCT FROM NEW.completed_at OR OLD.last_viewed_at::date IS DISTINCT FROM NEW.last_viewed_at::date)
                EXECUTE FUNCTION sync_enqueue()
            `);
        } else {
            await client.query(`CREATE TRIGGER ${table}_sync AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION sync_enqueue()`);
        }
    }

    for (const table of [...RESEND_TABLES, ...LEARNING_TABLES]) {
        await client.query(`
            INSERT INTO sync_outbox (entity, op, entity_sync_id, payload, created_at)
            SELECT '${table}', 'snapshot', t.sync_id, to_jsonb(t) - 'password_hash', CURRENT_TIMESTAMP FROM ${table} t
        `);
    }
    // Only handed-in quiz attempts are synced (as in 0014).
    await client.query(`
        INSERT INTO sync_outbox (entity, op, entity_sync_id, payload, created_at)
        SELECT 'quiz_attempts', 'snapshot', t.sync_id, to_jsonb(t), CURRENT_TIMESTAMP FROM quiz_attempts t WHERE t.submitted_at IS NOT NULL
    `);

    // The kinds that are always sent are switched on for every box, and people are at least
    // pseudonymous (the admin still chooses names and emails, attendance and written work).
    await client.query(`
        UPDATE system_settings
        SET value = value || '{"courses": true, "enrollments": true, "grades": true, "outcomeResults": true, "events": true}'::jsonb
            || CASE WHEN value->>'people' = 'none' THEN '{"people": "pseudonymous"}'::jsonb ELSE '{}'::jsonb END,
            updated_by = 'migration', updated_at = CURRENT_TIMESTAMP
        WHERE key = 'sync_scope'
    `);
}
