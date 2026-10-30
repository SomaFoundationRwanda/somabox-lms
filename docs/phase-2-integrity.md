# Phase 2: Integrity migration

Branch: `phase-2-integrity` (on top of Phase 1, `89228d0`). Implements guide §5 items 1–7
and the Phase 2 rules: every item belongs to a module, every rubric belongs to an assignment,
graded items need outcomes, and each course has at most one baseline.

Defaults taken from guide §12 (change them if you decide otherwise):
- §12.1: quizzes belong to a module.
- §12.5: shared rubrics become one copy per assignment.
- §12.8: retake limit. Existing quizzes stay **unlimited**, so behaviour doesn't change, and teachers
  can now set a limit. The default for new quizzes is still your decision.

## Deploying

Startup applies migrations `0000`, `0004`–`0007`. Afterwards, look at two tables:

- `migration_report`: every change made to existing data, for example:
  - which modules became Week 0 / baseline
  - week numbers assigned
  - items moved to "Unassigned"
  - rubric copies
- `migration_quarantine`: every row that couldn't be migrated, stored as JSON with the reason.
  These rows were removed from the live tables but never discarded.

```sql
SELECT action, COUNT(*) FROM migration_report GROUP BY action;
SELECT source_table, reason, COUNT(*) FROM migration_quarantine GROUP BY 1, 2;
```

Teachers whose courses had items in no module will see an **"Unassigned (fix me)"** module.
Those items are unpublished and the course can't (re)open until they're moved into a week.

## Migrations
| | What it does |
|---|---|
| `0000_legacy_baseline` | The old `initSchemas()` SQL, now run **once**. Previously it ran on every startup and re-created tables and columns that later migrations dropped. It is idempotent, so existing databases apply it safely. |
| `0004_lifecycle_and_quarantine` | `courses.lifecycle` (`draft` / `open` / `closed` / `archived`) replaces `status` + `is_opened`, which are backfilled and dropped. Adds `migration_report` and `migration_quarantine`. Adds `outcomes.mastery_scale`: the outcome routes already wrote it, but no schema created it, so **creating an outcome returned a 500 on any fresh database** (including the setup wizard). |
| `0005_module_ownership` | `module_id NOT NULL` on assignments, quizzes, pages and discussions, backfilled from module listings. A graded discussion's assignment uses the discussion's module. Anything else goes to a per-course "Unassigned (fix me)" module. `module_items` now has one `content_id` (replacing `item_ref_id` / `content_ref_id` / `content_ref_table`) and allows one listing per piece of content. Duplicate, dangling and cross-course listings are quarantined. `modules.kind` is `baseline` / `regular` / `unassigned`: at most one baseline per course, which is Week 0. **`week_offset` was never written by the API, so every module was week 0 and showed as "Week 1".** Regular modules are now numbered 1..n in their current order. |
| `0006_quiz_attempts` | `quizzes.kind` (`baseline` / `practice` / `graded`), `attempts_allowed` (NULL = unlimited), `time_limit_minutes`, and `quiz_questions.outcome_id`. A new `quiz_attempts` table keeps every attempt (resubmitting used to overwrite). Old submissions become attempt 1. Submissions from emails with no account are quarantined. `quiz_submissions` is now a **view** of each learner's latest attempt, so existing readers are unchanged. |
| `0007_rubrics_grading_results` | `rubrics.assignment_id NOT NULL UNIQUE`. The `rubric_criteria` table replaces the JSON column, and each criterion can point at an outcome. A rubric shared by several assignments is copied per assignment. Unlinked rubrics and rubrics with invalid JSON are quarantined. `rubric_assignment_links` is dropped. Adds `submission_scores` (per-criterion, Phase 6), `grade_audit_log`, and `outcome_results` (the only source for mastery from Phase 6 on). |

## API rules now enforced
- **Content is created only inside a module.**
  - `POST /courses/:id/assignments`, `/quizzes` and `/pages` were removed (the frontend didn't use
    them). Content is created with `POST /courses/:id/modules/:moduleId/items`.
  - `POST /discussions` requires `moduleId`. Learners can only post in published modules they can see.
  - The AI stubs use the same creation path.
- `src/services/courses/items.js` is the one place content is created, moved and deleted, so
  `content.module_id` and its listing never disagree.
  - **Moving:** `PATCH` with `moduleId` on an item, assignment or quiz moves it.
  - **Remove from module:** parks the item, unpublished, in "Unassigned".
  - **Deleting a module that has items:** returns 409.
  - **Deleting content:** removes its listing, its outcome tags, and a graded discussion's assignment.
- **Graded items need outcomes.**
  - Applies to assignments and graded or baseline quizzes. Practice quizzes and pages are exempt.
  - If one is created without outcomes, it is saved as a draft and the response includes a `notice`.
  - Publishing it through any route returns 422 `OUTCOME_REQUIRED` with a plain-language message.
  - A published graded item can't lose its last outcome.
- **Outcome tags are validated:** the item and outcome must belong to the course.
- **Learners can't see draft courses** (403 `COURSE_NOT_OPEN`, and drafts are hidden from their lists).
  The public catalog and join only accept open courses.
- **Lifecycle moves:**
  - draft → open only through Open Course.
  - open ↔ closed, then → archived.
  - Never back to draft.
- **Publishing:** a listing and its content are published together. These were two flags that could
  disagree; now any route that changes one changes both.
- **Learners can't see or submit unpublished assignments and quizzes.**
- **Quiz submissions are attempts.**
  - The attempt limit is enforced (409 `NO_ATTEMPTS_LEFT`).
  - Scores are stored as points and as a percentage.
  - The quiz detail shows attempts used and remaining.
- **Rubrics are edited on their assignment:** `GET`/`PUT`/`DELETE /courses/:id/assignments/:aid/rubric`.
  `GET /courses/:id/rubrics` is a read-only library.
- **Grading:**
  - The assignment must be in the course.
  - The learner must be a student in the course.
  - The grade must be between 0 and the points possible.
  - Every change is written to `grade_audit_log` (who, old value, new value, optional reason).
- The setup gate also blocks opening while "Unassigned" has items.

## Frontend
- **The Modules page "Add item" is the only way to create content.**
  - The Assignments, Quizzes and Pages screens are now lists, with an "Add from Modules" link for teachers.
  - New Discussion asks which module the discussion belongs to.
- **Module labels** read "Week 0 · Baseline", "Week N" or "Unassigned" (`lib/moduleLabels.js`).
  Before, every module said "Week 1".
- **The Unassigned module** is highlighted, with a note on what to do.
  "Remove from module" now explains that the item moves to Unassigned.
- **Server messages are shown instead of being ignored:**
  - the draft notice when a graded item is saved without an outcome
  - the 422 outcome message when publishing
  - "module not empty" when deleting a module
  - attempt limits
  - AI draft results
- **Module item rows** show their outcome codes. "Missing Outcome" now appears only for
  assignments and graded quizzes (it showed on every item before).
- **Assignment and quiz pages** show the real module. Moving an item to another module from the
  assignment editor now works (`moduleId` was ignored before).
- **Quiz editor:** quiz type (graded, practice or baseline) and an attempts limit.
- **Quiz page:** learners see "Attempt N of M" and can't submit once they've used every attempt.
- **Rubrics page:** a read-only library. Each rubric shows its assignment and criteria with outcome codes.
- **Course status:**
  - The course home shows the real lifecycle (Draft, Open, Closed or Archived) instead of a fixed "Active Course".
  - A learner opening a draft course sees "This course hasn't opened yet."

## Bugs fixed along the way
- **A learner's first quiz or assignment submission returned a 500 (regression from Phase 1).**
  - Cause: `scheduleSpacedReview` used a SQLite-only `DATETIME('now', ?)`.
  - Before Phase 1 the call wasn't awaited, so the error was swallowed and spaced reviews were
    never scheduled. Phase 1 awaited it, which turned it into a 500.
  - Now fixed (spaced reviews are actually scheduled) and covered by a test.
- **Creating an outcome failed** (the missing `mastery_scale` column, above).
- **Quiz questions were inserted without `await`**, so failures were ignored, and inside a
  transaction they could land after COMMIT.
- **A regular module could have no week number:** a `CHECK` that evaluates to NULL passes, so the
  constraint now says `IS NOT NULL` explicitly.

## Tests (`npm test`, 62 passing)
- `test/migrations.test.js`: runs 0005–0007 on a database seeded with legacy-shaped data.
  - The seeded data includes:
    - a baseline-titled module
    - orphan assignment and page
    - content listed twice
    - dangling and cross-course listings
    - a graded discussion
    - a shared rubric, an unlinked rubric and a rubric with invalid JSON
    - quiz submissions, including one from an email with no account
  - It checks every outcome:
    - nothing is lost (everything is either migrated or quarantined)
    - every change is reported
    - listings and `module_id` agree
    - a second run changes nothing
- `test/integrity.test.js`: lifecycle, module numbering and baseline, no-orphan creation, the
  outcome rule on every publish path, moves, removal and module delete, learner visibility,
  discussions, quiz attempts and limits, rubrics, grading bounds and audit, first submission.

## Known gaps (later phases)
- Due, release and close days sent by the editors are still ignored. The timeline model is Phase 3.
- Rubric grading UI, writing `submission_scores` and `outcome_results`, and computing mastery from
  them are Phase 6. Mastery still reads raw submissions.
- Baseline quiz scoring per outcome is Phase 4. The baseline module and question tags now exist for it.
- `ta` still counts as a teacher. Identity is still by email in older tables (guide §5.9, late phase).
