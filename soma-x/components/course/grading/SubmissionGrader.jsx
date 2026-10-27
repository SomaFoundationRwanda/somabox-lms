"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Clock, Sparkles } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { rubricGradePreview, fmtPoints, pctOf } from "@/lib/rubric";
import useAiStatus from "@/lib/useAiStatus";
import { startAiJob, rejectDraft, useAiJob } from "@/lib/ai";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { AiDraftLabel, JobProgress } from "@/components/ai/AiBits";
import { trackEvent } from "@/lib/usage";
import { useProgressText, fmtDateTime } from "@/components/progress/text";
import { Fieldset, Label, TextInput, Textarea } from "@/components/form";

// Gradings that take longer than this were left open, not worked on: don't report them.
const MAX_GRADING_MS = 2 * 60 * 60 * 1000;

export function LateBadge() {
  const { tp } = useProgressText();
  return (
    <span className="inline-flex items-center gap-0.5 text-caption font-bold text-warning-fg bg-warning-soft border border-warning/30 rounded-full px-1.5 py-0.5">
      <Clock className="w-3 h-3" aria-hidden="true" /> {tp("common.late")}
    </span>
  );
}

const initialScores = (rubric, submission) => {
  const out = {};
  for (const s of submission?.rubricScores || []) out[s.criterion_id] = s.points == null ? "" : String(s.points);
  // Criterion ids change when the rubric is re-saved; keep only scores for current criteria.
  const ids = new Set((rubric?.criteria || []).map((c) => c.id));
  for (const k of Object.keys(out)) if (!ids.has(Number(k))) delete out[k];
  return out;
};

// One learner's row in the teacher's submissions list. Collapsed: name, date, late badge,
// grade. Expanded: the submission body plus rubric scoring (or a plain total without one).
export default function SubmissionGrader({ courseId, assignmentId, submission, rubric, pointsPossible, onSaved, defaultOpen = false }) {
  // Still passed to the AI helpers (lib/ai.js).
  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;
  const { showToast } = useToast();
  const { tp, locale } = useProgressText();
  const s = submission;
  const [open, setOpen] = useState(defaultOpen);
  const [scores, setScores] = useState(() => initialScores(rubric, s));
  const [grade, setGrade] = useState(s.grade ?? "");
  const [feedback, setFeedback] = useState(s.feedback ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const criteria = rubric?.criteria || [];

  // When this learner's grading panel was opened (for the grading_time usage event).
  const openedAt = useRef(defaultOpen ? Date.now() : null);
  useEffect(() => {
    openedAt.current = open ? Date.now() : null;
  }, [open]);

  // ---- AI grading help (rubric grading only) ----
  const aiStatus = useAiStatus();
  const hasText = !!(s.submitted_at && String(s.body || "").trim());
  const aiAvailable = !!rubric && aiStatus.allowed && hasText;
  const [suggestion, setSuggestion] = useState(null); // pending grading draft, if any
  const [aiApplied, setAiApplied] = useState(null); // { draftId, reasons, before: { scores, feedback } }
  const [aiJob, setAiJob] = useState(null);
  const [aiError, setAiError] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const suggestionPath = `/courses/${courseId}/ai/grading-suggestion?assignmentId=${encodeURIComponent(assignmentId)}&scholarEmail=${encodeURIComponent(s.scholar_email)}`;

  const fetchSuggestion = async () => {
    let data;
    try {
      data = await apiFetch(suggestionPath);
    } catch (err) {
      setAiError(getErrorMessage(err));
      return null;
    }
    const sug = data && data.status === "pending" ? data : null;
    setSuggestion(sug);
    return sug;
  };

  useEffect(() => {
    if (open && aiAvailable && suggestion === null && !aiApplied) fetchSuggestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, aiAvailable]);

  const applySuggestion = (sug) => {
    if (!sug) return;
    const ids = new Set(criteria.map((c) => Number(c.id)));
    const nextScores = { ...scores };
    const reasons = {};
    for (const sc of sug.payload?.scores || []) {
      const id = Number(sc.criterionId);
      if (!ids.has(id)) continue;
      if (sc.points != null && Number.isFinite(Number(sc.points))) nextScores[id] = String(sc.points);
      if (sc.reason) reasons[id] = sc.reason;
    }
    const appliedFeedback = sug.payload?.feedback ? sug.payload.feedback : feedback;
    setAiApplied({ draftId: sug.id, reasons, before: { scores, feedback }, applied: { scores: nextScores, feedback: appliedFeedback } });
    setScores(nextScores);
    if (sug.payload?.feedback) setFeedback(sug.payload.feedback);
    setError("");
  };

  const { job: aiJobLive, cancel: cancelAiJob, cancelling: aiCancelling } = useAiJob(SERVER_URL, courseId, aiJob?.id, {
    initial: aiJob,
    onFinish: async (j) => {
      if (j.status === "done") {
        const sug = await fetchSuggestion();
        if (sug) applySuggestion(sug);
        else setAiError(tp("grader.noSuggestion"));
        setAiJob(null);
      } else if (j.status === "failed") {
        setAiError(j.error || tp("grader.suggestFailed"));
        setAiJob(null);
      } else {
        setAiJob(null);
      }
    },
  });

  const startSuggestion = async () => {
    setAiError("");
    setAiBusy(true);
    const r = await startAiJob(SERVER_URL, courseId, { kind: "grading", assignmentId: Number(assignmentId), scholarEmail: s.scholar_email });
    setAiBusy(false);
    if (!r.ok) { setAiError(r.message); return; }
    setAiJob(r.data);
  };

  const dismissSuggestion = async () => {
    const id = aiApplied?.draftId || suggestion?.id;
    if (!id) return;
    setAiBusy(true);
    const r = await rejectDraft(SERVER_URL, courseId, id);
    setAiBusy(false);
    if (!r.ok) { setAiError(r.message); return; }
    if (aiApplied) {
      setScores(aiApplied.before.scores);
      setFeedback(aiApplied.before.feedback);
    }
    setAiApplied(null);
    setSuggestion(null);
  };
  const preview = rubric ? rubricGradePreview(criteria, scores, pointsPossible) : null;
  const pct = pctOf(s.grade, pointsPossible);
  const panelId = `grade-panel-${s.scholar_email.replace(/[^a-z0-9]/gi, "-")}`;
  const gradePath = `/courses/${courseId}/assignments/${assignmentId}/grade/${encodeURIComponent(s.scholar_email)}`;

  const save = async () => {
    setError("");
    let req;
    if (rubric) {
      const payloadScores = [];
      for (const c of criteria) {
        const raw = scores[c.id];
        const v = Number(raw);
        if (raw === undefined || raw === "" || !Number.isFinite(v)) { setError(tp("grader.scoreMissing", { title: c.title })); return; }
        if (v < 0 || v > Number(c.points)) { setError(tp("grader.outOfRange", { title: c.title, max: fmtPoints(c.points) })); return; }
        payloadScores.push({ criterionId: c.id, points: v });
      }
      req = () => apiFetch(`${gradePath}/rubric`, { method: "PUT", json: { scores: payloadScores, feedback, ...(aiApplied ? { aiDraftId: aiApplied.draftId } : {}) } });
    } else {
      const v = Number(grade);
      if (grade === "" || !Number.isFinite(v)) { setError(tp("grader.enterGrade")); return; }
      req = () => apiFetch(gradePath, { method: "PATCH", json: { grade: v, feedback } });
    }
    setSaving(true);
    try {
      const refused = await req().then(() => null).catch((err) => {
        if (err?.status === 0) throw new Error(getErrorMessage(err));
        return err?.body || {};
      });
      if (refused) {
        setError(refused.code === "RUBRIC_REQUIRED"
          ? refused.message || tp("grader.rubricRequired")
          : refused.message || tp("grader.saveFailed"));
        if (refused.code === "RUBRIC_REQUIRED") onSaved?.();
        return;
      }
      showToast(tp("grader.savedFor", { name: s.fullName || s.scholar_email }), "success");
      if (openedAt.current) {
        const ms = Date.now() - openedAt.current;
        if (ms > 0 && ms <= MAX_GRADING_MS) trackEvent("grading_time", { ms, itemType: "assignment", rubric: !!rubric }, courseId);
        openedAt.current = Date.now();
      }
      if (rubric && aiApplied) {
        const a = aiApplied.applied || { scores: {}, feedback: "" };
        const edited = String(a.feedback || "") !== String(feedback || "")
          || criteria.some((c) => String(a.scores?.[c.id] ?? "") !== String(scores[c.id] ?? ""));
        trackEvent("ai_suggestion_used", { edited }, courseId);
      }
      onSaved?.();
    } catch (err) {
      setError(err.message || tp("grader.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className="text-ui">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover"
      >
        {open ? <ChevronDown className="w-4 h-4 shrink-0 text-fg-subtle" /> : <ChevronRight className="w-4 h-4 shrink-0 text-fg-subtle" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-fg truncate">{s.fullName || s.scholar_email}</span>
            {s.is_late ? <LateBadge /> : null}
          </div>
          <p className="text-caption text-fg-subtle">
            {s.submitted_at ? tp("grader.submittedAt", { date: fmtDateTime(s.submitted_at, locale) }) : tp("grader.noSubmission")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {s.grade != null ? (
            <>
              <p className="font-semibold text-fg">{fmtPoints(s.grade)} / {fmtPoints(pointsPossible)}</p>
              {pct != null ? <p className="text-caption text-fg-subtle">{fmtPoints(pct)}%</p> : null}
            </>
          ) : (
            <span className="text-caption font-semibold text-warning-fg bg-warning-soft border border-warning/30 rounded-full px-1.5 py-0.5">{tp("grader.notGraded")}</span>
          )}
        </div>
      </button>

      {open ? (
        <div id={panelId} className="px-3 pb-4 pt-1 space-y-4 sm:pl-10">
          {s.submitted_at ? (
            <p className="text-caption text-fg-muted font-mono whitespace-pre-wrap border-l-2 border-line pl-3">
              {s.body || tp("grader.noBody")}
            </p>
          ) : null}

          {aiAvailable ? (
            <div className="space-y-2">
              {aiApplied ? (
                <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-info/30 bg-info-soft/60 px-3 py-2">
                  <div className="space-y-0.5">
                    <AiDraftLabel text={tp("grader.aiLabel")} />
                    <p className="text-caption text-fg-muted">{tp("grader.aiFilled")}</p>
                  </div>
                  <button type="button" onClick={dismissSuggestion} disabled={aiBusy} className="text-caption font-semibold text-fg-muted border border-line hover:bg-surface disabled:opacity-50 px-3 py-1.5 rounded-lg">
                    {tp("grader.dismiss")}
                  </button>
                </div>
              ) : aiJob ? (
                <JobProgress job={aiJobLive} label={tp("grader.suggesting")} onCancel={cancelAiJob} cancelling={aiCancelling} />
              ) : suggestion ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => applySuggestion(suggestion)} className="inline-flex items-center gap-1.5 text-caption font-semibold text-info-fg border border-info/30 hover:bg-info-soft px-3 py-1.5 rounded-lg">
                    <Sparkles className="w-3.5 h-3.5" /> {tp("grader.useSuggestion")}
                  </button>
                  <button type="button" onClick={dismissSuggestion} disabled={aiBusy} className="text-caption font-semibold text-fg-subtle hover:text-fg-muted px-2 py-1.5">{tp("grader.dismissIt")}</button>
                  <span className="text-caption text-fg-subtle">{tp("grader.suggestionReady")}</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={startSuggestion} disabled={aiBusy} className="inline-flex items-center gap-1.5 text-caption font-semibold text-info-fg border border-info/30 hover:bg-info-soft disabled:opacity-50 px-3 py-1.5 rounded-lg">
                    <Sparkles className="w-3.5 h-3.5" /> {aiBusy ? tp("common.starting") : tp("grader.suggest")}
                  </button>
                  <span className="text-caption text-fg-subtle">{tp("grader.privacy")}</span>
                </div>
              )}
              {!aiStatus.modelRunning && !aiApplied ? (
                <p className="text-caption text-warning-fg">{tp("grader.modelDown")}</p>
              ) : null}
              {aiError ? <p role="alert" className="text-caption text-danger-fg">{aiError}</p> : null}
            </div>
          ) : null}

          {rubric ? (
            <Fieldset legend={tp("grader.rubricScores")} className="space-y-3">
              {criteria.map((c) => {
                const max = Number(c.points);
                const inputId = `${panelId}-c${c.id}`;
                const quick = Number.isFinite(max) && max <= 10 ? Array.from({ length: Math.floor(max) + 1 }, (_, i) => i) : [];
                const current = scores[c.id];
                return (
                  <div key={c.id} className="space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Label htmlFor={inputId} className="mb-0">
                        {c.title}{c.outcome_code ? ` · ${c.outcome_code}` : ""}
                      </Label>
                      <span className="text-caption text-fg-subtle">{tp("grader.maxWeight", { max: fmtPoints(max), weight: fmtPoints(c.weight) })}</span>
                    </div>
                    {c.description ? <p className="text-caption text-fg-subtle">{c.description}</p> : null}
                    {aiApplied?.reasons?.[c.id] ? (
                      <p className="text-caption text-info-fg border-l-2 border-info/30 pl-2">
                        <span className="font-semibold">{tp("grader.aiReason")}</span> {aiApplied.reasons[c.id]}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <TextInput id={inputId} type="number" min={0} max={max} step="any" inputMode="decimal" value={current ?? ""} onChange={(e) => setScores((p) => ({ ...p, [c.id]: e.target.value }))} size="sm" className="w-20" />
                      {quick.map((v) => {
                        const active = current !== undefined && current !== "" && Number(current) === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setScores((p) => ({ ...p, [c.id]: String(v) }))}
                            aria-pressed={active}
                            aria-label={tp("grader.quickAria", { title: c.title, v, max: fmtPoints(max) })}
                            className={`min-w-[2.25rem] h-9 rounded-lg text-caption font-bold border transition-colors ${
                              active
                                ? "bg-brand border-brand text-on-brand"
                                : "border-line text-fg-muted hover:border-brand"
                            }`}
                          >
                            {v}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <p className="text-ui font-semibold text-fg" aria-live="polite">
                {tp("grader.total")} {preview != null ? `${fmtPoints(preview)} / ${fmtPoints(pointsPossible)} (${fmtPoints(pctOf(preview, pointsPossible))}%)` : tp("grader.scoreToSee")}
              </p>
            </Fieldset>
          ) : (
            <div>
              <Label htmlFor={`${panelId}-grade`}>{tp("grader.gradeOutOf", { n: fmtPoints(pointsPossible) })}</Label>
              <TextInput id={`${panelId}-grade`} type="number" min={0} step="any" inputMode="decimal" value={grade} onChange={(e) => setGrade(e.target.value)} size="sm" className="w-28" />
            </div>
          )}

          <div>
            <Label htmlFor={`${panelId}-feedback`}>{tp("common.feedback")}</Label>
            <Textarea id={`${panelId}-feedback`} rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} size="sm" className="w-full" />
          </div>

          {error ? <p role="alert" className="text-caption font-semibold text-danger-fg">{error}</p> : null}

          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={saving} className="text-caption font-bold text-on-brand bg-brand hover:bg-brand/90 disabled:opacity-60 px-5 py-2.5 rounded-lg">
              {saving ? tp("common.saving") : tp("grader.save")}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
