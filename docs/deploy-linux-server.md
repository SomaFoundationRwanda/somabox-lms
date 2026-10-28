# Deploying SOMABOX on a Linux server (PostgreSQL and Node already installed)

For a server that already has **PostgreSQL** and **Node.js** (installed system-wide, not with
nvm) but not **pnpm**. Commands are for Ubuntu/Debian; run them as a normal user with `sudo`.
`docs/ops-box-setup.md` has the full school-box guide (device identity, cloud registration,
backups); this page is the short path for this server.

What runs: the **backend** (Express, port 3000), the **frontend** (Next.js, port 3001) and a
nightly **backup** job, all kept alive by pm2. The backend creates and updates the database
tables itself on every start (migrations).

## Quick way: one script

On a box whose PostgreSQL database already exists (empty):

```bash
git clone https://github.com/SomaFoundationRwanda/somabox-lms.git
cd somabox-lms
git checkout dev
# copy your working .env into this folder, then:
bash scripts/linux/setup-box.sh
```

It installs pnpm if needed, adds `PUBLIC_BACKEND_URL` with the box's address if `.env` lacks it,
creates the tables, builds, starts everything with pm2 (also after a reboot), and prints the
one-time setup code. The box starts empty; nothing comes from another machine. It stops if the
database already has users (`--existing-db` to update such a box). Give each box its own
`SYNC_TOKEN`. The steps below do the same by hand.

## 1. Check what's installed

```bash
node -v        # must be v22.12 or newer, or v24 (v25 also works)
psql --version # any supported PostgreSQL (14+)
```

If `node -v` is older than 22.12, upgrade Node first (NodeSource packages:
`curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt install -y nodejs`).

Tools the install needs to build a few native packages:

```bash
sudo apt update
sudo apt install -y git build-essential python3
```

## 2. Install pnpm (no nvm needed)

The repository pins pnpm **10.28.1**. With Node 22 or 24, Corepack (shipped with Node) installs
exactly that version:

```bash
sudo corepack enable
corepack prepare pnpm@10.28.1 --activate
pnpm -v        # 10.28.1
```

If `corepack` isn't found (Node 25 no longer ships it), install pnpm with npm instead:

```bash
sudo npm install -g pnpm@10.28.1
pnpm -v
```

## 3. Database and user

Skip what already exists. Choose your own password:

```bash
sudo -u postgres createuser --pwprompt somabox
sudo -u postgres createdb --owner somabox somabox_lms
```

## 4. Get the code

```bash
sudo adduser --disabled-password --gecos "" somabox   # a user that owns and runs SOMABOX
sudo -iu somabox
git clone https://github.com/SomaFoundationRwanda/somabox-lms.git
cd somabox-lms
git checkout fix/current-branch      # or main, once this branch is merged
pnpm install --frozen-lockfile       # backend, frontend, AI gateway and pm2, exactly as locked
```

## 5. Settings

All settings live in one file at the repository root:

```bash
cp .env.example .env
nano .env
```

| Setting | Value |
|---|---|
| `PGUSER`, `PGPASSWORD`, `PGDATABASE` | `somabox`, the password from step 3, `somabox_lms` |
| `PGHOST`, `PGPORT` | `localhost`, `5432` unless PostgreSQL is elsewhere |
| `SCHOOL_TIMEZONE` | `Africa/Kigali` |
| `PUBLIC_BACKEND_URL` | the address browsers use to reach the backend, e.g. `http://<server-ip>:3000` (or `https://lms.example.org/api` behind a proxy). It is built into the frontend: run `pnpm build` again after changing it. |
| `BACKEND_PORT`, `FRONTEND_PORT` | only if 3000 / 3001 are taken |
| `BACKUP_DIR` | a folder on another disk for nightly backups |
| `SYNC_URL`, `SYNC_TOKEN`, `CLOUD_URL` | the VPS sync address and this server's key (see `docs/ops-box-setup.md`, step 8). Leave unset to stay offline: changes wait safely on the server. |
| `MEDIA_COOKIE_SECURE` | `true` only when the site is served over HTTPS |

Every setting is checked at start; a wrong value stops the start with a message naming it.

## 6. Create the tables, build and start

```bash
pnpm setup:db        # creates the tables and runs every migration
pnpm build           # builds the frontend (takes a few minutes)
pnpm exec pm2 start ecosystem.config.cjs --only soma-x-backend,soma-x-frontend,soma-x-backup
pnpm exec pm2 save
pnpm exec pm2 startup   # prints one "sudo env PATH=..." command: run it so SOMABOX starts on boot
```

The ecosystem also defines the offline AI (`soma-x-ai-runtime`, `soma-x-ai-gateway`). Start them
only once the model and `llama-server` are installed (see `ai/README.md`); then `pnpm start`
starts everything.

Check:

```bash
pnpm exec pm2 status          # soma-x-backend and soma-x-frontend "online"
curl -s http://localhost:3000/school/public | head -c 200
```

Open `http://<server-ip>:3001` in a browser.

## 7. Open the ports (if a firewall is on)

```bash
sudo ufw allow 3000/tcp
sudo ufw allow 3001/tcp
```

## 8. First sign-in

The backend prints a one-time **setup code** on its first start:

```bash
pnpm exec pm2 logs soma-x-backend --lines 50   # look for the setup code
# or make a new one:
pnpm setup:code
```

Open the site: it shows the setup page. Enter the code, the school's name, and the admin's
name, email and password. Then fill in the **School** page and check **Sync** (what leaves the
server, and Sync now).

## Updating an existing server

```bash
sudo -iu somabox
cd somabox-lms
pnpm backup                         # a backup first (pnpm restore can bring it back)
git pull
pnpm install --frozen-lockfile
pnpm build
pnpm exec pm2 restart soma-x-backend soma-x-frontend --update-env
pnpm exec pm2 logs soma-x-backend --lines 30   # "Applied migration ..." lines, no errors
```

Migrations run by themselves when the backend restarts. This update's migration
(`0040_sync_learning_record`) starts sending the full learning record to the cloud, including
what was recorded before, the next time the server can reach it. On a server with a lot of
history the first sync takes longer; that's expected.

## Behind nginx with HTTPS (optional)

One address for everything: the frontend at `/`, the backend at `/api`.

```nginx
server {
    server_name lms.example.org;
    client_max_body_size 200M;            # uploads
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;              # live updates
        proxy_read_timeout 1h;
    }
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Then set `PUBLIC_BACKEND_URL=https://lms.example.org/api` and `MEDIA_COOKIE_SECURE=true`,
run `pnpm build`, and restart both apps. Use certbot (`sudo certbot --nginx`) for the
certificate. With the proxy in place, ports 3000/3001 don't need to be open to the outside.

## When something goes wrong

| Symptom | Fix |
|---|---|
| `pnpm: command not found` | Step 2. With Corepack, open a new shell after `corepack enable`. |
| `Unsupported engine` during install | Node is older than 22.12: upgrade it (step 1). |
| Backend stops with a message naming a setting | Fix that line in `.env`, then `pnpm exec pm2 restart soma-x-backend --update-env`. |
| `password authentication failed for user` | `PGUSER`/`PGPASSWORD` in `.env` don't match step 3. |
| Pages load but say the server can't be reached | `PUBLIC_BACKEND_URL` is wrong or the port is closed; fix it and run `pnpm build` again. |
| `Port 3000 is in use` | Something else uses it: set `BACKEND_PORT`/`FRONTEND_PORT`, rebuild, restart. |
| Logs | `pnpm exec pm2 logs`, or the files in `logs/`. |
