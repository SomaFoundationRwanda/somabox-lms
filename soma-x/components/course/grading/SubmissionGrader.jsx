"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { rubricGradePreview, fmtPoints, pctOf } from "@/lib/rubric";

export function LateBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">
      <Clock className="w-3 h-3" aria-hidden="true" /> Late
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
  const s = submission;
  const [open, setOpen] = useState(defaultOpen);
  const [scores, setScores] = useState(() => initialScores(rubric, s));
  const [grade, setGrade] = useState(s.grade ?? "");
  const [feedback, setFeedback] = useState(s.feedback ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const criteria = rubric?.criteria || [];
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
        if (raw === undefined || raw === "" || !Number.isFinite(v)) { setError(`Score "${c.title}".`); return; }
        if (v < 0 || v > Number(c.points)) { setError(`"${c.title}" must be between 0 and ${fmtPoints(c.points)}.`); return; }
        payloadScores.push({ criterionId: c.id, points: v });
      }
      req = fetch(`${gradeUrl}/rubric`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scores: payloadScores, feedback }),
      });
    } else {
      const v = Number(grade);
      if (grade === "" || !Number.isFinite(v)) { setError("Enter a grade."); return; }
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
          ? payload.message || "This assignment has a rubric: score each criterion instead."
          : payload.message || "Could not save the grade.");
        if (payload.code === "RUBRIC_REQUIRED") onSaved?.();
        return;
      }
      showToast(`Grade saved for ${s.fullName || s.scholar_email}`, "success");
      onSaved?.();
    } catch (err) {
      setError(err.message || "Could not save the grade.");
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
            {s.submitted_at ? `Submitted ${new Date(s.submitted_at).toLocaleString()}` : "No submission"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {s.grade != null ? (
            <>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{fmtPoints(s.grade)} / {fmtPoints(pointsPossible)}</p>
              {pct != null ? <p className="text-[11px] text-slate-500">{fmtPoints(pct)}%</p> : null}
            </>
          ) : (
            <span className="text-[10px] font-semibold uppercase text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5">Not graded</span>
          )}
        </div>
      </button>

      {open ? (
        <div id={panelId} className="px-3 pb-4 pt-1 space-y-4 sm:pl-10">
          {s.submitted_at ? (
            <p className="text-xs text-slate-700 dark:text-slate-300 font-mono whitespace-pre-wrap border-l-2 border-slate-200 dark:border-slate-700 pl-3">
              {s.body || "(No submission body)"}
            </p>
          ) : null}

          {rubric ? (
            <fieldset className="space-y-3">
              <legend className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Rubric scores</legend>
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
                      <span className="text-[11px] text-slate-500">max {fmtPoints(max)} · weight {fmtPoints(c.weight)}</span>
                    </div>
                    {c.description ? <p className="text-xs text-slate-500">{c.description}</p> : null}
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
                            aria-label={`${c.title}: ${v} of ${fmtPoints(max)}`}
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
                Total: {preview != null ? `${fmtPoints(preview)} / ${fmtPoints(pointsPossible)} (${fmtPoints(pctOf(preview, pointsPossible))}%)` : "score the criteria to see the grade"}
              </p>
            </fieldset>
          ) : (
            <div>
              <label htmlFor={`${panelId}-grade`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Grade (out of {fmtPoints(pointsPossible)})</label>
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
            <label htmlFor={`${panelId}-feedback`} className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Feedback</label>
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
              {saving ? "Saving..." : "Save grade"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
