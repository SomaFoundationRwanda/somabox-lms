// Admins and courses: reading any course without being in it, and giving a course another
// teacher when its teacher leaves (a course's only teacher can't be deleted until then).
import { test, expect } from "@playwright/test";
import { api, createUser, uid } from "../support/api.mjs";
import { API_URL, PASSWORD, USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { seedCourse } from "../support/seed.mjs";

test.use({ storageState: authFile("admin") });

const c = (key) => t(`admin.courses.${key}`);

test("an admin opens any course read-only", async ({ page }) => {
  const course = await seedCourse();
  await page.goto(`/course/${course.id}/home`);
  await expect(page.getByText(c("adminViewNote"))).toBeVisible();
  // They aren't added to the course by looking at it.
  const people = await api("GET", `/courses/${course.id}/people`, { as: "teacher" });
  expect(people.some((p) => p.email === USERS.admin.email)).toBe(false);
});

test("a course whose teacher left gets a new teacher, and only then can the account be deleted", async ({ page }) => {
  const email = `leaving-${uid()}@e2e.test`;
  await createUser({ email, role: "teacher", fullName: "Leaving Teacher" });
  const token = (await (await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) })).json()).token;
  const title = `Left behind ${uid()}`;
  const course = await api("POST", "/courses", { token, body: { title } });
  const { users } = await api("GET", `/users?search=${encodeURIComponent(email)}`, { as: "admin" });
  const leaver = users[0];

  // The only teacher can't be deleted; deactivating is allowed.
  const del = await fetch(`${API_URL}/users/${leaver.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${await adminToken()}` } });
  expect(del.status).toBe(409);
  const off = await api("PATCH", `/users/${leaver.id}/status`, { as: "admin", body: { isActive: false } });
  expect(off.coursesWithoutTeacher.map((x) => x.id)).toEqual([course.id]);

  await page.goto("/manage/admin");
  await page.getByRole("searchbox", { name: c("searchLabel") }).fill(title);
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row.getByText(c("noTeacher"))).toBeVisible();
  await row.getByRole("button", { name: c("changeTeacher") }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(c("newTeacher")).selectOption(USERS.teacher2.email);
  await dialog.getByRole("button", { name: c("saveTeacher") }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText(USERS.teacher2.email);

  await api("DELETE", `/users/${leaver.id}`, { as: "admin" });
});

async function adminToken() {
  const res = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: USERS.admin.email, password: PASSWORD }) });
  return (await res.json()).token;
}
