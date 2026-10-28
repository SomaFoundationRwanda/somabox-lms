// The features added together on fix/current-branch, each walked through as the people who use
// it: groups and group work, grades (types, hidden scores, the 100% total, the feedback drawer),
// announcements, teacher-only discussions, drafts and the unsaved-changes guard, celebrations,
// week dates and the back button. Each screen is also checked for wording meant for the other
// role (a learner never reads teacher instructions; a teacher never reads "your teacher...").
import { test, expect } from "@playwright/test";
import { api, uid } from "../support/api.mjs";
import { USERS, authFile } from "../support/env.mjs";
import { t } from "../support/i18n.mjs";
import { mondayThisWeek, seedCourse } from "../support/seed.mjs";

test.use({ storageState: authFile("teacher") });

const ct = (key, vars) => t(`course.${key}`, vars);
const pt = (key, vars) => t(`progress.${key}`, vars);

async function asRole(browser, role) {
  const ctx = await browser.newContext({ storageState: authFile(role) });
  return { page: await ctx.newPage(), close: () => ctx.close() };
}

// Text that only makes sense to the other role must not be on the page.
async function expectNone(page, texts) {
  for (const text of texts) await expect(page.getByText(text, { exact: true })).toHaveCount(0);
}

test.describe("groups", () => {
  test("the teacher makes a group; only its members see it, its work and its discussion", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner", "learner2"] });
    const teacher = await asRole(browser, "teacher");
    const name = `Group ${uid()}`;
    await teacher.page.goto(`/course/${c.id}/groups`);
    await teacher.page.getByRole("button", { name: ct("groups.newGroup") }).click();
    await teacher.page.getByLabel(ct("groups.name")).fill(name);
    await teacher.page.getByRole("checkbox", { name: USERS.learner.name }).check();
    await teacher.page.getByRole("button", { name: ct("groups.create") }).click();
    const card = teacher.page.getByRole("region", { name });
    await expect(card.getByText(USERS.learner.name)).toBeVisible();
    await expect(card.getByText(USERS.learner2.name)).toHaveCount(0);

    // Work and a discussion for the group only (made through the API: their editors are tested below).
    const { groups } = await api("GET", `/courses/${c.id}/groups`, { as: "teacher" });
    const group = groups.find((g) => g.name === name);
    const work = await api("POST", `/courses/${c.id}/modules/${c.modules[0].id}/items`, {
      as: "teacher", body: { itemType: "assignment", title: `Group poster ${uid()}`, pointsPossible: 10, outcomeIds: [c.outcome.id], category: "short_quiz", groupIds: [group.id], groupSubmission: true, releaseDay: 0, dueDay: 4 },
    });
    await teacher.page.goto(`/course/${c.id}/discussions`);
    await teacher.page.getByRole("button", { name: ct("modules.newDiscussion") }).click();
    await teacher.page.getByLabel(ct("discussions.module")).selectOption({ index: 1 });
    await teacher.page.getByLabel(ct("groups.discussionGroup")).selectOption({ label: ct("groups.groupBadge", { name }) });
    const talk = `Group talk ${uid()}`;
    await teacher.page.getByLabel(ct("discussions.titleLabel")).fill(talk);
    await teacher.page.getByRole("button", { name: ct("discussions.post") }).click();
    await expect(teacher.page.getByText(talk)).toBeVisible();
    await teacher.close();

    const member = await asRole(browser, "learner");
    await member.page.goto(`/course/${c.id}/groups`);
    await expect(member.page.getByRole("region", { name })).toBeVisible();
    await expect(member.page.getByText(work.title)).toBeVisible();
    await expectNone(member.page, [ct("groups.newGroup"), ct("groups.edit"), ct("groups.delete")]);
    await member.page.goto(`/course/${c.id}/discussions`);
    await expect(member.page.getByText(talk)).toBeVisible();
    // Discussions are started by teachers only.
    await expect(member.page.getByRole("button", { name: ct("modules.newDiscussion") })).toHaveCount(0);
    await member.close();

    const outsider = await asRole(browser, "learner2");
    await outsider.page.goto(`/course/${c.id}/groups`);
    await expect(outsider.page.getByText(ct("groups.emptyLearner"))).toBeVisible();
    await expect(outsider.page.getByText(name)).toHaveCount(0);
    await outsider.page.goto(`/course/${c.id}/discussions`);
    await expect(outsider.page.getByText(c.discussion.title ?? "Where do you see fractions?").first()).toBeVisible();
    await expect(outsider.page.getByText(talk)).toHaveCount(0);
    await outsider.page.goto(`/course/${c.id}/assignments`);
    await expect(outsider.page.getByText("Fraction poster").first()).toBeVisible();
    await expect(outsider.page.getByText(work.title)).toHaveCount(0);
    await outsider.close();
  });

  test("group work: one member hands it in for everyone, and one mark goes to the whole group", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner", "learner2"] });
    const group = await api("POST", `/courses/${c.id}/groups`, { as: "teacher", body: { name: `Pair ${uid()}`, memberEmails: [USERS.learner.email, USERS.learner2.email] } });
    const groupName = group.name ?? group.group?.name;
    const work = await api("POST", `/courses/${c.id}/modules/${c.modules[0].id}/items`, {
      as: "teacher", body: { itemType: "assignment", title: `Pair poster ${uid()}`, pointsPossible: 10, outcomeIds: [c.outcome.id], category: "short_quiz", groupIds: [group.id ?? group.group?.id], groupSubmission: true, releaseDay: 0, dueDay: 4 },
    });
    const url = `/course/${c.id}/assignments/${work.content_id}`;

    const lea = await asRole(browser, "learner");
    await lea.page.goto(url);
    await expect(lea.page.getByText(ct("groupWork.learnerNote", { group: groupName, members: "" }).split(":")[0], { exact: false }).first()).toBeVisible();
    await lea.page.getByLabel(ct("assignment.responseLabel")).fill("Our poster: halves and quarters.");
    await lea.page.getByRole("button", { name: ct("assignment.submit") }).click();
    await expect(lea.page.getByText(ct("assignment.submitted")).first()).toBeVisible();
    await lea.close();

    const leo = await asRole(browser, "learner2");
    await leo.page.goto(url);
    await expect(leo.page.getByText(ct("groupWork.handedInBy", { name: USERS.learner.name, group: groupName }))).toBeVisible();
    await expect(leo.page.getByText(ct("groupWork.groupAnswer"))).toBeVisible();
    await expect(leo.page.getByText("Our poster: halves and quarters.")).toBeVisible();
    await leo.close();

    const teacher = await asRole(browser, "teacher");
    await teacher.page.goto(`/course/${c.id}/grades`);
    const book = teacher.page.getByRole("table", { name: pt("grades.gradebook") });
    for (const who of [USERS.learner.name, USERS.learner2.name]) {
      await expect(book.getByRole("link", { name: pt("grades.openWork", { name: who, item: work.title }) }).getByText(pt("common.submitted"))).toBeVisible();
    }
    // Grading one member from the gradebook marks both.
    await book.getByRole("link", { name: pt("grades.openWork", { name: USERS.learner2.name, item: work.title }) }).click();
    await expect(teacher.page.getByText(ct("groupWork.gradeNote", { group: groupName }))).toBeVisible();
    await teacher.page.getByLabel(pt("grader.gradeOutOf", { n: 10 })).fill("9");
    await teacher.page.getByRole("button", { name: pt("grader.save") }).click();
    await expect(teacher.page.getByText(pt("grader.savedFor", { name: USERS.learner2.name })).first()).toBeVisible();
    await teacher.close();

    const grades = await api("GET", `/courses/${c.id}/grades`, { as: "learner" });
    const col = grades.columns.find((x) => x.title === work.title);
    expect(grades.cells[col.key].points).toBe(9);
  });
});

test.describe("grades", () => {
  test("hidden scores: a closed eye for learners, publish from Grades, total from 100%, feedback in a drawer", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner"] });
    const title = `Midterm ${uid()}`;
    const teacher = await asRole(browser, "teacher");
    const work = await api("POST", `/courses/${c.id}/modules/${c.modules[0].id}/items`, {
      as: "teacher", body: { itemType: "assignment", title, pointsPossible: 20, outcomeIds: [c.outcome.id], category: "preliminary_test", scoresHidden: true, releaseDay: 0, dueDay: 4 },
    });
    await api("POST", `/courses/${c.id}/assignments/${work.content_id}/submit`, { as: "learner", body: { body: "My answers." } });
    await api("PATCH", `/courses/${c.id}/assignments/${work.content_id}/grade/${encodeURIComponent(USERS.learner.email)}`, { as: "teacher", body: { grade: 15, feedback: "Show your working on question 3." } });

    const learner = await asRole(browser, "learner");
    await learner.page.goto(`/course/${c.id}/grades`);
    const mine = learner.page.getByRole("table", { name: pt("grades.yourGrades") });
    const row = mine.getByRole("row").filter({ hasText: title });
    await expect(row.getByText(pt("categories.preliminary_test"))).toBeVisible();
    await expect(row.getByText(pt("grades.hiddenScore"))).toBeAttached();
    await expect(row.getByText(/15\s*\/\s*20/)).toHaveCount(0);
    // Nor in what the box sends the learner's browser.
    const hidden = await api("GET", `/courses/${c.id}/grades`, { as: "learner" });
    const hiddenCell = hidden.cells[hidden.columns.find((x) => x.title === title).key];
    expect([hiddenCell.points, hiddenCell.pct, hiddenCell.feedback]).toEqual([null, null, ""]);
    await expectNone(learner.page, [pt("grades.publishScores"), pt("grades.hideScores"), pt("grades.noType")]);
    await expect(learner.page.getByText(pt("grades.total"), { exact: true })).toBeVisible();

    // The teacher sees it hidden and publishes it.
    await teacher.page.goto(`/course/${c.id}/grades`);
    const book = teacher.page.getByRole("table", { name: pt("grades.gradebook") });
    await expect(book.getByText(pt("categories.preliminary_test"))).toBeVisible();
    await expectNone(teacher.page, [pt("grades.hiddenScore"), pt("grades.notMarkedYet"), pt("grades.totalHint")]);
    const cell = book.getByRole("link", { name: pt("grades.openWork", { name: USERS.learner.name, item: title }) });
    if (await cell.getByText(pt("common.submitted")).count()) {
      // Not marked by the API call above: mark it on the learner's own submission page.
      await cell.click();
      await teacher.page.getByLabel(pt("grader.gradeOutOf", { n: 20 })).fill("15");
      await teacher.page.getByLabel(pt("common.feedback")).fill("Show your working on question 3.");
      await teacher.page.getByRole("button", { name: pt("grader.save") }).click();
      await expect(teacher.page.getByText(pt("grader.savedFor", { name: USERS.learner.name })).first()).toBeVisible();
      await teacher.page.goto(`/course/${c.id}/grades`);
    }
    await teacher.page.getByRole("button", { name: pt("grades.publishScores") }).first().click();
    await expect(teacher.page.getByRole("button", { name: pt("grades.hideScores") }).first()).toBeVisible();

    // Search and the type filter.
    await teacher.page.getByLabel(pt("grades.searchLabel")).fill("nobody-matches");
    await expect(teacher.page.getByText(pt("grades.noMatches"))).toBeVisible();
    await teacher.page.getByLabel(pt("grades.searchLabel")).fill("");
    await teacher.page.getByLabel(pt("grades.typeFilter")).selectOption({ label: pt("categories.preliminary_test") });
    await expect(book.getByRole("link", { name: title, exact: true })).toBeVisible();
    await expect(book.getByRole("link", { name: "Fraction poster", exact: true })).toHaveCount(0);
    await teacher.close();

    await learner.page.reload();
    await expect(row.getByText("15 / 20")).toBeVisible();
    // 5 points missed out of 20 marked: 75%.
    await expect(learner.page.getByText("75%").first()).toBeVisible();
    await expect(learner.page.getByText(pt("grades.totalHint"))).toBeVisible();
    await row.getByRole("button", { name: `${pt("common.feedback")}: ${title}` }).click();
    await expect(learner.page.getByRole("dialog").getByText("Show your working on question 3.")).toBeVisible();
    await learner.close();
  });

  test("the assignment editor asks for the type of work and offers the course's groups", async ({ page }) => {
    const c = await seedCourse({ learners: ["learner"] });
    const groupName = `Team ${uid()}`;
    await api("POST", `/courses/${c.id}/groups`, { as: "teacher", body: { name: groupName, memberEmails: [USERS.learner.email] } });
    await page.goto(`/course/${c.id}/modules`);
    await page.getByRole("button", { name: ct("modules.addItem") }).first().click();
    await page.getByRole("button", { name: ct("items.assignment"), exact: true }).click();
    await page.getByRole("button", { name: ct("modules.addType.assignment") }).click();
    const type = page.locator("#assignment-category");
    await expect(type).toBeVisible();
    await expect(type.locator("option", { hasText: pt("categories.preliminary_test") })).toHaveCount(1);
    await expect(page.getByRole("group", { name: ct("groups.whoDoes") })).toBeVisible();
    await page.getByRole("checkbox", { name: groupName }).check();
    await expect(page.getByText(ct("groupWork.option"))).toBeVisible();
  });
});

test.describe("announcements", () => {
  test("an urgent announcement for one group reaches its members only, with a notification", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner", "learner2"] });
    const groupName = `Readers ${uid()}`;
    await api("POST", `/courses/${c.id}/groups`, { as: "teacher", body: { name: groupName, memberEmails: [USERS.learner.email] } });
    const title = `Trip tomorrow ${uid()}`;

    const teacher = await asRole(browser, "teacher");
    await teacher.page.goto(`/course/${c.id}/announcements`);
    await teacher.page.getByRole("button", { name: ct("announcements.new") }).click();
    await teacher.page.getByLabel(ct("announcements.titleLabel")).fill(title);
    await teacher.page.getByLabel(ct("announcements.messageLabel")).fill("Bring water.");
    await teacher.page.getByLabel(ct("announcements.category")).selectOption("custom");
    await teacher.page.getByLabel(ct("announcements.customName")).fill("School trip");
    await teacher.page.getByRole("radio", { name: ct("announcements.urgencies.urgent") }).click();
    await teacher.page.getByLabel(ct("announcements.public")).uncheck();
    await teacher.page.getByRole("checkbox", { name: groupName }).check();
    await teacher.page.getByRole("button", { name: ct("announcements.post") }).click();
    const item = teacher.page.getByRole("listitem").filter({ hasText: title });
    await expect(item.getByText(ct("announcements.urgencies.urgent"))).toBeVisible();
    await expect(item.getByText("School trip")).toBeVisible();
    await expect(item.getByText(ct("announcements.forAudience", { who: groupName }))).toBeVisible();
    await teacher.close();

    const member = await asRole(browser, "learner");
    await member.page.goto(`/course/${c.id}/announcements`);
    const seen = member.page.getByRole("listitem").filter({ hasText: title });
    await expect(seen.getByText("Bring water.")).toBeVisible();
    // Learners aren't told who else it was for, and can't pin.
    await expectNone(member.page, [ct("announcements.new"), ct("announcements.pin"), ct("announcements.forAudience", { who: groupName })]);
    const notes = await api("GET", "/notifications", { as: "learner" });
    expect(JSON.stringify(notes)).toContain(title);
    await member.close();

    const other = await asRole(browser, "learner2");
    await other.page.goto(`/course/${c.id}/announcements`);
    await expect(other.page.getByText(title)).toHaveCount(0);
    await other.close();
  });
});

test.describe("typing is kept", () => {
  test("a learner's answer survives a refresh; leaving an unsaved announcement asks first", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner"] });
    const learner = await asRole(browser, "learner");
    const url = `/course/${c.id}/assignments/${c.assignment.content_id}`;
    await learner.page.goto(url);
    const answer = `Half a pizza ${uid()}`;
    await learner.page.getByLabel(ct("assignment.responseLabel")).fill(answer);
    await learner.page.waitForTimeout(1200);
    await learner.page.reload();
    await expect(learner.page.getByLabel(ct("assignment.responseLabel"))).toHaveValue(answer);
    await expect(learner.page.getByText(t("shell.draft.restored"))).toBeVisible();

    // Handing it in clears the draft and celebrates.
    await learner.page.getByRole("button", { name: ct("assignment.submit") }).click();
    const pop = learner.page.getByRole("status").filter({ hasText: /handed in|first piece|pieces of work/i });
    await expect(pop.first()).toBeVisible();
    await expect(pop.first().getByRole("link").first()).toBeVisible();
    await learner.close();

    const teacher = await asRole(browser, "teacher");
    await teacher.page.goto(`/course/${c.id}/announcements`);
    await teacher.page.getByRole("button", { name: ct("announcements.new") }).click();
    await teacher.page.getByLabel(ct("announcements.titleLabel")).fill("Half-written");
    await teacher.page.waitForTimeout(1200);
    await teacher.page.getByRole("button", { name: ct("common.cancel") }).click();
    const ask = teacher.page.getByRole("dialog", { name: t("shell.unsaved.title") });
    await expect(ask).toBeVisible();
    await ask.getByRole("button", { name: t("shell.unsaved.keepEditing") }).click();
    await expect(teacher.page.getByLabel(ct("announcements.titleLabel"))).toHaveValue("Half-written");
    await teacher.page.reload();
    await teacher.page.getByRole("button", { name: ct("announcements.new") }).click();
    await expect(teacher.page.getByText(t("shell.draft.found").split("{time}")[0].trim(), { exact: false })).toBeVisible();
    await teacher.page.getByRole("button", { name: t("shell.draft.restore") }).click();
    await expect(teacher.page.getByLabel(ct("announcements.titleLabel"))).toHaveValue("Half-written");
    await teacher.close();
  });
});

test.describe("weeks and navigation", () => {
  test("a week's date changes from its menu; Week 1's opens the course dates", async ({ page }) => {
    const c = await seedCourse({ learners: [], weeks: 3 });
    await page.goto(`/course/${c.id}/modules`);
    const week2 = c.modules[1];
    await page.getByRole("button", { name: ct("modules.weekActions", { title: week2.title }) }).click();
    await page.getByRole("menuitem", { name: ct("modules.changeDate") }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel(ct("modules.weekStarts")).fill(mondayThisWeek(2));
    await dialog.getByRole("button", { name: ct("modules.saveDate") }).click();
    await expect(page.getByText(ct("modules.dateChanged")).first()).toBeVisible();
    const after = await api("GET", `/courses/${c.id}/modules`, { as: "teacher" });
    const list = Array.isArray(after) ? after : after.modules;
    expect(list.find((m) => m.id === week2.id).startDate.slice(0, 10)).toBe(mondayThisWeek(2));

    await page.getByRole("button", { name: ct("modules.weekActions", { title: c.modules[0].title }) }).click();
    await page.getByRole("menuitem", { name: ct("modules.changeCourseStart") }).click();
    await page.waitForURL(/\/settings/);
  });

  test("the back arrow returns to the previous course page, for learners too", async ({ browser }) => {
    const c = await seedCourse({ learners: ["learner"] });
    for (const role of ["teacher", "learner"]) {
      const who = await asRole(browser, role);
      await who.page.goto(`/course/${c.id}/assignments`);
      await who.page.getByRole("link", { name: "Fraction poster" }).first().click();
      await who.page.waitForURL(/\/assignments\/\d+/);
      await who.page.getByRole("button", { name: ct("common.back") }).first().click();
      await who.page.waitForURL(new RegExp(`/course/${c.id}/assignments$`));
      await who.close();
    }
  });
});
