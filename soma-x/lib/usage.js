"use client";

// Batched usage events (POST /analytics/events). Fire-and-forget: never blocks the UI and
// silently drops events if the box is unreachable.
const queue = [];
let timer = null;
const FLUSH_MS = 5000;
const MAX_BATCH = 20;

function flush() {
  timer = null;
  if (!queue.length) return;
  const serverUrl = process.env.NEXT_PUBLIC_SERVER_URL;
  const events = queue.splice(0, MAX_BATCH);
  if (!serverUrl) return;
  fetch(`${serverUrl}/analytics/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
    keepalive: true,
  }).catch(() => {});
  if (queue.length) timer = setTimeout(flush, 0);
}

export function trackEvent(type, data = {}, courseId = null) {
  if (typeof window === "undefined") return;
  queue.push({ type, data, ...(courseId ? { courseId: String(courseId) } : {}) });
  if (queue.length >= MAX_BATCH) flush();
  else if (!timer) timer = setTimeout(flush, FLUSH_MS);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flush);
}
