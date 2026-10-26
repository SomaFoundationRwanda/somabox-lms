"use client"
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import Link from "next/link"
import { ChevronRight, ClipboardList, FileText, Folder, HelpCircle, MessageSquare } from "lucide-react"
import { useLanguage } from "@/context/LanguageContext"
import Loader from "@/components/ui/Loader"

const DAYS_AHEAD = 28
const ITEM_ICONS = { assignment: ClipboardList, quiz: HelpCircle, page: FileText, discussion: MessageSquare, file: Folder }
// Due dates stand out; things that just open are quieter.
const TYPE_STYLES = {
  due: "text-rose-700 bg-rose-50 border-rose-200",
  close: "text-amber-800 bg-amber-50 border-amber-200",
  release: "text-teal-800 bg-teal-50 border-teal-200",
}

// 'YYYY-MM-DD' arithmetic without time zones getting in the way.
const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * A learner's next four weeks across all their courses, one group per day: what's due, what
 * closes and what opens (GET /calendar/me). The dashboard's alternative to the course cards.
 */
export default function UpcomingByDate() {
  const { t, lang } = useLanguage()
  // days=N: the server counts from the school's today (not this device's clock). Kept with the
  // learner's other calendar data; a course change (live updates) marks it out of date.
  const upcoming = useQuery({ queryKey: [...queryKeys.myCalendar, "upcoming", DAYS_AHEAD], queryFn: () => apiFetch(`/calendar/me?days=${DAYS_AHEAD}`) })
  const state = {
    loading: upcoming.isPending,
    error: upcoming.isError,
    today: upcoming.data?.today ?? null,
    events: Array.isArray(upcoming.data?.events) ? upcoming.data.events : [],
  }

  if (state.loading) return <Loader variant="page" size={48} className="min-h-[20vh]" />
  if (state.error) return <p role="alert" className="text-xs text-rose-600">{t("learner.dashboard.upcoming.loadFailed")}</p>

  const dayLabel = (day) => {
    if (day === state.today) return t("course.calendar.today")
    if (day === addDays(state.today, 1)) return t("course.calendar.tomorrow")
    try {
      return new Date(`${day}T00:00:00`).toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" })
    } catch {
      return day
    }
  }

  const days = []
  for (const e of state.events) {
    const last = days[days.length - 1]
    if (last && last.day === e.date) last.events.push(e)
    else days.push({ day: e.date, events: [e] })
  }

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-slate-500">{t("learner.dashboard.upcoming.hint")}</p>
      {days.length === 0 ? (
        <p className="text-xs text-slate-500 py-4 text-center">{t("learner.dashboard.upcoming.empty")}</p>
      ) : (
        days.map(({ day, events }) => (
          <section key={day} aria-labelledby={`day-${day}`}>
            <h3 id={`day-${day}`} className={`text-[11px] font-bold uppercase tracking-wide mb-1.5 ${day === state.today ? "text-[var(--brand-primary)]" : "text-slate-500"}`}>
              {dayLabel(day)}
            </h3>
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-[5px]">
              {events.map((e) => {
                const Icon = ITEM_ICONS[e.itemType] || FileText
                return (
                  <li key={e.id}>
                    <Link href={e.url} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition-colors">
                      <Icon className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-semibold text-slate-900 truncate">{e.itemTitle || e.title}</span>
                        <span className="block text-[11px] text-slate-500 truncate">
                          {t(`course.items.${e.itemType}`) || ""}{e.courseTitle ? ` · ${e.courseTitle}` : ""}
                        </span>
                      </span>
                      <span className={`text-[10px] font-bold uppercase border rounded-full px-2 py-0.5 shrink-0 ${TYPE_STYLES[e.type] || TYPE_STYLES.release}`}>
                        {t(`course.calendar.types.${e.type}`) || e.type}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
