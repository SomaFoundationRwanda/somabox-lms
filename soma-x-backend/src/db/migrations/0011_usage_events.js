// Phase 7: an append-only log of product usage (first used for explainer opens: where teachers
// look for help is where they're confused). Phase 9 analytics adds more event types.
export async function up(client) {
    await client.query(`
        CREATE TABLE usage_events (
            id BIGSERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            role TEXT,
            course_id VARCHAR(10) REFERENCES courses(id) ON DELETE SET NULL,
            event_type TEXT NOT NULL,
            data JSONB NOT NULL DEFAULT '{}',
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await client.query(`CREATE INDEX usage_events_type_time_idx ON usage_events (event_type, created_at)`);
    await client.query(`CREATE INDEX usage_events_course_idx ON usage_events (course_id)`);
}
