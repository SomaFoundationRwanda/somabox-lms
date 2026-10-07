// Phase 2: the integrity migrations (0005-0007) applied to a database holding the kinds of
// legacy data real boxes have: orphans, duplicate listings, dangling items, shared rubrics,
// overwritten quiz submissions. Nothing may be silently lost.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const host = process.env.PGHOST || "localhost";
const port = process.env.PGPORT || "5432";
const user = process.env.PGUSER || process.env.USER || "postgres";
const password = process.env.PGPASSWORD || "";
const dbName = `somabox_migtest_${process.pid}_${Date.now()}`;

let pool;
const ids = {};
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];

function adminClient() {
  return new pg.Client({ host, port: Number(port), user, password, database: "postgres" });
}

before(async () => {
  const admin = adminClient();
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();
  pool = new pg.Pool({ host, port: Number(port), user, password, database: dbName, max: 3 });

  const { runMigrations } = await import("../src/db/migrate.js");
  await runMigrations(pool, { until: "0004_lifecycle_and_quarantine" });

  // ---- Legacy-shaped data, as Phase 1 and earlier wrote it ----
  await q(`INSERT INTO users (email, full_name, password_hash, role) VALUES ('t@x', 'T', 'x', 'teacher'), ('s@x', 'S', 'x', 'scholar')`);
  await q(`INSERT INTO courses (id, title, created_by_teacher_email, lifecycle) VALUES ('C1', 'Course 1', 't@x', 'open'), ('C2', 'Course 2', 't@x', 'open')`);
  const mod = async (course, title, position) => (await one(`INSERT INTO modules (course_id, title, position) VALUES ($1, $2, $3) RETURNING id`, [course, title, position])).id;
  ids.m0 = await mod("C1", "Week 0: Baseline", 0);
  ids.m1 = await mod("C1", "Intro", 1);
  ids.m2 = await mod("C1", "Practice", 2);
  ids.c2m = await mod("C2", "Other course", 0);

  const assignment = async (course, title) => (await one(`INSERT INTO assignments (course_id, title, published) VALUES ($1, $2, 1) RETURNING id`, [course, title])).id;
  ids.a1 = await assignment("C1", "Listed once");
  ids.a2 = await assignment("C1", "Orphan assignment");
  ids.a3 = await assignment("C1", "Listed twice");
  ids.a4 = await assignment("C1", "Graded discussion assignment");
  ids.c2a = await assignment("C2", "Other course assignment");
  ids.p1 = (await one(`INSERT INTO course_pages (course_id, title) VALUES ('C1', 'Orphan page') RETURNING id`)).id;
  ids.d1 = (await one(`INSERT INTO discussions (course_id, title, graded, linked_assignment_id) VALUES ('C1', 'Debate', 1, $1) RETURNING id`, [ids.a4])).id;
  ids.q1 = (await one(`INSERT INTO quizzes (course_id, title) VALUES ('C1', 'Pre-test') RETURNING id`)).id;
  await q(`INSERT INTO quiz_questions (quiz_id, prompt, points, correct_option) VALUES ($1, 'Q', 4, 'a'), ($1, 'Q2', 6, 'b')`, [ids.q1]);
  await q(`INSERT INTO quiz_submissions (quiz_id, scholar_email, answers, score) VALUES ($1, 'S@x', '{}', 5), ($1, 'ghost@x', '{}', 2)`, [ids.q1]);

  const item = async (moduleId, type, refId, title, position) => q(
    `INSERT INTO module_items (module_id, item_type, item_ref_id, content_ref_table, content_ref_id, title, position) VALUES ($1, $2, $3, NULL, $3, $4, $5)`,
    [moduleId, type, refId, title, position]
  );
  await item(ids.m0, "quiz", ids.q1, "Pre-test", 0);
  await item(ids.m1, "assignment", ids.a1, "Listed once", 0);
  await item(ids.m1, "assignment", ids.a3, "Listed twice", 1);
  await item(ids.m2, "assignment", ids.a3, "Listed twice (again)", 0);
  await item(ids.m2, "discussion", ids.d1, "Debate", 1);
  await item(ids.m2, "assignment", 999999, "Dangling", 2);
  await item(ids.m2, "assignment", ids.c2a, "Wrong course", 3);
  await q(`INSERT INTO module_items (module_id, item_type, item_ref_id, title, position) VALUES ($1, 'sub_header', 7, 'Heading', 4)`, [ids.m2]);

  const rubric = async (title, criteria) => (await one(`INSERT INTO rubrics (course_id, title, criteria) VALUES ('C1', $1, $2) RETURNING id`, [title, criteria])).id;
  ids.r1 = await rubric("Shared", JSON.stringify([{ description: "Clarity", points: 4 }, { description: "Accuracy", points: 6 }]));
  ids.r2 = await rubric("Unlinked", "[]");
  ids.r3 = await rubric("Broken", "{not json");
  await q(`INSERT INTO rubric_assignment_links (rubric_id, assignment_id) VALUES ($1, $2), ($1, $3), ($4, $5)`, [ids.r1, ids.a1, ids.a3, ids.r3, ids.a2]);

  // Phase 3 inputs: a start "date" stored as a timestamp and a due date a teacher set.
  await q(`UPDATE courses SET start_date = '2026-01-05T00:00:00+02:00' WHERE id = 'C1'`);
  await q(`UPDATE assignments SET due_at = '2026-01-08T21:59:59Z' WHERE id = $1`, [ids.a1]);

  // Phase 6 inputs: a graded, outcome-tagged submission and a legacy (possibly fake) baseline row.
  ids.legacyOutcome = (await one(`INSERT INTO outcomes (course_id, title) VALUES ('C1', 'Legacy') RETURNING id`)).id;
  await q(`INSERT INTO item_outcomes (course_id, item_type, item_id, outcome_id) VALUES ('C1', 'assignment', $1, $2)`, [ids.a1, ids.legacyOutcome]);
  await q(`INSERT INTO assignment_submissions (assignment_id, scholar_email, grade) VALUES ($1, 's@x', 50)`, [ids.a1]);
  await q(`INSERT INTO student_outcome_baselines (course_id, scholar_email, outcome_id, baseline_score) VALUES ('C1', 's@x', $1, 63)`, [ids.legacyOutcome]);

  await runMigrations(pool);
});

after(async () => {
  await pool?.end();
  const admin = adminClient();
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
  await admin.end();
});

test("modules get kinds and week numbers", async () => {
  const mods = Object.fromEntries((await q(`SELECT id, kind, week_offset FROM modules WHERE course_id = 'C1'`)).map((m) => [m.id, m]));
  assert.equal(mods[ids.m0].kind, "baseline");
  assert.equal(mods[ids.m0].week_offset, 0);
  assert.equal(mods[ids.m1].week_offset, 1);
  assert.equal(mods[ids.m2].week_offset, 2);
});

test("every content row belongs to a module, and its listing agrees", async () => {
  for (const table of ["assignments", "quizzes", "course_pages", "discussions"]) {
    const missing = await one(`SELECT COUNT(*)::int AS c FROM ${table} WHERE module_id IS NULL`);
    assert.equal(missing.c, 0, table);
  }
  const mismatched = await q(`
    SELECT mi.id FROM module_items mi
    LEFT JOIN assignments a ON mi.item_type = 'assignment' AND a.id = mi.content_id
    LEFT JOIN quizzes qz ON mi.item_type = 'quiz' AND qz.id = mi.content_id
    LEFT JOIN course_pages p ON mi.item_type = 'page' AND p.id = mi.content_id
    LEFT JOIN discussions d ON mi.item_type = 'discussion' AND d.id = mi.content_id
    WHERE mi.item_type IN ('assignment', 'quiz', 'page', 'discussion')
      AND mi.module_id IS DISTINCT FROM COALESCE(a.module_id, qz.module_id, p.module_id, d.module_id)
  `);
  assert.deepEqual(mismatched, []);
});

test("orphans move to a per-course Unassigned module that blocks opening", async () => {
  const unassigned = await one(`SELECT id, published, week_offset FROM modules WHERE course_id = 'C1' AND kind = 'unassigned'`);
  assert.ok(unassigned);
  assert.equal(Number(unassigned.published), 0);
  const a2 = await one(`SELECT module_id FROM assignments WHERE id = $1`, [ids.a2]);
  const p1 = await one(`SELECT module_id FROM course_pages WHERE id = $1`, [ids.p1]);
  assert.equal(a2.module_id, unassigned.id);
  assert.equal(p1.module_id, unassigned.id);
  const listed = await one(`SELECT COUNT(*)::int AS c FROM module_items WHERE module_id = $1`, [unassigned.id]);
  assert.equal(listed.c, 2);
  // C2's assignment was only listed in C1 (wrong course), so it's an orphan in C2.
  const c2a = await one(`SELECT m.kind FROM assignments a JOIN modules m ON m.id = a.module_id WHERE a.id = $1`, [ids.c2a]);
  assert.equal(c2a.kind, "unassigned");
});

test("duplicate, dangling, and cross-course listings are quarantined, not lost", async () => {
  const a3 = await one(`SELECT module_id FROM assignments WHERE id = $1`, [ids.a3]);
  assert.equal(a3.module_id, ids.m1, "first listing wins");
  const reasons = (await q(`SELECT reason, payload FROM migration_quarantine WHERE source_table = 'module_items'`));
  assert.equal(reasons.length, 3);
  assert.ok(reasons.some((r) => r.reason.startsWith("duplicate listing") && r.payload.title === "Listed twice (again)"));
  assert.equal(reasons.filter((r) => r.reason.includes("missing or in another course")).length, 2);
  const heading = await one(`SELECT content_id FROM module_items WHERE item_type = 'sub_header'`);
  assert.equal(heading.content_id, null);
});

test("a graded discussion's assignment follows the discussion's module", async () => {
  const d1 = await one(`SELECT module_id FROM discussions WHERE id = $1`, [ids.d1]);
  const a4 = await one(`SELECT module_id FROM assignments WHERE id = $1`, [ids.a4]);
  assert.equal(d1.module_id, ids.m2);
  assert.equal(a4.module_id, ids.m2);
});

test("quiz submissions become attempts; unknown learners are quarantined", async () => {
  const quiz = await one(`SELECT kind, attempts_allowed FROM quizzes WHERE id = $1`, [ids.q1]);
  assert.equal(quiz.kind, "baseline");
  assert.equal(quiz.attempts_allowed, null);
  const attempts = await q(`SELECT attempt_number, score_points, score_pct FROM quiz_attempts WHERE quiz_id = $1`, [ids.q1]);
  assert.equal(attempts.length, 1);
  assert.equal(Number(attempts[0].score_pct), 50);
  const view = await q(`SELECT scholar_email, score FROM quiz_submissions WHERE quiz_id = $1`, [ids.q1]);
  assert.deepEqual(view.map((r) => [r.scholar_email, Number(r.score)]), [["s@x", 5]]);
  const ghost = await one(`SELECT payload FROM migration_quarantine WHERE source_table = 'quiz_submissions'`);
  assert.equal(ghost.payload.scholar_email, "ghost@x");
});

test("rubrics belong to one assignment each; shared ones are copied", async () => {
  const rubrics = await q(`SELECT id, assignment_id FROM rubrics ORDER BY id`);
  assert.deepEqual(rubrics.map((r) => r.assignment_id).sort(), [ids.a1, ids.a3].sort());
  for (const r of rubrics) {
    const criteria = await q(`SELECT title, points FROM rubric_criteria WHERE rubric_id = $1 ORDER BY position`, [r.id]);
    assert.deepEqual(criteria.map((c) => [c.title, Number(c.points)]), [["Clarity", 4], ["Accuracy", 6]]);
  }
  const quarantined = (await q(`SELECT source_id, reason FROM migration_quarantine WHERE source_table = 'rubrics' ORDER BY source_id`));
  assert.deepEqual(quarantined.map((r) => Number(r.source_id)).sort(), [ids.r2, ids.r3].sort());
  const linksTable = await one(`SELECT to_regclass('public.rubric_assignment_links') AS t`);
  assert.equal(linksTable.t, null);
});

test("every change is reported", async () => {
  const actions = (await q(`SELECT DISTINCT action FROM migration_report`)).map((r) => r.action);
  for (const a of ["marked_baseline", "set_week_offset", "moved_to_unassigned", "created_unassigned_module", "copied_shared_rubric", "marked_baseline_quiz"]) {
    assert.ok(actions.includes(a), a);
  }
});

test("running migrations again changes nothing", async () => {
  const { runMigrations } = await import("../src/db/migrate.js");
  const before = await one(`SELECT COUNT(*)::int AS c FROM migration_report`);
  await runMigrations(pool);
  const afterCount = await one(`SELECT COUNT(*)::int AS c FROM migration_report`);
  assert.equal(afterCount.c, before.c);
});

test("dates become calendar dates and set due dates become offsets", async () => {
  const c1 = await one(`SELECT start_date::text AS d FROM courses WHERE id = 'C1'`);
  assert.equal(c1.d, "2026-01-05");
  const a1Item = await one(`SELECT release_day, due_day, close_day FROM module_items WHERE item_type = 'assignment' AND content_id = $1`, [ids.a1]);
  assert.deepEqual([a1Item.release_day, a1Item.due_day, a1Item.close_day], [0, 3, null], "due 8 Jan in a week starting 5 Jan = day 3");
  const a3Item = await one(`SELECT due_day, close_day FROM module_items WHERE item_type = 'assignment' AND content_id = $1`, [ids.a3]);
  assert.deepEqual([a3Item.due_day, a3Item.close_day], [6, null], "unset defaults become due on day 6, no close");
  const reported = await one(`SELECT details FROM migration_report WHERE action = 'due_date_to_offset' AND entity_id = (SELECT id::text FROM module_items WHERE item_type = 'assignment' AND content_id = $1)`, [ids.a1]);
  assert.ok(reported);
  const nav = await one(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'course_nav_items_nav_key_check'`);
  assert.match(nav.def, /calendar/);
});

test("already-open courses aren't blocked by the new baseline step", async () => {
  const c1 = await one(`SELECT baseline_status, baseline_skip_reason FROM courses WHERE id = 'C1'`);
  assert.equal(c1.baseline_status, "skipped");
  assert.match(c1.baseline_skip_reason, /before baseline decisions/);
});

test("existing grades become outcome results; legacy baselines are not trusted", async () => {
  const rows = await q(`SELECT source_type, pct FROM outcome_results WHERE outcome_id = $1`, [ids.legacyOutcome]);
  assert.deepEqual(rows.map((r) => [r.source_type, Number(r.pct)]), [["assignment_submission", 50]]);
  const report = await one(`SELECT details FROM migration_report WHERE migration_id = '0010_grading_results'`);
  assert.match(report.details, /1 legacy student_outcome_baselines rows not used/);
});
