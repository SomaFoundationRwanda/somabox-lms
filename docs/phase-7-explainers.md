# Phase 7: Explainers

Branch: `phase-7-explainers`, on top of Phase 6 (`b0dbdc9`). This phase implements guide §8 ("Explainers").

## Content (static, offline, no AI)
- **English source:** `soma-x/languages/explainers/en.js`. Each entry has **what it is**, **use it
  when** and **common mistake**, written in plain language. It covers:
  - every item type: page, assignment, quiz, file, sub-header, discussion
  - the three quiz kinds
  - every course page and concept: modules, outcomes, baseline, Unassigned, rubrics, grades,
    calendar, setup, shift timeline and more
  - the "What should I create?" helper text
- **Translations:**
  - French, Spanish and Swahili are complete (`fr.js`, `es.js`, `sw.js`, 131 keys each). They
    were drafted without a native speaker and **need review by native-speaking teachers**; the
    translator flagged terms to check, especially in Swahili.
  - **Kinyarwanda is deliberately not translated.** A weak translation would do more harm than good
    with Rwandan teachers. Until a native speaker translates `en.js`, Kinyarwanda falls back to
    English and says "Not translated yet: shown in English". It never shows a raw key.
- **How they're loaded:** each language file attaches its explainers under an `explainers` key, as
  the guide asks.
- **Translation check:** `npm test` in `soma-x` (also run by the root `npm test`) fails if a
  translated language is missing a key, has an extra key, or has an empty value. Kinyarwanda is
  listed as pending.

## Language handling
- `t()` now falls back to English when a translation is missing. Before, it returned `null`, and
  the page showed nothing.
- `explain(key)` returns the entry in the current language, or the English entry plus a flag saying
  it's a fallback.
- **The chosen language is remembered on the device.** Before, it reset to English on every reload.

## Where explainers appear
- **"What is this?"** popover (`components/help/Explainer.jsx`). It opens on click, closes on
  Escape or an outside click, and can be used from the keyboard. It appears:
  - next to every course page title, through `PageHeader help="pages.…"`
  - on **every Add-item choice** (Page, Assignment, Quiz, File, Sub-header, Discussion)
  - on the selected type's description in the Add-item drawer
  - on the Unassigned and Week 0 module headers
  - on the quiz type picker (graded, practice, baseline)
  - in Course setup, on the Baseline panel and on Shift timeline
- **Empty states** explain what the page is for (Modules, Assignments, Quizzes, Pages).
- **"What should I create?"** (`components/help/WhatShouldICreate.jsx`) on the Modules page.
  - It asks what learners should do, then which week, and opens the matching editor in that week:
    - read or watch → page
    - hand in work → assignment
    - auto-marked questions → graded quiz
    - practise without marks → practice quiz
    - talk with classmates → discussion
    - download a worksheet → file
    - organise the week → sub-header
  - New quizzes start with the chosen kind already set.
- **Who sees them:** inside a course, explainers are shown to teachers only. Learners would find
  "plan and build the course here" confusing.
- **Server rules already explain themselves** in plain language. For example, the publish rule says
  "This item has no outcome, so it can't show learner progress…", and the course-opening checks
  give each blocking reason.

## Where teachers look for help (usage events)
- **Migration `0011_usage_events`** adds an append-only `usage_events` table, which Phase 9's
  analytics will also use.
- **Logging:** `POST /analytics/events` takes batches of up to 50 events. It stores only known types
  (`explainer_opened`, `create_helper_used`), and attaches a course only if the caller is in it.
  The browser batches events (`lib/usage.js`) and sends them in the background, so the page never
  waits on them.
- **Reading:** `GET /analytics/explainer-usage` (admins) shows which explainers are opened most, and
  by how many people. Those are the places teachers are confused.

## Tests
- `test/explainers.test.js` checks:
  - events are stored
  - unknown event types are dropped
  - outsiders can't tag a course
  - batch limits are enforced
  - the admin summary is correct, and teachers can't read it
- The translation check covers French, Spanish and Swahili.
- In total: 90 backend tests, 7 timeline-package tests and the translation check, all passing.
