// Phase 8: AI output is never written to live tables. Generation runs as background jobs that
// produce drafts; a teacher approves (creating unpublished items), edits, or rejects each draft.
// Every gateway call is logged, and admins can switch AI off for the school or per person.
export async function up(client) {
    await client.query(`
        CREATE TABLE ai_jobs (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            module_id INTEGER REFERENCES modules(id) ON DELETE SET NULL,
            kind TEXT NOT NULL CHECK (kind IN ('fill_week', 'story', 'outline', 'outcome_rewrite', 'quiz', 'rubric', 'grading')),
            status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled')),
            input JSONB NOT NULL DEFAULT '{}',
            progress INTEGER NOT NULL DEFAULT 0,
            total INTEGER NOT NULL DEFAULT 1,
            error TEXT,
            cancel_requested BOOLEAN NOT NULL DEFAULT false,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            requested_by TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            started_at TIMESTAMP WITH TIME ZONE,
            finished_at TIMESTAMP WITH TIME ZONE
        )
    `);
    await client.query(`CREATE INDEX ai_jobs_status_idx ON ai_jobs (status, created_at)`);
    await client.query(`CREATE INDEX ai_jobs_course_idx ON ai_jobs (course_id)`);

    await client.query(`
        CREATE TABLE ai_drafts (
            id SERIAL PRIMARY KEY,
            job_id INTEGER REFERENCES ai_jobs(id) ON DELETE SET NULL,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            module_id INTEGER REFERENCES modules(id) ON DELETE SET NULL,
            assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE,
            scholar_email TEXT,
            type TEXT NOT NULL CHECK (type IN ('page', 'quiz', 'assignment', 'story', 'outline', 'outcome', 'rubric', 'grading')),
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
            payload JSONB NOT NULL,
            original_payload JSONB NOT NULL,
            edited BOOLEAN NOT NULL DEFAULT false,
            created_by TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            decided_by TEXT,
            decided_at TIMESTAMP WITH TIME ZONE,
            result_refs JSONB
        )
    `);
    await client.query(`CREATE INDEX ai_drafts_course_status_idx ON ai_drafts (course_id, status)`);

    await client.query(`
        CREATE TABLE ai_calls (
            id BIGSERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            course_id VARCHAR(10) REFERENCES courses(id) ON DELETE SET NULL,
            feature TEXT NOT NULL,
            task TEXT,
            ok BOOLEAN NOT NULL,
            error_code TEXT,
            prompt_tokens INTEGER,
            completion_tokens INTEGER,
            latency_ms INTEGER,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await client.query(`CREATE INDEX ai_calls_user_idx ON ai_calls (user_id, created_at)`);

    await client.query(`ALTER TABLE users ADD COLUMN ai_enabled BOOLEAN NOT NULL DEFAULT true`);
    await client.query(`
        CREATE TABLE system_settings (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL,
            updated_by TEXT,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await client.query(`INSERT INTO system_settings (key, value, updated_by) VALUES ('ai_enabled', 'true', 'migration')`);
}
