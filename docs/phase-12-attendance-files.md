# Phase 12: Attendance, files need an account, cloud retention

Branch: `phase-12-attendance-files`, on top of Phase 11 (`6f7ca8d`). Decisions taken by the school
owner on 2026-10-08:
- **Attendance is in scope.**
- **Files can't be viewed without logging in.** Guests may explore the catalogue and are asked to
  sign up, because the school needs the demographic data that signing up collects.
- **The cloud keeps synced records indefinitely.**

## Attendance
- **Migration 0017:**
  - `attendance_sessions`: a course, a date, and a name, default "Class", so one day can have
    "Morning" and "Afternoon".
  - `attendance_records`: one per learner per session, with status `present`, `late`, `absent` or
    `excused`, an optional note, and who marked it.
  - **Keyed by user id**, not email.
  - Synced to the cloud like grades, under a new `attendance` scope switch, on by default.
  - A new **Attendance** nav item. Learners can see it by default, to view their own record.
- **Rules** (`services/courses/attendance.js`):
  - Present and late count as attending.
  - Excused sessions don't count either way.
  - An unmarked learner isn't counted. Nothing is invented.
  - Rate = attended ÷ counted.
  - The current run of consecutive absences is tracked; excused sessions don't break it.
- **Routes:**
  - Course staff:
    - list sessions with counts, plus a summary for each learner
    - open a register for a date (not in the future) and name; 409 points to an existing one
    - read the register: the roster with statuses
    - save marks: a batch, where null clears a mark
    - rename or move a session, or delete it
  - Admins can read, but not mark.
  - Learners get `GET /courses/:id/attendance/me`.
- **Insights:**
  - **New risk reasons:**
    - "Absent for the last N sessions", from 3 in a row
    - "Attended N% of M sessions", below 80% once at least 3 sessions are counted
  - The class attendance rate, and attendance in each learner row.
  - My progress and the personal data export include attendance.
- **Screens:**
  - **Teachers:** a phone-first register: 48 px status buttons in a radio group, "Mark everyone
    present", notes, and a sticky Save that sends only changes. Also the register history (rename,
    move, delete), and a learner table sorted by lowest rate with flags.
  - **Learners:** "My attendance", worded encouragingly. "Not marked" is never shown as absent.
  - **Insights:** the Class figure, a Learners column, and the learner detail.

## Files need an account; guests can explore
- **How files are checked** (`helpers/media.js`):
  - Signing in or signing up also sets a signed, HttpOnly, SameSite=Lax media cookie, valid 12 h.
    The app renews it on load and every 6 h (`POST /auth/media-session`). Logging out clears it.
  - `<video>`, `<img>`, iframes and the PDF/EPUB viewers send it automatically.
- **These now answer 401 `LOGIN_REQUIRED` without it:**
  - Khan Academy, W3Schools, Wikipedia
  - lessons
  - content files (`/content/files/*`, `/content/content/:slug`)
  - library books
  - course files
- **Course files** are also limited to members of that course: teachers, admins, and its learners
  once the course is open.
- **This fixes a Phase 11 regression:** content files had stopped opening in the player, because
  they were taken off the public list without a cookie alternative.
- **Guests may browse:**
  - content categories and levels, the library list, and public courses
  - covers
- **Guest mode in the app:**
  - `/home`, the content browser, `/library` and `/discover-courses` work without an account, with a
    light guest navigation and a banner.
  - Opening anything shows "Create a free account to open this", with Sign up and Log in.
  - After signing up, the person is returned to what they wanted.
  - Every other page sends guests to log in and brings them back afterwards.
- **The profile step after signup now collects demographics properly:**
  - Rural/urban and disability must be chosen. Before, an unticked box saved "urban", and
    "no disability" was preselected.
  - The server records when someone completed the profile with explicit answers
    (`users.profile_completed_at`, migration 0018). A flag on the device can no longer skip it.
  - **Existing accounts are asked once** to confirm their details; admins aren't asked.
  - The inclusivity (gap) report counts only learners who answered themselves, and also reports
    how many that is.

## Cloud retention
The cloud keeps records indefinitely. This is documented in the backend README and the gap report
(§12.10). The box's own usage-log retention is unaffected.

## Tests (140 backend, 7 timeline, 4 gateway, plus the translation checks)
- **`test/attendance.test.js` (3):**
  - register rules and permissions
  - rate arithmetic and flags in Insights, My progress and the learner's own view
  - empty course, nav visibility, sync and export
- **`test/files.test.js` (4):**
  - guests browse but can't open files
  - the cookie is set at sign-in and opens files; a forged or expired cookie doesn't; it renews
  - course files open only for members
  - profile completion needs explicit answers
- **Existing tests updated:** the access-policy table, the learner allowlist, and the library path
  check (now signed in).

## Known gaps
- **Wikipedia and Kolibri on separate servers:** the frame page loads them from
  `http://10.0.0.1:8083` and `:8081`. The app asks guests to sign up first, but those servers aren't
  behind the API, so the cookie can't protect them. They need a reverse proxy through the API, or a
  network rule.
- **Course file links open in a new tab.** If the cookie has expired (more than 12 h without the app
  open), the tab shows a JSON error instead of the sign-in prompt.
- **Kinyarwanda:** the attendance and guest screens are in English; French, Swahili and Spanish are
  translated.
- **None of this has been used in a browser yet.**
