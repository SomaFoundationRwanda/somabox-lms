// Types of graded work (the server's GRADE_CATEGORIES), in gradebook order. Work without a
// type is grouped as "other".
export const GRADE_CATEGORIES = ["preliminary_test", "remedial_test", "short_quiz", "midterm_test", "long_quiz", "general_test", "exam"];

/** "Short quizzes" etc. in the UI language; `tp` is useProgressText().tp. */
export const categoryLabel = (tp, key) => tp(`categories.${key || "other"}`);
