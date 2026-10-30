// Phase 11: a backup restores into a fresh database with every row and uploaded file, and a
// damaged backup or a non-empty target is refused. Skipped when pg_dump isn't installed.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { startTestServer, USERS } from "./helpers.js";

const hasTools = (() => {
  try { execFileSync("pg_dump", ["--version"]); execFileSync("pg_restore", ["--version"]); return true; } catch { return false; }
})();

let ctx;
let work;
const restoredDb = `somabox_restore_${process.pid}_${Date.now()}`;
const adminUrl = () => process.env.DATABASE_URL.replace(/\/[^/]+$/, "/postgres");
const restoredUrl = () => process.env.DATABASE_URL.replace(/\/[^/]+$/, `/${restoredDb}`);

async function adminQuery(sql) {
  const client = new pg.Client({ connectionString: adminUrl() });
  await client.connect();
  try { await client.query(sql); } finally { await client.end(); }
}

before(async () => {
  if (!hasTools) return;
  ctx = await startTestServer();
  work = fs.mkdtempSync(path.join(os.tmpdir(), "somabox-backup-"));
});

after(async () => {
  if (!hasTools) return;
  await adminQuery(`DROP DATABASE IF EXISTS ${restoredDb} WITH (FORCE)`);
  fs.rmSync(work, { recursive: true, force: true });
  await ctx.stop();
});

test("backup, then restore onto a replacement box: same rows, same files, same box id", { skip: !hasTools && "pg_dump not installed" }, async () => {
  const { backup, restore, verify } = await import("../src/scripts/backup.js");
  const courseId = await ctx.createCourse("Backed up");
  const o = (await ctx.api("POST", `/courses/${courseId}/outcomes`, { token: ctx.tokens.teacher, body: { title: "Read" } })).body;
  assert.ok(o.id);
  const content = path.join(work, "content");
  fs.mkdirSync(path.join(content, "course-files", courseId), { recursive: true });
  fs.writeFileSync(path.join(content, "course-files", courseId, "worksheet.pdf"), "pretend pdf");
  fs.mkdirSync(path.join(content, "international"), { recursive: true });
  fs.writeFileSync(path.join(content, "international", "shipped.html"), "not backed up");

  const { dir, manifest } = await backup({ out: path.join(work, "backups"), url: process.env.DATABASE_URL, contentRoot: content });
  assert.deepEqual(manifest.uploadDirs, ["course-files"]);
  assert.ok(manifest.counts.courses >= 1);
  assert.ok(manifest.migrations.includes("0014_sync_bundles"));
  await verify(dir);

  await adminQuery(`CREATE DATABASE ${restoredDb}`);
  const newContent = path.join(work, "restored-content");
  const { restored } = await restore({ from: dir, url: restoredUrl(), contentRoot: newContent });
  assert.deepEqual(restored.counts, manifest.counts);
  assert.equal(restored.boxId, manifest.boxId, "a replacement box keeps its identity");
  assert.equal(fs.readFileSync(path.join(newContent, "course-files", courseId, "worksheet.pdf"), "utf8"), "pretend pdf");
  assert.ok(!fs.existsSync(path.join(newContent, "international")), "shipped content isn't in backups");

  const client = new pg.Client({ connectionString: restoredUrl() });
  await client.connect();
  const course = (await client.query("SELECT title FROM courses WHERE id = $1", [courseId])).rows[0];
  const user = (await client.query("SELECT role FROM users WHERE email = $1", [USERS.teacher.email])).rows[0];
  await client.end();
  assert.equal(course.title, "Backed up");
  assert.equal(user.role, "teacher");

  // Restoring over a database that has data is refused unless forced.
  await assert.rejects(restore({ from: dir, url: restoredUrl(), contentRoot: newContent }), /isn't empty/);

  // A damaged backup is caught before anything is touched.
  fs.appendFileSync(path.join(dir, "db.dump"), "x");
  await assert.rejects(verify(dir), /damaged/);
});

test("old backups are pruned, keeping the newest", { skip: !hasTools && "pg_dump not installed" }, async () => {
  const { pruneBackups } = await import("../src/scripts/backup.js");
  const out = path.join(work, "prune");
  for (const stamp of ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"]) fs.mkdirSync(path.join(out, `somabox-backup-${stamp}`), { recursive: true });
  pruneBackups(out, 2);
  assert.deepEqual(fs.readdirSync(out).sort(), ["somabox-backup-2026-01-03", "somabox-backup-2026-01-04"]);
});
