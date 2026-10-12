# Soma-X Backend

Express 5 API for the SOMABOX LMS. It runs on the school box (LAN) against a local
PostgreSQL database and syncs selected data to the cloud.

## Prerequisites
- Node.js 18+ (22 recommended)
- PostgreSQL 14+ running locally

## Setup

From the repository root (npm workspaces install both apps):

```bash
npm install
cp soma-x-backend/.env.example soma-x-backend/.env   # then fill in the values
npm run setup:db                                     # creates/updates tables
```

On startup (and with `npm run setup`) the server applies the legacy baseline schema in
`initSchemas()` (`src/helpers/db-manager.js`), then every pending migration in
`src/db/migrations/`. **All schema changes go in a new migration file**
(`NNNN_description.js` exporting `async up(client)`); never edit a shipped migration or add
ALTERs to `initSchemas()`.

### Authentication
`POST /auth/login` returns a bearer token; send it as `Authorization: Bearer <token>`.
Every API route requires a session except the short allowlist in `src/helpers/auth.js`.
When adding a route, also add it to the access-policy table in `test/auth.test.js`; the
test suite fails for routes without a policy.

### Default admin
Setup creates `admin@mail.com` / `admin`. That account must set a new password on
first login. Change it before the box is handed to a school.

### Cloud sync (optional)
The box works fully offline. Changes to synced tables (courses, outcomes, enrollments, grades,
quiz attempts, outcome results, usage events, people) are captured by database triggers into
`sync_outbox` and pushed on a schedule (never at login). Admins choose what leaves the box on
the **Sync** admin page (default: anonymous IDs only, no names, emails, or written answers).
The cloud keeps what it receives indefinitely (school decision, 2026-10-08); the receiver must
not expire records. The box's own usage-log retention setting only applies on the box.

Pick a destination in `.env` (with neither, records wait on the box until one is set):

```bash
# Option 1: any HTTPS endpoint that accepts POST { boxId, records } (idempotent per record syncId)
SYNC_URL=https://cloud.example.org/somabox/ingest
SYNC_TOKEN=...                 # sent as a Bearer token
# Option 2: Firestore (collection FIRESTORE_SYNC_COLLECTION, default "sync_records")
FIREBASE_SERVICE_ACCOUNT_PATH=/etc/somabox/firebase-service-account.json
# SYNC_TRANSPORT=http|firestore|none   # force one; otherwise SYNC_URL wins
# SYNC_INTERVAL_MINUTES=15            # retries back off up to 6 hours while offline
```

#### With soma-x-server (the SOMABOX VPS)
[soma-x-server](https://github.com/SomaFoundationRwanda/soma-x-server) receives the outbox and
serves the cloud content catalogue. Each box has its own key:

1. On the VPS: `npm run device:create -- --name "GS Kigali box 1"`. It prints the key once.
2. On the box, in `.env`:
   ```bash
   CLOUD_URL=https://cloud.somaglobaltalent.org
   SYNC_URL=https://cloud.somaglobaltalent.org/api/v1/box-sync
   SYNC_TOKEN=sbx_...   # the key from step 1
   ```

Every push carries the box's hardware identity, its school (name, code, province, district,
rural/urban, as set on the School page), and its recent sync runs. Cloud content downloads send the
same key.

**Content usage:** opening an Explore or Library file records a `content_opened` usage event
(at most once per person, file, and half hour; video seeking doesn't count). The event has the
file's root, path, title, and type, plus the catalogue id when the file came from the cloud. It is
synced like any usage event, so the "events" switch on the Sync page controls whether it leaves
the box.

**Cloud downloads remember what they fetched** (`cloud_content`: catalogue id, sha256, version).
The Sync page's content list marks files whose cloud copy is newer (`isOutdated`), and
downloading them again replaces the local copy. A Library file the box didn't download from the
cloud is never overwritten.

**Never put the Firebase key in this repository.** Store it outside the repo (readable only by
the service user).

## Running

```bash
npm run dev     # development; needs nodemon (`npm install -g nodemon`)
npm start       # production via pm2 (or `npm run pm2:start` from the repo root)
```

## Tests

```bash
npm test
```

Tests use Node's built-in test runner. Each run creates a throwaway PostgreSQL
database (`somabox_test_*`) using the `PG*` environment variables and drops it at the end,
so the configured user needs permission to create databases.
