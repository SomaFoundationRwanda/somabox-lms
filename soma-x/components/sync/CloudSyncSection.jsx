"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw, Clock } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { Section, List, ListRow } from "@/components/layout";
import { formatDateTime, formatRelative } from "@/lib/dates";

// Cloud sync (admins): changes made on this box wait in a queue and are sent to the cloud on a
// schedule. This shows where the queue stands, lets an admin send now, and sets what may leave
// the box.

const RUN_LABELS = {
  ok: "Sent",
  failed: "Couldn't reach the cloud",
  not_configured: "Not set up",
  nothing_to_send: "Nothing to send",
};

const SCOPE_TOGGLES = [
  { key: "courses", label: "Courses and outcomes", help: "Course titles, weeks, pages, quizzes, assignments and the outcomes they teach." },
  { key: "enrollments", label: "Enrollments", help: "Who is in which course, and as teacher or learner." },
  { key: "grades", label: "Grades and quiz results", help: "Marks on assignments and quiz scores." },
  { key: "outcomeResults", label: "Outcome results", help: "How each learner is doing on each outcome. Used for school and district reports." },
  { key: "events", label: "Usage events", help: "Which pages and tools are opened, so the team can see what helps. No written work." },
];

const PEOPLE_OPTIONS = [
  { value: "none", label: "No personal details", help: "Results are sent without saying whose they are." },
  { value: "pseudonymous", label: "Anonymous IDs only (recommended)", help: "The cloud sees a random ID for each person, never names or emails. Progress can still be followed over time." },
  { value: "full", label: "Names and emails", help: "The cloud sees who each person is." },
];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function StatusLine({ status }) {
  const lastRun = status.runs?.[0];
  const failing = status.configured && (status.failedAttempts > 0 || lastRun?.status === "failed") && status.pending > 0;

  let icon, title, detail, tone;
  if (!status.configured) {
    icon = <CloudOff className="w-5 h-5 text-slate-400" aria-hidden="true" />;
    title = "Not set up on this box yet";
    detail = "Everything keeps working on this box. To send changes to the cloud, an administrator sets SYNC_URL or a Firebase key in the box's settings file and restarts it.";
    tone = "text-slate-800 dark:text-slate-100";
  } else if (failing) {
    icon = <AlertTriangle className="w-5 h-5 text-amber-600" aria-hidden="true" />;
    title = "Couldn't reach the cloud last time — will retry";
    const tries = status.failedAttempts > 0 ? `Tried ${plural(status.failedAttempts, "time", "times")}` : "The last try failed";
    const when = lastRun?.startedAt ? `, most recently ${formatRelative(lastRun.startedAt)}` : "";
    detail = `${tries}${when}. ${plural(status.pending, "change is", "changes are")} safe on this box and will be sent when the connection works.`;
    tone = "text-amber-800 dark:text-amber-300";
  } else if (!status.pending) {
    icon = <CheckCircle2 className="w-5 h-5 text-emerald-600" aria-hidden="true" />;
    title = "Up to date";
    detail = "Nothing is waiting to be sent.";
    tone = "text-emerald-800 dark:text-emerald-300";
  } else {
    icon = <Clock className="w-5 h-5 text-[#0D9488]" aria-hidden="true" />;
    const since = status.oldestPendingAt ? ` since ${formatRelative(status.oldestPendingAt)}` : "";
    title = `${plural(status.pending, "change", "changes")} waiting${since}`;
    detail = status.intervalMinutes
      ? `They are sent automatically about every ${plural(status.intervalMinutes, "minute", "minutes")}.`
      : "They are sent automatically on a schedule.";
    tone = "text-slate-800 dark:text-slate-100";
  }

  return (
    <div className="flex items-start gap-3" role="status" aria-live="polite">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className={`text-sm font-bold ${tone}`}>{title}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{detail}</p>
        {failing && lastRun?.details?.error ? (
          <p className="mt-1 text-[11px] text-slate-500 break-words">Details for support: {lastRun.details.error}</p>
        ) : null}
      </div>
    </div>
  );
}

function runSummary(run) {
  const d = run.details || {};
  const parts = [];
  if (d.sent != null) parts.push(`${d.sent} sent`);
  if (d.skipped) parts.push(`${d.skipped} not allowed to leave the box`);
  if (d.pending) parts.push(`${d.pending} still waiting`);
  return parts.join(" · ");
}

function ScopeForm({ SERVER_URL, scope, onSaved }) {
  const { showToast } = useToast();
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
      if (!res.ok) throw new Error(payload.message || "Couldn't save what leaves this box.");
      onSaved(payload.scope || form);
      showToast("Saved. This applies to changes sent from now on.", "success");
    } catch (err) {
      setError(err.message || "Couldn't save what leaves this box.");
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key) => setForm((f) => ({ ...f, [key]: !f[key] }));

  return (
    <form onSubmit={save} className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="sr-only">Kinds of information</legend>
        {SCOPE_TOGGLES.map((t) => (
          <label key={t.key} className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={!!form[t.key]}
              onChange={() => toggle(t.key)}
              className="mt-1 h-4 w-4 shrink-0 accent-[#0D9488]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{t.label}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{t.help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">People</legend>
        {PEOPLE_OPTIONS.map((o) => (
          <label key={o.value} className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="sync-people"
              value={o.value}
              checked={form.people === o.value}
              onChange={() => setForm((f) => ({ ...f, people: o.value }))}
              className="mt-1 h-4 w-4 shrink-0 accent-[#0D9488]"
            />
            <span className="min-w-0">
              <span className="block text-sm text-slate-800 dark:text-slate-100">{o.label}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{o.help}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={!!form.submissionText}
          onChange={() => toggle("submissionText")}
          className="mt-1 h-4 w-4 shrink-0 accent-[#0D9488]"
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">Learners&apos; written answers and teacher feedback</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">What learners write in assignments and what teachers write back. Off unless you need it.</span>
        </span>
      </label>

      {risky ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
          <span>
            {form.people === "full" && form.submissionText
              ? "Names, emails and learners' own writing will leave this box. "
              : form.people === "full"
                ? "Names and emails will leave this box. "
                : "Learners' own writing will leave this box. "}
            Only choose this if your school has agreed to it and the cloud is allowed to hold personal information.
          </span>
        </p>
      ) : null}

      {error ? <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={!dirty || saving}
          className="text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] disabled:opacity-50 rounded-lg px-4 py-2"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {dirty ? (
          <button type="button" onClick={() => setForm(scope)} className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-2">
            Undo changes
          </button>
        ) : null}
      </div>
    </form>
  );
}

export default function CloudSyncSection({ SERVER_URL }) {
  const { showToast } = useToast();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState(null); // { ok, text }

  const load = useCallback(async () => {
    if (!SERVER_URL) return;
    try {
      const res = await fetch(`${SERVER_URL}/sync/status`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Couldn't load the cloud sync status.");
      setStatus(payload);
      setError("");
    } catch (err) {
      setError(err.message || "Couldn't load the cloud sync status.");
    }
  }, [SERVER_URL]);

  useEffect(() => { load(); }, [load]);

  const syncNow = async () => {
    setRunning(true);
    setRunMessage(null);
    try {
      const res = await fetch(`${SERVER_URL}/sync/run`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      const ok = res.ok && (payload.status === "ok" || payload.status === "nothing_to_send");
      const text = payload.message || (res.ok ? "Sync finished." : "Sync failed.");
      setRunMessage({ ok, text });
      showToast(text, ok ? "success" : "error");
    } catch {
      const text = "Couldn't reach this box. Check the connection and try again.";
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
        title="Cloud sync"
        description="This box keeps working without internet. Changes wait here and are sent to the cloud on a schedule, never when someone logs in."
        actions={
          <button
            type="button"
            onClick={syncNow}
            disabled={running || !status}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] disabled:opacity-50 rounded-lg px-3 py-2"
          >
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
            {running ? "Syncing..." : "Sync now"}
          </button>
        }
      >
        {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
        {!status && !error ? <div className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" aria-label="Loading the cloud sync status" /> : null}
        {status ? (
          <div className="space-y-3">
            <StatusLine status={status} />
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Last successful sync:{" "}
              {status.lastSuccessAt ? (
                <time dateTime={status.lastSuccessAt} title={formatDateTime(status.lastSuccessAt)} className="font-semibold">
                  {formatRelative(status.lastSuccessAt)} ({formatDateTime(status.lastSuccessAt)})
                </time>
              ) : (
                <span className="font-semibold">never</span>
              )}
            </p>
            {runMessage ? (
              <p role="status" className={`text-xs font-semibold ${runMessage.ok ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600"}`}>{runMessage.text}</p>
            ) : null}
          </div>
        ) : null}
      </Section>

      {status ? (
        <Section divided title="Recent syncs">
          {status.runs?.length ? (
            <List label="Recent syncs">
              {status.runs.map((run, i) => (
                <ListRow
                  key={`${run.startedAt}-${i}`}
                  tone={run.status === "failed" ? "warning" : "default"}
                  title={RUN_LABELS[run.status] || run.status}
                  subtitle={[formatDateTime(run.startedAt), runSummary(run), run.details?.error].filter(Boolean).join(" · ") || undefined}
                />
              ))}
            </List>
          ) : (
            <p className="text-xs text-slate-500">No syncs yet.</p>
          )}
        </Section>
      ) : null}

      {status?.scope ? (
        <Section
          divided
          title="What leaves this box"
          description="Only what is ticked here is sent to the cloud. Everything else stays on this box."
        >
          <ScopeForm SERVER_URL={SERVER_URL} scope={status.scope} onSaved={(scope) => setStatus((s) => ({ ...s, scope }))} />
        </Section>
      ) : null}

      {status?.boxId ? (
        <p className="text-[11px] text-slate-400">
          Box ID (for support): <span className="font-mono select-all">{status.boxId}</span>
          {status.transport ? ` · sends by ${status.transport === "firestore" ? "Firebase" : "web address"}` : ""}
        </p>
      ) : null}
    </div>
  );
}
