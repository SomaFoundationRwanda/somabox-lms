#!/usr/bin/env bash
# Sets up SOMABOX on a Linux box that already has Node.js and PostgreSQL (with an empty database).
#
#   1. git clone the repository and cd into it
#   2. copy your .env into the repository root (same folder as package.json)
#   3. bash scripts/linux/setup-box.sh
#
# The box starts empty: no users, subjects or files from any other machine. At the end the script
# prints a one-time setup code; open the site, enter it, and create the admin (e.g. admin@mail.com).
# Safe to run again (it updates and restarts); it stops if the database already has users,
# unless you run it with --existing-db.
set -euo pipefail

PNPM_VERSION=10.28.1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mStopped: %s\033[0m\n\n' "$*" >&2; exit 1; }
# A setting from .env ("" when it isn't there).
env_value() { { grep -E "^$1=" .env || true; } | tail -1 | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'; }

ALLOW_EXISTING=no
[ "${1:-}" = "--existing-db" ] && ALLOW_EXISTING=yes

[ "$(id -u)" -ne 0 ] || fail "run this as the normal user that will own SOMABOX, not as root (it asks for sudo when needed)."

step "Settings"
[ -f .env ] || fail "no .env in $ROOT. Copy your .env there first, then run this again."
BPORT="$(env_value BACKEND_PORT)"; BPORT="${BPORT:-3000}"
FPORT="$(env_value FRONTEND_PORT)"; FPORT="${FPORT:-3001}"
for key in PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE; do
  [ -n "$(env_value "$key")" ] || fail "$key is missing in .env."
done
if [ -z "$(env_value PUBLIC_BACKEND_URL)" ]; then
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  [ -n "$ip" ] || fail "PUBLIC_BACKEND_URL is missing in .env and this box's address couldn't be found. Add PUBLIC_BACKEND_URL=http://<box-ip>:3000 to .env."
  printf '\n# The address learners'"'"' devices use to reach this box (added by setup-box.sh)\nPUBLIC_BACKEND_URL=http://%s:%s\n' "$ip" "$BPORT" >> .env
  echo "Added PUBLIC_BACKEND_URL=$(env_value PUBLIC_BACKEND_URL) to .env (this box's network address)."
fi
echo "Database: $(env_value PGUSER)@$(env_value PGHOST):$(env_value PGPORT)/$(env_value PGDATABASE)"
echo "Backend address for browsers: $(env_value PUBLIC_BACKEND_URL)"

step "Node.js"
command -v node >/dev/null || fail "Node.js isn't installed."
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=12)?0:1)' \
  || fail "Node $(node -v) is too old: SOMABOX needs 22.12 or newer."
echo "Node $(node -v)"

step "Build tools"
if ! command -v make >/dev/null || ! command -v g++ >/dev/null || ! command -v python3 >/dev/null; then
  sudo apt-get update
  sudo apt-get install -y build-essential python3
fi
echo "ok"

step "pnpm"
if ! command -v pnpm >/dev/null; then
  if command -v corepack >/dev/null; then
    sudo corepack enable
    corepack prepare "pnpm@$PNPM_VERSION" --activate
  else
    sudo npm install -g "pnpm@$PNPM_VERSION"
  fi
  hash -r
fi
command -v pnpm >/dev/null || fail "pnpm didn't install. Try: sudo npm install -g pnpm@$PNPM_VERSION"
echo "pnpm $(pnpm -v)"

step "Installing packages"
pnpm install --frozen-lockfile

step "Checking the database is empty"
users="$(cd soma-x-backend && PGHOST="$(env_value PGHOST)" PGPORT="$(env_value PGPORT)" PGUSER="$(env_value PGUSER)" \
  PGPASSWORD="$(env_value PGPASSWORD)" PGDATABASE="$(env_value PGDATABASE)" node --input-type=module -e '
    import pg from "pg";
    const c = new pg.Client(); await c.connect();
    const t = await c.query("SELECT to_regclass($1) AS t", ["public.users"]);
    const n = t.rows[0].t ? (await c.query("SELECT COUNT(*)::int AS n FROM users")).rows[0].n : 0;
    console.log(n); await c.end();')" \
  || fail "couldn't connect to the database. Check PGUSER, PGPASSWORD and PGDATABASE in .env, and that the database exists."
if [ "$users" -gt 0 ] && [ "$ALLOW_EXISTING" = no ]; then
  fail "the database $(env_value PGDATABASE) already has $users user(s). To keep them and just update, run: bash scripts/linux/setup-box.sh --existing-db"
fi
echo "$users user(s)"

step "Creating the tables"
pnpm setup:db

step "Building the website (a few minutes)"
pnpm build

step "Starting SOMABOX"
PM2="$ROOT/node_modules/.bin/pm2"
"$PM2" startOrRestart ecosystem.config.cjs --only soma-x-backend,soma-x-frontend,soma-x-backup --update-env
"$PM2" save
sudo env PATH="$PATH" "$PM2" startup systemd -u "$USER" --hp "$HOME" >/dev/null
echo "SOMABOX starts by itself when the box boots."

step "Box identity (serial number, network cards)"
sudo install -m 0755 scripts/linux/somabox-device-info.sh /usr/local/sbin/somabox-device-info.sh
sudo install -m 0644 scripts/linux/somabox-device-info.service /etc/systemd/system/somabox-device-info.service
sudo systemctl daemon-reload
sudo systemctl enable --now somabox-device-info.service >/dev/null
"$PM2" restart soma-x-backend --update-env >/dev/null
echo "ok"

if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
  step "Firewall"
  sudo ufw allow "$BPORT/tcp"
  sudo ufw allow "$FPORT/tcp"
fi

step "Waiting for the backend"
for _ in $(seq 1 60); do
  curl -fs "http://localhost:$BPORT/school/public" >/dev/null && break
  sleep 2
done
curl -fs "http://localhost:$BPORT/school/public" >/dev/null \
  || fail "the backend didn't start. See: $PM2 logs soma-x-backend --lines 50"
echo "running"

if [ "$users" -eq 0 ]; then
  pnpm --silent setup:code
fi

printf '\nDone. Open http://%s:%s in a browser.\n' "$(hostname -I | awk '{print $1}')" "$FPORT"
[ "$users" -gt 0 ] || echo "Enter the setup code above, the school's name, and the admin's name, email and password."
echo "Each box needs its own SYNC_TOKEN (npm run device:create on the VPS): two boxes with the same key mix their data."
