// Group work: an assignment given to groups can take one submission per group. When one member
// hands it in, every member of that group has it as handed in (submitted_by names who did, and
// group_id which group), and a mark given to one is given to the whole group.
export async function up(client) {
    await client.query(`ALTER TABLE assignments ADD COLUMN group_submission BOOLEAN NOT NULL DEFAULT false`);
    await client.query(`
        ALTER TABLE assignment_submissions
            ADD COLUMN submitted_by TEXT,
            ADD COLUMN group_id INTEGER REFERENCES course_groups(id) ON DELETE SET NULL
    `);
}
