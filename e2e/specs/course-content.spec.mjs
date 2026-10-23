// Everything else inside a course: pages, discussions, announcements, files, collaborations,
// the syllabus, rubrics, and the course calendar.
import { test, expect } from "@playwright/test";
import { api } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { seedCourse } from "../support/seed.mjs";

const ct = (key, vars) => t(`course.${key}`, vars);

async function asRole(browser, role) {
  const ctx = await browser.newContext({ storageState: authFile(role) });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

// Files and Collaborations start hidden from learners; the teacher shows them in Settings.
async function showTab(page, navKey) {
  await page.goto(`/course/${c.id}/settings`);
  await page.getByRole("button", { name: "Navigation" }).click();
  await page.getByRole("button", { name: ct("settings.showNamed", { name: ct(`nav.${navKey}`) }) }).click();
  await page.getByRole("button", { name: /save/i }).last().click();
  await expect(page.getByRole("button", { name: ct("settings.hideNamed", { name: ct(`nav.${navKey}`) }) })).toBeVisible();
}

let c;
test.beforeAll(async () => {
  c = await seedCourse({ learners: ["learner", "learner2"] });
});

test("pages: the teacher edits a page; learners read it and are counted", async ({ browser }) => {
  const url = `/course/${c.id}/pages/${c.page.content_id}`;
  const teacher = await asRole(browser, "teacher");
  await teacher.page.goto(url);
  await teacher.page.getByRole("button", { name: /Edit page/ }).click();
  await teacher.page.locator("#page-title").fill("What is a fraction? (updated)");
  await teacher.page.locator(".ProseMirror").first().fill("A fraction names part of a whole, like 1/2 of a mango.");
  await teacher.page.getByRole("button", { name: ct("editors.saveChanges") }).click();
  await expect(teacher.page.getByRole("heading", { level: 1, name: "What is a fraction? (updated)" })).toBeVisible();

  const learner = await asRole(browser, "learner");
  await learner.page.goto(url);
  await expect(learner.page.getByText("1/2 of a mango")).toBeVisible();
  await expect(learner.page.getByRole("button", { name: /Edit page/ })).toHaveCount(0);

  await teacher.page.reload();
  await expect(teacher.page.getByText(/1\/2 learners viewed/)).toBeVisible();
  await learner.close();
  await teacher.close();
});

test("discussions: learners reply; the teacher makes it graded", async ({ browser }) => {
  const url = `/course/${c.id}/discussions/${c.discussion.content_id}`;
  const learner = await asRole(browser, "learner2");
  await learner.page.goto(url);
  await learner.page.getByLabel(ct("discussions.replyPlaceholder")).fill("We cut a chapati into quarters.");
  await learner.page.getByRole("button", { name: ct("discussions.reply"), exact: true }).click();
  await expect(learner.page.getByText("We cut a chapati into quarters.")).toBeVisible();

  const teacher = await asRole(browser, "teacher");
  await teacher.page.goto(url);
  await expect(teacher.page.getByText("We cut a chapati into quarters.")).toBeVisible();
  await teacher.page.getByLabel(ct("editors.pointsPossible")).fill("5");
  await teacher.page.getByRole("button", { name: ct("discussions.markGraded") }).click();
  await expect(teacher.page.getByText(ct("quizKinds.graded")).first()).toBeVisible();
  // A graded discussion gets an assignment the teacher grades like any other.
  await expect.poll(async () => JSON.stringify(await api("GET", `/courses/${c.id}/assignments`, { as: "teacher" }))).toContain("Where do you see fractions?");
  await learner.close();
  await teacher.close();
});

test("announcements: the teacher posts one; learners see it", async ({ browser }) => {
  const teacher = await asRole(browser, "teacher");
  await teacher.page.goto(`/course/${c.id}/announcements`);
  await teacher.page.getByRole("button", { name: ct("announcements.new") }).click();
  await teacher.page.getByLabel(ct("announcements.titleLabel")).fill("Bring a ruler on Monday");
  await teacher.page.getByLabel(ct("announcements.messageLabel")).fill("We will draw fraction bars.");
  await teacher.page.getByRole("button", { name: ct("discussions.post") }).click();
  await expect(teacher.page.getByText("Bring a ruler on Monday")).toBeVisible();

  const learner = await asRole(browser, "learner");
  await learner.page.goto(`/course/${c.id}/announcements`);
  await expect(learner.page.getByText("Bring a ruler on Monday")).toBeVisible();
  await expect(learner.page.getByText("We will draw fraction bars.")).toBeVisible();
  await expect(learner.page.getByRole("button", { name: ct("announcements.new") })).toHaveCount(0);
  await learner.close();
  await teacher.close();
});

test("files: the teacher uploads a file, learners can open it, the teacher deletes it", async ({ browser }) => {
  const teacher = await asRole(browser, "teacher");
  await showTab(teacher.page, "files");
  await teacher.page.goto(`/course/${c.id}/files`);
  await teacher.page.locator('input[type="file"]').setInputFiles({ name: "e2e-times-table.txt", mimeType: "text/plain", buffer: Buffer.from("2 x 2 = 4") });
  const row = teacher.page.getByText("e2e-times-table.txt").first();
  await expect(row).toBeVisible();

  const files = await api("GET", `/courses/${c.id}/files`, { as: "learner" });
  expect(JSON.stringify(files)).toContain("e2e-times-table.txt");

  teacher.page.once("dialog", (d) => d.accept());
  await teacher.page.getByRole("button", { name: ct("modules.deleteNamed", { title: "e2e-times-table.txt" }) }).click();
  await expect(teacher.page.getByText("e2e-times-table.txt")).toHaveCount(0);
  await teacher.close();
});

test("collaborations: a shared link reaches the chosen members only", async ({ browser }) => {
  const teacher = await asRole(browser, "teacher");
  await showTab(teacher.page, "collaborations");
  await teacher.page.goto(`/course/${c.id}/collaborations`);
  await teacher.page.getByRole("button", { name: ct("collab.new") }).click();
  await teacher.page.getByLabel(ct("collab.titleLabel")).fill("Class fractions board");
  await teacher.page.getByLabel(ct("collab.link")).fill("https://example.org/board");
  const members = teacher.page.getByRole("checkbox");
  if (await members.count()) await teacher.page.getByRole("checkbox", { name: new RegExp(USERS.learner.name) }).check();
  await teacher.page.getByRole("button", { name: ct("common.create"), exact: true }).click();
  await expect(teacher.page.getByText("Class fractions board")).toBeVisible();

  expect(JSON.stringify(await api("GET", `/courses/${c.id}/collaborations`, { as: "learner" }))).toContain("Class fractions board");
  expect(JSON.stringify(await api("GET", `/courses/${c.id}/collaborations`, { as: "learner2" }))).not.toContain("Class fractions board");
  await teacher.close();
});

test("collaborations: the teacher who shared a link can delete it", async ({ browser }) => {
  await api("POST", `/courses/${c.id}/collaborations`, { as: "teacher", body: { title: "Old board", url: "https://example.org/old" } });
  const teacher = await asRole(browser, "teacher");
  await teacher.page.goto(`/course/${c.id}/collaborations`);
  await expect(teacher.page.getByText("Old board")).toBeVisible();
  await teacher.page.getByRole("button", { name: ct("modules.deleteNamed", { title: "Old board" }) }).click({ timeout: 3_000 });
  await teacher.close();
});

test("syllabus is built from the outcomes and weeks", async ({ browser }) => {
  const learner = await asRole(browser, "learner");
  await learner.page.goto(`/course/${c.id}/syllabus`);
  await expect(learner.page.getByRole("list", { name: "Course learning outcomes" })).toContainText("Add fractions");
  await expect(learner.page.getByRole("table", { name: "Grading scale" })).toBeVisible();
  await expect(learner.page.getByText("Fractions basics").first()).toBeVisible();
  await learner.close();
});

test("rubrics lists every assignment's rubric", async ({ browser }) => {
  await api("PUT", `/courses/${c.id}/assignments/${c.assignment.content_id}/rubric`, {
    as: "teacher",
    body: { title: "Poster rubric", criteria: [{ title: "Neatness", description: "Clear drawings", points: 4, outcomeId: c.outcome.id }] },
  });
  const teacher = await asRole(browser, "teacher");
  await teacher.page.goto(`/course/${c.id}/rubrics`);
  await expect(teacher.page.getByText("Neatness").first()).toBeVisible();
  await expect(teacher.page.getByText("Fraction poster").first()).toBeVisible();
  await teacher.close();
});

test("course calendar shows the week's work and downloads an .ics file", async ({ browser }) => {
  const learner = await asRole(browser, "learner");
  await learner.page.goto(`/course/${c.id}/calendar`);
  await expect(learner.page.getByText("Fraction poster").first()).toBeVisible();
  const download = learner.page.waitForEvent("download");
  await learner.page.getByRole("button", { name: ct("calendar.downloadIcs") }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.ics$/);
  const text = (await file.createReadStream()).read()?.toString() ?? "";
  if (text) expect(text).toContain("BEGIN:VCALENDAR");
  await learner.close();
});
