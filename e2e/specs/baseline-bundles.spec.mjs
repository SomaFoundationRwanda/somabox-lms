// The Week 0 baseline (built from tagged questions, approved, taken by learners) and sharing
// courses as bundles through the course library.
import { test, expect } from "@playwright/test";
import { api, uid } from "../support/api.mjs";
import { authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { seedCourse } from "../support/seed.mjs";
import { publishCourse } from "../support/ui.mjs";

const bt = (key) => t(`teacher.baseline.${key}`);
const lt = (key) => t(`shell.courseLibrary.${key}`);

test.describe("baseline", () => {
  test.use({ storageState: authFile("teacher") });

  test("adds Week 0, builds the baseline from tagged questions, approves it; learners then see Week 0", async ({ page, browser }) => {
    const c = await seedCourse({ open: false, learners: [] });
    await page.goto(`/course/${c.id}/settings#course-setup`);
    await page.getByRole("button", { name: bt("addModule") }).click();
    await page.getByRole("button", { name: bt("build") }).click();
    await expect(page.getByText(bt("built")).first()).toBeVisible();
    await page.getByRole("button", { name: bt("approve") }).click();
    // When Week 0's days are already over, a dialog says so first; approving anyway is allowed.
    const anyway = page.getByRole("button", { name: bt("approveAnyway") });
    if (await anyway.isVisible({ timeout: 2_000 }).catch(() => false)) await anyway.click();
    await expect(page.getByText(bt("approvedToast")).first()).toBeVisible();
    await expect(page.getByText(bt("approved")).first()).toBeVisible();

    await publishCourse(page);
    await expect.poll(async () => (await api("GET", `/courses/${c.id}/setup-status`, { as: "teacher" })).isOpened).toBe(true);
    await api("POST", `/courses/${c.id}/people`, { as: "teacher", body: { email: "learner2@e2e.test", role: "student" } });

    const ctx = await browser.newContext({ storageState: authFile("learner2") });
    const learner = await ctx.newPage();
    await learner.goto(`/course/${c.id}/modules`);
    await expect(learner.getByRole("heading", { level: 2, name: new RegExp(t("course.weeks.baseline")) })).toBeVisible();
    await ctx.close();
  });

  test("skipping needs a reason, and can be undone before opening", async ({ page }) => {
    const c = await seedCourse({ open: false, learners: [] });
    await page.goto(`/course/${c.id}/settings#course-setup`);
    await page.getByRole("button", { name: bt("skip") }).first().click();
    // A reason that's too short can't be confirmed.
    await page.getByPlaceholder(bt("reasonPlaceholder")).fill("no");
    await expect(page.getByRole("button", { name: bt("confirmSkip") })).toBeDisabled();
    await page.getByPlaceholder(bt("reasonPlaceholder")).fill("Learners were assessed last term");
    await page.getByRole("button", { name: bt("confirmSkip") }).click();
    await expect(page.getByText(bt("skipped")).first()).toBeVisible();
    await page.getByRole("button", { name: bt("undo") }).click();
    await expect(page.getByText(bt("undoneToast")).first()).toBeVisible();
  });
});

test.describe("bundles and the course library", () => {
  test.use({ storageState: authFile("teacher") });

  test("a teacher exports a course; another teacher starts a new draft course from it", async ({ page, browser }) => {
    const c = await seedCourse({ title: `Shared Fractions ${uid()}`, learners: ["learner"] });
    await page.goto(`/course/${c.id}/settings`);
    await page.getByRole("button", { name: "Share" }).click();
    await page.getByRole("button", { name: t("course.share.export") }).click();
    await expect(page.getByText(/^Exported version \d+/).first()).toBeVisible();

    const ctx = await browser.newContext({ storageState: authFile("teacher2") });
    const other = await ctx.newPage();
    await other.goto("/library/courses");
    const entry = other.getByRole("listitem").filter({ hasText: c.title }).first();
    await expect(entry).toBeVisible();
    await entry.getByRole("button", { name: lt("createFrom") }).click();
    // It goes straight to the new draft course.
    await other.waitForURL(/\/course\/\d+\//);
    const newId = other.url().match(/course\/(\d+)/)[1];
    expect(newId).not.toBe(String(c.id));

    // The copy has the outcomes and weeks, but no learners, no work and no dates, and is a draft.
    const status = await api("GET", `/courses/${newId}/setup-status`, { as: "teacher2" });
    expect(status.isOpened).toBe(false);
    expect(JSON.stringify(await api("GET", `/courses/${newId}/outcomes`, { as: "teacher2" }))).toContain("Add fractions");
    const people = JSON.stringify(await api("GET", `/courses/${newId}/people`, { as: "teacher2" }));
    expect(people).not.toContain("learner@e2e.test");
    await ctx.close();
  });

  test("a bundle file can be uploaded and turned into a course", async ({ page }) => {
    const c = await seedCourse({ title: `Uploaded Fractions ${uid()}`, learners: [] });
    const bundle = await api("GET", `/courses/${c.id}/bundle`, { as: "teacher" });
    await page.goto("/library/courses");
    await page.locator('input[type="file"]').setInputFiles({ name: "e2e-fractions.somabox.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bundle)) });
    await page.getByRole("button", { name: lt("addAndCreate") }).or(page.getByRole("button", { name: lt("addToLibrary") })).first().click();
    await expect(page.getByText(lt("createdToast")).or(page.getByText(c.title)).first()).toBeVisible();
  });

  test("a file that isn't a bundle is refused", async ({ page }) => {
    await page.goto("/library/courses");
    await page.locator('input[type="file"]').setInputFiles({ name: "notes.somabox.json", mimeType: "application/json", buffer: Buffer.from('{"hello":"world"}') });
    await page.getByRole("button", { name: lt("addAndCreate") }).or(page.getByRole("button", { name: lt("addToLibrary") })).first().click().catch(() => {});
    await expect(page.getByText(lt("notBundle")).or(page.getByText(/bundle/i).filter({ hasText: /not|isn't|invalid/i })).first()).toBeVisible();
  });
});
