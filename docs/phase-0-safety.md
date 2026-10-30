# Phase 0: Safety and truth

Branch: `phase-0-safety`. Implements Phase 0 of the implementation guide (v2).

## Required manual actions

1. **Rotate the Firebase service-account key.** `soma-x-backend/service-account.json` was
   committed in `eb0f931` and pushed to GitHub, so that key must be treated as public.
   Revoke it in the Google Cloud console (IAM → Service accounts → Keys), create a new one,
   store it outside the repo, and set `FIREBASE_SERVICE_ACCOUNT_PATH` in `soma-x-backend/.env`.
   Removing the file from future commits does not remove it from git history.
2. **Set `FIREBASE_SERVICE_ACCOUNT_PATH` on every box.** Without it, cloud sync is skipped
   (with a warning) instead of reading `service-account.json` from the working directory.
3. A copy of the key also sits in the untracked `apps/soma-x-backend/` folder (left over from
   an abandoned Turborepo setup). Delete that copy.

## Changes

### No fabricated data (P0-1)
- `POST /courses/:id/baseline/submit` no longer stores random scores. It stores only
  explicit 0-100 scores, validates them all before writing, and returns 400 if none are given.
  It still trusts client-sent per-outcome scores; Phase 4 computes them server-side.
- `GET /courses/:id/outcome-mastery` no longer reports hard-coded baselines (58/60/62)
  or invented growth (+15/+18). Missing data is returned as `null`, and `delta` and `status`
  are `null` when they can't be computed. Scores are normalized to percent (assignment
  grade / points possible; quiz score / sum of question points), which partly closes P1-6.
- `GET /analytics/growth-curves` returns `[]` when there is no data, not sample records.
- `GET /analytics/inclusivity-gap` no longer counts learners without data as 70%, and no
  longer uses fallback averages, a fixed 5.8% gap, or a fixed count of 24 learners / 3 with
  accessibility needs. Groups without data report `null`.
- `GET /analytics/sol-outcomes` returned only hard-coded counts. It now counts refresher
  completions and completed spaced reviews. Principles with no data source return `null`.
- Frontend: the Outcomes page, the Home outcome pulse, `GrowthCurvesChart` and
  `InclusivityGapReport` show "No data yet" or "No data" instead of numbers. The growth chart's
  own hard-coded sample bars are gone.
- The assignment grading page's "AI Pre-fill Rubric & Feedback" button was removed. It set
  every learner's grade to 88 with canned feedback. Real grading help comes in Phase 8.

### Read endpoints require enrollment (P0-3)
- `home-loop`, `setup-status`, `baseline` and `GET item-outcomes` now require an active
  enrollment, using the existing email-based check (Phase 1 replaces this with sessions).
- `home-loop` returns ungraded counts and "missing outcome tags" warnings to teachers only.

### Secrets and the default admin (P0-4)
- `service-account.json` is no longer tracked and is listed in both `.gitignore` files. The
  key path now comes from the `FIREBASE_SERVICE_ACCOUNT_PATH` environment variable.
- New column `users.must_change_password`. The default admin is created with it set, and an
  existing `admin@mail.com` that still uses the password `admin` gets it set at startup.
  Login returns `must_change_password`. The frontend then sends the user to the Account page
  until the password is changed, and a successful change clears the flag. The new password
  must differ from the current one. This is enforced only in the frontend until Phase 1
  adds sessions.

### AI stubs create drafts only (P0-5)
- `fill-module` and `generate-story` create pages, quizzes, assignments, discussions and
  module items with `published = 0`.
- They now set `content_ref_table` and `content_ref_id`, so their items appear in module
  lists, ungraded counts and outcome checks. A startup step fills in these columns for older
  stub items that only had `item_ref_id`.
- `generate-story` escapes the teacher's text, uses `class` instead of `className`, and
  checks that the module belongs to the course.
- The stubs still return template text; Phase 8 replaces them with the real model.

### Course lifecycle and opening gate (P0-6)
- New courses are created with `status = 'unpublished'` and `is_opened = 0`, so teachers see
  the setup wizard.
- `setup-status.isOpened` now comes from `is_opened` only, and `canOpen` reflects the checks
  that are missing.
- `open-course` returns 400 with the list of missing requirements, and the wizard shows it.
- `PATCH /courses/:id` can no longer set `status = 'active'` on a course that hasn't opened.
- Courses that were already `active` before this change are marked opened at startup, so
  their teachers don't suddenly get the wizard.

### Bug found while testing
Code like `await db.prepare(...).get(id)?.c` read `.c` from the Promise before awaiting it,
so it was always `undefined`. This affected 11 places in `courses.services.js`:
- Setup counts were always 0.
- New modules and items were always placed at position 0.
- Page view and completion stats were always 0.
- The public-course total and student counts were wrong.

All 11 now use `(await ...)?.c`.

### Cleanup
- Deleted the stray file `soma-x-backend/m.initSchemas())'`.
- Deleted `classes.services.js` (not mounted, no callers).
- Deleted the stale SQLite-era `src/db/schema.sql` (no references).
- Rewrote the backend README.

### Tests
- `npm test` in `soma-x-backend` runs `test/phase0.test.js` (node:test, throwaway PostgreSQL
  database). It has 15 tests covering the points above, including that metric endpoints return
  nothing invented on an empty database.

## Known gaps left for later phases
- Users routes (`/users/:id/reset-password`, `/users/bulk-action`, etc.) have no auth checks:
  Phase 1.
- Public courses can be joined while still unopened (`POST /:id/join` doesn't check
  `is_opened`). Decide in Phase 4 whether drafts can be joined.
- `propose-outline` in the wizard still writes template outcomes straight into the live
  `outcomes` table. They aren't visible to learners until the course opens, and the teacher
  can delete them.
- AI stub items created before this change keep their old `published` value. Check courses
  for "Which concept is central to this week topic?" quizzes and "Once upon a time" pages.
- `initSchemas` still resets the outcomes nav item's position and visibility on every run (P2).
