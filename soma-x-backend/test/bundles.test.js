// Phase 10: course bundles — export with relative days, versioning, validated import that
// always creates a new draft course.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startTestServer, USERS } from "./helpers.js";

let ctx;
let db;
const call = (who) => (method, path, body) => ctx.api(method, path, { token: ctx.tokens[who], body });
const asTeacher = call("teacher");
const asStudent = call("student");
const asOther = call("otherTeacher");

before(async () => {
  ctx = await startTestServer();
  db = ctx.db;
});

after(async () => {
  await ctx.stop();
});

const addItem = (courseId, moduleId, body) => asTeacher("POST", `/courses/${courseId}/modules/${moduleId}/items`, body);

/** A small but complete course: outcomes, two weeks, every item type, a rubric, learner work. */
async function richCourse() {
  const courseId = await ctx.createCourse("Fractions P5");
  const o1 = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Add fractions" })).body;
  const o2 = (await asTeacher("POST", `/courses/${courseId}/outcomes`, { title: "Compare fractions" })).body;
  const w1 = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 1: halves" })).body;
  const w2 = (await asTeacher("POST", `/courses/${courseId}/modules`, { title: "Week 2: quarters" })).body;
  await asTeacher("PATCH", `/courses/${courseId}/modules/${w1.id}`, { published: true });
  await addItem(courseId, w1.id, { itemType: "sub_header", title: "Read first" });
  await addItem(courseId, w1.id, { itemType: "page", title: "What is a half?", body: "A half is one of two equal parts." });
  const quiz = await addItem(courseId, w1.id, {
    itemType: "quiz", title: "Halves check", outcomeIds: [o1.id], releaseDay: 1, dueDay: 4, closeDay: 6,
    questions: [{ prompt: "1/2 + 1/2?", options: ["1", "2/4"], correctOption: "1", points: 2, outcomeId: o2.id }],
  });
  const essay = await addItem(courseId, w2.id, { itemType: "assignment", title: "Fraction poster", pointsPossible: 20, outcomeIds: [o1.id], releaseDay: 0, dueDay: 5 });
  await asTeacher("PUT", `/courses/${courseId}/assignments/${essay.body.content_id}/rubric`, {
    criteria: [{ title: "Drawing", points: 4, outcomeId: o1.id }, { title: "Labels", points: 2, outcomeId: o2.id }],
  });
  const disc = await asTeacher("POST", `/courses/${courseId}/discussions`, { title: "Share a fraction", body: "Where do you see fractions?", moduleId: w2.id, graded: true, pointsPossible: 5 });
  assert.equal(disc.status, 201, JSON.stringify(disc.body));
  const linked = (await db.prepare("SELECT linked_assignment_id FROM discussions WHERE id = ?").get(disc.body.id)).linked_assignment_id;
  await db.prepare("INSERT INTO item_outcomes (course_id, item_type, item_id, outcome_id) VALUES (?, 'assignment', ?, ?)").run(courseId, linked, o2.id);
  // Learner work that must never end up in a bundle.
  await db.prepare("INSERT INTO assignment_submissions (assignment_id, scholar_email, body, submitted_at) VALUES (?, ?, 'secret learner answer', NOW())")
    .run(essay.body.content_id, USERS.student.email);
  return { courseId, o1, o2, w1, w2, quizId: quiz.body.content_id };
}

test("export: relative days, outcome references, rubric, no learner data; versions only change with content", async () => {
  const c = await richCourse();
  const res = await asTeacher("GET", `/courses/${c.courseId}/bundle`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const b = res.body;
  assert.deepEqual([b.format, b.formatVersion, b.version], ["somabox-course-bundle", 1, 1]);
  assert.match(b.bundleId, /^[0-9a-f-]{36}$/);
  const text = JSON.stringify(b);
  assert.ok(!text.includes(USERS.student.email) && !text.includes("secret learner answer"), "no learner data");
  assert.ok(!/"\d{4}-\d{2}-\d{2}/.test(JSON.stringify(b.modules)), "no absolute dates in the content");

  assert.deepEqual(b.outcomes.map((o) => o.ref), ["o1", "o2"]);
  assert.deepEqual(b.modules.map((m) => [m.kind, m.weekOffset, m.title]), [["regular", 1, "Week 1: halves"], ["regular", 2, "Week 2: quarters"]]);
  const [header, page, quiz] = b.modules[0].items;
  assert.equal(header.type, "sub_header");
  assert.equal(page.page.body, "A half is one of two equal parts.");
  assert.deepEqual([quiz.releaseDay, quiz.dueDay, quiz.closeDay], [1, 4, 6]);
  assert.equal(quiz.quiz.questions[0].outcomeRef, "o2");
  const [poster, discussion] = b.modules[1].items;
  assert.deepEqual(poster.assignment.rubric.criteria.map((x) => [x.title, x.outcomeRef]), [["Drawing", "o1"], ["Labels", "o2"]]);
  assert.deepEqual([discussion.discussion.graded, discussion.discussion.pointsPossible, discussion.outcomeRefs], [true, 5, ["o2"]]);

  const again = (await asTeacher("GET", `/courses/${c.courseId}/bundle`)).body;
  assert.deepEqual([again.bundleId, again.version], [b.bundleId, 1], "same content, same version");
  await asTeacher("PATCH", `/courses/${c.courseId}/outcomes/${c.o1.id}`, { title: "Add fractions with like denominators" });
  const changed = (await asTeacher("GET", `/courses/${c.courseId}/bundle`)).body;
  assert.deepEqual([changed.bundleId, changed.version], [b.bundleId, 2]);
  const kept = await db.prepare("SELECT version FROM course_bundles WHERE bundle_id = ? ORDER BY version").all(b.bundleId);
  assert.deepEqual(kept.map((k) => k.version), [1, 2]);

  assert.equal((await asStudent("GET", `/courses/${c.courseId}/bundle`)).status, 403);
  assert.equal((await asOther("GET", `/courses/${c.courseId}/bundle`)).status, 403);
});

test("import creates a new draft course through the normal rules; re-importing never overwrites an edited copy", async () => {
  const c = await richCourse();
  const bundle = (await asTeacher("GET", `/courses/${c.courseId}/bundle`)).body;

  const res = await asOther("POST", "/bundles/import", { bundle });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const copyId = res.body.courseId;
  assert.notEqual(copyId, c.courseId);
  assert.deepEqual(res.body.existingCopies, []);
  const copy = await db.prepare("SELECT * FROM courses WHERE id = ?").get(copyId);
  assert.deepEqual([copy.lifecycle, copy.imported_bundle_id, copy.imported_bundle_version, copy.start_date], ["draft", bundle.bundleId, 1, null]);
  const teacher = await db.prepare("SELECT role FROM enrollments WHERE course_id = ? AND user_email = ?").get(copyId, USERS.otherTeacher.email);
  assert.equal(teacher.role, "teacher");
  assert.equal(Number((await db.prepare("SELECT COUNT(*) AS n FROM enrollments WHERE course_id = ? AND role = 'student'").get(copyId)).n), 0);

  // Same structure, re-linked to the copy's own outcomes.
  const back = (await asOther("GET", `/courses/${copyId}/bundle`)).body;
  const strip = (x) => JSON.stringify({ outcomes: x.outcomes.map(({ code, ...o }) => o), modules: x.modules });
  assert.equal(strip(back), strip(bundle), "exporting the copy gives the same content");
  assert.deepEqual(back.derivedFrom, { bundleId: bundle.bundleId, version: 1 });
  assert.notEqual(back.bundleId, bundle.bundleId, "a copy is its own bundle");
  const copyOutcomes = new Set((await db.prepare("SELECT id FROM outcomes WHERE course_id = ?").all(copyId)).map((o) => Number(o.id)));
  const criteria = await db.prepare(`SELECT rc.outcome_id FROM rubric_criteria rc JOIN rubrics r ON r.id = rc.rubric_id WHERE r.course_id = ?`).all(copyId);
  assert.ok(criteria.length === 2 && criteria.every((x) => copyOutcomes.has(Number(x.outcome_id))));
  const codes = (await db.prepare("SELECT code FROM outcomes WHERE course_id = ? ORDER BY id").all(copyId)).map((o) => o.code);
  assert.equal(new Set(codes).size, codes.length, "outcome codes are unique in the copy");

  // The teacher edits their copy; importing the same bundle again makes a second copy.
  await asOther("PATCH", `/courses/${copyId}`, { title: "My fractions" });
  const second = await asOther("POST", "/bundles/import", { bundle });
  assert.equal(second.status, 201);
  assert.notEqual(second.body.courseId, copyId);
  assert.deepEqual(second.body.existingCopies.map((x) => x.id), [copyId]);
  assert.equal((await db.prepare("SELECT title FROM courses WHERE id = ?").get(copyId)).title, "My fractions");
  assert.equal((await db.prepare("SELECT title FROM courses WHERE id = ?").get(c.courseId)).title, "Fractions P5", "the source is untouched");
});

test("bad bundles are refused with a reason, and a failure part-way leaves nothing behind", async () => {
  const c = await richCourse();
  const bundle = (await asTeacher("GET", `/courses/${c.courseId}/bundle`)).body;
  const courses = async () => Number((await db.prepare("SELECT COUNT(*) AS n FROM courses").get()).n);
  const before = await courses();
  const tamper = (fn) => { const b = structuredClone(bundle); b.version = 99; fn(b); return b; };

  const notBundle = await asTeacher("POST", "/bundles/import", { bundle: { hello: "world" } });
  assert.equal(notBundle.status, 400);
  const newer = await asTeacher("POST", "/bundles/import", { bundle: tamper((b) => { b.formatVersion = 2; }) });
  assert.match(newer.body.message, /newer version/);
  const badRef = await asTeacher("POST", "/bundles/import", { bundle: tamper((b) => { b.modules[0].items[2].quiz.questions[0].outcomeRef = "o9"; }) });
  assert.equal(badRef.status, 400);
  assert.match(badRef.body.message, /modules\[0\]\.items\[2\]\.quiz\.questions\[0\]\.outcomeRef/);
  const baselineQuiz = await asTeacher("POST", "/bundles/import", { bundle: tamper((b) => { b.modules[0].items[2].quiz.kind = "baseline"; }) });
  assert.equal(baselineQuiz.status, 400);

  // Passes the shape check but breaks a scheduling rule deep inside: everything rolls back.
  const badDays = await asTeacher("POST", "/bundles/import", { bundle: tamper((b) => { b.modules[1].items[0].dueDay = 0; b.modules[1].items[0].releaseDay = 3; }) });
  assert.equal(badDays.status, 400, JSON.stringify(badDays.body));
  assert.match(badDays.body.message, /due day/);
  assert.equal(await courses(), before, "no half-built course");
});

test("the bundle library keeps read-only versions; teachers create courses from it", async () => {
  const c = await richCourse();
  const bundle = (await asTeacher("GET", `/courses/${c.courseId}/bundle`)).body;
  // Upload as a file, the way the screen does.
  const form = new FormData();
  form.append("bundle", new Blob([JSON.stringify(bundle)], { type: "application/json" }), "course.somabox.json");
  const up = await fetch(`${ctx.baseUrl}/bundles`, { method: "POST", headers: { Authorization: `Bearer ${ctx.tokens.otherTeacher}` }, body: form });
  const upBody = await up.json();
  assert.equal(up.status, 200, JSON.stringify(upBody));
  assert.equal(upBody.added, false, "this exact version is already in the library (from the export)");

  const changed = structuredClone(bundle);
  changed.course.title = "Something else";
  const conflict = await asOther("POST", "/bundles", { bundle: changed });
  assert.equal(conflict.status, 409, "a published version can't change");

  const list = (await asOther("GET", "/bundles")).body;
  const entry = list.find((x) => x.bundleId === bundle.bundleId && x.version === bundle.version);
  assert.ok(entry);
  assert.deepEqual([entry.outcomes, entry.weeks], [2, 2]);
  const made = await asOther("POST", `/bundles/${entry.id}/courses`);
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const after = (await asOther("GET", "/bundles")).body.find((x) => x.id === entry.id);
  assert.deepEqual(after.myCopies.map((x) => x.courseId), [made.body.courseId]);

  assert.equal((await asStudent("GET", "/bundles")).status, 403);
  assert.equal((await asStudent("POST", "/bundles/import", { bundle })).status, 403);
});
