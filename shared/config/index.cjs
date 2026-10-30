// The single .env at the repository root, for every SOMABOX app: loaded once, checked against
// one schema, and returned with its defaults. See .env.example for what each setting does.
//
// - Values already in the environment win over the files (as with dotenv), and .env.local
//   wins over .env, so a machine can override a shared .env without editing it.
// - Tests never read the files: node --test runs (NODE_TEST_CONTEXT) and anything started with
//   SOMABOX_ENV_FILE=none (the e2e server) see only the environment they were given.
// - The apps used to have their own .env files. Those are refused with a pointer to
//   `pnpm env:migrate`, so settings can't silently live in two places.
//
// CommonJS so pm2's ecosystem.config.cjs can require it; ES modules import it as usual.
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { parseEnv } = require("node:util");
const { z } = require("zod");

// SOMABOX_ROOT lets the tests point it at a scratch folder instead of this repository.
const root = () => process.env.SOMABOX_ROOT || path.join(__dirname, "..", "..");

// The apps' old per-app files, now replaced by the root .env.
const LEGACY_FILES = ["soma-x-backend/.env", "soma-x/.env", "soma-x/.env.local", "soma-x/.env.production", "soma-x/.env.production.local", "ai/gateway/.env"];

const filesDisabled = () => process.env.SOMABOX_ENV_FILE === "none" || Boolean(process.env.NODE_TEST_CONTEXT);

function legacyEnvFiles() {
  return LEGACY_FILES.filter((name) => fs.existsSync(path.join(root(), name)));
}

let loadedFrom = null;

/** Loads the root .env.local and .env into process.env (once). Returns the files read. */
function loadEnv() {
  if (loadedFrom) return loadedFrom;
  loadedFrom = [];
  if (filesDisabled()) return loadedFrom;
  const legacy = legacyEnvFiles();
  if (legacy.length) {
    throw new Error(
      `SOMABOX now reads one .env at the repository root, but these older files still exist: ${legacy.join(", ")}.\n` +
      "Run `pnpm env:migrate` to move their settings into the root .env (the old files are kept as .env.migrated).",
    );
  }
  for (const name of [".env.local", ".env"]) {
    const file = path.join(root(), name);
    if (!fs.existsSync(file)) continue;
    for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(file, "utf8")))) {
      if (process.env[key] === undefined) process.env[key] = value;
    }
    loadedFrom.push(name);
  }
  return loadedFrom;
}

// ---- The schema -----------------------------------------------------------------------------
// Every value arrives as a string; empty strings count as "not set".

const port = (fallback) => z.string().regex(/^\d+$/, "must be a port number").transform(Number)
  .pipe(z.number().int().min(1, "must be a port number from 1 to 65535").max(65535, "must be a port number from 1 to 65535"))
  .default(fallback);
const count = (fallback) => z.string().regex(/^\d+$/, "must be a whole number").transform(Number)
  .pipe(z.number().int().min(1, "must be at least 1")).optional().transform((n) => n ?? fallback);
const flag = (fallback) => z.enum(["true", "false"], { error: "must be true or false" }).transform((v) => v === "true").default(fallback);
const url = z.string().refine((v) => { try { return /^https?:$/.test(new URL(v).protocol); } catch { return false; } }, "must be a web address like http://10.0.0.1:3000");
const timeZone = z.string().refine((tz) => { try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; } }, "must be a time zone name like Africa/Kigali");

const schema = z.object({
  // Ports
  BACKEND_PORT: port(3000),
  FRONTEND_PORT: port(3001),
  AI_GATEWAY_PORT: port(5000),
  AI_RUNTIME_PORT: port(8080),
  PUBLIC_BACKEND_URL: z.string().refine((v) => v.startsWith("/") || url.safeParse(v).success, "must be a web address like http://10.0.0.1:3000, or a path like /api").optional(),

  // Database
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must start with postgresql://").optional(),
  PGHOST: z.string().default("localhost"),
  PGPORT: port(5432),
  PGUSER: z.string().optional(),
  PGPASSWORD: z.string().optional(),
  PGDATABASE: z.string().default("somabox_lms"),
  PGSSL: flag(false),
  PGMAXCONNECTIONS: count(50),

  // School and box
  SCHOOL_TIMEZONE: timeZone.default("Africa/Kigali"),
  BACKUP_DIR: z.string().optional(),
  DEVICE_INFO_PATH: z.string().optional(),
  MEDIA_SECRET: z.string().min(16, "must be at least 16 characters").optional(),
  MEDIA_COOKIE_SECURE: flag(false),
  // Presets the first-run setup code (tests, scripted installs); normally a random one is printed.
  SOMABOX_SETUP_CODE: z.string().refine((v) => v.replace(/[^A-Za-z0-9]/g, "").length >= 8, "must have at least 8 letters or digits").optional(),

  // Cloud content and sync
  CLOUD_URL: url.optional(),
  CLOUD_TOKEN: z.string().optional(),
  SYNC_URL: url.optional(),
  SYNC_TOKEN: z.string().optional(),
  SYNC_TRANSPORT: z.enum(["http", "firestore", "none"], { error: "must be http, firestore or none" }).optional(),
  FIREBASE_SERVICE_ACCOUNT_PATH: z.string().optional(),
  FIRESTORE_SYNC_COLLECTION: z.string().optional(),
  SYNC_INTERVAL_MINUTES: count(15),
  SYNC_TIMEOUT_MS: count(60000),
  SYNC_BATCH_SIZE: count(200),

  // AI
  AI_GATEWAY_URL: url.optional(),
  AI_REQUEST_TIMEOUT_MS: count(300000),
  AI_JOB_CONCURRENCY: count(1),
  SUMMARY_DAILY_LIMIT: count(5),
  SUMMARY_MAX_PARTS: count(8),
  SUMMARY_MAX_PAGES: count(120),

  // Explore
  EXPLORE_RESCAN_MINUTES: count(5),
  EXPLORE_COVERS: z.enum(["on", "off"], { error: "must be on or off" }).default("on"),

  // Frontend features (built into the frontend)
  NEXT_PUBLIC_FEATURE_SOL_QUIZ_ENABLED: flag(false),
});

const PORT_LABELS = { BACKEND_PORT: "backend", FRONTEND_PORT: "frontend", AI_GATEWAY_PORT: "AI gateway", AI_RUNTIME_PORT: "AI model runtime" };

/**
 * Loads the files (unless tests) and returns the checked settings with their defaults, plus
 * `ports` and `serverUrl` (the backend address built into the frontend). Throws one Error
 * listing every setting that's wrong, with what was found.
 */
function readConfig() {
  loadEnv();
  const input = {};
  for (const key of Object.keys(schema.shape)) {
    const value = process.env[key];
    if (value !== undefined && value !== "") input[key] = value;
  }
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => {
      const key = String(issue.path[0]);
      return `- ${key}=${input[key]} ${issue.message}`;
    });
    throw new Error(`Some settings in the .env are wrong:\n${lines.join("\n")}`);
  }
  const settings = parsed.data;

  const ports = {};
  for (const name of Object.keys(PORT_LABELS)) {
    const clash = Object.entries(ports).find(([, p]) => p === settings[name]);
    if (clash) throw new Error(`${name} and ${clash[0]} are both ${settings[name]} in the .env; each service needs its own port.`);
    ports[name] = settings[name];
  }

  return Object.freeze({
    ...settings,
    ports: Object.freeze(ports),
    // The frontend calls this; it's built in, so on a school box set the box's LAN address.
    serverUrl: settings.PUBLIC_BACKEND_URL || `http://localhost:${ports.BACKEND_PORT}`,
    files: [...loadedFrom],
  });
}

function portFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port);
  });
}

/** Rejects with a message naming the setting to change when one of `names` is taken. */
async function assertPortsFree(ports, names) {
  const busy = [];
  for (const name of names) if (!(await portFree(ports[name]))) busy.push(name);
  if (busy.length) {
    throw new Error(busy.map((name) => `Port ${ports[name]} for the ${PORT_LABELS[name]} is already in use (${name}).`).join("\n") +
      "\nStop whatever is using it, or choose another port in the .env (see .env.example).");
  }
}

/**
 * Moves the old per-app .env files into the root .env: settings the root .env doesn't have
 * yet are added (the backend's PORT becomes BACKEND_PORT, the frontend's NEXT_PUBLIC_SERVER_URL
 * becomes PUBLIC_BACKEND_URL unless it's just this machine's backend), and each old file is
 * renamed to <name>.migrated. Returns { added, skipped, renamed } for the report.
 */
function migrateEnvFiles() {
  const rootEnv = path.join(root(), ".env");
  const existing = fs.existsSync(rootEnv) ? parseEnv(fs.readFileSync(rootEnv, "utf8")) : {};
  const added = [];
  const skipped = [];
  const renamed = [];
  let out = fs.existsSync(rootEnv) ? fs.readFileSync(rootEnv, "utf8").replace(/\n*$/, "\n") : "";

  for (const name of legacyEnvFiles()) {
    const file = path.join(root(), name);
    const values = parseEnv(fs.readFileSync(file, "utf8"));
    const lines = [];
    for (let [key, value] of Object.entries(values)) {
      if (name === "soma-x-backend/.env" && key === "PORT") key = "BACKEND_PORT";
      if (key === "NEXT_PUBLIC_SERVER_URL") {
        const backendPort = existing.BACKEND_PORT || values.BACKEND_PORT || "3000";
        if (value === `http://localhost:${backendPort}` || value === `http://127.0.0.1:${backendPort}`) {
          skipped.push(`${key} (${name}): the frontend now follows BACKEND_PORT`);
          continue;
        }
        key = "PUBLIC_BACKEND_URL";
      }
      if (key === "BACKEND_PORT" && value === "3000" && existing.BACKEND_PORT === undefined) {
        skipped.push(`PORT (${name}): 3000 is already the default`);
        continue;
      }
      if (existing[key] !== undefined) {
        if (existing[key] !== value) skipped.push(`${key} (${name}): the root .env already has a different value, which wins`);
        continue;
      }
      existing[key] = value;
      lines.push(`${key}=${/[\s#"']/.test(value) ? JSON.stringify(value) : value}`);
      added.push(`${key} (from ${name})`);
    }
    if (lines.length) out += `${out ? "\n" : ""}# Moved from ${name}\n${lines.join("\n")}\n`;
    fs.renameSync(file, `${file}.migrated`);
    renamed.push(`${name} -> ${name}.migrated`);
  }
  if (added.length) fs.writeFileSync(rootEnv, out);
  return { added, skipped, renamed };
}

module.exports = { loadEnv, readConfig, assertPortsFree, migrateEnvFiles, legacyEnvFiles, root };
