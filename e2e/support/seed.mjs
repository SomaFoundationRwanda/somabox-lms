// Builds realistic courses through the API, the same way a teacher would, so a spec can start
// from "an open course with a week of work and two learners" in a second.
import { api, uid } from "./api.mjs";
import { USERS } from "./env.mjs";

// Monday of the current week (YYYY-MM-DD), so Week 1 is "this week" and its work is current.
export function mondayThisWeek(offsetWeeks = 0) {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7);
  return d.toISOString().slice(0, 10);
}

/**
 * Creates a course owned by `teacher` with one outcome and `weeks` weeks. Week 1 gets a page,
 * an assignment, a graded quiz and a discussion (all tagged with the outcome). With open: true
 * (the default) the course is opened with its weeks published and `learners` enrolled.
 */
export async function seedCourse({
  teacher = "teacher",
  title = `Course ${uid()}`,
  open = true,
  learners = ["learner"],
  weeks = 2,
  startDate = mondayThisWeek(),
  visibility,
} = {}) {
  const as = teacher;
  const course = await api("POST", "/courses", { as, body: { title } });
  const id = course.id;
  await api("PATCH", `/courses/${id}`, { as, body: { startDate, endDate: mondayThisWeek(weeks + 1), ...(visibility ? { visibility } : {}) } });
  const outcome = await api("POST", `/courses/${id}/outcomes`, { as, body: { title: "Add fractions", description: "With unlike denominators" } });

  const modules = [];
  for (let w = 1; w <= weeks; w++) modules.push(await api("POST", `/courses/${id}/modules`, { as, body: { title: `Week ${w}` } }));

  const week1 = modules[0].id;
  const add = (body) => api("POST", `/courses/${id}/modules/${week1}/items`, { as, body: { outcomeIds: [outcome.id], ...body } });
  const page = await add({ itemType: "page", title: "Reading: what is a fraction?", body: "A fraction is part of a whole." });
  const assignment = await add({ itemType: "assignment", title: "Fraction poster", description: "Draw three fractions and label them.", pointsPossible: 10, releaseDay: 0, dueDay: 4 });
  const quiz = await add({
    itemType: "quiz", title: "Fractions check", kind: "graded",
    questions: [
      { prompt: "What is 1/2 + 1/4?", options: ["3/4", "2/6", "1/8"], correctOption: "3/4", outcomeId: outcome.id },
      { prompt: "Which is bigger, 1/3 or 1/4?", options: ["1/3", "1/4"], correctOption: "1/3", outcomeId: outcome.id },
    ],
  });
  const discussion = await add({ itemType: "discussion", title: "Where do you see fractions?", body: "Share one place you used fractions this week." });

  if (open) {
    await api("POST", `/courses/${id}/baseline/skip`, { as, body: { reason: "Seeded by the e2e suite" } });
    await api("POST", `/courses/${id}/open-course`, { as, body: { publishWeeks: true } });
    for (const role of learners) {
      await api("POST", `/courses/${id}/people`, { as, body: { email: USERS[role].email, role: "student" } });
    }
  }

  return { id, title, outcome, modules, page, assignment, quiz, discussion };
}
