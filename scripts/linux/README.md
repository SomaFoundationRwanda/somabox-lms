# Box scripts (Linux)

## `somabox-device-info.sh`: this box's identity
It collects what identifies this box and writes it to `/etc/somabox/device.json`:
- serial number (from the firmware on PCs, or from the board on a Raspberry Pi)
- the MAC addresses of its Ethernet and Wi-Fi cards
- machine id
- model, operating system, disk and memory size

The LMS reads that file and sends it to the cloud (VPS) with every sync, together with the box's
recent sync history. That way each box can be told apart, even after a reinstall.

Reading the serial number needs administrator (root) rights, so the script runs as root, once at
every start, through systemd.

### Install (once, on the box)
```bash
cd /path/to/somabox-lms/scripts/linux
sudo install -m 0755 somabox-device-info.sh /usr/local/sbin/somabox-device-info.sh
sudo install -m 0644 somabox-device-info.service /etc/systemd/system/somabox-device-info.service
sudo systemctl daemon-reload
sudo systemctl enable --now somabox-device-info.service
cat /etc/somabox/device.json          # check it
```
Then restart the LMS backend (`npm run pm2:restart`). The admin **Sync** page shows "This box"
with the serial number and MAC addresses.

### Run it by hand
```bash
sudo ./somabox-device-info.sh          # writes /etc/somabox/device.json
./somabox-device-info.sh -             # prints the JSON (without root, the serial may be missing)
```

**Requirements:** bash and coreutils. `dmidecode` is used if it is installed.

**Tested on:** Debian 12, Ubuntu 24.04, and Raspberry Pi-style boards (`/proc/cpuinfo` serial).

**Anything the script can't read is left `null`.** Without the file, the LMS falls back to what it
can see itself (hostname, MAC addresses, machine id), with no serial number.

**Settings:**
- `DEVICE_INFO_PATH` (backend `.env`): where the backend reads the file. The default is
  `/etc/somabox/device.json`.
