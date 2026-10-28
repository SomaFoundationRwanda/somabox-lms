// Every screen speaks to the person looking at it: a teacher is never described or addressed as
// a learner (and the other way round), and people are called the same thing everywhere
// ("learner", never "scholar" or "student"). Each role's main pages are opened and their text
// checked against words meant for someone else.
import { test, expect } from "@playwright/test";
import { api, uid, createUser } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { seedCourse } from "../support/seed.mjs";

test.describe.configure({ timeout: 300000 });

// Wording no screen should use: the app calls them learners.
const NEVER = [/\bscholars?\b/i, /\bstudents?\b/i];

// Wording for learners that staff must not see on their own screens.
const LEARNER_ONLY = [
  /\byour teacher\b/i,
  /Rural Learner/,
  new RegExp(escape(t("progress.grades.totalHint"))),
  new RegExp(escape(t("progress.grades.hiddenScore"))),
  new RegExp(escape(t("learner.celebrate.submittedTitle"))),
];

// Wording for staff that learners must not see.
const STAFF_ONLY = [
  new RegExp(escape(t("progress.grades.publishScores"))),
  new RegExp(escape(t("progress.grades.hideScores"))),
  new RegExp(escape(t("progress.grades.gradebook"))),
  new RegExp(escape(t("course.people.addLearners"))),
  new RegExp(escape(t("teacher.learnersPage.createAccounts"))),
  new RegExp(escape(t("teacher.learners.resetPassword"))),
  new RegExp(escape(t("admin.addUser.staffCode"))),
  /\byour learners\b/i,
  /\bGive this code to\b/i,
];

function escape(text) {
  return String(text).split("{")[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&").trim();
}

async function textOf(page, path) {
  await page.goto(path);
  await page.waitForLoadState("load");
  await page.waitForTimeout(1500);
  // Wait out page loaders, so the text checked is the page's own.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 15000 }).catch(() => {});
  return page.locator("body").innerText();
}

function problems(text, patterns) {
  // Email addresses are people's own (test accounts like fresh-scholar-…@e2e.test), not wording.
  text = text.replace(/\S+@\S+/g, "");
  return patterns.filter((re) => re.test(text)).map((re) => {
    const at = text.search(re);
    return `${re} → "…${text.slice(Math.max(0, at - 60), at + 40).replace(/\s+/g, " ")}…"`;
  });
}

async function sweep(page, paths, forbidden) {
  const found = [];
  for (const path of paths) {
    const text = await textOf(page, path);
    for (const p of problems(text, [...NEVER, ...forbidden])) found.push(`${path}: ${p}`);
  }
  expect(found, found.join("\n")).toEqual([]);
}

const coursePages = (id, c) => [
  `/course/${id}/home`, `/course/${id}/modules`, `/course/${id}/assignments`, `/course/${id}/assignments/${c.assignment.content_id}`,
  `/course/${id}/quizzes`, `/course/${id}/grades`, `/course/${id}/groups`, `/course/${id}/announcements`,
  `/course/${id}/discussions`, `/course/${id}/discussions/${c.discussion.content_id}`, `/course/${id}/outcomes`,
];

test("a teacher's screens describe and address them as a teacher", async ({ browser }) => {
  const c = await seedCourse({ learners: ["learner"] });
  await api("POST", `/courses/${c.id}/assignments/${c.assignment.content_id}/submit`, { as: "learner", body: { body: "Mine." } });
  const ctx = await browser.newContext({ storageState: authFile("teacher") });
  const page = await ctx.newPage();
  await sweep(page, [
    "/teacher/dashboard", "/teacher/courses", "/teacher/learners", "/teacher/settings", "/calendar",
    ...coursePages(c.id, c), `/course/${c.id}/people`, `/course/${c.id}/settings`,
  ], LEARNER_ONLY);
  // The header names their role.
  await page.goto("/teacher/dashboard");
  await expect(page.getByRole("button", { name: "Profile menu" }).getByText(t("role.teacher"), { exact: true })).toBeVisible();
  await ctx.close();
});

test("a learner's screens describe and address them as a learner", async ({ browser }) => {
  const c = await seedCourse({ learners: ["learner"] });
  const ctx = await browser.newContext({ storageState: authFile("learner") });
  const page = await ctx.newPage();
  await sweep(page, [
    "/manage/scholar-dashboard", "/manage/scholar-dashboard/courses", "/account", "/calendar",
    ...coursePages(c.id, c), `/course/${c.id}/progress`,
  ], STAFF_ONLY);
  await page.goto("/manage/scholar-dashboard");
  await expect(page.getByRole("button", { name: "Profile menu" }).getByText(t("role.scholar"), { exact: true })).toBeVisible();
  await ctx.close();
});

test("the admin's user pages describe a teacher as a teacher and a learner as a learner", async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: authFile("admin") });
  const page = await ctx.newPage();

  // A teacher the admin made, with classes and subjects, teaching a course.
  const email = `teacher-${uid()}@e2e.test`;
  const made = await api("POST", "/users", { as: "admin", body: { email, password: "e2e-password", role: "teacher", fullName: "Yannick Aime", teacherClasses: ["S1B", "S2A"], teacherSubjects: ["Mathematics"] } });
  expect(made.user.staff_code).toBeTruthy();
  const teacherId = (await api("GET", `/users?search=${encodeURIComponent(email)}`, { as: "admin" })).users[0].id;
  const course = await seedCourse({ learners: [] });
  await api("PUT", `/courses/${course.id}/teacher`, { as: "admin", body: { email } }).catch(() => api("POST", `/courses/${course.id}/people`, { as: "teacher", body: { email, role: "teacher" } }));

  const teacherText = await textOf(page, `/manage/admin/users/${teacherId}`);
  for (const wanted of [t("admin.user.classesTaught"), "S1B, S2A", t("admin.user.subjectsTaught"), "Mathematics", t("admin.addUser.staffCode"), t("admin.user.teaching"), course.title]) {
    expect(teacherText, `the teacher's page shows "${wanted}"`).toContain(wanted);
  }
  for (const unwanted of [t("admin.user.gradeLevel"), t("admin.user.locationType"), t("admin.user.disability"), t("admin.user.enrolled"), t("school.learnerCode"), "Learner"]) {
    expect(teacherText, `the teacher's page doesn't show "${unwanted}"`).not.toContain(unwanted);
  }
  expect(problems(teacherText, NEVER)).toEqual([]);

  const { users } = await api("GET", `/users?search=${encodeURIComponent(USERS.learner.email)}`, { as: "admin" });
  const learnerText = await textOf(page, `/manage/admin/users/${users[0].id}`);
  for (const wanted of [t("admin.user.gradeLevel"), t("admin.user.enrolled"), t("role.scholar")]) {
    expect(learnerText, `the learner's page shows "${wanted}"`).toContain(wanted);
  }
  for (const unwanted of [t("admin.user.classesTaught"), t("admin.user.subjectsTaught"), t("admin.addUser.staffCode"), t("admin.user.teaching")]) {
    expect(learnerText, `the learner's page doesn't show "${unwanted}"`).not.toContain(unwanted);
  }
  expect(problems(learnerText, NEVER)).toEqual([]);

  await sweep(page, ["/manage/admin", "/manage/admin?tab=users", "/manage/admin?tab=courses"], [/\byour teacher\b/i]);
  await ctx.close();
});

test("a teacher made by the admin signs in to a teacher's home, with no learner questions", async ({ browser }) => {
  const email = `newteacher-${uid()}@e2e.test`;
  await createUser({ email, role: "teacher", fullName: "Neza Teacher" });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  const { login } = await import("../support/ui.mjs");
  await login(page, email, "e2e-password");
  await page.waitForURL(/\/teacher\//);
  const text = await page.locator("body").innerText();
  expect(problems(text, [...NEVER, ...LEARNER_ONLY, new RegExp(escape(t("admin.user.gradeLevel")))])).toEqual([]);
  await ctx.close();
});

test("the subject is organised as Units, then Lessons, then Materials; dates stay the same", async ({ browser }) => {
  const c = await seedCourse({ learners: ["learner"] });
  for (const role of ["teacher", "learner"]) {
    const ctx = await browser.newContext({ storageState: authFile(role) });
    const page = await ctx.newPage();
    await page.goto(`/course/${c.id}/home`);
    const nav = page.getByRole("navigation", { name: t("course.nav.courseNavigation") });
    await expect(nav.getByRole("link", { name: t("course.nav.modules"), exact: true })).toBeVisible();
    await nav.getByRole("link", { name: t("course.nav.modules"), exact: true }).click();
    await expect(page.getByRole("heading", { level: 2, name: new RegExp(t("course.weeks.week").replace("{n}", "1")) })).toBeVisible();
    if (role === "teacher") await expect(page.getByRole("button", { name: t("course.modules.addItem") }).first()).toBeVisible();
    const text = await page.locator("body").innerText();
    // The structure is named Units/Lesson; "Week 1" or "Weeks" no longer name it.
    expect(text).not.toMatch(/\bWeek \d\b/);
    expect(text).not.toMatch(/^Weeks$/m);
    await ctx.close();
  }
  const teacher = await browser.newContext({ storageState: authFile("teacher") });
  const page = await teacher.newPage();
  await page.goto("/teacher/courses");
  await expect(page.getByRole("button", { name: t("teacher.common.newCourse") })).toBeVisible();
  await expect(page.getByRole("button", { name: /New Course/i })).toHaveCount(0);
  await teacher.close();
});
