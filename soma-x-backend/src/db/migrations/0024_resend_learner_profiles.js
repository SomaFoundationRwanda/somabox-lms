// The cloud now receives learners' codes and profile answers in pseudonymous mode (sync/outbox.js,
// PSEUDONYMOUS_USER_FIELDS). People synced before only reached it with id, role and grade, so queue
// one fresh snapshot of every user; the outbox already holds full rows and filters at send time.
export async function up(client) {
    await client.query(`
        INSERT INTO sync_outbox (entity, op, entity_sync_id, payload, created_at)
        SELECT 'users', 'snapshot', u.sync_id, to_jsonb(u) - 'password_hash', CURRENT_TIMESTAMP FROM users u
    `);
}
