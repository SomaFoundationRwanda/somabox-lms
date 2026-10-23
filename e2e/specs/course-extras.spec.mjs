// Less common course actions: course details and banner, reordering (menu, weeks, items) with
// the keyboard, practice and open-ended quizzes, late and closed work, assistant and observer
// roles, joining from My courses, and the admin's view of one user.
import { test, expect } from "@playwright/test";
import { api, tokenFor, uid, createUser } from "../support/api.mjs";
import { PASSWORD, USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { mondayThisWeek, seedCourse } from "../support/seed.mjs";

const ct = (key, vars) => t(`course.${key}`, vars);

// A 1x1 PNG for the banner.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function asRole(browser, role) {
  const ctx = await browser.newContext({ storageState: authFile(role) });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

test.describe("course settings", () => {
  test.use({ storageState: authFile("teacher") });

  test("saves the description, grade and banner image", async ({ page }) => {
    const c = await seedCourse({ learners: [] });
    await page.goto(`/course/${c.id}/settings`);
    await page.locator("#course-description").fill("Fractions, from halves to hundredths.");
    await page.locator("#course-grade").selectOption({ index: 2 });
    await page.locator("#course-banner").setInputFiles({ name: "banner.png", mimeType: "image/png", buffer: PNG });
    await page.getByRole("button", { name: /save changes/i }).first().click();
    await expect.poll(async () => (await api("GET", `/courses/${c.id}`, { as: "teacher" })).description).toBe("Fractions, from halves to hundredths.");
    // The banner uploads after the details are saved.
    await expect.poll(async () => (await api("GET", `/courses/${c.id}`, { as: "teacher" })).coverImageUrl).toMatch(/^\/course-covers\//);
    expect((await api("GET", `/courses/${c.id}`, { as: "teacher" })).grade).toBeTruthy();
  });

  test("moves a tab in the course menu, and learners see the new order", async ({ page }) => {
    const c = await seedCourse({ learners: ["learner2"] });
    const order = async () => {
      const nav = await api("GET", `/courses/${c.id}/nav`, { as: "learner2" });
      return (nav.items ?? nav).map((i) => i.navKey);
    };
    const before = await order();
    await page.goto(`/course/${c.id}/settings`);
    await page.getByRole("button", { name: "Navigation" }).click();
    await page.getByRole("button", { name: ct("settings.moveUp", { name: ct("nav.announcements") }) }).filter({ visible: true }).first().click();
    await expect(page.getByText(ct("nav.announcements"), { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await page.getByRole("button", { name: ct("settings.saveNav") }).click();
    await expect.poll(order, { timeout: 3_000 }).not.toEqual(before);
  });

  test("closing a course stops new work; reopening allows it again", async ({ page, browser }) => {
    const c = await seedCourse({ learners: ["learner"] });
    page.on("dialog", (d) => d.accept());
    await page.goto(`/course/${c.id}/settings`);
    await expect(page.getByText(ct("settings.status.now.open"))).toBeVisible();
    await page.getByRole("button", { name: ct("settings.status.action.closed") }).click();
    await expect(page.getByText(ct("settings.status.now.closed"))).toBeVisible();

    // Learners can still read the course, but can't hand in.
    const learner = await asRole(browser, "learner");
    await learner.page.goto(`/course/${c.id}/assignments/${c.assignment.content_id}`);
    await learner.page.getByLabel(ct("assignment.responseLabel")).fill("Too late");
    await learner.page.getByRole("button", { name: ct("assignment.submit") }).click();
    await expect(learner.page.getByText(/This course has ended/).first()).toBeVisible();

    await page.getByRole("button", { name: ct("settings.status.action.open") }).click();
    await expect(page.getByText(ct("settings.status.now.open"))).toBeVisible();
    await learner.page.reload();
    await learner.page.getByLabel(ct("assignment.responseLabel")).fill("Back on time");
    await learner.page.getByRole("button", { name: ct("assignment.submit") }).click();
    await expect(learner.page.getByText(ct("assignment.submitted")).first()).toBeVisible();
    await learner.close();
  });

  test("an archived course leaves learners' course lists", async ({ page }) => {
    const c = await seedCourse({ title: `Archive me ${uid()}`, learners: ["learner2"] });
    page.on("dialog", (d) => d.accept());
    await page.goto(`/course/${c.id}/settings`);
    await page.getByRole("button", { name: ct("settings.status.action.archived") }).click();
    await expect(page.getByText(ct("settings.status.now.archived"))).toBeVisible();
    expect(JSON.stringify(await api("GET", "/courses/mine", { as: "learner2" }))).not.toContain(c.title);
    // Archived courses can come back as closed.
    await expect(page.getByRole("button", { name: ct("settings.status.action.closed") })).toBeVisible();
  });

  test("a course without learners' work can be deleted; one with work can't", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    const empty = await seedCourse({ learners: [] });
    await page.goto(`/course/${empty.id}/settings`);
    await page.getByRole("button", { name: ct("settings.status.action.delete") }).click();
    await page.waitForURL("**/teacher/courses");
    const gone = await fetch(`http://localhost:3100/courses/${empty.id}`, { headers: { Authorization: `Bearer ${await tokenFor("teacher")}` } });
    expect(gone.status).toBe(404);

    const used = await seedCourse({ learners: ["learner"] });
    await api("POST", `/courses/${used.id}/assignments/${used.assignment.content_id}/submit`, { as: "learner", body: { body: "My poster" } });
    await page.goto(`/course/${used.id}/settings`);
    await page.getByRole("button", { name: ct("settings.status.action.delete") }).click();
    await expect(page.getByText(ct("settings.status.hasWork"))).toBeVisible();
  });
});

// Space picks the focused row up, ArrowDown moves it one place, Space drops it. Each step waits
// for the drag animation, as a person would.
async function dragOneDown(page) {
  for (const key of ["Space", "ArrowDown", "Space"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(250);
  }
}

test.describe("reordering with the keyboard", () => {
  test.use({ storageState: authFile("teacher") });

  test("moves a week and an item", async ({ page }) => {
    const c = await seedCourse({ learners: [], weeks: 3 });
    await page.goto(`/course/${c.id}/modules`);
    const weekTitles = async () => (await api("GET", `/courses/${c.id}/modules`, { as: "teacher" })).filter((m) => m.kind !== "unassigned").map((m) => m.title);
    const before = await weekTitles();
    // The drag-and-drop list loads just after the page; wait for it before using the handles.
    await expect(page.locator('[aria-roledescription="sortable"]').first()).toBeVisible();
    const handle = page.getByRole("button", { name: ct("modules.dragModule"), exact: true }).first();
    await handle.focus();
    await dragOneDown(page);
    await expect.poll(weekTitles, { timeout: 3_000 }).not.toEqual(before);

    const items = async () => JSON.stringify(await api("GET", `/courses/${c.id}/modules`, { as: "teacher" }));
    const itemsBefore = await items();
    // Each week's item list loads on its own too.
    await page.reload();
    await expect(page.locator("li[aria-roledescription=\"sortable\"]").first()).toBeVisible();
    const itemHandle = page.getByRole("button", { name: "Drag to reorder the item", exact: true }).first();
    await itemHandle.focus();
    await dragOneDown(page);
    await expect.poll(items).not.toBe(itemsBefore);
  });
});

test.describe("quiz kinds", () => {
  test("a practice quiz gives feedback but isn't graded", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner"] });
    const quiz = await api("POST", `/courses/${c.id}/modules/${c.modules[0].id}/items`, {
      as: "teacher",
      body: { itemType: "quiz", title: "Warm-up", kind: "practice", questions: [{ prompt: "Half of 4?", options: ["2", "3"], correctOption: "2" }] },
    });
    const learner = await asRole(browser, "learner");
    await learner.page.goto(`/course/${c.id}/quizzes/${quiz.content_id}`);
    await expect(learner.page.getByText(ct("quiz.practiceNotGraded")).first()).toBeVisible();
    await learner.page.getByRole("radio", { name: "2", exact: true }).check();
    await learner.page.getByRole("button", { name: ct("quiz.submit") }).click();
    await learner.page.goto(`/course/${c.id}/grades`);
    await expect(learner.page.getByText("Warm-up")).toHaveCount(0);
    await learner.close();
  });

  test("an open-ended question takes a written answer", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner"] });
    const quiz = await api("POST", `/courses/${c.id}/modules/${c.modules[0].id}/items`, {
      as: "teacher",
      body: { itemType: "quiz", title: "Explain it", kind: "graded", outcomeIds: [c.outcome.id], questions: [{ prompt: "Why is 2/4 the same as 1/2?", questionType: "open", outcomeId: c.outcome.id }] },
    });
    const learner = await asRole(browser, "learner");
    await learner.page.goto(`/course/${c.id}/quizzes/${quiz.content_id}`);
    await learner.page.getByPlaceholder(ct("quiz.openAnswerPlaceholder")).fill("Both are half of the whole.");
    await learner.page.getByRole("button", { name: ct("quiz.submit") }).click();
    await expect(learner.page.getByText(/Quiz submitted/).first()).toBeVisible();
    await learner.close();
  });
});

test.describe("dates", () => {
  test("work handed in after the due day is marked late; after the close day it can't be handed in", async ({ browser }) => {
    // Week 1 started two weeks ago, so its due and close days have passed.
    const c = await seedCourse({ learners: ["learner"], startDate: mondayThisWeek(-2), weeks: 4 });
    const late = await api("POST", `/courses/${c.id}/modules/${c.modules[0].id}/items`, { as: "teacher", body: { itemType: "assignment", title: "Late poster", outcomeIds: [c.outcome.id], releaseDay: 0, dueDay: 2 } });
    const closed = await api("POST", `/courses/${c.id}/modules/${c.modules[0].id}/items`, { as: "teacher", body: { itemType: "assignment", title: "Closed poster", outcomeIds: [c.outcome.id], releaseDay: 0, dueDay: 2, closeDay: 3 } });
    const learner = await asRole(browser, "learner");
    await learner.page.goto(`/course/${c.id}/assignments/${late.content_id}`);
    await learner.page.getByLabel(ct("assignment.responseLabel")).fill("Sorry it's late");
    await learner.page.getByRole("button", { name: ct("assignment.submit") }).click();
    await expect(learner.page.getByText(ct("assignment.submittedLate")).or(learner.page.getByText(ct("assignment.markedLate"))).first()).toBeVisible();

    await learner.page.goto(`/course/${c.id}/assignments/${closed.content_id}`);
    await expect(learner.page.getByText(ct("assignment.closed")).first()).toBeVisible();
    const refused = await fetch(`http://localhost:3100/courses/${c.id}/assignments/${closed.content_id}/submit`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await tokenFor("learner")}` }, body: JSON.stringify({ body: "Too late" }) });
    expect(refused.status).toBe(409);
    await learner.close();
  });

  test("a closed assignment's Submit button is disabled", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner"], startDate: mondayThisWeek(-2), weeks: 4 });
    const closed = await api("POST", `/courses/${c.id}/modules/${c.modules[0].id}/items`, { as: "teacher", body: { itemType: "assignment", title: "Closed poster", outcomeIds: [c.outcome.id], releaseDay: 0, dueDay: 2, closeDay: 3 } });
    const learner = await asRole(browser, "learner");
    await learner.page.goto(`/course/${c.id}/assignments/${closed.content_id}`);
    await expect(learner.page.getByText(ct("assignment.closed")).first()).toBeVisible();
    await expect(learner.page.getByRole("button", { name: ct("assignment.submit") })).toBeDisabled();
    await learner.close();
  });
});

test.describe("roles", () => {
  test("a teaching assistant can grade; an observer can only look", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner"] });
    const ta = `ta-${uid()}@e2e.test`;
    const observer = `observer-${uid()}@e2e.test`;
    await createUser({ email: ta, role: "teacher", fullName: "Tia Assistant" });
    await createUser({ email: observer, role: "scholar", fullName: "Obi Observer" });
    await api("POST", `/courses/${c.id}/people`, { as: "teacher", body: { email: ta, role: "ta" } });
    await api("POST", `/courses/${c.id}/people`, { as: "teacher", body: { email: observer, role: "observer" } });
    const token = async (email) => (await (await fetch("http://localhost:3100/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) })).json()).token;

    await api("POST", `/courses/${c.id}/assignments/${c.assignment.content_id}/submit`, { as: "learner", body: { body: "Poster" } });
    const graded = await fetch(`http://localhost:3100/courses/${c.id}/assignments/${c.assignment.content_id}/grade/${USERS.learner.email}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await token(ta)}` }, body: JSON.stringify({ grade: 7 }) });
    expect(graded.status).toBe(200);

    const obs = await token(observer);
    expect((await fetch(`http://localhost:3100/courses/${c.id}/modules`, { headers: { Authorization: `Bearer ${obs}` } })).status).toBe(200);
    const obsCtx = await browser.newContext();
    const obsPage = await obsCtx.newPage();
    await obsPage.addInitScript((tok) => { localStorage.setItem("st", tok); localStorage.setItem("somabox_tour_seen_v1", "1"); }, obs);
    await obsPage.goto(`/course/${c.id}/assignments/${c.assignment.content_id}`);
    await expect(obsPage.getByText(ct("assignment.observerNote"))).toBeVisible();
    await expect(obsPage.getByRole("button", { name: ct("assignment.submit") })).toHaveCount(0);
    await obsCtx.close();
    // An observer can't grade.
    const obsGrade = await fetch(`http://localhost:3100/courses/${c.id}/assignments/${c.assignment.content_id}/grade/${USERS.learner.email}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${obs}` }, body: JSON.stringify({ grade: 1 }) });
    expect(obsGrade.status).toBeGreaterThanOrEqual(400);
  });

  test("an observer can't hand in work", async () => {
    const c = await seedCourse({ learners: [] });
    const observer = `observer-${uid()}@e2e.test`;
    await createUser({ email: observer, role: "scholar", fullName: "Obi Observer" });
    await api("POST", `/courses/${c.id}/people`, { as: "teacher", body: { email: observer, role: "observer" } });
    const obs = (await (await fetch("http://localhost:3100/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: observer, password: PASSWORD }) })).json()).token;
    const submit = await fetch(`http://localhost:3100/courses/${c.id}/assignments/${c.assignment.content_id}/submit`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${obs}` }, body: JSON.stringify({ body: "x" }) });
    expect(submit.status).toBeGreaterThanOrEqual(400);
  });
});

test.describe("joining", () => {
  test("a learner joins with a code from My courses", async ({ browser }) => {
    const c = await seedCourse({ learners: [] });
    const { code } = await api("POST", `/courses/${c.id}/join-code`, { as: "teacher", body: { action: "on" } });
    const learner = await asRole(browser, "learner2");
    await learner.page.goto("/manage/scholar-dashboard/courses");
    await learner.page.getByRole("button", { name: "Join a course" }).click();
    await learner.page.getByRole("textbox").last().fill(code);
    await learner.page.getByRole("button", { name: /^Join$/ }).last().click();
    await learner.page.waitForURL(`**/course/${c.id}/**`, { timeout: 5_000 });
    await learner.close();
  });
});

test.describe("admin: one user", () => {
  test.use({ storageState: authFile("admin") });

  test("shows the user's courses and downloads their data", async ({ page }) => {
    const c = await seedCourse({ title: `Admin view ${uid()}`, learners: ["learner2"] });
    const { users } = await api("GET", `/users?search=${encodeURIComponent(USERS.learner2.email)}`, { as: "admin" });
    await page.goto(`/manage/admin/users/${users[0].id}`);
    await expect(page.getByText(USERS.learner2.name).first()).toBeVisible();
    await expect(page.getByText(c.title).first()).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: t("admin.user.downloadData") }).click();
    expect((await download).suggestedFilename()).toMatch(/\.json$/);
    await page.getByText(t("admin.user.backToUsers")).click();
    await page.waitForURL("**/manage/admin");
  });
});
