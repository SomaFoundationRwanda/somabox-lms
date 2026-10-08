# Phase 11: Hardening, and the gap report

Branch: `phase-11-hardening`, on top of Phase 10 (`13bb157`). This phase implements Phase 11 of the
guide.

**The full audit and triage are in [`docs/99-gap-report.md`](99-gap-report.md).** This file lists
what changed.

## Backup, restore, box replacement
- `npm run backup`, `npm run restore`, and `npm run backup:verify` (`src/scripts/backup.js`).
- **A backup holds:**
  - the database dump
  - uploads: course files and covers, custom content, the library
  - a manifest with checksums
- **A restore:**
  - refuses a damaged backup, or a database that isn't empty (unless `--force`)
  - checks row counts afterwards
  - can give a copied box a new identity (`--new-box-id`)
- A nightly pm2 job (`soma-x-backup`) runs at 02:30 and keeps 14 backups. Set `BACKUP_DIR` to
  another disk.
- Runbook: [`docs/ops-backup-restore.md`](ops-backup-restore.md).

## Concurrency and load
- **Quiz submit race fixed:** submits are serialised per learner and quiz (advisory lock). Two
  simultaneous submits could produce a 500, or get past the attempt limit.
- **Load tests:**
  - 40 learners hand in work and take a quiz at the same moment on a 5-connection pool
  - six simultaneous submits on a 2-attempt quiz
  - a 3,000-record sync backlog with overlapping runs, sent exactly once

## Security and integrity fixes from the audit
- **Course codes:** a course code alone no longer lets any logged-in user into any course. Only
  public, open courses are joinable by code; a private course needs an invite.
- **Invitations:** `accept-invite` requires a real invitation. Switched-off places can't be
  re-activated by the learner.
- **Course staff:**
  - only the course teacher (not a TA) can add, change, or remove teachers and TAs
  - only teacher accounts can be made course teachers
  - the last teacher can't be removed or demoted
- **Learners don't see classmates' email addresses.**
- **Deleting an account** releases its course places, so a re-registered email inherits nothing.
- **An admin changing someone's email** is carried into every email-keyed table, in one transaction.
- **AI drafts, job results, and grading suggestions** need a teacher or admin account, not just a
  course staff place.
- **Rubrics** that have been used for grading can no longer be replaced in a way that deletes
  learners' scores. Wording can still change.
- **Deleted work stops counting:**
  - deleting attempts or submissions, directly or by cascade, deletes their outcome results
    (database triggers, migration 0016)
  - existing orphans are cleaned up
- **Open questions** in graded quizzes no longer count as zero (they can't be marked yet).
- **Outcome codes** are unique per course:
  - the old `OUT-1` default is gone
  - repeats are renumbered
  - new outcomes, AI outlines, and imports get free codes
- **Plain error messages:** unexpected server errors show a plain message with a reference, and the
  details go to the log. Database text is no longer shown.
- **Deleting courses:**
  - a course with learners' work can't be deleted by a teacher (archive it instead)
  - deleting a course or a course file removes its files from disk
  - archived courses disappear from learners' lists
- **Smaller fixes:**
  - The learner dashboard shows no progress figure instead of "0%", and can't exceed 100%.
  - The admin "median time to grade" counts staff events only.
  - `/ai/health` is no longer public, and a dead public route prefix is removed.
- **Removed:** the destructive, broken SQLite-era seed scripts.

## Operations
- **`GET /health`** (no login, no personal data): API up, database reachable, migrations applied,
  free disk. It returns 503 when the database is down.
- **Daily cleanup** also removes ended sessions and old read notifications.
- **Migration 0015:** indexes for the daily cleanups and the per-learner lookups.
- **Root `npm test`** now also runs the AI gateway tests and a UI translation-key check.

## Frontend (low-end devices, accessibility, i18n)
- **Learner bundle sizes:**

  | Route | Before | After |
  |---|---|---|
  | Modules | 327 kB | 168 kB |
  | Page view | 292 kB | 165 kB |
  | Library | 235 kB | 124 kB |

  Editor modals, drag-and-drop, and the EPUB reader load on demand. Pages render without the
  editor, through a light renderer with an allowlist HTML sanitizer. MUI icons are replaced by
  lucide.
- **Accessibility:**
  - keyboard access for cards and tabs
  - labels on icon buttons and about 70 inputs
  - visible focus rings
  - no text smaller than 11px
  - `<html lang>` follows the chosen language
- **i18n:** the missing UI keys are added, and a blank-title bug is fixed. The key sets of the five
  UI language files are checked by `npm test`.
- **Shared devices:** logging out deletes unsent offline submissions from the device, after a
  warning.
- **People page:** shows the server's reason when a change is refused, and shows emails to teachers
  only.

## Tests: 133 backend, 7 timeline, 4 gateway, plus the translation checks
New test files:
- `test/load.test.js` (5)
- `test/backup.test.js` (2)
- `test/hardening.test.js` (10). Among them, every teacher-only course route is called as an
  enrolled learner, and none may succeed.

The session cleanup is added to the retention test.
