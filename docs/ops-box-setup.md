# Setting up a SOMABOX (school box)

This guide takes a Linux mini PC to a working school box: the LMS on the school's local network,
and connected to the SOMABOX cloud (soma-x-server on the VPS) for content and sync. It is written
for Ubuntu 24.04 or Debian 12.

**How a box works:**

```
learners' and teachers' devices ── school Wi-Fi/LAN ──▶ box
                                                          ├─ frontend :3001 (Next.js)
                                                          ├─ backend  :3000 (Express) ──▶ PostgreSQL
                                                          └─ AI gateway :5000 (optional, teachers)

box ── Ethernet, only sometimes ──▶ router or a computer sharing its internet ──▶ VPS
```

The box works fully **offline**. It reaches the cloud only while an Ethernet cable to a router,
or to a computer sharing its connection, is plugged in. That's enough: it notices the connection
and syncs straight away (see "How syncing works day to day").

## 1. Prepare the mini PC

- **Clock:** mini PCs keep time with a battery-backed clock. Check it once:
  ```bash
  timedatectl
  # "RTC in local TZ: no"   -> if "yes" (common after Windows): sudo timedatectl set-local-rtc 0
  # "NTP service: active"   -> if not: sudo timedatectl set-ntp true
  sudo timedatectl set-timezone Africa/Kigali
  ```
  If a box shows a date around 2000 or 2010 after a power cut, its clock battery is dead.
- **Network:** connect the Ethernet port the box will use for the internet. It gets an address
  by DHCP from the router, or from the computer sharing its connection, so nothing needs
  configuring.

## 2. Install the system packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git postgresql build-essential dmidecode

# Node.js 22 LTS, and pnpm through Corepack (comes with Node)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
```

## 3. Create the database

```bash
sudo -u postgres createuser --pwprompt somabox        # choose a password
sudo -u postgres createdb --owner somabox somabox_lms
```

## 4. Get the code

```bash
sudo adduser --disabled-password --gecos "" somabox
sudo -iu somabox
git clone https://github.com/SomaFoundationRwanda/somabox-lms.git
cd somabox-lms
pnpm install --frozen-lockfile   # backend, frontend, AI gateway and pm2, exactly as locked
```

## 5. Configure

Everything is set in one file, `.env` at the repository root: `cp .env.example .env`, then set:

| Setting | Value |
|---|---|
| `PGUSER` / `PGPASSWORD` / `PGDATABASE` | `somabox` / your password / `somabox_lms` |
| `SCHOOL_TIMEZONE` | `Africa/Kigali` |
| `BACKUP_DIR` | a different disk, ideally a USB drive (see `docs/ops-backup-restore.md`) |
| `PUBLIC_BACKEND_URL` | the address learners' devices use to reach the box's backend, e.g. its LAN address `http://10.0.0.1:3000` |
| `BACKEND_PORT`, `FRONTEND_PORT` | only if 3000 / 3001 are taken on this box |
| `CLOUD_URL`, `SYNC_URL`, `SYNC_TOKEN` | set in step 8 |

Every setting is checked at start-up; a wrong value stops the backend, the build or pm2 with a
message naming it.

This is fixed when the frontend is built, so rebuild after changing it.

## 6. Create the tables, build, and start

```bash
pnpm setup:db           # schema and all migrations
pnpm build              # builds the frontend
pnpm start              # pm2: backend :3000, frontend :3001, nightly backup job
pnpm exec pm2 save
pnpm exec pm2 startup   # prints one sudo command: run it so everything starts on boot
```

Check it: open `http://<box-address>:3001` from a laptop on the school network. `pnpm exec pm2 status`
should show `soma-x-backend` and `soma-x-frontend` online.

## 7. The box's identity

This lets the cloud tell boxes apart by serial number and MAC address, even after a reinstall:

```bash
cd ~/somabox-lms/scripts/linux
sudo install -m 0755 somabox-device-info.sh /usr/local/sbin/somabox-device-info.sh
sudo install -m 0644 somabox-device-info.service /etc/systemd/system/somabox-device-info.service
sudo systemctl daemon-reload
sudo systemctl enable --now somabox-device-info.service
cat /etc/somabox/device.json
pnpm exec pm2 restart soma-x-backend
```

More detail is in `scripts/linux/README.md`.

## 8. Connect the box to the cloud

1. **On the VPS**, register the box. Its key is printed once:
   ```bash
   cd ~/soma-x-server && npm run device:create -- --name "GS Kigali box 1" --location "Kigali, Gasabo"
   ```
2. **On the box**, in the root `.env`:
   ```bash
   CLOUD_URL=https://cloud.somaglobaltalent.org
   SYNC_URL=https://cloud.somaglobaltalent.org/api/v1/box-sync
   SYNC_TOKEN=sbx_...            # the key from step 1
   ```
   Then run `pnpm exec pm2 restart soma-x-backend`.

The same key is used for syncing and for downloading cloud content. Keep it private: anyone
with it can send data as this box.

## 9. First sign-in and school setup

1. Sign in as `admin@mail.com` / `admin`. You must set a new password immediately.
2. Open the **School** page and fill in the name, short code, province, district and
   rural/urban. Every sync sends these, so the cloud can report per school and district.
3. Open the **Sync** page:
   - Check **what leaves this box**. The default sends anonymous IDs only: no names, emails or
     written answers.
   - Connect the Ethernet cable and press **Sync now**. The status should say the box is online,
     and the run should succeed.
   - Under content, download the Rwandan education packs and Library books the school needs.
     Files marked as outdated have a newer copy in the cloud; downloading them again updates them.

On the VPS, `GET /api/v1/admin/stats/devices` should now list the box with its school.

## How syncing works day to day

- **Nothing to do by hand.** Whenever the cable is plugged in, the box notices within about
  10 seconds and pushes everything waiting. While it's connected, it keeps going every 30 seconds
  until nothing is left, then every 15 minutes (`SYNC_INTERVAL_MINUTES`).
- **Unplugged in the middle?** Nothing is lost. Unsent records stay queued. A download that
  was cut off says "failed", and pressing download again continues where it stopped.
- **Sharing a laptop's internet:** connect the laptop to the box with an Ethernet cable and turn
  on internet sharing for that cable:
  - **Windows:** Settings › Network › Mobile hotspot, or the Wi-Fi adapter's Properties › Sharing.
  - **macOS:** System Settings › General › Sharing › Internet Sharing, sharing to Ethernet.
  - **Ubuntu:** Settings › Network › the wired connection › IPv4 › "Shared to other computers".

## Optional: the teachers' AI assistant

It needs a model file and llama.cpp. Follow `ai/README.md`; the systemd units are
`ai/somabox-ai-runtime.service` and `ai/somabox-ai-gateway.service`.

## Updating a box

```bash
cd ~/somabox-lms
pnpm backup                                     # a backup first
git pull && pnpm install --frozen-lockfile && pnpm build
pnpm exec pm2 restart all                       # migrations apply on start
```

## Troubleshooting

| Symptom | Check |
|---|---|
| Sync page: "not set up" | `SYNC_URL` / `SYNC_TOKEN` missing in the root `.env`; restart the backend |
| "Couldn't reach the cloud" while the cable is in | The router or laptop has no internet, or it's off. Run `curl -I https://cloud.somaglobaltalent.org` on the box |
| "Cloud answered 401" | Wrong key; register again or rotate the key on the VPS. 403 means the box was revoked |
| Content list says the cloud is unreachable | `CLOUD_URL`, and the same internet checks |
| Wrong dates in reports | `timedatectl` (step 1) |
| Learners can't open the site | `PUBLIC_BACKEND_URL` in `.env` must be the box's LAN address; `pnpm build` after changing it |
