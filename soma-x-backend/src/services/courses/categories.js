// Types of graded work (assignments and graded quizzes), in the order the gradebook lists them.
export const GRADE_CATEGORIES = ["preliminary_test", "remedial_test", "short_quiz", "midterm_test", "long_quiz", "general_test", "exam"];

export class CategoryError extends Error {
  constructor() {
    super(`category must be one of: ${GRADE_CATEGORIES.join(", ")}`);
    this.name = "CategoryError";
  }
}

/** A request's category: undefined when not given, null to clear it; throws CategoryError otherwise. */
export function parseCategory(value) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (!GRADE_CATEGORIES.includes(value)) throw new CategoryError();
  return value;
}

/**
 * Adds `category = ?` and `scores_hidden = ?` to an UPDATE's lists when the request body has
 * them. Throws CategoryError for an unknown category.
 */
export function gradingUpdates(body, updates, params) {
  const category = parseCategory(body.category);
  if (category !== undefined) { updates.push("category = ?"); params.push(category); }
  if (body.scoresHidden !== undefined) { updates.push("scores_hidden = ?"); params.push(Boolean(body.scoresHidden)); }
}
