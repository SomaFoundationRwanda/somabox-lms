// Phase 2 (guide §5.2, §5.3): every assignment, quiz, page, and discussion belongs to exactly
// one module, and module_items links to its content through one column (content_id).
// Modules get a kind: one optional baseline module per course (Week 0), regular modules
// numbered from week 1, and an "Unassigned (fix me)" holding module for content that wasn't
// in any module. Nothing is silently dropped: changes go to migration_report, and rows that
// can't be migrated go to migration_quarantine before they are removed.
const MIGRATION = '0005_module_ownership';

const CONTENT = [
    // Discussions first: graded-discussion assignments inherit their discussion's module.
    { type: 'discussion', table: 'discussions' },
    { type: 'assignment', table: 'assignments' },
    { type: 'quiz', table: 'quizzes' },
    { type: 'page', table: 'course_pages' },
];
const ITEM_TABLES = { ...Object.fromEntries(CONTENT.map((c) => [c.type, c.table])), file: 'course_files' };

async function report(client, courseId, entity, entityId, action, details) {
    await client.query(
        `INSERT INTO migration_report (migration_id, course_id, entity, entity_id, action, details) VALUES ($1, $2, $3, $4, $5, $6)`,
        [MIGRATION, courseId, entity, entityId == null ? null : String(entityId), action, details]
    );
}

async function quarantineModuleItems(client, whereSql, reason) {
    const rows = (await client.query(`
        SELECT mi.*, m.course_id FROM module_items mi JOIN modules m ON m.id = mi.module_id WHERE ${whereSql}
    `)).rows;
    for (const row of rows) {
        await client.query(
            `INSERT INTO migration_quarantine (migration_id, source_table, source_id, course_id, reason, payload) VALUES ($1, 'module_items', $2, $3, $4, $5)`,
            [MIGRATION, String(row.id), row.course_id, reason, JSON.stringify(row)]
        );
        await client.query(`DELETE FROM module_items WHERE id = $1`, [row.id]);
    }
    return rows.length;
}

async function unassignedModuleFor(client, courseId) {
    const existing = await client.query(`SELECT id FROM modules WHERE course_id = $1 AND kind = 'unassigned'`, [courseId]);
    if (existing.rows[0]) return existing.rows[0].id;
    const created = await client.query(`
        INSERT INTO modules (course_id, title, description, position, published, kind, week_offset)
        VALUES ($1, 'Unassigned (fix me)', 'Items that were not in any module. Move each one into the right week; the course can''t open while this module has items.', 9999, 0, 'unassigned', NULL)
        RETURNING id
    `, [courseId]);
    await report(client, courseId, 'module', created.rows[0].id, 'created_unassigned_module', null);
    return created.rows[0].id;
}

export async function up(client) {
    // ---- Module kinds and week numbers -------------------------------------------------
    await client.query(`
        ALTER TABLE modules ADD COLUMN kind TEXT NOT NULL DEFAULT 'regular'
            CHECK (kind IN ('baseline', 'regular', 'unassigned'))
    `);
    await client.query(`ALTER TABLE modules ALTER COLUMN week_offset DROP DEFAULT`);
    await client.query(`ALTER TABLE modules ALTER COLUMN week_offset DROP NOT NULL`);

    // A course's baseline is the first module whose title says so (setup wizard "Week 0").
    const baselines = (await client.query(`
        SELECT DISTINCT ON (course_id) id, course_id, title FROM modules
        WHERE title ~* '(baseline|week[[:space:]]*0|diagnostic|pre-?test)'
        ORDER BY course_id, position, id
    `)).rows;
    for (const m of baselines) {
        await client.query(`UPDATE modules SET kind = 'baseline', week_offset = 0 WHERE id = $1`, [m.id]);
        await report(client, m.course_id, 'module', m.id, 'marked_baseline', m.title);
    }

    // week_offset was never written by the API, so every module sat at week 0 (and showed as
    // "Week 1"). Number regular modules 1..n in their current order.
    const numbered = (await client.query(`
        UPDATE modules m SET week_offset = r.n
        FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY course_id ORDER BY position, id) AS n
            FROM modules WHERE kind = 'regular'
        ) r
        WHERE m.id = r.id AND COALESCE(m.week_offset, 0) < 1
        RETURNING m.id, m.course_id, m.week_offset
    `)).rows;
    for (const m of numbered) await report(client, m.course_id, 'module', m.id, 'set_week_offset', `week ${m.week_offset}`);

    // ---- One content column on module_items ----------------------------------------------
    await client.query(`ALTER TABLE module_items RENAME COLUMN content_ref_id TO content_id`);
    await client.query(`
        UPDATE module_items SET content_id = item_ref_id
        WHERE content_id IS NULL AND item_ref_id IS NOT NULL AND item_type <> 'sub_header'
    `);
    await client.query(`UPDATE module_items SET content_id = NULL WHERE item_type = 'sub_header'`);

    // Items whose content is missing or belongs to another course can't be repaired.
    for (const [type, table] of Object.entries(ITEM_TABLES)) {
        await quarantineModuleItems(client, `
            mi.item_type = '${type}' AND (
                mi.content_id IS NULL OR NOT EXISTS (
                    SELECT 1 FROM ${table} t WHERE t.id = mi.content_id AND t.course_id = m.course_id
                )
            )
        `, `module item points to ${type} content that is missing or in another course`);
    }

    // Content listed in more than one module: keep the first listing (by module and item order).
    await quarantineModuleItems(client, `
        mi.item_type IN ('page', 'assignment', 'quiz', 'discussion') AND mi.id NOT IN (
            SELECT DISTINCT ON (mi2.item_type, mi2.content_id) mi2.id
            FROM module_items mi2 JOIN modules m2 ON m2.id = mi2.module_id
            WHERE mi2.item_type IN ('page', 'assignment', 'quiz', 'discussion')
            ORDER BY mi2.item_type, mi2.content_id, m2.position, mi2.position, mi2.id
        )
    `, 'duplicate listing: the same content was in more than one module (first listing kept)');

    await client.query(`ALTER TABLE module_items DROP COLUMN item_ref_id`);
    await client.query(`ALTER TABLE module_items DROP COLUMN content_ref_table`);
    await client.query(`
        ALTER TABLE module_items ADD CONSTRAINT module_items_content_matches_type
            CHECK ((item_type = 'sub_header') = (content_id IS NULL))
    `);
    await client.query(`
        CREATE UNIQUE INDEX module_items_one_listing_per_content ON module_items (item_type, content_id)
        WHERE item_type IN ('page', 'assignment', 'quiz', 'discussion')
    `);

    // ---- module_id on content ----------------------------------------------------------------
    for (const { type, table } of CONTENT) {
        await client.query(`ALTER TABLE ${table} ADD COLUMN module_id INTEGER REFERENCES modules(id) ON DELETE RESTRICT`);
        await client.query(`
            UPDATE ${table} t SET module_id = mi.module_id
            FROM module_items mi WHERE mi.item_type = '${type}' AND mi.content_id = t.id
        `);

        if (type === 'assignment') {
            // A graded discussion's assignment lives in the discussion's module (it has no
            // module item of its own; the discussion is what learners see).
            const linked = (await client.query(`
                UPDATE assignments a SET module_id = d.module_id
                FROM discussions d
                WHERE d.linked_assignment_id = a.id AND a.module_id IS NULL AND d.module_id IS NOT NULL
                RETURNING a.id, a.course_id
            `)).rows;
            for (const a of linked) await report(client, a.course_id, 'assignment', a.id, 'module_from_linked_discussion', null);
        }

        // Anything still without a module goes to the course's "Unassigned (fix me)" module.
        const orphans = (await client.query(`SELECT id, course_id, title FROM ${table} WHERE module_id IS NULL ORDER BY course_id, id`)).rows;
        for (const row of orphans) {
            const moduleId = await unassignedModuleFor(client, row.course_id);
            const pos = (await client.query(`SELECT COALESCE(MAX(position), -1) + 1 AS p FROM module_items WHERE module_id = $1`, [moduleId])).rows[0].p;
            await client.query(`
                INSERT INTO module_items (module_id, item_type, content_id, title, position, published)
                VALUES ($1, $2, $3, $4, $5, 0)
            `, [moduleId, type, row.id, row.title, pos]);
            await client.query(`UPDATE ${table} SET module_id = $1 WHERE id = $2`, [moduleId, row.id]);
            await report(client, row.course_id, type, row.id, 'moved_to_unassigned', row.title);
        }

        await client.query(`ALTER TABLE ${table} ALTER COLUMN module_id SET NOT NULL`);
        await client.query(`CREATE INDEX IF NOT EXISTS ${table}_module_id_idx ON ${table} (module_id)`);
    }

    // ---- Module constraints ------------------------------------------------------------------
    await client.query(`CREATE UNIQUE INDEX modules_one_baseline_per_course ON modules (course_id) WHERE kind = 'baseline'`);
    await client.query(`CREATE UNIQUE INDEX modules_one_unassigned_per_course ON modules (course_id) WHERE kind = 'unassigned'`);
    await client.query(`
        ALTER TABLE modules ADD CONSTRAINT modules_week_offset_matches_kind CHECK (
            -- (IS NOT NULL is explicit: a CHECK that evaluates to NULL would pass)
            (kind = 'baseline' AND week_offset IS NOT NULL AND week_offset = 0)
            OR (kind = 'regular' AND week_offset IS NOT NULL AND week_offset >= 1)
            OR (kind = 'unassigned' AND week_offset IS NULL)
        )
    `);
}
