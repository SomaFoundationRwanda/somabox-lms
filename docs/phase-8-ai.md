# Phase 8: AI on the real model, as drafts

Branch: `phase-8-ai`, on top of Phase 7 (`f4d75ad`). This phase implements Phase 8 of the guide.

**Decision (guide §12.2):** teachers **and admins** can use the AI tools. Teaching assistants (`ta`)
count as teachers for course actions; that is still an open question.

**Not verified on a real model.** The development machine has no model. Every AI layer is tested
against a fake llama runtime (gateway) or a fake gateway (LMS). Before relying on it in a school,
run `node ai/scripts/structured_eval.mjs` on the box (see below).

## The rules
- **AI output is always a draft.** Nothing reaches learners until a teacher approves the draft. This
  creates **unpublished** items in the chosen week, which the teacher then publishes as usual.
- **Generation runs in the background as a job** and can take minutes on the box. Teachers see the
  job's progress, its place in the queue, and a Cancel button.
- **The old template stubs are gone:** `propose-outline`, `rewrite-outcomes`, `fill-module`,
  `generate-story` and the quiz editor's "suggest distractors" button. They produced placeholder
  text, not AI output.

## Gateway (`ai/`)
- **`POST /generate { task, input }`** returns structured JSON. It shares the existing queue with
  `/ask`.
  - **Tasks:** `outline`, `outcome_rewrite`, `quiz`, `rubric`, `story`, `page`, `assignment`,
    `grading_suggestion`, `class_summary`.
  - Each task has a JSON schema (`gateway/tasks.js`) and a prompt (`prompts/structured/<task>.txt`).
  - The schema is passed to llama.cpp as `response_format`, so output is constrained by a grammar.
  - The result is checked again (`gateway/validate.js`). If it fails, the gateway tries once more,
    telling the model what was wrong.
  - **Errors:** `unknown_task` 400, `runtime_unavailable` 503, `timeout` 504, `invalid_output` 502,
    `runtime_error` 502.
- **Output language:** the system prompt sets it from the teacher's preferred language (en, fr, rw,
  sw, es).
- **Gateway tests:** `cd ai/gateway && npm test` (4 tests, against a fake llama runtime).
- **`ai/scripts/structured_eval.mjs`:**
  - the quality gate on a real box
  - runs every task in English, French, Kinyarwanda and Swahili
  - checks that the JSON is valid and that only real outcome codes are used, and measures latency
  - writes `ai/data/structured_eval_*.json`
- `teacher_eval.sh` now includes two Swahili prompts.

## LMS backend
- **Migration `0012_ai_drafts_jobs`:**
  - `ai_jobs`: the queue, with progress, cancel, the person who requested the job and its input
  - `ai_drafts`: with a payload, the original payload, an `edited` flag and `result_refs`
  - `ai_calls`: a usage log, with tokens and latency only. Prompts and outputs are not stored.
  - `users.ai_enabled`, and the school-wide setting `system_settings.ai_enabled`
- **Access** (`services/ai/access.js`): a teacher or admin, the school switch on, and the user's own
  switch on. Otherwise the response is 403 `AI_DISABLED`.
- **Context** (`services/ai/context.js`):
  - Each request sends the course title, grade, week title, and the course outcomes with unique
    codes.
  - Codes the model returns are mapped back to outcome ids. Unknown codes are dropped.
- **Jobs** (`services/ai/jobs.js`):
  - **Kinds:** `fill_week` (page, quiz, assignment with rubric), `story`, `quiz`, `outline`,
    `outcome_rewrite`, `rubric`, `grading`.
  - Jobs run one at a time by default (`AI_JOB_CONCURRENCY`). Each job is claimed with
    `FOR UPDATE SKIP LOCKED`.
  - After a restart, jobs that were running are marked failed with "Interrupted by a restart".
  - Cancelling a queued job stops it at once. A running job stops before its next step.
- **Drafts** (`services/ai/drafts.js`):
  - Each draft type has a checked payload. A teacher can edit it (PATCH, re-validated), approve it or
    reject it.
  - Approving creates unpublished pages, quizzes, assignments and discussions in the week, with
    outcome tags.
  - An outline adds outcomes and weeks after the last existing week.
  - An outcome rewrite creates a new outcome or updates the one chosen.
  - A rubric replaces the assignment's rubric.
- **Grading help:**
  - The submission text goes to the model with the learner's name and email removed.
  - Scores are clamped to each criterion's maximum, and criteria the model invents are dropped.
  - The teacher's save decides the grade. When the save sends `aiDraftId`, each criterion is recorded
    as `ai_suggested_accepted` if it matches the suggestion, or `teacher` otherwise. The draft is
    marked approved, with `edited` set if anything changed.
- **Routes** (course teachers):
  - `POST|GET /courses/:id/ai/jobs`, `GET /courses/:id/ai/jobs/:jobId`, `POST .../cancel`
  - `GET /courses/:id/ai/drafts`, `GET|PATCH /courses/:id/ai/drafts/:draftId`, `POST .../approve`,
    `POST .../reject`
  - `GET /courses/:id/ai/grading-suggestion`
- **Other routes:**
  - `GET /ai/status` (any logged-in user): whether AI is allowed and whether the model is running
  - admin: `GET|PUT /ai/admin/settings`, `PATCH /ai/admin/users/:id`, `GET /ai/admin/usage`
- The teacher assistant chat (`/ai/ask`) now uses the same access check and is logged in `ai_calls`.

## Frontend
- **AI drafts page** (`/course/[id]/ai`) has three parts:
  - jobs in progress: progress, place in the queue, Cancel, and the error if a job failed
  - drafts waiting for review: a preview of each type, edit forms, Add to course and Reject
  - recently decided drafts
- **Where AI can be started:**
  - **Fill week** and **Story** on each week of the Modules page; the page also links to AI drafts
    with a count.
  - **Propose outline** and **Fill week** in the setup wizard.
  - **Rewrite with AI** on the Outcomes page.
  - **Draft rubric with AI** on the assignment page.
  - **Suggest scores with AI** in the grading panel. The suggestion is pre-filled into the form and
    marked; each criterion shows the model's reason.
- **Admin:**
  - the school-wide AI switch
  - turning AI off or on for one person
  - a 30-day usage report: calls, failures, tokens and average latency per person, and drafts
    approved as-is, edited or rejected
- **AI buttons follow `GET /ai/status`:** they are hidden when AI isn't allowed, and show a notice
  when the model isn't running.

## Configuration
| Variable | Default | |
|---|---|---|
| `AI_GATEWAY_URL` | `http://127.0.0.1:5000` | LMS → gateway |
| `AI_REQUEST_TIMEOUT_MS` | `300000` | per gateway call |
| `AI_JOB_CONCURRENCY` | `1` | jobs running at once |
| `AI_GATEWAY_PORT` | config.yaml | gateway port |

## Tests
- **Backend:** 97 tests, including 9 in `test/ai.test.js`, run against a fake gateway:
  - "fill this week" only creates drafts
  - approving creates unpublished, tagged items and a rubric
  - editing and rejecting drafts
  - an approved outline adds outcomes and weeks
  - grading help anonymizes the work, and the teacher's save sets the source of each score
  - cancelling, and readable error messages
  - recovery after a restart
  - the admin switches and usage report
  - the stubs are gone
- **Gateway:** 4 tests.
- **Access-policy table:** includes the new routes.

## Known gaps
- No AI quality numbers yet. The model must be run on a box with `structured_eval.mjs`, and teachers
  should review the Kinyarwanda output in particular.
- `class_summary` is defined but not used yet; Phase 9 Insights will use it.
- Grading help reads the submission's text only, not attached files.
- The AI screens were build-checked but never used in a browser.
