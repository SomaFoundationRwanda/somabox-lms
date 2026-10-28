"use client";

// What the app has loaded is kept on the device (per person), so a reload or a new tab shows the
// course straight away while it's checked with the box in the background, instead of a loader
// and a wave of requests. Kept small: only the person's own and course data, at most ~150 KB per
// piece and ~1.5 MB in all, for a day. Signing out removes it (lib/session.js).
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const PREFIX = "somabox.cache.";
const VERSION = 1;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRY = 150 * 1024;
const MAX_TOTAL = 1.5 * 1024 * 1024;

// Kept: the person's own data, their course list and their courses, the school's public look.
// Not kept: notifications, AI status, admin lists, the catalogue (large, and changes elsewhere).
const KEEP = (key) => Array.isArray(key) && (
  key[0] === "course"
  || (key[0] === "me")
  || (key[0] === "courses" && key[1] === "mine")
  || (key[0] === "school" && key[1] === "public")
);

const storageKey = (userId) => `${PREFIX}${userId}`;

/** Puts what was kept for this person back, marked as needing a check with the box. */
export function restoreCache(queryClient, userId) {
  let saved = null;
  try { saved = JSON.parse(window.localStorage.getItem(storageKey(userId)) || "null"); } catch { saved = null; }
  if (!saved || saved.v !== VERSION || Date.now() - Number(saved.at) > MAX_AGE_MS || !Array.isArray(saved.queries)) return 0;
  let restored = 0;
  for (const q of saved.queries) {
    if (!KEEP(q.key) || queryClient.getQueryData(q.key) !== undefined) continue;
    queryClient.setQueryData(q.key, q.data, { updatedAt: q.updatedAt });
    // Shown now, refreshed from the box when a screen uses it.
    queryClient.invalidateQueries({ queryKey: q.key, exact: true, refetchType: "none" });
    restored += 1;
  }
  return restored;
}

function saveCache(queryClient, userId) {
  const entries = [];
  for (const query of queryClient.getQueryCache().getAll()) {
    if (query.state.status !== "success" || query.state.data === undefined || !KEEP(query.queryKey)) continue;
    let json;
    try { json = JSON.stringify(query.state.data); } catch { continue; }
    if (json.length > MAX_ENTRY) continue;
    entries.push({ key: query.queryKey, updatedAt: query.state.dataUpdatedAt, json });
  }
  // Newest first, until the budget is used.
  entries.sort((a, b) => b.updatedAt - a.updatedAt);
  const queries = [];
  let total = 0;
  for (const e of entries) {
    if (total + e.json.length > MAX_TOTAL) continue;
    total += e.json.length;
    queries.push({ key: e.key, updatedAt: e.updatedAt, data: JSON.parse(e.json) });
  }
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify({ v: VERSION, at: Date.now(), queries }));
  } catch {
    // Storage full: keep nothing rather than something half written.
    try { window.localStorage.removeItem(storageKey(userId)); } catch { /* unavailable */ }
  }
}

/** Removes every person's kept data from this device. */
export function clearCachedData() {
  try {
    for (const k of Object.keys(window.localStorage)) if (k.startsWith(PREFIX)) window.localStorage.removeItem(k);
  } catch { /* storage unavailable */ }
}

/**
 * In the app layout, rendered once the person is known: restores their kept data before any
 * screen asks for it (during this render), then keeps it saved as it changes.
 */
export function usePersistedCache(userId) {
  const queryClient = useQueryClient();
  const restoredFor = useRef(null);
  if (userId && restoredFor.current !== userId && typeof window !== "undefined") {
    restoredFor.current = userId;
    restoreCache(queryClient, userId);
  }

  useEffect(() => {
    if (!userId) return undefined;
    let timer = null;
    const save = () => { clearTimeout(timer); timer = null; saveCache(queryClient, userId); };
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.type !== "updated" || event.action?.type !== "success") return;
      if (!timer) timer = setTimeout(save, 3000);
    });
    const onHide = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", save);
    return () => {
      unsubscribe();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", save);
    };
  }, [queryClient, userId]);
}
