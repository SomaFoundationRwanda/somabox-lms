// Box backup and restore.
//
// A backup is one folder: db.dump (pg_dump custom format), files.tar.gz (what teachers and admins
// uploaded: course files and covers, custom content, the library), and manifest.json (box id,
// applied migrations, row counts, checksums). Shipped content (Khan Academy, Wikipedia, ...)
// is not included: it is reinstalled with the box image.
//
//   node src/scripts/backup.js backup  [--out /var/backups/somabox] [--keep 14]
//   node src/scripts/backup.js restore --from <backup folder> [--database-url URL] [--force] [--new-box-id]
//   node src/scripts/backup.js verify  --from <backup folder>
//
// Needs pg_dump / pg_restore / tar on the PATH (same PostgreSQL major version as the server).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../local-content");
export const UPLOAD_DIRS = ["course-files", "course-covers", "custom-content", "library"];
const COUNTED_TABLES = ["users", "courses", "enrollments", "modules", "module_items", "assignment_submissions", "quiz_attempts", "outcome_results", "sync_outbox"];

function databaseUrl(explicit) {
  if (explicit) return explicit;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const { PGUSER = process.env.USER, PGPASSWORD = "", PGHOST = "localhost", PGPORT = "5432", PGDATABASE = "somabox_lms" } = process.env;
  const auth = PGPASSWORD ? `${encodeURIComponent(PGUSER)}:${encodeURIComponent(PGPASSWORD)}` : encodeURIComponent(PGUSER);
  return `postgresql://${auth}@${PGHOST}:${PGPORT}/${PGDATABASE}`;
}

async function sha256(file) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => fs.createReadStream(file).on("data", (d) => hash.update(d)).on("end", resolve).on("error", reject));
  return hash.digest("hex");
}

async function withClient(url, fn) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function snapshot(url) {
  return withClient(url, async (client) => {
    const counts = {};
    for (const t of COUNTED_TABLES) counts[t] = Number((await client.query(`SELECT COUNT(*)::int AS n FROM ${t}`)).rows[0].n);
    const migrations = (await client.query("SELECT id FROM schema_migrations ORDER BY id")).rows.map((r) => r.id);
    const box = (await client.query("SELECT value FROM system_settings WHERE key = 'box_id'")).rows[0]?.value ?? null;
    return { counts, migrations, boxId: box };
  });
}

/** Writes a backup folder and returns its path and manifest. */
export async function backup({ out = "backups", url, contentRoot = CONTENT_ROOT, keep = null } = {}) {
  const dbUrl = databaseUrl(url);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(out, `somabox-backup-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  const before = await snapshot(dbUrl);
  await run("pg_dump", ["--format=custom", "--no-owner", "--file", path.join(dir, "db.dump"), dbUrl], { maxBuffer: 1 << 26 });
  const dirs = UPLOAD_DIRS.filter((d) => fs.existsSync(path.join(contentRoot, d)));
  if (dirs.length) {
    await run("tar", ["-czf", path.join(dir, "files.tar.gz"), "-C", contentRoot, ...dirs], { maxBuffer: 1 << 26 });
  }
  const manifest = {
    format: "somabox-backup",
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    boxId: before.boxId,
    migrations: before.migrations,
    counts: before.counts,
    uploadDirs: dirs,
    checksums: {
      "db.dump": await sha256(path.join(dir, "db.dump")),
      ...(dirs.length ? { "files.tar.gz": await sha256(path.join(dir, "files.tar.gz")) } : {}),
    },
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
  if (keep) pruneBackups(path.resolve(out), keep);
  return { dir, manifest };
}

/** Keeps the newest `keep` backup folders in `out`. */
export function pruneBackups(out, keep) {
  const folders = fs.readdirSync(out).filter((f) => f.startsWith("somabox-backup-")).sort();
  for (const f of folders.slice(0, Math.max(0, folders.length - keep))) fs.rmSync(path.join(out, f), { recursive: true, force: true });
}

/** Checks a backup folder's files against its manifest. Throws on any mismatch. */
export async function verify(from) {
  const manifestPath = path.join(from, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`No manifest.json in ${from}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.format !== "somabox-backup") throw new Error("This folder isn't a Somabox backup");
  for (const [file, expected] of Object.entries(manifest.checksums)) {
    const actual = fs.existsSync(path.join(from, file)) ? await sha256(path.join(from, file)) : null;
    if (actual !== expected) throw new Error(`${file} is missing or damaged (checksum mismatch)`);
  }
  return manifest;
}

/**
 * Restores a backup into an EMPTY database (refuses a database with tables unless force) and
 * puts the uploaded files back. With newBoxId the restored box gets a new identity (use when
 * cloning to a second box, not when replacing a broken one).
 */
export async function restore({ from, url, contentRoot = CONTENT_ROOT, force = false, newBoxId = false }) {
  const manifest = await verify(from);
  const dbUrl = databaseUrl(url);
  const tables = await withClient(dbUrl, async (c) => Number((await c.query("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'")).rows[0].n));
  if (tables > 0 && !force) throw new Error("The target database isn't empty. Restore into a new, empty database (or pass --force to overwrite).");
  await run("pg_restore", ["--no-owner", "--clean", "--if-exists", "--exit-on-error", "--dbname", dbUrl, path.join(from, "db.dump")], { maxBuffer: 1 << 26 })
    .catch((error) => { throw new Error(`pg_restore failed: ${error.stderr || error.message}`); });
  if (manifest.checksums["files.tar.gz"]) {
    fs.mkdirSync(contentRoot, { recursive: true });
    await run("tar", ["-xzf", path.join(from, "files.tar.gz"), "-C", contentRoot], { maxBuffer: 1 << 26 });
  }
  if (newBoxId) {
    await withClient(dbUrl, (c) => c.query("UPDATE system_settings SET value = to_jsonb(gen_random_uuid()::text), updated_by = 'restore' WHERE key = 'box_id'"));
  }
  const after = await snapshot(dbUrl);
  for (const [table, n] of Object.entries(manifest.counts)) {
    if (after.counts[table] !== n) throw new Error(`Restored ${table} has ${after.counts[table]} rows, the backup had ${n}`);
  }
  return { manifest, restored: after };
}

// ---- CLI ----------------------------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [command, ...rest] = process.argv.slice(2);
  const arg = (name) => { const i = rest.indexOf(`--${name}`); return i >= 0 ? rest[i + 1] : undefined; };
  const flag = (name) => rest.includes(`--${name}`);
  const { default: dotenv } = await import("dotenv");
  dotenv.config();
  try {
    if (command === "backup") {
      const { dir, manifest } = await backup({ out: arg("out") || process.env.BACKUP_DIR || "backups", url: arg("database-url"), keep: arg("keep") ? Number(arg("keep")) : null });
      console.log(`Backup written to ${dir}\n${JSON.stringify(manifest.counts)}`);
    } else if (command === "restore") {
      if (!arg("from")) throw new Error("--from <backup folder> is required");
      const { restored } = await restore({ from: arg("from"), url: arg("database-url"), force: flag("force"), newBoxId: flag("new-box-id") });
      console.log(`Restored. ${JSON.stringify(restored.counts)}\nStart the server: it applies any newer migrations on start.`);
    } else if (command === "verify") {
      const manifest = await verify(arg("from"));
      console.log(`Backup is intact (made ${manifest.createdAt}, ${manifest.migrations.length} migrations).`);
    } else {
      console.log("Usage: backup.js backup [--out DIR] [--keep N] | restore --from DIR [--database-url URL] [--force] [--new-box-id] | verify --from DIR");
      process.exitCode = 2;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
