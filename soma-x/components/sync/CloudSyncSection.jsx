"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw, Clock } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { Section, List, ListRow } from "@/components/layout";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import DeviceCard from "@/components/sync/DeviceCard";
import Loader from "@/components/ui/Loader";

// Cloud sync (admins): changes made on this box wait in a queue and are sent to the cloud on a
// schedule. This shows where the queue stands, lets an admin send now, and sets what may leave
// the box.

// Run statuses, scope toggles and people options are translated under admin.cloud.
const RUN_STATUSES = ["ok", "failed", "not_configured", "nothing_to_send"];
const SCOPE_TOGGLES = ["courses", "enrollments", "grades", "outcomeResults", "events"];
const PEOPLE_OPTIONS = ["none", "pseudonymous", "full"];

// Intl locales for the UI language ("rw" falls back to English where Intl lacks Kinyarwanda).
const intlLocales = (lang) => (lang === "rw" ? ["rw", "en-RW", "en"] : [lang || "en"]);

/** An instant as e.g. "3 minutes ago", in the UI language ("" if unusable). */
function formatRelativeIn(value, lang, now = Date.now()) {
  if (!value) return "";
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return "";
  const seconds = Math.round((t - now) / 1000);
  const abs = Math.abs(seconds);
  let rtf;
  try { rtf = new Intl.RelativeTimeFormat(intlLocales(lang), { numeric: "auto" }); } catch { rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" }); }
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), "day");
  if (abs < 86400 * 365) return rtf.format(Math.round(seconds / (86400 * 30)), "month");
  return rtf.format(Math.round(seconds / (86400 * 365)), "year");
}

/** An instant as a short local date and time, in the UI language ("" if unusable). */
function formatDateTimeIn(value, lang) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const opts = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };
  try { return d.toLocaleString(intlLocales(lang), opts); } catch { return d.toLocaleString("en", opts); }
}

// "{count} thing(s)" with separate one/many keys.
const countText = (t, n, oneKey, manyKey) => fill(t(n === 1 ? oneKey : manyKey), { count: n });

function StatusLine({ status }) {
  const { t, lang } = useLanguage();
  const formatRelative = (v) => formatRelativeIn(v, lang);
  const lastRun = status.runs?.[0];
  const failing = status.configured && (status.failedAttempts > 0 || lastRun?.status === "failed") && status.pending > 0;

  let icon, title, detail, tone;
  if (!status.configured) {
    icon = <CloudOff className="w-5 h-5 text-slate-400" aria-hidden="true" />;
    title = t("admin.cloud.notSetUpTitle");
    detail = t("admin.cloud.notSetUpDetail");
    tone = "text-slate-800 dark:text-slate-100";
  } else if (failing) {
    icon = <AlertTriangle className="w-5 h-5 text-amber-600" aria-hidden="true" />;
    title = t("admin.cloud.failingTitle");
    const tries = status.failedAttempts > 0 ? countText(t, status.failedAttempts, "admin.cloud.triedOne", "admin.cloud.triedMany") : t("admin.cloud.lastTryFailed");
    const when = lastRun?.startedAt ? fill(t("admin.cloud.mostRecently"), { when: formatRelative(lastRun.startedAt) }) : "";
    detail = `${tries}${when}. ${countText(t, status.pending, "admin.cloud.safeOne", "admin.cloud.safeMany")}`;
    tone = "text-amber-800 dark:text-amber-300";
  } else if (!status.pending) {
    icon = <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />;
    title = t("admin.cloud.upToDate");
    detail = t("admin.cloud.nothingWaiting");
    tone = "text-emerald-800 dark:text-emerald-300";
  } else {
    icon = <Clock className="w-5 h-5 text-[var(--brand-secondary)]" aria-hidden="true" />;
    title = countText(t, status.pending, "admin.cloud.waitingOne", "admin.cloud.waitingMany");
    if (status.oldestPendingAt) title += ` ${fill(t("admin.cloud.since"), { when: formatRelative(status.oldestPendingAt) })}`;
    detail = status.intervalMinutes
      ? countText(t, status.intervalMinutes, "admin.cloud.everyMinute", "admin.cloud.everyMinutes")
      : t("admin.cloud.onSchedule");
    tone = "text-slate-800 dark:text-slate-100";
  }

  return (
    <div className="flex items-start gap-3" role="status" aria-live="polite">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className={`text-sm font-bold ${tone}`}>{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        {failing && lastRun?.details?.error ? (
          <p className="mt-1 text-[11px] text-slate-500 break-words">{t("admin.cloud.supportDetails")} {lastRun.details.error}</p>
        ) : null}
      </div>
    </div>
  );
}

function runSummary(run, t) {
  const d = run.details || {};
  const parts = [];
  if (d.sent != null) parts.push(fill(t("admin.cloud.sentCount"), { count: d.sent }));
  if (d.skipped) parts.push(fill(t("admin.cloud.skippedCount"), { count: d.skipped }));
  if (d.pending) parts.push(fill(t("admin.cloud.pendingCount"), { count: d.pending }));
  return parts.join(" · ");
}

function ScopeForm({ SERVER_URL, scope, onSaved }) {
  const { showToast } = useToast();
  const { t } = useLanguage();
  const [form, setForm] = useState(scope);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setForm(scope); }, [scope]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(scope), [form, scope]);
  const risky = form.people === "full" || form.submissionText;

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${SERVER_URL}/sync/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: form }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || t("admin.cloud.scopeSaveFailed"));
      onSaved(payload.scope || form);
      showToast(t("admin.cloud.scopeSaved"), "success");
    } catch (err) {
      setError(err.message || t("admin.cloud.scopeSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key) => setForm((f) => ({ ...f, [key]: !f[key] }));

  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="sr-only">{t("admin.cloud.kinds")}</legend>
        {SCOPE_TOGGLES.map((key) => (
          <label key={key} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form[key]}
              onChange={() => toggle(key)}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-secondary)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{t(`admin.cloud.scope.${key}.label`)}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{t(`admin.cloud.scope.${key}.help`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">{t("admin.cloud.people")}</legend>
        {PEOPLE_OPTIONS.map((value) => (
          <label key={value} className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="sync-people"
              value={value}
              checked={form.people === value}
              onChange={() => setForm((f) => ({ ...f, people: value }))}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-secondary)]"
            />
            <span className="min-w-0">
              <span className="block text-sm text-slate-800 dark:text-slate-100">{t(`admin.cloud.peopleOptions.${value}.label`)}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{t(`admin.cloud.peopleOptions.${value}.help`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={!!form.submissionText}
          onChange={() => toggle("submissionText")}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--brand-secondary)]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{t("admin.cloud.writtenLabel")}</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{t("admin.cloud.writtenHelp")}</span>
        </span>
      </label>

      {risky ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span>
            {form.people === "full" && form.submissionText
              ? t("admin.cloud.riskBoth")
              : form.people === "full"
                ? t("admin.cloud.riskNames")
                : t("admin.cloud.riskWriting")}{" "}
            {t("admin.cloud.riskAgree")}
          </span>
        </p>
      ) : null}

      {error ? <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!dirty || saving}
          className="text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] disabled:opacity-50 rounded-lg px-4 py-2"
        >
          {saving ? t("admin.analytics.saving") : t("admin.analytics.save")}
        </button>
        {dirty ? (
          <button type="button" onClick={() => setForm(scope)} className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-2">
            {t("admin.cloud.undoChanges")}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default function CloudSyncSection({ SERVER_URL }) {
  const { showToast } = useToast();
  const { t, lang } = useLanguage();
  const formatRelative = (v) => formatRelativeIn(v, lang);
  const formatDateTime = (v) => formatDateTimeIn(v, lang);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState(null); // { ok, text }

  const load = useCallback(async () => {
    if (!SERVER_URL) return;
    try {
      const res = await fetch(`${SERVER_URL}/sync/status`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || t("admin.cloud.statusFailed"));
      setStatus(payload);
      setError("");
    } catch (err) {
      setError(err.message || t("admin.cloud.statusFailed"));
    }
  }, [SERVER_URL]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const syncNow = async () => {
    setRunning(true);
    setRunMessage(null);
    try {
      const res = await fetch(`${SERVER_URL}/sync/run`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      const ok = res.ok && (payload.status === "ok" || payload.status === "nothing_to_send");
      const text = payload.message || (res.ok ? t("admin.cloud.syncFinished") : t("admin.cloud.syncFailed"));
      setRunMessage({ ok, text });
      showToast(text, ok ? "success" : "error");
    } catch {
      const text = t("admin.cloud.boxUnreachable");
      setRunMessage({ ok: false, text });
      showToast(text, "error");
    } finally {
      setRunning(false);
      load();
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <Section
        title={t("admin.analytics.cloudSync")}
        description={t("admin.cloud.description")}
        actions={
          <button
            type="button"
            onClick={syncNow}
            disabled={running || !status}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] disabled:opacity-50 rounded-lg px-3 py-2"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
            {running ? t("admin.cloud.syncing") : t("admin.cloud.syncNow")}
          </button>
        }
      >
        {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
        {!status && !error ? <Loader variant="page" size={40} className="min-h-[6rem]" label={t("admin.cloud.loadingStatus")} /> : null}
        {status ? (
          <div className="space-y-3">
            <StatusLine status={status} />
            <p className="text-xs text-slate-600 dark:text-slate-300">
              {t("admin.cloud.lastSuccess")}{" "}
              {status.lastSuccessAt ? (
                <time dateTime={status.lastSuccessAt} title={formatDateTime(status.lastSuccessAt)} className="font-semibold">
                  {formatRelative(status.lastSuccessAt)} ({formatDateTime(status.lastSuccessAt)})
                </time>
              ) : (
                <span className="font-semibold">{t("admin.cloud.never")}</span>
              )}
            </p>
            {runMessage ? (
              <p role="status" className={`text-xs font-semibold ${runMessage.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600"}`}>{runMessage.text}</p>
            ) : null}
          </div>
        ) : null}
      </Section>

      {status?.device ? <DeviceCard device={status.device} /> : null}

      {status ? (
        <Section divided title={t("admin.cloud.recent")}>
          {status.runs?.length ? (
            <List label={t("admin.cloud.recent")}>
              {status.runs.map((run, i) => (
                <ListRow
                  key={`${run.startedAt}-${i}`}
                  tone={run.status === "failed" ? "warning" : "default"}
                  title={RUN_STATUSES.includes(run.status) ? t(`admin.cloud.runStatus.${run.status}`) : run.status}
                  subtitle={[formatDateTime(run.startedAt), runSummary(run, t), run.details?.error].filter(Boolean).join(" · ") || undefined}
                />
              ))}
            </List>
          ) : (
            <p className="text-xs text-slate-500">{t("admin.cloud.noSyncs")}</p>
          )}
        </Section>
      ) : null}

      {status?.scope ? (
        <Section
          divided
          title={t("admin.cloud.scopeTitle")}
          description={t("admin.cloud.scopeHelp")}
        >
          <ScopeForm SERVER_URL={SERVER_URL} scope={status.scope} onSaved={(scope) => setStatus((s) => ({ ...s, scope }))} />
        </Section>
      ) : null}

      {status?.boxId ? (
        <p className="text-[11px] text-slate-400">
          {t("admin.cloud.boxId")} <span className="font-mono select-all">{status.boxId}</span>
          {status.transport ? ` · ${status.transport === "firestore" ? fill(t("admin.cloud.sendsBy"), { via: "Firebase" }) : fill(t("admin.cloud.sendsBy"), { via: t("admin.cloud.webAddress") })}` : ""}
        </p>
      ) : null}
    </div>
  );
}
