"use client";

import { useContext, useEffect, useState } from "react";
import DataContext from "@/context/DataContext";

// GET /ai/status → { allowed, reason, modelRunning }. Fetched once per page: many components
// on one page (every week on the Modules page, every submission row) share one request.
const CACHE_MS = 30000;
let cached = null; // { at, promise }

function loadStatus(SERVER_URL) {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;
  const promise = fetch(`${SERVER_URL}/ai/status`)
    .then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { allowed: false, reason: data.message || "The AI assistant isn't available right now.", modelRunning: false };
      return { allowed: !!data.allowed, reason: data.reason || "", modelRunning: data.modelRunning !== false };
    })
    .catch(() => ({ allowed: false, reason: "Couldn't reach the server to check the AI assistant.", modelRunning: false }));
  cached = { at: Date.now(), promise };
  return promise;
}

/** { loading, allowed, reason, modelRunning } for the logged-in user. */
export default function useAiStatus() {
  const { SERVER_URL } = useContext(DataContext);
  const [status, setStatus] = useState({ loading: true, allowed: false, reason: "", modelRunning: true });

  useEffect(() => {
    if (!SERVER_URL) return undefined;
    let alive = true;
    loadStatus(SERVER_URL).then((s) => { if (alive) setStatus({ loading: false, ...s }); });
    return () => { alive = false; };
  }, [SERVER_URL]);

  return status;
}
