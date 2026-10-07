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

### Firebase cloud sync (optional)
Cloud sync needs a Firebase service account key. **Never put the key in this repository.**
Store it outside the repo (for example `/etc/somabox/firebase-service-account.json`,
readable only by the service user) and point to it in `.env`:

```bash
FIREBASE_SERVICE_ACCOUNT_PATH=/etc/somabox/firebase-service-account.json
```

If the variable is unset, sync is skipped and everything else keeps working.

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
