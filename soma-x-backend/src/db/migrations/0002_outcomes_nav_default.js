// Previously ran on every startup and overwrote teachers' choices. Now applied once:
// put Outcomes second in the course nav and make it visible to students.
export async function up(client) {
    await client.query(`
        UPDATE course_nav_items SET position = 1, visible_to_students = 1
        WHERE nav_key = 'outcomes'
    `);
}
