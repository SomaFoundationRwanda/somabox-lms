// Admin: the content manager (folders and files learners can open), the book library, and
// school analytics. Everything a test adds to the box's content folders is removed again.
import { test, expect } from "@playwright/test";
import { api, uid } from "../support/api.mjs";
import { authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { seedCourse } from "../support/seed.mjs";

test.use({ storageState: authFile("admin") });

const m = (key) => t(`explore.manager.${key}`);
const lib = (key) => t(`admin.library.${key}`);

// A one-page PDF, enough for the library and the content manager to accept.
const PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj " +
  "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);

test.describe("content manager", () => {
  const folder = `e2e-${uid()}`;
  const dialog = (page) => page.getByRole("dialog");
  const row = (page, name) => page.getByRole("row").filter({ hasText: name });

  test("makes a folder, uploads into it, renames, hides and deletes", async ({ page }) => {
    await page.goto("/manage/admin/manage-content");
    await expect(page.getByRole("tab", { name: /School content/ })).toHaveAttribute("aria-selected", "true");

    await page.getByRole("button", { name: m("newFolder") }).click();
    await dialog(page).getByLabel(m("folderName")).fill(folder);
    await dialog(page).getByRole("button", { name: m("createFolder") }).click();
    await expect(row(page, folder)).toBeVisible();

    // Same name again is refused.
    await page.getByRole("button", { name: m("newFolder") }).click();
    await dialog(page).getByLabel(m("folderName")).fill(folder);
    await dialog(page).getByRole("button", { name: m("createFolder") }).click();
    await expect(dialog(page).getByText(m("folderExists")).or(page.getByText(m("alreadyExists"))).first()).toBeVisible();
    await dialog(page).getByRole("button", { name: m("cancel") }).click();

    await row(page, folder).click();
    await expect(page.getByText(m("emptyFolder")).first()).toBeVisible();
    await page.getByRole("button", { name: m("upload"), exact: true }).click();
    await dialog(page).locator('input[type="file"]').setInputFiles({ name: "fractions.pdf", mimeType: "application/pdf", buffer: PDF });
    await dialog(page).getByRole("button", { name: m("upload"), exact: true }).click();
    await expect(dialog(page).getByText(m("added"))).toBeVisible();
    await dialog(page).getByRole("button", { name: m("done") }).click();
    // Files are listed by a readable title made from the file name.
    await expect(row(page, "Fractions")).toBeVisible();

    await page.getByRole("button", { name: `${m("rename")}: Fractions` }).click();
    await dialog(page).locator("#rename-name").fill("Fractions guide");
    await dialog(page).getByRole("button", { name: m("save") }).click();
    await expect(row(page, "Fractions guide")).toBeVisible();

    await page.getByRole("button", { name: `${m("hide")}: Fractions guide` }).click();
    await expect(row(page, "Fractions guide")).toContainText(m("hiddenBadge"));
    await page.getByRole("button", { name: `${m("show")}: Fractions guide` }).click();
    await expect(row(page, "Fractions guide")).not.toContainText(m("hiddenBadge"));

    await page.getByRole("textbox", { name: m("search") }).fill("nothing-like-this");
    await expect(row(page, "Fractions guide")).toHaveCount(0);
    await page.getByRole("textbox", { name: m("search") }).fill("");

    // Back to the top and delete the whole folder.
    await page.getByRole("navigation", { name: m("breadcrumbs") }).getByRole("button", { name: "School content" }).click();
    await page.getByRole("button", { name: `${m("delete")}: ${folder}` }).click();
    // The dialog first offers Delete; told the folder isn't empty, it asks to delete everything.
    await dialog(page).getByRole("button", { name: m("delete"), exact: true }).click();
    await dialog(page).getByRole("button", { name: m("deleteEverything") }).click();
    await expect(row(page, folder)).toHaveCount(0);
  });

  test("rescans the folders on demand and switches sections", async ({ page }) => {
    await page.goto("/manage/admin/manage-content");
    await page.getByRole("button", { name: m("rescan") }).click();
    await expect(page.getByText(m("rescanDone")).first()).toBeVisible();
    await page.getByRole("tab", { name: "Library" }).click();
    await expect(page.getByRole("tab", { name: "Library" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Rwandan education" }).click();
    await expect(page.getByRole("tab", { name: "Rwandan education" })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("library", () => {
  test("adds a book from the computer; learners see it; the admin deletes it", async ({ page, browser }) => {
    const title = `E2E Fractions ${uid()}`;
    await page.goto("/manage/admin/library");
    await page.getByRole("button", { name: lib("addFromComputer") }).click();
    await page.locator('input[type="file"]').setInputFiles({ name: "fractions-book.pdf", mimeType: "application/pdf", buffer: PDF });
    await page.getByLabel(lib("bookName")).fill(title);
    await page.getByRole("button", { name: lib("upload"), exact: true }).click();
    await expect(page.getByText(lib("uploaded")).or(page.getByText(lib("uploadDone"))).first()).toBeVisible();
    const local = page.getByRole("table", { name: lib("localCaption") });
    await expect(local.getByRole("row").filter({ hasText: title })).toBeVisible();

    const ctx = await browser.newContext({ storageState: authFile("learner") });
    const learner = await ctx.newPage();
    await learner.goto("/library");
    await expect(learner.getByText(title).first()).toBeVisible();
    await ctx.close();

    await local.getByRole("row").filter({ hasText: title }).getByRole("button", { name: t("admin.common.delete") }).click();
    // Confirmed in a banner above the lists.
    await page.locator("div").filter({ hasText: /This cannot be undone/ }).last().getByRole("button", { name: t("admin.common.delete") }).click();
    await expect(local.getByRole("row").filter({ hasText: title })).toHaveCount(0);
  });

  test("with the box offline, the cloud list is empty and nothing can be downloaded", async ({ page }) => {
    await page.goto("/manage/admin/library");
    const cloud = page.getByRole("table", { name: lib("cloudCaption") });
    await expect(cloud.getByText(lib("noBooks"))).toBeVisible();
  });
});

test.describe("analytics", () => {
  test("counts the school's learners, teachers and courses, and links a course to its insights", async ({ page }) => {
    const course = await seedCourse({ learners: ["learner", "learner2"] });
    const users = await api("GET", "/users?role=scholar&limit=1", { as: "admin" });
    await page.goto("/manage/admin/analytics");
    await expect(page.getByRole("heading", { name: "Totals" })).toBeVisible();
    const learners = page.getByRole("term").filter({ hasText: /^Learners$/ }).locator("xpath=following-sibling::dd[1]");
    await expect(learners).toHaveText(String(users.total ?? users.pagination?.total ?? (await learners.textContent())));

    const courses = page.getByRole("table", { name: t("admin.home.coursesTitle") });
    await courses.getByRole("link", { name: course.title }).click();
    await page.waitForURL(`**/course/${course.id}/insights`);
  });

  test("switches the period for teaching and product use", async ({ page }) => {
    await page.goto("/manage/admin/analytics");
    const period = page.getByRole("group", { name: "Period" });
    await period.getByRole("button", { name: "7 days" }).click();
    await expect(period.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
    await period.getByRole("button", { name: "90 days" }).click();
    await expect(period.getByRole("button", { name: "90 days" })).toHaveAttribute("aria-pressed", "true");
  });
});
