# SOMABOX LMS

Offline-first learning platform that runs on a school box. This repository holds all of it:

| Folder | What it is |
|---|---|
| `soma-x/` | Web frontend (Next.js), port 3001 |
| `soma-x-backend/` | API (Express + PostgreSQL), port 3000 |
| `ai/` | Optional offline AI assistant for teachers (llama.cpp + gateway on port 5000) |
| `shared/` | Code shared by the apps |
| `docs/` | Phase notes and operations guides |

## Local development

### Prerequisites
- Node.js 22 or 24, the LTS lines (`.nvmrc` says 22). `pnpm install` refuses other versions,
  such as Node 25, with "Unsupported environment"
- pnpm 10, through Corepack (comes with Node): run `corepack enable` once
- PostgreSQL 14+ running on `localhost:5432`

### 1. Install dependencies
From the repository root (one pnpm workspace: frontend, backend, AI gateway and shared code):

```bash
pnpm install
```

Use pnpm only; there is no npm lockfile. `pnpm-lock.yaml` records every platform's native
packages, so the same lockfile installs on Windows, macOS and Linux.

### 2. Create the .env
Every app (backend, frontend, AI) reads one `.env` at the repository root:

```bash
cp .env.example .env
```

The defaults work locally: backend on :3000, frontend on :3001 (which calls the backend), and
the database at `postgres:postgres@localhost:5432/somabox_lms`. Change the `PG*` settings if
your PostgreSQL login differs, and any `*_PORT` if something else uses that port. Cloud sync
stays off until `SYNC_URL` is set; see [soma-x-backend/README.md](soma-x-backend/README.md).

Every setting is checked when anything starts (`shared/config`); a wrong value or a port that's
already taken stops it with a message naming the setting. A `.env.local` beside `.env`
overrides it on one machine.

**Had per-app `.env` files before?** (`soma-x-backend/.env`, `soma-x/.env`) Run
`pnpm env:migrate` once: it moves their settings into the root `.env` and renames the old
files to `.env.migrated`.

### 3. Create the database and tables
```bash
createdb -h localhost -U postgres somabox_lms
pnpm setup:db
```

`setup:db` creates the tables and runs every migration. The backend also does this on startup.

### 4. Run
```bash
pnpm dev          # backend + frontend
```

- Frontend: http://localhost:3001
- Backend: http://localhost:3000
- First login: `admin@mail.com` / `admin` (you are asked to set a new password)

### 5. AI assistant (optional)
Only needed when working on the teacher AI features. Full details in [ai/README.md](ai/README.md).

```bash
./ai/scripts/download_model.sh       # GGUF model into ai/models/ (several GB)
./ai/runtime/install_runtime.sh
pnpm dev:all                         # backend + frontend + AI runtime + AI gateway
```

## Tests
```bash
pnpm test           # every package's tests
```

Backend tests create and drop a throwaway `somabox_test_*` database, so your PostgreSQL user
needs permission to create databases.

### End-to-end tests
The `e2e/` suite drives the real app in Chromium (Playwright): signing in, every admin page,
building and running a course as a teacher, and everything a learner and a visitor can do.

```bash
pnpm exec playwright install chromium   # once
pnpm test:e2e                           # builds the frontend, then runs every spec (~4 min)
E2E_SKIP_BUILD=1 pnpm test:e2e          # reuse the last build when only the tests changed
pnpm test:e2e:ui                        # Playwright's UI mode, to watch or debug a test
```

Each run starts a fresh `somabox_e2e` database (dropped and recreated), the backend on :3100
with a fake AI gateway (no model needed), and a production build of the frontend on :3101, so
it never touches your dev database or a running dev server. Files the tests add to
`soma-x-backend/local-content/` are removed at the end.

Tests marked `test.fail(...)` document known bugs: they pass while the bug is there, and
Playwright reports them as "expected to fail, but passed" once it's fixed, so the mark can go.

## Installing on a school box
Production setup (Linux, pm2, LAN address, backups, cloud sync) is in
[docs/ops-box-setup.md](docs/ops-box-setup.md) and
[docs/ops-backup-restore.md](docs/ops-backup-restore.md).
