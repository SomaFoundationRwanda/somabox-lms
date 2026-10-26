// Live updates: the box tells open browsers what changed, so they show it without reloading or
// asking on a timer (backend helpers/live.js, frontend lib/liveUpdates.js).
import { test, expect } from "@playwright/test";
import { api, uid } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { HOME } from "../support/ui.mjs";

test.use({ storageState: authFile("learner2") });

test("a new notification shows up on an open page, without a reload or polling", async ({ page }) => {
  const asked = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname === "/notifications") asked.push(r.url()); });
  await page.goto(HOME.scholar);
  await page.getByRole("button", { name: t("shell.notifications.title") }).first().click();
  await expect.poll(() => asked.length).toBeGreaterThan(0);
  const before = asked.length;

  const title = `Assembly at ten ${uid()}`;
  await api("POST", "/notifications", { as: "admin", body: { userEmail: USERS.learner2.email, title, message: "In the hall." } });
  await expect(page.getByText(title)).toBeVisible({ timeout: 10_000 });
  expect(asked.length).toBe(before + 1); // asked once, because it was told to
});

test("two tabs share one live connection", async ({ context }) => {
  const streams = [];
  context.on("request", (r) => { if (new URL(r.url()).pathname === "/live") streams.push(r.url()); });
  const first = await context.newPage();
  await first.goto(HOME.scholar);
  await expect.poll(() => streams.length).toBe(1);
  const second = await context.newPage();
  await second.goto(HOME.scholar);
  await second.waitForTimeout(1500);
  expect(streams.length).toBe(1);

  // When the tab holding it closes, the other takes over.
  await first.close();
  await expect.poll(() => streams.length, { timeout: 10_000 }).toBe(2);
});
