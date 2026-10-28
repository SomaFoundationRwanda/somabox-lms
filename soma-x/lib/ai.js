"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch, apiUrl, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

// Shared helpers for AI jobs and drafts. AI output is always a draft: nothing reaches learners
// until a teacher approves the draft (which creates UNPUBLISHED items) and then publishes them.

export const JOB_KIND_LABELS = {
  fill_week: "Fill the lesson",
  story: "Story",
  quiz: "Quiz",
  outline: "Subject outline",
  outcome_rewrite: "Outcome rewrite",
  rubric: "Rubric",
  grading: "Grading suggestion",
  class_summary: "Class summary",
};

export const DRAFT_TYPE_LABELS = {
  page: "Page",
  quiz: "Quiz",
  assignment: "Assignment",
  story: "Story",
  outline: "Subject outline",
  outcome: "Outcome",
  rubric: "Rubric",
  grading: "Grading suggestion",
};

export const ACTIVE_STATUSES = ["queued", "running"];
export const isActiveJob = (job) => !!job && ACTIVE_STATUSES.includes(job.status);

// A backend path from a full URL (callers pass `${SERVER_URL}/courses/...`).
function backendPath(url) {
  const base = apiUrl("");
  return base && url.startsWith(base) ? url.slice(base.length) : url;
}

/** apiFetch, answered as { ok, status, data, message } instead of throwing. */
export async function aiFetch(url, { method = "GET", body } = {}) {
  try {
    const data = await apiFetch(backendPath(url), { method, ...(body !== undefined ? { json: body } : {}) });
    return { ok: true, status: 200, data: data ?? null, message: "" };
  } catch (err) {
    if (err instanceof ApiError && err.status !== 0) {
      return { ok: false, status: err.status, data: err.body, message: err.body?.message || "Something went wrong. Try again." };
    }
    return { ok: false, status: 0, data: null, message: getErrorMessage(err) || "Couldn't reach the server." };
  }
}

export const startAiJob = (SERVER_URL, courseId, body) =>
  aiFetch(`${SERVER_URL}/courses/${courseId}/ai/jobs`, { method: "POST", body });

export const cancelAiJob = (SERVER_URL, courseId, jobId) =>
  aiFetch(`${SERVER_URL}/courses/${courseId}/ai/jobs/${jobId}/cancel`, { method: "POST", body: {} });

export const approveDraft = (SERVER_URL, courseId, draftId) =>
  aiFetch(`${SERVER_URL}/courses/${courseId}/ai/drafts/${draftId}/approve`, { method: "POST", body: {} });

export const rejectDraft = (SERVER_URL, courseId, draftId) =>
  aiFetch(`${SERVER_URL}/courses/${courseId}/ai/drafts/${draftId}/reject`, { method: "POST", body: {} });

export const saveDraftPayload = (SERVER_URL, courseId, draftId, payload) =>
  aiFetch(`${SERVER_URL}/courses/${courseId}/ai/drafts/${draftId}`, { method: "PATCH", body: { payload } });

/** "Queued: 2 ahead of you" / "Working: step 1 of 4" for a job. */
export function jobStatusText(job) {
  if (!job) return "";
  if (job.status === "queued") {
    return job.position > 0 ? `Waiting: ${job.position} ahead of you` : "Waiting to start";
  }
  if (job.status === "running") {
    return job.total > 1 ? `Working: step ${Math.min(job.progress + 1, job.total)} of ${job.total}` : "Working";
  }
  if (job.status === "done") return "Finished";
  if (job.status === "failed") return job.error || "It didn't work";
  if (job.status === "cancelled") return "Cancelled";
  return job.status;
}

/**
 * Follows one job: asks every 3s while queued/running (6s after a failed check), then stops.
 * Returns { job, error, cancel, cancelling }. onFinish(job) runs once when the job reaches
 * done/failed/cancelled.
 */
export function useAiJob(SERVER_URL, courseId, jobId, { initial = null, onFinish } = {}) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.courseSection(courseId, `ai/jobs/${jobId}`);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const finishedFor = useRef(null);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const r = await aiFetch(`/courses/${courseId}/ai/jobs/${jobId}`);
      if (!r.ok) throw new Error(r.message);
      return r.data;
    },
    enabled: !!SERVER_URL && !!courseId && !!jobId,
    initialData: initial && initial.id === jobId ? initial : undefined,
    // A running job's progress: the one kind of thing that is asked for on a timer.
    refetchInterval: (q) => (q.state.status === "error" ? 6000 : isActiveJob(q.state.data) || !q.state.data ? 3000 : false),
    retry: false,
  });
  const job = query.data ?? null;

  useEffect(() => {
    if (job && job.id === jobId && !isActiveJob(job) && finishedFor.current !== jobId) {
      finishedFor.current = jobId;
      finishRef.current?.(job);
    }
  }, [job, jobId]);

  const cancel = useCallback(async () => {
    if (!jobId) return { ok: false };
    setCancelling(true);
    const r = await cancelAiJob(SERVER_URL, courseId, jobId);
    setCancelling(false);
    if (r.ok) {
      setCancelError("");
      queryClient.setQueryData(queryKey, r.data);
    } else setCancelError(r.message);
    return r;
  }, [SERVER_URL, courseId, jobId, queryClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const error = cancelError || (query.isError ? query.error.message : "");
  return { job, error, cancel, cancelling };
}

/** Where to look at what an approved draft created. */
export function draftResultLink(draft, courseId) {
  const refs = draft?.resultRefs || {};
  if (draft?.type === "rubric" && draft.assignmentId) return { href: `/course/${courseId}/assignments/${draft.assignmentId}`, label: "Open the assignment" };
  if (draft?.type === "outcome") return { href: `/course/${courseId}/outcomes`, label: "Open Outcomes" };
  if (refs.modules?.length || refs.pages?.length || refs.quizzes?.length || refs.assignments?.length || refs.discussions?.length || draft?.moduleId) {
    return { href: `/course/${courseId}/modules`, label: "Open Modules to review and publish" };
  }
  if (refs.outcomes?.length) return { href: `/course/${courseId}/outcomes`, label: "Open Outcomes" };
  return { href: `/course/${courseId}/modules`, label: "Open Modules" };
}
