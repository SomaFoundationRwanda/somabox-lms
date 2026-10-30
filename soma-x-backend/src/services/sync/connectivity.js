// Boxes are usually offline: they get internet only while an Ethernet cable to a router, or to a
// computer sharing its connection, is plugged in, sometimes for just a few minutes. This notices
// when that happens so the box syncs straight away instead of waiting out its retry backoff.
//
// Cheap by design: the network interfaces are read every few seconds (no traffic at all), and the
// cloud is only contacted when they change, or once a minute while the box is offline.
import os from "os";

/** The box's non-internal IPv4/IPv6 addresses, as one comparable string. */
export function addressSignature(interfaces = os.networkInterfaces()) {
  const out = [];
  for (const [name, addrs] of Object.entries(interfaces || {})) {
    for (const a of addrs || []) if (!a.internal) out.push(`${name}=${a.address}`);
  }
  return out.sort().join(",");
}

/** True if anything answers at `url` (any HTTP status), false if it can't be reached. */
export async function reachable(url, timeoutMs = 5000) {
  try {
    await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Calls onOnline() each time the box goes from offline (or unknown) to online.
 * `probe` checks the cloud; `interfaces` is injectable for tests.
 */
export function startConnectivityWatch({
  probe,
  onOnline,
  interfaces = () => os.networkInterfaces(),
  checkEveryMs = 10_000,
  probeOfflineEveryMs = 60_000,
} = {}) {
  const state = { online: null, since: null, lastProbeAt: null, signature: addressSignature(interfaces()) };
  let probing = false;
  let stopped = false;

  const set = (online, { notify = true } = {}) => {
    const cameOnline = notify && online && state.online !== true;
    if (online !== state.online) state.since = new Date().toISOString();
    state.online = online;
    if (cameOnline) {
      try {
        onOnline?.();
      } catch (error) {
        console.error("Connectivity callback failed:", error.message);
      }
    }
  };

  const check = async (force = false) => {
    if (probing || stopped) return;
    const signature = addressSignature(interfaces());
    const changed = signature !== state.signature;
    state.signature = signature;
    if (!signature) return set(false); // no network at all: nothing to ask
    const due = state.online !== true && Date.now() - (state.lastProbeAt ?? 0) >= probeOfflineEveryMs;
    if (!force && !changed && !due) return;
    probing = true;
    try {
      state.lastProbeAt = Date.now();
      set(await probe());
    } finally {
      probing = false;
    }
  };

  const timer = setInterval(() => void check(), checkEveryMs);
  timer.unref?.();
  void check(true);

  return {
    state,
    /** What a sync attempt just learned (success = online, failure = offline); never re-triggers sync. */
    report(online) {
      set(online, { notify: false });
    },
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
