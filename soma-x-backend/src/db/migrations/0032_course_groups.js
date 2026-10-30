// Groups inside a course: the teacher puts enrolled learners into named groups. An assignment
// can be given to one or more groups (only their members see and do it), and a discussion can
// belong to one group (only its members and the course's staff see it). Groups get a "Groups"
// item in every course's navigation.
export async function up(client) {
    await client.query(`
        CREATE TABLE course_groups (
            id SERIAL PRIMARY KEY,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            name TEXT NOT NULL CHECK (length(trim(name)) > 0),
            created_by TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await client.query(`CREATE UNIQUE INDEX course_groups_name_idx ON course_groups (course_id, LOWER(name))`);
    await client.query(`
        CREATE TABLE course_group_members (
            group_id INTEGER NOT NULL REFERENCES course_groups(id) ON DELETE CASCADE,
            user_email TEXT NOT NULL,
            added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (group_id, user_email)
        )
    `);
    await client.query(`CREATE INDEX course_group_members_email_idx ON course_group_members (LOWER(user_email))`);
    await client.query(`
        CREATE TABLE assignment_groups (
            assignment_id INTEGER NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
            group_id INTEGER NOT NULL REFERENCES course_groups(id) ON DELETE CASCADE,
            PRIMARY KEY (assignment_id, group_id)
        )
    `);
    // A group's discussions are deleted with it (by the route, with their module listings);
    // the key stops a group being removed while one is left.
    await client.query(`ALTER TABLE discussions ADD COLUMN group_id INTEGER REFERENCES course_groups(id)`);

    const constraint = (await client.query(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'course_nav_items'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%nav_key%'
    `)).rows[0];
    if (constraint) await client.query(`ALTER TABLE course_nav_items DROP CONSTRAINT ${constraint.conname}`);
    await client.query(`
        ALTER TABLE course_nav_items ADD CONSTRAINT course_nav_items_nav_key_check CHECK (nav_key IN (
            'home', 'announcements', 'syllabus', 'modules', 'grades', 'people', 'assignments',
            'rubrics', 'files', 'collaborations', 'outcomes', 'quizzes', 'pages', 'discussions', 'settings',
            'calendar', 'insights', 'attendance', 'groups'
        ))
    `);
    await client.query(`
        INSERT INTO course_nav_items (course_id, nav_key, label, position, visible_to_students, is_default)
        SELECT c.id, 'groups', 'Groups',
               COALESCE((SELECT MAX(position) + 1 FROM course_nav_items n WHERE n.course_id = c.id), 0), 1, 1
        FROM courses c
        ON CONFLICT (course_id, nav_key) DO NOTHING
    `);
}
