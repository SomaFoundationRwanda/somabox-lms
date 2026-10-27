// A teacher builds a course from nothing through the UI: create it, go through the setup screen
// (dates and weeks, outcomes, a first page), fill a week with every kind of item, publish the
// course, and a learner then sees it.
import { test, expect } from "@playwright/test";
import { api, uid } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { mondayThisWeek } from "../support/seed.mjs";
import { publishCourse } from "../support/ui.mjs";

test.use({ storageState: authFile("teacher") });
test.describe.configure({ mode: "serial" });

const ct = (key, vars) => t(`course.${key}`, vars);
const title = `Built Course ${uid()}`;
let courseId;

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

test("creates a course and lands on its setup screen", async ({ page }) => {
  await page.goto("/teacher/courses");
  await page.getByRole("button", { name: t("teacher.common.newCourse") }).click();
  // Title and grade are required.
  await page.getByRole("button", { name: t("teacher.createCourse.create") }).click();
  await expect(page.getByText(t("teacher.createCourse.titleRequired")).first()).toBeVisible();
  await page.getByLabel(t("teacher.createCourse.courseTitle"), { exact: true }).fill(title);
  await page.getByLabel(t("teacher.createCourse.description")).fill("Fractions for Primary 4.");
  await page.getByLabel(t("teacher.createCourse.grade")).selectOption({ index: 1 });
  await page.getByRole("button", { name: t("teacher.createCourse.create") }).click();
  await page.waitForURL(/\/course\/\d+\/setup/);
  courseId = page.url().match(/course\/(\d+)/)[1];
  await expect(page.getByRole("heading", { name: ct("setup.title"), level: 1 })).toBeVisible();
  // A new course is a draft; publishing it now says what's still missing.
  await page.getByRole("button", { name: t("course.status.publish"), exact: true }).first().click();
  await expect(page.getByRole("dialog", { name: t("course.status.missingTitle") })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: t("teacher.common.close") }).click();
});

test("setup: dates and weeks, an outcome, then a page for Week 1", async ({ page }) => {
  await page.goto(`/course/${courseId}/setup`);
  await page.getByLabel(ct("setup.startDate")).fill(mondayThisWeek());
  await page.getByLabel(ct("setup.weekCount")).fill("4");
  await page.getByRole("button", { name: ct("setup.continue") }).click();
  await page.waitForURL(/step=2/);
  const weeks = await api("GET", `/courses/${courseId}/modules`, { as: "teacher" });
  expect(weeks.filter((m) => m.kind === "regular").length).toBe(4);

  await page.getByLabel(ct("setup.outcomeLabel")).fill("Add fractions with unlike denominators");
  await page.getByRole("button", { name: ct("setup.addOutcome") }).click();
  await expect(page.getByText("Add fractions with unlike denominators").first()).toBeVisible();
  await page.getByRole("button", { name: ct("setup.continue") }).click();

  // Step 3 opens the item editor and comes back to the setup steps.
  await expect(page.getByText(ct("setup.weekEmpty", { week: ct("weeks.week", { n: 1 }) }))).toBeVisible();
  await page.getByRole("link", { name: ct("modules.addType.page") }).click();
  await page.getByLabel(ct("common.title"), { exact: true }).fill("What is a fraction?");
  await page.locator(".ProseMirror").first().fill("A fraction is part of a whole.");
  await page.getByRole("button", { name: ct("editors.createPage") }).click();
  await page.waitForURL(/setup\?step=3/);
  await expect(page.getByText("What is a fraction?").first()).toBeVisible();
  await page.getByRole("button", { name: ct("setup.continue") }).click();
  await expect(page.getByRole("heading", { name: ct("setup.readyTitle") })).toBeVisible();
  // "Keep as draft" leaves it unpublished.
  await page.getByRole("link", { name: ct("setup.keepDraft") }).click();
  await page.waitForURL(/\/home/);
  const status = await api("GET", `/courses/${courseId}/setup-status`, { as: "teacher" });
  expect(status.blocking).toEqual([]);
  expect(status.isOpened).toBe(false);
});

test("fills the rest of Week 1: an assignment, a quiz, a discussion, a sub-header and a file", async ({ page }) => {
  await page.goto(`/course/${courseId}/modules`);
  const addItem = async (type) => {
    await page.getByRole("button", { name: ct("modules.addItem") }).first().click();
    await page.getByRole("button", { name: ct(`items.${type}`), exact: true }).click();
    await page.getByRole("button", { name: ct(`modules.addType.${type}`) }).click();
  };

  await addItem("assignment");
  await page.getByLabel(ct("editors.assignmentTitle"), { exact: true }).fill("Fraction poster");
  await page.getByLabel(ct("editors.instructions")).fill("Draw and label three fractions.");
  await page.getByLabel(ct("editors.pointsPossible")).fill("10");
  await page.getByRole("checkbox", { name: /Add fractions with unlike denominators/ }).check();
  await page.getByRole("button", { name: ct("editors.createAssignment") }).click();
  await expect(page.getByRole("link", { name: /Fraction poster/ })).toBeVisible();

  await addItem("quiz");
  await page.getByLabel(ct("editors.quiz.title"), { exact: true }).fill("Fractions check");
  await page.getByRole("button", { name: ct("editors.quiz.addQuestion") }).click();
  await page.getByLabel(ct("editors.quiz.promptN", { n: 1 })).fill("What is 1/2 + 1/4?");
  await page.getByLabel(ct("editors.quiz.questionOption", { q: 1, n: 1 })).fill("3/4");
  await page.getByLabel(ct("editors.quiz.questionOption", { q: 1, n: 2 })).fill("2/6");
  await page.getByRole("button", { name: ct("editors.quiz.markCorrect", { n: 1 }) }).first().click();
  // A graded quiz's questions are tagged with outcomes.
  const outcome = page.locator("#q-0-outcome");
  await outcome.selectOption(await outcome.locator("option", { hasText: "Add fractions" }).first().getAttribute("value"));
  await page.getByRole("button", { name: ct("editors.quiz.create") }).click();
  await expect(page.getByRole("link", { name: /Fractions check/ })).toBeVisible();

  // A discussion is written like everything else: a title and its question.
  await addItem("discussion");
  await page.getByLabel(ct("editors.discussionTitle")).fill("Where do you see fractions?");
  await page.getByLabel(ct("editors.discussionPrompt")).fill("Share one place you saw a fraction this week.");
  await page.getByRole("button", { name: ct("editors.createDiscussion") }).click();
  await expect(page.getByRole("link", { name: /Where do you see fractions\?/ })).toBeVisible();

  await page.getByRole("button", { name: ct("modules.addItem") }).first().click();
  await page.getByRole("button", { name: ct("items.sub_header"), exact: true }).click();
  await page.getByLabel(ct("modules.subHeaderTitle")).fill("Practice");
  await page.getByRole("button", { name: ct("modules.addType.sub_header") }).click();
  await expect(page.getByText("Practice", { exact: true }).first()).toBeVisible();

  await addItem("file");
  await page.locator('input[type="file"]').setInputFiles({ name: "worksheet.pdf", mimeType: "application/pdf", buffer: PDF });
  await page.getByLabel(ct("editors.file.displayTitle")).fill("Fractions worksheet");
  await page.getByRole("button", { name: ct("editors.file.uploadAdd") }).click();
  await expect(page.getByRole("link", { name: /Fractions worksheet/ })).toBeVisible();
});

test("publishes the course; the learner it's given to can see it", async ({ page }) => {
  await page.goto(`/course/${courseId}/home`);
  // Publishing asks whether to publish the weeks that have content too.
  await publishCourse(page);
  await expect.poll(async () => (await api("GET", `/courses/${courseId}/setup-status`, { as: "teacher" })).isOpened).toBe(true);

  await api("POST", `/courses/${courseId}/people`, { as: "teacher", body: { email: USERS.learner.email, role: "student" } });
  const mine = await api("GET", "/courses/mine", { as: "learner" });
  expect(JSON.stringify(mine)).toContain(title);
});
