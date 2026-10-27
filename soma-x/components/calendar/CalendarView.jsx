"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, CalendarClock, ChevronLeft, ChevronRight, Clock, Layers, List, Lock, Unlock, X,
} from "lucide-react";
import { addDays, compareDates, diffDays, todayIn, weekday } from "@somabox/timeline";
import { useCourseText } from "@/components/course/useCourseText";
import Loader from "@/components/ui/Loader";
import { Label, TextInput } from "@/components/form";

// Visual language per event type. Labels shown on screen come from course.calendar.types.<type>.
export const EVENT_TYPES = {
  module: { label: "Module starts", Icon: Layers, chip: "bg-brand-strong/10 text-brand-fg border-brand-strong/20", dot: "bg-brand-strong" },
  release: { label: "Opens", Icon: Unlock, chip: "bg-info-soft text-info-fg border-info/30", dot: "bg-info" },
  due: { label: "Due", Icon: Clock, chip: "bg-warning-soft text-warning-fg border-warning/30", dot: "bg-warning" },
  close: { label: "Closes", Icon: Lock, chip: "bg-danger-soft text-danger-fg border-danger/30", dot: "bg-danger" },
};
const TYPE_ORDER = { module: 0, release: 1, due: 2, close: 3 };
const MAX_CHIPS = 3;
const AGENDA_BACK = 30;
const AGENDA_AHEAD = 120;

const eventKey = (e) => `${e.courseId ?? ""}:${e.id}`;

function sortEvents(a, b) {
  return compareDates(a.date, b.date)
    || (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9)
    || String(a.title || "").localeCompare(String(b.title || ""));
}

function monthStart(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

function shiftMonth(firstOfMonth, delta) {
  const [y, m] = firstOfMonth.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01`;
}

/** Monday-first grid covering the month of firstOfMonth: { start, end, days[] }. */
function monthGrid(firstOfMonth) {
  const lead = (weekday(firstOfMonth) + 6) % 7;
  const start = addDays(firstOfMonth, -lead);
  const nextMonth = shiftMonth(firstOfMonth, 1);
  const daysInMonth = diffDays(firstOfMonth, nextMonth);
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  return { start, end: days[days.length - 1], days };
}

const typeKey = (type) => (EVENT_TYPES[type] ? type : "module");

function EventChip({ event, showCourse, compact, canMove, onMoveClick, onDragStart, onDragEnd }) {
  const { t, tf } = useCourseText();
  const meta = EVENT_TYPES[event.type] || EVENT_TYPES.module;
  const typeLabel = t(`calendar.types.${typeKey(event.type)}`);
  const Icon = meta.Icon;
  const draggable = Boolean(canMove && onDragStart);
  const title = event.title || t("calendar.untitled");
  const label = `${typeLabel}: ${title}${showCourse && event.courseTitle ? ` (${event.courseTitle})` : ""}`;
  const body = (
    <>
      <Icon className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} shrink-0`} aria-hidden="true" />
      <span className="truncate">
        {!compact && <span className="font-bold">{typeLabel}: </span>}
        {title}
        {event.published === false && <span className="italic opacity-70"> ({t("calendar.draft")})</span>}
      </span>
      {showCourse && event.courseTitle && (
        <span className={`truncate opacity-70 ${compact ? "hidden sm:inline" : ""}`}>· {event.courseTitle}</span>
      )}
    </>
  );
  const chipCls = `flex items-center gap-1 min-w-0 flex-1 border rounded-md ${compact ? "px-1 py-0.5 text-caption" : "px-2 py-1 text-caption"} ${meta.chip} hover:brightness-95 focus-visible:outline-2 focus-visible:outline-brand`;

  return (
    <div className="flex items-center gap-0.5 min-w-0">
      {event.url ? (
        <Link
          href={event.url}
          className={chipCls}
          title={label}
          aria-label={label}
          draggable={draggable || undefined}
          onDragStart={draggable ? (e) => onDragStart(e, event) : undefined}
          onDragEnd={draggable ? onDragEnd : undefined}
        >
          {body}
        </Link>
      ) : (
        <span
          className={chipCls}
          title={label}
          draggable={draggable || undefined}
          onDragStart={draggable ? (e) => onDragStart(e, event) : undefined}
          onDragEnd={draggable ? onDragEnd : undefined}
        >
          {body}
        </span>
      )}
      {canMove && (
        <button
          type="button"
          onClick={() => onMoveClick(event)}
          className="shrink-0 p-0.5 rounded text-fg-subtle hover:text-brand-fg hover:bg-surface-hover"
          aria-label={tf("calendar.moveAria", { type: typeLabel, title })}
          title={t("calendar.moveTitle")}
        >
          <CalendarClock className={compact ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </button>
      )}
    </div>
  );
}

function MoveDialog({ event, onCancel, onConfirm }) {
  const [date, setDate] = useState(event.date);
  const [saving, setSaving] = useState(false);
  const { t, tf, fmtDay } = useCourseText();
  const typeLabel = t(`calendar.types.${typeKey(event.type)}`);

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const submit = async (e) => {
    e.preventDefault();
    if (!date || date === event.date) { onCancel(); return; }
    setSaving(true);
    try { await onConfirm(event, date); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onCancel}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-event-title"
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-t-2xl sm:rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-3"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 id="move-event-title" className="text-ui font-bold text-fg">
            {tf("calendar.moveDialogTitle", { title: event.title, type: typeLabel })}
          </h3>
          <button type="button" onClick={onCancel} className="p-1 rounded-lg hover:bg-surface-hover text-fg-subtle" aria-label={t("common.close")}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-caption text-fg-subtle">{tf("calendar.currently", { date: fmtDay(event.date) })}</p>
        <div>
          <Label htmlFor="move-event-date">{t("calendar.newDate")}</Label>
          <TextInput
            id="move-event-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={saving || !date}
            className="flex-1 text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 disabled:opacity-50 rounded-lg py-2.5 transition-colors"
          >
            {saving ? t("calendar.moving") : t("calendar.move")}
          </button>
          <button type="button" onClick={onCancel} className="text-caption font-medium text-fg-subtle hover:text-fg-muted px-3 py-2.5">
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CalendarView({ events, today, loading, onEventMove, onRangeChange, title, extraActions }) {
  const effectiveToday = today || todayIn();
  const { t, tf, fmtDay } = useCourseText();
  const formatDate = fmtDay;
  // Short weekday names, Monday first (2024-01-01 was a Monday).
  const WEEKDAY_NAMES = Array.from({ length: 7 }, (_, i) => fmtDay(addDays("2024-01-01", i), { weekday: "short" }));
  const [view, setView] = useState(null); // decided on mount (avoids a hydration mismatch)
  const [month, setMonth] = useState(() => monthStart(effectiveToday));
  const [agendaFrom, setAgendaFrom] = useState(() => addDays(effectiveToday, -AGENDA_BACK));
  const [agendaTo, setAgendaTo] = useState(() => addDays(effectiveToday, AGENDA_AHEAD));
  const [showEarlier, setShowEarlier] = useState(false);
  const [expandedDay, setExpandedDay] = useState(null);
  const [moving, setMoving] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const [dropDate, setDropDate] = useState(null);

  useEffect(() => {
    setView(window.innerWidth < 768 ? "agenda" : "month");
  }, []);

  const list = useMemo(() => (Array.isArray(events) ? [...events].sort(sortEvents) : []), [events]);
  const byKey = useMemo(() => new Map(list.map((e) => [eventKey(e), e])), [list]);
  const byDate = useMemo(() => {
    const map = new Map();
    for (const e of list) {
      if (!e.date) continue;
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date).push(e);
    }
    return map;
  }, [list]);
  const multiCourse = useMemo(() => new Set(list.map((e) => e.courseId)).size > 1, [list]);
  const canMove = (e) => Boolean(onEventMove && e.canReschedule && e.type !== "module");

  const grid = useMemo(() => monthGrid(month), [month]);
  const range = view === "month" ? { from: grid.start, to: grid.end } : view === "agenda" ? { from: agendaFrom, to: agendaTo } : null;

  // Tell the parent which dates are visible so it can (re)fetch.
  const rangeCb = useRef(onRangeChange);
  rangeCb.current = onRangeChange;
  useEffect(() => {
    if (range && rangeCb.current) rangeCb.current({ from: range.from, to: range.to });
  }, [range?.from, range?.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const goToday = () => { setMonth(monthStart(effectiveToday)); setExpandedDay(null); };

  // ---- Drag and drop (Month view) ----
  const handleDragStart = (e, event) => {
    setDragKey(eventKey(event));
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", eventKey(event));
  };
  const handleDragEnd = () => { setDragKey(null); setDropDate(null); };
  const handleDrop = async (e, date) => {
    e.preventDefault();
    const key = e.dataTransfer.getData("text/plain") || dragKey;
    setDragKey(null);
    setDropDate(null);
    const event = byKey.get(key);
    if (!event || !canMove(event) || event.date === date) return;
    await onEventMove(event, date);
  };

  const confirmMove = async (event, date) => {
    await onEventMove(event, date);
    setMoving(null);
  };

  // ---- Agenda data ----
  const agendaGroups = useMemo(() => {
    const groups = [];
    for (const [date, evs] of byDate) {
      if (compareDates(date, agendaFrom) < 0 || compareDates(date, agendaTo) > 0) continue;
      if (!showEarlier && compareDates(date, effectiveToday) < 0) continue;
      groups.push({ date, events: evs });
    }
    return groups.sort((a, b) => compareDates(a.date, b.date));
  }, [byDate, agendaFrom, agendaTo, showEarlier, effectiveToday]);
  const earlierCount = useMemo(
    () => list.filter((e) => compareDates(e.date, effectiveToday) < 0 && compareDates(e.date, agendaFrom) >= 0).length,
    [list, effectiveToday, agendaFrom]
  );

  const relativeLabel = (date) => {
    const d = diffDays(effectiveToday, date);
    if (d === 0) return t("calendar.today");
    if (d === 1) return t("calendar.tomorrow");
    if (d === -1) return t("calendar.yesterday");
    return null;
  };

  const monthLabel = formatDate(month, { month: "long", year: "numeric" });

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {title && <h1 className="text-section font-bold text-fg truncate">{title}</h1>}
          {loading && (
            // A small "refreshing" mark beside the title (the calendar itself stays on screen).
            <Loader size={20} label={t("common.loading")} />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {extraActions}
          <div className="inline-flex rounded-lg border border-line p-0.5 bg-surface-sunken" role="group" aria-label={t("calendar.view")}>
            {[
              { id: "agenda", label: t("calendar.agenda"), Icon: List },
              { id: "month", label: t("calendar.month"), Icon: CalendarDays },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={view === id}
                className={`flex items-center gap-1 text-caption font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                  view === id ? "bg-brand-strong text-on-brand-strong" : "text-fg-muted hover:text-fg"
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-fg-subtle" aria-label={t("calendar.legend")}>
        {Object.entries(EVENT_TYPES).map(([type, meta]) => (
          <li key={type} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${meta.dot}`} aria-hidden="true" />
            <meta.Icon className="w-3 h-3" aria-hidden="true" /> {t(`calendar.types.${type}`)}
          </li>
        ))}
        {onEventMove && (
          <li className="text-fg-subtle">{t("calendar.dragHelpBefore")} <CalendarClock className="inline w-3 h-3" aria-label={t("calendar.moveButton")} /> {t("calendar.dragHelpAfter")}</li>
        )}
      </ul>

      {view === null && <Loader variant="page" size={56} className="min-h-[16rem]" />}

      {/* ===== Month view ===== */}
      {view === "month" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setMonth((m) => shiftMonth(m, -1)); setExpandedDay(null); }} className="p-1.5 rounded-lg border border-line hover:bg-surface-hover text-fg-muted" aria-label={t("calendar.prevMonth")}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => { setMonth((m) => shiftMonth(m, 1)); setExpandedDay(null); }} className="p-1.5 rounded-lg border border-line hover:bg-surface-hover text-fg-muted" aria-label={t("calendar.nextMonth")}>
              <ChevronRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={goToday} className="text-caption font-semibold px-2.5 py-1.5 rounded-lg border border-line hover:bg-surface-hover text-fg-muted">
              {t("calendar.today")}
            </button>
            <h2 className="text-ui font-bold text-fg ml-1" aria-live="polite">{monthLabel}</h2>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[36rem] rounded-xl border border-line overflow-hidden">
              <div className="grid grid-cols-7 bg-surface-sunken border-b border-line">
                {WEEKDAY_NAMES.map((name) => (
                  <div key={name} className="px-1.5 py-1.5 text-caption font-bold text-fg-subtle text-center">{name}</div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {grid.days.map((date) => {
                  const inMonth = date.slice(0, 7) === month.slice(0, 7);
                  const isToday = date === effectiveToday;
                  const dayEvents = byDate.get(date) || [];
                  const expanded = expandedDay === date;
                  const shown = expanded ? dayEvents : dayEvents.slice(0, MAX_CHIPS);
                  const hidden = dayEvents.length - shown.length;
                  const isDrop = dropDate === date;
                  return (
                    <div
                      key={date}
                      onDragOver={dragKey ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (dropDate !== date) setDropDate(date); } : undefined}
                      onDragLeave={dragKey ? () => { if (dropDate === date) setDropDate(null); } : undefined}
                      onDrop={dragKey ? (e) => handleDrop(e, date) : undefined}
                      className={`min-h-[6rem] border-b border-r border-line p-1 space-y-0.5 ${
                        inMonth ? "bg-surface" : "bg-surface-sunken/70"
                      } ${isDrop ? "ring-2 ring-inset ring-brand bg-brand-soft" : ""}`}
                      aria-label={formatDate(date, { weekday: "long", day: "numeric", month: "long" })}
                    >
                      <div className="flex justify-end">
                        <span className={`text-caption font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday ? "bg-brand text-on-brand" : inMonth ? "text-fg-muted" : "text-fg-subtle"
                        }`}>
                          {Number(date.slice(8))}
                        </span>
                      </div>
                      {shown.map((e) => (
                        <EventChip
                          key={eventKey(e)}
                          event={e}
                          compact
                          showCourse={multiCourse}
                          canMove={canMove(e)}
                          onMoveClick={setMoving}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                        />
                      ))}
                      {hidden > 0 && (
                        <button type="button" onClick={() => setExpandedDay(date)} className="text-caption font-semibold text-brand-fg hover:underline px-1">
                          {tf("calendar.more", { n: hidden })}
                        </button>
                      )}
                      {expanded && dayEvents.length > MAX_CHIPS && (
                        <button type="button" onClick={() => setExpandedDay(null)} className="text-caption font-semibold text-fg-subtle hover:underline px-1">
                          {t("calendar.showLess")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {!loading && list.length === 0 && (
            <p className="text-caption text-fg-subtle">{t("calendar.nothingMonth")}</p>
          )}
        </div>
      )}

      {/* ===== Agenda view ===== */}
      {view === "agenda" && (
        <div className="space-y-3">
          {!showEarlier && earlierCount > 0 && (
            <button type="button" onClick={() => setShowEarlier(true)} className="text-caption font-semibold text-brand-fg hover:underline">
              {tf("calendar.showEarlier", { n: earlierCount })}
            </button>
          )}
          {showEarlier && (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setAgendaFrom((d) => addDays(d, -90))} className="text-caption font-semibold text-brand-fg hover:underline">
                {t("calendar.loadEarlier")}
              </button>
              <button type="button" onClick={() => setShowEarlier(false)} className="text-caption font-semibold text-fg-subtle hover:underline">
                {t("calendar.hidePast")}
              </button>
            </div>
          )}

          {agendaGroups.length === 0 && loading && <Loader variant="page" size={56} className="min-h-[30vh]" />}

          {agendaGroups.length === 0 && !loading && (
            <p className="text-ui text-fg-subtle py-6 text-center">{showEarlier ? t("calendar.nothingPeriod") : t("calendar.nothingAhead")}</p>
          )}

          {/* One list: a row per day (date heading + that day's events). Not a box per day. */}
          {agendaGroups.length > 0 && (
          <ol className="divide-y divide-line rounded-xl border border-line">
            {agendaGroups.map(({ date, events: dayEvents }) => {
              const rel = relativeLabel(date);
              const past = compareDates(date, effectiveToday) < 0;
              return (
                <li key={date} className={`px-3 py-2.5 sm:flex sm:items-start sm:gap-4 ${date === effectiveToday ? "bg-brand-soft/40" : ""} ${past ? "opacity-75" : ""}`}>
                  <h3 className="flex items-center gap-2 sm:w-52 sm:shrink-0 sm:pt-1 text-caption font-bold text-fg-muted">
                    {formatDate(date, { weekday: "long", day: "numeric", month: "long" })}
                    {rel && (
                      <span className={`text-caption font-bold px-1.5 py-0.5 rounded ${date === effectiveToday ? "bg-brand text-on-brand" : "bg-line text-fg-muted"}`}>{rel}</span>
                    )}
                  </h3>
                  <ul className="mt-1.5 sm:mt-0 flex-1 min-w-0 space-y-1.5">
                    {dayEvents.map((e) => (
                      <li key={eventKey(e)}>
                        <EventChip
                          event={e}
                          showCourse={multiCourse}
                          canMove={canMove(e)}
                          onMoveClick={setMoving}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
          )}

          <button type="button" onClick={() => setAgendaTo((d) => addDays(d, AGENDA_AHEAD))} className="text-caption font-semibold text-brand-fg hover:underline">
            {t("calendar.showLater")}
          </button>
        </div>
      )}

      {moving && <MoveDialog event={moving} onCancel={() => setMoving(null)} onConfirm={confirmMove} />}
    </div>
  );
}
