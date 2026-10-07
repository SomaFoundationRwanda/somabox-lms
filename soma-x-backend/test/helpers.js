// Shared test harness: a throwaway PostgreSQL database per test file, the real app
// (including the auth gate), and logged-in sessions for a fixed set of users.
import assert from "node:assert/strict";
import bcrypt from "bcrypt";
import pg from "pg";

const host = process.env.PGHOST || "localhost";
const port = process.env.PGPORT || "5432";
const user = process.env.PGUSER || process.env.USER || "postgres";
const password = process.env.PGPASSWORD || "";

export const PASSWORD = "test-password";
export const USERS = {
  admin: { email: "admin2@test.local", role: "admin" },
  teacher: { email: "teacher@test.local", role: "teacher" },
  otherTeacher: { email: "teacher2@test.local", role: "teacher" },
  student: { email: "student@test.local", role: "scholar" },
  outsider: { email: "outsider@test.local", role: "scholar" },
};

function adminClient() {
  return new pg.Client({ host, port: Number(port), user, password, database: "postgres" });
}

export async function startTestServer() {
  const dbName = `somabox_test_${process.pid}_${Date.now()}`;
  const admin = adminClient();
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  // Must be set before db-manager is imported; dotenv does not override existing vars.
  const auth = password ? `${encodeURIComponent(user)}:${encodeURIComponent(password)}` : encodeURIComponent(user);
  process.env.DATABASE_URL = `postgresql://${auth}@${host}:${port}/${dbName}`;
  process.env.PGMAXCONNECTIONS = "5";
  delete process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  // Keep the AI gateway unreachable so /ai routes never call a real model.
  process.env.AI_GATEWAY_URL = "http://127.0.0.1:9";

  const dbManager = await import("../src/helpers/db-manager.js");
  await dbManager.initSchemas();
  const { createApp, API_ROUTERS } = await import("../src/app.js");

  const db = dbManager.localDb;
  const hash = await bcrypt.hash(PASSWORD, 4);
  for (const u of Object.values(USERS)) {
    await db.prepare("INSERT INTO users (email, full_name, password_hash, role) VALUES (?, ?, ?, ?)").run(u.email, u.email, hash, u.role);
  }

  const app = createApp({ logRequests: false });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function api(method, path, { token, body, headers = {} } = {}) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, body: json };
  }

  async function login(email, pw = PASSWORD) {
    const res = await api("POST", "/auth/login", { body: { email, password: pw } });
    assert.equal(res.status, 200, `login ${email}: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.token, "login returns a token");
    return res.body.token;
  }

  const tokens = {};
  for (const [key, u] of Object.entries(USERS)) tokens[key] = await login(u.email);

  // Creates a course owned by the teacher with the student enrolled. Opened by default
  // (students can't see drafts); pass { lifecycle: "draft" } to keep it in setup.
  async function createCourse(title = "Algebra", { lifecycle = "open" } = {}) {
    const res = await api("POST", "/courses", { token: tokens.teacher, body: { title } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const courseId = res.body.id;
    await db.prepare("INSERT INTO enrollments (course_id, user_email, role, status) VALUES (?, ?, 'student', 'active')").run(courseId, USERS.student.email);
    if (lifecycle !== "draft") await db.prepare("UPDATE courses SET lifecycle = ? WHERE id = ?").run(lifecycle, courseId);
    return courseId;
  }

  async function stop() {
    await new Promise((resolve) => server.close(resolve));
    await dbManager.pool.end();
    const a = adminClient();
    await a.connect();
    await a.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
    await a.end();
  }

  return { api, login, tokens, db, dbManager, createCourse, stop, API_ROUTERS, baseUrl };
}
