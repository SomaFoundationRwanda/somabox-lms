// "Preliminary test" joins the types of graded work (given at the start, before teaching).
const CATEGORIES = "('preliminary_test', 'remedial_test', 'short_quiz', 'midterm_test', 'long_quiz', 'general_test', 'exam')";

export async function up(client) {
    for (const table of ["assignments", "quizzes"]) {
        await client.query(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${table}_category_check`);
        await client.query(`ALTER TABLE ${table} ADD CONSTRAINT ${table}_category_check CHECK (category IS NULL OR category IN ${CATEGORIES})`);
    }
}
