// A teacher's gender and phone: the admin can enter and edit them (only male or female), and a
// teacher whose gender isn't recorded is reminded on every page until they answer.
import { test, expect } from "@playwright/test";
import { api, uid, createUser } from "../support/api.mjs";
import { PASSWORD, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { login } from "../support/ui.mjs";
import { seedCourse } from "../support/seed.mjs";

const a = (key) => t(`admin.addUser.${key}`);
const g = (key) => t(`shell.people.genders.${key}`);

async function userId(email) {
  return (await api("GET", `/users?search=${encodeURIComponent(email)}`, { as: "admin" })).users[0].id;
}

test.describe("the admin", () => {
  test.use({ storageState: authFile("admin") });

  test("enters a new teacher's gender and phone, then edits them", async ({ page }) => {
    const name = `Yannick ${uid()}`;
    const email = `${name.toLowerCase().replace(/\W+/g, "-")}@e2e.test`;
    await page.goto("/manage/admin");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await page.getByRole("button", { name: t("role.teacher"), exact: true }).click();
    await page.getByLabel(a("fullName"), { exact: true }).fill(name);
    // Only male or female are offered.
    await expect(page.getByRole("radio", { name: g("other") })).toHaveCount(0);
    await page.getByRole("radio", { name: g("male"), exact: true }).click();
    await page.getByLabel(t("admin.user.phone")).fill("0788123456");
    await page.getByLabel(a("email"), { exact: true }).fill(email);
    await page.getByLabel(a("password"), { exact: true }).fill(PASSWORD);
    await page.getByRole("button", { name: a("addTitle") }).click();
    await expect(page.getByText(a("staffCode"), { exact: true })).toBeVisible();
    await page.getByRole("button", { name: t("school.done") }).click();

    const id = await userId(email);
    await page.goto(`/manage/admin/users/${id}`);
    await expect(page.getByText(g("male"), { exact: true })).toBeVisible();
    await expect(page.getByText("0788123456")).toBeVisible();
    await expect(page.getByText(t("shell.people.notAnswered"))).toHaveCount(0);

    // Editing: the form starts from what's recorded.
    const user = await api("GET", `/users/${id}`, { as: "admin" });
    expect([user.gender, user.phone]).toEqual(["male", "0788123456"]);
    await page.goto("/manage/admin");
    await page.getByRole("textbox", { name: t("admin.users.searchLabel") }).or(page.getByPlaceholder(t("admin.users.searchPlaceholder"))).first().fill(email);
    const row = page.getByRole("table", { name: "Users" }).getByRole("row").filter({ hasText: email });
    await row.getByRole("button", { name: t("admin.users.userActions") }).click();
    await page.getByRole("menuitem", { name: t("admin.users.editProfile") }).or(page.getByRole("button", { name: t("admin.users.editProfile") })).first().click();
    await expect(page.getByRole("radio", { name: g("male"), exact: true })).toBeChecked();
    await page.getByRole("radio", { name: g("female"), exact: true }).click();
    await page.getByLabel(t("admin.user.phone")).fill("0722000111");
    await page.getByRole("button", { name: a("update") }).click();
    await expect.poll(async () => {
      const u = await api("GET", `/users/${id}`, { as: "admin" });
      return [u.gender, u.phone];
    }).toEqual(["female", "0722000111"]);
  });
});

test("a teacher without a recorded gender is reminded on every page until they answer", async ({ browser }) => {
  const email = `nogender-${uid()}@e2e.test`;
  await createUser({ email, role: "teacher", fullName: "Neza Teacher" });
  const course = await seedCourse({ learners: [] });
  await api("POST", `/courses/${course.id}/people`, { as: "teacher", body: { email, role: "teacher" } });

  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/");
  await login(page, email, PASSWORD);
  await page.waitForURL(/\/teacher\//);
  const reminder = page.getByRole("region", { name: t("teacher.genderReminder.title") });
  for (const path of ["/teacher/dashboard", "/teacher/courses", "/teacher/learners", `/course/${course.id}/home`, `/course/${course.id}/modules`]) {
    await page.goto(path);
    await expect(reminder, `reminded on ${path}`).toBeVisible();
    // It can't be dismissed: there's nothing to close it with.
    await expect(reminder.getByRole("button", { name: /dismiss|close|later/i })).toHaveCount(0);
  }
  await reminder.getByRole("button", { name: g("female"), exact: true }).click();
  await expect(reminder).toHaveCount(0);
  await page.goto("/teacher/dashboard");
  await expect(page.getByText(t("teacher.genderReminder.title"))).toHaveCount(0);

  // Settings shows the answer and keeps it changeable, with the phone next to it.
  await page.goto("/teacher/settings");
  await expect(page.getByRole("radio", { name: g("female"), exact: true })).toBeChecked();
  await page.getByLabel(t("teacher.settings.phone")).fill("0733444555");
  await page.getByRole("button", { name: t("teacher.settings.save"), exact: true }).click();
  await expect.poll(async () => (await api("GET", `/users/${await userId(email)}`, { as: "admin" })).phone).toBe("0733444555");
  await ctx.close();
});
