// Phase 0: forced password change flag, setup gate backfill, AI-stub item refs.
export async function up(client) {
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password INTEGER DEFAULT 0`);

    // is_opened used to be added by initSchemas; it lives here so it isn't re-added
    // after 0004 replaces it with courses.lifecycle.
    await client.query(`ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_opened INTEGER DEFAULT 0`);

    // New courses start unpublished with is_opened = 0. Courses that were already
    // active before the setup gate existed are treated as opened.
    await client.query(`UPDATE courses SET is_opened = 1 WHERE status = 'active' AND COALESCE(is_opened, 0) = 0`);

    // Early AI-stub items only set item_ref_id; readers use content_ref_id.
    await client.query(`
        UPDATE module_items
        SET content_ref_id = item_ref_id,
            content_ref_table = CASE item_type
                WHEN 'page' THEN 'course_pages'
                WHEN 'assignment' THEN 'assignments'
                WHEN 'quiz' THEN 'quizzes'
                WHEN 'file' THEN 'course_files'
                WHEN 'discussion' THEN 'discussions'
            END
        WHERE content_ref_id IS NULL AND item_ref_id IS NOT NULL AND item_type <> 'sub_header'
    `);
}
