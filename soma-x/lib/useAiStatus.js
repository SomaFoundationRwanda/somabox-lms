"use client";

import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import DataContext from "@/context/DataContext";
import { apiFetch, ApiError } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

// GET /ai/status → { allowed, reason, modelRunning }. One kept answer for the whole app: many
// components on one page (every week on the Modules page, every submission row) share it.
// It's asked again only while the model is starting (allowed, but not running yet).
const STARTING_RECHECK_MS = 15000;

async function loadStatus() {
  try {
    const data = await apiFetch("/ai/status");
    return { allowed: !!data.allowed, reason: data.reason || "", modelRunning: data.modelRunning !== false };
  } catch (error) {
    const reason = error instanceof ApiError && error.status !== 0
      ? error.body?.message || "The AI assistant isn't available right now."
      : "Couldn't reach the server to check the AI assistant.";
    return { allowed: false, reason, modelRunning: false };
  }
}

/** { loading, allowed, reason, modelRunning } for the logged-in user. */
export default function useAiStatus() {
  const { authenticated } = useContext(DataContext);
  const query = useQuery({
    queryKey: queryKeys.aiStatus,
    queryFn: loadStatus,
    enabled: authenticated,
    refetchInterval: (q) => (q.state.data?.allowed && !q.state.data?.modelRunning ? STARTING_RECHECK_MS : false),
  });
  const status = query.data || { allowed: false, reason: "", modelRunning: true };
  return { loading: query.isPending, ...status };
}
