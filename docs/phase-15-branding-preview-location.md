# Phase 15: The school's look, the school's location, and visitor previews

Branch: `somabox-guide-implementation`. This phase covers what the school owner asked for on
2026-10-09.

## The school's own look
- **One School page** for admins (the Branding page now leads there):
  - name, code, location
  - logo and colours
  - visitor previews

  Admins can come back and change any of it.
- **The default "SOMABOX Partner School" isn't taken for a real name:** `configured` stays false
  until the admin sets one, and the admin dashboard asks them to set the school up.
- **Logo:**
  - PNG, JPEG or WebP, up to 5 MB.
  - It is stored as a PNG of at most 512 px, under a new name each time so browsers don't show the
    old one, and it is served publicly at `/branding/…` for the login page.
  - It replaces the SOMABOX logo across the app, with a small "Powered by SOMABOX" line.
  - Removing it brings back the SOMABOX logo.
  - SVG is refused, because it can carry scripts.
- **Colours:** primary and secondary (`#RRGGBB`) become the CSS variables `--brand-primary` and
  `--brand-secondary`, which the app's brand colours now use.
- **What anyone can read:** `GET /school/public` (no login) returns the name, logo, colours,
  whether the school is set up, and the visitor-preview settings.
- **Backups** now include the logo.

## The school's location is everyone's
- **Province, district and rural/urban are set once, by the admin, on the School page.**
- **Every learner and teacher gets them** at sign-up and account creation, and again whenever the
  admin changes them. Admins keep their own.
- **The profile step no longer asks for location**, for learners or teachers. It asks for gender and
  accessibility needs, plus the grade for learners.
- **Learners and teachers can't change their location;** the server ignores it if they send it.

## Visitor previews
- **People who haven't signed up can try a few Explore and Library items for a short time.**
  - Defaults: 5 items a day, 40 seconds each. Admins can change both, or switch previews off.
  - When the time is up, they're asked to sign up.
- **Enforced on the box, not just in the browser:**
  - Each visitor is a signed cookie. Starting a preview (`POST /content/preview`) counts toward the
    daily limit; reopening the same item doesn't count again.
  - The file is only sent during that item's preview window (the preview time plus 30 seconds).
    After that, requests are refused and the preview can't restart.
  - **Videos and audio only send their beginning:** a quarter of the file, at least 8 MB. A visitor
    can't download the whole video during the preview.
  - Books (PDF, EPUB) are sent whole during the window, because readers need the whole file. The
    timer then covers the reader.
  - Hidden items can't be previewed.
  - A visitor with no preview gets "sign up" rather than "not found", so nothing about the files is
    revealed.
- **Not previewable:** the web lessons (Khan Academy, W3Schools, Wikipedia, Kolibri) and anything in
  courses.
- **Preview records** are kept a week for the daily limit, then removed by the daily clean-up.

## Migration `0022_branding_preview`
- On `unit_branding`: the logo file, when the school was set up, and the preview settings
  (on/off, seconds, items).
- A new `guest_previews` table.

## Tests (156 backend, 7 timeline, 4 gateway, plus the frontend checks)
`test/preview-branding.test.js` (4):
- **Preview window:** a visitor's preview opens only the beginning of a video (the Content-Range
  is checked), a full download becomes that part, and the preview ends after the window and can't
  restart.
- **Limits and refusals:** the daily item limit, hidden items, switched-off previews, and the setting
  ranges.
- **Look:** the logo is resized and served publicly; SVG and non-admins are refused; removing the
  logo works; colours are validated.
- **Location:** the school's location reaches every learner and teacher but not admins, the profile
  completes without it, and what learners send for location is ignored.

Older tests were updated for "location is never asked", for visitors being asked to sign up rather
than told a file doesn't exist, and for the new routes in the access-policy table.
