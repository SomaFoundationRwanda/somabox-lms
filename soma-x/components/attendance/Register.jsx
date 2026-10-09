"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import { formatDate } from "@/lib/dates";
import { useAttendanceText, STATUSES, STATUS_STYLE, statusKey, letterKey } from "./text";

const NOTE_MAX = 300;

// Counts as letters with full words for screen readers: "P 12 · L 1 · A 2 · E 0".
export function StatusCounts({ counts, unmarked, className = "" }) {
  const { tx, txn } = useAttendanceText();
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 ${className}`}>
      {STATUSES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 whitespace-nowrap">
          <span aria-hidden="true" className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[11px] font-bold ${STATUS_STYLE[s].on}`}>{tx(letterKey(s))}</span>
          <span className="sr-only">{tx(statusKey(s))}</span>
          <span className="font-semibold tabular-nums">{counts?.[s] ?? 0}</span>
        </span>
      ))}
      {unmarked ? <span className="whitespace-nowrap font-semibold text-slate-600 dark:text-slate-300">{txn("notMarked", unmarked)}</span> : null}
    </span>
  );
}

// One learner's four statuses as a radio group: arrow keys move and choose, a tap on the
// chosen status clears it.
function StatusGroup({ name, value, onChange, disabled }) {
  const { tx } = useAttendanceText();
  const refs = useRef([]);
  const chosen = STATUSES.indexOf(value);
  const tabStop = chosen >= 0 ? chosen : 0;

  const onKey = (e, i) => {
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % STATUSES.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + STATUSES.length) % STATUSES.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = STATUSES.length - 1;
    if (next == null) return;
    e.preventDefault();
    onChange(STATUSES[next]);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={tx("statusFor", { name })} aria-disabled={disabled || undefined} className="grid grid-cols-4 gap-1.5 sm:flex sm:shrink-0">
      {STATUSES.map((s, i) => {
        const checked = value === s;
        const style = STATUS_STYLE[s];
        return (
          <button
            key={s}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={tx(statusKey(s))}
            title={tx(statusKey(s))}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(checked ? null : s)}
            onKeyDown={(e) => onKey(e, i)}
            className={`relative inline-flex h-12 min-w-12 items-center justify-center rounded-lg border-2 text-base font-bold transition-colors sm:w-12 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--brand-secondary)] disabled:cursor-not-allowed ${
              checked ? style.on : `bg-white dark:bg-slate-950 ${style.off} ${disabled ? "" : "hover:bg-slate-50 dark:hover:bg-slate-900"}`
            }`}
          >
            <span aria-hidden="true">{tx(letterKey(s))}</span>
            {checked ? <Check aria-hidden="true" className="absolute right-0.5 top-0.5 h-3 w-3" strokeWidth={3} /> : null}
          </button>
        );
      })}
    </div>
  );
}

function RosterRow({ row, mark, onStatus, onNote, noteOpen, toggleNote, readOnly }) {
  const { tx } = useAttendanceText();
  const disabled = readOnly || !row.current;
  const noteId = `att-note-${row.userId}`;
  return (
    <li className={`px-3 py-3 ${row.current ? "" : "bg-slate-50 opacity-60 dark:bg-slate-900/40"}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{row.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {tx(statusKey(mark.status))}
            {!row.current ? ` · ${tx("noLongerInClass")}` : ""}
            {mark.note && !noteOpen ? ` · ${mark.note}` : ""}
          </p>
        </div>
        <StatusGroup name={row.name} value={mark.status} onChange={onStatus} disabled={disabled} />
        {!disabled ? (
          <button
            type="button"
            onClick={toggleNote}
            aria-expanded={noteOpen}
            aria-controls={noteId}
            className="inline-flex h-11 items-center justify-center gap-1 self-start rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 sm:self-auto"
          >
            {mark.note ? tx("editNote") : tx("addNote")}
            {noteOpen ? <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>
      {noteOpen && !disabled ? (
        <div id={noteId} className="mt-2">
          <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300" htmlFor={`${noteId}-input`}>
            {tx("noteFor", { name: row.name })}
          </label>
          <input
            id={`${noteId}-input`}
            type="text"
            value={mark.note}
            maxLength={NOTE_MAX}
            onChange={(e) => onNote(e.target.value)}
            placeholder={tx("notePlaceholder")}
            className="mt-1 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[var(--brand-secondary)] dark:border-slate-700 dark:bg-slate-900"
          />
          {!mark.status ? <p className="mt-1 text-xs text-slate-500">{tx("noteNeedsStatus")}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

const toMarks = (roster) => Object.fromEntries((roster || []).map((r) => [r.userId, { status: r.status ?? null, note: r.note || "" }]));

// The register for one session. Keeps edits locally until Save, then sends only changed rows.
export default function Register({ session, readOnly = false, onClose, onSaved, onDirtyChange }) {
  const { SERVER_URL, courseId } = useCourse();
  const { showToast } = useToast();
  const { tx, txn } = useAttendanceText();
  const [original, setOriginal] = useState(() => toMarks(session.roster));
  const [marks, setMarks] = useState(() => toMarks(session.roster));
  const [notesOpen, setNotesOpen] = useState(() => new Set());
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    setOriginal(toMarks(session.roster));
    setMarks(toMarks(session.roster));
    setNotesOpen(new Set());
    setJustSaved(false);
    // Renaming or moving the session keeps the roster, so unsaved marks survive it.
  }, [session.id, session.roster]);

  const roster = useMemo(() => {
    const list = Array.isArray(session.roster) ? session.roster : [];
    return { current: list.filter((r) => r.current), former: list.filter((r) => !r.current) };
  }, [session.roster]);

  const changed = useMemo(() => roster.current.filter((r) => {
    const a = marks[r.userId] || { status: null, note: "" };
    const b = original[r.userId] || { status: null, note: "" };
    if (a.status !== b.status) return true;
    return a.status != null && a.note.trim() !== (b.note || "").trim();
  }), [roster.current, marks, original]);
  const dirty = changed.length > 0;

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  // Warn before leaving with unsaved marks: closing the tab, or following a link in the app.
  useEffect(() => {
    if (!dirty) return undefined;
    const onBeforeUnload = (e) => { e.preventDefault(); e.returnValue = ""; };
    const onClick = (e) => {
      const a = e.target?.closest?.("a[href]");
      if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey) return;
      if (!window.confirm(tx("leaveConfirm"))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, tx]);

  const counts = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, excused: 0 };
    let unmarked = 0;
    for (const r of roster.current) {
      const s = marks[r.userId]?.status;
      if (s) c[s] += 1;
      else unmarked += 1;
    }
    return { c, unmarked };
  }, [roster.current, marks]);

  const setStatus = (userId, status) => {
    setJustSaved(false);
    setMarks((m) => ({ ...m, [userId]: { ...(m[userId] || { note: "" }), status } }));
  };
  const setNote = (userId, note) => {
    setJustSaved(false);
    setMarks((m) => ({ ...m, [userId]: { ...(m[userId] || { status: null }), note } }));
  };
  const toggleNote = (userId) => setNotesOpen((s) => {
    const next = new Set(s);
    if (next.has(userId)) next.delete(userId); else next.add(userId);
    return next;
  });
  const markAllPresent = () => {
    setJustSaved(false);
    setMarks((m) => {
      const next = { ...m };
      for (const r of roster.current) if (!next[r.userId]?.status) next[r.userId] = { ...(next[r.userId] || { note: "" }), status: "present" };
      return next;
    });
  };

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const records = changed.map((r) => {
        const m = marks[r.userId];
        return m.status ? { userId: r.userId, status: m.status, note: m.note.trim() } : { userId: r.userId, status: null };
      });
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/attendance/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || tx("saveFailed"));
      setOriginal(marks);
      setJustSaved(true);
      showToast(tx("saved"), "success");
      onSaved?.();
    } catch (err) {
      showToast(err.message || tx("saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const heading = `${session.title} · ${formatDate(session.date, { weekday: "long", day: "numeric", month: "long" })}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{heading}</h3>
          <p className="text-xs text-slate-500">{readOnly ? tx("readOnlyHint") : tx("registerHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && roster.current.length > 0 ? (
            <button
              type="button"
              onClick={markAllPresent}
              disabled={counts.unmarked === 0}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-emerald-300 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/30"
            >
              <Check aria-hidden="true" className="h-4 w-4" />
              {tx("markAllPresent")}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X aria-hidden="true" className="h-4 w-4" />
              {tx("closeRegister")}
            </button>
          ) : null}
        </div>
      </div>

      {roster.current.length === 0 && roster.former.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500 dark:border-slate-800">{tx("noLearners")}</p>
      ) : (
        <ul aria-label={tx("registerListLabel", { title: session.title })} className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {roster.current.map((r) => (
            <RosterRow
              key={r.userId}
              row={r}
              mark={marks[r.userId] || { status: null, note: "" }}
              onStatus={(s) => setStatus(r.userId, s)}
              onNote={(n) => setNote(r.userId, n)}
              noteOpen={notesOpen.has(r.userId)}
              toggleNote={() => toggleNote(r.userId)}
              readOnly={readOnly}
            />
          ))}
          {roster.former.length > 0 ? (
            <li className="bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-900/40">{tx("formerLearners")}</li>
          ) : null}
          {roster.former.map((r) => (
            <RosterRow key={r.userId} row={r} mark={marks[r.userId] || { status: null, note: "" }} onStatus={() => {}} onNote={() => {}} noteOpen={false} toggleNote={() => {}} readOnly />
          ))}
        </ul>
      )}

      {!readOnly ? (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusCounts counts={counts.c} unmarked={counts.unmarked} className="flex-1 text-sm text-slate-700 dark:text-slate-200" />
            <span aria-live="polite" className="text-xs font-semibold text-slate-500">
              {dirty ? txn("unsavedChanges", changed.length) : justSaved ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400"><Check aria-hidden="true" className="h-3.5 w-3.5" />{tx("saved")}</span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="inline-flex h-11 min-w-24 items-center justify-center gap-1.5 rounded-lg bg-[var(--brand-secondary)] px-5 text-sm font-bold text-white hover:bg-[var(--brand-secondary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
              {saving ? tx("saving") : tx("save")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
