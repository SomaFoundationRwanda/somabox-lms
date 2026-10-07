# Phase 5: UI structure and cards

Branch: `phase-5-ui`, on top of Phase 4 (`bd46b52`). This phase implements Phase 5 of the guide.

## Cards policy
Pages are built from flat layout pieces. Cards are used **only** for:
- outcome pulse tiles on the course home page
- scholar dashboard course tiles
- library content tiles
- AI draft review items (these arrive in Phase 8)

Everything else is flat:
- one `PageHeader`
- `Section`s separated by spacing or a rule
- a single bordered `List` of rows
- a `DataTable` for tabular data
- an `EmptyState` for missing data

Nothing is boxed inside another box.

## Layout primitives (`components/layout`)
| Component | Use |
|---|---|
| `PageHeader` | Title, description, meta line and actions at the top of a page. |
| `Section` | A titled region with no border box. |
| `List` + `ListRow` | A collection of rows: icon, title or link, subtitle, meta and actions, with tone variants. |
| `DataTable` | A real `<table>`. Columns can be hidden on phones, and the table scrolls inside itself, never the page. |
| `EmptyState` | Says what's missing, why, and what to do next. The older illustrated form still works. |

## Changes
- **Course shell:** the course area is no longer a bordered card with a negative margin. On phones the
  course sidebar becomes a "Course menu" button instead of a fixed column.
- **Modules:** each module is a section with its date range and Current/Past status, and its items are
  rows in one list. Every module and item row shows a date ("Day N" until a start date is set).
- **Course home:**
  - a "Now" header band
  - "Needs attention" as a list
  - outcome pulse tiles (still cards)
  - the timeline as a list of weeks
  - the setup checklist as a flat section
- **Other course pages** use the same primitives, with tables for grades, people and rubric criteria:
  assignments, quizzes, pages, discussions, announcements, people, files, collaborations, syllabus,
  outcomes, rubrics, grades, calendar, settings and the detail pages.
- **Admin:**
  - The Users list is a table, with search, filters, sorting, pagination, bulk actions and row
    actions all unchanged.
  - The admin area had **no course list at all**, so there was nothing to convert. I added one: a
    **Courses** table on the admin dashboard with search, teacher, status, learner count and start
    date, backed by a new admin-only `GET /courses/all`, with a test and an access-policy entry.
  - Each admin page has a page header and flat sections, including the library, sync, branding,
    analytics and user detail pages.
  - Removed the now-unused `AdminOption.jsx`.
- **Setup wizard (shown inside Settings):** the grey wrapper around white cards is gone. Each step is
  one panel, and modules inside a step are plain rows.
- **Already in place from earlier phases:** Calendar is in the course menu (Phase 3), Outcomes is
  visible to students by default, and Rubrics is a read-only library (Phase 2).

## Deferred
- **Insights** in the course menu moves to Phase 9, when there is real content to show behind it. The
  nav key is already allowed (migration 0008), so adding the item is a one-line change.

## Verification
- `next build` passes.
- 81 backend tests and 7 timeline-package tests pass.
- A scan of the course and admin areas for card-style containers finds only dialogs (confirmations, the
  user profile modal) and the allowed Learning Outcomes tile.
- **Not checked in a browser.** Click through at phone and desktop widths before release, especially:
  - the modules page (drag-to-reorder still uses dnd-kit inside the new rows)
  - the phone "Course menu"
  - the admin Users table actions menu

## Small behaviour changes
- With no start date, item rows always show "Opens Day N", including day 0, so every row shows a date.
- Row action buttons are always visible on phones. On larger screens they appear on hover or keyboard
  focus.
