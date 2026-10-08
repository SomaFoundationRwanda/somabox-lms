# Phase 13: Explore follows the files on the box

Branch: `somabox-guide-implementation`.

**What the school owner asked for (2026-10-08):** Explore files come from the cloud, downloaded by an
admin, but Explore must also read the file system, for files added by hand or uploaded through
custom content. There is **one source of truth** for Explore files. Course files are not part of
this.

## Before
- Rwandan content was indexed **only right after a cloud download**.
- Custom content was indexed **only by the upload screen**.
- Files copied onto the box by hand never appeared, and files deleted by hand stayed listed and
  opened to a 404.
- Three path formats lived side by side: `nursery-school-content` versus
  `rwandan-education/nursery-school-content` versus `/custom-content/...`.
- There were two catalogue APIs, and the app picked between them by URL.
- Hiding content didn't work for Rwandan content.
- A fresh box couldn't upload custom content at all (no root folder row).
- Uploading a file with an existing name **overwrote it, then deleted it**.
- Covers existed only for cloud PDFs.
- `/content/files` served *everything* under `local-content`, course files included, which
  bypassed the course-membership check.

## Now
- **The folders are the truth; the database is an index of them plus people's decisions**
  (titles, descriptions, hidden items).
- **The indexer** (`services/explore/indexer.js`) walks both file roots:
  - `rwandan-education`: cloud downloads
  - `custom-content`, shown as "School content": uploads and manual copies

  It runs at startup, every `EXPLORE_RESCAN_MINUTES` (default 5), after downloads, deletes and
  uploads, and from "Rescan now". Each run:
  - adds new folders and files, with titles made readable from their names
  - updates moved or changed files
  - removes what's gone
  - keeps edited titles (`title_locked`, migration 0019) and hidden flags
  - cleans up the old mixed-format rows

  Only openable types are indexed: video, audio, PDF and EPUB. Dotfiles are skipped. Folders can
  hold both files and subfolders.
- **Covers** (`services/explore/covers.js`) are made in the background, one at a time, for every
  PDF and EPUB, whatever its source. They are served publicly so guests can browse.
- **One catalogue:** `GET /content/explore` returns `{ version, mainCategories, summary }`. It is
  cached until something changes. Hidden folders hide everything in them, and empty folders aren't
  shown. The old three endpoints return the same data.
- **Files:** `/content/files/<path>` serves Explore folders only. Learners can't open hidden files;
  staff can still preview them.
- **Content manager:**
  - Teachers manage School content; admins manage both roots.
  - Browse, upload several files at once (types from the extension; an existing file is never
    replaced), new folder, rename (title and description), hide or show, delete (School content
    only; a non-empty folder needs confirming), and "Rescan now" with the last run's results.
  - Cloud content is renamed or hidden here, and added or removed on the Sync page.
- **The app:**
  - It loads the catalogue once and refreshes it on focus, every 5 minutes, and after changes.
  - The home tabs are Rwandan education, School content and International education.
  - Folder cards show their file count and a cover.
  - Folder pages show subfolders and files together.
  - A folder that's gone says so.
  - The teacher explore page shows library books correctly (the field names were wrong before).

## Tests (144 backend, 7 timeline, 4 gateway, plus the translation checks)
`test/explore.test.js` (4):
- **Copied files appear in one catalogue:** files copied onto the box appear after a rescan.
  Unopenable files and dotfiles are skipped, subfolders of folders with files are kept, and old rows
  are cleaned up.
- **Deletions and edits:** files deleted from disk disappear. Edited titles, descriptions and hidden
  flags survive rescans. Hidden files and folders don't open for learners, but staff can preview
  them.
- **Uploads:** a file with the same name is refused without touching the existing one, types come
  from the extension, unsupported types are refused, and deleting a non-empty folder needs
  confirming.
- **Who manages what:** teachers can't touch cloud content; admins can hide it but not upload to it
  here.
- **The files route serves Explore folders only:** no course files, no path escapes, no library.

This phase also fixed a folder-name check that accepted names like `../escape`.

## Known gaps
- **The Library is still a separate store** (`books`, files by id). Unifying it with Explore is a
  later decision.
- **Backups:** they include School content (`custom-content`), but not `rwandan-education`, which is
  large and can be re-downloaded from the cloud. Files someone copied into `rwandan-education` by
  hand are not backed up. Put school-made files in School content.
- **Wikipedia and Kolibri** still run on their own servers (see Phase 12).
- **Not checked in a browser.**
