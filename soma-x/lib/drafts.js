"use client";

// Typing kept on this device until it's sent, so a refresh, a crash or a lost connection doesn't
// lose it. Drafts are per person (a shared classroom device never shows one learner's text to
// the next), live in localStorage, and expire after two weeks.
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import DataContext from "@/context/DataContext";

const PREFIX = "somabox.draft.";
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const storageKey = (userId, key) => `${PREFIX}${userId}.${key}`;

/** { v, at } kept for this person and key, or null. */
export function readDraft(userId, key) {
  try {
    const raw = window.localStorage.getItem(storageKey(userId, key));
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || Date.now() - Number(draft.at) > MAX_AGE_MS) {
      window.localStorage.removeItem(storageKey(userId, key));
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function writeDraft(userId, key, value) {
  try {
    window.localStorage.setItem(storageKey(userId, key), JSON.stringify({ v: value, at: Date.now() }));
  } catch { /* storage full or unavailable: nothing kept */ }
}

export function clearDraft(userId, key) {
  try {
    window.localStorage.removeItem(storageKey(userId, key));
  } catch { /* storage unavailable */ }
}

/** Removes every draft on this device (when someone signs out themselves). */
export function clearAllDrafts() {
  try {
    for (const k of Object.keys(window.localStorage)) if (k.startsWith(PREFIX)) window.localStorage.removeItem(k);
  } catch { /* storage unavailable */ }
}

/**
 * A text box's value kept as a draft under `key` (null: not kept). Restored after a refresh;
 * `clear()` once it was sent. Returns [value, setValue, clear, restored] where `restored` is
 * true when the text came back from a draft.
 */
export function useDraftText(key, initial = "") {
  const { user } = useContext(DataContext);
  const userId = user?.id;
  const [value, setValue] = useState(initial);
  const [restored, setRestored] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!key || !userId || loaded.current) return;
    loaded.current = true;
    const draft = readDraft(userId, key);
    if (draft && typeof draft.v === "string" && draft.v) {
      setValue(draft.v);
      setRestored(true);
    }
  }, [key, userId]);

  // Only text the person changed is kept (what the box started with is already saved).
  const initialRef = useRef(initial);
  useEffect(() => {
    if (!key || !userId || !loaded.current) return undefined;
    const changed = value && value !== initialRef.current;
    const timer = setTimeout(() => (changed ? writeDraft(userId, key, value) : clearDraft(userId, key)), 300);
    return () => clearTimeout(timer);
  }, [key, userId, value]);

  // { keep: true }: forget the draft but leave the text (e.g. feedback that was just saved).
  const clear = useCallback((options) => {
    if (key && userId) clearDraft(userId, key);
    if (options?.keep) initialRef.current = value;
    if (!options?.keep) setValue("");
    setRestored(false);
  }, [key, userId, value]);

  return [value, setValue, clear, restored];
}

/**
 * A whole form kept as a draft under `key` while it has unsaved changes (`dirty`). A draft
 * found when the form opens is offered, not applied: `saved` ({ v, at }), then `restore()`
 * (returns the values to put back) or `discard()`. `clear()` after saving.
 */
export function useFormDraft(key, values, dirty) {
  const { user } = useContext(DataContext);
  const userId = user?.id;
  const [saved, setSaved] = useState(null);
  const checked = useRef(false);
  const json = JSON.stringify(values ?? null);

  useEffect(() => {
    if (!key || !userId || checked.current) return;
    checked.current = true;
    const draft = readDraft(userId, key);
    if (draft) setSaved(draft);
  }, [key, userId]);

  useEffect(() => {
    // While a found draft waits for an answer, it isn't overwritten.
    if (!key || !userId || !checked.current || saved) return undefined;
    const timer = setTimeout(() => (dirty ? writeDraft(userId, key, JSON.parse(json)) : clearDraft(userId, key)), 400);
    return () => clearTimeout(timer);
  }, [key, userId, json, dirty, saved]);

  return {
    saved,
    restore: () => {
      const v = saved?.v;
      setSaved(null);
      return v;
    },
    discard: () => {
      if (key && userId) clearDraft(userId, key);
      setSaved(null);
    },
    clear: () => {
      if (key && userId) clearDraft(userId, key);
    },
  };
}
