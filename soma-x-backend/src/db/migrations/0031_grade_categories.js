// Graded work gets a type (the assessment groups Rwandan schools use: remedial tests, short and
// long quizzes, midterm and general tests, exams), so the gradebook can group and filter by it.
// Existing work has no type until its teacher picks one.
// Teachers can also keep an item's scores hidden from learners until they publish them.
const CATEGORIES = "('remedial_test', 'short_quiz', 'midterm_test', 'long_quiz', 'general_test', 'exam')";

export async function up(client) {
    for (const table of ["assignments", "quizzes"]) {
        await client.query(`ALTER TABLE ${table} ADD COLUMN category TEXT CHECK (category IS NULL OR category IN ${CATEGORIES})`);
        await client.query(`ALTER TABLE ${table} ADD COLUMN scores_hidden BOOLEAN NOT NULL DEFAULT false`);
    }
}
