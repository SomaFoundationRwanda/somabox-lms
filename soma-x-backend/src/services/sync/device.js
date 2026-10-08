// This box's identity for the cloud: the hardware details written by
// scripts/linux/somabox-device-info.sh (serial number, MAC addresses, machine id; reading the
// serial needs root, so the script runs as root at boot), with what the server can read itself
// as a fallback. Sent with every sync so boxes can be told apart even if one is reinstalled.
import fs from 'fs';
import os from 'os';
import { localDb } from '../../helpers/db-manager.js';

const DEVICE_FILE = () => process.env.DEVICE_INFO_PATH || '/etc/somabox/device.json';

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

function readText(file) {
    try {
        return fs.readFileSync(file, 'utf8').trim() || null;
    } catch {
        return null;
    }
}

/** What the server process can see without root. */
function selfReported() {
    const macs = [];
    for (const [iface, addrs] of Object.entries(os.networkInterfaces())) {
        const mac = addrs?.find((a) => !a.internal && a.mac && a.mac !== '00:00:00:00:00:00')?.mac;
        if (mac && !macs.some((m) => m.mac === mac)) macs.push({ interface: iface, mac, physical: null });
    }
    return {
        serialNumber: null,
        machineId: readText('/etc/machine-id') || readText('/var/lib/dbus/machine-id'),
        macAddresses: macs,
        hostname: os.hostname(),
        model: null,
        os: `${os.type()} ${os.release()}`,
        kernel: os.release(),
        arch: os.arch(),
        memoryBytes: os.totalmem(),
    };
}

/** { ...hardware details, source: 'script'|'server', collectedAt } */
export function deviceInfo() {
    const fromScript = readJson(DEVICE_FILE());
    const fallback = selfReported();
    if (!fromScript) return { ...fallback, source: 'server', collectedAt: new Date().toISOString() };
    const merged = { ...fallback };
    for (const [k, v] of Object.entries(fromScript)) {
        if (v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)) merged[k] = v;
    }
    return { ...merged, source: 'script' };
}

/** The box's recent sync runs (what the cloud is told about how syncing has gone). */
export async function syncHistory(limit = 20) {
    const rows = await localDb.prepare('SELECT started_at, finished_at, status, details FROM sync_log ORDER BY id DESC LIMIT ?').all(limit);
    return rows.map((r) => {
        let details = r.details;
        try { details = JSON.parse(r.details); } catch { /* plain text */ }
        return { startedAt: r.started_at, finishedAt: r.finished_at, status: r.status, details };
    });
}
