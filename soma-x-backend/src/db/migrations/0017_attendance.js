// Attendance: a teacher takes the register for a class session (a date, optionally named, e.g.
// "Morning" / "Afternoon"); each learner is present, late, absent, or excused. Records are keyed
// by user id (not email), sync to the cloud like grades, and appear as an "Attendance" item in
// every course's navigation.
export async function up(client) {
    await client.query(`
        CREATE TABLE attendance_sessions (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            session_date DATE NOT NULL,
            title TEXT NOT NULL DEFAULT 'Class' CHECK (length(trim(title)) > 0),
            created_by TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            sync_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
            UNIQUE (course_id, session_date, title)
        )
    `);
    await client.query(`CREATE INDEX attendance_sessions_course_date_idx ON attendance_sessions (course_id, session_date)`);
    await client.query(`
        CREATE TABLE attendance_records (
            id SERIAL PRIMARY KEY,
            session_id INTEGER NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status TEXT NOT NULL CHECK (status IN ('present', 'late', 'absent', 'excused')),
            note TEXT,
            marked_by TEXT,
            marked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            sync_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
            UNIQUE (session_id, user_id)
        )
    `);
    await client.query(`CREATE INDEX attendance_records_user_idx ON attendance_records (user_id)`);
    for (const table of ['attendance_sessions', 'attendance_records']) {
        await client.query(`CREATE TRIGGER ${table}_sync AFTER INSERT OR UPDATE OR DELETE ON ${table} FOR EACH ROW EXECUTE FUNCTION sync_enqueue()`);
    }

    // Navigation: learners see their own attendance, so it's visible to them by default.
    const constraint = (await client.query(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'course_nav_items'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%nav_key%'
    `)).rows[0];
    if (constraint) await client.query(`ALTER TABLE course_nav_items DROP CONSTRAINT ${constraint.conname}`);
    await client.query(`
        ALTER TABLE course_nav_items ADD CONSTRAINT course_nav_items_nav_key_check CHECK (nav_key IN (
            'home', 'announcements', 'syllabus', 'modules', 'grades', 'people', 'assignments',
            'rubrics', 'files', 'collaborations', 'outcomes', 'quizzes', 'pages', 'discussions', 'settings',
            'calendar', 'insights', 'attendance'
        ))
    `);
    await client.query(`
        INSERT INTO course_nav_items (course_id, nav_key, label, position, visible_to_students, is_default)
        SELECT c.id, 'attendance', 'Attendance',
               COALESCE((SELECT MAX(position) + 1 FROM course_nav_items n WHERE n.course_id = c.id), 0), 1, 1
        FROM courses c
        ON CONFLICT (course_id, nav_key) DO NOTHING
    `);
}
