# Phase 6: Grading and outcome mastery

Branch: `phase-6-grading`, on top of Phase 5 (`8b85516`). This phase implements Phase 6 of the guide.

**Open decision (guide §12.8):** new quizzes still allow **unlimited attempts by default**. Teachers
can set a limit per quiz and grant individual learners extra attempts. This is recorded in the
open-issues list for us to confirm.

## Outcome results are the only source for mastery
`outcome_results` holds one row per outcome per piece of evidence, always as a percentage (0–100):

| Evidence | How each outcome's % is computed |
|---|---|
| **Rubric-graded assignment** | Each criterion linked to an outcome counts: the weighted mean of points ÷ maximum. Outcome tags no criterion covers get the overall grade %. |
| **Plain-graded assignment** (no rubric) | Every tagged outcome gets grade ÷ points possible. |
| **Graded quiz attempt** | Questions tagged with an outcome score that outcome. Untagged questions score the quiz's other outcome tags; if nothing is tagged, the whole quiz score is used. |
| **Baseline** (Phase 4) | The learner's first baseline attempt, per question tag. |
| Practice quizzes | Don't count. |

**Mastery** (`GET /outcome-mastery`, and `computeMastery` in `results.js`):
- **A learner's current mastery** is the mean of their latest result per piece of work: the latest
  attempt per quiz, and one result per assignment.
- **A class value** is the mean of the learners' values, so each learner counts once.
- **Growth** is reported against the baseline result as `deltaPoints`, plus a **normalized gain**,
  `(current − baseline) ÷ (100 − baseline)`. The gain is left blank when the baseline is 100%.
- Grades of different sizes can no longer be mixed up: everything is a percentage (guide P1-6).

## Grading
- **Rubric grading:** `PUT /assignments/:aid/grade/:email/rubric { scores: [{ criterionId, points, level? }], feedback?, reason?, source? }`.
  - Every criterion must be scored, from 0 up to its maximum.
  - The grade is points possible × the weighted mean of (points ÷ maximum).
  - Per-criterion scores are stored in `submission_scores`, with `source` = `teacher` or
    `ai_suggested_accepted` (the second is for Phase 8).
- **A rubric assignment can't be given a plain total by a teacher** (409 `RUBRIC_REQUIRED`).
  Assignments without a rubric keep plain grading.
- **Admin override:** an admin, who isn't enrolled in the course, can set any grade, but must give a
  reason.
- **Audit log:** every grade change is recorded in `grade_audit_log`, including the kind of change
  (`grade`, `rubric` or `override`), the role of the person who made it, the old and new values, and
  the reason.
- **Feedback** is kept when a regrade doesn't resend it.

## Quizzes
- Every graded attempt writes outcome results; the latest attempt is the one that counts for mastery.
- **Retakes:** `POST /quizzes/:qid/grant-attempt { scholarEmail, extra, reason }` lets a teacher give
  one learner extra attempts at a limited quiz. Grants are recorded in `quiz_attempt_grants`.
  Baseline quizzes and unlimited quizzes can't be granted.

## Due and close dates are enforced (open issue from Phase 3)
- Before the release date, learners get 409 `NOT_OPEN_YET`.
- After the due date, work is **accepted and flagged late** (`is_late` on submissions and attempts).
- After the close date, it is refused with 409 `CLOSED`.
- Teachers aren't restricted by any of these.

## Gradebook (`GET /grades`)
- **Columns:** every graded assignment (a graded discussion appears as its assignment) and graded
  quiz, in course order. Quizzes were missing before, and the old version matched grades to columns
  by position.
- **Cells:** status, points, %, late flag, attempts and feedback. Each learner's **average** is an
  equal-weight mean of their graded columns (weighting and drop-lowest are not built yet).
- **Learners** get their own row in the same format.

## Frontend
- **Assignment page, for teachers:**
  - **Rubric** section: view the rubric, or edit it (title, description, maximum, weight and outcome
    for each criterion; add, remove and reorder). Creating a rubric starts with one criterion per
    tagged outcome. This replaces the hardcoded rubric skeleton.
  - **Submissions**: each row shows a **Late** badge and the grade, and opens a grading panel. With a
    rubric, each criterion gets a score input or quick point buttons, the total updates live using the
    server's formula, and feedback is saved with it. Without a rubric, the plain grade input is used.
  - Learners who haven't submitted can still be graded, for example for oral work.
- **Assignment page, for learners:**
  - the open, due and close dates
  - submitting is disabled before the open date and after the close date
  - a notice when work is late
  - once graded: their grade, feedback and score on each rubric criterion
- **Quiz page:**
  - teachers get a **Results** table (each learner's latest attempt), with **Allow another attempt**
    on limited quizzes
  - learners see their attempt number, attempts left, a late notice, and closed / not-open messages
- **Gradebook:** columns in course order, quizzes included. The learner name column stays in place
  while the table scrolls sideways. Cells show the %, points, late and submitted markers, and each row
  has an average.
- **Outcomes page and course home:** each outcome shows "Baseline X% → Now Y% (delta) · gain N%", and
  teachers also see how many learners the figure is based on.

## Migration `0010_grading_results`
- Late flags on submissions and quiz attempts.
- A table for extra attempts teachers grant.
- The audit log now records the kind of change and the role of the person who made it.
- **Backfills `outcome_results`** from existing graded assignments and graded quiz attempts, so
  mastery history carries over to the new source.
- **Legacy `student_outcome_baselines` rows are not copied.** Before Phase 0 they could contain
  randomly generated scores. Real baselines, computed from answers since Phase 4, are already in
  `outcome_results`. The report counts the rows that were left out.

## Tests (89 backend + 7 timeline-package)
- `test/grading.test.js`:
  - **the acceptance case: changing one rubric score updates the grade, the gradebook cell and
    outcome mastery together**
  - rubric validation, and blocking plain totals on rubric assignments
  - admin override with a reason and an audit entry
  - quiz results by outcome, with the latest attempt counting and practice not counting
  - the class average and normalized gain
  - extra attempts
  - late, closed and not-yet-open
- `test/migrations.test.js`: graded work is backfilled and legacy baselines are ignored.

## Known gaps
- No admin screen for overrides yet. Admins aren't enrolled in courses, so they only reach this
  through the API. An admin course view could add it later.
- Grade weighting, drop-lowest, extensions and late penalties are not implemented. Late work is
  flagged, not penalised.
