// Notifications: an admin broadcasts to a group or one person; people read them in the bell.
import { test, expect } from "@playwright/test";
import { api, uid } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";

const b = (key) => t(`shell.broadcast.${key}`);
const n = (key) => t(`shell.notifications.${key}`);

async function broadcast(page, { to, email, title, message, link }) {
  await page.goto("/manage/admin");
  await page.getByRole("button", { name: "Broadcast Notification" }).click();
  await page.getByLabel(b("recipients")).selectOption(to);
  if (email) await page.getByLabel(b("recipientEmail")).fill(email);
  await page.getByLabel(b("titleLabel")).fill(title);
  await page.getByLabel(b("message")).fill(message);
  if (link) await page.getByLabel(b("link")).fill(link);
  await page.getByRole("button", { name: b("send") }).click();
  // The form closes once it's sent (the confirmation toast is too brief to rely on).
  await expect(page.getByLabel(b("titleLabel"))).toBeHidden();
}

const myTitles = async (role) => (await api("GET", "/notifications", { as: role })).notifications?.map((x) => x.title) ?? [];

test.describe("broadcasts", () => {
  test.use({ storageState: authFile("admin") });

  test("to all learners reaches learners only", async ({ page }) => {
    const title = `Exam week ${uid()}`;
    await broadcast(page, { to: "scholar", title, message: "Exams start on Monday." });
    await expect.poll(() => myTitles("learner")).toContain(title);
    expect(await myTitles("learner2")).toContain(title);
    expect(await myTitles("teacher")).not.toContain(title);
  });

  test("to one person by email reaches only them", async ({ page }) => {
    const title = `Just for Tina ${uid()}`;
    await broadcast(page, { to: "specific", email: USERS.teacher2.email, title, message: "Please see me." });
    await expect.poll(() => myTitles("teacher2")).toContain(title);
    expect(await myTitles("teacher")).not.toContain(title);
  });

  test("a link outside the app is refused", async ({ page }) => {
    await page.goto("/manage/admin");
    await page.getByRole("button", { name: "Broadcast Notification" }).click();
    await page.getByLabel(b("recipients")).selectOption("scholar");
    await page.getByLabel(b("titleLabel")).fill("Bad link");
    await page.getByLabel(b("message")).fill("Click it");
    await page.getByLabel(b("link")).fill("https://example.com");
    await page.getByRole("button", { name: b("send") }).click();
    await expect(page.getByText(/link must be a path inside the app/).first()).toBeVisible();
  });
});

test.describe("the bell", () => {
  test.use({ storageState: authFile("learner2") });

  test("shows new notifications; one is marked read, then all", async ({ page }) => {
    const first = `Library open late ${uid()}`;
    const second = `Sports day ${uid()}`;
    for (const title of [first, second]) {
      await api("POST", "/notifications/send", { as: "admin", body: { targetRole: "specific", targetEmail: USERS.learner2.email, title, message: "Details inside." } });
    }
    await page.goto("/manage/scholar-dashboard");
    await page.getByRole("button", { name: n("title") }).first().click();
    await expect(page.getByText(first)).toBeVisible();
    await expect(page.getByText(second)).toBeVisible();

    // Opening an unread one marks it read: it leaves the Unread list.
    await page.getByRole("button", { name: /^Unread/ }).click();
    await page.getByText(first).click();
    await expect(page.getByText(first)).toBeHidden();
    await expect(page.getByText(second)).toBeVisible();

    await page.getByRole("button", { name: n("readAll") }).click();
    await expect(page.getByText(n("noUnread"))).toBeVisible();
    const unread = (await api("GET", "/notifications", { as: "learner2" })).notifications.filter((x) => !Number(x.is_read));
    expect(unread.filter((x) => [first, second].includes(x.title))).toHaveLength(0);
  });

  test("a dismissed notification stays gone after a reload", async ({ page }) => {
    const title = `Dismiss me ${uid()}`;
    await api("POST", "/notifications/send", { as: "admin", body: { targetRole: "specific", targetEmail: USERS.learner2.email, title, message: "Bye." } });
    await page.goto("/manage/scholar-dashboard");
    await page.getByRole("button", { name: n("title") }).first().click();
    await page.getByRole("button", { name: t("shell.notifications.dismissNamed", { title }) }).click();
    await expect(page.getByText(title)).toBeHidden();
    await expect.poll(() => myTitles("learner2"), { timeout: 3_000 }).not.toContain(title);
  });
});
