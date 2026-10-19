// Join codes: a short code a teacher shares so learners can join a course themselves (most pupils
// have no email address to be invited by). Kept out of the courses table on purpose: course rows
// are returned whole in listings learners see, and synced to the cloud, and the code is neither
// for learners to read nor for the cloud. No row = joining by code is off for that course.
export async function up(client) {
    await client.query(`
        CREATE TABLE course_join_codes (
            course_id VARCHAR(10) PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
            code TEXT NOT NULL UNIQUE,
            created_by TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
}
