// Boots the whole app for the e2e suite: a fresh PostgreSQL database, the real backend (with a
// fake AI gateway, so no model is needed) on :3100, and a production build of the frontend on
// :3101. Playwright starts this as its webServer and stops it at the end of the run.
//
// Reads no .env file (SOMABOX_ENV_FILE=none, for every process it starts): the developer's sync
// settings, cloud keys and database never reach the tests.
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BACKEND_PORT, FRONTEND_PORT, PASSWORD, SETUP_CODE, USERS } from "./support/env.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
// The backend's own dependencies (bcrypt is not hoisted to the root node_modules).
const backendRequire = createRequire(path.join(ROOT, "soma-x-backend/package.json"));
const bcrypt = backendRequire("bcrypt");
const pg = backendRequire("pg");
const FRONTEND = path.join(ROOT, "soma-x");
const DIST_DIR = ".next-e2e";

const host = process.env.PGHOST || "localhost";
const port = Number(process.env.PGPORT || 5432);
const user = process.env.PGUSER || process.env.USER || "postgres";
const password = process.env.PGPASSWORD || "";
const dbName = process.env.E2E_DATABASE || "somabox_e2e";

async function adminQuery(sql) {
  const client = new pg.Client({ host, port, user, password, database: "postgres" });
  await client.connect();
  try { await client.query(sql); } finally { await client.end(); }
}

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with ${code}`))));
  });
}

// Every run starts from an empty school.
await adminQuery(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
await adminQuery(`CREATE DATABASE ${dbName}`);

process.env.SOMABOX_ENV_FILE = "none";

const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
process.env.DATABASE_URL = `postgresql://${auth}@${host}:${port}/${dbName}`;
process.env.PORT = String(BACKEND_PORT);
process.env.EXPLORE_COVERS = "off";
process.env.SCHOOL_TIMEZONE = "Africa/Kigali";
delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
delete process.env.SYNC_URL;
delete process.env.SYNC_TOKEN;
delete process.env.CLOUD_TOKEN;
process.env.CLOUD_URL = "http://127.0.0.1:9"; // nothing listens there: the box is "offline"

const { startFakeGateway } = await import("../soma-x-backend/test/fake-gateway.js");
const gateway = await startFakeGateway();
process.env.AI_GATEWAY_URL = gateway.url;

const dbManager = await import("../soma-x-backend/src/helpers/db-manager.js");
await dbManager.initSchemas();
const hash = await bcrypt.hash(PASSWORD, 4);
for (const u of Object.values(USERS).filter((u) => u.role !== "admin")) {
  await dbManager.localDb
    .prepare("INSERT INTO users (email, full_name, password_hash, role, gender, profile_completed_at) VALUES (?, ?, ?, ?, 'female', CURRENT_TIMESTAMP)")
    .run(u.email, u.name, hash, u.role);
}

// No admin yet: the box prints its setup code (preset here), and auth.setup.mjs uses it.
process.env.SOMABOX_SETUP_CODE = SETUP_CODE;
const { prepareFirstRun } = await import("../soma-x-backend/src/services/setup.services.js");
await prepareFirstRun();

const { createApp } = await import("../soma-x-backend/src/app.js");
const { startExploreIndexer } = await import("../soma-x-backend/src/services/explore/indexer.js");
startExploreIndexer();
await new Promise((resolve) => createApp({ logRequests: false }).listen(BACKEND_PORT, resolve));
console.log(`[e2e] backend on :${BACKEND_PORT} (database ${dbName}, fake AI gateway ${gateway.url})`);

// soma-x/next.config.mjs builds this address into the frontend.
const env = { ...process.env, NEXT_DIST_DIR: DIST_DIR, BACKEND_PORT: String(BACKEND_PORT), FRONTEND_PORT: String(FRONTEND_PORT), PUBLIC_BACKEND_URL: `http://localhost:${BACKEND_PORT}` };
const next = path.join(FRONTEND, "node_modules/.bin/next");
// E2E_SKIP_BUILD=1 reuses the last build (fine when only tests changed, not the frontend).
if (!(process.env.E2E_SKIP_BUILD && fs.existsSync(path.join(FRONTEND, DIST_DIR, "BUILD_ID")))) {
  await run(next, ["build"], { cwd: FRONTEND, env });
}
const frontend = spawn(next, ["start", "-p", String(FRONTEND_PORT)], { cwd: FRONTEND, env, stdio: "inherit" });

// Tests name every folder and book they add to the box's content folders "e2e…" and remove them
// again; this catches what a failed test left behind, so the developer's own box stays clean.
// Course files and covers are named by course id or upload, so those are swept by "wasn't there
// at start".
const CONTENT = path.join(ROOT, "soma-x-backend/local-content");
const BY_START = ["course-files", "course-covers"].map((dir) => path.join(CONTENT, dir));
const atStart = new Map(BY_START.map((dir) => [dir, new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : [])]));

function sweepContent() {
  for (const dir of BY_START) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!atStart.get(dir).has(name)) fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    }
  }
  for (const dir of ["custom-content", "library", "library/covers"]) {
    const full = path.join(CONTENT, dir);
    if (!fs.existsSync(full)) continue;
    for (const name of fs.readdirSync(full)) {
      if (/^e2e/i.test(name)) fs.rmSync(path.join(full, name), { recursive: true, force: true });
    }
  }
}

async function shutdown() {
  sweepContent();
  frontend.kill();
  await gateway.stop();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
