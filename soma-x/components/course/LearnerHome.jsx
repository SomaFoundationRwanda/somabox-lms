"use client";

// The rest of a learner's course home, under "This week": the next few things to do, always in
// view, and four buttons that open the rest in a side panel (all their work, the weeks, their
// progress, announcements) so the page doesn't show everything at once. The open panel is in the
// address (?panel=weeks), so Back closes it and a link can open it.
import { Suspense, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, CheckCircle2, ListChecks, Megaphone, Pin, TrendingUp } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { useCourseText } from "@/components/course/useCourseText";
import { useProgressText } from "@/components/progress/text";
import { WorkRow, byDueDate } from "@/components/progress/MyProgress";
import { bandFor, fmtPct } from "@/components/insights/bits";
import { Section, List } from "@/components/layout";
import SidePanel from "@/components/ui/SidePanel";
import { formatRange } from "@/lib/dates";

const PANELS = ["work", "weeks", "progress", "news"];
const NEXT_UP = 3;
const NEW_DAYS = 7;

function PanelLink({ href, children }) {
  return <Link href={href} className="text-ui font-semibold text-brand-fg hover:underline">{children} &rarr;</Link>;
}

function Home({ timeline }) {
  const { courseId } = useCourse();
  const { t, weekLabel, ownWeekTitle, fmtDate } = useCourseText();
  const { tp } = useProgressText();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const panel = PANELS.includes(params.get("panel")) ? params.get("panel") : null;
  const openPanel = (key) => router.push(`${pathname}?panel=${key}`, { scroll: false });
  const closePanel = () => router.replace(pathname, { scroll: false });

  const progress = useCourseSection("my-progress").data;
  const announcements = useCourseSection("announcements").data;

  const work = Array.isArray(progress?.work) ? progress.work : [];
  const missing = work.filter((w) => w.state === "missing").sort(byDueDate);
  const toDo = work.filter((w) => w.state === "to_do").sort(byDueDate);
  const upcoming = work.filter((w) => w.state === "upcoming").sort(byDueDate);
  const nextUp = [...missing, ...toDo].slice(0, NEXT_UP);
  const outcomes = Array.isArray(progress?.outcomes) ? progress.outcomes : [];
  const news = useMemo(() => (Array.isArray(announcements) ? [...announcements] : [])
    .sort((a, b) => (Boolean(a.pinned) !== Boolean(b.pinned) ? (a.pinned ? -1 : 1) : new Date(b.created_at) - new Date(a.created_at))), [announcements]);
  // "New" means posted in the last week.
  const newSince = Date.now() - NEW_DAYS * 86_400_000;
  const newCount = news.filter((a) => new Date(a.created_at).getTime() >= newSince).length;

  const buttons = [
    { key: "work", icon: ListChecks, label: t("learnerHome.work"), count: missing.length + toDo.length, urgent: missing.length > 0 },
    { key: "weeks", icon: Calendar, label: t("learnerHome.weeks") },
    { key: "progress", icon: TrendingUp, label: t("nav.progress") },
    { key: "news", icon: Megaphone, label: t("nav.announcements"), count: newCount },
  ];

  const titles = { work: t("learnerHome.work"), weeks: t("learnerHome.weeks"), progress: t("nav.progress"), news: t("nav.announcements") };
  const footers = {
    work: <PanelLink href={`/course/${courseId}/grades`}>{t("learnerHome.openGrades")}</PanelLink>,
    weeks: <PanelLink href={`/course/${courseId}/modules`}>{t("learnerHome.openWeeks")}</PanelLink>,
    progress: <PanelLink href={`/course/${courseId}/progress`}>{t("learnerHome.openProgress")}</PanelLink>,
    news: <PanelLink href={`/course/${courseId}/announcements`}>{t("learnerHome.openAnnouncements")}</PanelLink>,
  };

  return (
    <>
      {/* Always in view: what to do next, overdue work first. */}
      <Section title={t("learnerHome.nextUp")}>
        {!progress ? null : nextUp.length === 0 ? (
          <p className="flex items-center gap-2 text-ui text-success-fg"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {t("learnerHome.allDone")}</p>
        ) : (
          <List label={t("learnerHome.nextUp")}>{nextUp.map((w) => <WorkRow key={w.moduleItemId} courseId={courseId} w={w} />)}</List>
        )}
      </Section>

      {/* The rest, one tap away. */}
      <nav aria-label={t("learnerHome.more")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {buttons.map(({ key, icon: Icon, label, count, urgent }) => (
          <button
            key={key}
            type="button"
            onClick={() => openPanel(key)}
            aria-haspopup="dialog"
            aria-expanded={panel === key}
            className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-3 text-left text-ui font-semibold text-fg hover:bg-surface-hover"
          >
            <Icon className="h-4 w-4 shrink-0 text-brand-fg" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {count ? (
              // The count is part of the button's name ("All your work 3").
              <span className={`shrink-0 rounded-full px-1.5 text-caption font-bold ${urgent ? "bg-warning-soft text-warning-fg" : "bg-brand-soft text-brand-fg"}`}>{count}</span>
            ) : null}
          </button>
        ))}
      </nav>

      <SidePanel open={Boolean(panel)} onClose={closePanel} title={panel ? titles[panel] : ""} footer={panel ? footers[panel] : null}>
        {panel === "work" ? (
          <div className="space-y-5">
            {missing.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-ui font-bold text-warning-fg">{tp("myProgress.stillToHandIn")}</h3>
                <List label={tp("myProgress.stillToHandIn")}>{missing.map((w) => <WorkRow key={w.moduleItemId} courseId={courseId} w={w} />)}</List>
              </section>
            ) : null}
            <section className="space-y-2">
              <h3 className="text-ui font-bold text-fg">{tp("myProgress.toDo")}</h3>
              {toDo.length === 0 ? <p className="text-ui text-fg-subtle">{tp("myProgress.nothingToDo")}</p> : (
                <List label={tp("myProgress.toDo")}>{toDo.map((w) => <WorkRow key={w.moduleItemId} courseId={courseId} w={w} />)}</List>
              )}
            </section>
            {upcoming.length > 0 ? (
              <section className="space-y-2">
                <h3 className="text-ui font-bold text-fg">{t("learnerHome.comingUp")}</h3>
                <List label={t("learnerHome.comingUp")}>{upcoming.map((w) => <WorkRow key={w.moduleItemId} courseId={courseId} w={w} />)}</List>
              </section>
            ) : null}
          </div>
        ) : null}

        {panel === "weeks" ? (
          timeline.length === 0 ? <p className="text-ui text-fg-subtle">{t("home.noTimeline")}</p> : (
            <List label={t("learnerHome.weeks")}>
              {timeline.map((m) => (
                <li key={m.id} className={m.isCurrent ? "bg-brand-soft/40" : ""}>
                  <Link href={`/course/${courseId}/modules#module-${m.id}`} className="flex items-center gap-3 px-3 py-2.5 text-ui hover:bg-surface-hover">
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-caption font-bold ${m.isCurrent ? "bg-brand text-on-brand" : "bg-surface-sunken text-fg-muted"}`}>{weekLabel(m)}</span>
                    <span className="min-w-0 flex-1">
                      {ownWeekTitle(m) ? <span className="block truncate font-semibold text-fg">{ownWeekTitle(m)}</span> : null}
                      <span className="block text-caption text-fg-subtle">{m.resolvedStartDate ? formatRange(m.resolvedStartDate, m.resolvedEndDate) : t("home.noDatesYet")}</span>
                    </span>
                    {m.isCurrent ? <span className="shrink-0 text-caption font-bold text-brand-fg">{t("home.current")}</span> : null}
                  </Link>
                </li>
              ))}
            </List>
          )
        ) : null}

        {panel === "progress" ? (
          <div className="space-y-4">
            <p className="text-ui text-fg-muted">
              {progress?.overall == null ? tp("myProgress.noneMarked") : tp("myProgress.atNow", { now: fmtPct(progress.overall) })}
            </p>
            {outcomes.length === 0 ? <p className="text-ui text-fg-subtle">{tp("common.noOutcomesYet")}</p> : (
              <List label={tp("myProgress.yourOutcomes")}>
                {outcomes.map((o) => {
                  const band = bandFor(o.current, progress?.thresholds);
                  return (
                    <li key={o.outcomeId ?? o.id} className="space-y-1.5 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2 text-ui">
                        <span className="min-w-0 font-semibold text-fg">{o.code ? <span className="mr-1 text-caption font-bold text-brand-fg">{o.code}</span> : null}{o.title || tp("common.outcome")}</span>
                        <span className="shrink-0 font-bold text-fg">{fmtPct(o.current)}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
                        <div className="h-full bg-brand" style={{ width: `${Math.max(0, Math.min(100, o.current ?? 0))}%` }} />
                      </div>
                      <span className={`inline-flex rounded-full border px-1.5 py-0.5 text-caption font-semibold ${band.chip}`}>{tp(`myProgress.status.${band.key}`)}</span>
                    </li>
                  );
                })}
              </List>
            )}
          </div>
        ) : null}

        {panel === "news" ? (
          news.length === 0 ? <p className="text-ui text-fg-subtle">{t("learnerHome.noNews")}</p> : (
            <List label={t("nav.announcements")}>
              {news.slice(0, 5).map((a) => (
                <li key={a.id} className="px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-ui font-semibold text-fg">
                      {a.pinned ? <Pin className="h-3.5 w-3.5 shrink-0 text-warning-fg" aria-label={t("announcements.pinned")} /> : null}
                      {a.title}
                    </span>
                    <span className="shrink-0 text-caption text-fg-subtle">{fmtDate(a.created_at)}</span>
                  </div>
                  {a.body ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-caption text-fg-muted">{a.body}</p> : null}
                </li>
              ))}
            </List>
          )
        ) : null}
      </SidePanel>
    </>
  );
}

export default function LearnerHome(props) {
  return (
    <Suspense fallback={null}>
      <Home {...props} />
    </Suspense>
  );
}
