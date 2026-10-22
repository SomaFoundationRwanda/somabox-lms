// Boots the whole app for the e2e suite: a fresh PostgreSQL database, the real backend (with a
// fake AI gateway, so no model is needed) on :3100, and a production build of the frontend on
// :3101. Playwright starts this as its webServer and stops it at the end of the run.
//
// Runs from e2e/ so the backend's dotenv finds no .env: the developer's sync settings, cloud keys
// and database never reach the tests.
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BACKEND_PORT, FRONTEND_PORT, PASSWORD, USERS } from "./support/env.mjs";

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
for (const u of Object.values(USERS)) {
  await dbManager.localDb
    .prepare("INSERT INTO users (email, full_name, password_hash, role, gender, profile_completed_at) VALUES (?, ?, ?, ?, 'female', CURRENT_TIMESTAMP)")
    .run(u.email, u.name, hash, u.role);
}

const { createApp } = await import("../soma-x-backend/src/app.js");
const { startExploreIndexer } = await import("../soma-x-backend/src/services/explore/indexer.js");
startExploreIndexer();
await new Promise((resolve) => createApp({ logRequests: false }).listen(BACKEND_PORT, resolve));
console.log(`[e2e] backend on :${BACKEND_PORT} (database ${dbName}, fake AI gateway ${gateway.url})`);

const env = { ...process.env, NEXT_DIST_DIR: DIST_DIR, NEXT_PUBLIC_SERVER_URL: `http://localhost:${BACKEND_PORT}` };
const next = path.join(FRONTEND, "node_modules/.bin/next");
// E2E_SKIP_BUILD=1 reuses the last build (fine when only tests changed, not the frontend).
if (!(process.env.E2E_SKIP_BUILD && fs.existsSync(path.join(FRONTEND, DIST_DIR, "BUILD_ID")))) {
  await run(next, ["build"], { cwd: FRONTEND, env });
}
const frontend = spawn(next, ["start", "-p", String(FRONTEND_PORT)], { cwd: FRONTEND, env, stdio: "inherit" });

async function shutdown() {
  frontend.kill();
  await gateway.stop();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
