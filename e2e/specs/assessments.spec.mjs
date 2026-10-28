// The teaching loop: learners hand in assignments and take quizzes; teachers grade (with or
// without a rubric, with or without an AI suggestion); learners see their results.
import { test, expect } from "@playwright/test";
import { api } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { seedCourse } from "../support/seed.mjs";

const ct = (key, vars) => t(`course.${key}`, vars);
const pt = (key, vars) => t(`progress.${key}`, vars);

async function asRole(browser, role) {
  const ctx = await browser.newContext({ storageState: authFile(role) });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

test.describe("assignments", () => {
  test("a learner submits; the teacher grades with feedback; the learner sees the grade", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner"] });
    const url = `/course/${c.id}/assignments/${c.assignment.content_id}`;

    const learner = await asRole(browser, "learner");
    await learner.page.goto(url);
    await learner.page.getByLabel(ct("assignment.responseLabel")).fill("1/2, 1/3 and 3/4, each drawn as a pizza.");
    await learner.page.getByRole("button", { name: ct("assignment.submit") }).click();
    await expect(learner.page.getByText(ct("assignment.submitted")).first()).toBeVisible();

    const teacher = await asRole(browser, "teacher");
    await teacher.page.goto(url);
    await teacher.page.getByRole("button", { name: new RegExp(USERS.learner.name) }).first().click();
    await expect(teacher.page.getByText("each drawn as a pizza")).toBeVisible();
    await teacher.page.getByLabel(pt("grader.gradeOutOf", { n: 10 })).fill("12");
    await teacher.page.getByRole("button", { name: pt("grader.save") }).click();
    await expect(teacher.page.getByText(/must be between 0 and 10/).first()).toBeVisible();
    await teacher.page.getByLabel(pt("grader.gradeOutOf", { n: 10 })).fill("8");
    await teacher.page.getByLabel(pt("common.feedback")).fill("Good drawings. Label the denominators.");
    await teacher.page.getByRole("button", { name: pt("grader.save") }).click();
    await expect(teacher.page.getByText(pt("grader.savedFor", { name: USERS.learner.name })).first()).toBeVisible();

    await learner.page.reload();
    await expect(learner.page.getByText(ct("assignment.grade", { grade: 8, total: 10 })).first()).toBeVisible();
    await expect(learner.page.getByText("Label the denominators.")).toBeVisible();
    await learner.page.goto(`/course/${c.id}/grades`);
    await expect(learner.page.getByText(c.assignment.title ?? "Fraction poster").first()).toBeVisible();
    await expect(learner.page.getByText(/8\s*\/\s*10|80\s*%/).first()).toBeVisible();
    await learner.close();
    await teacher.close();
  });

  test("a learner can submit again before the work is graded", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner2"] });
    const learner = await asRole(browser, "learner2");
    await learner.page.goto(`/course/${c.id}/assignments/${c.assignment.content_id}`);
    await learner.page.getByLabel(ct("assignment.responseLabel")).fill("First try");
    await learner.page.getByRole("button", { name: ct("assignment.submit") }).click();
    await expect(learner.page.getByText(ct("assignment.submitted")).first()).toBeVisible();
    await learner.page.getByLabel(ct("assignment.responseLabel")).fill("Second, better try");
    await learner.page.getByRole("button", { name: ct("assignment.resubmit") }).click();
    await expect(learner.page.getByText("Second, better try")).toBeVisible();
    await learner.close();
  });

  test("the teacher builds a rubric, grades by criterion, and the outcome result updates", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner2"] });
    await api("POST", `/courses/${c.id}/assignments/${c.assignment.content_id}/submit`, { as: "learner2", body: { body: "My poster" } });
    const teacher = await asRole(browser, "teacher");
    const page = teacher.page;
    await page.goto(`/course/${c.id}/assignments/${c.assignment.content_id}`);
    await page.getByRole("button", { name: pt("rubric.create") }).click();
    await page.getByLabel(pt("rubric.titleLabel")).fill("Poster rubric");
    const criteria = page.getByRole("list", { name: pt("common.rubricCriteria") }).or(page.getByLabel(pt("common.rubricCriteria")));
    for (const [i, name] of [[1, "Drawings"], [2, "Labels"]].entries ? [[1, "Drawings"], [2, "Labels"]] : []) {
      if (i > 1) await page.getByRole("button", { name: pt("common.addCriterion") }).click();
      const box = criteria.locator("li, fieldset, [role=group]").nth(i - 1);
      await box.getByRole("textbox").first().fill(name);
      const outcome = box.getByRole("combobox").first();
      await outcome.selectOption(await outcome.locator("option", { hasText: "Add fractions" }).first().getAttribute("value"));
    }
    await page.getByRole("button", { name: pt("rubric.save") }).click();
    await expect(page.getByText(pt("rubric.saved")).first()).toBeVisible();

    await page.getByRole("button", { name: new RegExp(USERS.learner2.name) }).first().click();
    const quick = (title, v) => page.getByRole("button", { name: pt("grader.quickAria", { title, v, max: 4 }) });
    await quick("Drawings", 4).click();
    await quick("Labels", 3).click();
    await page.getByRole("button", { name: pt("grader.save") }).click();
    await expect(page.getByText(pt("grader.savedFor", { name: USERS.learner2.name })).first()).toBeVisible();

    const mastery = await api("GET", `/courses/${c.id}/outcome-mastery`, { as: "teacher" });
    expect(JSON.stringify(mastery)).toMatch(/"currentMastery":\s*\d/);
    await teacher.close();
  });

  test("an AI suggestion fills the rubric scores, and the teacher decides", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner"] });
    await api("PUT", `/courses/${c.id}/assignments/${c.assignment.content_id}/rubric`, {
      as: "teacher",
      body: { title: "Poster rubric", criteria: [{ title: "Method", description: "Shows the steps", points: 4, outcomeId: c.outcome.id }, { title: "Answer", description: "Correct", points: 4, outcomeId: c.outcome.id }] },
    });
    await api("POST", `/courses/${c.id}/assignments/${c.assignment.content_id}/submit`, { as: "learner", body: { body: "1/2 + 1/4 = 3/4 because 2/4 + 1/4." } });
    const teacher = await asRole(browser, "teacher");
    const page = teacher.page;
    await page.goto(`/course/${c.id}/assignments/${c.assignment.content_id}`);
    await page.getByRole("button", { name: new RegExp(USERS.learner.name) }).first().click();
    await page.getByRole("button", { name: pt("grader.suggest") }).click();
    // The suggestion fills the scores and feedback; the teacher can still change them.
    await expect(page.getByText(pt("grader.aiFilled"))).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel(pt("common.feedback"))).toHaveValue(/Good method\. Check your final answer\./);
    await page.getByRole("button", { name: pt("grader.save") }).click();
    await expect(page.getByText(pt("grader.savedFor", { name: USERS.learner.name })).first()).toBeVisible();
    await teacher.close();
  });

  test("a learner who handed nothing in can still be graded", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner2"] });
    const ctx = await browser.newContext({ storageState: authFile("teacher") });
    const tp = await ctx.newPage();
    await tp.goto(`/course/${c.id}/assignments/${c.assignment.content_id}`);
    const pick = tp.getByLabel(ct("assignment.gradeWithout"));
    await pick.selectOption({ label: new RegExp(USERS.learner2.name).source }).catch(async () => {
      await pick.selectOption(await pick.locator("option", { hasText: USERS.learner2.name }).first().getAttribute("value"));
    });
    await tp.getByLabel(pt("grader.gradeOutOf", { n: 10 })).fill("0");
    await tp.getByRole("button", { name: pt("grader.save") }).click();
    await expect(tp.getByText(pt("grader.savedFor", { name: USERS.learner2.name })).first()).toBeVisible();
    await ctx.close();
  });
});

test.describe("quizzes", () => {
  test("a learner takes a quiz and sees the score; the teacher sees the attempt", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner"] });
    const url = `/course/${c.id}/quizzes/${c.quiz.content_id}`;
    const learner = await asRole(browser, "learner");
    await learner.page.goto(url);
    await learner.page.getByRole("radiogroup", { name: "Question 1 options" }).getByRole("radio", { name: "3/4" }).check();
    await learner.page.getByRole("radiogroup", { name: "Question 2 options" }).getByRole("radio", { name: "1/4" }).check();
    await learner.page.getByRole("button", { name: ct("quiz.submit") }).click();
    await expect(learner.page.getByText(ct("quiz.submittedScore", { n: 1 })).first()).toBeVisible();

    const teacher = await asRole(browser, "teacher");
    await teacher.page.goto(url);
    const results = teacher.page.getByRole("table", { name: ct("quiz.latestAttempts") });
    await expect(results.getByRole("row").filter({ hasText: USERS.learner.name })).toContainText("1");
    await learner.close();
    await teacher.close();
  });

  test("when attempts run out, the teacher can allow one more", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner2"] });
    const quiz = await api("POST", `/courses/${c.id}/modules/${c.modules[0].id}/items`, {
      as: "teacher",
      body: { itemType: "quiz", title: "One-try check", kind: "graded", attemptsAllowed: 1, outcomeIds: [c.outcome.id], questions: [{ prompt: "2/4 equals?", options: ["1/2", "1/4"], correctOption: "1/2", outcomeId: c.outcome.id }] },
    });
    const url = `/course/${c.id}/quizzes/${quiz.content_id}`;
    const learner = await asRole(browser, "learner2");
    await learner.page.goto(url);
    await expect(learner.page.getByText(ct("quiz.attemptOf", { n: 1, total: 1 })).first()).toBeVisible();
    await learner.page.getByRole("radio", { name: "1/4" }).check();
    await learner.page.getByRole("button", { name: ct("quiz.submit") }).click();
    await learner.page.reload();
    await expect(learner.page.getByText(ct("quiz.noAttemptsLeft")).first()).toBeVisible();

    const teacher = await asRole(browser, "teacher");
    await teacher.page.goto(url);
    teacher.page.once("dialog", (d) => d.accept("Was ill on the day"));
    await teacher.page.getByRole("button", { name: ct("quiz.allowAnother") }).click();
    await expect.poll(async () => { await learner.page.reload(); return learner.page.getByText(ct("quiz.noAttemptsLeft")).count(); }).toBe(0);

    await learner.page.reload();
    await learner.page.getByRole("radio", { name: "1/2" }).check();
    await learner.page.getByRole("button", { name: ct("quiz.submit") }).click();
    await expect(learner.page.getByText(ct("quiz.submittedScore", { n: 1 })).first()).toBeVisible();
    await learner.close();
    await teacher.close();
  });
});
