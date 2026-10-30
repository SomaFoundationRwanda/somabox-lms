# Phase 4: Setup and opening gate

Branch: `phase-4-setup`, on top of Phase 3 (`51c765e`). This phase implements Phase 4 of the guide.

**Decision (guide §12.4):** the baseline is **skippable, but the reason is recorded** (who skipped it
and when). This follows the guide's own wording: "baseline approved or explicitly skipped". If you
want it mandatory, the change is one rule: remove the skip route and the "skipped" option.

## Opening gate (server-side)

`GET /courses/:id/setup-status` gives teachers one report: `canOpen`, `blocking`, `warnings`, a
`checklist` and the baseline state. `POST /open-course` enforces the same blocking list. Learners
only get `{ lifecycle, isOpened }`.

**Blocking** (the course can't open):
1. The course has learning outcomes.
2. A start date is set.
3. At least one week has content.
4. Nothing is left in "Unassigned (fix me)".
5. Every graded assignment and graded quiz has an outcome. Practice quizzes are exempt, and tagging a
   quiz's questions counts.
6. The baseline is approved, or skipped with a reason.

**Warnings** (shown, not blocking):
- outcomes no graded work assesses
- weeks with content that are unpublished
- assignments or quizzes with no due date
- empty weeks
- no end date, or an end date before the last week ends
- an approved baseline that doesn't cover every outcome

## Baseline (Week 0)
- `GET /courses/:id/baseline` returns:
  - status: pending, approved or skipped, plus the reason, who decided and when
  - the Week 0 module and quiz
  - question count and untagged question count
  - outcomes covered and missing
  - `canApprove` and the problems blocking approval
- **Building it.** `POST /baseline/generate { perOutcome }` creates the Week 0 module and baseline
  quiz if needed. It fills the quiz with up to N outcome-tagged multiple-choice questions per outcome,
  taken from the course's other quizzes.
- **Approving it.**
  - `POST /baseline/approve` succeeds only if every question can be scored automatically
    (multiple choice with a correct answer) and is tagged with an outcome.
  - Approval allows one attempt and publishes the quiz and the Week 0 module.
  - If the questions change while the course is still a draft, the baseline must be approved again.
- **Skipping or undoing.** `POST /baseline/skip { reason }` needs a reason of at least 10 characters.
  `POST /baseline/reset` undoes the decision, but only while the course is a draft.
- **Scoring.** A learner's per-outcome baseline is now computed from their own answers on their first
  baseline attempt: for each outcome, points earned on its questions divided by points possible. It is
  written to `student_outcome_baselines` (read by outcome mastery today) and to `outcome_results`
  (`source_type = 'baseline'`, the source for mastery from Phase 6).
- **Removed:** `POST /baseline/submit`. It stored per-outcome scores sent by the browser.
- **Question tags tag the quiz.** A quiz is now tagged with every outcome its questions are tagged with.

## Migration `0009_course_setup`
- Adds `courses.baseline_status`, `baseline_skip_reason`, `baseline_decided_by` and
  `baseline_decided_at`, with a check that a skip has a reason.
- Courses that were already open are recorded as skipped, with a reason saying they predate the
  baseline step, so nothing changes for them. These are listed in `migration_report`.
- Back-fills quiz tags from existing question tags.

## Frontend
- **Teacher home: setup card.** The setup wizard no longer replaces the home page for draft courses,
  and the "Re-open Setup Wizard" shortcut is gone. Instead, a **Course setup** card appears while the
  course is a draft, or later if anything is unfinished or there are warnings. It shows:
  - the checklist, with required steps marked and each step linking to where it's fixed
  - the warnings
  - an **Open course** button, which works only when nothing blocks and shows the server's reasons
    if opening fails
- **Settings → Course setup** (`#course-setup`) contains:
  - the same checklist
  - the **Baseline (Week 0)** panel: status, who decided and when, the skip reason, coverage by
    outcome, and the problems blocking approval
  - baseline actions: build the quiz from tagged questions, approve it, skip it with a reason, undo
    the decision while still a draft, edit the quiz, and add a Week 0 module
  - the **Guided setup** wizard, now opened from here
- **Setup wizard.** The baseline step uses the same panel, and opening the course shows the blocking
  list if it fails.
- **Quiz editor.**
  - Each question has an **Outcome** picker, and baseline quizzes show which questions qualify.
  - Fixed an older bug: removing the option marked correct, and the "suggest distractors" button,
    each made two updates from the same stale state, so one update was lost (the distractor button's
    new options disappeared).

## Tests
`test/setup.test.js` covers:
- the full blocking list on a new course
- each blocker clearing in turn, then opening
- warnings
- the minimal learner view
- baseline approval rules
- building from tagged questions, with re-approval after edits
- **the guide's "hand-calculated" acceptance case**: a baseline where Q1 (2 points) and Q2 (3 points)
  are on Fractions and Q3 (4 points) is on Decimals. A learner who gets Q1 and Q3 right gets
  Fractions 40% and Decimals 100%, in both tables and in outcome mastery. The baseline can't be
  retaken.

The migration test checks that open courses aren't blocked. In total: 80 backend tests and 7
timeline-package tests, all passing.

## Known gaps
- Course and library **files are still served without a login** so `<img>`, `<video>` and the PDF
  viewer keep working (noted in Phase 1). Signed links are harder than expected: file URLs are stored
  inside page bodies when teachers embed them, so every page would need its links rewritten when it's
  read. This needs its own focused change.
- The quiz editor's "suggest distractors" button is still a template stub that writes
  placeholder answers ("Correct Answer: … Principle"), not real AI. Phase 8 replaces it.
- Mastery still mixes raw graded work with these baselines. Moving it entirely onto `outcome_results`
  is Phase 6.
