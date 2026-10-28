# Set up a SOMABOX device

For a Linux device that already has Node.js (22.12 or newer) and PostgreSQL with an empty
database. Everything runs as your normal user.

## 1. Clone and bring main up to date

```bash
git clone https://github.com/SomaFoundationRwanda/somabox-lms.git somabox
cd somabox
git fetch --all
git checkout main
git merge origin/dev
```

`origin/dev` has the latest work; merging it into `main` on the device is all that's needed.

## 2. Settings

Copy your working `.env` into this folder (next to `package.json`), then edit it:

```bash
nano .env
```

- `SYNC_TOKEN`: this device's token from the server
- `PGPASSWORD`: this device's `postgres` password
- add `PUBLIC_BACKEND_URL=http://<device-ip>:3000` (find the IP with `hostname -I`). **Required,
  and before step 5:** it is built into the website. Without it the website calls `localhost`,
  which is whichever computer opens the browser: on your own computer that is your local SOMABOX,
  with all its users.

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

## 8. Device serial number

So the server can tell each device apart (serial number, network cards). This only writes
`/etc/somabox/device.json` at every boot; the LMS reads it when it syncs.

```bash
sudo apt install -y dmidecode          # reads the serial number
cd ~/somabox/scripts/linux
sudo install -m 0755 somabox-device-info.sh /usr/local/sbin/somabox-device-info.sh
sudo install -m 0644 somabox-device-info.service /etc/systemd/system/somabox-device-info.service
sudo systemctl daemon-reload
sudo systemctl enable --now somabox-device-info.service
cat /etc/somabox/device.json           # check: "serialNumber" should not be null
cd ~/somabox
pnpm exec pm2 restart soma-x-backend
```

The admin **Sync** page then shows "This box" with the serial number and MAC addresses.

## Updating later

```bash
cd somabox
git fetch --all
git merge origin/dev
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
| Login page instead of setup, or users from another computer | `PUBLIC_BACKEND_URL` is missing or `localhost`: set the device's IP, `pnpm build`, `pnpm exec pm2 restart soma-x-frontend` |
| Anything else | `pnpm exec pm2 logs soma-x-backend --lines 50` |
