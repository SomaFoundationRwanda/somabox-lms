// AI summaries of Explore and Library files for learners (books from their text, videos and audio
// from a transcript file next to them). A summary is made once per file and language, then shared
// by everyone. Admins can switch the feature off, hide a summary, or have it made again.
export async function up(client) {
    await client.query(`
        CREATE TABLE content_summaries (
            id SERIAL PRIMARY KEY,
            path_key TEXT NOT NULL,
            language TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed')),
            summary JSONB,
            error TEXT,
            source_size BIGINT,
            parts_read INTEGER,
            parts_total INTEGER,
            hidden BOOLEAN NOT NULL DEFAULT false,
            requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            finished_at TIMESTAMP WITH TIME ZONE,
            UNIQUE (path_key, language)
        )
    `);
    await client.query(`CREATE INDEX content_summaries_status_idx ON content_summaries (status, id)`);
    await client.query(`
        INSERT INTO system_settings (key, value, updated_by) VALUES ('learner_summaries_enabled', 'true', 'migration')
        ON CONFLICT (key) DO NOTHING
    `);
}
