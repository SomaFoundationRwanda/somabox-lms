"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Clock, Sparkles } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { rubricGradePreview, fmtPoints, pctOf } from "@/lib/rubric";
import useAiStatus from "@/lib/useAiStatus";
import { aiFetch, startAiJob, rejectDraft, useAiJob } from "@/lib/ai";
import { AiDraftLabel, JobProgress } from "@/components/ai/AiBits";
import { trackEvent } from "@/lib/usage";
import { useProgressText, fmtDateTime } from "@/components/progress/text";

// Gradings that take longer than this were left open, not worked on: don't report them.
const MAX_GRADING_MS = 2 * 60 * 60 * 1000;

export function LateBadge() {
  const { tp } = useProgressText();
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
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
export default function SubmissionGrader({ SERVER_URL, courseId, assignmentId, submission, rubric, pointsPossible, onSaved, defaultOpen = false }) {
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
  const suggestionUrl = `${SERVER_URL}/courses/${courseId}/ai/grading-suggestion?assignmentId=${encodeURIComponent(assignmentId)}&scholarEmail=${encodeURIComponent(s.scholar_email)}`;

  const fetchSuggestion = async () => {
    const r = await aiFetch(suggestionUrl);
    if (!r.ok) { setAiError(r.message); return null; }
    const sug = r.data && r.data.status === "pending" ? r.data : null;
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
  const gradeUrl = `${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}/grade/${encodeURIComponent(s.scholar_email)}`;

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
      req = fetch(`${gradeUrl}/rubric`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: payloadScores, feedback, ...(aiApplied ? { aiDraftId: aiApplied.draftId } : {}) }),
      });
    } else {
      const v = Number(grade);
      if (grade === "" || !Number.isFinite(v)) { setError(tp("grader.enterGrade")); return; }
      req = fetch(gradeUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade: v, feedback }),
      });
    }
    setSaving(true);
    try {
      const res = await req;
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.code === "RUBRIC_REQUIRED"
          ? payload.message || tp("grader.rubricRequired")
          : payload.message || tp("grader.saveFailed"));
        if (payload.code === "RUBRIC_REQUIRED") onSaved?.();
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

  const inputClass = "text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#0D9488]";

  return (
    <li className="text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-900/40"
      >
        {open ? <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" /> : <ChevronRight className="w-4 h-4 shrink-0 text-slate-400" />}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-white truncate">{s.fullName || s.scholar_email}</span>
            {s.is_late ? <LateBadge /> : null}
          </div>
          <p className="text-xs text-slate-500">
            {s.submitted_at ? tp("grader.submittedAt", { date: fmtDateTime(s.submitted_at, locale) }) : tp("grader.noSubmission")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {s.grade != null ? (
            <>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{fmtPoints(s.grade)} / {fmtPoints(pointsPossible)}</p>
              {pct != null ? <p className="text-[11px] text-slate-500">{fmtPoints(pct)}%</p> : null}
            </>
          ) : (
            <span className="text-[10px] font-semibold uppercase text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">{tp("grader.notGraded")}</span>
          )}
        </div>
      </button>

      {open ? (
        <div id={panelId} className="px-3 pb-4 pt-1 space-y-4 sm:pl-10">
          {s.submitted_at ? (
            <p className="text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap border-l-2 border-slate-200 dark:border-slate-700 pl-3">
              {s.body || tp("grader.noBody")}
            </p>
          ) : null}

          {aiAvailable ? (
            <div className="space-y-2">
              {aiApplied ? (
                <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-950/20 px-3 py-2">
                  <div className="space-y-0.5">
                    <AiDraftLabel text={tp("grader.aiLabel")} />
                    <p className="text-[11px] text-slate-600 dark:text-slate-400">{tp("grader.aiFilled")}</p>
                  </div>
                  <button type="button" onClick={dismissSuggestion} disabled={aiBusy} className="text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                    {tp("grader.dismiss")}
                  </button>
                </div>
              ) : aiJob ? (
                <JobProgress job={aiJobLive} label={tp("grader.suggesting")} onCancel={cancelAiJob} cancelling={aiCancelling} />
              ) : suggestion ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => applySuggestion(suggestion)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-800 dark:text-violet-200 border border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-950/30 px-3 py-1.5 rounded-lg">
                    <Sparkles className="w-3.5 h-3.5" /> {tp("grader.useSuggestion")}
                  </button>
                  <button type="button" onClick={dismissSuggestion} disabled={aiBusy} className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-2 py-1.5">{tp("grader.dismissIt")}</button>
                  <span className="text-[11px] text-slate-500">{tp("grader.suggestionReady")}</span>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={startSuggestion} disabled={aiBusy} className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-800 dark:text-violet-200 border border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50 px-3 py-1.5 rounded-lg">
                    <Sparkles className="w-3.5 h-3.5" /> {aiBusy ? tp("common.starting") : tp("grader.suggest")}
                  </button>
                  <span className="text-[11px] text-slate-500">{tp("grader.privacy")}</span>
                </div>
              )}
              {!aiStatus.modelRunning && !aiApplied ? (
                <p className="text-[11px] text-amber-800 dark:text-amber-300">{tp("grader.modelDown")}</p>
              ) : null}
              {aiError ? <p role="alert" className="text-xs text-rose-600">{aiError}</p> : null}
            </div>
          ) : null}

          {rubric ? (
            <fieldset className="space-y-3">
              <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{tp("grader.rubricScores")}</legend>
              {criteria.map((c) => {
                const max = Number(c.points);
                const inputId = `${panelId}-c${c.id}`;
                const quick = Number.isFinite(max) && max <= 10 ? Array.from({ length: Math.floor(max) + 1 }, (_, i) => i) : [];
                const current = scores[c.id];
                return (
                  <div key={c.id} className="space-y-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <label htmlFor={inputId} className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {c.title}
                        {c.outcome_code ? <span className="ml-2 text-[10px] font-bold text-[#0D9488]">{c.outcome_code}</span> : null}
                      </label>
                      <span className="text-[11px] text-slate-500">{tp("grader.maxWeight", { max: fmtPoints(max), weight: fmtPoints(c.weight) })}</span>
                    </div>
                    {c.description ? <p className="text-xs text-slate-500">{c.description}</p> : null}
                    {aiApplied?.reasons?.[c.id] ? (
                      <p className="text-xs text-violet-800 dark:text-violet-300 border-l-2 border-violet-300 dark:border-violet-700 pl-2">
                        <span className="font-semibold">{tp("grader.aiReason")}</span> {aiApplied.reasons[c.id]}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <input
                        id={inputId}
                        type="number"
                        min={0}
                        max={max}
                        step="any"
                        inputMode="decimal"
                        value={current ?? ""}
                        onChange={(e) => setScores((p) => ({ ...p, [c.id]: e.target.value }))}
                        className={`${inputClass} w-20`}
                      />
                      {quick.map((v) => {
                        const active = current !== undefined && current !== "" && Number(current) === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setScores((p) => ({ ...p, [c.id]: String(v) }))}
                            aria-pressed={active}
                            aria-label={tp("grader.quickAria", { title: c.title, v, max: fmtPoints(max) })}
                            className={`min-w-[2.25rem] h-9 rounded-lg text-xs font-bold border transition-colors ${
                              active
                                ? "bg-[#0D9488] border-[#0D9488] text-white"
                                : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-[#0D9488]"
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
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100" aria-live="polite">
                {tp("grader.total")} {preview != null ? `${fmtPoints(preview)} / ${fmtPoints(pointsPossible)} (${fmtPoints(pctOf(preview, pointsPossible))}%)` : tp("grader.scoreToSee")}
              </p>
            </fieldset>
          ) : (
            <div>
              <label htmlFor={`${panelId}-grade`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{tp("grader.gradeOutOf", { n: fmtPoints(pointsPossible) })}</label>
              <input
                id={`${panelId}-grade`}
                type="number"
                min={0}
                step="any"
                inputMode="decimal"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className={`${inputClass} w-28`}
              />
            </div>
          )}

          <div>
            <label htmlFor={`${panelId}-feedback`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{tp("common.feedback")}</label>
            <textarea
              id={`${panelId}-feedback`}
              rows={3}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className={`${inputClass} w-full`}
            />
          </div>

          {error ? <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p> : null}

          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={saving} className="text-xs font-bold text-white bg-[#0D9488] hover:bg-teal-700 disabled:opacity-60 px-5 py-2.5 rounded-lg">
              {saving ? tp("common.saving") : tp("grader.save")}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
