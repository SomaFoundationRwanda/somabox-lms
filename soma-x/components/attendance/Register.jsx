"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import { formatDate } from "@/lib/dates";
import { useAttendanceText, STATUSES, STATUS_STYLE, statusKey, letterKey } from "./text";
import { apiFetch } from "@/lib/api";
import { Field, TextInput } from "@/components/form";

const NOTE_MAX = 300;

// Counts as letters with full words for screen readers: "P 12 · L 1 · A 2 · E 0".
export function StatusCounts({ counts, unmarked, className = "" }) {
  const { tx, txn } = useAttendanceText();
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 ${className}`}>
      {STATUSES.map((s) => (
        <span key={s} className="inline-flex items-center gap-1 whitespace-nowrap">
          <span aria-hidden="true" className={`inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-caption font-bold ${STATUS_STYLE[s].on}`}>{tx(letterKey(s))}</span>
          <span className="sr-only">{tx(statusKey(s))}</span>
          <span className="font-semibold tabular-nums">{counts?.[s] ?? 0}</span>
        </span>
      ))}
      {unmarked ? <span className="whitespace-nowrap font-semibold text-fg-muted">{txn("notMarked", unmarked)}</span> : null}
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
            className={`relative inline-flex h-12 min-w-12 items-center justify-center rounded-lg border-2 text-item font-bold transition-colors sm:w-12 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand disabled:cursor-not-allowed ${
              checked ? style.on : `bg-surface ${style.off} ${disabled ? "" : "hover:bg-surface-hover"}`
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
    <li className={`px-3 py-3 ${row.current ? "" : "bg-surface-sunken opacity-60"}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-ui font-semibold text-fg">{row.name}</p>
          <p className="text-caption text-fg-subtle">
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
            className="inline-flex h-11 items-center justify-center gap-1 self-start rounded-lg px-2 text-caption font-semibold text-fg-muted hover:bg-surface-hover sm:self-auto"
          >
            {mark.note ? tx("editNote") : tx("addNote")}
            {noteOpen ? <ChevronUp aria-hidden="true" className="h-3.5 w-3.5" /> : <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />}
          </button>
        ) : null}
      </div>
      {noteOpen && !disabled ? (
        <div id={noteId} className="mt-2">
          <Field id={`${noteId}-input`} label={tx("noteFor", { name: row.name })} hint={!mark.status ? tx("noteNeedsStatus") : undefined}>
            <TextInput
              value={mark.note}
              maxLength={NOTE_MAX}
              onChange={(e) => onNote(e.target.value)}
              placeholder={tx("notePlaceholder")}
              size="lg"
            />
          </Field>
        </div>
      ) : null}
    </li>
  );
}

const toMarks = (roster) => Object.fromEntries((roster || []).map((r) => [r.userId, { status: r.status ?? null, note: r.note || "" }]));

// The register for one session. Keeps edits locally until Save, then sends only changed rows.
export default function Register({ session, readOnly = false, onClose, onSaved, onDirtyChange }) {
  const { courseId } = useCourse();
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
      await apiFetch(`/courses/${courseId}/attendance/sessions/${session.id}`, { method: "PUT", json: { records } })
        .catch((err) => { throw new Error(err?.body?.message || tx("saveFailed")); });
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
          <h3 className="text-item font-bold text-fg">{heading}</h3>
          <p className="text-caption text-fg-subtle">{readOnly ? tx("readOnlyHint") : tx("registerHint")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!readOnly && roster.current.length > 0 ? (
            <button
              type="button"
              onClick={markAllPresent}
              disabled={counts.unmarked === 0}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-success/30 px-3 text-ui font-semibold text-success-fg hover:bg-success-soft disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Check aria-hidden="true" className="h-4 w-4" />
              {tx("markAllPresent")}
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-11 items-center gap-1 rounded-lg px-3 text-ui font-semibold text-fg-muted hover:bg-surface-hover"
            >
              <X aria-hidden="true" className="h-4 w-4" />
              {tx("closeRegister")}
            </button>
          ) : null}
        </div>
      </div>

      {roster.current.length === 0 && roster.former.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-ui text-fg-subtle">{tx("noLearners")}</p>
      ) : (
        <ul aria-label={tx("registerListLabel", { title: session.title })} className="divide-y divide-line rounded-xl border border-line">
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
            <li className="bg-surface-sunken px-3 py-2 text-caption font-semibold text-fg-subtle">{tx("formerLearners")}</li>
          ) : null}
          {roster.former.map((r) => (
            <RosterRow key={r.userId} row={r} mark={marks[r.userId] || { status: null, note: "" }} onStatus={() => {}} onNote={() => {}} noteOpen={false} toggleNote={() => {}} readOnly />
          ))}
        </ul>
      )}

      {!readOnly ? (
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusCounts counts={counts.c} unmarked={counts.unmarked} className="flex-1 text-ui text-fg-muted" />
            <span aria-live="polite" className="text-caption font-semibold text-fg-subtle">
              {dirty ? txn("unsavedChanges", changed.length) : justSaved ? (
                <span className="inline-flex items-center gap-1 text-success-fg"><Check aria-hidden="true" className="h-3.5 w-3.5" />{tx("saved")}</span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving}
              className="inline-flex h-11 min-w-24 items-center justify-center gap-1.5 rounded-lg bg-brand px-5 text-ui font-bold text-on-brand hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
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
