// First-visit experiences: the required profile form for new learners and teachers, and the
// learner's welcome tour.
import { test, expect } from "@playwright/test";
import { api, uid } from "../support/api.mjs";
import { PASSWORD, USERS } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { HOME, login, skipTour } from "../support/ui.mjs";

const p = (key) => t(`learner.profileSetup.${key}`);

async function newUser(role) {
  const email = `fresh-${role}-${uid()}@e2e.test`;
  await api("POST", "/users", { as: "admin", body: { email, password: PASSWORD, role, fullName: `Fresh ${role}` } });
  return email;
}

test.describe("profile form", () => {
  test("a new learner must finish their profile before using the dashboard", async ({ page }) => {
    await skipTour(page);
    const email = await newUser("scholar");
    await login(page, email, PASSWORD);
    await page.waitForURL(`**${HOME.scholar}`);
    const dialog = page.getByRole("dialog").filter({ hasText: p("title") });
    await expect(dialog).toBeVisible();

    // Step 1: Continue stays off until gender and accessibility are answered.
    await expect(dialog.getByRole("button", { name: p("continue") })).toBeDisabled();
    await dialog.getByLabel(p("fullName")).fill("Fresh Learner");
    await dialog.getByRole("button", { name: p("female"), exact: true }).click();
    await dialog.getByLabel(p("accessibility")).selectOption("none");
    await dialog.getByRole("button", { name: p("continue") }).click();

    // Step 2: a learner must choose their class.
    await expect(dialog.getByText(p("academicTitle"))).toBeVisible();
    await expect(dialog.getByRole("button", { name: p("finish") })).toBeDisabled();
    await dialog.getByLabel(p("grade")).selectOption("Primary 4");
    await dialog.getByRole("button", { name: p("finish") }).click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    const profile = await api("GET", "/users/profile/view", { token: await loginToken(email) });
    expect(profile.isProfileComplete).toBe(true);
    await page.reload();
    await expect(page.getByRole("dialog").filter({ hasText: p("title") })).toBeHidden();
  });

  test("a new teacher fills in the same form, without a class", async ({ page }) => {
    const email = await newUser("teacher");
    await login(page, email, PASSWORD);
    await page.waitForURL(`**${HOME.teacher}`);
    const dialog = page.getByRole("dialog").filter({ hasText: p("title") });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: p("male"), exact: true }).click();
    await dialog.getByLabel(p("accessibility")).selectOption("none");
    await dialog.getByRole("button", { name: p("continue") }).click();
    await dialog.getByRole("button", { name: p("finish") }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
  });

  test("admins are never asked", async ({ page }) => {
    await login(page, USERS.admin.email, PASSWORD);
    await page.waitForURL(`**${HOME.admin}`);
    await page.waitForTimeout(1500);
    await expect(page.getByRole("dialog").filter({ hasText: p("title") })).toBeHidden();
  });
});

test.describe("welcome tour", () => {
  const STEPS = ["welcome", "stats", "lessons", "quick-access", "nav", "finish"];

  test("shows once on the learner dashboard, steps through and can be taken again", async ({ page }) => {
    await login(page, USERS.learner2.email, PASSWORD);
    await page.waitForURL(`**${HOME.scholar}`);
    await expect(page.getByText(t("learner.tour.welcome.title"))).toBeVisible();

    for (let i = 1; i < STEPS.length; i++) await page.getByRole("button", { name: t("learner.tour.next") }).click();
    await page.getByRole("button", { name: t("learner.tour.back") }).click();
    await page.getByRole("button", { name: t("learner.tour.next") }).click();
    await page.getByRole("button", { name: t("learner.tour.start") }).click();
    await expect(page.getByText(t("learner.tour.welcome.title"))).toBeHidden();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText(t("learner.tour.welcome.title"))).toBeHidden();

    await page.getByRole("button", { name: t("learner.tour.take") }).click();
    await expect(page.getByText(t("learner.tour.welcome.title"))).toBeVisible();
    await page.getByRole("button", { name: t("learner.tour.skip") }).click();
    await expect(page.getByText(t("learner.tour.welcome.title"))).toBeHidden();
  });
});

// Fresh users aren't in USERS, so they get their token straight from the login route.
async function loginToken(email) {
  const res = await fetch("http://localhost:3100/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  return (await res.json()).token;
}
