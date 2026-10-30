// Announcements get a category (general, about one assignment, or the teacher's own label), an
// urgency level, and an audience: the whole course ("public"), or only the people and groups the
// teacher tagged. `pinned` was already set by the announcements screen but had no column.
export async function up(client) {
    await client.query(`
        ALTER TABLE announcements
            ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'assignment', 'custom')),
            ADD COLUMN custom_category TEXT,
            ADD COLUMN assignment_id INTEGER REFERENCES assignments(id) ON DELETE SET NULL,
            ADD COLUMN urgency TEXT NOT NULL DEFAULT 'normal' CHECK (urgency IN ('normal', 'important', 'urgent')),
            ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT true
    `);
    await client.query(`
        CREATE TABLE announcement_people (
            announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
            user_email TEXT NOT NULL,
            PRIMARY KEY (announcement_id, user_email)
        )
    `);
    await client.query(`
        CREATE TABLE announcement_groups (
            announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
            group_id INTEGER NOT NULL REFERENCES course_groups(id) ON DELETE CASCADE,
            PRIMARY KEY (announcement_id, group_id)
        )
    `);
}
