# Phase 14: The school's identity, learner codes, box identity, and AI summaries for learners

Branch: `somabox-guide-implementation`. This phase covers what the school owner asked for on
2026-10-08.

## One box, one school
- **Admins set the school once** (`GET/PUT /school`, migration 0020):
  - name
  - a short code (initials, e.g. `GSK`, made from the name by default)
  - province and district
  - rural or urban
- **Learners aren't asked for the school any more.**
  - New learners get the school's name automatically.
  - Rural/urban comes from the school's setting, and the profile step no longer asks it once the
    admin has set it.
  - Changing the name or rural/urban updates every learner on the box.
- **Learner codes:**
  - Every learner gets a code from the school code and a number (`GSK-0001`, `GSK-0002`, …) when
    they sign up, or when an admin creates them.
  - Existing learners got codes in the order they joined.
  - Numbers can't repeat, even when many sign up at once (the settings row is locked).
  - Changing the school code only affects new learners.
- **Learners can log in with their code** instead of their email.

## The box's identity for the cloud (VPS)
- **`scripts/linux/somabox-device-info.sh`** writes `/etc/somabox/device.json`:
  - the serial number (PC firmware, or a Raspberry Pi or other board)
  - the MAC addresses of the real Ethernet and Wi-Fi cards
  - the machine id
  - model, OS, disk and memory

  It runs as root at every start through `somabox-device-info.service`; install steps are in
  `scripts/linux/README.md`. It was tested in Debian 12 and Ubuntu 24.04 containers, including the
  machine id and a Raspberry Pi serial.
- **Every sync batch sent to the cloud now carries `device`** (that identity) **and `history`** (the
  box's recent sync runs).
  - A run with nothing new still sends them (`records: []`), so the VPS knows the box is alive and
    how syncing has gone.
  - Firestore keeps one document per box.
- **Without the script,** the server reports what it can see itself (hostname, MACs, machine id),
  with no serial number. The admin Sync page shows which source it is.

## AI summaries for learners
- **This changes the AI policy:** learners can now use AI, for summaries of Explore and Library files
  only. Course AI stays as before: drafts that a teacher approves.
- **What can be summarised:**
  - books (PDF, EPUB): from their own text
  - videos and recordings: from a transcript saved next to them (`.vtt`, `.srt` or `.txt` with the
    same name). The box can't turn speech into text yet.
- **How a summary is made:**
  1. Long books are read in parts, at most 8, spread from start to end; the summary says when it
     was made from parts.
  2. The model takes notes on each part.
  3. The notes become one summary: an overview, key points, and up to 3 questions to think about.
- **Made once, shared by everyone:** a summary is made per file and language, in the background, one
  at a time, and then used by everyone who opens that file. It continues after a restart.
- **Only the file's own text goes to the model.** Nothing about the learner does.
- **Limits and controls:**
  - Learners can start 5 new summaries a day (`SUMMARY_DAILY_LIMIT`). Summaries others asked for
    are free.
  - Hidden files can't be summarised.
  - Admins can switch learner summaries off (AI settings), hide a summary, or have it made again.
  - If the whole school's AI is switched off, summaries are off too.
- **AI gateway:** new tasks `notes` and `content_summary`, with prompts, both added to
  `structured_eval.mjs`, the quality check to run on a real box.

## Tests (152 backend, 7 timeline, 4 gateway, plus the translation checks)
- **`test/school.test.js` (3):**
  - school settings and permissions
  - new learners get the school and a code, and can log in with it
  - no rural/urban question once the school has set it
  - codes stay unique when 8 learners sign up at once
  - a new code applies to new learners only
  - admin-created learners get a code
  - device identity from the script file, or the server fallback
  - sync batches and the heartbeat carry the device and history
- **`test/summaries.test.js` (4):**
  - text from a real PDF, and from a transcript without timestamps; long texts are sampled
  - asked for once, made in the background, shared with no repeat model calls, and nothing about
    the learner sent
  - videos need a transcript, the daily limit, admin hide and switch-off
  - a model failure explains itself and can be retried, and hidden files can't be summarised

## Known gaps
- **Summary quality and speed are unknown** until `structured_eval.mjs` runs on a real box. A long
  book is about 9 model calls: minutes on a CPU box.
- **Speech-to-text isn't available** on the box. Videos without a transcript can't be summarised;
  adding whisper.cpp is possible later.
- **Scanned PDFs** (images of pages) have no text, so they can't be summarised.
