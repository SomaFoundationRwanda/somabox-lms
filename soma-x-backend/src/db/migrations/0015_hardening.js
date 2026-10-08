// Phase 11: indexes for the lookups that run on every page or every night on a low-end box.
export async function up(client) {
    // Daily cleanups (usage retention, sent outbox rows, expired sessions) filter by time.
    await client.query(`CREATE INDEX usage_events_created_idx ON usage_events (created_at)`);
    await client.query(`CREATE INDEX ai_calls_created_idx ON ai_calls (created_at)`);
    await client.query(`CREATE INDEX sync_outbox_sent_idx ON sync_outbox (sent_at) WHERE sent_at IS NOT NULL`);
    await client.query(`CREATE INDEX sessions_expires_idx ON sessions (expires_at)`);
    // Insights activity and progress lookups by learner.
    await client.query(`CREATE INDEX module_item_progress_email_idx ON module_item_progress (LOWER(user_email))`);
    await client.query(`CREATE INDEX discussion_replies_author_idx ON discussion_replies (LOWER(author_email))`);
    await client.query(`CREATE INDEX item_outcomes_course_idx ON item_outcomes (course_id)`);
}
