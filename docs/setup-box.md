# Set up a SOMABOX device

For a Linux device that already has Node.js (22.12 or newer) and PostgreSQL with an empty
database. Everything runs as your normal user.

## 1. Clone

```bash
git clone https://github.com/SomaFoundationRwanda/somabox-lms.git
cd somabox-lms
git checkout main
```

## 2. Settings

Copy your working `.env` into this folder (next to `package.json`), then edit it:

```bash
nano .env
```

- `SYNC_TOKEN`: this device's token from the server
- `PGPASSWORD`: this device's `postgres` password
- add `PUBLIC_BACKEND_URL=http://<device-ip>:3000` (find the IP with `hostname -I`), so other
  devices can reach it

## 3. Install

```bash
sudo npm install -g pnpm@10.28.1
pnpm install --frozen-lockfile
```

## 4. Database

```bash
pnpm setup:db
```

This creates every table in the empty database. No users or subjects are copied from anywhere.

## 5. Build

```bash
pnpm build
```

Takes a few minutes.

## 6. Run with pm2

```bash
pnpm exec pm2 start ecosystem.config.cjs --only soma-x-backend,soma-x-frontend,soma-x-backup
pnpm exec pm2 save
pnpm exec pm2 startup
```

`pm2 startup` prints one `sudo env PATH=...` line: copy it and run it, so SOMABOX starts again
after a reboot.

## 7. First sign-in

```bash
pnpm setup:code
```

Open `http://<device-ip>:3001` in a browser, enter the code, and create the admin
(e.g. `admin@mail.com`).

## Updating later

```bash
cd somabox-lms
git pull
pnpm install --frozen-lockfile
pnpm build
pnpm exec pm2 restart soma-x-backend soma-x-frontend --update-env
```

## If something fails

| Problem | Fix |
|---|---|
| `password authentication failed` | `PGUSER`/`PGPASSWORD` in `.env` are wrong |
| `database "somabox_lms" does not exist` | `sudo -u postgres createdb somabox_lms` |
| Site opens but says the server can't be reached | `PUBLIC_BACKEND_URL` is wrong: fix it, `pnpm build`, restart |
| Anything else | `pnpm exec pm2 logs soma-x-backend --lines 50` |
