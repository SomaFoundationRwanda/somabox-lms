import { test, expect } from "@playwright/test";
import { authFile } from "../support/env.mjs";
import { HOME } from "../support/ui.mjs";

for (const [role, home] of [["admin", HOME.admin], ["teacher", HOME.teacher], ["learner", HOME.scholar]]) {
  test.describe(`${role} session`, () => {
    test.use({ storageState: authFile(role) });
    test("opens their home page", async ({ page }) => {
      await page.goto(home);
      await expect(page).toHaveURL(new RegExp(home));
    });
  });
}
