// How many requests typical days send to the box: a learner, a teacher and an admin moving through
// their usual pages, then a minute left open. Not a pass/fail test: it writes the counts to
// e2e/metrics/<label>.json (E2E_METRICS_LABEL, default "latest") so changes can be compared.
// Run: E2E_METRICS=1 pnpm exec playwright test -c e2e/playwright.config.mjs --project=metrics
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "@playwright/test";
import { API_URL, authFile } from "../support/env.mjs";
import { seedCourse } from "../support/seed.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), `${process.env.E2E_METRICS_LABEL || "latest"}.json`);
const IDLE_MS = 60_000;
const results = {};

test.describe.configure({ mode: "serial" });

// Moves inside the app, as clicking a link does (page.goto would reload it and start afresh).
async function nav(page, to) {
  await page.evaluate((path) => window.next.router.push(path), to);
  await page.waitForURL((url) => url.pathname + url.search === to);
}

// Records every request to the backend while `journey` runs: total, and per path pattern.
async function measure(browser, role, name, journey) {
  const context = await browser.newContext({ storageState: authFile(role) });
  const page = await context.newPage();
  const seen = [];
  page.on("request", (req) => {
    if (req.url().startsWith(API_URL)) seen.push(`${req.method()} ${new URL(req.url()).pathname.replace(/\/\d+(?=\/|$)/g, "/:n")}`);
  });
  const mark = () => seen.length;
  const sections = {};
  await journey(page, async (label, step) => {
    const start = mark();
    await step();
    // Settled once a second goes by with no new request (in-app navigations have no "load" to wait for).
    let last = -1;
    while (last !== mark()) { last = mark(); await page.waitForTimeout(1000); }
    sections[label] = mark() - start;
  });
  await context.close();
  const byPath = {};
  for (const r of seen) byPath[r] = (byPath[r] || 0) + 1;
  results[name] = { total: seen.length, sections, byPath: Object.fromEntries(Object.entries(byPath).sort((a, b) => b[1] - a[1])) };
}

test("learner, teacher and admin journeys", async ({ browser }) => {
  test.setTimeout(10 * 60_000);
  const c = await seedCourse({ learners: ["learner"] });

  await measure(browser, "learner", "learner", async (page, step) => {
    await step("dashboard", () => page.goto("/manage/scholar-dashboard"));
    await step("course home", () => nav(page, `/course/${c.id}/home`));
    await step("modules", () => nav(page, `/course/${c.id}/modules`));
    await step("a page", () => nav(page, `/course/${c.id}/pages/${c.page.content_id}`));
    await step("an assignment", () => nav(page, `/course/${c.id}/assignments/${c.assignment.content_id}`));
    await step("grades", () => nav(page, `/course/${c.id}/grades`));
    await step("back to dashboard", () => nav(page, "/manage/scholar-dashboard"));
    await step("idle minute on dashboard", () => page.waitForTimeout(IDLE_MS));
  });

  await measure(browser, "teacher", "teacher", async (page, step) => {
    await step("dashboard", () => page.goto("/teacher/dashboard"));
    await step("course home", () => nav(page, `/course/${c.id}/home`));
    await step("modules", () => nav(page, `/course/${c.id}/modules`));
    await step("people", () => nav(page, `/course/${c.id}/people`));
    await step("grades", () => nav(page, `/course/${c.id}/grades`));
    await step("insights", () => nav(page, `/course/${c.id}/insights`));
    await step("back to course home", () => nav(page, `/course/${c.id}/home`));
    await step("idle minute on course home", () => page.waitForTimeout(IDLE_MS));
  });

  await measure(browser, "admin", "admin", async (page, step) => {
    await step("admin home", () => page.goto("/manage/admin"));
    await step("school", () => nav(page, "/manage/admin/school"));
    await step("analytics", () => nav(page, "/manage/admin/analytics"));
    await step("back to admin home", () => nav(page, "/manage/admin"));
    await step("idle minute on admin home", () => page.waitForTimeout(IDLE_MS));
  });

  fs.writeFileSync(OUT, `${JSON.stringify(results, null, 2)}\n`);
  for (const [name, r] of Object.entries(results)) {
    console.log(`${name}: ${r.total} requests  ${Object.entries(r.sections).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  }
});
