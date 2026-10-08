"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, Hammer, Pencil, Plus, RotateCcw, SkipForward } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { formatInstantDate } from "@/lib/dates";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";

const MIN_REASON = 10;

// decided_at is stored as a UTC timestamp ("YYYY-MM-DD HH:MM:SS" in SQLite); read it as UTC.
function decidedOn(value) {
  if (!value) return "";
  const s = String(value);
  const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? `${s.replace(" ", "T")}Z` : s;
  return formatInstantDate(iso, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Baseline (Week 0) panel: status, coverage, problems and the generate / approve / skip / reset actions.
 * isDraft: the course hasn't opened yet (reset is only allowed then).
 * onChanged: called after every successful action (refresh setup status).
 * compact: smaller layout for the setup wizard.
 */
export default function BaselinePanel({ SERVER_URL, courseId, isDraft, onChanged, compact = false }) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [state, setState] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [problems, setProblems] = useState([]);
  const [perOutcome, setPerOutcome] = useState("2");
  const [skipOpen, setSkipOpen] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/baseline`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.message || t("teacher.baseline.loadFailed"));
      setState(payload);
      setLoadError("");
    } catch (err) {
      setLoadError(err.message || t("teacher.baseline.loadFailed"));
    }
  }, [SERVER_URL, courseId, t]);

  useEffect(() => { load(); }, [load]);

  const run = async (key, path, body, successMessage) => {
    setBusy(key);
    setError("");
    setProblems([]);
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (Array.isArray(payload?.problems) && payload.problems.length > 0) {
          setError(t("teacher.baseline.notReady"));
          setProblems(payload.problems);
        } else {
          setError(payload?.message || t("teacher.common.somethingWrong"));
        }
        await load();
        return false;
      }
      if (payload && typeof payload === "object" && "status" in payload) setState(payload);
      else await load();
      showToast(successMessage, "success");
      onChanged?.();
      return true;
    } catch {
      setError(t("teacher.baseline.unreachable"));
      return false;
    } finally {
      setBusy("");
    }
  };

  const generate = () => {
    const n = Math.min(10, Math.max(1, Math.round(Number(perOutcome)) || 2));
    setPerOutcome(String(n));
    run("generate", "/baseline/generate", { perOutcome: n }, t("teacher.baseline.built"));
  };
  const approve = () => run("approve", "/baseline/approve", {}, t("teacher.baseline.approvedToast"));
  const reset = () => run("reset", "/baseline/reset", {}, t("teacher.baseline.undoneToast"));
  const skip = async () => {
    const r = reason.trim();
    if (r.length < MIN_REASON) {
      setError(fill(t("teacher.baseline.reasonTooShort"), { min: MIN_REASON }));
      return;
    }
    const ok = await run("skip", "/baseline/skip", { reason: r }, t("teacher.baseline.skippedToast"));
    if (ok) { setSkipOpen(false); setReason(""); }
  };
  const addWeek0 = async () => {
    setBusy("module");
    setError("");
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t("teacher.baseline.week0Title"), kind: "baseline" }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 409) throw new Error(payload?.message || t("teacher.baseline.addModuleFailed"));
      showToast(res.status === 409 ? t("teacher.baseline.moduleExists") : t("teacher.baseline.moduleAdded"), "success");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || t("teacher.baseline.addModuleFailed"));
    } finally {
      setBusy("");
    }
  };

  if (loadError && !state) {
    return <p className="text-xs text-rose-600" role="alert">{loadError}</p>;
  }
  if (!state) return <p className="text-xs text-slate-500">{t("teacher.baseline.loading")}</p>;

  const status = state.status || "pending";
  const covered = Array.isArray(state.outcomesCovered) ? state.outcomesCovered.length : 0;
  const missing = Array.isArray(state.outcomesMissing) ? state.outcomesMissing : [];
  const stateProblems = Array.isArray(state.problems) ? state.problems : [];
  const editHref = state.quizId ? `/course/${courseId}/quizzes/${state.quizId}` : `/course/${courseId}/modules`;
  const anyBusy = Boolean(busy);

  const btn = "inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && (
        <p className="text-xs text-slate-600">
          {t("teacher.baseline.intro")}
        </p>
      )}

      {/* Status */}
      <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
        {status === "approved" && (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            {t("teacher.baseline.approved")}{state.decidedAt ? ` ${fill(t("teacher.baseline.onDate"), { date: decidedOn(state.decidedAt) })}` : ""}{state.decidedBy ? ` ${fill(t("teacher.baseline.byName"), { name: state.decidedBy })}` : ""}
          </span>
        )}
        {status === "skipped" && (
          <span className="font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
            {t("teacher.baseline.skipped")}{state.skipReason ? `: "${state.skipReason}"` : ""}
          </span>
        )}
        {status === "pending" && (
          <span className="font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">{t("teacher.baseline.pending")}</span>
        )}
        <span className="text-slate-500">
          {fill(t(state.questionCount === 1 ? "teacher.baseline.oneQuestion" : "teacher.baseline.manyQuestions"), { count: state.questionCount || 0 })}
          {state.untaggedQuestionCount ? ` (${fill(t("teacher.baseline.untagged"), { count: state.untaggedQuestionCount })})` : ""}
          {" · "}{fill(t(covered === 1 ? "teacher.baseline.oneOutcomeCovered" : "teacher.baseline.manyOutcomesCovered"), { count: covered })}
          {missing.length > 0 ? `, ${fill(t("teacher.baseline.missingCount"), { count: missing.length })}` : ""}
        </span>
      </div>

      {missing.length > 0 && (
        <div className="text-xs">
          <p className="font-semibold text-slate-600 mb-1">{t("teacher.baseline.notCovered")}</p>
          <ul className="flex flex-wrap gap-1.5">
            {missing.map((o) => (
              <li key={o.id} className="bg-amber-50 border border-amber-200 text-amber-900 px-2 py-0.5 rounded-md">
                {o.code ? <span className="font-bold">{o.code} </span> : null}{o.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status === "pending" && stateProblems.length > 0 && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
          <p className="font-semibold mb-1">{t("teacher.baseline.beforeApprove")}</p>
          <ul className="list-disc list-inside space-y-0.5">
            {stateProblems.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      {/* Actions */}
      {status === "pending" && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor={`baseline-per-outcome${compact ? "-wiz" : ""}`} className="text-[11px] font-semibold text-slate-600 block mb-1">
                {t("teacher.baseline.perOutcome")}
              </label>
              <input
                id={`baseline-per-outcome${compact ? "-wiz" : ""}`}
                type="number"
                min={1}
                max={10}
                step={1}
                value={perOutcome}
                onChange={(e) => setPerOutcome(e.target.value)}
                className="w-20 text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#0D9488]"
              />
            </div>
            <button type="button" onClick={generate} disabled={anyBusy} className={`${btn} text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100`}>
              <Hammer className="w-3.5 h-3.5" aria-hidden="true" /> {busy === "generate" ? t("teacher.baseline.building") : t("teacher.baseline.build")}
            </button>
          </div>
          <button
            type="button"
            onClick={approve}
            disabled={anyBusy || !state.canApprove}
            title={state.canApprove ? undefined : t("teacher.baseline.fixFirst")}
            className={`${btn} text-white bg-[#203A3A] hover:bg-[#182c2c]`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> {busy === "approve" ? t("teacher.baseline.approving") : t("teacher.baseline.approve")}
          </button>
          <button
            type="button"
            onClick={() => { setSkipOpen((v) => !v); setError(""); }}
            disabled={anyBusy}
            aria-expanded={skipOpen}
            className={`${btn} text-slate-700 bg-slate-100 hover:bg-slate-200`}
          >
            <SkipForward className="w-3.5 h-3.5" aria-hidden="true" /> {t("teacher.baseline.skip")}
          </button>
        </div>
      )}

      {status === "pending" && skipOpen && (
        <div className="space-y-2 p-3 border border-slate-200 rounded-xl">
          <label htmlFor={`baseline-skip-reason${compact ? "-wiz" : ""}`} className="text-[11px] font-semibold text-slate-600 block">
            {fill(t("teacher.baseline.whySkip"), { min: MIN_REASON })}
          </label>
          <textarea
            id={`baseline-skip-reason${compact ? "-wiz" : ""}`}
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488]"
            placeholder={t("teacher.baseline.reasonPlaceholder")}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={skip}
              disabled={anyBusy || reason.trim().length < MIN_REASON}
              className={`${btn} text-white bg-[#203A3A] hover:bg-[#182c2c]`}
            >
              {busy === "skip" ? t("teacher.baseline.saving") : t("teacher.baseline.confirmSkip")}
            </button>
            <button type="button" onClick={() => setSkipOpen(false)} className="text-xs font-semibold text-slate-600 px-3 py-2">{t("teacher.common.cancel")}</button>
            <span className="text-[11px] text-slate-400 ml-auto">{reason.trim().length}/{MIN_REASON}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {status !== "pending" && isDraft && (
          <button type="button" onClick={reset} disabled={anyBusy} className={`${btn} text-slate-700 bg-slate-100 hover:bg-slate-200`}>
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> {busy === "reset" ? t("teacher.baseline.undoing") : t("teacher.baseline.undo")}
          </button>
        )}
        {!state.moduleId ? (
          <button type="button" onClick={addWeek0} disabled={anyBusy} className={`${btn} text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100`}>
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {busy === "module" ? t("teacher.baseline.adding") : t("teacher.baseline.addModule")}
          </button>
        ) : null}
        <Link href={editHref} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0D9488] hover:underline px-1 py-2">
          {state.quizId ? <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> : <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />}
          {t("teacher.baseline.edit")}
        </Link>
      </div>

      {error && (
        <div role="alert" className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
          <p>{error}</p>
          {problems.length > 0 && (
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              {problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
