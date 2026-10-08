# Gap report (guide §11)

**State:** the end of Phase 11, branch `phase-11-hardening`.

**Method:**
- Three independent read-only audits of the whole repo, made after Phase 10:
  - the P0/P1/P2 findings and the definition of done
  - routes, metrics, orphans, AI and concurrency
  - commonly missed items, i18n, accessibility and performance
- The fixes made in Phase 11 are marked **Closed (11)**.
- Every "Closed" row names the test that proves it.

**Test suites:** `npm test` at the root passes all of these:
- backend: 133 tests on a throwaway PostgreSQL database
- the timeline package: 7
- the AI gateway: 4
- the explainer translation check and the UI translation check

**Status key:** Closed · Partial · Open · Decision (waiting on guide §12) · N/A.

**Estimates:** S is less than half a day, M is half a day to 2 days, L is more than 2 days.

---

## Triage: what to do before handing a box to a school

**Must do (blocking):**

| # | Gap | Why it blocks | Est. |
|---|---|---|---|
| B1 | **The Firebase key was never rotated** (P0-4). The key committed in `eb0f931` and pushed to GitHub is the same key still on disk: `soma-x-backend/service-account.json`, plus a copy in the untracked `apps/soma-x-backend/`. | Anyone with the repo history can write to the Firestore project. | S (user action in Google Cloud), then delete both local copies |
| B2 | **Uploaded course files are served without login.** This covers `/course-files`, `/lessons` and `/course-covers` (`src/app.js`), and `/library/file/*` (`helpers/auth.js`). File names are `timestamp-name`. | Learner-visible worksheets of draft or private courses can be fetched by URL, including from another school's course on the same box. | M: short-lived signed URLs; page bodies store file URLs, so a rewrite on read is needed |
| B3 | **Kinyarwanda UI text and explainers are untranslated**, and about 90% of UI text is hardcoded English (see i18n below). | The product is for Rwandan schools. | L, plus a native-speaking translator |
| B4 | **Most screens have never been used in a browser.** Phases 2–11 were checked by `next build` and backend tests only. This includes the setup wizard, grading, Insights, AI drafts, sync, bundles, the offline queue and the new page renderer. | Untested UI ships with bugs no backend test can find. | M: one guided click-through per role, a short checklist, and fixes |
| B5 | **The AI model has not been run with the LMS prompts.** All AI tests use fakes. | Output quality, Kinyarwanda in particular, and speed on the real box are unknown (§12.11). | S to run `node ai/scripts/structured_eval.mjs` on a box; quality review by teachers |

**Should do soon:**
- **Notifications for due-soon, graded, feedback and announcements.** No notifications are generated for them. M.
- **Per-learner extensions and accommodations** (extra time, own due dates). M.
- **An archive button.** The API supports `lifecycle: archived`, and deletes of courses with learner work now point people to it, but no screen offers it. S.
- **A soft delete or trash for items.** M.
- **Discussion moderation:** hide or delete replies, lock threads. M.
- **Identity by user id instead of email** (P1-15). L. The stopgaps are in place: email changes are carried everywhere, and deleting an account releases its places.

**Decisions waiting on you (guide §12):** see the last section. Each of them already has a working default.

---

## 1. Section 2 findings

### P0: stop-ship
| ID | Status | Evidence | Test |
|---|---|---|---|
| P0-1 fabricated outcome data | **Closed** | Baselines are computed from answers (`courses/setup.js`). Mastery reads only `outcome_results` (`courses/results.js`). No sample data anywhere. A learner dashboard "0%" with no work, which could also exceed 100%, now returns null and counts published work only (`users.service.js`) **(11)**. | `phase0.test.js` (growth-curves, inclusivity, sol, outcome-mastery empty; client baseline scores refused); `insights.test.js` "an empty course reports nulls…" |
| P0-2 no real authentication | **Closed** (files: see B2) | Hashed bearer sessions, `req.user` and role from the database on every request, a deny-by-default gate (`helpers/auth.js`). No email-identified callers left. `/ai/health` is no longer public **(11)**. | `auth.test.js` (every route has a policy; anonymous gets 401; client emails ignored; role changes apply at once) |
| P0-3 unauthenticated read endpoints | **Closed** | `requireEnrolled` on timeline, baseline and item-outcomes; class-wide data is teacher-only. | `phase0.test.js` "course read endpoints reject…", "home-loop hides class-wide…" |
| P0-4 secrets, default admin | **Partial** | The key is untracked and ignored, and its path comes from env. The default admin must change their password. | `phase0.test.js` "default admin must change password…" |
| P0-5 fake AI | **Closed** | Stubs removed. Real gateway jobs produce drafts; approval creates unpublished items. | `ai.test.js` (stubs gone; fill-week only drafts; approve gives unpublished) |
| P0-6 setup wizard unreachable | **Closed** | One `lifecycle` field. New courses are `draft`. A real open gate. | `setup.test.js`; `phase0.test.js` "a new course starts unopened…"; `integrity.test.js` lifecycle moves |

**P0-4 remaining:** rotate the key (**B1**) and delete the local copies.

**P0-5 remaining:**
- Stub items created before Phase 0 may still be published on existing boxes. Check with:

  ```sql
  SELECT course_id, title FROM quiz_questions JOIN quizzes ON quizzes.id = quiz_id
  WHERE prompt = 'Which concept is central to this week topic?'
  ```

  and pages starting with "Once upon a time". S.
- The AI assistant's "Accept & Insert" pastes text straight into a page the teacher is editing, which may already be published. There is no draft record or audit for it. M.

### P1: integrity and correctness
| ID | Status | Evidence | Test |
|---|---|---|---|
| P1-1 items not in a module | **Closed** | `module_id NOT NULL REFERENCES modules ON DELETE RESTRICT` on all content (`0005`); one `content_id` with a unique listing. | `migrations.test.js`, `integrity.test.js` |
| P1-2 standalone quizzes and assignments | **Closed** | Content is created only through module items. | `integrity.test.js` "content can only be created inside a module" |
| P1-3 standalone rubrics, no outcome link | **Closed** | `rubrics.assignment_id` NOT NULL and UNIQUE; `rubric_criteria.outcome_id`. | `integrity.test.js`, `migrations.test.js` |
| P1-4 one number per submission | **Closed** | `submission_scores`, rubric grading, and plain totals refused when a rubric exists. Replacing a rubric that has scores used to delete those scores silently; now only wording can change **(11)**. | `grading.test.js`; `hardening.test.js` "a rubric that has been used for grading keeps its scoring" |
| P1-5 quiz overwrite, no attempts | **Closed** | `quiz_attempts`, attempt limits, quiz kinds, question outcome tags. A concurrent-submit race that could bypass the limit or 500 is fixed with an advisory lock **(11)**. | `integrity.test.js`; `load.test.js` "a double-tapped quiz submit…" (fails without the lock) |
| P1-6 unit mismatch | **Closed** | Everything is stored as a percentage (CHECK 0–100). Open (unmarkable) questions no longer count as zero **(11)**. | `phase0.test.js` "outcome-mastery normalizes…"; `hardening.test.js` "open questions don't count…" |
| P1-7 Week 0 ambiguity | **Closed** | `modules.kind`, at most one baseline, `moduleWeekLabel`. | `integrity.test.js`, `timeline.test.js` |
| P1-8 two time sources | **Closed** | Offsets are the source; `due_at` is a rebuilt cache. | `timeline.test.js` |
| P1-9 shift-timeline misuse | **Closed** | Offsets rewritten in a transaction, with a preview. | `timeline.test.js`, timeline package |
| P1-10 home-loop weekday | **Partial** | The beat comes from real dates. | `timeline.test.js` "the Home loop follows real dates" |
| P1-11 date arithmetic, holidays | **Closed / N/A** | Date-only maths in the school time zone. No holidays, by your decision. | timeline package (DST, leap years) |
| P1-12 TA and admin policy | **Decision** | Admins may use AI (your decision). `ta` still counts as course staff. Phase 11 limits TAs: they can't add, change or remove teachers or TAs, and AI drafts need a teacher account. | `hardening.test.js` staff rules, AI drafts for TA learner accounts |
| P1-13 fake transactions | **Closed** | Real BEGIN/COMMIT over AsyncLocalStorage; nested calls join. | `db.test.js` |
| P1-14 Firebase sync at login | **Closed** | Trigger-fed outbox, scheduled push, scope filter. | `sync.test.js`; `load.test.js` 3,000-record backlog sent exactly once |
| P1-15 identity by email | **Open (stopgaps 11)** | New tables use `user_id`. Many older tables are keyed by email. | `hardening.test.js` "changing someone's email…", "deleting an account releases…" |
| P1-16 two progress systems | **Decision** | SoL is a separate practice stream, labelled and excluded from mastery. | `phase0.test.js` sol |

**P1-10 remaining:** any ungraded submission overrides the beat, even work that isn't overdue (`timeline.routes.js`, the comment and the query disagree). S.

**P1-12 remaining:** decide §12.2 for TAs. Until then a TA can still open, grade and delete-guarded courses. S.

**P1-15 detail:** these are still keyed by email: `enrollments`, `assignment_submissions`, `discussion_replies`, `page_views`, `module_item_progress`, `user_notifications`, the SoL tables, `grade_audit_log`, and actor columns.

**P1-15 stopgaps (11):**
- An admin email change is carried into every email column in one transaction (`helpers/identity.js`).
- Deleting an account removes its course places, so a re-registered email inherits nothing.
- Full fix: move to `user_id` foreign keys. L.

### P2: maintainability
| Bullet | Status | Notes |
|---|---|---|
| 3,000-line `courses.services.js` | Closed | Split into `services/courses/*.routes.js` (the largest is about 760 lines). |
| Dead `classes.services.js`, stale `schema.sql`, stray file | Closed | Deleted. The broken, destructive SQLite-era seed scripts (`npm run seed` deleted every user and created known-password admins) are also deleted **(11)**. |
| README out of date | Partial | It still says `npm install -g nodemon` and describes `initSchemas` loosely. S. |
| Schema changes inside `initSchemas` | Closed | Versioned migrations 0000–0016, each in a transaction (`db.test.js`, `migrations.test.js`). |
| `initSchemas` resets nav choices | Closed | Startup only inserts missing nav rows. No test that a teacher's choice survives a restart. S. |
| `nav_key` CHECK list | Closed | Calendar and Insights added and seeded. |
| Two teacher UIs | Closed / Decision | Only `(teacher-ui)` exists; `manage/teacher` redirects there. §12.6 was never formally recorded. |
| Admin analytics without data | Closed | A real school view (`insights.test.js`). |
| Zero tests | Closed (backend) / Open (frontend) | No frontend tests; ESLint effectively ignores the app. M. |
| Leftovers | Open | An untracked `apps/`, `packages/`, `.turbo/` and pnpm files from a monorepo experiment. `apps/soma-x` is a stale copy of the frontend, and `apps/soma-x-backend` holds a key copy. `better-sqlite3` is still a dependency. Delete them. S. |

### Section 13: definition of done
| Bullet | Status |
|---|---|
| No invented data; honest empty states | Closed (tests above). The unused `DummyData.jsx` is still in the file manager. S. |
| Authenticated sessions, role from the database, no secrets in the repo | **Partial**: B1, B2. |
| Every item in a module, rubric on its assignment, graded items have outcomes, one baseline; enforced in database and API | Closed. "Graded item has outcomes" is enforced at publish, in the API; drafts may lack outcomes by design. Orphaned results from deleted work are now removed by triggers **(11)**. |
| One time model | Closed. |
| New course starts as a draft, is guided, and can't open with blockers | Closed. |
| Mastery and growth only from real results, in percent | Closed. |
| AI is a draft until approved; learners and admins have no AI | **Deviation, by your decision**: admins may use AI. Learners can't. Outcome drafts (outline, rewrite) take effect on approval, because outcomes have no published state. Rubric drafts can no longer wipe scores **(11)**. |
| Explainers at every create step, in all five languages | **Partial**: Kinyarwanda falls back to English (B3). |
| Cards only where the policy allows | Unverified: manual scan only (B4). |
| Tests cover auth, integrity, the resolver and the metrics | Closed (backend). Frontend has none. |
| This report exists and is triaged | Closed. |

---

## 2. Section 11 checks

### Routes identifying the caller by an email parameter
**None.** Every guard uses the session user. Routes that take a learner's email as the **target** check that the caller may act on that learner:
- grading: course staff, or an admin with a reason
- grant-attempt
- analytics `scholarEmail`: yourself, the learner's teacher, or an admin
- sol: admin
- AI grading: course teacher with a teacher account

Tests: `auth.test.js`, `grading.test.js`, `insights.test.js`.

### Routes without an auth test
- All 189 routes have a policy and an anonymous-401 test (`auth.test.js`).
- **New (11):** `hardening.test.js` calls **every teacher-only course route as an enrolled learner** against a fully populated course. It asserts that none succeeds, apart from an explicit allowlist of learner routes.
- **Fixed (11):** two learner routes were too open.
  - `POST /courses/:id/enroll` let any logged-in user join **any** course by its guessable 6-digit code, then see the class's emails. It also re-activated switched-off places.
  - `accept-invite` didn't check that there was an invitation.

  Now a code alone opens only public, open courses. Learners no longer see classmates' emails. Test: `hardening.test.js`.
- **Public routes:** login, register (always creates learners), branding, and `/library/file/*` (B2). `/ai/health` and a dead `/content/files/` entry were removed from the public list **(11)**.

### Metric endpoints on an empty database
- Every progress metric returns null, or an explicit empty list, on an empty database:
  - growth-curves, inclusivity, sol, outcome-mastery, insights, my-progress, grades average
  - the learner dashboard **(11)**
  - the school view
- Tests cover growth-curves, inclusivity, sol, outcome-mastery and insights. Not covered: grades, the learner and quiz insight views, and `/users/me/dashboard`. S.
- **Fixed (11):**
  - The school "median time to grade" used events any role could post; it now counts staff events only.
- **Remaining:**
  - The SoL diagnostic stores a self-reported score and copies it into every subject. This is a practice stream, outside mastery. S.

### Ways to create an orphan
**Enforced by the database:**
- content needs a module (RESTRICT)
- questions, attempts, rubrics, criteria, scores and item tags cascade from their parents
- at most one baseline and one unassigned module per course
- week offsets must match the module kind

**New database triggers (11, migration 0016):**
- Deleting an attempt or submission, directly or through its quiz, assignment or course, deletes the outcome results it produced. Before, deleted work kept counting toward mastery, Insights and growth.
- Deleting a course file deletes its module listing.
- Existing leftovers are cleaned up and counted in `migration_report`.
- Repeated outcome codes (the old `OUT-1` default) are renumbered, and the code is now unique per course.
- Tests: `hardening.test.js` "deleted work stops counting…", "outcome codes are unique…".

**Paths checked:**
- UI and API creation, bundle import (one transaction; `bundles.test.js`), AI approval and sync: no orphans.
- Deleting a course file also removes the file from disk; deleting a course removes its uploads and cover **(11)**.

**Remaining:**
- `module_items.content_id`, `item_outcomes.item_id` and `outcome_results.source_id` are polymorphic, so they're kept consistent by code and triggers, not foreign keys.
- Content and its module aren't forced into the same course by a composite foreign key; the API checks it.

### AI output reachable by a learner without teacher approval
**None found.**
- Learners can't use AI tools (platform role check).
- Drafts, job results, summaries and grading suggestions are only readable by course staff with a teacher or admin **account** **(11; before, a learner account with a TA place could read them)**.
- Approved pages, quizzes, assignments, stories, discussions and weeks arrive unpublished.
- Grading suggestions only take effect when the teacher saves.

**Exceptions to know about:**
- Outcome drafts apply when approved, because outcomes have no draft state.
- The assistant's "Accept & Insert" (see P0-5).

Tests: `ai.test.js`, `hardening.test.js`.

### Concurrency
- **Many learners on one box:** 40 learners hand in an assignment and take a quiz at the same moment against a 5-connection pool. Every request succeeds, and results and Insights are exact (`load.test.js`).
- **Quiz submits:** serialised per learner and quiz (advisory lock) **(11)**.
- **Database pool:** `PGMAXCONNECTIONS` defaults to 50, with a 5 s connection wait (then the request fails with a plain message). Fine for one Node process under PostgreSQL's 100.
- **AI queue:**
  - one job at a time by default (`AI_JOB_CONCURRENCY`); the gateway allows 2 concurrent requests with a queue of 10
  - **Gap:** no per-teacher cap, so one teacher can fill the queue. S.
  - **Gap:** a gateway 503 fails the job with no retry. S.
  - **Gap:** check that llama-server's `--parallel` matches the gateway concurrency. S.
- **Sync outbox:**
  - a backlog of 3,000 records with overlapping runs is sent exactly once (`load.test.js`)
  - **Gap:** one record the cloud rejects with a 4xx blocks the queue behind it. There is no dead-letter. S–M.
  - **Gap:** records skipped because their scope was off are never resent if the scope is turned on later. S.
  - **Gap:** no alert on a growing backlog beyond the Sync page. S.
- **Assignment double-submit:** creates duplicate spaced-review rows, which inflates SoL practice counts only. S.

---

## 3. Items commonly missed
| Item | Status | Notes | Est. |
|---|---|---|---|
| Late policy and extensions | Partial | Late work is flagged, and refused after close. No penalties, no per-learner due dates. | M |
| Accommodations | Partial | Teachers can grant extra quiz attempts. No extra time, no per-learner dates. | M |
| Attendance | Missing | Not in scope so far; decide. | M |
| Question bank and cross-term reuse | Missing / Partial | Reuse is only through bundles. | L |
| Course rollover and copy | Partial | Bundles (Phase 10) don't carry uploaded files. | M |
| Grade weighting, drop-lowest | Missing | Equal-weight average. | M |
| Resubmission and regrade | Partial | A resubmission overwrites the text with no history and no "needs regrade" flag. Retakes, the audit log and admin override exist. | M |
| Scheduled announcements | Missing | Published flag only. | S |
| Notifications for due-soon and graded work | Missing | Only profile reminders and admin messages create notifications. The assignment bell polls a summary every 30 s, with one query per course. | M |
| Bulk actions | Partial | Bulk user actions and timeline shift exist. No bulk enrol (CSV), no bulk grade. | M |
| Content search | Partial | Users, library and files have search; no search inside courses. | M |
| Printable syllabus, gradebook, report card | Missing | No print views or CSV export (only `.ics`). | M |
| Backup, restore, box replacement | **Closed (11)** | `npm run backup` / `restore` / `backup:verify` (`src/scripts/backup.js`): a database dump plus uploads, a manifest with checksums, damaged backups refused, restore only into an empty database, a row-count check, and an optional new box id. Nightly pm2 job, keeps 14. Runbook in `docs/ops-backup-restore.md`. Test: `backup.test.js`, a full backup and restore onto a fresh database. | — |
| Account recovery on shared devices | Partial | An admin can reset passwords, which forces a change and revokes sessions. The offline queue is cleared on logout **(11)**. No teacher reset for their own learners. Sessions last 7 days, with a 12 h idle timeout, which is long for a shared lab. | S–M |
| Accessibility | **Partial (11)** | See below. | M |
| Low-end device performance | **Improved (11)** | See below. | — |
| Storage cleanup | **Closed (11)** | Usage logs, AI calls, sent outbox, ended sessions, old read notifications, course files and course folders on delete, and backups. | — |
| Plain-language errors | **Closed (11)** | Every unexpected 500 now shows "Something went wrong… (reference ABC123)" while the details go to the log, instead of database text (`src/app.js`). Test: `load.test.js`. | — |
| Undo for destructive actions | Partial | Confirmations everywhere. **Courses holding learners' work can't be deleted by teachers; they're told to archive instead (11).** No trash for items. | M |
| Discussion moderation | Missing | No hide, delete, lock or report. | M |
| Local-data encryption decision | Open | Not decided. The database isn't encrypted at rest. The browser keeps the session token, and possibly an unsent submission, in localStorage. | S to decide |
| Migration strategy across updates | Closed | Versioned, transactional, with an advisory lock and a migration report. No automatic pre-migration backup; do a manual backup first (runbook). | S |
| Observability offline | **Partial (11)** | `GET /health` (no login): API up, database reachable, migrations, free disk; 503 when the database is down. Plus `sync_log`, `/sync/status`, `/ai/health` and pm2 logs. No pm2 log rotation. | S |

### i18n
- **Language-file key sets are equal and checked by `npm test`**: the main UI has 104 keys (**new check, 11**) and explainers 135.
- Values identical to English: fr 12, rw 8, sw 9, es 11; mostly proper names.
- Missing keys used to render blank, and the `[...slug]` title fallback never ran. Both fixed **(11)**. `<html lang>` follows the chosen language **(11)**.
- **The real gap:** only about 14 of about 159 components use the translation hook. About 1,000 visible strings are hardcoded English, including every screen from Phases 2–10, and backend messages and notification titles are English too. **B3.**

### Accessibility (11)
**Fixed:**
- Content cards and tabs work from the keyboard.
- All icon-only buttons are labelled.
- About 70 inputs are labelled (by `aria-label`; visible labels aren't tied with `htmlFor`).
- Visible focus rings, with a global fallback.
- No text under 11px.
- The video player's dead buttons are fixed or removed.

**Remaining:**
- Contrast of `text-slate-300/400` (about 280 uses) is likely below 4.5:1.
- 10px text on teacher and admin screens.
- No automated accessibility test.
- Not checked with a screen reader.

M.

### Performance (11)
| Route | First Load JS before → after |
|---|---|
| `/course/[id]/modules` | 327 → 168 kB |
| `/course/[id]/pages/[pageId]` | 292 → 165 kB |
| `/library` | 235 → 124 kB |
| `/[...slug]` | 209 → 186 kB |
| `/home` | 201 → 178 kB |
| `/manage/admin/library` | 278 → 168 kB |
| `/manage/admin/manage-content` | 276 → 166 kB |

**What changed:**
- Editor modals, drag-and-drop and the EPUB reader load on demand.
- Pages render without the editor: a light renderer with an allowlist HTML sanitizer.
- MUI icons are replaced by lucide.
- Database indexes for daily cleanups and learner lookups (migration 0015).

**Remaining:**
- The gradebook runs 2 queries per learner per column (N+1).
- `/analytics/school` recomputes every course.
- The bell polls every 25–30 s.

M.

---

## 4. Decisions waiting on you (guide §12)
| § | Question | Default in the code now |
|---|---|---|
| 12.2 | Does `ta` count as a teacher? | Yes, for teaching. TAs can't change course staff, and AI needs a teacher account. |
| 12.3 | Parents and guardians (`observer`)? | Out of scope. The role exists, unused. |
| 12.4 | Mandatory baseline? | Skippable with a recorded reason. |
| 12.6 | Which teacher UI survives? | `(teacher-ui)`, the only one in use. |
| 12.7 | SoL: merge into outcomes, or keep separate? | Separate, labelled practice, excluded from mastery. |
| 12.8 | Retake policy, default `attempts_allowed` | Unlimited by default; a per-quiz limit, and teacher-granted extra attempts. |
| 12.10 | Which data leaves the box; cloud retention | Sent: courses, enrolments, grades, results, events, people as anonymous IDs. No names, emails or written answers. Admins can change this. Cloud retention: undecided. |
| 12.11 | AI hardware target | Not measured (B5). |
| — | Encryption at rest on the box and in the browser | Undecided. |
| — | Attendance in scope? | Not built. |
