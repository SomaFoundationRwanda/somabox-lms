// Browser steps shared by many specs.
import { expect } from "@playwright/test";
import { t } from "./i18n.mjs";

export async function login(page, email, password) {
  await page.goto("/");
  await page.getByLabel(t("school.login.label")).fill(email);
  await page.getByLabel(t("shell.login.password"), { exact: true }).fill(password);
  await page.getByRole("button", { name: t("auth.authLogin"), exact: true }).click();
}

// Where each role lands after signing in.
export const HOME = { admin: "/manage/admin", teacher: "/teacher/dashboard", scholar: "/manage/scholar-dashboard" };

export async function expectToast(page, text) {
  await expect(page.getByText(text, { exact: false }).first()).toBeVisible();
}

// The first-visit tour covers the page; mark it seen for tests that sign in fresh.
export async function skipTour(page) {
  await page.addInitScript(() => localStorage.setItem("somabox_tour_seen_v1", "1"));
}

// Publishes a draft course from the status bar: the dialog either publishes the weeks that have
// content too (withWeeks, the default) or the course only.
export async function publishCourse(page, { withWeeks = true } = {}) {
  await page.getByRole("button", { name: t("course.status.publish"), exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: t("course.status.publishTitle") });
  await expect(dialog).toBeVisible();
  const withWeeksButton = dialog.getByRole("button", { name: new RegExp(`^${t("course.status.publishWithWeekOne").split(" and ")[0]} and`) });
  if (withWeeks && await withWeeksButton.count()) await withWeeksButton.click();
  else if (await dialog.getByRole("button", { name: t("course.status.publishOnly") }).count()) await dialog.getByRole("button", { name: t("course.status.publishOnly") }).click();
  else await dialog.getByRole("button", { name: t("course.status.publish"), exact: true }).click();
  await expect(dialog).toBeHidden();
}
