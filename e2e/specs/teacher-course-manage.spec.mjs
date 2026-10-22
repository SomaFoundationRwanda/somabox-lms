// A teacher looks after an existing course: outcomes, weeks and items, settings (dates,
// timeline shift, visibility, navigation), and people (adding, removing, join codes).
import { test, expect } from "@playwright/test";
import { api, uid } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { mondayThisWeek, seedCourse } from "../support/seed.mjs";

test.use({ storageState: authFile("teacher") });

const ct = (key, vars) => t(`course.${key}`, vars);
const pt = (key, vars) => t(`progress.${key}`, vars);

test.describe("outcomes", () => {
  test("adds, edits and deletes an outcome", async ({ page }) => {
    const course = await seedCourse({ open: false, learners: [] });
    await page.goto(`/course/${course.id}/outcomes`);
    await page.getByRole("button", { name: pt("outcomes.newOutcome") }).click();
    await page.locator("#outcome-title").fill("Compare fractions");
    await page.locator("#outcome-description").fill("Order fractions by size");
    await page.getByRole("button", { name: pt("outcomes.save") }).click();
    const list = page.getByRole("list", { name: pt("outcomes.masteryList") });
    await expect(list.getByRole("heading", { name: "Compare fractions" })).toBeVisible();

    const code = (await list.getByRole("listitem").filter({ hasText: "Compare fractions" }).textContent()).match(/OUT-\d+/)[0];
    await page.getByRole("button", { name: pt("outcomes.editAria", { name: code }) }).click();
    await page.getByLabel(pt("outcomes.statementLabel")).fill("Compare and order fractions");
    await page.getByRole("button", { name: pt("outcomes.save") }).click();
    await expect(list.getByRole("heading", { name: "Compare and order fractions" })).toBeVisible();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: pt("outcomes.deleteAria", { name: code }) }).click();
    await expect(list.getByRole("heading", { name: "Compare and order fractions" })).toHaveCount(0);
  });
});

test.describe("weeks and items", () => {
  test("renames, unpublishes, publishes and deletes a week", async ({ page }) => {
    const course = await seedCourse({ learners: [] });
    await page.goto(`/course/${course.id}/modules`);
    const week2 = page.getByRole("heading", { level: 2, name: /Week 2/ });
    await expect(week2).toBeVisible();

    await page.getByRole("button", { name: ct("modules.renameModule") }).nth(1).click();
    await page.getByLabel(ct("modules.moduleTitle")).fill("Comparing fractions");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { level: 2, name: /Comparing fractions/ })).toBeVisible();

    await page.getByRole("button", { name: ct("modules.unpublishModule") }).first().click();
    await expect(page.getByRole("button", { name: ct("modules.publishModule") })).toHaveCount(2);
    await page.getByRole("button", { name: ct("modules.publishModule") }).first().click();
    await expect(page.getByRole("button", { name: ct("modules.unpublishModule") })).toHaveCount(1);

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: ct("modules.deleteModule") }).nth(1).click();
    await expect(page.getByRole("heading", { level: 2, name: /Comparing fractions/ })).toHaveCount(0);
  });

  test("adds a week from the Weeks page", async ({ page }) => {
    const course = await seedCourse({ learners: [], weeks: 1 });
    await page.goto(`/course/${course.id}/modules`);
    await page.getByRole("button", { name: ct("modules.addModule"), exact: true }).click();
    await page.getByLabel(ct("modules.newModuleTitle")).fill("Decimals");
    await page.getByRole("button", { name: ct("common.create"), exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: /Decimals/ })).toBeVisible();
  });

  test("edits an item, hides it from learners, and deletes it", async ({ page }) => {
    const course = await seedCourse({ learners: ["learner2"] });
    await page.goto(`/course/${course.id}/modules`);
    await page.getByRole("button", { name: "Edit Fraction poster", exact: true }).click();
    await page.getByLabel(ct("editors.assignmentTitle"), { exact: true }).fill("Fraction poster (A3)");
    await page.getByRole("button", { name: ct("editors.saveChanges") }).click();
    await expect(page.getByRole("link", { name: /Fraction poster \(A3\)/ })).toBeVisible();

    await page.getByRole("button", { name: "Unpublish Fraction poster (A3)", exact: true }).click();
    await expect(page.getByRole("button", { name: "Publish Fraction poster (A3)", exact: true })).toBeVisible();
    const learnerView = await api("GET", `/courses/${course.id}/modules`, { as: "learner2" });
    expect(JSON.stringify(learnerView)).not.toContain("Fraction poster (A3)");

    // Removing an item can park it in Unassigned (kept, but blocks a draft course from opening)...
    await page.getByRole("button", { name: "Delete Where do you see fractions?", exact: true }).click();
    await page.getByRole("button", { name: ct("modules.deleteDialog.moveToUnassigned") }).click();
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(ct("weeks.unassigned")) })).toBeVisible();

    // ...or delete it for good.
    await page.getByRole("button", { name: "Delete Reading: what is a fraction?", exact: true }).click();
    await page.getByRole("button", { name: ct("modules.deleteDialog.deletePermanently") }).click();
    await expect(page.getByRole("link", { name: /Reading: what is a fraction\?/ })).toHaveCount(0);
  });
});

test.describe("settings", () => {
  test("moving the start date moves every week", async ({ page }) => {
    const course = await seedCourse({ learners: [] });
    await page.goto(`/course/${course.id}/settings`);
    await page.locator("#course-start-date").fill(mondayThisWeek(1));
    await page.getByRole("button", { name: /save changes/i }).first().click();
    await expect.poll(async () => (await api("GET", `/courses/${course.id}`, { as: "teacher" })).start_date?.slice(0, 10)).toBe(mondayThisWeek(1));
    await page.goto(`/course/${course.id}/modules`);
    await expect(page.getByText(/Current/)).toHaveCount(0);
  });

  test("shifts the timeline after lost days, with a preview first", async ({ page }) => {
    const course = await seedCourse({ learners: [] });
    const before = (await api("GET", `/courses/${course.id}/calendar`, { as: "teacher" }));
    await page.goto(`/course/${course.id}/settings`);
    await page.locator("#shift-days").fill("3");
    await page.getByRole("button", { name: /^Preview$/ }).click();
    const apply = page.getByRole("button", { name: /^Apply$/ });
    await expect(apply).toBeEnabled();
    page.once("dialog", (d) => d.accept());
    await apply.click();
    await expect.poll(async () => JSON.stringify(await api("GET", `/courses/${course.id}/calendar`, { as: "teacher" }))).not.toBe(JSON.stringify(before));
  });

  test("a public course appears in Discover courses", async ({ page }) => {
    const course = await seedCourse({ learners: [] });
    await page.goto(`/course/${course.id}/settings`);
    await page.locator("#course-visibility").selectOption("public");
    await page.getByRole("button", { name: /save changes/i }).first().click();
    await expect.poll(async () => JSON.stringify(await api("GET", "/courses/public", { as: "learner2" }))).toContain(course.title);
  });

  test("hiding a tab removes it from the learners' course menu", async ({ page, browser }) => {
    const course = await seedCourse({ learners: ["learner2"] });
    await page.goto(`/course/${course.id}/settings`);
    await page.getByRole("button", { name: "Navigation" }).click();
    await page.getByRole("button", { name: ct("settings.hideNamed", { name: ct("nav.announcements") }) }).click();
    await page.getByRole("button", { name: /save/i }).last().click();
    await expect.poll(async () => JSON.stringify(await api("GET", `/courses/${course.id}/nav`, { as: "learner2" }))).not.toMatch(/"announcements"[^}]*"hidden":false|"navKey":"announcements","label":"Announcements","hidden":false/);

    const ctx = await browser.newContext({ storageState: authFile("learner2") });
    const learner = await ctx.newPage();
    await learner.goto(`/course/${course.id}/home`);
    const nav = learner.getByRole("navigation", { name: "Course navigation" });
    await expect(nav.getByRole("link", { name: ct("nav.home") })).toBeVisible();
    await expect(nav.getByRole("link", { name: ct("nav.announcements") })).toHaveCount(0);
    await ctx.close();
  });
});

test.describe("people", () => {
  test("adds a learner by email, filters by role, and removes them", async ({ page }) => {
    const course = await seedCourse({ learners: [] });
    await page.goto(`/course/${course.id}/people`);
    await page.getByRole("button", { name: ct("people.add") }).click();
    await page.getByLabel(ct("people.email")).fill(USERS.learner2.email);
    await page.getByLabel(ct("people.role"), { exact: true }).selectOption("student");
    await page.getByRole("button", { name: ct("common.add"), exact: true }).click();
    const members = page.getByRole("table", { name: ct("people.members") });
    await expect(members.getByRole("row").filter({ hasText: USERS.learner2.email })).toBeVisible();

    await page.getByRole("group", { name: ct("people.filterByRole") }).getByRole("button", { name: "Teacher", exact: true }).click();
    await expect(members.getByRole("row").filter({ hasText: USERS.learner2.email })).toHaveCount(0);
    await page.getByRole("group", { name: ct("people.filterByRole") }).getByRole("button", { name: "All", exact: true }).click();

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: ct("people.removeNamed", { name: USERS.learner2.name }) }).click();
    await expect(members.getByRole("row").filter({ hasText: USERS.learner2.email })).toHaveCount(0);
  });

  test("a join code lets a learner join by themselves, until it's turned off", async ({ page, browser }) => {
    const course = await seedCourse({ learners: [] });
    await page.goto(`/course/${course.id}/people`);
    const panel = page.getByRole("region", { name: ct("people.join.title") });
    await panel.getByRole("button", { name: ct("people.join.turnOn") }).click();
    const code = (await panel.getByText(/^[A-Z0-9]{6}$/).first().textContent()).trim();

    const ctx = await browser.newContext({ storageState: authFile("learner2") });
    const learner = await ctx.newPage();
    await learner.goto("/discover-courses");
    await learner.getByRole("textbox", { name: "Join with a code" }).fill(code.toLowerCase());
    await learner.getByRole("button", { name: "Join", exact: true }).click();
    await learner.waitForURL(`**/course/${course.id}/**`);
    await ctx.close();

    page.once("dialog", (d) => d.accept());
    await panel.getByRole("button", { name: ct("people.join.turnOff") }).click();
    const email = `late-${uid()}@e2e.test`;
    await api("POST", "/users", { as: "admin", body: { email, password: "e2e-password", role: "scholar", fullName: "Late Learner" } });
    const res = await fetch("http://localhost:3100/courses/join-by-code", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${(await (await fetch("http://localhost:3100/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "e2e-password" }) })).json()).token}` },
      body: JSON.stringify({ code }),
    });
    expect(res.ok).toBe(false);
  });
});
