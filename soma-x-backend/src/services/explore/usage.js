// "Someone opened this file": one content_opened usage event per person and file per half hour.
// usage_events is synced (sync scope "events"), so these reach the cloud with the rest of the
// box's records and can be reported per school, district, and catalogue item.
import { localDb } from "../../helpers/db-manager.js";
import { recordEvent } from "../insights/events.js";
import { cloudFile } from "../sync/cloud-content.js";
import { fileType, rootOf } from "./roots.js";

const REPEAT_WINDOW_MS = 30 * 60 * 1000;
const recent = new Map();

/** Videos and audio are fetched in many range requests; only the first (from byte 0) is an open. */
function isFirstRequest(req) {
  const range = req.headers.range;
  return !range || /^bytes=0-/.test(range);
}

function seenRecently(key, now) {
  const at = recent.get(key);
  if (at && now - at < REPEAT_WINDOW_MS) return true;
  recent.set(key, now);
  if (recent.size > 5000) {
    for (const [k, t] of recent) if (now - t >= REPEAT_WINDOW_MS) recent.delete(k);
  }
  return false;
}

/** Records the open without delaying or ever failing the file response. */
export function recordContentOpen(req, pathKey, user) {
  if (!isFirstRequest(req)) return;
  const who = user ? `u${user.id}` : `g${req.ip}`;
  if (seenRecently(`${who}|${pathKey}`, Date.now())) return;
  void (async () => {
    try {
      const [item, cloud] = await Promise.all([
        localDb.prepare("SELECT title FROM content_items WHERE path_key = ?").get(pathKey),
        cloudFile(pathKey),
      ]);
      await recordEvent(user ?? { id: null, role: "guest" }, null, "content_opened", {
        source: rootOf(pathKey)?.key ?? null,
        path: pathKey,
        title: item?.title ?? null,
        type: fileType(pathKey),
        ...(cloud ? { cloudContentId: String(cloud.cloud_id), cloudVersion: cloud.version } : {}),
      });
    } catch (error) {
      console.error("Could not record content_opened:", error.message);
    }
  })();
}

/** Tests only. */
export function resetContentOpens() {
  recent.clear();
}
