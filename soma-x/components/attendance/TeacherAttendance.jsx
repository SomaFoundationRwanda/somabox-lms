"use client";

import { useMemo, useRef, useState } from "react";
import { ClipboardCheck, Loader2, Pencil, Trash2 } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { PageHeader, Section, List, DataTable, EmptyState } from "@/components/layout";
import { LoadingRows, ErrorNote } from "@/components/insights/bits";
import { formatDate, toDateString } from "@/lib/dates";
import Register, { StatusCounts } from "./Register";
import { useAttendanceText, attendanceFlags, pct, attended } from "./text";
import { Field, TextInput } from "@/components/form";


// Sort values for the learners table; nulls always go last.
const SORTS = {
  name: (l) => (l.name || "").toLowerCase(),
  rate: (l) => l.rate,
  attended: (l) => (l.counted ? attended(l) : null),
  absent: (l) => l.absent,
  run: (l) => l.consecutiveAbsences,
  lastAbsent: (l) => l.lastAbsentOn,
};

function FlagChips({ flags }) {
  const { tx } = useAttendanceText();
  if (!flags.length) return <span className="text-caption text-fg-subtle">{tx("noFlags")}</span>;
  return (
    <ul className="flex flex-wrap gap-1" aria-label={tx("flagsLabel")}>
      {flags.map((f) => (
        <li key={f.code} className="whitespace-nowrap rounded-full border border-warning/30 bg-warning-soft px-1.5 py-0.5 text-caption font-semibold text-warning-fg">
          {f.code === "absent_in_a_row" ? tx("flagAbsentInARow", { n: f.n }) : tx("flagLowAttendance", { pct: f.pct, n: f.n })}
        </li>
      ))}
    </ul>
  );
}

// Teachers: take the register, see past registers, and see each learner's attendance.
// Admins (readOnly) can look at everything but not mark.
export default function TeacherAttendance({ readOnly = false }) {
  const { courseId } = useCourse();
  const { showToast } = useToast();
  const { tx, txn } = useAttendanceText();

  // The register overview (sessions and rates); the session being taken is a working copy below.
  const overview = useCourseSection("attendance");
  const data = overview.data;
  const loading = overview.loading;
  const error = overview.error ? overview.error || tx("loadFailed") : "";
  const load = overview.refetch;

  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [opening, setOpening] = useState(false);
  const [openSession, setOpenSession] = useState(null);
  const [sessionLoadingId, setSessionLoadingId] = useState(null);
  const [dirty, setDirty] = useState(false);
  const registerRef = useRef(null);

  const [editing, setEditing] = useState(null); // { id, date, title }
  const [busyId, setBusyId] = useState(null);
  const [sort, setSort] = useState({ key: "rate", dir: "asc" });

  const today = data?.today || toDateString(new Date());
  const defaultTitle = tx("defaultTitle");
  const quickTitles = [defaultTitle, tx("morning"), tx("afternoon")];
  const chosenDate = date || today;
  const chosenTitle = title || defaultTitle;

  const confirmDiscard = () => !dirty || window.confirm(tx("discardConfirm"));

  const openById = async (id, { skipConfirm = false } = {}) => {
    const scrollToRegister = () => requestAnimationFrame(() => registerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    if (openSession?.id === id && dirty) {
      scrollToRegister();
      return;
    }
    if (!skipConfirm && openSession?.id !== id && !confirmDiscard()) return;
    setSessionLoadingId(id);
    try {
      const payload = await apiFetch(`/courses/${courseId}/attendance/sessions/${id}`)
        .catch((err) => { throw new Error(err?.body?.message || tx("openFailed")); });
      setOpenSession(payload);
      scrollToRegister();
    } catch (err) {
      showToast(err.message || tx("openFailed"), "error");
    } finally {
      setSessionLoadingId(null);
    }
  };

  const openRegister = async (e) => {
    e.preventDefault();
    if (chosenDate > today) {
      showToast(tx("futureDate"), "error");
      return;
    }
    if (!confirmDiscard()) return;
    setOpening(true);
    try {
      let payload;
      try {
        payload = await apiFetch(`/courses/${courseId}/attendance/sessions`, { method: "POST", json: { date: chosenDate, title: chosenTitle.trim() || defaultTitle } });
      } catch (err) {
        // 409: there's already a register for that day; open it instead.
        if (err?.status === 409 && err.body?.sessionId) {
          showToast(`${err.body.message || tx("alreadyExists")}. ${tx("openedExisting")}`, "info");
          await openById(err.body.sessionId, { skipConfirm: true });
          return;
        }
        throw new Error(err?.body?.message || tx("openFailed"));
      }
      await openById(payload.id, { skipConfirm: true });
      load();
    } catch (err) {
      showToast(err.message || tx("openFailed"), "error");
    } finally {
      setOpening(false);
    }
  };

  const closeRegister = () => {
    if (!confirmDiscard()) return;
    setOpenSession(null);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editing) return;
    if (editing.date > today) {
      showToast(tx("futureDate"), "error");
      return;
    }
    setBusyId(editing.id);
    try {
      const payload = await apiFetch(`/courses/${courseId}/attendance/sessions/${editing.id}`, { method: "PATCH", json: { date: editing.date, title: editing.title.trim() } })
        .catch((err) => { throw new Error(err?.body?.message || tx("updateFailed")); });
      if (openSession?.id === editing.id) setOpenSession((s) => ({ ...s, date: payload.date ?? editing.date, title: payload.title ?? editing.title.trim() }));
      showToast(tx("updated"), "success");
      setEditing(null);
      load();
    } catch (err) {
      showToast(err.message || tx("updateFailed"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(tx("deleteConfirm", { title: s.title, date: formatDate(s.date) }))) return;
    setBusyId(s.id);
    try {
      await apiFetch(`/courses/${courseId}/attendance/sessions/${s.id}`, { method: "DELETE" })
        .catch((err) => { throw new Error(err?.body?.message || tx("deleteFailed")); });
      if (openSession?.id === s.id) {
        setDirty(false);
        setOpenSession(null);
      }
      showToast(tx("deleted"), "success");
      load();
    } catch (err) {
      showToast(err.message || tx("deleteFailed"), "error");
    } finally {
      setBusyId(null);
    }
  };

  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  const rules = data?.rules;
  const learners = useMemo(() => {
    const list = (Array.isArray(data?.learners) ? data.learners : []).map((l) => ({ ...l, flags: attendanceFlags(l, rules) }));
    const get = SORTS[sort.key] || SORTS.rate;
    const dir = sort.dir === "asc" ? 1 : -1;
    return list.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return SORTS.name(a) < SORTS.name(b) ? -1 : 1;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return SORTS.name(a) < SORTS.name(b) ? -1 : 1;
    });
  }, [data, rules, sort]);
  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" || key === "rate" ? "asc" : "desc" }));
  const flaggedCount = learners.filter((l) => l.flags.length).length;
  const lowRatePct = Math.round((rules?.lowRate ?? 0.8) * 100);

  return (
    <div className="space-y-8">
      <PageHeader title={tx("title")} description={readOnly ? tx("descriptionAdmin") : tx("description")} />

      {loading && !data ? (
        <LoadingRows count={4} />
      ) : error && !data ? (
        <ErrorNote message={error} onRetry={load} />
      ) : (
        <>
          {!readOnly ? (
            <Section title={tx("takeTitle")} description={tx("takeDescription")}>
              <form onSubmit={openRegister} className="grid gap-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto] sm:items-end">
                <Field id="att-date" label={tx("date")}>
                  <TextInput type="date" value={chosenDate} max={today} onChange={(e) => setDate(e.target.value)} required size="lg" />
                </Field>
                <Field id="att-title" label={tx("sessionName")}>
                  <TextInput value={title} placeholder={defaultTitle} maxLength={80} onChange={(e) => setTitle(e.target.value)} size="lg" />
                </Field>
                <button
                  type="submit"
                  disabled={opening}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-5 text-ui font-bold text-on-brand hover:bg-brand/90 disabled:opacity-60"
                >
                  {opening ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ClipboardCheck aria-hidden="true" className="h-4 w-4" />}
                  {tx("openRegister")}
                </button>
                <div className="flex flex-wrap items-center gap-2 sm:col-span-3" role="group" aria-label={tx("quickNames")}>
                  {quickTitles.map((q) => (
                    <button
                      key={q}
                      type="button"
                      aria-pressed={chosenTitle === q}
                      onClick={() => setTitle(q === defaultTitle ? "" : q)}
                      className={`inline-flex h-11 items-center rounded-full border px-4 text-ui font-semibold ${
                        chosenTitle === q ? "border-brand bg-brand/10 text-brand-fg" : "border-line text-fg-muted hover:bg-surface-hover"
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </form>
            </Section>
          ) : null}

          {openSession ? (
            <section ref={registerRef} aria-label={tx("registerRegion")} className="scroll-mt-4">
              <Register
                session={openSession}
                readOnly={readOnly}
                onClose={closeRegister}
                onSaved={load}
                onDirtyChange={setDirty}
              />
            </section>
          ) : null}

          <Section divided title={tx("registersTitle")} description={sessions.length ? tx("registersDescription") : undefined}>
            {sessions.length === 0 ? (
              <EmptyState compact title={readOnly ? tx("emptyAdmin") : tx("empty")} />
            ) : (
              <List label={tx("registersTitle")}>
                {sessions.map((s) => {
                  const isOpen = openSession?.id === s.id;
                  const isEditing = editing?.id === s.id;
                  if (isEditing) {
                    return (
                      <li key={s.id} className="px-3 py-3">
                        <form onSubmit={saveEdit} className="grid gap-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto_auto] sm:items-end">
                          <Field id={`att-edit-date-${s.id}`} label={tx("date")}>
                            <TextInput type="date" max={today} required value={editing.date} onChange={(e) => setEditing((v) => ({ ...v, date: e.target.value }))} size="lg" />
                          </Field>
                          <Field id={`att-edit-title-${s.id}`} label={tx("sessionName")}>
                            <TextInput required maxLength={80} value={editing.title} onChange={(e) => setEditing((v) => ({ ...v, title: e.target.value }))} size="lg" />
                          </Field>
                          <button type="submit" disabled={busyId === s.id} className="inline-flex h-11 items-center justify-center rounded-lg bg-brand px-4 text-ui font-bold text-on-brand hover:bg-brand/90 disabled:opacity-60">{tx("saveChanges")}</button>
                          <button type="button" onClick={() => setEditing(null)} className="inline-flex h-11 items-center justify-center rounded-lg px-4 text-ui font-semibold text-fg-muted hover:bg-surface-hover">{tx("cancel")}</button>
                        </form>
                      </li>
                    );
                  }
                  return (
                    <li key={s.id} className={`flex items-center gap-1 pr-2 ${isOpen ? "bg-brand/5" : ""}`}>
                      <button
                        type="button"
                        onClick={() => openById(s.id)}
                        aria-current={isOpen ? "true" : undefined}
                        className="flex min-h-14 min-w-0 flex-1 flex-col items-start gap-1 px-3 py-2.5 text-left hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-3"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-ui font-semibold text-fg">
                            {s.title}
                            {sessionLoadingId === s.id ? <Loader2 aria-hidden="true" className="ml-2 inline h-3.5 w-3.5 animate-spin" /> : null}
                          </span>
                          <span className="block text-caption text-fg-subtle">{formatDate(s.date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                        </span>
                        <StatusCounts counts={s.counts} unmarked={s.unmarked} className="text-caption text-fg-muted" />
                      </button>
                      {!readOnly ? (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing({ id: s.id, date: s.date, title: s.title })}
                            aria-label={tx("editSession", { title: s.title, date: formatDate(s.date) })}
                            title={tx("rename")}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-hover hover:text-fg"
                          >
                            <Pencil aria-hidden="true" className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(s)}
                            disabled={busyId === s.id}
                            aria-label={tx("deleteSession", { title: s.title, date: formatDate(s.date) })}
                            title={tx("delete")}
                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-fg-subtle hover:bg-danger-soft hover:text-danger-fg disabled:opacity-50"
                          >
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                          </button>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </List>
            )}
          </Section>

          <Section
            divided
            title={tx("learnersTitle")}
            description={tx("learnersDescription", { n: rules?.consecutiveAbsences ?? 3, pct: lowRatePct })}
            actions={flaggedCount ? <span className="text-caption font-semibold text-warning-fg">{txn("flaggedCount", flaggedCount)}</span> : null}
          >
            <DataTable
              caption={tx("learnersTitle")}
              rows={learners}
              rowKey={(l) => l.id}
              sort={sort}
              onSort={onSort}
              rowClassName={(l) => (l.flags.length ? "bg-warning-soft/60" : "")}
              empty={tx("noLearners")}
              columns={[
                { key: "name", header: tx("colLearner"), sortable: true, className: "min-w-[10rem] font-medium text-fg" },
                {
                  key: "rate",
                  header: tx("colRate"),
                  sortable: true,
                  align: "right",
                  render: (l) => (l.rate == null ? <span className="whitespace-nowrap text-caption text-fg-subtle">{tx("noneCounted")}</span> : <span className="font-semibold">{pct(l.rate)}</span>),
                },
                { key: "attended", header: tx("colAttended"), sortable: true, align: "right", className: "whitespace-nowrap", render: (l) => (l.counted ? tx("attendedOf", { a: attended(l), n: l.counted }) : "—") },
                { key: "absent", header: tx("colAbsences"), sortable: true, align: "right", render: (l) => l.absent ?? 0 },
                { key: "run", header: tx("colRun"), sortable: true, align: "right", render: (l) => <span className={l.consecutiveAbsences >= (rules?.consecutiveAbsences ?? 3) ? "font-semibold text-danger-fg" : ""}>{l.consecutiveAbsences ?? 0}</span> },
                { key: "lastAbsent", header: tx("colLastAbsent"), sortable: true, hideOnMobile: true, className: "whitespace-nowrap text-caption", render: (l) => (l.lastAbsentOn ? formatDate(l.lastAbsentOn) : "—") },
                { key: "flags", header: tx("colFlags"), className: "min-w-[11rem]", render: (l) => <FlagChips flags={l.flags} /> },
              ]}
            />
            <p className="mt-2 text-caption text-fg-subtle">{tx("countingRule")}</p>
          </Section>
        </>
      )}
    </div>
  );
}
