// Joining with a course's code is a request the course's teacher approves (a code can travel
// beyond the class): its enrollment is 'pending' until then. Learners keep their own class
// (users.grade_level) and can belong to more (annex_classes) when they're placed in a course of
// another class, e.g. one they joined by mistake or a shared lesson.
export async function up(client) {
    const constraint = (await client.query(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'enrollments'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%status%'
    `)).rows[0];
    if (constraint) await client.query(`ALTER TABLE enrollments DROP CONSTRAINT ${constraint.conname}`);
    await client.query(`
        ALTER TABLE enrollments ADD CONSTRAINT enrollments_status_check
        CHECK (status IN ('active', 'invited', 'inactive', 'concluded', 'pending'))
    `);
    await client.query(`ALTER TABLE users ADD COLUMN annex_classes JSONB NOT NULL DEFAULT '[]'::jsonb`);
}
