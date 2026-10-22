// A learner's own pages: the dashboard (cards and "By date"), their courses, the calendar,
// course home and moving through items, Discover (public courses), Explore and the Library
// (with AI summaries), mixed review, and their account.
import { test, expect } from "@playwright/test";
import { api, uid, upload } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { pdf } from "../support/files.mjs";
import { t } from "../support/i18n.mjs";
import { seedCourse, takeQuiz } from "../support/seed.mjs";

test.use({ storageState: authFile("learner") });

// Enough text (200+ characters) for the summary to read.
const MANGO_TEXT = [
  "Amina sells mangoes at the market every Saturday.",
  "She cuts each mango into equal parts to share them.",
  "Two equal parts are halves. Four equal parts are quarters.",
  "A quarter is one of four equal parts.",
  "Fractions are written with a top and a bottom number.",
  "Sharing equally means everyone gets the same amount.",
];

const lt = (key, vars) => t(`learner.${key}`, vars);
const ct = (key, vars) => t(`course.${key}`, vars);

test.describe("dashboard", () => {
  let c;
  test.beforeAll(async () => {
    c = await seedCourse({ title: `Dashboard Course ${uid()}`, learners: ["learner"] });
  });

  test("shows the learner's courses and continues into one", async ({ page }) => {
    await page.goto("/manage/scholar-dashboard");
    await page.getByRole("button", { name: lt("dashboard.view.cards") }).click();
    const course = page.getByText(c.title, { exact: true }).first();
    await expect(course).toBeVisible();
    await page.getByRole("link", { name: lt("dashboard.continue") }).filter({ has: page.getByRole("button") }).first().click();
    await page.waitForURL(/\/course\/\d+\//);
  });

  test("'By date' lists what's due and opening over the next weeks, linking to each item", async ({ page }) => {
    await page.goto("/manage/scholar-dashboard");
    await page.getByRole("button", { name: lt("dashboard.view.byDate") }).click();
    await expect(page.getByText(lt("dashboard.upcoming.hint"))).toBeVisible();
    const item = page.getByRole("link").filter({ hasText: "Fraction poster" }).filter({ hasText: c.title }).first();
    await expect(item).toBeVisible();
    // The choice is remembered.
    await page.reload();
    await expect(page.getByRole("button", { name: lt("dashboard.view.byDate") })).toHaveAttribute("aria-pressed", "true");
    await item.click();
    await page.waitForURL(`**/course/${c.id}/assignments/${c.assignment.content_id}`);
  });

  test("quick access links go where they say", async ({ page }) => {
    await page.goto("/manage/scholar-dashboard");
    await page.getByRole("link", { name: /^Discover Courses Browse/ }).click();
    await page.waitForURL("**/discover-courses");
    await page.goto("/manage/scholar-dashboard");
    await page.getByRole("link", { name: /^Library Books/ }).click();
    await page.waitForURL("**/library");
  });
});

test.describe("courses and course home", () => {
  test("My courses lists the learner's courses only", async ({ page }) => {
    const mine = await seedCourse({ title: `Mine ${uid()}`, learners: ["learner"] });
    const notMine = await seedCourse({ title: `Not mine ${uid()}`, learners: ["learner2"] });
    await page.goto("/manage/scholar-dashboard/courses");
    await expect(page.getByText(mine.title).first()).toBeVisible();
    await expect(page.getByText(notMine.title)).toHaveCount(0);
  });

  test("a draft course can't be opened by a learner", async ({ page }) => {
    const draft = await seedCourse({ open: false, learners: [] });
    await api("POST", `/courses/${draft.id}/people`, { as: "teacher", body: { email: USERS.learner.email, role: "student" } }).catch(() => {});
    await page.goto(`/course/${draft.id}/home`);
    await expect(page.getByText(draft.title)).toHaveCount(0);
  });

  test("course home shows this week; Previous and Next move through the items", async ({ page }) => {
    const c = await seedCourse({ learners: ["learner"] });
    await page.goto(`/course/${c.id}/home`);
    await expect(page.getByRole("region", { name: /Week 1/ })).toBeVisible();
    await expect(page.getByRole("link", { name: ct("nav.progress") })).toBeVisible();
    await page.goto(`/course/${c.id}/pages/${c.page.content_id}`);
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.waitForURL(`**/assignments/${c.assignment.content_id}`);
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.waitForURL(`**/quizzes/${c.quiz.content_id}`);
    await page.getByRole("button", { name: /^Previous/ }).click();
    await page.waitForURL(`**/assignments/${c.assignment.content_id}`);
  });

  test("course home doesn't show learners the teacher's weekly-loop guidance", async ({ page }) => {
    test.fail(true, "Known bug: the course home shows learners the teacher's beat help (e.g. \"Collect: follow learners' progress...\") and the class outcome panel; it doesn't check the role.");
    const c = await seedCourse({ learners: ["learner"] });
    await page.goto(`/course/${c.id}/home`);
    await expect(page.getByRole("region", { name: /Week 1/ })).toBeVisible();
    for (const beat of ["prepare", "release", "collect", "grade", "review"]) await expect(page.getByText(ct(`home.beatHelp.${beat}`))).toHaveCount(0, { timeout: 2_000 });
  });

  test("the course menu shows learners only their sections", async ({ page }) => {
    const c = await seedCourse({ learners: ["learner"] });
    await page.goto(`/course/${c.id}/home`);
    const nav = page.getByRole("navigation", { name: "Course navigation" });
    await expect(nav.getByRole("link", { name: ct("nav.home") })).toBeVisible();
    for (const hidden of ["settings", "ai", "insights"]) await expect(nav.getByRole("link", { name: ct(`nav.${hidden}`) })).toHaveCount(0);
  });
});

test.describe("calendar", () => {
  test("My calendar shows every course's dates by month and as an agenda", async ({ page }) => {
    const c = await seedCourse({ title: `Calendar Course ${uid()}`, learners: ["learner"] });
    await page.goto("/calendar");
    await expect(page.getByRole("link", { name: /Fraction poster/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "Next month" }).click();
    await page.getByRole("button", { name: "Today" }).click();
    await page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: "Agenda" }).click();
    await expect(page.getByText(c.title).first()).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .ics" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  });
});

test.describe("discover", () => {
  test("joins a public course; private courses aren't listed", async ({ page }) => {
    const pub = await seedCourse({ title: `Public ${uid()}`, learners: [], visibility: "public" });
    const priv = await seedCourse({ title: `Private ${uid()}`, learners: [] });
    await page.goto("/discover-courses");
    await expect(page.getByText(priv.title)).toHaveCount(0);
    const card = page.locator("div, article, li").filter({ has: page.getByRole("heading", { name: pub.title }) }).last();
    await card.getByRole("button", { name: "Join course" }).click();
    await expect.poll(async () => JSON.stringify(await api("GET", "/courses/mine", { as: "learner" }))).toContain(pub.title);
  });

  test("a course the learner is already in isn't offered to join again", async ({ page }) => {
    const pub = await seedCourse({ title: `Already in ${uid()}`, learners: ["learner"], visibility: "public" });
    await page.goto("/discover-courses");
    const card = page.locator("div, article, li").filter({ has: page.getByRole("heading", { name: pub.title }) }).last();
    await expect(card.getByRole("button", { name: "Join course" })).toHaveCount(0, { timeout: 3_000 });
  });

  test("a wrong join code is refused", async ({ page }) => {
    await page.goto("/discover-courses");
    await page.getByRole("textbox", { name: "Join with a code" }).fill("ZZZZZZ");
    await page.getByRole("button", { name: "Join", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /./ }).or(page.getByText(/code/i).filter({ hasText: /not|no course|wrong|check/i })).first()).toBeVisible();
  });
});

test.describe("explore and library", () => {
  const folder = `e2e-explore-${uid()}`;
  test.beforeAll(async () => {
    await api("POST", "/content/manager/create-folder", { as: "admin", body: { path: "custom-content", name: folder } });
    await upload("POST", "/content/manager/upload", { as: "admin", fields: { path: `custom-content/${folder}` }, file: { name: "sharing-mangoes.pdf", mimeType: "application/pdf", buffer: pdf(MANGO_TEXT) } });
    // Under 200 characters of text: treated like a scanned book, which can't be summarised.
    await upload("POST", "/content/manager/upload", { as: "admin", fields: { path: `custom-content/${folder}` }, file: { name: "scanned-page.pdf", mimeType: "application/pdf", buffer: pdf(["Page 1"]) } });
    await upload("POST", "/library/upload", { as: "admin", fields: { bookName: "E2E Market Maths" }, file: { name: "e2e-market-maths.pdf", mimeType: "application/pdf", buffer: pdf(["Counting money at the market."]) } });
  });
  test.afterAll(async () => {
    await api("DELETE", `/content/manager/item?path=${encodeURIComponent(`custom-content/${folder}`)}&recursive=true`, { as: "admin" }).catch(() => {});
  });

  test("Explore: opens school content and gets an AI summary", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("button", { name: "School content" }).click();
    await page.getByText(new RegExp(folder.replace(/-/g, "[- ]"), "i")).first().click();
    const book = page.locator("div").filter({ has: page.getByText("Sharing mangoes", { exact: true }) }).filter({ has: page.getByRole("button", { name: "Read" }) }).last();
    await book.getByRole("button", { name: "Read" }).click();
    await page.getByRole("button", { name: t("explore.summary.button") }).click();
    await page.getByRole("button", { name: t("explore.summary.get") }).click();
    await expect(page.getByText(t("explore.summary.keyPoints"))).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/A quarter is one of four equal parts/).first()).toBeVisible();
  });

  test("Explore: a book without readable text says it can't be summarised", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("button", { name: "School content" }).click();
    await page.getByText(new RegExp(folder.replace(/-/g, "[- ]"), "i")).first().click();
    const book = page.locator("div").filter({ has: page.getByText("Scanned page", { exact: true }) }).filter({ has: page.getByRole("button", { name: "Read" }) }).last();
    await book.getByRole("button", { name: "Read" }).click();
    await page.getByRole("button", { name: t("explore.summary.button") }).click();
    await page.getByRole("button", { name: t("explore.summary.get") }).click();
    await expect(page.getByText(/no readable text/).first()).toBeVisible({ timeout: 30_000 });
  });

  test("Library: finds a book by title and opens it", async ({ page }) => {
    await page.goto("/library");
    await page.getByRole("textbox", { name: "Search books by title" }).fill("Market Maths");
    await expect(page.getByText("E2E Market Maths").first()).toBeVisible();
    await page.getByRole("textbox", { name: "Search books by title" }).fill("no-such-book");
    await expect(page.getByText("No books found")).toBeVisible();
    await page.getByRole("textbox", { name: "Search books by title" }).fill("");
    await page.getByText("E2E Market Maths").first().click();
    await expect(page.locator("iframe, embed, object, canvas").or(page.getByRole("dialog")).first()).toBeVisible();
  });
});

test.describe("mixed review", () => {
  test("unlocks after quizzes in two courses and gives a practice session", async ({ page }) => {
    const a = await seedCourse({ learners: ["learner"] });
    const b = await seedCourse({ learners: ["learner"] });
    await takeQuiz(a, "learner");
    await takeQuiz(b, "learner");
    await page.goto("/manage/scholar-dashboard/interleaved-review");
    await expect(page.getByText("Not enough finished lessons yet")).toHaveCount(0);
    await expect(page.getByRole("radio").or(page.getByRole("button", { name: /check|next|submit/i })).first()).toBeVisible();
  });
});

test.describe("account", () => {
  test.use({ storageState: authFile("learner2") });

  test("edits their profile details", async ({ page }) => {
    await page.goto("/account");
    await page.getByRole("button", { name: lt("account.edit") }).click();
    await page.getByLabel(/gender/i).first().selectOption("male");
    await page.getByRole("button", { name: lt("account.save"), exact: true }).click();
    await expect(page.getByText(lt("account.savedToast")).or(page.getByText(lt("account.saved"))).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(/Male/).first()).toBeVisible();
  });

  test("downloads everything the box holds about them", async ({ page }) => {
    await page.goto("/account");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: lt("account.downloadData") }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.json$/);
  });

  test("a wrong current password shows an error and keeps them signed in", async ({ page }) => {
    test.fail(true, "Known bug: PATCH /users/profile/password answers 401 for a wrong current password, and the app treats every 401 as an expired session, so the learner is signed out.");
    await page.goto("/account");
    await page.getByRole("button", { name: lt("account.tabSecurity") }).click();
    await page.getByLabel(lt("account.currentPassword"), { exact: true }).fill("wrong-password");
    await page.getByLabel(lt("account.newPassword"), { exact: true }).fill("another-pass");
    await page.getByLabel(lt("account.confirmPassword"), { exact: true }).fill("another-pass");
    await page.getByRole("button", { name: lt("account.changePassword") }).click();
    await expect(page.getByText("Current password is incorrect").first()).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/account/);
  });
});
