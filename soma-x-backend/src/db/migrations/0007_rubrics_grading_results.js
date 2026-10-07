// Phase 2 (guide §5.5–5.7): each rubric belongs to exactly one assignment and its criteria
// are rows that can point at an outcome; per-criterion scores, a grade audit log, and the
// outcome_results table that mastery will read from (Phase 6).
const MIGRATION = '0007_rubrics_grading_results';

async function report(client, courseId, entity, entityId, action, details) {
    await client.query(
        `INSERT INTO migration_report (migration_id, course_id, entity, entity_id, action, details) VALUES ($1, $2, $3, $4, $5, $6)`,
        [MIGRATION, courseId, entity, entityId == null ? null : String(entityId), action, details]
    );
}

function parseCriteria(raw) {
    try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

export async function up(client) {
    await client.query(`
        CREATE TABLE rubric_criteria (
            id SERIAL PRIMARY KEY,
            rubric_id INTEGER NOT NULL REFERENCES rubrics(id) ON DELETE CASCADE,
            outcome_id INTEGER REFERENCES outcomes(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL DEFAULT '',
            points NUMERIC NOT NULL DEFAULT 4 CHECK (points >= 0),
            weight NUMERIC NOT NULL DEFAULT 1 CHECK (weight > 0),
            position INTEGER NOT NULL DEFAULT 0
        )
    `);
    await client.query(`CREATE INDEX rubric_criteria_rubric_idx ON rubric_criteria (rubric_id)`);
    await client.query(`ALTER TABLE rubrics ADD COLUMN assignment_id INTEGER REFERENCES assignments(id) ON DELETE CASCADE`);

    const rubrics = (await client.query(`SELECT * FROM rubrics ORDER BY id`)).rows;
    for (const rubric of rubrics) {
        const criteria = parseCriteria(rubric.criteria);
        const links = (await client.query(`
            SELECT l.assignment_id FROM rubric_assignment_links l
            JOIN assignments a ON a.id = l.assignment_id AND a.course_id = $2
            WHERE l.rubric_id = $1 ORDER BY l.id
        `, [rubric.id, rubric.course_id])).rows.map((r) => r.assignment_id);

        // A rubric with no assignment (or unreadable criteria) can't be migrated as-is.
        if (criteria === null || links.length === 0) {
            await client.query(
                `INSERT INTO migration_quarantine (migration_id, source_table, source_id, course_id, reason, payload) VALUES ($1, 'rubrics', $2, $3, $4, $5)`,
                [MIGRATION, String(rubric.id), rubric.course_id,
                    criteria === null ? 'rubric criteria were not valid JSON' : 'rubric was not linked to any assignment in its course',
                    JSON.stringify(rubric)]
            );
            await client.query(`DELETE FROM rubrics WHERE id = $1`, [rubric.id]);
            continue;
        }

        // A rubric shared by several assignments becomes one copy per assignment (guide §12.5).
        for (const [i, assignmentId] of links.entries()) {
            let rubricId = rubric.id;
            if (i === 0) {
                await client.query(`UPDATE rubrics SET assignment_id = $1 WHERE id = $2`, [assignmentId, rubric.id]);
            } else {
                rubricId = (await client.query(
                    `INSERT INTO rubrics (course_id, title, criteria, created_at, assignment_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                    [rubric.course_id, rubric.title, rubric.criteria, rubric.created_at, assignmentId]
                )).rows[0].id;
                await report(client, rubric.course_id, 'rubric', rubricId, 'copied_shared_rubric', `copy of rubric ${rubric.id} for assignment ${assignmentId}`);
            }
            for (const [pos, c] of criteria.entries()) {
                const title = String(c?.title || c?.description || `Criterion ${pos + 1}`).slice(0, 500);
                await client.query(`
                    INSERT INTO rubric_criteria (rubric_id, title, description, points, position)
                    VALUES ($1, $2, $3, $4, $5)
                `, [rubricId, title, String(c?.description || ''), Math.max(0, Number(c?.points) || 0), pos]);
            }
        }
    }

    // Two assignments can't share one rubric anymore; one rubric per assignment.
    const dupes = (await client.query(`
        SELECT id, course_id, assignment_id FROM rubrics r
        WHERE id NOT IN (SELECT DISTINCT ON (assignment_id) id FROM rubrics ORDER BY assignment_id, id)
    `)).rows;
    for (const d of dupes) {
        const row = (await client.query(`SELECT * FROM rubrics WHERE id = $1`, [d.id])).rows[0];
        await client.query(
            `INSERT INTO migration_quarantine (migration_id, source_table, source_id, course_id, reason, payload) VALUES ($1, 'rubrics', $2, $3, $4, $5)`,
            [MIGRATION, String(d.id), d.course_id, 'assignment already had a rubric (first one kept)', JSON.stringify(row)]
        );
        await client.query(`DELETE FROM rubrics WHERE id = $1`, [d.id]);
    }

    await client.query(`ALTER TABLE rubrics ALTER COLUMN assignment_id SET NOT NULL`);
    await client.query(`ALTER TABLE rubrics ADD CONSTRAINT rubrics_one_per_assignment UNIQUE (assignment_id)`);
    await client.query(`ALTER TABLE rubrics DROP COLUMN criteria`);
    await client.query(`DROP TABLE rubric_assignment_links`);

    // Per-criterion scores (filled by rubric grading in Phase 6). assignment_submissions.grade
    // stays as the computed total.
    await client.query(`
        CREATE TABLE submission_scores (
            id SERIAL PRIMARY KEY,
            submission_id INTEGER NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
            criterion_id INTEGER NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
            level TEXT,
            points NUMERIC NOT NULL CHECK (points >= 0),
            graded_by TEXT NOT NULL,
            source TEXT NOT NULL DEFAULT 'teacher' CHECK (source IN ('teacher', 'ai_suggested_accepted')),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (submission_id, criterion_id)
        )
    `);

    await client.query(`
        CREATE TABLE grade_audit_log (
            id SERIAL PRIMARY KEY,
            submission_id INTEGER REFERENCES assignment_submissions(id) ON DELETE SET NULL,
            assignment_id INTEGER NOT NULL,
            scholar_email TEXT NOT NULL,
            old_grade NUMERIC,
            new_grade NUMERIC,
            changed_by TEXT NOT NULL,
            reason TEXT,
            changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await client.query(`CREATE INDEX grade_audit_log_assignment_idx ON grade_audit_log (assignment_id)`);

    // The only source for outcome mastery and growth from Phase 6 on: one row per assessed
    // outcome per piece of evidence, always as a percentage.
    await client.query(`
        CREATE TABLE outcome_results (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            course_id VARCHAR(10) NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
            outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
            source_type TEXT NOT NULL CHECK (source_type IN ('baseline', 'quiz_attempt', 'assignment_submission')),
            source_id INTEGER NOT NULL,
            pct NUMERIC NOT NULL CHECK (pct >= 0 AND pct <= 100),
            assessed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE (user_id, outcome_id, source_type, source_id)
        )
    `);
    await client.query(`CREATE INDEX outcome_results_course_outcome_idx ON outcome_results (course_id, outcome_id)`);
}
