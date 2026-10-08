// Phase 10: box-to-cloud sync outbox, and course bundles.
//
// Sync: every change to a synced table is captured by a trigger into sync_outbox (so no code
// path — screens, AI, imports — can forget to sync). A scheduled job pushes batches to the
// cloud; nothing syncs at login any more. Each synced row gets a stable sync_id (UUID) so rows
// from many boxes never collide in the cloud. What actually leaves the box is filtered at push
// time by the admin's sync scope (system_settings 'sync_scope').
//
// Bundles: a portable copy of a course's structure and content (relative days only, no
// learner data). Uploaded bundles are kept as read-only versions in course_bundles; importing
// always creates a new draft course and never overwrites an existing (possibly edited) copy.
export const SYNCED_TABLES = [
    'users', 'courses', 'outcomes', 'enrollments', 'assignment_submissions', 'submission_scores',
    'grade_audit_log', 'quiz_attempts', 'outcome_results', 'usage_events',
];

export async function up(client) {
    for (const table of SYNCED_TABLES) {
        await client.query(`ALTER TABLE ${table} ADD COLUMN sync_id UUID NOT NULL DEFAULT gen_random_uuid()`);
        await client.query(`CREATE UNIQUE INDEX ${table}_sync_id_idx ON ${table} (sync_id)`);
    }

    await client.query(`
        CREATE TABLE sync_outbox (
            id BIGSERIAL PRIMARY KEY,
            sync_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
            entity TEXT NOT NULL,
            op TEXT NOT NULL CHECK (op IN ('insert', 'update', 'delete', 'snapshot')),
            entity_sync_id UUID,
            payload JSONB NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            sent_at TIMESTAMP WITH TIME ZONE,
            skipped BOOLEAN NOT NULL DEFAULT false,
            attempts INTEGER NOT NULL DEFAULT 0,
            last_error TEXT
        )
    `);
    await client.query(`CREATE INDEX sync_outbox_pending_idx ON sync_outbox (id) WHERE sent_at IS NULL`);

    // One-time snapshot of what already exists, so the cloud starts complete.
    for (const table of SYNCED_TABLES) {
        await client.query(`
            INSERT INTO sync_outbox (entity, op, entity_sync_id, payload, created_at)
            SELECT '${table}', 'snapshot', t.sync_id, to_jsonb(t) - 'password_hash', CURRENT_TIMESTAMP FROM ${table} t
        `);
    }

    await client.query(`
        CREATE FUNCTION sync_enqueue() RETURNS trigger AS $$
        DECLARE rec jsonb;
        BEGIN
            IF TG_OP = 'DELETE' THEN rec := to_jsonb(OLD); ELSE rec := to_jsonb(NEW); END IF;
            -- Never copy password hashes anywhere, even into the local outbox.
            rec := rec - 'password_hash';
            INSERT INTO sync_outbox (entity, op, entity_sync_id, payload)
            VALUES (TG_TABLE_NAME, lower(TG_OP), (rec->>'sync_id')::uuid, rec);
            RETURN NULL;
        END
        $$ LANGUAGE plpgsql
    `);
    for (const table of SYNCED_TABLES) {
        if (table === 'quiz_attempts') {
            // Only submitted attempts matter; in-progress saves don't.
            await client.query(`
                CREATE TRIGGER quiz_attempts_sync AFTER INSERT OR UPDATE ON quiz_attempts
                FOR EACH ROW WHEN (NEW.submitted_at IS NOT NULL) EXECUTE FUNCTION sync_enqueue()
            `);
        } else if (table === 'users') {
            // Logins and password changes aren't sync-worthy: only profile and role changes.
            await client.query(`
                CREATE TRIGGER users_sync AFTER INSERT OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION sync_enqueue()
            `);
            await client.query(`
                CREATE TRIGGER users_sync_update AFTER UPDATE ON users FOR EACH ROW
                WHEN ((to_jsonb(OLD) - 'password_hash' - 'must_change_password') IS DISTINCT FROM (to_jsonb(NEW) - 'password_hash' - 'must_change_password'))
                EXECUTE FUNCTION sync_enqueue()
            `);
        } else {
            await client.query(`
                CREATE TRIGGER ${table}_sync AFTER INSERT OR UPDATE OR DELETE ON ${table}
                FOR EACH ROW EXECUTE FUNCTION sync_enqueue()
            `);
        }
    }

    await client.query(`
        INSERT INTO system_settings (key, value, updated_by) VALUES
            ('box_id', to_jsonb(gen_random_uuid()::text), 'migration'),
            ('sync_scope', '{"courses": true, "enrollments": true, "grades": true, "outcomeResults": true, "events": true, "people": "pseudonymous", "submissionText": false}', 'migration')
        ON CONFLICT (key) DO NOTHING
    `);

    // ---- Bundles ----------------------------------------------------------------------------
    await client.query(`
        CREATE TABLE course_bundles (
            id SERIAL PRIMARY KEY,
            bundle_id UUID NOT NULL,
            version INTEGER NOT NULL CHECK (version >= 1),
            title TEXT NOT NULL,
            format_version INTEGER NOT NULL,
            content_hash TEXT NOT NULL,
            data JSONB NOT NULL,
            source TEXT NOT NULL CHECK (source IN ('upload', 'export', 'cloud')),
            added_by TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (bundle_id, version)
        )
    `);
    await client.query(`
        ALTER TABLE courses
            ADD COLUMN bundle_id UUID,
            ADD COLUMN bundle_version INTEGER,
            ADD COLUMN bundle_export_hash TEXT,
            ADD COLUMN imported_bundle_id UUID,
            ADD COLUMN imported_bundle_version INTEGER,
            ADD COLUMN imported_at TIMESTAMP WITH TIME ZONE
    `);
}
