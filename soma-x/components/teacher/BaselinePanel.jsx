"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle2, Hammer, Pencil, Plus, RotateCcw, SkipForward } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { formatInstantDate } from "@/lib/dates";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import Loader from "@/components/ui/Loader";
import useSetupText from "@/lib/useSetupText";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Field, TextInput, Textarea } from "@/components/form";
import Modal from "@/components/ui/Modal";
import { formatRange } from "@/lib/dates";

const MIN_REASON = 10;

// decided_at can arrive as a UTC timestamp without a zone ("YYYY-MM-DD HH:MM:SS"); read it as UTC.
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
export default function BaselinePanel({ courseId, isDraft, onChanged, compact = false }) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const baseline = useQuery({
    queryKey: queryKeys.courseSection(courseId, "baseline"),
    queryFn: () => apiFetch(`/courses/${courseId}/baseline`),
    enabled: !!courseId,
  });
  const state = baseline.data || null;
  const loadError = baseline.isError ? baseline.error?.body?.message || t("teacher.baseline.loadFailed") : "";
  // The baseline touches the course's weeks, quizzes and setup status: all of it is reloaded.
  const load = () => queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [problems, setProblems] = useState([]);
  const { baselineProblems } = useSetupText();
  const [perOutcome, setPerOutcome] = useState("2");
  const [skipOpen, setSkipOpen] = useState(false);
  const [reason, setReason] = useState("");
  // The "what's missing and how to fix it" dialog, opened by Approve while it can't be approved.
  const [readyDialog, setReadyDialog] = useState(false);

  const run = async (key, path, body, successMessage) => {
    setBusy(key);
    setError("");
    setProblems([]);
    try {
      let payload;
      try {
        payload = await apiFetch(`/courses/${courseId}${path}`, { method: "POST", json: body || {} });
      } catch (err) {
        if (!(err instanceof ApiError) || err.status === 0) throw err;
        const failure = err.body || {};
        if (Array.isArray(failure.problems) && failure.problems.length > 0) {
          setError(t("teacher.baseline.notReady"));
          setProblems(baselineProblems(failure.problemCodes, failure.problems));
        } else {
          setError(failure.message || t("teacher.common.somethingWrong"));
        }
        await load();
        return false;
      }
      if (payload && typeof payload === "object" && "status" in payload) {
        queryClient.setQueryData(queryKeys.courseSection(courseId, "baseline"), payload);
      }
      await load();
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
  const approve = () => {
    // Not ready, or Week 0 is already over: say what to do before (or instead of) approving.
    if (!state.canApprove || (state.warnings || []).length) { setReadyDialog(true); return; }
    return run("approve", "/baseline/approve", {}, t("teacher.baseline.approvedToast"));
  };
  const approveAnyway = async () => {
    setReadyDialog(false);
    await run("approve", "/baseline/approve", {}, t("teacher.baseline.approvedToast"));
  };
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
      // 409: Week 0 is already there, which is fine.
      const exists = await apiFetch(`/courses/${courseId}/modules`, { method: "POST", json: { title: t("teacher.baseline.week0Title"), kind: "baseline" } })
        .then(() => false)
        .catch((err) => {
          if (err?.status === 409) return true;
          throw new Error(err?.body?.message || t("teacher.baseline.addModuleFailed"));
        });
      showToast(exists ? t("teacher.baseline.moduleExists") : t("teacher.baseline.moduleAdded"), "success");
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.message || t("teacher.baseline.addModuleFailed"));
    } finally {
      setBusy("");
    }
  };

  if (loadError && !state) {
    return <p className="text-caption text-danger-fg" role="alert">{loadError}</p>;
  }
  if (!state) return <Loader variant="page" size={40} className="min-h-[8rem]" label={t("teacher.baseline.loading")} />;

  const status = state.status || "pending";
  const covered = Array.isArray(state.outcomesCovered) ? state.outcomesCovered.length : 0;
  const missing = Array.isArray(state.outcomesMissing) ? state.outcomesMissing : [];
  const stateProblems = baselineProblems(state.problemCodes, Array.isArray(state.problems) ? state.problems : []);
  const editHref = state.quizId ? `/course/${courseId}/quizzes/${state.quizId}` : `/course/${courseId}/modules`;
  const anyBusy = Boolean(busy);

  const btn = "inline-flex items-center gap-1.5 text-caption font-semibold px-3 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[36px]";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && (
        <p className="text-caption text-fg-muted">
          {t("teacher.baseline.intro")}
        </p>
      )}

      {/* Status */}
      <div className="flex flex-wrap items-center gap-2 text-caption" aria-live="polite">
        {status === "approved" && (
          <span className="inline-flex items-center gap-1 font-semibold text-success-fg bg-success-soft border border-success/30 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
            {t("teacher.baseline.approved")}{state.decidedAt ? ` ${fill(t("teacher.baseline.onDate"), { date: decidedOn(state.decidedAt) })}` : ""}{state.decidedBy ? ` ${fill(t("teacher.baseline.byName"), { name: state.decidedBy })}` : ""}
          </span>
        )}
        {status === "skipped" && (
          <span className="font-semibold text-warning-fg bg-warning-soft border border-warning/30 px-2.5 py-1 rounded-full">
            {t("teacher.baseline.skipped")}{state.skipReason ? `: "${state.skipReason}"` : ""}
          </span>
        )}
        {status === "pending" && (
          <span className="font-semibold text-fg-muted bg-surface-sunken border border-line px-2.5 py-1 rounded-full">{t("teacher.baseline.pending")}</span>
        )}
        <span className="text-fg-subtle">
          {fill(t(state.questionCount === 1 ? "teacher.baseline.oneQuestion" : "teacher.baseline.manyQuestions"), { count: state.questionCount || 0 })}
          {state.untaggedQuestionCount ? ` (${fill(t("teacher.baseline.untagged"), { count: state.untaggedQuestionCount })})` : ""}
          {" · "}{fill(t(covered === 1 ? "teacher.baseline.oneOutcomeCovered" : "teacher.baseline.manyOutcomesCovered"), { count: covered })}
          {missing.length > 0 ? `, ${fill(t("teacher.baseline.missingCount"), { count: missing.length })}` : ""}
        </span>
      </div>

      {missing.length > 0 && (
        <div className="text-caption">
          <p className="font-semibold text-fg-muted mb-1">{t("teacher.baseline.notCovered")}</p>
          <ul className="flex flex-wrap gap-1.5">
            {missing.map((o) => (
              <li key={o.id} className="bg-warning-soft border border-warning/30 text-warning-fg px-2 py-0.5 rounded-md">
                {o.code ? <span className="font-bold">{o.code} </span> : null}{o.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status === "pending" && stateProblems.length > 0 && (
        <div className="p-3 bg-warning-soft border border-warning/30 rounded-xl text-caption text-warning-fg">
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
            <Field id={`baseline-per-outcome${compact ? "-wiz" : ""}`} label={t("teacher.baseline.perOutcome")}>
              <TextInput
                type="number"
                min={1}
                max={10}
                step={1}
                value={perOutcome}
                onChange={(e) => setPerOutcome(e.target.value)}
                size="sm"
                className="w-20"
              />
            </Field>
            <button type="button" onClick={generate} disabled={anyBusy} className={`${btn} text-brand-fg bg-brand-soft border border-brand/40 hover:bg-brand-soft`}>
              <Hammer className="w-3.5 h-3.5" aria-hidden="true" /> {busy === "generate" ? t("teacher.baseline.building") : t("teacher.baseline.build")}
            </button>
          </div>
          <button
            type="button"
            onClick={approve}
            disabled={anyBusy}
            className={`${btn} text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" /> {busy === "approve" ? t("teacher.baseline.approving") : t("teacher.baseline.approve")}
          </button>
          <button
            type="button"
            onClick={() => { setSkipOpen((v) => !v); setError(""); }}
            disabled={anyBusy}
            aria-expanded={skipOpen}
            className={`${btn} text-fg-muted bg-surface-sunken hover:bg-surface-hover`}
          >
            <SkipForward className="w-3.5 h-3.5" aria-hidden="true" /> {t("teacher.baseline.skip")}
          </button>
        </div>
      )}

      {status === "pending" && skipOpen && (
        <div className="space-y-2 p-3 border border-line rounded-xl">
          <Field id={`baseline-skip-reason${compact ? "-wiz" : ""}`} label={fill(t("teacher.baseline.whySkip"), { min: MIN_REASON })}>
            <Textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("teacher.baseline.reasonPlaceholder")}
            />
          </Field>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={skip}
              disabled={anyBusy || reason.trim().length < MIN_REASON}
              className={`${btn} text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90`}
            >
              {busy === "skip" ? t("teacher.baseline.saving") : t("teacher.baseline.confirmSkip")}
            </button>
            <button type="button" onClick={() => setSkipOpen(false)} className="text-caption font-semibold text-fg-muted px-3 py-2">{t("teacher.common.cancel")}</button>
            <span className="text-caption text-fg-subtle ml-auto">{reason.trim().length}/{MIN_REASON}</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {status !== "pending" && isDraft && (
          <button type="button" onClick={reset} disabled={anyBusy} className={`${btn} text-fg-muted bg-surface-sunken hover:bg-surface-hover`}>
            <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> {busy === "reset" ? t("teacher.baseline.undoing") : t("teacher.baseline.undo")}
          </button>
        )}
        {!state.moduleId ? (
          <button type="button" onClick={addWeek0} disabled={anyBusy} className={`${btn} text-brand-fg bg-brand-soft border border-brand/40 hover:bg-brand-soft`}>
            <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {busy === "module" ? t("teacher.baseline.adding") : t("teacher.baseline.addModule")}
          </button>
        ) : null}
        <Link href={editHref} className="inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg hover:underline px-1 py-2">
          {state.quizId ? <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> : <BookOpen className="w-3.5 h-3.5" aria-hidden="true" />}
          {t("teacher.baseline.edit")}
        </Link>
      </div>

      {readyDialog ? (
        <Modal title={state.canApprove ? t("teacher.baseline.checkTitle") : t("teacher.baseline.notReadyTitle")} onClose={() => setReadyDialog(false)} size="lg">
          <div className="space-y-4">
            {(state.problemCodes || []).length ? (
              <>
                <p className="text-ui text-fg-muted">{t("teacher.baseline.notReadyIntro")}</p>
                <ol className="space-y-3">
                  {state.problemCodes.map((p, i) => {
                    // What to do about each problem, and where.
                    const action = p.id === "no_module"
                      ? <button type="button" onClick={() => { setReadyDialog(false); addWeek0(); }} className="font-bold text-brand-fg underline">{t("teacher.baseline.addModule")}</button>
                      : p.id === "no_quiz"
                        ? <button type="button" onClick={() => { setReadyDialog(false); generate(); }} className="font-bold text-brand-fg underline">{t("teacher.baseline.build")}</button>
                        : <Link href={editHref} className="font-bold text-brand-fg underline">{t("teacher.baseline.edit")}</Link>;
                    return (
                      <li key={p.id} className="rounded-xl border border-line p-3 space-y-1">
                        <p className="text-ui font-semibold text-fg">{i + 1}. {stateProblems[i]}</p>
                        <p className="text-caption text-fg-muted">{t(`teacher.baseline.fix.${p.id}`)}</p>
                        <p className="text-caption">{action} &rarr;</p>
                      </li>
                    );
                  })}
                </ol>
              </>
            ) : null}
            {(state.warnings || []).map((w) => (
              <div key={w.id} className="rounded-xl border border-warning/30 bg-warning-soft p-3 space-y-1">
                <p className="text-ui font-semibold text-warning-fg">{fill(t("teacher.baseline.pastTitle"), { dates: formatRange(w.params.start, w.params.end) })}</p>
                <p className="text-caption text-fg-muted">{t("teacher.baseline.pastFix")}</p>
                <Link href={`/course/${courseId}/settings#course-dates`} className="text-caption font-bold text-brand-fg underline">{t("teacher.baseline.openDates")} &rarr;</Link>
              </div>
            ))}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setReadyDialog(false)} className="text-caption font-semibold text-fg-muted px-3 py-2">{t("teacher.common.close")}</button>
              {state.canApprove ? (
                <button type="button" onClick={approveAnyway} className={`${btn} text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90`}>{t("teacher.baseline.approveAnyway")}</button>
              ) : null}
            </div>
          </div>
        </Modal>
      ) : null}

      {error && (
        <div role="alert" className="p-3 bg-danger-soft border border-danger/30 rounded-xl text-caption text-danger-fg">
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
