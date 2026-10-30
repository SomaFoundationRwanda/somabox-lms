#!/usr/bin/env bash
# Collects this box's hardware identity (serial number, MAC addresses, machine id, model, OS) and
# writes it as JSON for the LMS backend, which sends it to the cloud with every sync so each box
# can be told apart. Reading the serial number needs root, so run it as root (the systemd unit
# in this folder does that at every boot).
#
#   sudo ./somabox-device-info.sh                 # writes /etc/somabox/device.json
#   sudo ./somabox-device-info.sh /path/out.json  # writes somewhere else
#   ./somabox-device-info.sh -                    # prints to stdout only
#
# Works on Debian/Ubuntu/Raspberry Pi OS and other Linux distributions; anything it can't read
# is left null. Needs only bash and coreutils (dmidecode is used if installed).
set -u

OUT="${1:-/etc/somabox/device.json}"

# JSON-escape a string (backslash, quote, control characters).
json_str() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/ }"
  s="${s//$'\r'/}"
  s="${s//$'\t'/ }"
  printf '"%s"' "$s"
}
# A value or null; empty and placeholder serials count as missing.
json_or_null() {
  local v
  v="$(printf '%s' "${1:-}" | tr -d '\000' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  case "$v" in
    ""|"None"|"none"|"Not Specified"|"Not Applicable"|"To Be Filled By O.E.M."|"To be filled by O.E.M."|"Default string"|"System Serial Number"|"0"|"00000000"|"0000000000000000"|"123456789")
      printf 'null' ;;
    *) json_str "$v" ;;
  esac
}
read_file() { [ -r "$1" ] && tr -d '\000' < "$1" 2>/dev/null | head -c 256; }

# --- Serial number: firmware (PCs), then device tree / cpuinfo (Raspberry Pi and other boards) ---
serial=""
for f in /sys/class/dmi/id/product_serial /sys/class/dmi/id/board_serial /sys/class/dmi/id/chassis_serial; do
  v="$(read_file "$f")"
  if [ -n "$v" ] && [ "$(json_or_null "$v")" != "null" ]; then serial="$v"; break; fi
done
if [ -z "$serial" ] && command -v dmidecode >/dev/null 2>&1; then
  v="$(dmidecode -s system-serial-number 2>/dev/null | head -n1)"
  [ "$(json_or_null "$v")" != "null" ] && serial="$v"
fi
if [ -z "$serial" ]; then
  v="$(read_file /sys/firmware/devicetree/base/serial-number)"
  [ "$(json_or_null "$v")" != "null" ] && serial="$v"
fi
if [ -z "$serial" ] && [ -r /proc/cpuinfo ]; then
  v="$(awk -F': *' '/^Serial/ {print $2; exit}' /proc/cpuinfo)"
  [ "$(json_or_null "$v")" != "null" ] && serial="$v"
fi

# --- Model -----------------------------------------------------------------------------------
model="$(read_file /sys/firmware/devicetree/base/model)"
if [ -z "$model" ]; then
  vendor="$(read_file /sys/class/dmi/id/sys_vendor)"
  product="$(read_file /sys/class/dmi/id/product_name)"
  model="$(printf '%s %s' "$vendor" "$product" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
fi

# --- Network interfaces: physical ones first (they have a device), then the rest; no loopback ---
macs=""
if [ -d /sys/class/net ]; then
  for iface_path in /sys/class/net/*; do
    iface="$(basename "$iface_path")"
    [ "$iface" = "lo" ] && continue
    # Ethernet and Wi-Fi only (link type 1); tunnels and other virtual links have no real address.
    [ "$(read_file "$iface_path/type")" = "1" ] || continue
    mac="$(read_file "$iface_path/address")"
    [ -n "$mac" ] || continue
    [ -z "$(printf '%s' "$mac" | tr -d '0:')" ] && continue
    physical=false
    [ -e "$iface_path/device" ] && physical=true
    entry="{\"interface\":$(json_str "$iface"),\"mac\":$(json_str "$mac"),\"physical\":$physical}"
    if [ -n "$macs" ]; then macs="$macs,$entry"; else macs="$entry"; fi
  done
fi

# --- Everything else ---------------------------------------------------------------------------
machine_id="$(read_file /etc/machine-id)"
[ -z "$machine_id" ] && machine_id="$(read_file /var/lib/dbus/machine-id)"
os_name=""
if [ -r /etc/os-release ]; then os_name="$(. /etc/os-release 2>/dev/null; printf '%s' "${PRETTY_NAME:-}")"; fi
[ -z "$os_name" ] && os_name="$(uname -s)"
disk_total=""
if command -v df >/dev/null 2>&1; then disk_total="$(df -Pk / 2>/dev/null | awk 'NR==2 {print $2 * 1024}')"; fi
mem_total=""
[ -r /proc/meminfo ] && mem_total="$(awk '/^MemTotal:/ {print $2 * 1024; exit}' /proc/meminfo)"

json="{
  \"serialNumber\": $(json_or_null "$serial"),
  \"machineId\": $(json_or_null "$machine_id"),
  \"macAddresses\": [${macs}],
  \"hostname\": $(json_or_null "$(hostname 2>/dev/null)"),
  \"model\": $(json_or_null "$model"),
  \"os\": $(json_or_null "$os_name"),
  \"kernel\": $(json_or_null "$(uname -r)"),
  \"arch\": $(json_or_null "$(uname -m)"),
  \"diskBytes\": ${disk_total:-null},
  \"memoryBytes\": ${mem_total:-null},
  \"collectedAt\": $(json_str "$(date -u +%Y-%m-%dT%H:%M:%SZ)"),
  \"collectedAsRoot\": $( [ "$(id -u)" = "0" ] && echo true || echo false )
}"

if [ "$OUT" = "-" ]; then
  printf '%s\n' "$json"
  exit 0
fi
mkdir -p "$(dirname "$OUT")" || { echo "Can't create $(dirname "$OUT")" >&2; exit 1; }
tmp="$OUT.tmp.$$"
printf '%s\n' "$json" > "$tmp" && chmod 0644 "$tmp" && mv "$tmp" "$OUT" || { echo "Can't write $OUT" >&2; rm -f "$tmp"; exit 1; }
echo "Wrote $OUT"
