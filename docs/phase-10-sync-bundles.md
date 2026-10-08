# Phase 10: Sync outbox and course bundles

Branch: `phase-10-sync`, on top of Phase 9 (`60a713e`). This phase implements Phase 10 of the
guide (and P1-14).

**Decision taken by default (guide §12.10, to confirm):** these settings decide what leaves the box.
The defaults are:
- courses and outcomes, enrollments, grades and quiz results, outcome results, and usage events
  are sent
- people are sent as **anonymous IDs only**: no names, emails or demographics
- learners' written answers and teacher feedback are **not** sent

Admins can change each of these.

## Sync: scheduled outbox instead of syncing at login
**Before:** every login started a full push of every user to Firestore (P1-14). Only users were
synced, and a slow link slowed every login.

**Now:**
- **Capture by triggers:** the database captures every change to a synced table in `sync_outbox`.
  - Synced tables: `users`, `courses`, `outcomes`, `enrollments`, `assignment_submissions`,
    `submission_scores`, `grade_audit_log`, `quiz_attempts` (submitted only), `outcome_results`,
    `usage_events`.
  - Every path is covered: screens, AI drafts, bundle imports, migrations. No code can forget to
    sync.
  - Password hashes are stripped even from the local outbox.
  - Logging in, and password changes, don't create sync work.
- **Stable `sync_id` (UUID)** on every synced row, so records from many boxes never collide in the
  cloud.
- **Append-only records:** each change becomes one cloud record with its own `syncId`. Retries can't
  duplicate anything, and nothing is ever overwritten.
- **Push schedule:**
  - `src/services/sync/outbox.js` pushes every `SYNC_INTERVAL_MINUTES` (default 15), in batches.
  - While the cloud can't be reached, the wait doubles, up to 6 hours.
  - Unsent records simply wait.
  - Each run is logged in `sync_log`; sent rows are cleaned up after 30 days.
- **Scope is applied at push time:**
  - Records outside the scope are marked skipped and never leave the box.
  - With anonymous people, every email column becomes a `*_person` reference to that person's
    `sync_id`, and user records keep only id, role, grade level, active and created date.
- **Transports** (`src/services/sync/transports.js`): any HTTPS endpoint (`SYNC_URL`, with an
  optional Bearer `SYNC_TOKEN`), or Firestore with the existing service account (one document per
  record). Without either, records wait on the box.
- **The migration snapshots existing rows** into the outbox, so a box's history reaches the cloud on
  its first sync.
- **Admin routes:**
  - `GET /sync/status`
  - `POST /sync/run` ("Sync now")
  - `PUT /sync/settings { scope }`
  - `POST /analytics/me-sync` now really syncs. Before, it only stamped a time and reported success.
- `firebase-sync.service.js` is removed.

## Course bundles
- **Export:** `GET /courses/:id/bundle` (course teachers) returns the course's structure and content:
  - outcomes
  - weeks with **relative days only**
  - sub-headers, pages, quizzes with questions, assignments with rubrics, graded discussions
  - outcome links, as references inside the bundle
  - **no learner data and no dates**

  Uploaded files and the "Unassigned" module are left out, and the bundle's warnings say so.
- **Versions:**
  - A course keeps one bundle id. Its version goes up only when the content changed since the last
    export (a hash of the content, independent of key order).
  - Each version is kept in `course_bundles` and can't change: re-uploading the same id and version
    with different content is refused (409).
  - Exporting an imported copy makes a new bundle with `derivedFrom`.
- **Import:**
  - `POST /bundles/import`, or `POST /bundles/:id/courses` from the library.
  - The shape is validated first; errors give a path such as
    `modules[0].items[2].quiz.questions[0].outcomeRef`.
  - Then the course is built **with the same functions as manual creation**: `createModuleContent`
    (outcome-before-publish, schedule rules), `saveRubric` and the graded-discussion link.
  - Everything happens in one transaction: a failure part-way leaves nothing behind.
  - **The result is always a new draft course**, with the importer as its teacher, no learners and
    no start date. It never overwrites an existing course, including an edited copy of the same
    bundle; the response lists the existing copies instead.
  - Outcome codes are made unique in the new course.
- **Library** (`/bundles`, teachers and admins): upload bundle files as read-only versions, list
  them with "your copies", preview them, and create courses from them.

## Migration `0014_sync_bundles`
- `sync_id` columns
- `sync_outbox`, the `sync_enqueue()` trigger function and its triggers, and a snapshot of existing
  data
- the `box_id` and `sync_scope` settings
- the `course_bundles` table
- bundle fields on `courses`: its own bundle id, version and hash, and where an imported course came
  from

## Frontend
- **Admin Sync page:**
  - status: up to date, waiting, not set up, or retrying
  - **Sync now**, and recent runs
  - **what leaves this box**, with warnings for names/emails and written answers
- **Course Settings:** "Share this course", which exports a bundle and shows the version and
  warnings.
- **Course library:** upload, versions, preview, "Create a course from this", and your copies.
- **Learner assignment submissions are kept on the device** when the network drops, and sent when
  it's back. Re-sending is safe because the server keeps one submission per learner. Quiz submissions
  are not queued, because a retry could add an extra attempt.

## Tests (116 backend + 7 timeline)
- **`test/sync.test.js` (6):**
  - triggers capture changes with no password hashes, and login creates no sync work
  - with no cloud configured, records wait
  - pseudonymous records reach a fake cloud with no emails or essay text, people are referenced by
    `sync_id`, and nothing is sent twice
  - a cloud failure keeps records queued with the error, and they are retried
  - the scope switches (events off, full people, written answers)
  - only admins can control sync
- **`test/bundles.test.js` (4):**
  - export: relative days, references, rubric, no learner data, version bumps only on change
  - **round trip:** importing and re-exporting gives identical content, re-linked to the copy's own
    outcomes
  - re-importing makes a second copy and leaves the edited first copy alone
  - validation errors with paths; a schedule error deep inside rolls everything back
  - the library: multipart upload, 409 on changed content, creating from the library, your copies
- **Access-policy table:** includes the sync and bundle routes.

## Known gaps
- **Bundles don't carry uploaded files.** Pages that link to course files keep the link, which
  breaks on another box, and the bundle's warnings say so.
- **Distributing bundles from the cloud to boxes** (`source = 'cloud'`) is designed for but not
  built. Boxes get bundles by export and upload.
- **No cloud receiver is included.** The cloud side must store records idempotently by `syncId`.
- **The first sync of an existing box sends its whole history**, which may take several runs on a
  slow link (50 batches of 200 per run).
- A queued assignment stays in that browser's storage until it's sent. On a shared device, the next person could find it with developer tools. Queued work is only ever sent with its owner's login.
- The new screens were build-checked, never used in a browser.
