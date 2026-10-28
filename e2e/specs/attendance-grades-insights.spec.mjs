// Attendance registers, the gradebook, and insights (class, outcomes, learners, items), plus
// what learners see of their own attendance and progress.
import { test, expect } from "@playwright/test";
import { api } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { seedCourse, takeQuiz } from "../support/seed.mjs";

const at = (key, vars) => t(`attendance.${key}`, vars);

async function asRole(browser, role) {
  const ctx = await browser.newContext({ storageState: authFile(role) });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

test.describe("attendance", () => {
  test("the teacher takes a register; the summary and the learner's own view follow", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner", "learner2"] });
    const teacher = await asRole(browser, "teacher");
    const page = teacher.page;
    await page.goto(`/course/${c.id}/attendance`);
    await page.getByRole("button", { name: "Morning" }).click();
    await page.getByRole("button", { name: at("openRegister") }).click();

    await page.getByRole("button", { name: at("markAllPresent") }).click();
    const leo = page.getByRole("group", { name: at("statusFor", { name: USERS.learner2.name }) }).or(page.getByRole("radiogroup", { name: at("statusFor", { name: USERS.learner2.name }) }));
    await leo.getByRole("button", { name: at("statusAbsent") }).or(leo.getByRole("radio", { name: at("statusAbsent") })).first().click();
    await page.getByRole("button", { name: at("save"), exact: true }).click();
    await expect(page.getByText(at("saved")).first()).toBeVisible();
    await page.getByRole("button", { name: at("closeRegister") }).click().catch(() => {});

    const learners = page.getByRole("table", { name: "Learners" });
    await expect(learners.getByRole("row").filter({ hasText: USERS.learner2.name })).toContainText("0%");
    await expect(learners.getByRole("row").filter({ hasText: USERS.learner.name })).toContainText("100%");

    const learner = await asRole(browser, "learner2");
    // Learners' attendance is on their Grades page; the old address leads there.
    await learner.page.goto(`/course/${c.id}/attendance`);
    await learner.page.waitForURL(/\/grades/);
    await expect(learner.page.getByRole("heading", { name: at("myTitle") })).toBeVisible();
    await learner.page.getByText(at("mySessions")).click();
    await expect(learner.page.getByText(at("statusAbsent")).first()).toBeVisible();
    await expect(learner.page.getByText(USERS.learner.name)).toHaveCount(0);
    await learner.close();
    await teacher.close();
  });

  test("a register can be renamed or deleted", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner"] });
    const today = new Date().toISOString().slice(0, 10);
    await api("POST", `/courses/${c.id}/attendance/sessions`, { as: "teacher", body: { date: today, title: "Afternoon" } });
    const teacher = await asRole(browser, "teacher");
    await teacher.page.goto(`/course/${c.id}/attendance`);
    teacher.page.once("dialog", (d) => d.accept());
    await teacher.page.getByRole("button", { name: new RegExp(`^${at("deleteSession", { title: "Afternoon", date: "" }).replace(/,\s*$/, "")}`) }).click();
    await expect(teacher.page.getByRole("button", { name: new RegExp("Delete Afternoon") })).toHaveCount(0);
    await teacher.close();
  });
});

test.describe("grades and insights", () => {
  let c;
  test.beforeAll(async () => {
    c = await seedCourse({ learners: ["learner", "learner2"] });
    await takeQuiz(c, "learner", [true, true]);
    await takeQuiz(c, "learner2", [true, false]);
    await api("POST", `/courses/${c.id}/assignments/${c.assignment.content_id}/submit`, { as: "learner", body: { body: "Poster" } });
    await api("PATCH", `/courses/${c.id}/assignments/${c.assignment.content_id}/grade/${USERS.learner.email}`, { as: "teacher", body: { grade: 9, feedback: "Great" } });
  });

  test("the gradebook shows every learner's marks and links to each item", async ({ browser }) => {
    const teacher = await asRole(browser, "teacher");
    await teacher.page.goto(`/course/${c.id}/grades`);
    const book = teacher.page.getByRole("table", { name: "Gradebook" });
    await expect(book.getByRole("row").filter({ hasText: USERS.learner.name })).toContainText("9");
    await expect(book.getByRole("row").filter({ hasText: USERS.learner2.name })).toContainText("1");
    await book.getByRole("link", { name: "Fractions check", exact: true }).click();
    await teacher.page.waitForURL(`**/quizzes/${c.quiz.content_id}`);
    await teacher.close();
  });

  test("a learner's grades page shows only their own marks", async ({ browser }) => {
    const learner = await asRole(browser, "learner2");
    await learner.page.goto(`/course/${c.id}/grades`);
    await expect(learner.page.getByText("Fractions check").first()).toBeVisible();
    await expect(learner.page.getByText(USERS.learner.name)).toHaveCount(0);
    await learner.close();
  });

  test("insights: class, outcomes, learners and items views", async ({ browser }) => {
    const teacher = await asRole(browser, "teacher");
    const page = teacher.page;
    await page.goto(`/course/${c.id}/insights`);
    const tabs = page.getByRole("tablist", { name: "Insights views" });
    await expect(page.getByRole("tabpanel", { name: "Class" })).toContainText(/2 of 2/);

    await tabs.getByRole("tab", { name: "Outcomes" }).click();
    await expect(page.getByRole("tabpanel", { name: "Outcomes" })).toContainText("Add fractions");

    await tabs.getByRole("tab", { name: "Learners" }).click();
    const learners = page.getByRole("tabpanel", { name: "Learners" });
    await expect(learners).toContainText(USERS.learner2.name);
    await learners.getByRole("link", { name: USERS.learner2.name }).first().click();
    await page.waitForURL(/insights\/learners\//);
    await expect(page.getByText(USERS.learner2.name).first()).toBeVisible();

    await page.goto(`/course/${c.id}/insights`);
    await tabs.getByRole("tab", { name: t("progress.insights.tabs.items") }).click();
    const items = page.getByRole("tabpanel", { name: t("progress.insights.tabs.items") });
    await items.getByRole("row").filter({ hasText: "Fractions check" }).getByRole("button", { name: t("progress.insights.items.analysis") }).click();
    // Per question: how many got it right (learner 2 missed question 2).
    await expect(items.getByText(/Which is bigger/).first()).toBeVisible();
    await teacher.close();
  });

  test("insights: the AI class summary", async ({ browser }) => {
    const teacher = await asRole(browser, "teacher");
    await teacher.page.goto(`/course/${c.id}/insights`);
    await teacher.page.getByRole("button", { name: "Summarise the class with AI" }).click();
    await expect(teacher.page.getByText("Most learners can add fractions.").first()).toBeVisible({ timeout: 30_000 });
    await teacher.close();
  });

  test("a learner's progress page shows their own growth, without classmates", async ({ browser }) => {
    const learner = await asRole(browser, "learner");
    await learner.page.goto(`/course/${c.id}/progress`);
    await expect(learner.page.getByText("Add fractions").first()).toBeVisible();
    await expect(learner.page.getByText(USERS.learner2.name)).toHaveCount(0);
    await learner.close();
  });

  test("learners can't open insights", async () => {
    const res = await fetch(`http://localhost:3100/courses/${c.id}/insights`, { headers: { Authorization: `Bearer ${(await import("../support/api.mjs").then((m) => m.tokenFor("learner")))}` } });
    expect(res.status).toBe(403);
  });
});

