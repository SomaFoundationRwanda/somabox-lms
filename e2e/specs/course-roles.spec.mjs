// What each person sees in a course: learners reach only what's open to them, people outside a
// course are told how to get in, assistants teach but don't run the course, observers only read,
// and teachers see the quiz answer key.
import { test, expect } from "@playwright/test";
import { api, createUser, uid } from "../support/api.mjs";
import { PASSWORD, USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { seedCourse } from "../support/seed.mjs";
import { login } from "../support/ui.mjs";

const ct = (key, vars) => t(`course.${key}`, vars);

async function asRole(browser, role) {
  const ctx = await browser.newContext({ storageState: authFile(role) });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

/** A fresh account, signed in, with the profile form done (so pages aren't covered by it). */
async function asNewUser(browser, { role, courseId, courseRole }) {
  const email = `roles-${uid()}@e2e.test`;
  await createUser({ email, role, fullName: `Roles ${courseRole || role}` });
  const tok = (await (await fetch("http://localhost:3100/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) })).json()).token;
  await api("PATCH", "/users/profile/update", { token: tok, body: { gender: "female", disabilityStatus: "none", gradeLevel: "Primary 4", completeProfile: true } });
  if (courseRole) await api("POST", `/courses/${courseId}/people`, { as: "teacher", body: { email, role: courseRole } });
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem("somabox_tour_seen_v1", "1"));
  const page = await ctx.newPage();
  await login(page, email, PASSWORD);
  await page.waitForURL((url) => !url.pathname.endsWith("/"));
  return { page, close: () => ctx.close() };
}

test("a learner gets a clear 'not open' page for staff sections, and My progress instead of Insights", async ({ browser }) => {
  const c = await seedCourse({ learners: ["learner"] });
  const learner = await asRole(browser, "learner");
  const { page } = learner;

  await page.goto(`/course/${c.id}/settings`);
  await expect(page.getByRole("heading", { name: ct("access.sectionTitle") })).toBeVisible();
  await expect(page.getByRole("button", { name: ct("settings.saveNav") })).toHaveCount(0);
  await page.getByRole("link", { name: ct("access.backToCourse") }).click();
  await page.waitForURL(`**/course/${c.id}/home`);

  for (const section of ["files", "collaborations", "rubrics"]) {
    await page.goto(`/course/${c.id}/${section}`);
    await expect(page.getByRole("heading", { name: ct("access.sectionTitle") })).toBeVisible();
    await expect(page.getByRole("button", { name: /Retry/ })).toHaveCount(0);
  }

  await page.goto(`/course/${c.id}/insights`);
  await page.waitForURL(`**/course/${c.id}/progress`);
  // The menu has none of the staff sections.
  const menu = page.getByRole("navigation", { name: ct("nav.courseNavigation") });
  for (const key of ["settings", "insights", "rubrics"]) await expect(menu.getByRole("link", { name: ct(`nav.${key}`), exact: true })).toHaveCount(0);
  await learner.close();
});

test("someone outside a course can join a public one from its page; a private one says how to get in", async ({ browser }) => {
  const pub = await seedCourse({ title: `Open to all ${uid()}`, learners: [], visibility: "public" });
  const priv = await seedCourse({ learners: [] });
  const outsider = await asNewUser(browser, { role: "scholar" });
  const { page } = outsider;

  await page.goto(`/course/${priv.id}/home`);
  await expect(page.getByRole("heading", { name: ct("access.privateTitle") })).toBeVisible();
  await expect(page.getByRole("link", { name: ct("access.joinWithCode") })).toBeVisible();

  await page.goto(`/course/${pub.id}/home`);
  await expect(page.getByRole("heading", { name: pub.title })).toBeVisible();
  await page.getByRole("button", { name: ct("access.join") }).click();
  await page.waitForURL(`**/course/${pub.id}/home`);
  await expect(page.getByRole("navigation", { name: ct("nav.courseNavigation") })).toBeVisible();
  await outsider.close();
});

test("an assistant teaches but doesn't see Settings or the join code", async ({ browser }) => {
  const c = await seedCourse({ learners: ["learner"] });
  const ta = await asNewUser(browser, { role: "teacher", courseId: c.id, courseRole: "ta" });
  const { page } = ta;
  await page.goto(`/course/${c.id}/people`);
  const menu = page.getByRole("navigation", { name: ct("nav.courseNavigation") });
  await expect(menu.getByRole("link", { name: ct("nav.people"), exact: true })).toBeVisible();
  await expect(menu.getByRole("link", { name: ct("nav.settings"), exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: ct("people.join.title") })).toHaveCount(0);
  await expect(page.getByRole("button", { name: ct("people.addLearners") })).toBeVisible();

  await page.goto(`/course/${c.id}/settings`);
  await expect(page.getByRole("heading", { name: ct("access.sectionTitle") })).toBeVisible();
  await ta.close();
});

test("a learner's menu leaves out pages, outcomes and attendance", async ({ browser }) => {
  const c = await seedCourse({ learners: ["learner"] });
  const learner = await asRole(browser, "learner");
  await learner.page.goto(`/course/${c.id}/home`);
  const menu = learner.page.getByRole("navigation", { name: ct("nav.courseNavigation") });
  await expect(menu.getByRole("link", { name: ct("nav.grades"), exact: true })).toBeVisible();
  for (const key of ["pages", "outcomes", "attendance", "settings", "rubrics"]) {
    await expect(menu.getByRole("link", { name: ct(`nav.${key}`), exact: true })).toHaveCount(0);
  }
  // Still open from elsewhere: a page from Weeks.
  await learner.page.goto(`/course/${c.id}/pages/${c.page.content_id}`);
  await expect(learner.page.getByRole("heading", { level: 1 })).toBeVisible();
  await learner.close();
});

test("an observer reads the course but isn't offered posting, grades or attendance", async ({ browser }) => {
  const c = await seedCourse({ learners: ["learner"] });
  const observer = await asNewUser(browser, { role: "scholar", courseId: c.id, courseRole: "observer" });
  const { page } = observer;
  await page.goto(`/course/${c.id}/discussions`);
  await expect(page.getByRole("heading", { name: ct("nav.discussions") })).toBeVisible();
  await expect(page.getByRole("button", { name: ct("modules.newDiscussion") })).toHaveCount(0);
  const menu = page.getByRole("navigation", { name: ct("nav.courseNavigation") });
  await expect(menu.getByRole("link", { name: ct("nav.grades"), exact: true })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: ct("nav.attendance"), exact: true })).toHaveCount(0);

  await page.goto(`/course/${c.id}/discussions/${c.discussion.content_id}`);
  await expect(page.getByRole("button", { name: ct("discussions.reply") })).toHaveCount(0);
  await page.goto(`/course/${c.id}/home`);
  await expect(page.getByRole("link", { name: ct("nav.progress") })).toHaveCount(0);
  await observer.close();
});

test("a teacher's quiz page shows the answer key", async ({ browser }) => {
  const c = await seedCourse({ learners: [] });
  const teacher = await asRole(browser, "teacher");
  await teacher.page.goto(`/course/${c.id}/quizzes/${c.quiz.content_id}`);
  const q1 = teacher.page.getByRole("list", { name: ct("quiz.optionsFor", { n: 1 }) });
  await expect(q1.getByRole("listitem").filter({ hasText: "3/4" })).toContainText(ct("quiz.correctAnswer"));
  await expect(q1.getByRole("listitem").filter({ hasText: "2/6" })).not.toContainText(ct("quiz.correctAnswer"));
  await teacher.close();
});
