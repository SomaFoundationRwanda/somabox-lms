"use client";

import { useEffect } from "react";

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

/** Records item_opened once when a page/assignment/quiz/discussion detail page opens. */
export function useItemOpened(itemType, contentId, courseId) {
  useEffect(() => {
    if (!itemType || !contentId || !courseId) return;
    trackEvent("item_opened", { itemType, contentId: String(contentId) }, courseId);
  }, [itemType, contentId, courseId]);
}

const COURSE_OPENED_GAP_MS = 30 * 60 * 1000;

/**
 * Records course_opened once per course visit: at most once per course per browser session,
 * and again only after 30 minutes away from it.
 */
export function useCourseOpened(courseId, ready) {
  useEffect(() => {
    if (!courseId || !ready || typeof window === "undefined") return;
    const key = `somabox.courseOpened.${courseId}`;
    let last = 0;
    try { last = Number(window.sessionStorage.getItem(key)) || 0; } catch { last = 0; }
    const now = Date.now();
    if (now - last < COURSE_OPENED_GAP_MS) {
      try { window.sessionStorage.setItem(key, String(now)); } catch { /* ignore */ }
      return;
    }
    try { window.sessionStorage.setItem(key, String(now)); } catch { /* ignore */ }
    trackEvent("course_opened", {}, courseId);
  }, [courseId, ready]);
}
