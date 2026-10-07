# Phase 3: Timeline and calendar

Branch: `phase-3-timeline`, on top of Phase 2 (`1e49a96`). This phase implements Phase 3 of the guide.

Per your decision, there are **no holidays, terms or school-day rules**: dates are plain calendar
days. Holiday handling can be added later as one more input to the date calculation, without
changing the data model.

## The time model

Relative offsets are the only source of truth. Every date shown anywhere is derived from them.

| | Stored | Derived |
|---|---|---|
| Course | `start_date`, a calendar `DATE` (previously a timestamp, which could drift a day across time zones) | – |
| Module | `week_offset` (0 = baseline, 1… = regular), plus `day_offset` 0–6 | Week 1 starts on the course start date, and Week N starts 7 × (N−1) days later. The **baseline is the 7 days before Week 1**, so adding or removing a baseline never moves anything else. |
| Item | `release_day`, `due_day`, `close_day`: days after the module start. Defaults: release 0, due 6 (the end of that week), no close. | Release, due and close dates. A due date means the end of that day in `SCHOOL_TIMEZONE` (default `Africa/Kigali`). |

- **One date calculator.** `shared/timeline` (`@somabox/timeline`) is a small workspace package
  used by the backend and the frontend. It does date-only arithmetic, with no millisecond maths
  and no daylight-saving problems. Run `npm test` at the repo root to test both.
- **`due_at` is a cache.** `assignments.due_at`, `quizzes.due_at` and `modules.due_at` are
  rewritten by `refreshDueDates()` whenever a start date, module week or day, item day, or module
  membership changes. Existing readers keep working.
- **The API no longer accepts absolute due dates** (`dueAt`). Send `releaseDay`, `dueDay` and
  `closeDay` instead. A due date before the release date, or a close date before the due date,
  returns 400.
- **Item status** (`upcoming` / `open` / `past_due` / `closed`) and **module status**
  (`upcoming` / `current` / `past`) are now derived from these dates.

## Migration `0008_timeline`
- Converts course start and end dates to `DATE`, read in the school's time zone.
- **Keeps due dates teachers actually set.** Any `due_at` is converted into a `due_day` offset
  in its module (reported as `due_date_to_offset`). A date before its module started is kept at
  the default and reported.
- The old unset defaults (due day 7, close day 7, which no screen ever set) become due on day 6
  with no close.
- Pages and files have no due date.
- Folds out-of-range `day_offset` values (from the old shift tool) into the week number.
- Adds Calendar (and, for Phase 9, Insights) to the allowed course nav keys. Existing courses get a
  Calendar nav item on the next startup.

## API
- **Shift timeline:** `PATCH /courses/:id/shift-timeline { days, fromModuleId?, preview? }`.
  - Without a module, the course start moves, and everything moves with it.
  - With a module, that module and every later one move; earlier modules stay.
  - `preview: true` returns every module and due-date change without saving.
  - It refuses to move a module before Week 1.
  - The old version reused `day_offset` as a shift amount and never moved items.
- **Home loop:** rebuilt on real dates. The current week is the module whose dates contain today,
  and the "beat" comes from its items' release and due dates instead of the weekday.
  - Prepare: the week hasn't started, or items release soon but are unpublished.
  - Collect: items are open.
  - Grade: ungraded submissions.
  - Review: the week is finished.
  - New teacher alerts: no start date, items releasing soon while unpublished, items not in a week.
- **Course calendar:** `GET /courses/:id/calendar?from&to` returns module starts, release dates for
  pages and files, due and close dates for work, and links. Learners only see published items.
  - `GET /courses/:id/calendar.ics` exports the course calendar.
  - `PATCH /courses/:id/calendar/items/:moduleItemId { field, date }` is drag-to-reschedule: the date
    becomes the item's day offset. Teachers only; a date before the module starts returns 400.
- **Across courses:**
  - `GET /calendar/me` (any user) and `GET /calendar/me.ics` cover all of the user's courses.
    Learners don't see draft courses or hidden calendars.
  - `GET /calendar/school` (admins) shows module starts and due dates for every open course.
- **Module dates in the API:**
  - `GET /courses/:id/modules` now returns each module's start, end and status, and each item's
    dates, due instant and status.
  - `PATCH /modules/:id` accepts `dayOffset`.

## Frontend
- **Calendar views.**
  - Views: a course **Calendar** in the course menu; **My calendar** at `/calendar`, linked from the
    main menu and the teacher sidebar; and for admins, a **School calendar** toggle.
  - Layout: the agenda view is the default on phones and the month view (Monday first) on larger
    screens. Events are coloured by type: week start, release, due, close.
  - Export: a "Download .ics" button.
- **Teachers can reschedule from the calendar.** They drag an item to another day in the month view,
  or use a "Move" button with a date picker (a keyboard-friendly alternative to dragging). The new
  date becomes the item's day offset, and server messages (for example, "before the module starts")
  are shown.
- **Modules and items show real dates.**
  - Modules show their date range plus a "Current" or "Past" marker.
  - Items show "Opens … · Due … · Closes …" with Past due / Closed / Not open yet hints.
  - Before a start date is set, they show "Day N".
- **Editors use days, not absolute dates.** The assignment and quiz editors (and the assignment detail
  edit form) set release, due and close days, with a live preview of the resulting dates. The
  absolute due-date inputs are gone.
- **Settings.**
  - Start and end dates are plain dates, and invalid input shows the server message.
  - The new **Shift timeline** panel asks for a number of days and a starting point (the whole course
    or a module), then lets you **Preview** every module and due-date move. **Apply** is only enabled
    after a preview of the same inputs.
- **Course home.** The timeline shows each week's date range, and the current week comes from the
  server's real date.
- `lib/dates.js` formats date strings from their parts, so a viewer's time zone can never move a date
  by a day.
- **Editor fixes.** The editor dialogs no longer keep stale form contents between openings.

## Tests (72 backend + 7 timeline-package, `npm test` at the repo root)
- `shared/timeline`: month and year boundaries, leap years, daylight saving, end-of-day in a time
  zone, Week 1 and baseline placement, item status, shift normalisation.
- `test/timeline.test.js`:
  - dates follow the start date and offsets
  - **changing the start date moves every module and item date, including the cached `due_at`**
  - day validation
  - adding a baseline moves nothing
  - shift preview, apply and limits
  - **the calendar matches item dates and `due_at` exactly**
  - learner visibility
  - drag-to-reschedule
  - my, school and `.ics` calendars
  - the Home loop on real dates
- `test/migrations.test.js`: a start date stored as a timestamp becomes the right calendar date, and
  a teacher-set due date becomes the right offset.
- Every new route is in the auth policy table (it checks anonymous, wrong-role and wrong-course access).

## Known gaps
- No holidays, terms or school-day rules (your decision). Weekends count as normal days.
- `.ics` is a download, not a live subscription feed: a phone outside the school LAN can't reach the
  box anyway.
- Late-submission rules after the due date and before close (penalties, blocking) aren't enforced
  yet. Status shows `past_due` and `closed`, but submission routes don't check them (Phase 6 /
  late policy).
