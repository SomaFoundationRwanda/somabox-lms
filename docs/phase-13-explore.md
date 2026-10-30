# Phase 13: Explore and the Library follow the files on the box

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
`test/explore.test.js` (5):
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
- **The files route serves Explore folders only:** no course files, no path escapes.
- **The library is a folder:** old books keep their titles and covers; uploads and hand-copied files appear; old links still open; teachers can't manage it.

This phase also fixed a folder-name check that accepted names like `../escape`.

## The Library is a folder too
The owner decided on 2026-10-08 that the library is a folder, alongside the others, that can hold
other files as well.

- **`local-content/library` is a third root.**
  - Whatever is in it (cloud book downloads, admin uploads, files copied onto the box, in any
    subfolders) is the Library.
  - It can hold books, videos and audio.
  - It also appears as a "Library" tab in Explore.
  - Admins manage it, in the content manager or on the Library admin page.
- **Books from before this change** were stored as `library/<id>.epub` with their names in the old
  `books` table. They keep their titles, and their existing covers are reused, not regenerated.
  Their old links (`/library/file/<id>`) still open.
- **Cloud book downloads** go into a folder named after the book's first category, with the book's
  title as the file name.
- `GET /library/books` and `/library/categories` read the shared catalogue; shelves are the
  library's top-level folders.

## Backups
**Decided 2026-10-08: backups stay as they are.** They include School content and the Library, but
not `rwandan-education`, which is large and can be downloaded again from the cloud. Put school-made
files in School content or the Library, not in `rwandan-education`.

## Known gaps
- **Wikipedia and Kolibri** still run on their own servers (see Phase 12).
- **Not checked in a browser.**
