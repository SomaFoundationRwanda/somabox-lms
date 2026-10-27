// AI help for teachers (answered by the suite's fake gateway, so results are predictable):
// a week drafted from the AI drafts page, a story, outcomes written or rewritten, a course
// outline and a rubric. Every draft waits for the teacher to add, edit or reject it.
import { test, expect } from "@playwright/test";
import { api } from "../support/api.mjs";
import { authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { seedCourse } from "../support/seed.mjs";

test.use({ storageState: authFile("teacher") });

const pt = (key, vars) => t(`progress.${key}`, vars);
const ct = (key, vars) => t(`course.${key}`, vars);
const drafts = async (courseId) => api("GET", `/courses/${courseId}/ai/drafts`, { as: "teacher" });
// A draft card on the AI drafts page, found by the title the fake gateway gives it.
const card = (page, title) => page.getByRole("article").filter({ hasText: title }).first();

// Adding some drafts (a rubric, an outline) asks the teacher to confirm; rejecting always does.
test.beforeEach(({ page }) => {
  page.on("dialog", (d) => d.accept());
});

test("drafts a week; the teacher adds one draft, edits and adds another, and rejects one", async ({ page }) => {
  const c = await seedCourse({ learners: [] });
  await page.goto(`/course/${c.id}/ai`);
  const week = page.getByLabel(pt("ai.page.chooseWeek"));
  // The weeks load after the page; wait for them before choosing.
  await expect(week.locator("option", { hasText: "Equivalent fractions" })).toHaveCount(1);
  await week.selectOption(await week.locator("option", { hasText: "Equivalent fractions" }).getAttribute("value"));
  const start = page.getByRole("button", { name: "Draft this week" });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByText(pt("ai.page.started")).first()).toBeVisible();
  // See the known bug below: a job that finishes before the page's first poll needs a reload.
  await page.reload();
  await expect(card(page, "Fractions around us")).toBeVisible({ timeout: 30_000 });

  await expect(card(page, "Fractions check")).toBeVisible({ timeout: 60_000 });
  await expect(card(page, "Fraction poster")).toBeVisible({ timeout: 60_000 });

  await card(page, "Fractions around us").getByRole("button", { name: pt("ai.card.addToCourse") }).click();
  await expect(page.getByText(pt("ai.card.added")).first()).toBeVisible();

  // While it's being edited the title is in a field, so the card is found by its label.
  const poster = page.getByRole("article", { name: /^Assignment draft/i });
  await poster.getByRole("button", { name: pt("common.edit") }).click();
  await poster.getByRole("textbox").first().fill("Fraction poster (edited)");
  await poster.getByRole("button", { name: pt("ai.editor.saveChanges") }).click();
  await card(page, "Fraction poster (edited)").getByRole("button", { name: pt("ai.card.addToCourse") }).click();

  await card(page, "Fractions check").getByRole("button", { name: pt("ai.card.reject") }).click();
  await expect(page.getByText(pt("ai.card.rejected")).first()).toBeVisible();

  await page.getByRole("button", { name: /^Recently decided/ }).click();
  const decided = (await drafts(c.id)).drafts ?? (await drafts(c.id));
  expect(JSON.stringify(decided)).toMatch(/rejected/);

  // Added drafts land unpublished in the chosen week.
  const modules = JSON.stringify(await api("GET", `/courses/${c.id}/modules`, { as: "teacher" }));
  expect(modules).toContain("Fractions around us");
  expect(modules).toContain("Fraction poster (edited)");
});

test("drafts from a job that finishes at once show up without a reload", async ({ page }) => {
  const c = await seedCourse({ learners: [] });
  await page.goto(`/course/${c.id}/ai`);
  const week = page.getByLabel(pt("ai.page.chooseWeek"));
  await expect(week.locator("option", { hasText: "Equivalent fractions" })).toHaveCount(1);
  await week.selectOption(await week.locator("option", { hasText: "Equivalent fractions" }).getAttribute("value"));
  await page.getByRole("button", { name: "Draft this week" }).click();
  await expect(card(page, "Fractions around us")).toBeVisible({ timeout: 10_000 });
});

test("writes a story for a week from the Weeks page", async ({ page }) => {
  const c = await seedCourse({ learners: [] });
  await page.goto(`/course/${c.id}/modules`);
  await page.getByRole("button", { name: ct("modules.ai.story") }).first().click();
  await page.getByPlaceholder(ct("modules.ai.storyPlaceholder")).fill("A girl who shares mangoes at the market");
  await page.getByRole("button", { name: ct("modules.ai.writeStoryDraft") }).click();
  await page.goto(`/course/${c.id}/ai`);
  await expect(card(page, "Amina's market")).toBeVisible({ timeout: 60_000 });
});

test("AI fill week from the Weeks page drafts the week's items", async ({ page }) => {
  const c = await seedCourse({ learners: [] });
  await page.goto(`/course/${c.id}/modules`);
  await page.getByRole("button", { name: ct("modules.ai.fillWeek") }).nth(1).click();
  await page.goto(`/course/${c.id}/ai`);
  await expect(card(page, "Fractions around us")).toBeVisible({ timeout: 60_000 });
});

test("writes a new outcome with AI and rewrites an existing one", async ({ page }) => {
  const c = await seedCourse({ learners: [] });
  await page.goto(`/course/${c.id}/outcomes`);
  await page.getByRole("button", { name: pt("outcomes.writeWithAi") }).click();
  await page.locator("#ai-goal").fill("kids should be able to add fractions");
  await page.getByRole("button", { name: pt("outcomes.draftWithAi") }).click();
  await page.goto(`/course/${c.id}/ai`);
  await expect(card(page, "Add fractions with unlike denominators")).toBeVisible({ timeout: 60_000 });
  await card(page, "Add fractions with unlike denominators").getByRole("button", { name: pt("ai.card.addToCourse") }).click();
  await expect.poll(async () => JSON.stringify(await api("GET", `/courses/${c.id}/outcomes`, { as: "teacher" }))).toContain("Add fractions with unlike denominators");
});

test("drafts a rubric for an assignment and adds it", async ({ page }) => {
  const c = await seedCourse({ learners: [] });
  await page.goto(`/course/${c.id}/assignments/${c.assignment.content_id}`);
  await page.getByRole("button", { name: pt("rubric.draftWithAi") }).click();
  await page.goto(`/course/${c.id}/ai`);
  const rubric = card(page, "Method");
  await expect(rubric).toBeVisible({ timeout: 60_000 });
  await rubric.getByRole("button", { name: pt("ai.card.addToCourse") }).click();
  await expect(page.getByText(pt("ai.card.added")).first()).toBeVisible();
  await expect.poll(async () => JSON.stringify(await api("GET", `/courses/${c.id}/assignments/${c.assignment.content_id}/rubric`, { as: "teacher" }))).toContain("Method");
});

test("the guided setup proposes outcomes from a topic", async ({ page }) => {
  const c = await seedCourse({ open: false, learners: [] });
  await page.goto(`/course/${c.id}/settings#guided-setup`);
  await page.getByRole("button", { name: t("teacher.wizard.toOutcomes") }).click();
  await page.getByLabel(t("teacher.wizard.aiTopic")).fill("Fractions for Primary 4");
  await page.getByRole("button", { name: t("teacher.wizard.aiPropose") }).click();
  await page.goto(`/course/${c.id}/ai`);
  await expect(page.getByText(/What is a fraction\?/).first()).toBeVisible({ timeout: 60_000 });
});
