import { test, expect } from "@playwright/test";
import { api } from "../support/api.mjs";
import { seedCourse } from "../support/seed.mjs";

test("seedCourse builds an open course the learner can see", async () => {
  const c = await seedCourse();
  const status = await api("GET", `/courses/${c.id}/setup-status`, { as: "teacher" });
  expect(status.isOpened).toBe(true);
  const mine = await api("GET", "/courses/mine", { as: "learner" });
  expect(JSON.stringify(mine)).toContain(c.title);
});
