// Signs in once per role through the real login form and saves the session (token in
// localStorage, media cookie) for the specs that run as that role.
import { test as setup, expect } from "@playwright/test";
import { PASSWORD, SCHOOL_NAME, SETUP_CODE, USERS, authFile } from "./support/env.mjs";
import { t } from "./support/i18n.mjs";
import { HOME, login } from "./support/ui.mjs";

// A new box: the login page sends people to set it up, and the setup code creates the admin.
setup("set up the box with its setup code", async ({ page }) => {
  await page.goto("/");
  await page.waitForURL("**/setup");
  await page.getByLabel(t("shell.setup.code")).fill("WRON-GCOD");
  await page.getByLabel(t("shell.setup.schoolName")).fill(SCHOOL_NAME);
  await page.getByLabel(t("shell.setup.adminName")).fill(USERS.admin.name);
  await page.getByLabel(t("shell.setup.adminEmail")).fill(USERS.admin.email);
  await page.getByLabel(t("shell.setup.password"), { exact: true }).fill(PASSWORD);
  await page.getByLabel(t("shell.signup.confirmPassword"), { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: t("shell.setup.submit") }).click();
  await expect(page.getByText(t("shell.setup.badCode"))).toBeVisible();

  await page.getByLabel(t("shell.setup.code")).fill(SETUP_CODE.toLowerCase());
  await page.getByRole("button", { name: t("shell.setup.submit") }).click();
  await page.waitForURL("**/manage/admin");
  // Done once: the setup page now only points to sign-in.
  await page.goto("/setup");
  await expect(page.getByText(t("shell.setup.doneTitle"))).toBeVisible();
});

for (const [role, user] of Object.entries(USERS)) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await login(page, user.email, PASSWORD);
    await page.waitForURL(`**${HOME[user.role]}**`);
    await expect(page.getByRole("button", { name: t("logout"), exact: true })).toBeVisible();
    // The first-visit tour is tested on its own (onboarding.spec); everywhere else it would
    // cover the page.
    await page.evaluate(() => localStorage.setItem("somabox_tour_seen_v1", "1"));
    await page.context().storageState({ path: authFile(role) });
  });
}
