// Signing in and out, signing up, learner codes, deactivated accounts, the limit on failed
// sign-ins, shared devices, and a set-up box refusing setup again (setup itself: auth.setup.mjs).
import { test, expect } from "@playwright/test";
import { api, uid, createUser } from "../support/api.mjs";
import { API_URL, PASSWORD, USERS } from "../support/env.mjs";
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
    const { user } = await createUser({ email, role: "scholar", fullName: "Coded Learner" });
    expect(user.learner_code).toMatch(/^[A-Z]+-\d{4}$/);
    await login(page, user.learner_code.toLowerCase(), PASSWORD);
    await page.waitForURL(`**${HOME.scholar}`);
  });

  test("a deactivated account can't sign in", async ({ page }) => {
    const email = `gone-${uid()}@e2e.test`;
    await createUser({ email, role: "scholar", fullName: "Gone Learner" });
    const { users } = await api("GET", `/users?search=${encodeURIComponent(email)}`, { as: "admin" });
    await api("PATCH", `/users/${users[0].id}/status`, { as: "admin", body: { isActive: false } });
    await login(page, email, PASSWORD);
    await expect(page.getByText("Your account has been deactivated").first()).toBeVisible();
    // Without the right password it's an ordinary failed sign-in: no hint the account exists.
    await login(page, email, "not-the-password");
    await expect(page.getByText("Invalid email, learner code, or password").first()).toBeVisible();
    await expect(page.getByText("Your account has been deactivated")).toHaveCount(0);
  });

  test("after four wrong passwords in a minute the account waits, even with the right one", async ({ page }) => {
    const email = `guessed-${uid()}@e2e.test`;
    await createUser({ email, role: "scholar", fullName: "Guessed Learner" });
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: `guess-${i}` }) });
      expect(res.status).toBe(401);
    }
    await login(page, email, PASSWORD);
    await expect(page.getByText(t("shell.login.tooManyAttempts")).first()).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("every sign-in is kept only until the browser closes, without a box to tick", async ({ page }) => {
    await page.goto("/");
    // Nothing to remember: every device is treated as shared.
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByText(t("shell.login.autoSignOut"))).toBeVisible();
    await page.getByLabel(t("school.login.label")).fill(USERS.learner2.email);
    await page.getByLabel(t("shell.login.password"), { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: t("auth.authLogin"), exact: true }).click();
    await page.waitForURL(`**${HOME.scholar}`);
    expect(await page.evaluate(() => localStorage.getItem("st"))).toBeNull();
    expect(await page.evaluate(() => sessionStorage.getItem("st"))).toBeTruthy();
    // A reload in the same tab stays signed in.
    await page.reload();
    await expect(page).toHaveURL(new RegExp(HOME.scholar));
  });

  test("someone typing or tapping stays signed in: the app tells the box they're still there", async ({ page }) => {
    await page.clock.install();
    await login(page, USERS.learner2.email, PASSWORD);
    await page.waitForURL(`**${HOME.scholar}`);
    await expect(page.getByRole("button", { name: t("logout"), exact: true })).toBeVisible();
    // Six quiet minutes, then a key press: the box hears from the app.
    await page.clock.fastForward("06:00");
    const ping = page.waitForRequest((r) => new URL(r.url()).pathname === "/auth/me");
    await page.keyboard.press("Tab");
    await ping;
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
    await page.locator("#signup-class").fill("S1B");
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
    await page.locator("#signup-class").fill("S1B");
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
    await page.locator("#signup-class").fill("S1B");
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

test.describe("box setup", () => {
  test("a set-up box shows the login page, and setup refuses a second admin", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel(t("school.login.label"))).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    const res = await fetch(`${API_URL}/setup`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "E2E1-SETUP", fullName: "Intruder", email: `intruder-${uid()}@e2e.test`, password: "intruder-pass", schoolName: "Taken" }),
    });
    expect(res.status).toBe(409);
    const old = await fetch(`${API_URL}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@mail.com", password: "admin" }) });
    expect(old.status).toBe(401);
  });
});
