// The work and discussions learners were already told about (once each, courses/notify.js).
// What exists today counts as told, so nobody gets a message for every old item.
export async function up(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS announced_items (
            item_type TEXT NOT NULL,
            content_id INTEGER NOT NULL,
            announced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (item_type, content_id)
        )
    `);
    await client.query(`
        INSERT INTO announced_items (item_type, content_id)
        SELECT 'assignment', id FROM assignments UNION ALL
        SELECT 'quiz', id FROM quizzes UNION ALL
        SELECT 'discussion', id FROM discussions
        ON CONFLICT DO NOTHING
    `);
}
