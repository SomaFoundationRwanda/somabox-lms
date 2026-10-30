# Phase 9: Analytics and per-learner improvement

Branch: `phase-9-insights`, on top of Phase 8 (`28143cc`). This phase implements Phase 9 of the
guide (guide §10).

**Decision taken by default (guide §12.7, to confirm):** Science-of-Learning activity stays a
**separate practice stream**:
- It covers spaced reviews, refreshers, the diagnostic and `longitudinal_progress`.
- It is labelled "Practice — doesn't count toward outcome mastery" and never counts toward outcome
  mastery.
- Mapping SoL topics to outcomes can come later.

## Where the numbers come from
**Insights is computed only from real records:**
- `outcome_results` (which Phase 6 made the only mastery source)
- submissions and quiz attempts
- page views and item views
- discussion replies

Missing data is `null`, never 0 or a sample value. Every figure carries how many learners it is
based on.

**Per learner** (`src/services/insights/metrics.js`):
- **Now and baseline per outcome**, the change in points, and the **normalized gain**
  `(now − baseline) ÷ (100 − baseline)`.
  - The gain is null when the baseline is 100%.
  - The overall change and gain use only outcomes that have both a baseline and a current value.
- **Trajectory:** the last 10 results, one point per quiz attempt or graded submission (the mean of
  its outcome results).
- **Timeliness**, counted on published graded work, which means assignments, graded quizzes and
  graded discussions:
  - on time, late, missing (past due and not handed in), to do, upcoming
  - the on-time rate, which counts a quiz's first attempt
- **Engagement:** last activity, and the number of active days in the last 7 and 14 days.
  Activity means submissions, quiz attempts, page views, module-item views and replies.
- **Results to mastery:** how many results it took to first reach 85% on each outcome.
- **Risk flag:** rule-based, and always shown with its reasons (`RISK_RULES`):

  | Rule | Fires when |
  |---|---|
  | `low_mastery` | Overall below 60% with at least 2 results |
  | `missing_work` | 2 or more past-due items not handed in |
  | `often_late` | 2 or more late, and at least half of all hand-ins late |
  | `inactive` | No activity for 14 days, once the course has run 7 days |
  | `falling` | Mean of the last 3 results at least 15 points below the 3 before |

**Per class:** averages are means over learners, so each learner counts once. The class view adds:
- band counts: needs reteach (<60), on track, mastered (≥85), no data
- the on-time rate
- the number of learners flagged and the number active in the last 7 days
- per outcome: how many learners reached mastery, and the median number of results it took

**Per item:** handed in out of the class size, on time, late, missing, how many are graded, and the
average %. Graded quizzes also get question analysis: the % correct for each question and how often
each option was chosen, from each learner's latest attempt.

## Routes
| Route | Who | |
|---|---|---|
| `GET /courses/:id/insights` | course teachers, admins | Class, Outcomes, Learners, Items, and the latest AI summary |
| `GET /courses/:id/insights/learners/:userId` | course teachers, admins | one learner, with their work list |
| `GET /courses/:id/insights/quizzes/:quizId` | course teachers, admins | question analysis |
| `GET /courses/:id/my-progress` | the learner | their own growth, results and work; no flags, no class figures |
| `GET /analytics/school` | admins | every open or closed course's class figures, totals, teaching signals, events |
| `GET/PUT /analytics/settings` | admins | how long usage logs are kept |
| `GET /analytics/my-data` | anyone | download of their own data (JSON) |
| `GET /analytics/users/:userId/data` | admins | anyone's data download |

- **AI class summary:**
  - A new job kind, `class_summary`, sends only outcome codes and class numbers to the model, with
    no names and no individual results.
  - The text is stored on the job (`ai_jobs.result`). It is teacher commentary, not course content,
    so it isn't a draft.
  - Insights shows the latest summary, labelled to be checked against the numbers.
- **Teacher scoping (guide P-items carried since Phase 0):**
  - `growth-curves`, `sol-outcomes` and `/sol/diagnostic/status` now let teachers see only learners
    who are active in a course they teach (`src/services/insights/scope.js`).
  - With no learner filter, a teacher's cohort is their own learners.
  - Learners asking about someone else get 403. Before, they were silently given their own data.

## Admin charts now use real data
- **`GET /analytics/growth-curves`** now returns `{ weeks: [{ weekStart, averagePct, learners,
  results }], baselineAverage, baselineLearners }`, from `outcome_results`.
  - Before, it read `longitudinal_progress` and the chart showed only "Mathematics" and "Science".
  - The diagnostic copied one overall score into every subject when no breakdown was sent.
- **`GET /analytics/inclusivity-gap`:**
  - now reads from `outcome_results`
  - is still admin-only and aggregate-only
  - doesn't report any group (rural/urban, gender, accessibility needs) with fewer than 5 learners
    with results; those groups are listed in `suppressed`

## Events and privacy
- **New browser events:** `course_opened`, `item_opened`, `insights_viewed`, `progress_viewed`,
  `grading_time` (time to grade), `ai_suggestion_used`.
- **Server-side event:** `item_edited_after_publish` is recorded when a teacher changes the content
  of an already published page, assignment, quiz or discussion. Publishing or unpublishing alone
  doesn't count.
- AI accept, edit and reject decisions were already recorded in `ai_drafts` (Phase 8).
- **Retention:** usage logs (`usage_events`, `ai_calls`) are deleted after the admin setting
  (default 365 days, minimum 30). This runs at startup and once a day.
- **Data export:** each person can download everything the box holds about their learning and use,
  and admins can download anyone's.
- **No leaderboards, ranks or class comparisons** for learners.

## Migration `0013_insights`
- Adds the `insights` nav item (hidden from learners) to every existing course; `DEFAULT_NAV_ITEMS`
  includes it for new courses.
- Adds `class_summary` to `ai_jobs.kind` and a `result` column.
- Adds the `usage_retention_days` setting and an index on `outcome_results (course_id, user_id)`.

## Frontend
- **Course Insights** has four tabs (Class, Outcomes, Learners, Items):
  - learner detail with trajectory, work states and flag reasons
  - quiz question analysis
  - the AI class summary
- **My progress** for learners, with encouraging wording, their own data only, and to-do and
  still-to-hand-in lists. Learners see it on the Insights route if a teacher shows that nav item to
  them, and through links from course Home and Grades.
- **The admin analytics page** is now a real school view:
  - totals and a per-course table
  - teaching signals: median time to grade, edits after publishing
  - product use
  - the growth chart and the inclusivity report, both on real data
  - the retention setting
- Buttons to download your own data, or a user's data (admin).
- Science-of-Learning screens are labelled as practice that doesn't count toward mastery.

## Tests (106 backend + 7 timeline)
`test/insights.test.js` has 9 tests:
- an empty course gives nulls
- the growth, gain, timeliness and risk-reason arithmetic on a worked example, plus item and
  question analysis
- the inactivity and falling-trend rules
- the access rules for Insights and My progress
- teacher scoping across courses
- the class summary is anonymous and appears in Insights
- the edit-after-publish event, and unknown events being dropped
- the school view, retention with purge, and small-group suppression
- data export

The access-policy table includes the new routes.

## Known gaps
- **`/analytics/school` recomputes every course on each request.** That is fine for one school box,
  but should be cached if a box holds many large courses.
- **Duplicate outcome codes:**
  - Many courses still have the column default `OUT-1` on every outcome.
  - The AI paths make codes unique before sending them.
  - The Outcomes and Insights screens still show the stored codes, which can repeat.
- **Engagement counts only course activity.** Library reading and SoL practice aren't included.
- **The new screens were build-checked, never used in a browser.**
