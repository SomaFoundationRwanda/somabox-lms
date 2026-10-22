// Admin: cloud sync (status, Sync now, what leaves the box) and the AI assistant switches.
import { test, expect } from "@playwright/test";
import { api, tokenFor } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { seedCourse } from "../support/seed.mjs";

test.use({ storageState: authFile("admin") });
test.describe.configure({ mode: "serial" });

const c = (key) => t(`admin.cloud.${key}`);
const ai = (key) => t(`admin.ai.${key}`);

async function startJob(as, courseId) {
  const res = await fetch(`http://localhost:3100/courses/${courseId}/ai/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await tokenFor(as)}` },
    body: JSON.stringify({ kind: "outline", input: { topic: "Fractions for Primary 4" } }),
  });
  return { status: res.status, body: await res.json() };
}

test.describe("sync", () => {
  test.afterAll(async () => {
    await api("PUT", "/sync/settings", { as: "admin", body: { scope: { events: true, people: "pseudonymous" } } });
  });

  test("shows that sync isn't set up, and Sync now says so without losing anything", async ({ page }) => {
    await page.goto("/manage/admin/sync");
    await expect(page.getByText(c("notSetUpTitle"))).toBeVisible();
    await page.getByRole("button", { name: c("syncNow") }).click();
    await expect(page.getByText(/isn't set up on this box yet/).first()).toBeVisible();
  });

  test("the admin chooses what leaves the box", async ({ page }) => {
    await page.goto("/manage/admin/sync");
    const save = page.getByRole("button", { name: t("admin.analytics.save"), exact: true });
    await expect(save).toBeDisabled();
    await page.getByRole("checkbox", { name: /^Usage events/ }).uncheck();
    await page.getByRole("radio", { name: /^No personal details/ }).check();
    await save.click();
    await expect(page.getByText(c("scopeSaved")).first()).toBeVisible();
    const { scope } = await api("GET", "/sync/status", { as: "admin" });
    expect(scope).toMatchObject({ events: false, people: "none" });
    await page.reload();
    await expect(page.getByRole("checkbox", { name: /^Usage events/ })).not.toBeChecked();
  });

  test("attendance can be kept on the box", async ({ page }) => {
    test.fail(true, "Known gap: the backend syncs attendance (scope.attendance, on by default) but the Sync page has no toggle for it.");
    await page.goto("/manage/admin/sync");
    await expect(page.getByRole("checkbox", { name: /attendance/i })).toBeVisible({ timeout: 3_000 });
  });

  test("cloud content says the server is unreachable while the box is offline", async ({ page }) => {
    await page.goto("/manage/admin/sync");
    await expect(page.getByText(t("admin.sync.remoteUnavailable"))).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i })).toBeVisible();
  });
});

test.describe("AI assistant", () => {
  let course;
  test.beforeAll(async () => {
    course = await seedCourse({ open: false, learners: [] });
  });
  test.afterAll(async () => {
    await api("PUT", "/ai/admin/settings", { as: "admin", body: { enabled: true, learnerSummaries: true } });
  });

  test("switching AI off for the school stops teachers starting AI work", async ({ page }) => {
    await page.goto("/manage/admin/ai");
    const sw = page.getByRole("switch", { name: ai("isOn") });
    page.once("dialog", (d) => d.accept());
    await sw.click();
    await expect(page.getByRole("switch", { name: ai("isOff") })).not.toBeChecked();
    expect((await startJob("teacher", course.id)).status).toBe(403);

    await page.getByRole("switch", { name: ai("isOff") }).click();
    await expect(page.getByRole("switch", { name: ai("isOn") })).toBeChecked();
    expect((await startJob("teacher", course.id)).status).toBe(202);
  });

  test("learner summaries can be switched off", async ({ page }) => {
    await page.goto("/manage/admin/ai");
    // The label changes with the state, so find the switch by what labels it.
    const sw = page.locator('[role="switch"][aria-labelledby="ai-summaries-label"]');
    await sw.click();
    await expect(sw).not.toBeChecked();
    await expect.poll(async () => (await api("GET", "/ai/admin/settings", { as: "admin" })).learnerSummaries).toBe(false);
    await sw.click();
    await expect(sw).toBeChecked();
  });

  test("AI can be turned off for one person and back on", async ({ page }) => {
    const other = await seedCourse({ teacher: "teacher2", open: false, learners: [] });
    await page.goto("/manage/admin/ai");
    await page.getByLabel(ai("turnOffFor")).fill(USERS.teacher2.email);
    await page.getByRole("button", { name: ai("turnOff"), exact: true }).click();
    const listed = page.getByRole("listitem").filter({ hasText: USERS.teacher2.email });
    await expect(listed).toBeVisible();
    expect((await startJob("teacher2", other.id)).status).toBe(403);
    expect((await startJob("teacher", course.id)).status).toBe(202);

    await listed.getByRole("button", { name: ai("turnBackOn") }).click();
    await expect(page.getByText(ai("nobodyOff"))).toBeVisible();
    expect((await startJob("teacher2", other.id)).status).toBe(202);
  });

  test("usage lists who called the model", async ({ page }) => {
    await page.goto("/manage/admin/ai");
    const table = page.getByRole("table", { name: ai("callsCaption") });
    await expect.poll(async () => { await page.reload(); return table.getByRole("row").filter({ hasText: /teacher@e2e\.test|Tom Teacher/ }).count(); }, { timeout: 30_000 }).toBeGreaterThan(0);
  });
});
