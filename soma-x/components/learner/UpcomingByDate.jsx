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
  due: "text-danger-fg bg-danger-soft border-danger/30",
  close: "text-warning-fg bg-warning-soft border-warning/30",
  release: "text-brand-fg bg-brand-soft border-brand/40",
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
  if (state.error) return <p role="alert" className="text-caption text-danger-fg">{t("learner.dashboard.upcoming.loadFailed")}</p>

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
      <p className="text-caption text-fg-subtle">{t("learner.dashboard.upcoming.hint")}</p>
      {days.length === 0 ? (
        <p className="text-caption text-fg-subtle py-4 text-center">{t("learner.dashboard.upcoming.empty")}</p>
      ) : (
        days.map(({ day, events }) => (
          <section key={day} aria-labelledby={`day-${day}`}>
            <h3 id={`day-${day}`} className={`text-caption font-bold mb-1.5 ${day === state.today ? "text-brand-fg" : "text-fg-subtle"}`}>
              {dayLabel(day)}
            </h3>
            <ul className="divide-y divide-line border border-line rounded-[5px]">
              {events.map((e) => {
                const Icon = ITEM_ICONS[e.itemType] || FileText
                return (
                  <li key={e.id}>
                    <Link href={e.url} className="flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover transition-colors">
                      <Icon className="w-4 h-4 text-fg-subtle shrink-0" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-caption font-semibold text-fg truncate">{e.itemTitle || e.title}</span>
                        <span className="block text-caption text-fg-subtle truncate">
                          {t(`course.items.${e.itemType}`) || ""}{e.courseTitle ? ` · ${e.courseTitle}` : ""}
                        </span>
                      </span>
                      <span className={`text-caption font-bold border rounded-full px-2 py-0.5 shrink-0 ${TYPE_STYLES[e.type] || TYPE_STYLES.release}`}>
                        {t(`course.calendar.types.${e.type}`) || e.type}
                      </span>
                      <ChevronRight className="w-4 h-4 text-fg-subtle shrink-0" aria-hidden="true" />
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
