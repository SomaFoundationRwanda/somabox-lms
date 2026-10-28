"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch, getErrorMessage } from "@/lib/api";

const SYNC_STATUS = ["sync", "status"];
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw, Clock } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { Section, List, ListRow } from "@/components/layout";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import DeviceCard from "@/components/sync/DeviceCard";
import Loader from "@/components/ui/Loader";
import { CheckboxField, ChoiceGroup, Field, Fieldset } from "@/components/form";

// Cloud sync (admins): changes made on this box wait in a queue and are sent to the cloud on a
// schedule. This shows where the queue stands, lets an admin send now, and sets what may leave
// the box.

// Run statuses, scope toggles and people options are translated under admin.cloud.
const RUN_STATUSES = ["ok", "failed", "not_configured", "nothing_to_send"];
// The learning record is always sent (the box refuses to switch it off); the admin chooses the rest.
const ALWAYS_SENT = ["courses", "enrollments", "grades", "outcomeResults", "events"];
const SCOPE_TOGGLES = ["attendance"];
const PEOPLE_OPTIONS = ["pseudonymous", "full"];

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
    icon = <CloudOff className="w-5 h-5 text-fg-subtle" aria-hidden="true" />;
    title = t("admin.cloud.notSetUpTitle");
    detail = t("admin.cloud.notSetUpDetail");
    tone = "text-fg";
  } else if (failing) {
    icon = <AlertTriangle className="w-5 h-5 text-warning-fg" aria-hidden="true" />;
    title = t("admin.cloud.failingTitle");
    const tries = status.failedAttempts > 0 ? countText(t, status.failedAttempts, "admin.cloud.triedOne", "admin.cloud.triedMany") : t("admin.cloud.lastTryFailed");
    const when = lastRun?.startedAt ? fill(t("admin.cloud.mostRecently"), { when: formatRelative(lastRun.startedAt) }) : "";
    detail = `${tries}${when}. ${countText(t, status.pending, "admin.cloud.safeOne", "admin.cloud.safeMany")}`;
    tone = "text-warning-fg";
  } else if (!status.pending) {
    icon = <CheckCircle2 className="w-5 h-5 text-success-fg" aria-hidden="true" />;
    title = t("admin.cloud.upToDate");
    detail = t("admin.cloud.nothingWaiting");
    tone = "text-success-fg";
  } else {
    icon = <Clock className="w-5 h-5 text-brand-fg" aria-hidden="true" />;
    title = countText(t, status.pending, "admin.cloud.waitingOne", "admin.cloud.waitingMany");
    if (status.oldestPendingAt) title += ` ${fill(t("admin.cloud.since"), { when: formatRelative(status.oldestPendingAt) })}`;
    detail = status.intervalMinutes
      ? countText(t, status.intervalMinutes, "admin.cloud.everyMinute", "admin.cloud.everyMinutes")
      : t("admin.cloud.onSchedule");
    tone = "text-fg";
  }

  return (
    <div className="flex items-start gap-3" role="status" aria-live="polite">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className={`text-ui font-bold ${tone}`}>{title}</p>
        <p className="text-caption text-fg-subtle">{detail}</p>
        {failing && lastRun?.details?.error ? (
          <p className="mt-1 text-caption text-fg-subtle break-words">{t("admin.cloud.supportDetails")} {lastRun.details.error}</p>
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

function ScopeForm({ scope, onSaved }) {
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
      const payload = await apiFetch("/sync/settings", { method: "PUT", json: { scope: form } });
      onSaved(payload.scope || form);
      showToast(t("admin.cloud.scopeSaved"), "success");
    } catch (err) {
      setError(getErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key) => setForm((f) => ({ ...f, [key]: !f[key] }));

  return (
    <form onSubmit={save} className="space-y-4">
      <Fieldset legend={t("admin.cloud.alwaysSent")} hint={t("admin.cloud.alwaysSentHelp")}>
        {ALWAYS_SENT.map((key) => (
          <CheckboxField
            key={key}
            label={t(`admin.cloud.scope.${key}.label`)}
            hint={t(`admin.cloud.scope.${key}.help`)}
            checked
            disabled
            onCheckedChange={() => {}}
          />
        ))}
      </Fieldset>

      <Fieldset legend={t("admin.cloud.yourChoice")}>
        {SCOPE_TOGGLES.map((key) => (
          <CheckboxField
            key={key}
            label={t(`admin.cloud.scope.${key}.label`)}
            hint={t(`admin.cloud.scope.${key}.help`)}
            checked={!!form[key]}
            onCheckedChange={() => toggle(key)}
          />
        ))}
      </Fieldset>

      <Field label={t("admin.cloud.people")}>
        <ChoiceGroup
          layout="list"
          value={form.people}
          onChange={(people) => setForm((f) => ({ ...f, people }))}
          options={PEOPLE_OPTIONS.map((value) => ({
            value,
            label: t(`admin.cloud.peopleOptions.${value}.label`),
            description: t(`admin.cloud.peopleOptions.${value}.help`),
          }))}
        />
      </Field>

      <p className="text-caption font-semibold text-fg-muted">{t("admin.cloud.filesStay")}</p>

      <CheckboxField
        label={t("admin.cloud.writtenLabel")}
        hint={t("admin.cloud.writtenHelp")}
        checked={!!form.submissionText}
        onCheckedChange={() => toggle("submissionText")}
      />

      {risky ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-caption font-medium text-warning-fg">
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

      {error ? <p role="alert" className="text-caption font-semibold text-danger-fg">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!dirty || saving}
          className="text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 disabled:opacity-50 rounded-lg px-4 py-2"
        >
          {saving ? t("admin.analytics.saving") : t("admin.analytics.save")}
        </button>
        {dirty ? (
          <button type="button" onClick={() => setForm(scope)} className="text-caption font-semibold text-fg-muted hover:text-fg px-2 py-2">
            {t("admin.cloud.undoChanges")}
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default function CloudSyncSection() {
  const { showToast } = useToast();
  const { t, lang } = useLanguage();
  const formatRelative = (v) => formatRelativeIn(v, lang);
  const formatDateTime = (v) => formatDateTimeIn(v, lang);
  const queryClient = useQueryClient();
  // Loaded once; asked again after "Sync now" (the sync itself is scheduled on the box).
  const query = useQuery({ queryKey: SYNC_STATUS, queryFn: () => apiFetch("/sync/status") });
  const status = query.data || null;
  const error = query.isError ? getErrorMessage(query.error, t) : "";
  const load = () => queryClient.invalidateQueries({ queryKey: SYNC_STATUS });
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState(null); // { ok, text }

  const syncNow = async () => {
    setRunning(true);
    setRunMessage(null);
    try {
      // 503 (the cloud couldn't be reached) still carries the run's message.
      const response = await apiFetch("/sync/run", { method: "POST", responseType: "response" }).catch((err) => {
        if (err instanceof ApiError && err.status !== 0) return { ok: false, payload: err.body || {} };
        throw err;
      });
      const payload = response.payload ?? await response.json().catch(() => ({}));
      const ok = response.ok && (payload.status === "ok" || payload.status === "nothing_to_send");
      const text = payload.message || (response.ok ? t("admin.cloud.syncFinished") : t("admin.cloud.syncFailed"));
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
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 disabled:opacity-50 rounded-lg px-3 py-2"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
            {running ? t("admin.cloud.syncing") : t("admin.cloud.syncNow")}
          </button>
        }
      >
        {error ? <p role="alert" className="text-ui text-danger-fg">{error}</p> : null}
        {!status && !error ? <Loader variant="page" size={40} className="min-h-[6rem]" label={t("admin.cloud.loadingStatus")} /> : null}
        {status ? (
          <div className="space-y-3">
            <StatusLine status={status} />
            <p className="text-caption text-fg-muted">
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
              <p role="status" className={`text-caption font-semibold ${runMessage.ok ? "text-success-fg" : "text-danger-fg"}`}>{runMessage.text}</p>
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
            <p className="text-caption text-fg-subtle">{t("admin.cloud.noSyncs")}</p>
          )}
        </Section>
      ) : null}

      {status?.scope ? (
        <Section
          divided
          title={t("admin.cloud.scopeTitle")}
          description={t("admin.cloud.scopeHelp")}
        >
          <ScopeForm scope={status.scope} onSaved={(scope) => queryClient.setQueryData(SYNC_STATUS, (s) => ({ ...s, scope }))} />
        </Section>
      ) : null}

      {status?.boxId ? (
        <p className="text-caption text-fg-subtle">
          {t("admin.cloud.boxId")} <span className="font-mono select-all">{status.boxId}</span>
          {status.transport ? ` · ${status.transport === "firestore" ? fill(t("admin.cloud.sendsBy"), { via: "Firebase" }) : fill(t("admin.cloud.sendsBy"), { via: t("admin.cloud.webAddress") })}` : ""}
        </p>
      ) : null}
    </div>
  );
}
