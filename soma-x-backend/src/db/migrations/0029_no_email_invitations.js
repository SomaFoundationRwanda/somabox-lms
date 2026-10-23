// Course places are only for existing accounts now (an invitation saved for an email without an
// account could be claimed by whoever signed up with that email first), and assistants must be
// teacher accounts (an assistant sees the whole class's marks).
// - invited places of people who have an account become active; the others are removed;
// - learner accounts that were assistants become learners in that course.
export async function up(client) {
    await client.query(`
        UPDATE enrollments e SET status = 'active', joined_at = COALESCE(e.joined_at, CURRENT_TIMESTAMP)
        WHERE e.status = 'invited' AND EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(e.user_email))
    `);
    await client.query(`DELETE FROM enrollments WHERE status = 'invited'`);
    await client.query(`
        UPDATE enrollments e SET role = 'student'
        WHERE e.role = 'ta' AND EXISTS (SELECT 1 FROM users u WHERE LOWER(u.email) = LOWER(e.user_email) AND u.role = 'scholar')
    `);
}
