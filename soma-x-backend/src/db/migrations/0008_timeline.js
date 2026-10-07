// Phase 3 (guide §5.8): relative offsets are the source of truth for dates.
// - courses.start_date / end_date become calendar dates (they were timestamps, so a start
//   "date" could drift a day depending on time zone).
// - module_items release/due/close days get real defaults: due on day 6 (the last day of the
//   module's week), no hard close. The old defaults (due 7, close 7) were never set by anyone.
// - Any absolute due date a teacher did set (assignments/quizzes.due_at) is converted into a
//   due_day so it isn't lost; due_at becomes a cache the timeline service rewrites.
// - modules.day_offset only means "days into the week" (0-6); out-of-range values from the
//   old shift tool are folded into the week number.
// - Course nav gains Calendar (and Insights, for Phase 9).
import { addDays, dateIn, diffDays, moduleStart, shiftModuleOffsets } from '@somabox/timeline';

const MIGRATION = '0008_timeline';
const TIMEZONE = process.env.SCHOOL_TIMEZONE || 'Africa/Kigali';

async function report(client, courseId, entity, entityId, action, details) {
    await client.query(
        `INSERT INTO migration_report (migration_id, course_id, entity, entity_id, action, details) VALUES ($1, $2, $3, $4, $5, $6)`,
        [MIGRATION, courseId, entity, entityId == null ? null : String(entityId), action, details]
    );
}

export async function up(client) {
    await client.query(`ALTER TABLE courses ALTER COLUMN start_date TYPE DATE USING (start_date AT TIME ZONE '${TIMEZONE}')::date`);
    await client.query(`ALTER TABLE courses ALTER COLUMN end_date TYPE DATE USING (end_date AT TIME ZONE '${TIMEZONE}')::date`);

    // day_offset is days into the week (0-6).
    const strayModules = (await client.query(`
        SELECT id, course_id, kind, week_offset, day_offset FROM modules
        WHERE kind <> 'unassigned' AND (day_offset IS NULL OR day_offset < 0 OR day_offset > 6)
    `)).rows;
    for (const m of strayModules) {
        let next;
        try {
            next = shiftModuleOffsets({ ...m, day_offset: 0 }, Number(m.day_offset) || 0);
        } catch {
            next = { week_offset: m.week_offset, day_offset: 0 };
        }
        await client.query(`UPDATE modules SET week_offset = $1, day_offset = $2 WHERE id = $3`, [next.week_offset, next.day_offset, m.id]);
        await report(client, m.course_id, 'module', m.id, 'normalised_day_offset', `week ${m.week_offset} day ${m.day_offset} -> week ${next.week_offset} day ${next.day_offset}`);
    }
    await client.query(`UPDATE modules SET day_offset = NULL WHERE kind = 'unassigned'`);
    await client.query(`ALTER TABLE modules ALTER COLUMN day_offset DROP DEFAULT`);
    await client.query(`UPDATE modules SET day_offset = 0 WHERE day_offset IS NULL AND kind <> 'unassigned'`);
    await client.query(`ALTER TABLE modules ALTER COLUMN day_offset SET DEFAULT 0`);
    await client.query(`
        ALTER TABLE modules ADD CONSTRAINT modules_day_offset_in_week CHECK (
            (kind = 'unassigned' AND day_offset IS NULL) OR (kind <> 'unassigned' AND day_offset BETWEEN 0 AND 6)
        )
    `);

    // Item day defaults. Untouched rows still have the old defaults (due 7, close 7).
    await client.query(`UPDATE module_items SET release_day = 0 WHERE release_day IS NULL`);
    const touched = (await client.query(`
        UPDATE module_items SET due_day = 6, close_day = NULL
        WHERE due_day = 7 AND close_day = 7
        RETURNING id
    `)).rowCount;
    if (touched) await report(client, null, 'module_items', null, 'default_due_day', `${touched} items: due day 7/close 7 (unset defaults) -> due day 6, no close`);
    await client.query(`UPDATE module_items SET close_day = NULL WHERE close_day IS NOT NULL AND due_day IS NOT NULL AND close_day < due_day`);
    // Only assignments, quizzes, and discussions have due dates.
    await client.query(`UPDATE module_items SET due_day = NULL, close_day = NULL WHERE item_type NOT IN ('assignment', 'quiz', 'discussion')`);
    await client.query(`ALTER TABLE module_items ALTER COLUMN release_day SET NOT NULL`);
    await client.query(`ALTER TABLE module_items ALTER COLUMN due_day SET DEFAULT ${6}`);
    await client.query(`ALTER TABLE module_items ALTER COLUMN close_day DROP DEFAULT`);
    await client.query(`
        ALTER TABLE module_items ADD CONSTRAINT module_items_days_in_order CHECK (
            release_day >= 0
            AND (due_day IS NULL OR due_day >= release_day)
            AND (close_day IS NULL OR (due_day IS NOT NULL AND close_day >= due_day))
        )
    `);

    // Keep any due date a teacher actually set, as an offset from its module's start.
    const courses = (await client.query(`SELECT id, start_date FROM courses`)).rows;
    for (const course of courses) {
        const startDate = course.start_date ? dateIn(course.start_date, TIMEZONE) : null;
        if (!startDate) continue;
        const modules = (await client.query(`SELECT id, kind, week_offset, day_offset FROM modules WHERE course_id = $1`, [course.id])).rows;
        const starts = new Map(modules.map((m) => [m.id, moduleStart(startDate, m)]));
        const dated = (await client.query(`
            SELECT mi.id AS item_id, mi.release_day, mi.module_id, x.due_at, x.type FROM module_items mi
            JOIN (
                SELECT 'assignment' AS type, id, due_at FROM assignments WHERE course_id = $1 AND due_at IS NOT NULL
                UNION ALL SELECT 'quiz', id, due_at FROM quizzes WHERE course_id = $1 AND due_at IS NOT NULL
            ) x ON x.type = mi.item_type AND x.id = mi.content_id
        `, [course.id])).rows;
        for (const row of dated) {
            const start = starts.get(row.module_id);
            if (!start) continue;
            const dueDay = diffDays(start, dateIn(row.due_at, TIMEZONE));
            if (dueDay < Number(row.release_day)) {
                await report(client, course.id, row.type, row.item_id, 'due_date_before_release', `due ${dateIn(row.due_at, TIMEZONE)} is before the module starts (${start}); kept the default due day`);
                continue;
            }
            await client.query(`UPDATE module_items SET due_day = $1, close_day = NULL WHERE id = $2`, [dueDay, row.item_id]);
            await report(client, course.id, row.type, row.item_id, 'due_date_to_offset', `due ${dateIn(row.due_at, TIMEZONE)} -> day ${dueDay} of module (starts ${start}, ends ${addDays(start, 6)})`);
        }
    }

    // Course navigation: Calendar now, Insights in Phase 9.
    const constraint = (await client.query(`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'course_nav_items'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%nav_key%'
    `)).rows[0];
    if (constraint) await client.query(`ALTER TABLE course_nav_items DROP CONSTRAINT ${constraint.conname}`);
    await client.query(`
        ALTER TABLE course_nav_items ADD CONSTRAINT course_nav_items_nav_key_check CHECK (nav_key IN (
            'home', 'announcements', 'syllabus', 'modules', 'grades', 'people', 'assignments',
            'rubrics', 'files', 'collaborations', 'outcomes', 'quizzes', 'pages', 'discussions', 'settings',
            'calendar', 'insights'
        ))
    `);
}
