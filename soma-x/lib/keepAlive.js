"use client";

// Sessions end after 30 minutes without a request (soma-x-backend/src/helpers/auth.js), but
// someone writing a long answer or reading a long page sends none. While the person is actually
// using the page (typing, tapping, scrolling), this tells the box they're still here, at most
// every few minutes; a device left alone is signed out on time.
import { apiFetch } from "@/lib/api";

const PING_EVERY_MS = 5 * 60 * 1000;
const EVENTS = ["keydown", "pointerdown", "scroll", "touchstart"];

/** Starts watching for activity; returns a function that stops it. */
export function startActivityKeepAlive() {
  if (typeof window === "undefined") return () => {};
  let lastPing = Date.now();
  const onActivity = () => {
    if (Date.now() - lastPing < PING_EVERY_MS) return;
    lastPing = Date.now();
    apiFetch("/auth/me").catch(() => {});
  };
  for (const e of EVENTS) window.addEventListener(e, onActivity, { passive: true, capture: true });
  return () => {
    for (const e of EVENTS) window.removeEventListener(e, onActivity, { capture: true });
  };
}
