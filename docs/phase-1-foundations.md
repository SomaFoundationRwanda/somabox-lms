# Phase 1: Foundations

Branch: `phase-1-foundations` (on top of Phase 0, `d6f3221`). Implements Phase 1 of the
implementation guide (v2): real sessions, auth on every route, test harness, migrations,
real transactions, and the `courses.services.js` split.

## Deploying

- Restart the backend. On startup it applies migrations `0001`–`0003` (see below) before
  serving requests.
- **Everyone is logged out once.** The old browser "session" (email/role kept in
  localStorage) is no longer accepted. Users log in again and get a server session.
- The default `admin@mail.com` / `admin` account can't do anything except change its
  password until it does (now enforced by the server, not just the UI).

## Sessions and auth

- `POST /auth/login` now returns a random bearer token. Only its SHA-256 hash is
  stored (`sessions` table). Sessions expire after 7 days, or after 12 hours with no
  requests (shared school devices). They work fully offline.
- New `GET /auth/me` (also `GET /auth/verify-auth`) and `POST /auth/logout`.
- New `POST /auth/register` for self sign-up. It **always creates a scholar**. Before,
  signup called `POST /users` and the browser chose the role, so anyone could create an admin.
- `src/helpers/auth.js` resolves the token to `req.user` on every request. The role is
  read from `users` on each request, so role changes and deactivation apply immediately.
- **Deny by default:** `src/app.js` mounts a gate in front of every API router. Without a
  session, every route returns 401 except this allowlist:
  - `POST /auth/login`, `POST /auth/register`
  - `GET /analytics/branding` (login page; sync settings are hidden from non-admins)
  - `GET /ai/health`
  - `GET /content/files/*` and `GET /library/file/:id`, because `<video>`, `<iframe>` and the
    PDF viewer can't send a token
- While `must_change_password` is set, only `/auth/me`, `/auth/logout`, `/users/profile/view`,
  `/users/profile/password` and branding are allowed (403 `PASSWORD_CHANGE_REQUIRED`).
- **Every caller-identity parameter is ignored:** `userEmail`, `teacherEmail`,
  `scholarEmail`, `adminEmail`, `senderEmail`, `currentEmail`/`currentRole`, and the
  `x-user-email`/`x-user-role` headers.
  - Where a route legitimately looks at another user, only the right roles may pass a
    target: admins on `/courses/mine?userEmail=` and the SoL routes; teachers and admins
    on analytics `scholarEmail`.

### Access policy by area
| Area | Rule |
|---|---|
| `/users` | Admin-only: list, create, edit, status, reset password, bulk, delete. Self-only: `me/*`, `profile/*`. `GET /users/:id` is admin or self, and never returns `password_hash` (it used to). Admins can't deactivate, delete, or demote themselves. A password set by an admin (create/edit/reset) forces a change at next login. Role, email, or password changes and deactivation end that user's sessions. The audit log actor is the session user, never a body field. |
| `/notifications` | Own notifications only (list, mark read, read-all). Sending is admin-only. Links must be paths inside the app (no `https://…` phishing links). |
| `/sol`, `/analytics` | Scholars see and write only their own data. Cohort and other-learner views are for teachers and admins. Inclusivity report, branding changes, and M&E sync are admin-only. |
| `/content/manager/*` | Teachers and admins. Paths are normalized and must stay inside `custom-content`. The role check runs **before** multer writes the upload to disk. |
| `/library` | Browsing is for any logged-in user. Cloud download, upload, and delete are admin-only. Book ids must be numeric (they become file names). Uploads must be PDF/EPUB. |
| `/cloud` | Admin-only. Paths must stay inside the content root (previously `POST /cloud/delete` could recursively delete any path). |
| `/ai` | Teachers and admins, from the session. The rate limit is keyed by user id. The gateway `teacher_hash` is unchanged (still from the email). |
| `/courses` | Unchanged rules (enrollment / teacher role per course), now using the session user. `POST /courses` needs a teacher or admin. Module-item edit, delete, progress, and reorder now check that the item belongs to the course in the URL (before, a teacher of one course could edit another course's items by id). |

## Frontend
- `lib/session.js` stores the token (`localStorage.st`) and wraps `window.fetch` once, so
  every backend request carries `Authorization: Bearer …` without changing each call. A 401
  logs out and returns to the login page; a pending password change goes to `/account`.
- `DataContext` loads the user from `/auth/me` and exposes `user`
  (`{ id, email, fullName, role, mustChangePassword }`), a plain `role`, `refreshUser`, and a
  `logout` that ends the server session.
- Removed the Caesar-shifted `al`/`un`/`gh` keys and the `shiftString`/`unshiftString`
  helpers from 26 files. Leftover keys are cleared at login and logout.
- `(teacher-ui)` pages previously had no login check. They now require a teacher or admin session.
- Requests no longer send the caller's own email/role as parameters (the backend ignores them
  anyway). Target parameters (admin viewing a user, grading a learner, enrolling someone) are
  kept.

## Database
- **Migrations:** `src/db/migrations/NNNN_name.js` files run once each, in order, inside a
  transaction, and are recorded in `schema_migrations`.
  - The runner is `src/db/migrate.js`. It takes a Postgres advisory lock, so two
    processes can't migrate at once.
  - `initSchemas()` is now a frozen legacy baseline. **Add new migrations; don't add ALTERs there.**
  - `0001`: Phase 0 changes moved out of `initSchemas`.
  - `0002`: the Outcomes nav reset. It used to run on **every startup** and overwrite teachers'
    choices; now it runs once.
  - `0003`: `sessions` table.
- **Real transactions:** `db.transaction(fn)` used to just call `fn`. It now runs everything
  awaited inside `fn` on one connection between `BEGIN` and `COMMIT`
  (`AsyncLocalStorage`), and rolls back on error. Nested calls join the outer transaction.
- Fixed callers that didn't `await` inside transactions (nav update, module and item
  reorder, page file references). These writes could half-apply or fail silently.
- Startup order is now explicit in `index.js`: schema → migrations → caches → listen.
  Previously this was a top-level `await` inside `content.services.js`.

## `courses.services.js` split
- The 3,000-line file is now `src/services/courses/{course,nav,people,modules,assessments,grades,content,outcomes,timeline,ai}.routes.js`.
- Shared helpers are in `src/services/courses/shared.js`, and `courses.services.js` only mounts them.
- Route code was moved verbatim. A script confirmed the same 91 routes and the same matching
  precedence, with one intentional exception below.

## Bugs found and fixed along the way
- **Module and item drag-to-reorder never worked.** `PATCH /:id/modules/reorder` and
  `/items/reorder` were registered after `/:moduleId` and `/:itemId`, so "reorder" was taken as
  an id. They are now registered first.
- **`requireNavVisible` didn't await its query.** It compared against a Promise, so hidden-section
  checks for students always failed closed.
- `scheduleSpacedReview` didn't await its existence check, so it never scheduled reviews correctly.

## Tests (`npm test` in `soma-x-backend`, 38 passing)
- `test/helpers.js`: a throwaway database per file, the **real app including the auth gate**,
  seeded users, and logged-in tokens.
- `test/auth.test.js`:
  - **Every one of the 150 API routes** must be listed in an access-policy table. A new route
    without a decided policy fails the build.
  - Every non-public route returns 401 when anonymous.
  - Admin routes return 403 for teachers and scholars, and staff routes return 403 for scholars.
  - Every `/courses/:id/*` route returns 403 for a teacher or scholar outside the course.
  - Also covered: sessions (logout, revoke, deactivation, role change, password reset),
    registration, identity spoofing via body/query, notification scoping, path traversal,
    and upload-before-auth.
- `test/db.test.js`: transaction rollback and commit, nested transactions, and migrations
  applied exactly once.
- Sanity check: with the auth gate removed, 4 tests fail.

## Known gaps (later phases)
- Static course files (`/course-files`, `/content/files`) and library files are public so
  media tags keep working. They need short-lived signed URLs (Phase 4).
- Teachers can view any learner's analytics, not just learners in their courses (Phase 9).
- Login still triggers a full Firebase user sync in the background (Phase 10 outbox).
- `ta` still counts as a teacher for course actions, and admins can use AI (open decisions in
  guide §12).
- `src/db/seed.js`, `src/scripts/seed-test-data.js` and `backfill-lesson-progress.js` are
  SQLite-era scripts that don't work against PostgreSQL (un-awaited calls, `class_*` tables).
  They should be rewritten or deleted.
- Frontend ESLint is effectively off (every file reports "no matching configuration"), so
  `next build` is the only frontend check.
- There are no frontend component tests yet. The guide's "component tests for critical screens"
  is still open.
