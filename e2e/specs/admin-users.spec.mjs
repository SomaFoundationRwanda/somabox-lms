// Admin user management: adding people, editing them, roles, passwords, deactivating,
// deleting, bulk actions, search and filters, and a user's details page.
import { test, expect } from "@playwright/test";
import { api, uid, createUser } from "../support/api.mjs";
import { PASSWORD, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { login } from "../support/ui.mjs";

test.use({ storageState: authFile("admin") });

const u = (key) => t(`admin.users.${key}`);
const a = (key) => t(`admin.addUser.${key}`);

async function makeUser(role = "scholar", name = `Pat ${uid()}`) {
  const email = `${name.toLowerCase().replace(/\W+/g, "-")}@e2e.test`;
  await createUser({ email, role, fullName: name });
  return { email, name };
}

async function openUsers(page, search) {
  await page.goto("/manage/admin");
  const box = page.getByRole("textbox", { name: u("searchLabel") }).or(page.getByPlaceholder(u("searchPlaceholder")));
  if (search) await box.first().fill(search);
  return page.getByRole("table", { name: "Users" });
}

const row = (table, text) => table.getByRole("row").filter({ hasText: text });

test("adds a learner, who gets a learner code and must choose their own password", async ({ page, browser }) => {
  const name = `Ama ${uid()}`;
  const email = `${name.toLowerCase().replace(/\W+/g, "-")}@e2e.test`;
  await page.goto("/manage/admin");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: t("role.scholar"), exact: true }).click();
  await page.getByLabel(a("fullName"), { exact: true }).fill(name);
  await page.getByLabel(a("email"), { exact: true }).fill(email);
  await page.getByLabel(a("password"), { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: a("addTitle") }).click();
  const code = page.getByText(/^[A-Z]+-\d{4}$/).first();
  await expect(code).toBeVisible();
  const learnerCode = await code.textContent();
  // Closing by clicking outside the drawer (Done can be off-screen: see the known bug below).
  await page.mouse.click(5, 5);
  await expect(page.getByLabel(a("email"), { exact: true })).toBeHidden();

  const table = await openUsers(page, email);
  await expect(row(table, email)).toContainText(name);

  const fresh = await browser.newContext();
  const p2 = await fresh.newPage();
  await login(p2, learnerCode, PASSWORD);
  await p2.waitForURL("**/account");
  await expect(p2.getByText(t("learner.account.defaultPassword")).first()).toBeVisible();
  await fresh.close();
});

test("after adding a learner, Done is reachable on a 1280x720 screen", async ({ page }) => {
  await page.goto("/manage/admin");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: t("role.scholar"), exact: true }).click();
  await page.getByLabel(a("fullName"), { exact: true }).fill(`Viewport ${uid()}`);
  await page.getByLabel(a("email"), { exact: true }).fill(`viewport-${uid()}@e2e.test`);
  await page.getByLabel(a("password"), { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: a("addTitle") }).click();
  await page.getByRole("button", { name: t("school.done") }).click({ timeout: 5_000 });
});

test("adds a teacher and an admin", async ({ page }) => {
  for (const role of ["teacher", "admin"]) {
    const name = `Staff ${uid()}`;
    const email = `${name.toLowerCase().replace(/\W+/g, "-")}@e2e.test`;
    await page.goto("/manage/admin");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("button", { name: t(`role.${role}`), exact: true }).click();
    await page.getByLabel(a("fullName"), { exact: true }).fill(name);
    await page.getByLabel(a("email"), { exact: true }).fill(email);
    await page.getByLabel(a("password"), { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: a("addTitle") }).click();
    await expect(page.getByLabel(a("email"), { exact: true })).toBeHidden();
    const { users } = await api("GET", `/users?search=${encodeURIComponent(email)}`, { as: "admin" });
    expect(users[0].role).toBe(role);
  }
});

test("refuses a duplicate email", async ({ page }) => {
  const { email } = await makeUser();
  await page.goto("/manage/admin");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: t("role.scholar"), exact: true }).click();
  await page.getByLabel(a("fullName"), { exact: true }).fill("Someone Else");
  await page.getByLabel(a("email"), { exact: true }).fill(email);
  await page.getByLabel(a("password"), { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: a("addTitle") }).click();
  await expect(page.getByText("User already exists").first()).toBeVisible();
});

test("edits a user's profile", async ({ page }) => {
  const { email } = await makeUser();
  const table = await openUsers(page, email);
  await row(table, email).getByRole("button", { name: u("userActions") }).click();
  await page.getByRole("menuitem", { name: u("editProfile") }).or(page.getByRole("button", { name: u("editProfile") })).first().click();
  const renamed = `Renamed ${uid()}`;
  await page.getByLabel(a("fullName"), { exact: true }).fill(renamed);
  await page.getByRole("button", { name: a("update") }).click();
  await expect(row(table, email)).toContainText(renamed);
});

test("resets a user's password", async ({ page }) => {
  const { email } = await makeUser();
  const table = await openUsers(page, email);
  await row(table, email).getByRole("button", { name: u("userActions") }).click();
  await page.getByRole("menuitem", { name: u("resetPassword") }).or(page.getByRole("button", { name: u("resetPassword") })).first().click();
  await page.getByLabel(u("newPassword")).fill("fresh-pass-1");
  await page.getByRole("button", { name: u("saveNewPassword") }).click();
  await expect(page.getByText(u("resetDone")).first()).toBeVisible();
  const res = await fetch("http://localhost:3100/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "fresh-pass-1" }) });
  expect(res.status).toBe(200);
});

test("deactivates and reactivates a user", async ({ page }) => {
  const { email } = await makeUser();
  const table = await openUsers(page, email);
  await row(table, email).getByRole("button", { name: u("userActions") }).click();
  await page.getByRole("menuitem", { name: u("deactivateUser") }).or(page.getByRole("button", { name: u("deactivateUser") })).first().click();
  await expect(row(table, email)).toContainText(t("admin.user.inactive"));

  await row(table, email).getByRole("button", { name: u("userActions") }).click();
  await page.getByRole("menuitem", { name: u("reactivateUser") }).or(page.getByRole("button", { name: u("reactivateUser") })).first().click();
  await expect(row(table, email)).toContainText(u("active"));
});

test("deletes a user after typing their name or email to confirm", async ({ page }) => {
  const { email } = await makeUser();
  const table = await openUsers(page, email);
  await row(table, email).getByRole("button", { name: u("userActions") }).click();
  await page.getByRole("menuitem", { name: u("deleteUser") }).or(page.getByRole("button", { name: u("deleteUser") })).first().click();
  const confirmBtn = page.getByRole("button", { name: u("deletePermanently") });
  await expect(confirmBtn).toBeDisabled();
  await page.getByLabel(u("typeToConfirm")).fill("someone else");
  await expect(confirmBtn).toBeDisabled();
  await page.getByLabel(u("typeToConfirm")).fill(email.toUpperCase());
  await confirmBtn.click();
  await expect(page.getByText(u("deleted")).first()).toBeVisible();
  await expect(row(table, email)).toHaveCount(0);
});

test("bulk: selects users, changes their role, exports and deletes them", async ({ page }) => {
  const tag = uid();
  const people = [await makeUser("scholar", `Bulk ${tag} One`), await makeUser("scholar", `Bulk ${tag} Two`)];
  const table = await openUsers(page, `bulk-${tag}`);
  await expect(table.getByRole("row")).toHaveCount(3);
  await table.getByRole("button", { name: u("selectAll") }).click();

  await page.getByRole("button", { name: u("changeRole") }).click();
  await page.getByLabel(u("newRoleLabel")).selectOption("teacher");
  await page.getByRole("button", { name: u("assignRole") }).click();
  for (const p of people) await expect(row(table, p.email)).toContainText(t("role.teacher"));

  await table.getByRole("button", { name: u("selectAll") }).click().catch(() => {});
  if (!(await page.getByRole("button", { name: u("exportCsv") }).isVisible())) await table.getByRole("button", { name: u("selectAll") }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: u("exportCsv") }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);

  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: u("bulkDelete") }).click();
  for (const p of people) await expect(row(table, p.email)).toHaveCount(0);
});

test("filters by role and status, and clears filters", async ({ page }) => {
  const table = await openUsers(page);
  await page.getByLabel(u("filterRole")).selectOption("teacher");
  await expect(table.getByRole("row").nth(1)).toContainText(t("role.teacher"));
  for (const r of await table.getByRole("row").all().then((rows) => rows.slice(1))) await expect(r).toContainText(t("role.teacher"));
  await page.getByLabel(u("filterStatus")).selectOption("inactive");
  await page.getByRole("button", { name: u("clearFilters") }).or(page.getByRole("button", { name: u("clearAll") })).first().click();
  await expect(page.getByLabel(u("filterRole"))).toHaveValue("all");
  await expect(page.getByLabel(u("filterStatus"))).toHaveValue("all");
  await expect(table.getByText(t("role.admin"), { exact: true }).first()).toBeVisible();
});

test("filters by date joined", async ({ page }) => {
  const { email } = await makeUser();
  const table = await openUsers(page, email);
  for (const range of ["7days", "30days"]) {
    await page.getByLabel(u("filterDate")).selectOption(range);
    // People added just now are in both windows.
    await expect(row(table, email)).toBeVisible();
  }
  // Anyone added before the window is left out.
  const { users } = await api("GET", `/users?dateRange=7days&limit=100`, { as: "admin" });
  expect(users.every((x) => Date.now() - new Date(x.created_at).getTime() <= 7 * 24 * 3600 * 1000 + 60_000)).toBe(true);
});

test("opens a user's details page", async ({ page }) => {
  const { email, name } = await makeUser();
  const table = await openUsers(page, email);
  await row(table, email).getByRole("button", { name: u("userActions") }).click();
  await page.getByRole("menuitem", { name: u("viewDetails") }).or(page.getByRole("link", { name: u("viewDetails") })).or(page.getByRole("button", { name: u("viewDetails") })).first().click();
  await page.waitForURL(/\/manage\/admin\/users\/\d+/);
  await expect(page.getByText(name).first()).toBeVisible();
  await expect(page.getByText(email).first()).toBeVisible();
});
