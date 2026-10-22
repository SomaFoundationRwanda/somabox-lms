// Signing in and out, signing up, learner codes, deactivated accounts and the forced password
// change on the default admin's first login.
import { test, expect } from "@playwright/test";
import { api, uid } from "../support/api.mjs";
import { PASSWORD, USERS } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { HOME, login, skipTour } from "../support/ui.mjs";

test.describe("sign in", () => {
  test("a wrong password shows an error and stays on the login page", async ({ page }) => {
    await login(page, USERS.learner.email, "not-the-password");
    await expect(page.getByText("Invalid email, learner code, or password").first()).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("each role lands on its own home page", async ({ page }) => {
    for (const role of ["admin", "teacher", "learner"]) {
      await page.context().clearCookies();
      await page.goto("/");
      await page.evaluate(() => localStorage.clear());
      await login(page, USERS[role].email, PASSWORD);
      await page.waitForURL(`**${HOME[USERS[role].role]}`);
    }
  });

  test("the password field can be shown and hidden", async ({ page }) => {
    await page.goto("/");
    const field = page.getByLabel(t("shell.login.password"), { exact: true });
    await field.fill("secret");
    await expect(field).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: t("shell.login.togglePassword") }).click();
    await expect(field).toHaveAttribute("type", "text");
  });

  test("a learner can sign in with their learner code instead of an email", async ({ page }) => {
    const email = `coded-${uid()}@e2e.test`;
    const { user } = await api("POST", "/users", { as: "admin", body: { email, password: PASSWORD, role: "scholar", fullName: "Coded Learner" } });
    expect(user.learner_code).toMatch(/^[A-Z]+-\d{4}$/);
    await login(page, user.learner_code.toLowerCase(), PASSWORD);
    await page.waitForURL(`**${HOME.scholar}`);
  });

  test("a deactivated account can't sign in", async ({ page }) => {
    const email = `gone-${uid()}@e2e.test`;
    await api("POST", "/users", { as: "admin", body: { email, password: PASSWORD, role: "scholar", fullName: "Gone Learner" } });
    const { users } = await api("GET", `/users?search=${encodeURIComponent(email)}`, { as: "admin" });
    await api("PATCH", `/users/${users[0].id}/status`, { as: "admin", body: { isActive: false } });
    await login(page, email, PASSWORD);
    await expect(page.getByText("Your account has been deactivated").first()).toBeVisible();
  });
});

test.describe("sign out", () => {
  test("logging out ends the session; protected pages then ask to sign in", async ({ page }) => {
    await skipTour(page);
    await login(page, USERS.learner2.email, PASSWORD);
    await page.waitForURL(`**${HOME.scholar}`);
    await page.getByRole("button", { name: t("logout"), exact: true }).click();
    await expect(page.getByLabel(t("school.login.label"))).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("st"))).toBeNull();
    await page.goto(HOME.scholar);
    await expect(page.getByLabel(t("school.login.label"))).toBeVisible();
  });
});

test.describe("sign up", () => {
  test("a new learner creates an account and lands on their dashboard", async ({ page }) => {
    const email = `new-${uid()}@e2e.test`;
    await page.goto("/signup");
    await page.getByLabel("Full Name").fill("Nia New");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create Account" }).click();
    // The new learner code is shown once, before they continue.
    await expect(page.getByRole("heading", { name: t("school.signup.createdTitle") })).toBeVisible();
    const code = await page.getByText(/^[A-Z]+-\d{4}$/).first().textContent();
    await page.getByRole("button", { name: t("school.signup.continue") }).click();
    await page.waitForURL(`**${HOME.scholar}`);
    const byCode = await api("POST", "/auth/login", { body: { email: code, password: PASSWORD } });
    expect(byCode.user.email).toBe(email);
    const me = await api("POST", "/auth/login", { body: { email, password: PASSWORD } });
    expect(me.user.role).toBe("scholar");
  });

  test("mismatched passwords are refused before anything is sent", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full Name").fill("Nia New");
    await page.getByLabel("Email").fill(`mismatch-${uid()}@e2e.test`);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm Password").fill(`${PASSWORD}-x`);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page.getByText(t("shell.signup.passwordsDontMatch")).first()).toBeVisible();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("an email that's already registered is refused", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full Name").fill("Lea Again");
    await page.getByLabel("Email").fill(USERS.learner.email);
    await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Confirm Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create Account" }).click();
    await expect(page).toHaveURL(/\/signup/);
    await expect(page.getByText("An account with this email already exists").first()).toBeVisible();
  });

  test("the sign-in and sign-up pages link to each other", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("link", { name: "Sign In" }).click();
    await expect(page.getByLabel(t("school.login.label"))).toBeVisible();
  });
});

test.describe("default admin", () => {
  test("must set a new password on first login, then reaches the admin portal", async ({ page }) => {
    await login(page, "admin@mail.com", "admin");
    await page.waitForURL("**/account");
    await expect(page.getByText(t("learner.account.defaultPassword")).first()).toBeVisible();

    await page.getByLabel(t("learner.account.currentPassword"), { exact: true }).fill("admin");
    await page.getByLabel(t("learner.account.newPassword"), { exact: true }).fill("short");
    await page.getByLabel(t("learner.account.confirmPassword"), { exact: true }).fill("short");
    await page.getByRole("button", { name: t("learner.account.changePassword") }).click();
    await expect(page.getByText(t("learner.account.pwTooShort")).first()).toBeVisible();

    await page.getByLabel(t("learner.account.newPassword"), { exact: true }).fill("brand-new-pass");
    await page.getByLabel(t("learner.account.confirmPassword"), { exact: true }).fill("brand-new-pass");
    await page.getByRole("button", { name: t("learner.account.changePassword") }).click();
    await expect(page.getByText(t("learner.account.pwUpdated")).first()).toBeVisible();

    await page.goto(HOME.admin);
    await expect(page.getByRole("heading", { name: t("adminTitle") })).toBeVisible();
    // The old password no longer works.
    const res = await fetch(`http://localhost:3100/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@mail.com", password: "admin" }) });
    expect(res.status).toBe(401);
  });
});
