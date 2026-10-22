// Signs in once per role through the real login form and saves the session (token in
// localStorage, media cookie) for the specs that run as that role.
import { test as setup, expect } from "@playwright/test";
import { PASSWORD, USERS, authFile } from "./support/env.mjs";
import { t } from "./support/i18n.mjs";
import { HOME, login } from "./support/ui.mjs";

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
