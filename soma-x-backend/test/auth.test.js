// Phase 1: sessions, the deny-by-default auth gate, and per-route access policy.
//
// Every API route must be listed in POLICY (or be a per-course route). Adding a route
// without deciding who may call it fails the "every route has a policy" test.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startTestServer, USERS, PASSWORD } from "./helpers.js";

// public: no session needed. any: any logged-in user (handlers scope data to the caller).
// admin: admins only. staff: teachers and admins. course: per-course enrollment checks.
const POLICY = {
  "POST /auth/login": "public",
  "POST /auth/register": "public",
  "GET /auth/me": "any",
  "GET /auth/verify-auth": "any",
  "POST /auth/logout": "any",
  "GET /analytics/branding": "public",
  "GET /ai/health": "any",
  "GET /library/file/:id": "public",

  "GET /users": "admin",
  "POST /users": "admin",
  "PATCH /users/:id": "admin",
  "PATCH /users/:id/status": "admin",
  "PATCH /users/:id/reset-password": "admin",
  "POST /users/bulk-action": "admin",
  "DELETE /users/:id": "admin",
  "GET /users/:id": "any",
  "GET /users/me/assignment-summary": "any",
  "GET /users/me/dashboard": "any",
  "GET /users/profile/view": "any",
  "PATCH /users/profile/update": "any",
  "PATCH /users/profile/password": "any",

  "GET /notifications": "any",
  "POST /notifications": "admin",
  "PATCH /notifications/:id/read": "any",
  "POST /notifications/read-all": "any",
  "POST /notifications/send": "admin",

  "GET /sol/spaced/pending": "any",
  "POST /sol/spaced/complete": "any",
  "GET /sol/interleaving/session": "any",
  "GET /sol/diagnostic/status": "any",
  "POST /sol/diagnostic/submit": "any",

  "POST /analytics/longitudinal": "any",
  "GET /analytics/growth-curves": "any",
  "GET /analytics/sol-outcomes": "any",
  "GET /analytics/inclusivity-gap": "admin",
  "POST /analytics/branding": "admin",
  "POST /analytics/me-sync": "admin",
  "POST /analytics/events": "any",
  "GET /analytics/explainer-usage": "admin",
  "GET /analytics/school": "admin",
  "GET /analytics/settings": "admin",
  "PUT /analytics/settings": "admin",
  "GET /analytics/my-data": "any",
  "GET /analytics/users/:userId/data": "admin",

  "GET /content/main-categories": "any",
  "GET /content/levels/summary": "any",
  "GET /content/custom-content/summary": "any",
  "GET /content/content/:slug": "any",
  "GET /content/manager/list": "staff",
  "POST /content/manager/create-folder": "staff",
  "POST /content/manager/upload": "staff",
  "PATCH /content/manager/toggle": "staff",

  "GET /library/available-books": "admin",
  "POST /library/download": "admin",
  "POST /library/upload": "admin",
  "GET /library/download-status": "admin",
  "GET /library/books": "any",
  "GET /library/categories": "any",
  "DELETE /library/book/:id": "admin",

  "GET /cloud/available-content": "admin",
  "GET /cloud/metadata": "admin",
  "POST /cloud/download": "admin",
  "GET /cloud/download-status": "admin",
  "POST /cloud/delete": "admin",

  "POST /ai/ask": "staff",
  "POST /ai/feedback": "staff",
  "GET /ai/status": "any",
  "GET /ai/admin/settings": "admin",
  "PUT /ai/admin/settings": "admin",
  "PATCH /ai/admin/users/:id": "admin",
  "GET /ai/admin/usage": "admin",

  // Course routes that aren't about one existing course the caller belongs to.
  "POST /courses": "staff",
  "GET /courses/mine": "any",
  "GET /courses/public": "any",
  "GET /courses/all": "admin",
  "POST /courses/:id/join": "any",
  "POST /courses/:id/enroll": "any",
  "POST /courses/:id/accept-invite": "any",

  "GET /calendar/me": "any",
  "GET /calendar/me.ics": "any",
  "GET /calendar/school": "admin",

  "GET /sync/status": "admin",
  "POST /sync/run": "admin",
  "PUT /sync/settings": "admin",

  "GET /bundles": "staff",
  "GET /bundles/:bundleRowId": "staff",
  "POST /bundles": "staff",
  "POST /bundles/:bundleRowId/courses": "staff",
  "POST /bundles/import": "staff",
};

let ctx;
let routes;
let courseId;

function listRoutes() {
  const out = [];
  const walk = (prefix, stack) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          out.push({ method: method.toUpperCase(), path: prefix + (layer.route.path === "/" || layer.route.path === "" ? "" : layer.route.path) });
        }
      } else if (layer.handle?.stack) {
        // Nested router mounted without a path (e.g. the /courses domain routers).
        walk(prefix, layer.handle.stack);
      }
    }
  };
  for (const [prefix, router] of ctx.API_ROUTERS) walk(prefix, router.stack);
  return out;
}

function policyFor(route) {
  const key = `${route.method} ${route.path}`;
  if (POLICY[key]) return POLICY[key];
  if (route.path.startsWith("/courses/:id")) return "course";
  return undefined;
}

function concretePath(routePath) {
  return routePath
    .replace(":id", courseId)
    .replace(/:scholarEmail/g, encodeURIComponent(USERS.student.email))
    .replace(/:[A-Za-z]+/g, "1");
}

before(async () => {
  ctx = await startTestServer();
  routes = listRoutes();
  courseId = await ctx.createCourse("Auth course");
});

after(async () => {
  await ctx.stop();
});

test("every API route has an access policy", () => {
  assert.ok(routes.length > 100, `expected the full route list, got ${routes.length}`);
  const missing = routes.filter((r) => !policyFor(r)).map((r) => `${r.method} ${r.path}`);
  assert.deepEqual(missing, [], "add these routes to POLICY in test/auth.test.js");
});

test("every non-public route rejects anonymous callers with 401", async () => {
  const failures = [];
  for (const route of routes) {
    if (policyFor(route) === "public") continue;
    const res = await ctx.api(route.method, concretePath(route.path), { body: route.method === "GET" ? undefined : {} });
    if (res.status !== 401) failures.push(`${route.method} ${route.path} -> ${res.status}`);
  }
  assert.deepEqual(failures, []);
});

test("an invalid or revoked token is treated as anonymous", async () => {
  const bogus = await ctx.api("GET", "/auth/me", { token: "not-a-real-token" });
  assert.equal(bogus.status, 401);

  const token = await ctx.login(USERS.outsider.email);
  assert.equal((await ctx.api("POST", "/auth/logout", { token })).status, 200);
  assert.equal((await ctx.api("GET", "/auth/me", { token })).status, 401);
});

test("admin-only routes reject teachers and scholars with 403", async () => {
  const failures = [];
  for (const route of routes.filter((r) => policyFor(r) === "admin")) {
    for (const who of ["teacher", "student"]) {
      const res = await ctx.api(route.method, concretePath(route.path), { token: ctx.tokens[who], body: route.method === "GET" ? undefined : {} });
      if (res.status !== 403) failures.push(`${who} ${route.method} ${route.path} -> ${res.status}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("staff-only routes reject scholars with 403", async () => {
  const failures = [];
  for (const route of routes.filter((r) => policyFor(r) === "staff")) {
    const res = await ctx.api(route.method, concretePath(route.path), { token: ctx.tokens.student, body: route.method === "GET" ? undefined : {} });
    if (res.status !== 403) failures.push(`${route.method} ${route.path} -> ${res.status}`);
  }
  assert.deepEqual(failures, []);
});

test("per-course routes reject users who are not in the course with 403", async () => {
  const failures = [];
  for (const route of routes.filter((r) => policyFor(r) === "course")) {
    for (const who of ["otherTeacher", "outsider"]) {
      const res = await ctx.api(route.method, concretePath(route.path), { token: ctx.tokens[who], body: route.method === "GET" ? undefined : {} });
      if (res.status !== 403) failures.push(`${who} ${route.method} ${route.path} -> ${res.status}`);
    }
  }
  assert.deepEqual(failures, []);
});

test("teacher-only course routes reject enrolled students with 403", async () => {
  const checks = [
    ["PATCH", `/courses/${courseId}`, { title: "Hacked" }],
    ["DELETE", `/courses/${courseId}`, undefined],
    ["POST", `/courses/${courseId}/modules`, { title: "Week 9" }],
    ["POST", `/courses/${courseId}/open-course`, {}],
    ["PATCH", `/courses/${courseId}/assignments/1/grade/${encodeURIComponent(USERS.student.email)}`, { grade: 100 }],
    ["POST", `/courses/${courseId}/people`, { email: USERS.outsider.email, role: "teacher" }],
  ];
  for (const [method, url, body] of checks) {
    // Claiming the teacher's email in the request must not help.
    const res = await ctx.api(method, `${url}${url.includes("?") ? "&" : "?"}teacherEmail=${encodeURIComponent(USERS.teacher.email)}`, {
      token: ctx.tokens.student,
      body: body === undefined ? undefined : { ...body, teacherEmail: USERS.teacher.email, userEmail: USERS.teacher.email },
    });
    assert.equal(res.status, 403, `${method} ${url}`);
  }
});

test("course items can't be edited through another course", async () => {
  const otherCourse = await ctx.createCourse("Other");
  const mod = await ctx.db.prepare("INSERT INTO modules (course_id, title, week_offset) VALUES (?, 'Week 1', 1) RETURNING id").get(otherCourse);
  const item = await ctx.db.prepare("INSERT INTO module_items (module_id, item_type, title, position) VALUES (?, 'sub_header', 'Keep me', 0) RETURNING id").get(mod.id);
  // otherTeacher owns a course of their own, then tries to touch the first teacher's item.
  const own = await ctx.api("POST", "/courses", { token: ctx.tokens.otherTeacher, body: { title: "Mine" } });
  const ownId = own.body.id;

  const patch = await ctx.api("PATCH", `/courses/${ownId}/modules/${mod.id}/items/${item.id}`, { token: ctx.tokens.otherTeacher, body: { title: "Hijacked" } });
  assert.equal(patch.status, 404);
  const del = await ctx.api("DELETE", `/courses/${ownId}/modules/${mod.id}/items/${item.id}`, { token: ctx.tokens.otherTeacher });
  assert.equal(del.status, 404);
  const reorder = await ctx.api("PATCH", `/courses/${ownId}/modules/${mod.id}/items/reorder`, { token: ctx.tokens.otherTeacher, body: { itemIds: [item.id] } });
  assert.equal(reorder.status, 404);

  const row = await ctx.db.prepare("SELECT title FROM module_items WHERE id = ?").get(item.id);
  assert.equal(row.title, "Keep me");
});

test("register creates a scholar with a session, never another role", async () => {
  const res = await ctx.api("POST", "/auth/register", { body: { email: "New.Learner@test.local", password: "secret123", fullName: "New Learner", role: "admin" } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.user.role, "scholar");
  const me = await ctx.api("GET", "/auth/me", { token: res.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, "new.learner@test.local");

  const dup = await ctx.api("POST", "/auth/register", { body: { email: "new.learner@test.local", password: "secret123" } });
  assert.equal(dup.status, 409);
});

test("profile and dashboard data come from the session, not client-sent emails", async () => {
  const view = await ctx.api("GET", `/users/profile/view?email=${encodeURIComponent(USERS.teacher.email)}&role=teacher`, { token: ctx.tokens.student });
  assert.equal(view.status, 200);
  assert.equal(view.body.email, USERS.student.email);

  const update = await ctx.api("PATCH", "/users/profile/update", { token: ctx.tokens.student, body: { email: USERS.teacher.email, fullName: "Changed by student" } });
  assert.equal(update.status, 200);
  const teacher = await ctx.db.prepare("SELECT full_name FROM users WHERE email = ?").get(USERS.teacher.email);
  assert.notEqual(teacher.full_name, "Changed by student");

  const other = await ctx.api("GET", "/users/1", { token: ctx.tokens.student });
  assert.equal(other.status, 403);
});

test("user records never include password hashes", async () => {
  const me = await ctx.db.prepare("SELECT id FROM users WHERE email = ?").get(USERS.student.email);
  const asAdmin = await ctx.api("GET", `/users/${me.id}`, { token: ctx.tokens.admin });
  assert.equal(asAdmin.status, 200);
  assert.equal(asAdmin.body.password_hash, undefined);
  const list = await ctx.api("GET", "/users?limit=50", { token: ctx.tokens.admin });
  assert.ok(list.body.users.every((u) => u.password_hash === undefined));
});

test("role changes and deactivation apply to existing sessions immediately", async () => {
  const email = "promote.me@test.local";
  const created = await ctx.api("POST", "/users", { token: ctx.tokens.admin, body: { email, password: PASSWORD, role: "scholar" } });
  assert.equal(created.status, 201);
  const user = await ctx.db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  const token = await ctx.login(email);

  // Promotion revokes sessions so the user logs in again with the new role.
  assert.equal((await ctx.api("PATCH", `/users/${user.id}`, { token: ctx.tokens.admin, body: { role: "admin" } })).status, 200);
  assert.equal((await ctx.api("GET", "/auth/me", { token })).status, 401);

  const token2 = await ctx.login(email);
  assert.equal((await ctx.api("GET", "/users", { token: token2 })).status, 200);
  // Demotion through the database (e.g. another admin) takes effect on the next request.
  await ctx.db.prepare("UPDATE users SET role = 'scholar' WHERE id = ?").run(user.id);
  assert.equal((await ctx.api("GET", "/users", { token: token2 })).status, 403);

  assert.equal((await ctx.api("PATCH", `/users/${user.id}/status`, { token: ctx.tokens.admin, body: { isActive: false } })).status, 200);
  assert.equal((await ctx.api("GET", "/auth/me", { token: token2 })).status, 401);
  assert.equal((await ctx.api("POST", "/auth/login", { body: { email, password: PASSWORD } })).status, 403);
});

test("admins cannot lock themselves out", async () => {
  const me = await ctx.db.prepare("SELECT id FROM users WHERE email = ?").get(USERS.admin.email);
  const token = ctx.tokens.admin;
  assert.equal((await ctx.api("PATCH", `/users/${me.id}/status`, { token, body: { isActive: false } })).status, 400);
  assert.equal((await ctx.api("DELETE", `/users/${me.id}`, { token })).status, 400);
  assert.equal((await ctx.api("PATCH", `/users/${me.id}`, { token, body: { role: "scholar" } })).status, 400);
  assert.equal((await ctx.api("POST", "/users/bulk-action", { token, body: { userIds: [me.id], action: "bulk_delete" } })).status, 400);
});

test("an admin password reset forces a change and ends the user's sessions", async () => {
  const email = "reset.me@test.local";
  await ctx.api("POST", "/users", { token: ctx.tokens.admin, body: { email, password: PASSWORD, role: "teacher" } });
  const user = await ctx.db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  const token = await ctx.login(email);

  const reset = await ctx.api("PATCH", `/users/${user.id}/reset-password`, { token: ctx.tokens.admin, body: { newPassword: "temporary1" } });
  assert.equal(reset.status, 200);
  assert.equal((await ctx.api("GET", "/auth/me", { token })).status, 401);

  const login = await ctx.api("POST", "/auth/login", { body: { email, password: "temporary1" } });
  assert.equal(login.body.user.must_change_password, true);
  const audit = await ctx.db.prepare("SELECT admin_email FROM admin_audit_logs WHERE action = 'RESET_USER_PASSWORD' AND target_user_id = ?").get(user.id);
  assert.equal(audit.admin_email, USERS.admin.email);
});

test("notifications are scoped to their owner and links stay inside the app", async () => {
  const sent = await ctx.api("POST", "/notifications/send", {
    token: ctx.tokens.admin,
    body: { targetRole: "specific", targetEmail: USERS.student.email, title: "Hi", message: "Hello", link: "https://evil.example" },
  });
  assert.equal(sent.status, 400);

  const ok = await ctx.api("POST", "/notifications/send", {
    token: ctx.tokens.admin,
    body: { targetRole: "specific", targetEmail: USERS.student.email, title: "Hi", message: "Hello", link: "/account" },
  });
  assert.equal(ok.status, 201);
  const note = await ctx.db.prepare("SELECT id FROM user_notifications WHERE user_email = ? AND title = 'Hi'").get(USERS.student.email);

  // Another user can't mark it read.
  await ctx.api("PATCH", `/notifications/${note.id}/read`, { token: ctx.tokens.outsider });
  const row = await ctx.db.prepare("SELECT is_read FROM user_notifications WHERE id = ?").get(note.id);
  assert.equal(Number(row.is_read), 0);

  const outsiderList = await ctx.api("GET", `/notifications?userEmail=${encodeURIComponent(USERS.student.email)}`, { token: ctx.tokens.outsider });
  assert.ok(outsiderList.body.notifications.every((n) => n.user_email === USERS.outsider.email));
});

test("scholars only see their own analytics; teachers only learners they teach", async () => {
  const outsider = encodeURIComponent(USERS.outsider.email);
  const res = await ctx.api("GET", `/analytics/growth-curves?scholarEmail=${outsider}`, { token: ctx.tokens.student });
  assert.equal(res.status, 403);
  const own = await ctx.api("GET", "/analytics/growth-curves", { token: ctx.tokens.student });
  assert.equal(own.status, 200);
  const teacherView = await ctx.api("GET", `/analytics/growth-curves?scholarEmail=${outsider}`, { token: ctx.tokens.teacher });
  assert.equal(teacherView.status, 403, "the outsider isn't in any of this teacher's courses");
  const adminView = await ctx.api("GET", `/analytics/growth-curves?scholarEmail=${outsider}`, { token: ctx.tokens.admin });
  assert.equal(adminView.status, 200);
});

test("file routes reject paths outside their folders", async () => {
  const token = ctx.tokens.admin;
  const del = await ctx.api("POST", "/cloud/delete", { token, body: { paths: ["../../somewhere"] } });
  assert.equal(del.status, 400);
  const root = await ctx.api("POST", "/cloud/delete", { token, body: { paths: ["."] } });
  assert.equal(root.status, 400);
  const dl = await ctx.api("POST", "/cloud/download", { token, body: { files: ["/etc/passwd"] } });
  assert.equal(dl.status, 400);

  const book = await ctx.api("GET", `/library/file/${encodeURIComponent("../../package")}`);
  assert.equal(book.status, 404);

  const list = await ctx.api("GET", `/content/manager/list?path=${encodeURIComponent("custom-content/../../")}`, { token: ctx.tokens.teacher });
  assert.equal(list.status, 400);
  const folder = await ctx.api("POST", "/content/manager/create-folder", { token: ctx.tokens.teacher, body: { name: "../escape" } });
  assert.equal(folder.status, 400);
});

test("scholar uploads are rejected before anything is written to disk", async () => {
  const { config } = await import("../src/config/index.js");
  const name = `scholar-upload-${Date.now()}.txt`;
  const form = new FormData();
  form.append("path", "custom-content");
  form.append("file", new Blob(["x"]), name);
  const upload = await fetch(`${ctx.baseUrl}/content/manager/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ctx.tokens.student}` },
    body: form,
  });
  assert.equal(upload.status, 403);
  assert.equal(fs.existsSync(path.join(config.paths.content, "custom-content", name)), false);
});
