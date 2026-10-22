// A teacher builds a course from nothing through the UI: create it, go through the guided setup
// (dates, outcomes, baseline, weeks), fill a week with every kind of item, open the course,
// and a learner then sees it.
import { test, expect } from "@playwright/test";
import { api, uid } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { mondayThisWeek } from "../support/seed.mjs";

test.use({ storageState: authFile("teacher") });
test.describe.configure({ mode: "serial" });

const ct = (key, vars) => t(`course.${key}`, vars);
const wz = (key, vars) => t(`teacher.wizard.${key}`, vars);
const title = `Built Course ${uid()}`;
let courseId;

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");

test("creates a course and lands in the guided setup", async ({ page }) => {
  await page.goto("/teacher/courses");
  await page.getByRole("button", { name: t("teacher.common.newCourse") }).click();
  // Title and grade are required.
  await page.getByRole("button", { name: t("teacher.createCourse.create") }).click();
  await expect(page.getByText(t("teacher.createCourse.titleRequired")).first()).toBeVisible();
  await page.getByLabel(t("teacher.createCourse.courseTitle"), { exact: true }).fill(title);
  await page.getByLabel(t("teacher.createCourse.description")).fill("Fractions for Primary 4.");
  await page.getByLabel(t("teacher.createCourse.grade")).selectOption({ index: 1 });
  await page.getByRole("button", { name: t("teacher.createCourse.create") }).click();
  await page.waitForURL(/\/course\/\d+\/settings/);
  courseId = page.url().match(/course\/(\d+)/)[1];
  await expect(page.getByRole("heading", { name: wz("heading") })).toBeVisible();
  // A new course is a draft that can't open yet.
  await expect(page.getByRole("button", { name: "Open course" })).toBeDisabled();
});

test("guided setup: dates, an outcome, skipping the baseline, and two weeks", async ({ page }) => {
  await page.goto(`/course/${courseId}/settings#guided-setup`);
  await page.getByLabel(wz("startDate")).fill(mondayThisWeek());
  await page.getByLabel(wz("duration")).fill("4");
  await page.getByRole("button", { name: wz("toOutcomes") }).click();

  await page.getByLabel(wz("outcomePlaceholder")).fill("Add fractions with unlike denominators");
  await page.getByRole("button", { name: wz("addOutcome") }).click();
  await expect(page.getByText("Add fractions with unlike denominators").first()).toBeVisible();
  await page.getByRole("button", { name: wz("toBaseline") }).click();

  await page.getByRole("button", { name: t("teacher.baseline.skip") }).last().click();
  await page.getByPlaceholder(t("teacher.baseline.reasonPlaceholder")).fill("Short course, no baseline this term");
  await page.getByRole("button", { name: t("teacher.baseline.confirmSkip") }).click();
  await expect(page.getByText(t("teacher.baseline.skipped")).first()).toBeVisible();
  await page.getByRole("button", { name: wz("toModules") }).click();

  for (let i = 0; i < 2; i++) await page.getByRole("button", { name: wz("addWeekSlot"), exact: true }).click();
  await page.getByRole("button", { name: wz("toSyllabus") }).click();
  await expect(page.getByText(wz("weekN", { n: 2 })).first()).toBeVisible();

  const status = await api("GET", `/courses/${courseId}/setup-status`, { as: "teacher" });
  expect(status.blocking.map((b) => b.id)).toEqual(["content"]);
});

test("fills Week 1 with a page, an assignment, a quiz, a discussion, a sub-header and a file", async ({ page }) => {
  await page.goto(`/course/${courseId}/modules`);
  const addItem = async (type) => {
    await page.getByRole("button", { name: ct("modules.addItem") }).first().click();
    await page.getByRole("button", { name: ct(`items.${type}`), exact: true }).click();
    await page.getByRole("button", { name: ct(`modules.addType.${type}`) }).click();
  };

  await addItem("page");
  await page.getByLabel(ct("common.title"), { exact: true }).fill("What is a fraction?");
  await page.locator(".ProseMirror").first().fill("A fraction is part of a whole.");
  await page.getByRole("button", { name: ct("editors.createPage") }).click();
  await expect(page.getByRole("link", { name: /What is a fraction\?/ })).toBeVisible();

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

  await addItem("discussion");
  await expect(page.getByRole("link", { name: new RegExp(ct("modules.newDiscussion")) }).or(page.getByRole("link", { name: /discussion/i })).first()).toBeVisible();

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

test("opens the course; the learner it's given to can see it", async ({ page }) => {
  await page.goto(`/course/${courseId}/settings#course-setup`);
  await page.getByRole("button", { name: "Open course" }).click();
  // Opening can publish the weeks that have content.
  const publish = page.getByRole("button", { name: /publish/i }).filter({ hasText: /open/i });
  if (await publish.count()) await publish.first().click();
  await expect.poll(async () => (await api("GET", `/courses/${courseId}/setup-status`, { as: "teacher" })).isOpened).toBe(true);

  await api("POST", `/courses/${courseId}/people`, { as: "teacher", body: { email: USERS.learner.email, role: "student" } });
  const mine = await api("GET", "/courses/mine", { as: "learner" });
  expect(JSON.stringify(mine)).toContain(title);
});
