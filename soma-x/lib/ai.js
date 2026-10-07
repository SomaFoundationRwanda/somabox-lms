"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Shared helpers for AI jobs and drafts. AI output is always a draft: nothing reaches learners
// until a teacher approves the draft (which creates UNPUBLISHED items) and then publishes them.

export const JOB_KIND_LABELS = {
  fill_week: "Fill the week",
  story: "Story",
  quiz: "Quiz",
  outline: "Course outline",
  outcome_rewrite: "Outcome rewrite",
  rubric: "Rubric",
  grading: "Grading suggestion",
};

export const DRAFT_TYPE_LABELS = {
  page: "Page",
  quiz: "Quiz",
  assignment: "Assignment",
  story: "Story",
  outline: "Course outline",
  outcome: "Outcome",
  rubric: "Rubric",
  grading: "Grading suggestion",
};

export const ACTIVE_STATUSES = ["queued", "running"];
export const isActiveJob = (job) => !!job && ACTIVE_STATUSES.includes(job.status);

/** fetch + JSON + server message. Returns { ok, status, data, message }. */
export async function aiFetch(url, { method = "GET", body } = {}) {
  try {
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data, message: data?.message || (res.ok ? "" : "Something went wrong. Try again.") };
  } catch (err) {
    return { ok: false, status: 0, data: null, message: err?.message || "Couldn't reach the server." };
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
 * Follows one job: polls every 3s while queued/running. Returns { job, error, cancel, cancelling }.
 * onFinish(job) runs once when the job reaches done/failed/cancelled.
 */
export function useAiJob(SERVER_URL, courseId, jobId, { initial = null, onFinish } = {}) {
  const [job, setJob] = useState(initial);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const finishRef = useRef(onFinish);
  finishRef.current = onFinish;
  const finishedFor = useRef(null);

  useEffect(() => {
    setJob(initial && initial.id === jobId ? initial : null);
    setError("");
    if (!SERVER_URL || !courseId || !jobId) return undefined;
    let alive = true;
    let timer = null;
    const tick = async () => {
      const r = await aiFetch(`${SERVER_URL}/courses/${courseId}/ai/jobs/${jobId}`);
      if (!alive) return;
      if (!r.ok) {
        setError(r.message);
        timer = setTimeout(tick, 6000);
        return;
      }
      setError("");
      setJob(r.data);
      if (isActiveJob(r.data)) {
        timer = setTimeout(tick, 3000);
      } else if (finishedFor.current !== jobId) {
        finishedFor.current = jobId;
        finishRef.current?.(r.data);
      }
    };
    tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SERVER_URL, courseId, jobId]);

  const cancel = useCallback(async () => {
    if (!jobId) return { ok: false };
    setCancelling(true);
    const r = await cancelAiJob(SERVER_URL, courseId, jobId);
    setCancelling(false);
    if (r.ok) setJob(r.data);
    else setError(r.message);
    return r;
  }, [SERVER_URL, courseId, jobId]);

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
