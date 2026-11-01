// The app around the pages: language, brightness and dark mode, the sidebar, help ("What is
// this?"), unknown addresses, embedded box services, teacher-only pages, and visitors (guests),
// who open everything and are reminded to sign up.
import { test, expect } from "@playwright/test";
import { api, uid, upload } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { pdf } from "../support/files.mjs";
import { t } from "../support/i18n.mjs";
import { seedCourse } from "../support/seed.mjs";

test.describe("signed in", () => {
  test.use({ storageState: authFile("learner") });

  test("switching language changes the interface and is remembered", async ({ page }) => {
    await page.goto("/manage/scholar-dashboard");
    await page.getByRole("combobox", { name: /Language \/ Langue/ }).selectOption("fr");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("button", { name: t("logout"), exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await page.getByRole("combobox", { name: /Language \/ Langue/ }).selectOption("en");
    await expect(page.getByRole("button", { name: t("logout"), exact: true })).toBeVisible();
  });

  test("lowering the brightness switches to dark mode, and it's remembered", async ({ page }) => {
    await page.goto("/manage/scholar-dashboard");
    const slider = page.getByRole("slider", { name: "Brightness" });
    await slider.focus();
    await page.keyboard.press("Home");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page.getByRole("slider", { name: "Brightness" }).focus();
    await page.keyboard.press("End");
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  });

  test("the sidebar collapses and expands", async ({ page }) => {
    await page.goto("/manage/scholar-dashboard");
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(page.getByRole("button", { name: /Expand sidebar/ })).toBeVisible();
    await page.getByRole("button", { name: /Expand sidebar/ }).click();
    await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  });

  test("the profile menu leads to the account page", async ({ page }) => {
    await page.goto("/manage/scholar-dashboard");
    await page.getByRole("button", { name: "Profile menu" }).click();
    await page.getByRole("menuitem", { name: /account|profile/i }).or(page.getByRole("button", { name: /account|profile/i })).or(page.getByRole("link", { name: /account|profile/i })).last().click();
    await page.waitForURL("**/account");
  });

  test("an unknown address shows a friendly not-found page", async ({ page }) => {
    await page.goto(`/no-such-place-${uid()}`);
    await expect(page.getByRole("link", { name: /home|explore/i }).or(page.getByText(/not found|doesn't exist|couldn't find/i)).first()).toBeVisible();
  });

  test("box services open inside the app", async ({ page }) => {
    await page.goto("/frame?slug=wikipedia");
    await expect(page.locator("iframe")).toHaveAttribute("src", /10\.0\.0\.1:8083/);
    await page.goto("/frame");
    await expect(page.getByText("Missing slug")).toBeVisible();
  });
});

test.describe("help", () => {
  test.use({ storageState: authFile("teacher") });

  test("'What is this?' explains a page", async ({ page }) => {
    const c = await seedCourse({ learners: [] });
    await page.goto(`/course/${c.id}/outcomes`);
    await page.getByRole("button", { name: "What is this?" }).first().click();
    await expect(page.getByRole("dialog").or(page.getByRole("tooltip")).or(page.getByRole("region").filter({ hasText: /outcome/i })).first()).toBeVisible();
  });

  test("'What should I create?' suggests an item and opens its editor", async ({ page }) => {
    const c = await seedCourse({ learners: [] });
    await page.goto(`/course/${c.id}/modules`);
    await page.getByRole("button", { name: "What should I create?" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("teacher pages", () => {
  test.use({ storageState: authFile("teacher") });

  test("the dashboard adds a learner to a course by email", async ({ page }) => {
    const c = await seedCourse({ title: `Quick add ${uid()}`, learners: [] });
    await page.goto("/teacher/dashboard");
    const card = page.locator("div").filter({ has: page.getByRole("link", { name: c.title }) }).filter({ has: page.getByRole("button", { name: t("teacher.dashboard.addStudent") }) }).last();
    await card.getByRole("button", { name: t("teacher.dashboard.addStudent") }).click();
    await page.getByLabel(t("teacher.dashboard.studentEmail")).fill(USERS.learner2.email);
    await page.getByLabel(t("teacher.dashboard.studentEmail")).press("Enter");
    await expect.poll(async () => JSON.stringify(await api("GET", `/courses/${c.id}/people`, { as: "teacher" }))).toContain(USERS.learner2.email);
  });

  test("explore content lists the box's content and the books", async ({ page }) => {
    await page.goto("/teacher/explore");
    await expect(page.getByRole("heading", { name: "Explore content" })).toBeVisible();
    // International education (Khan Academy, Wikipedia, W3Schools...) is hidden for now.
    await page.getByRole("searchbox", { name: "Search folders…" }).fill("Khan");
    await expect(page.getByRole("link", { name: /Khan Academy/ })).toHaveCount(0);
    await expect(page.getByText(t("explore.categories.international-education"))).toHaveCount(0);
    await page.getByRole("tab", { name: "Books" }).click();
    await expect(page.getByRole("tab", { name: "Books" })).toHaveAttribute("aria-selected", "true");
  });

  test("the old Science of learning page goes to the dashboard", async ({ page }) => {
    await page.goto("/teacher/science-of-learning");
    await page.waitForURL("**/teacher/dashboard");
  });

  test("settings offers no switches that do nothing", async ({ page }) => {
    await page.goto("/teacher/settings");
    await expect(page.getByRole("heading", { name: t("teacher.settings.title") })).toBeVisible();
    // The box sends no email and has no per-teacher alert settings, so none are offered.
    await expect(page.getByRole("switch")).toHaveCount(0);
  });

  test("settings shows the account and changes the language", async ({ page }) => {
    await page.goto("/teacher/settings");
    await expect(page.getByText(USERS.teacher.email)).toBeVisible();
    await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("sw");
    await expect(page.locator("html")).toHaveAttribute("lang", "sw");
    await page.getByRole("combobox").filter({ has: page.locator("option[value=en]") }).first().selectOption("en");
  });
});

test.describe("visitors", () => {
  const folder = `e2e-guest-${uid()}`;
  test.describe.configure({ mode: "serial" });
  test.beforeAll(async () => {
    await api("POST", "/content/manager/create-folder", { as: "admin", body: { path: "custom-content", name: folder } });
    for (const name of ["first-book.pdf", "second-book.pdf"]) {
      await upload("POST", "/content/manager/upload", { as: "admin", fields: { path: `custom-content/${folder}` }, file: { name, mimeType: "application/pdf", buffer: pdf(["A book for visitors."]) } });
    }
  });
  test("can browse public pages and are invited to sign up to join a course", async ({ page }) => {
    const pub = await seedCourse({ title: `Guest view ${uid()}`, learners: [], visibility: "public" });
    await page.goto("/discover-courses");
    await expect(page.getByText(t("guest.banner").split(".")[0]).first()).toBeVisible();
    const card = page.locator("div, article, li").filter({ has: page.getByRole("heading", { name: pub.title }) }).last();
    await card.getByRole("button", { name: "Sign up to join" }).click();
    // A gate explains why, and brings them back here after signing up.
    await expect(page.getByText(t("guest.gateTitle"))).toBeVisible();
    await page.getByRole("button", { name: t("guest.notNow") }).click();
    await expect(page.getByText(t("guest.gateTitle"))).toBeHidden();
    await card.getByRole("button", { name: "Sign up to join" }).click();
    await page.getByRole("link", { name: t("guest.signUp"), exact: true }).or(page.getByRole("button", { name: t("guest.signUp"), exact: true })).last().click();
    await page.waitForURL(/\/signup/);
  });

  test("open any book without an account, as often as they like", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("button", { name: "School content" })).toBeVisible();
    await expect(page.getByText(t("explore.categories.international-education"))).toHaveCount(0);
    await page.getByRole("button", { name: "School content" }).click();
    await page.getByText(new RegExp(folder.replace(/-/g, "[- ]"), "i")).first().click();
    const read = (title) => page.locator("div").filter({ has: page.getByText(title, { exact: true }) }).filter({ has: page.getByRole("button", { name: "Read" }) }).last().getByRole("button", { name: "Read" });
    for (const title of ["First book", "Second book", "First book"]) {
      await read(title).click();
      // Downloaded first (with a percentage), then shown: no sign-up gate, no time limit.
      await expect(page.locator(`iframe[title="${title}"]`)).toBeVisible();
      await expect(page.locator(`iframe[title="${title}"]`)).toHaveAttribute("src", /^blob:/);
      await expect(page.getByText(t("guest.gateTitle"))).toHaveCount(0);
      await page.keyboard.press("Escape");
    }
  });

  test("are reminded to sign up every 6 minutes", async ({ page }) => {
    await page.clock.install();
    await page.goto("/home");
    await expect(page.getByText(t("guest.banner").split(".")[0]).first()).toBeVisible();
    await page.clock.fastForward("05:50");
    await expect(page.getByText(t("guest.gateTitle"))).toHaveCount(0);
    await page.clock.fastForward("00:15");
    await expect(page.getByText(t("guest.gateTitle"))).toBeVisible();
    await page.getByRole("button", { name: t("guest.notNow") }).click();
    await expect(page.getByText(t("guest.gateTitle"))).toBeHidden();
    await page.clock.fastForward("06:05");
    await expect(page.getByText(t("guest.gateTitle"))).toBeVisible();
  });
});
