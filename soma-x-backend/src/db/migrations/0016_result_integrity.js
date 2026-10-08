// Phase 11: evidence can't outlive the work it came from.
// - Deleting a quiz attempt or an assignment submission (directly, or because its quiz,
//   assignment, or course was deleted) removes the outcome results it produced, so deleted
//   work stops counting toward mastery, Insights, and growth.
// - Deleting a course file removes its module listing.
// - Outcome codes are unique within a course: the old column default gave every outcome
//   "OUT-1". Repeats are renumbered (the first keeps its code) and the default is dropped.
// Existing leftovers are cleaned up and counted in migration_report.
const MIGRATION = '0016_result_integrity';

export async function up(client) {
    await client.query(`
        CREATE FUNCTION delete_results_of_attempt() RETURNS trigger AS $$
        BEGIN
            DELETE FROM outcome_results WHERE source_type IN ('quiz_attempt', 'baseline') AND source_id = OLD.id;
            RETURN NULL;
        END $$ LANGUAGE plpgsql
    `);
    await client.query(`CREATE TRIGGER quiz_attempts_results_cleanup AFTER DELETE ON quiz_attempts FOR EACH ROW EXECUTE FUNCTION delete_results_of_attempt()`);
    await client.query(`
        CREATE FUNCTION delete_results_of_submission() RETURNS trigger AS $$
        BEGIN
            DELETE FROM outcome_results WHERE source_type = 'assignment_submission' AND source_id = OLD.id;
            RETURN NULL;
        END $$ LANGUAGE plpgsql
    `);
    await client.query(`CREATE TRIGGER assignment_submissions_results_cleanup AFTER DELETE ON assignment_submissions FOR EACH ROW EXECUTE FUNCTION delete_results_of_submission()`);
    await client.query(`
        CREATE FUNCTION delete_listing_of_file() RETURNS trigger AS $$
        BEGIN
            DELETE FROM module_items WHERE item_type = 'file' AND content_id = OLD.id;
            RETURN NULL;
        END $$ LANGUAGE plpgsql
    `);
    await client.query(`CREATE TRIGGER course_files_listing_cleanup AFTER DELETE ON course_files FOR EACH ROW EXECUTE FUNCTION delete_listing_of_file()`);

    const results = await client.query(`
        DELETE FROM outcome_results o
        WHERE (o.source_type = 'quiz_attempt' AND NOT EXISTS (SELECT 1 FROM quiz_attempts a WHERE a.id = o.source_id))
           OR (o.source_type = 'assignment_submission' AND NOT EXISTS (SELECT 1 FROM assignment_submissions s WHERE s.id = o.source_id))
    `);
    const listings = await client.query(`
        DELETE FROM module_items mi WHERE mi.item_type = 'file' AND NOT EXISTS (SELECT 1 FROM course_files f WHERE f.id = mi.content_id)
    `);
    // Renumber repeated outcome codes per course, keeping the oldest outcome's code.
    const dupes = (await client.query(`
        SELECT id, course_id FROM (
            SELECT id, course_id, ROW_NUMBER() OVER (PARTITION BY course_id, LOWER(code) ORDER BY id) AS n FROM outcomes WHERE code IS NOT NULL
        ) x WHERE n > 1 ORDER BY course_id, id
    `)).rows;
    for (const d of dupes) {
        const taken = new Set((await client.query(`SELECT LOWER(code) AS code FROM outcomes WHERE course_id = $1 AND code IS NOT NULL`, [d.course_id])).rows.map((r) => r.code));
        let n = 1;
        while (taken.has(`out-${n}`)) n += 1;
        await client.query(`UPDATE outcomes SET code = $1 WHERE id = $2`, [`OUT-${n}`, d.id]);
    }
    await client.query(`ALTER TABLE outcomes ALTER COLUMN code DROP DEFAULT`);
    await client.query(`CREATE UNIQUE INDEX outcomes_course_code_idx ON outcomes (course_id, LOWER(code)) WHERE code IS NOT NULL`);
    await client.query(
        `INSERT INTO migration_report (migration_id, entity, action, details) VALUES ($1, 'outcomes', 'renumbered_codes', $2)`,
        [MIGRATION, `${dupes.length} outcomes had a code already used in their course and were renumbered`]
    );
    await client.query(
        `INSERT INTO migration_report (migration_id, entity, action, details) VALUES ($1, 'outcome_results', 'removed_orphans', $2)`,
        [MIGRATION, `${results.rowCount} outcome results whose quiz attempt or submission no longer exists; ${listings.rowCount} file listings whose file no longer exists`]
    );
}
