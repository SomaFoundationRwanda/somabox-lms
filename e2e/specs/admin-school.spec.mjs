// School settings: name and learner-code prefix, location, logo, colours (and that they reach
// every page), and visitor previews.
import { test, expect } from "@playwright/test";
import { api, uid } from "../support/api.mjs";
import { PASSWORD, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";

test.use({ storageState: authFile("admin") });
// The school is shared by every spec: change it one test at a time and put it back after.
test.describe.configure({ mode: "serial" });

const s = (key) => t(`school.settings.${key}`);
const DEFAULTS = { name: "SOMABOX Partner School", code: "SPS", primaryColor: "#203A3A", secondaryColor: "#0F766E", province: "", district: "", isRural: null, guestPreview: { enabled: true, seconds: 40, items: 5 } };

test.afterAll(async () => {
  await api("PUT", "/school", { as: "admin", body: DEFAULTS });
  await api("DELETE", "/school/logo", { as: "admin" }).catch(() => {});
});

const save = (page) => page.getByRole("button", { name: s("save") }).click();

test("renames the school and changes the learner-code prefix for new learners only", async ({ page }) => {
  await page.goto("/manage/admin/school");
  await page.getByLabel(s("name"), { exact: true }).fill("GS Kigali");
  await page.getByLabel(s("code"), { exact: true }).fill("x");
  await expect(page.getByText(s("codeInvalid")).first()).toBeVisible();
  await page.getByLabel(s("code"), { exact: true }).fill("GSK");
  await expect(page.getByText(/GSK-0001|GSK-\d{4}/).first()).toBeVisible();
  await save(page);
  await expect(page.getByText(s("saved")).first()).toBeVisible();

  const { user } = await api("POST", "/users", { as: "admin", body: { email: `prefix-${uid()}@e2e.test`, password: PASSWORD, role: "scholar", fullName: "Prefix Learner" } });
  expect(user.learner_code).toMatch(/^GSK-\d{4}$/);

  // Everyone sees the new name, including visitors on the login page.
  const pub = await api("GET", "/school/public");
  expect(pub.name).toBe("GS Kigali");
  await page.reload();
  await expect(page.getByLabel(s("name"), { exact: true })).toHaveValue("GS Kigali");
});

test("sets the school's location", async ({ page }) => {
  await page.goto("/manage/admin/school");
  await expect(page.getByLabel(s("district"), { exact: true })).toBeDisabled();
  const province = page.getByLabel(s("province"), { exact: true });
  const firstProvince = await province.locator("option").nth(1).getAttribute("value");
  await province.selectOption(firstProvince);
  const district = page.getByLabel(s("district"), { exact: true });
  await expect(district).toBeEnabled();
  const firstDistrict = await district.locator("option").nth(1).getAttribute("value");
  await district.selectOption(firstDistrict);
  await page.getByRole("radio", { name: s("rural") }).check();
  await save(page);
  await expect(page.getByText(s("saved")).first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel(s("province"), { exact: true })).toHaveValue(firstProvince);
  await expect(page.getByLabel(s("district"), { exact: true })).toHaveValue(firstDistrict);
  await expect(page.getByRole("radio", { name: s("rural") })).toBeChecked();
});

test("uploads and removes a logo", async ({ page }) => {
  await page.goto("/manage/admin/school");
  await page.locator("#school-logo-file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText(s("logoUploaded")).first()).toBeVisible();
  expect((await api("GET", "/school/public")).logoUrl).toBeTruthy();

  await page.getByRole("button", { name: s("logoRemove") }).click();
  await expect(page.getByText(s("logoRemoved")).first()).toBeVisible();
  expect((await api("GET", "/school/public")).logoUrl).toBeFalsy();
});

test("refuses a logo that isn't an image", async ({ page }) => {
  await page.goto("/manage/admin/school");
  await page.locator("#school-logo-file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByText(s("logoType")).first()).toBeVisible();
});

test("custom colours reach buttons, badges and highlights on every page", async ({ page, browser }) => {
  await page.goto("/manage/admin/school");
  const secondary = page.locator("#school-secondary-hex");
  // A light colour gets the contrast warning; a dark one doesn't.
  await secondary.fill("#FFEE00");
  await expect(page.getByText(s("lowContrast")).first()).toBeVisible();
  await page.locator("#school-primary-hex").fill("#5B21B6");
  await secondary.fill("#9A3412");
  await expect(page.getByText(s("lowContrast"))).toHaveCount(0);
  await save(page);
  await expect(page.getByText(s("saved")).first()).toBeVisible();

  // A learner's pages pick the colours up: the variables and the accent classes built on them.
  const ctx = await browser.newContext({ storageState: authFile("learner") });
  const learner = await ctx.newPage();
  await learner.goto("/manage/scholar-dashboard");
  await expect.poll(() => learner.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--brand-secondary").trim().toUpperCase())).toBe("#9A3412");
  const colours = await learner.evaluate(() => {
    const probe = (cls) => {
      const el = document.createElement("div");
      el.className = cls;
      document.body.appendChild(el);
      const style = getComputedStyle(el);
      const out = { bg: style.backgroundColor, color: style.color };
      el.remove();
      return out;
    };
    return { teal600: probe("bg-teal-600").bg, accentDark: probe("bg-accent-dark").bg, button: probe("bg-primary-600").bg };
  });
  expect(colours.teal600).toBe("rgb(154, 52, 18)");
  expect(colours.accentDark).toBe("rgb(91, 33, 182)");
  // The default button mixes the two school colours: no trace of the old fixed teal.
  expect(colours.button).not.toBe("rgb(31, 103, 103)");

  // Visitors see them too (the login page).
  const anon = await browser.newPage();
  await anon.goto("/");
  await expect.poll(() => anon.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--brand-primary").trim().toUpperCase())).toBe("#5B21B6");
  await ctx.close();
  await anon.close();

  await page.reload();
  await page.getByRole("button", { name: s("resetColours") }).click();
  await expect(page.locator("#school-primary-hex")).toHaveValue(/#203A3A/i);
  // The SOMABOX colours themselves are readable with white text.
  await expect(page.getByText(s("lowContrast"))).toHaveCount(0);
});

test("visitor previews can be limited or switched off", async ({ page }) => {
  await page.goto("/manage/admin/school");
  await page.getByLabel(s("seconds"), { exact: true }).fill("5");
  await save(page);
  await expect(page.getByText(s("secondsInvalid")).first()).toBeVisible();
  await page.getByLabel(s("seconds"), { exact: true }).fill("90");
  await page.getByLabel(s("items"), { exact: true }).fill("3");
  await save(page);
  await expect(page.getByText(s("saved")).first()).toBeVisible();
  expect((await api("GET", "/school/public")).guestPreview).toMatchObject({ enabled: true, seconds: 90, items: 3 });

  await page.getByRole("switch", { name: s("visitorsOn") }).click();
  await expect(page.getByRole("switch", { name: s("visitorsOn") })).not.toBeChecked();
  await save(page);
  await expect(page.getByText(s("saved")).first()).toBeVisible();
  expect((await api("GET", "/school/public")).guestPreview.enabled).toBe(false);
});

// A 1x1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
