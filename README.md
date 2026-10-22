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
- Node.js 22 (18+ works)
- PostgreSQL 14+ running on `localhost:5432`

### 1. Install dependencies
From the repository root (npm workspaces install the frontend, backend and shared code together):

```bash
npm install
```

### 2. Create the env files
```bash
cp soma-x-backend/.env.example soma-x-backend/.env
cp soma-x/.env.example soma-x/.env
```

The defaults work locally: the backend connects to `postgres:postgres@localhost:5432/somabox_lms`
and the frontend calls `http://localhost:3000`. Change `PGUSER` / `PGPASSWORD` in
`soma-x-backend/.env` if your PostgreSQL login differs. Cloud sync stays off until `SYNC_URL`
is set; see [soma-x-backend/README.md](soma-x-backend/README.md).

### 3. Create the database and tables
```bash
createdb -h localhost -U postgres somabox_lms
npm run setup:db
```

`setup:db` creates the tables and runs every migration. The backend also does this on startup.

### 4. Run
```bash
npm run dev:app      # backend + frontend
```

- Frontend: http://localhost:3001
- Backend: http://localhost:3000
- First login: `admin@mail.com` / `admin` (you are asked to set a new password)

### 5. AI assistant (optional)
Only needed when working on the teacher AI features. Full details in [ai/README.md](ai/README.md).

```bash
./ai/scripts/download_model.sh       # GGUF model into ai/models/ (several GB)
./ai/runtime/install_runtime.sh
npm install --prefix ai/gateway
npm run dev                          # backend + frontend + AI runtime + AI gateway
```

## Tests
```bash
npm test
```

Backend tests create and drop a throwaway `somabox_test_*` database, so your PostgreSQL user
needs permission to create databases.

## Installing on a school box
Production setup (Linux, pm2, LAN address, backups, cloud sync) is in
[docs/ops-box-setup.md](docs/ops-box-setup.md) and
[docs/ops-backup-restore.md](docs/ops-backup-restore.md).
