// @somabox/config: one .env at the root, checked once. Each case runs in a child process against
// a scratch folder, so this repository's own .env files never leak in.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const PACKAGE = path.join(__dirname, "..", "index.cjs");

function scratch(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "somabox-config-"));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

// Runs `code` (with `config` = the package) in a child process rooted at `dir`.
function run(dir, code, env = {}) {
  const script = `const config = require(${JSON.stringify(PACKAGE)}); try { console.log(JSON.stringify(${code})) } catch (e) { console.log(JSON.stringify({ error: e.message })) }`;
  return JSON.parse(execFileSync(process.execPath, ["-e", script], { env: { PATH: process.env.PATH, SOMABOX_ROOT: dir, ...env }, encoding: "utf8" }));
}

const read = (files, env) => {
  const dir = scratch(files);
  try { return run(dir, "config.readConfig()", env); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

test("without a .env every setting has its default", () => {
  const c = read();
  assert.deepEqual(c.ports, { BACKEND_PORT: 3000, FRONTEND_PORT: 3001, AI_GATEWAY_PORT: 5000, AI_RUNTIME_PORT: 8080 });
  assert.equal(c.serverUrl, "http://localhost:3000");
  assert.equal(c.PGDATABASE, "somabox_lms");
  assert.equal(c.SCHOOL_TIMEZONE, "Africa/Kigali");
  assert.equal(c.PGSSL, false);
  assert.equal(c.SYNC_INTERVAL_MINUTES, 15);
});

test("the .env sets values, and the frontend's backend address follows BACKEND_PORT", () => {
  const c = read({ ".env": "BACKEND_PORT=4100\nFRONTEND_PORT=4101\nPGSSL=true\nSYNC_INTERVAL_MINUTES=30\n" });
  assert.equal(c.ports.BACKEND_PORT, 4100);
  assert.equal(c.serverUrl, "http://localhost:4100");
  assert.equal(c.PGSSL, true);
  assert.equal(c.SYNC_INTERVAL_MINUTES, 30);
  assert.deepEqual(c.files, [".env"]);
});

test("PUBLIC_BACKEND_URL sets the address for a school box, or a proxy path", () => {
  assert.equal(read({ ".env": "PUBLIC_BACKEND_URL=http://10.0.0.1:3000\n" }).serverUrl, "http://10.0.0.1:3000");
  assert.equal(read({ ".env": "PUBLIC_BACKEND_URL=/api\n" }).serverUrl, "/api");
});

test(".env.local wins over .env, and the environment wins over both", () => {
  const files = { ".env": "BACKEND_PORT=4000\nPGDATABASE=shared\n", ".env.local": "BACKEND_PORT=4200\n" };
  const c = read(files);
  assert.equal(c.ports.BACKEND_PORT, 4200);
  assert.equal(c.PGDATABASE, "shared");
  assert.equal(read(files, { BACKEND_PORT: "4300" }).ports.BACKEND_PORT, 4300);
});

test("every wrong setting is listed with what was found", () => {
  const { error } = read({ ".env": "FRONTEND_PORT=abc\nPGSSL=yes\nSCHOOL_TIMEZONE=Mars/Base\nSYNC_URL=not-a-url\n" });
  assert.match(error, /FRONTEND_PORT=abc must be a port number/);
  assert.match(error, /PGSSL=yes must be true or false/);
  assert.match(error, /SCHOOL_TIMEZONE=Mars\/Base must be a time zone name/);
  assert.match(error, /SYNC_URL=not-a-url must be a web address/);
});

test("two services on one port are refused", () => {
  assert.match(read({ ".env": "FRONTEND_PORT=3000\n" }).error, /FRONTEND_PORT and BACKEND_PORT are both 3000/);
});

test("the old per-app .env files are refused until migrated", () => {
  assert.match(read({ "soma-x-backend/.env": "PGUSER=x\n" }).error, /soma-x-backend\/\.env.*pnpm env:migrate/s);
});

test("tests and SOMABOX_ENV_FILE=none read no files at all", () => {
  const files = { ".env": "BACKEND_PORT=4100\n", "soma-x-backend/.env": "PGUSER=x\n" };
  assert.equal(read(files, { SOMABOX_ENV_FILE: "none" }).ports.BACKEND_PORT, 3000);
  assert.equal(read(files, { NODE_TEST_CONTEXT: "child-v8" }).ports.BACKEND_PORT, 3000);
});

test("env:migrate moves the old files' settings into the root .env and renames them", () => {
  const dir = scratch({
    ".env": "PGDATABASE=kept\n",
    "soma-x-backend/.env": "PORT=4100\nPGDATABASE=other\nSYNC_URL=https://cloud.example.org/box-sync\n# a comment\n",
    "soma-x/.env": "NEXT_PUBLIC_SERVER_URL=http://localhost:4100\n",
  });
  try {
    const report = run(dir, "config.migrateEnvFiles()");
    assert.deepEqual(report.renamed, ["soma-x-backend/.env -> soma-x-backend/.env.migrated", "soma-x/.env -> soma-x/.env.migrated"]);
    assert.ok(report.skipped.some((s) => s.startsWith("PGDATABASE")), "the root's own value wins");
    assert.ok(report.skipped.some((s) => s.startsWith("NEXT_PUBLIC_SERVER_URL")), "a local backend address isn't needed");
    const c = run(dir, "config.readConfig()");
    assert.equal(c.ports.BACKEND_PORT, 4100);
    assert.equal(c.serverUrl, "http://localhost:4100");
    assert.equal(c.PGDATABASE, "kept");
    assert.equal(c.SYNC_URL, "https://cloud.example.org/box-sync");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a port already in use is reported with its setting", async () => {
  const { assertPortsFree } = require(PACKAGE);
  const blocker = net.createServer();
  await new Promise((r) => blocker.listen(0, r));
  const taken = blocker.address().port;
  try {
    await assert.rejects(assertPortsFree({ BACKEND_PORT: taken }, ["BACKEND_PORT"]), new RegExp(`Port ${taken} for the backend is already in use \\(BACKEND_PORT\\)`));
  } finally {
    blocker.close();
  }
});
