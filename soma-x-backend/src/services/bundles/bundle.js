// Course bundles: a portable copy of a course's structure and content. Dates are relative
// (week offsets and release/due/close days), so a bundle fits any start date. Bundles never
// contain learner data. Importing goes through the same functions as building a course by hand
// (createModuleContent, saveRubric, outcome rules) and always creates a NEW draft course, so a
// teacher's edited copy is never overwritten.
import crypto from "crypto";
import { localDb, seedDefaultNavItems } from "../../helpers/db-manager.js";
import { generateUniqueCourseCode, linkDiscussionAssignment } from "../courses/shared.js";
import { createModuleContent, setItemOutcomes, ItemError } from "../courses/items.js";
import { saveRubric } from "../courses/rubrics.js";
import { refreshDueDates } from "../courses/schedule.js";

export const BUNDLE_FORMAT = "somabox-course-bundle";
export const BUNDLE_FORMAT_VERSION = 1;
const LIMITS = { outcomes: 100, modules: 60, items: 150, questions: 200, options: 10, criteria: 30, text: 500_000, title: 300 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class BundleError extends ItemError {}

const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

// Key order doesn't change a hash (bundles stored as jsonb come back with keys reordered).
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Hash of a bundle's content (course, outcomes, modules), independent of key order. */
export function contentHash(content) {
  return crypto.createHash("sha256").update(canonical({ course: content.course, outcomes: content.outcomes, modules: content.modules })).digest("hex");
}

/**
 * The bundle content of a course (no identity or version yet).
 * Returns { content, warnings, omitted }.
 */
export async function buildBundleContent(courseId) {
  const course = await localDb.prepare("SELECT * FROM courses WHERE id = ?").get(courseId);
  if (!course) throw new BundleError(404, "Course not found");
  const warnings = [];
  const omitted = [];

  const outcomeRows = await localDb.prepare("SELECT * FROM outcomes WHERE course_id = ? ORDER BY id").all(courseId);
  const refOf = new Map(outcomeRows.map((o, i) => [Number(o.id), `o${i + 1}`]));
  const refs = (ids) => [...new Set(ids.map((id) => refOf.get(Number(id))).filter(Boolean))];
  const tagsOf = async (type, id) => refs((await localDb.prepare("SELECT outcome_id FROM item_outcomes WHERE item_type = ? AND item_id = ? ORDER BY outcome_id").all(type, id)).map((t) => t.outcome_id));

  const modules = [];
  const moduleRows = await localDb.prepare(`
    SELECT * FROM modules WHERE course_id = ? ORDER BY CASE kind WHEN 'baseline' THEN 0 WHEN 'regular' THEN 1 ELSE 2 END, week_offset ASC NULLS LAST, position ASC
  `).all(courseId);
  for (const m of moduleRows) {
    const items = await localDb.prepare("SELECT * FROM module_items WHERE module_id = ? ORDER BY position, id").all(m.id);
    if (m.kind === "unassigned") {
      if (items.length) warnings.push(`${items.length} item(s) in "Unassigned (fix me)" were left out; move them into a week first.`);
      continue;
    }
    const out = [];
    for (const it of items) {
      const base = { type: it.item_type, title: it.title, indent: Number(it.indent_level) || 0 };
      const days = { releaseDay: it.release_day ?? 0, dueDay: it.due_day ?? null, closeDay: it.close_day ?? null };
      const published = Number(it.published) === 1;
      if (it.item_type === "sub_header") {
        out.push(base);
      } else if (it.item_type === "page") {
        const p = await localDb.prepare("SELECT * FROM course_pages WHERE id = ?").get(it.content_id);
        if (!p) continue;
        if (/\/course-files\//.test(`${p.body_html || ""}${p.body_json || ""}`)) warnings.push(`Page "${p.title}" links to uploaded files, which bundles don't carry yet.`);
        out.push({ ...base, ...days, published, page: { body: p.body || "", bodyJson: parseJson(p.body_json, null), bodyHtml: p.body_html || null } });
      } else if (it.item_type === "assignment") {
        const a = await localDb.prepare("SELECT * FROM assignments WHERE id = ?").get(it.content_id);
        if (!a) continue;
        const rubric = await localDb.prepare("SELECT * FROM rubrics WHERE assignment_id = ?").get(a.id);
        const criteria = rubric ? await localDb.prepare("SELECT * FROM rubric_criteria WHERE rubric_id = ? ORDER BY position").all(rubric.id) : [];
        out.push({
          ...base, ...days, published, outcomeRefs: await tagsOf("assignment", a.id),
          assignment: {
            description: a.description || "", pointsPossible: Number(a.points_possible),
            rubric: rubric ? { title: rubric.title, criteria: criteria.map((c) => ({ title: c.title, description: c.description || "", points: Number(c.points), weight: Number(c.weight), outcomeRef: refOf.get(Number(c.outcome_id)) || null })) } : null,
          },
        });
      } else if (it.item_type === "quiz") {
        const q = await localDb.prepare("SELECT * FROM quizzes WHERE id = ?").get(it.content_id);
        if (!q) continue;
        const questions = await localDb.prepare("SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY position, id").all(q.id);
        out.push({
          ...base, ...days, published, outcomeRefs: await tagsOf("quiz", q.id),
          quiz: {
            description: q.description || "", kind: q.kind, attemptsAllowed: q.attempts_allowed, timeLimitMinutes: q.time_limit_minutes,
            questions: questions.map((x) => ({ prompt: x.prompt, questionType: x.question_type, options: parseJson(x.options, []), correctOption: x.correct_option, points: Number(x.points), outcomeRef: refOf.get(Number(x.outcome_id)) || null })),
          },
        });
      } else if (it.item_type === "discussion") {
        const d = await localDb.prepare("SELECT * FROM discussions WHERE id = ?").get(it.content_id);
        if (!d) continue;
        const graded = !!d.linked_assignment_id;
        out.push({
          ...base, ...days, published, outcomeRefs: graded ? await tagsOf("assignment", d.linked_assignment_id) : [],
          discussion: { body: d.body || "", graded, pointsPossible: graded ? Number(d.points_possible) || 0 : null },
        });
      } else {
        omitted.push({ type: it.item_type, title: it.title });
      }
    }
    modules.push({ kind: m.kind, weekOffset: m.week_offset, dayOffset: m.day_offset ?? 0, title: m.title, description: m.description || "", published: Number(m.published) === 1, items: out });
  }
  if (omitted.length) warnings.push(`${omitted.length} uploaded file(s) were left out: bundles don't carry files yet.`);

  const content = {
    course: {
      title: course.title, description: course.description || "", syllabusBody: course.syllabus_body || "", grade: course.grade || "",
      lengthWeeks: course.length_weeks ?? null, gradingScale: course.grading_scale || null,
    },
    outcomes: outcomeRows.map((o) => ({ ref: refOf.get(Number(o.id)), code: o.code || null, title: o.title, description: o.description || "", masteryScale: o.mastery_scale || "4pt", masteryLevels: parseJson(o.mastery_levels, null) })),
    modules,
  };
  return { content, warnings, omitted, course };
}

/**
 * Exports a course as a bundle. The course keeps one bundle id; the version goes up only when
 * the content changed since the last export. Each version is also kept in course_bundles.
 */
export async function exportBundle(courseId, actorEmail) {
  const { content, warnings, omitted, course } = await buildBundleContent(courseId);
  const hash = contentHash(content);
  let bundleId = course.bundle_id;
  let version = course.bundle_version || 0;
  if (!bundleId || hash !== course.bundle_export_hash) {
    bundleId = bundleId || crypto.randomUUID();
    version += 1;
    await localDb.prepare("UPDATE courses SET bundle_id = ?, bundle_version = ?, bundle_export_hash = ? WHERE id = ?").run(bundleId, version, hash, courseId);
  }
  const bundle = {
    format: BUNDLE_FORMAT,
    formatVersion: BUNDLE_FORMAT_VERSION,
    bundleId,
    version,
    exportedAt: new Date().toISOString(),
    ...(course.imported_bundle_id ? { derivedFrom: { bundleId: course.imported_bundle_id, version: course.imported_bundle_version } } : {}),
    warnings,
    ...content,
  };
  await localDb.prepare(`
    INSERT INTO course_bundles (bundle_id, version, title, format_version, content_hash, data, source, added_by)
    VALUES (?, ?, ?, ?, ?, ?::jsonb, 'export', ?) ON CONFLICT (bundle_id, version) DO NOTHING
  `).run(bundleId, version, content.course.title, BUNDLE_FORMAT_VERSION, hash, JSON.stringify(bundle), actorEmail);
  return { bundle, omitted };
}

const str = (v, max, path, { required = false } = {}) => {
  if (v == null || v === "") {
    if (required) throw new BundleError(400, `${path} is required`);
    return;
  }
  if (typeof v !== "string") throw new BundleError(400, `${path} must be text`);
  if (v.length > max) throw new BundleError(400, `${path} is too long`);
};
const int = (v, min, max, path, { nullable = true } = {}) => {
  if (v == null) {
    if (!nullable) throw new BundleError(400, `${path} is required`);
    return;
  }
  if (!Number.isInteger(v) || v < min || v > max) throw new BundleError(400, `${path} must be a whole number from ${min} to ${max}`);
};
const list = (v, max, path) => {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new BundleError(400, `${path} must be a list`);
  if (v.length > max) throw new BundleError(400, `${path} has too many entries (at most ${max})`);
  return v;
};

/** Checks a bundle's shape before anything is created. Throws BundleError(400) with a path. */
export function validateBundle(b) {
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new BundleError(400, "This isn't a course bundle");
  if (b.format !== BUNDLE_FORMAT) throw new BundleError(400, "This isn't a Somabox course bundle");
  if (b.formatVersion !== BUNDLE_FORMAT_VERSION) {
    throw new BundleError(400, b.formatVersion > BUNDLE_FORMAT_VERSION ? "This bundle was made by a newer version of Somabox; update this box first" : "Unsupported bundle format");
  }
  if (!UUID.test(String(b.bundleId || ""))) throw new BundleError(400, "bundleId must be a UUID");
  int(b.version, 1, 1_000_000, "version", { nullable: false });
  if (!b.course || typeof b.course !== "object") throw new BundleError(400, "course is required");
  str(b.course.title, LIMITS.title, "course.title", { required: true });
  str(b.course.description, LIMITS.text, "course.description");
  str(b.course.syllabusBody, LIMITS.text, "course.syllabusBody");

  const refs = new Set();
  for (const [i, o] of list(b.outcomes, LIMITS.outcomes, "outcomes").entries()) {
    str(o?.ref, 20, `outcomes[${i}].ref`, { required: true });
    if (refs.has(o.ref)) throw new BundleError(400, `outcomes[${i}].ref "${o.ref}" is used twice`);
    refs.add(o.ref);
    str(o.title, 1000, `outcomes[${i}].title`, { required: true });
    str(o.code, 40, `outcomes[${i}].code`);
    str(o.description, 5000, `outcomes[${i}].description`);
  }
  const checkRef = (ref, path) => {
    if (ref != null && !refs.has(ref)) throw new BundleError(400, `${path} refers to an outcome that isn't in the bundle`);
  };

  let baselines = 0;
  for (const [mi, m] of list(b.modules, LIMITS.modules, "modules").entries()) {
    const at = `modules[${mi}]`;
    if (!["regular", "baseline"].includes(m?.kind)) throw new BundleError(400, `${at}.kind must be regular or baseline`);
    if (m.kind === "baseline" && ++baselines > 1) throw new BundleError(400, "A course can have only one baseline module");
    if (m.kind === "regular") int(m.weekOffset, 1, 60, `${at}.weekOffset`, { nullable: false });
    int(m.dayOffset, 0, 6, `${at}.dayOffset`);
    str(m.title, LIMITS.title, `${at}.title`, { required: true });
    for (const [ii, it] of list(m.items, LIMITS.items, `${at}.items`).entries()) {
      const p = `${at}.items[${ii}]`;
      if (!["sub_header", "page", "assignment", "quiz", "discussion"].includes(it?.type)) throw new BundleError(400, `${p}.type isn't supported`);
      str(it.title, LIMITS.title, `${p}.title`, { required: true });
      for (const [ri, ref] of list(it.outcomeRefs, LIMITS.outcomes, `${p}.outcomeRefs`).entries()) checkRef(ref, `${p}.outcomeRefs[${ri}]`);
      if (it.type === "page") {
        str(it.page?.body, LIMITS.text, `${p}.page.body`);
        str(it.page?.bodyHtml, LIMITS.text, `${p}.page.bodyHtml`);
        if (it.page?.bodyJson != null && JSON.stringify(it.page.bodyJson).length > LIMITS.text) throw new BundleError(400, `${p}.page.bodyJson is too long`);
      } else if (it.type === "assignment") {
        str(it.assignment?.description, LIMITS.text, `${p}.assignment.description`);
        if (it.assignment?.pointsPossible != null && !(Number(it.assignment.pointsPossible) >= 0)) throw new BundleError(400, `${p}.assignment.pointsPossible must be 0 or more`);
        for (const [ci, c] of list(it.assignment?.rubric?.criteria, LIMITS.criteria, `${p}.assignment.rubric.criteria`).entries()) {
          str(c?.title, LIMITS.title, `${p}.assignment.rubric.criteria[${ci}].title`, { required: true });
          checkRef(c.outcomeRef, `${p}.assignment.rubric.criteria[${ci}].outcomeRef`);
        }
      } else if (it.type === "quiz") {
        if (it.quiz?.kind != null && !["graded", "practice", "baseline"].includes(it.quiz.kind)) throw new BundleError(400, `${p}.quiz.kind must be graded, practice or baseline`);
        if (it.quiz?.kind === "baseline" && m.kind !== "baseline") throw new BundleError(400, `${p}: a baseline quiz must be in the baseline module`);
        for (const [qi, q] of list(it.quiz?.questions, LIMITS.questions, `${p}.quiz.questions`).entries()) {
          str(q?.prompt, 5000, `${p}.quiz.questions[${qi}].prompt`, { required: true });
          list(q.options, LIMITS.options, `${p}.quiz.questions[${qi}].options`);
          checkRef(q.outcomeRef, `${p}.quiz.questions[${qi}].outcomeRef`);
        }
      } else if (it.type === "discussion") {
        str(it.discussion?.body, LIMITS.text, `${p}.discussion.body`);
      }
    }
  }
  return b;
}

/** Stores a bundle version in the box's library (read-only). Same id+version must be the same content. */
export async function addToLibrary(bundle, { source, actorEmail }) {
  validateBundle(bundle);
  const { bundleId, version, formatVersion } = bundle;
  const hash = contentHash(bundle);
  const existing = await localDb.prepare("SELECT * FROM course_bundles WHERE bundle_id = ? AND version = ?").get(bundleId, version);
  if (existing) {
    if (existing.content_hash !== hash) throw new BundleError(409, `This box already has version ${version} of this bundle with different content. Bundle versions can't change once published.`);
    return { entry: existing, added: false };
  }
  const entry = await localDb.prepare(`
    INSERT INTO course_bundles (bundle_id, version, title, format_version, content_hash, data, source, added_by)
    VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?) RETURNING *
  `).get(bundleId, version, bundle.course.title, formatVersion, hash, JSON.stringify(bundle), source, actorEmail);
  return { entry, added: true };
}

/**
 * Creates a new draft course from a validated bundle, all-or-nothing. The caller becomes its
 * teacher. Returns { courseId, warnings, existingCopies }.
 */
export async function importBundle(bundle, user) {
  validateBundle(bundle);
  const existingCopies = await localDb.prepare(`
    SELECT id, title, imported_bundle_version AS version FROM courses WHERE imported_bundle_id = ? ORDER BY imported_at
  `).all(bundle.bundleId);
  const warnings = [...(Array.isArray(bundle.warnings) ? bundle.warnings.filter((w) => typeof w === "string") : [])];

  const courseId = await localDb.transaction(async () => {
    const id = await generateUniqueCourseCode();
    const c = bundle.course;
    await localDb.prepare(`
      INSERT INTO courses (id, title, description, syllabus_body, grade, length_weeks, grading_scale, lifecycle,
                           created_by_teacher_email, imported_bundle_id, imported_bundle_version, imported_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(id, c.title, c.description || "", c.syllabusBody || "", c.grade || "",
      Number.isInteger(c.lengthWeeks) ? c.lengthWeeks : null, c.gradingScale || null, user.email, bundle.bundleId, bundle.version);
    await seedDefaultNavItems(id);
    await localDb.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'teacher', 'active')").run(id, user.email);

    const outcomeIds = new Map();
    const usedCodes = new Set();
    for (const [i, o] of (bundle.outcomes || []).entries()) {
      let code = String(o.code || `OUT-${i + 1}`).slice(0, 40);
      while (usedCodes.has(code)) code = `${code}-${i + 1}`;
      usedCodes.add(code);
      const scale = ["4pt", "percent", "pass_fail"].includes(o.masteryScale) ? o.masteryScale : "4pt";
      const row = await localDb.prepare(`
        INSERT INTO outcomes (course_id, code, title, description, mastery_scale, mastery_levels) VALUES (?, ?, ?, ?, ?, ?) RETURNING id
      `).get(id, code, o.title, o.description || "", scale, o.masteryLevels ? JSON.stringify(o.masteryLevels) : null);
      outcomeIds.set(o.ref, Number(row.id));
    }
    const ids = (refs) => (refs || []).map((r) => outcomeIds.get(r)).filter(Boolean);

    for (const [mi, m] of (bundle.modules || []).entries()) {
      const mod = await localDb.prepare(`
        INSERT INTO modules (course_id, title, description, position, published, created_by_teacher_email, kind, week_offset, day_offset)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id
      `).get(id, m.title, m.description || "", mi, m.published ? 1 : 0, user.email, m.kind, m.kind === "baseline" ? 0 : m.weekOffset, m.dayOffset || 0);
      const moduleId = Number(mod.id);
      for (const it of m.items || []) {
        if (it.type === "sub_header") {
          const pos = Number((await localDb.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM module_items WHERE module_id = ?").get(moduleId)).p);
          await localDb.prepare(`
            INSERT INTO module_items (module_id, item_type, content_id, title, position, indent_level, published) VALUES (?, 'sub_header', NULL, ?, ?, ?, 1)
          `).run(moduleId, it.title, pos, Math.min(3, Math.max(0, Number(it.indent) || 0)));
          continue;
        }
        const days = { releaseDay: it.releaseDay ?? 0, dueDay: it.dueDay ?? null, closeDay: it.closeDay ?? null };
        const common = { title: it.title, ...days };
        let data;
        if (it.type === "page") data = { ...common, body: it.page?.body || "", bodyJson: it.page?.bodyJson ?? null, bodyHtml: it.page?.bodyHtml ?? null };
        else if (it.type === "assignment") data = { ...common, description: it.assignment?.description || "", pointsPossible: it.assignment?.pointsPossible ?? 100, outcomeIds: ids(it.outcomeRefs) };
        else if (it.type === "quiz") {
          data = {
            ...common, description: it.quiz?.description || "", kind: it.quiz?.kind, attemptsAllowed: it.quiz?.attemptsAllowed ?? null,
            timeLimitMinutes: it.quiz?.timeLimitMinutes ?? null, outcomeIds: ids(it.outcomeRefs),
            questions: (it.quiz?.questions || []).map((q) => ({ prompt: q.prompt, questionType: q.questionType, options: q.options || [], correctOption: q.correctOption ?? null, points: q.points, outcomeId: outcomeIds.get(q.outcomeRef) || null })),
          };
        } else data = { ...common, body: it.discussion?.body || "" };

        const graded = it.type === "discussion" && it.discussion?.graded;
        const result = await createModuleContent({
          courseId: id, moduleId, itemType: it.type, data, actorEmail: user.email,
          publish: !!it.published && !graded, indentLevel: it.indent,
        });
        if (result.notice) warnings.push(`"${it.title}": ${result.notice}`);
        if (it.type === "assignment" && it.assignment?.rubric?.criteria?.length) {
          await saveRubric(id, { id: result.contentId, title: it.title }, {
            title: it.assignment.rubric.title,
            criteria: it.assignment.rubric.criteria.map((c) => ({ ...c, outcomeId: outcomeIds.get(c.outcomeRef) || null })),
          });
        }
        if (graded) {
          const points = Number(it.discussion.pointsPossible) || 0;
          await localDb.prepare("UPDATE discussions SET graded = 1, points_possible = ? WHERE id = ?").run(points, result.contentId);
          const assignmentId = await linkDiscussionAssignment(id, result.contentId, it.title, points, user.email);
          if (ids(it.outcomeRefs).length) await setItemOutcomes(id, "assignment", assignmentId, ids(it.outcomeRefs));
          if (it.published) {
            if (ids(it.outcomeRefs).length) {
              await localDb.prepare("UPDATE discussions SET published = 1 WHERE id = ?").run(result.contentId);
              await localDb.prepare("UPDATE module_items SET published = 1 WHERE item_type = 'discussion' AND content_id = ?").run(result.contentId);
            } else {
              warnings.push(`"${it.title}": saved as a draft: a graded discussion needs an outcome before it's published.`);
            }
          }
        }
      }
    }
    await refreshDueDates(id);
    return id;
  })();
  return { courseId, warnings, existingCopies };
}
