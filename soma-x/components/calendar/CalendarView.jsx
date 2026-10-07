"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays, CalendarClock, ChevronLeft, ChevronRight, Clock, Layers, List, Lock, Unlock, X,
} from "lucide-react";
import { addDays, compareDates, diffDays, todayIn, weekday } from "@somabox/timeline";
import { formatDate } from "@/lib/dates";

// Visual language per event type.
export const EVENT_TYPES = {
  module: { label: "Module starts", Icon: Layers, chip: "bg-[#203A3A]/10 text-[#203A3A] border-[#203A3A]/20", dot: "bg-[#203A3A]" },
  release: { label: "Opens", Icon: Unlock, chip: "bg-sky-50 text-sky-800 border-sky-200", dot: "bg-sky-500" },
  due: { label: "Due", Icon: Clock, chip: "bg-amber-50 text-amber-800 border-amber-200", dot: "bg-amber-500" },
  close: { label: "Closes", Icon: Lock, chip: "bg-rose-50 text-rose-800 border-rose-200", dot: "bg-rose-500" },
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

// Short weekday names, Monday first (2024-01-01 was a Monday).
const WEEKDAY_NAMES = Array.from({ length: 7 }, (_, i) => formatDate(addDays("2024-01-01", i), { weekday: "short" }));

function EventChip({ event, showCourse, compact, canMove, onMoveClick, onDragStart, onDragEnd }) {
  const meta = EVENT_TYPES[event.type] || EVENT_TYPES.module;
  const Icon = meta.Icon;
  const draggable = Boolean(canMove && onDragStart);
  const label = `${meta.label}: ${event.title || "Untitled"}${showCourse && event.courseTitle ? ` (${event.courseTitle})` : ""}`;
  const body = (
    <>
      <Icon className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} shrink-0`} aria-hidden="true" />
      <span className="truncate">
        {!compact && <span className="font-bold">{meta.label}: </span>}
        {event.title || "Untitled"}
        {event.published === false && <span className="italic opacity-70"> (draft)</span>}
      </span>
      {showCourse && event.courseTitle && (
        <span className={`truncate opacity-70 ${compact ? "hidden sm:inline" : ""}`}>· {event.courseTitle}</span>
      )}
    </>
  );
  const chipCls = `flex items-center gap-1 min-w-0 flex-1 border rounded-md ${compact ? "px-1 py-0.5 text-[10px]" : "px-2 py-1 text-xs"} ${meta.chip} hover:brightness-95 focus-visible:outline-2 focus-visible:outline-[#0D9488]`;

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
          className="shrink-0 p-0.5 rounded text-slate-400 hover:text-[#203A3A] hover:bg-slate-100"
          aria-label={`Move ${meta.label.toLowerCase()} date of ${event.title || "item"}`}
          title="Move to another date"
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
  const meta = EVENT_TYPES[event.type] || EVENT_TYPES.module;

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
        className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-3"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 id="move-event-title" className="text-sm font-bold text-slate-900">
            Move &ldquo;{event.title}&rdquo; ({meta.label.toLowerCase()})
          </h3>
          <button type="button" onClick={onCancel} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-slate-500">Currently {formatDate(event.date)}.</p>
        <div>
          <label htmlFor="move-event-date" className="block text-xs font-semibold text-slate-600 mb-1.5">New date</label>
          <input
            id="move-event-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
            autoFocus
            required
          />
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={saving || !date}
            className="flex-1 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] disabled:opacity-50 rounded-lg py-2.5 transition-colors"
          >
            {saving ? "Moving..." : "Move"}
          </button>
          <button type="button" onClick={onCancel} className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-2.5">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export default function CalendarView({ events, today, loading, onEventMove, onRangeChange, title, extraActions }) {
  const effectiveToday = today || todayIn();
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
    if (d === 0) return "Today";
    if (d === 1) return "Tomorrow";
    if (d === -1) return "Yesterday";
    return null;
  };

  const monthLabel = formatDate(month, { month: "long", year: "numeric" });

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {title && <h1 className="text-lg font-bold text-slate-900 truncate">{title}</h1>}
          {loading && (
            <span className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-[#203A3A] animate-spin" role="status" aria-label="Loading" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {extraActions}
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50" role="group" aria-label="Calendar view">
            {[
              { id: "agenda", label: "Agenda", Icon: List },
              { id: "month", label: "Month", Icon: CalendarDays },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setView(id)}
                aria-pressed={view === id}
                className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-md transition-colors ${
                  view === id ? "bg-[#203A3A] text-white" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500" aria-label="Legend">
        {Object.entries(EVENT_TYPES).map(([type, meta]) => (
          <li key={type} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${meta.dot}`} aria-hidden="true" />
            <meta.Icon className="w-3 h-3" aria-hidden="true" /> {meta.label}
          </li>
        ))}
        {onEventMove && (
          <li className="text-slate-400">Drag a date in Month view, or use <CalendarClock className="inline w-3 h-3" aria-label="the move button" />, to reschedule.</li>
        )}
      </ul>

      {view === null && <div className="h-64 rounded-xl border border-slate-200 bg-slate-50 animate-pulse" />}

      {/* ===== Month view ===== */}
      {view === "month" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setMonth((m) => shiftMonth(m, -1)); setExpandedDay(null); }} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600" aria-label="Previous month">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => { setMonth((m) => shiftMonth(m, 1)); setExpandedDay(null); }} className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600" aria-label="Next month">
              <ChevronRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={goToday} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700">
              Today
            </button>
            <h2 className="text-sm font-bold text-slate-800 ml-1" aria-live="polite">{monthLabel}</h2>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[36rem] rounded-xl border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
                {WEEKDAY_NAMES.map((name) => (
                  <div key={name} className="px-1.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 text-center">{name}</div>
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
                      className={`min-h-[6rem] border-b border-r border-slate-100 p-1 space-y-0.5 ${
                        inMonth ? "bg-white" : "bg-slate-50/70"
                      } ${isDrop ? "ring-2 ring-inset ring-[#0D9488] bg-teal-50" : ""}`}
                      aria-label={formatDate(date, { weekday: "long", day: "numeric", month: "long" })}
                    >
                      <div className="flex justify-end">
                        <span className={`text-[11px] font-semibold w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday ? "bg-[#0D9488] text-white" : inMonth ? "text-slate-700" : "text-slate-400"
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
                        <button type="button" onClick={() => setExpandedDay(date)} className="text-[10px] font-semibold text-[#0D9488] hover:underline px-1">
                          +{hidden} more
                        </button>
                      )}
                      {expanded && dayEvents.length > MAX_CHIPS && (
                        <button type="button" onClick={() => setExpandedDay(null)} className="text-[10px] font-semibold text-slate-500 hover:underline px-1">
                          Show less
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          {!loading && list.length === 0 && (
            <p className="text-xs text-slate-500">Nothing scheduled this month.</p>
          )}
        </div>
      )}

      {/* ===== Agenda view ===== */}
      {view === "agenda" && (
        <div className="space-y-3">
          {!showEarlier && earlierCount > 0 && (
            <button type="button" onClick={() => setShowEarlier(true)} className="text-xs font-semibold text-[#0D9488] hover:underline">
              Show earlier ({earlierCount})
            </button>
          )}
          {showEarlier && (
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setAgendaFrom((d) => addDays(d, -90))} className="text-xs font-semibold text-[#0D9488] hover:underline">
                Load earlier dates
              </button>
              <button type="button" onClick={() => setShowEarlier(false)} className="text-xs font-semibold text-slate-500 hover:underline">
                Hide past dates
              </button>
            </div>
          )}

          {agendaGroups.length === 0 && !loading && (
            <p className="text-sm text-slate-500 py-6 text-center">Nothing scheduled{showEarlier ? " in this period" : " from today on"}.</p>
          )}

          <ol className="space-y-3">
            {agendaGroups.map(({ date, events: dayEvents }) => {
              const rel = relativeLabel(date);
              const past = compareDates(date, effectiveToday) < 0;
              return (
                <li key={date} className={`rounded-xl border overflow-hidden ${date === effectiveToday ? "border-[#0D9488]/40" : "border-slate-200"} ${past ? "opacity-75" : ""}`}>
                  <h3 className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-700">
                    {formatDate(date, { weekday: "long", day: "numeric", month: "long" })}
                    {rel && (
                      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${rel === "Today" ? "bg-[#0D9488] text-white" : "bg-slate-200 text-slate-600"}`}>{rel}</span>
                    )}
                  </h3>
                  <ul className="p-2 space-y-1.5">
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

          <button type="button" onClick={() => setAgendaTo((d) => addDays(d, AGENDA_AHEAD))} className="text-xs font-semibold text-[#0D9488] hover:underline">
            Show later dates
          </button>
        </div>
      )}

      {moving && <MoveDialog event={moving} onCancel={() => setMoving(null)} onConfirm={confirmMove} />}
    </div>
  );
}
