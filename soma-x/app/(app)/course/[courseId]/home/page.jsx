"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown, ChevronRight, Clock, AlertTriangle, Target, CheckCircle2, Play, Calendar, TrendingUp, ListChecks, Gauge,
} from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { apiUrl } from "@/lib/api";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, ListRow } from "@/components/layout";
import MasterySummary from "@/components/course/outcomes/MasterySummary";
import useSetupText from "@/lib/useSetupText";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/context/ToastContext";
import { useCourseText } from "@/components/course/useCourseText";
import { formatRange } from "@/lib/dates";
import Loader from "@/components/ui/Loader";
import LearnerHome from "@/components/course/LearnerHome";
import SidePanel from "@/components/ui/SidePanel";
import JoinCodePanel from "@/components/teacher/JoinCodePanel";
import JoinRequests from "@/components/teacher/JoinRequests";

export default function CourseHomePage() {
  const { courseId, course, isTeacher, isCourseTeacher, isLearner, adminView, refresh } = useCourse();
  const { blockingText, warningText, warningHelp, blockingHelp, actionLabel } = useSetupText();
  const { showToast } = useToast();
  const { t, tf, tOr, weekLabel, ownWeekTitle, lifecycleLabel, fmtDay } = useCourseText();
  // Server text for the weekly loop comes with a key + params; show it in the UI language,
  // falling back to the server's English when a key is unknown.
  const loopText = (group, key, params, fallback) => {
    const template = key ? tOr(`home.${group}.${key}`, null) : null;
    if (!template) return fallback;
    const vars = { ...(params || {}) };
    if (vars.week) vars.week = weekLabel(vars.week);
    if (vars.date) vars.date = fmtDay(vars.date);
    return tf(`home.${group}.${key}`, vars);
  };
  // Kept like the rest of the course (the Settings page shares the setup status).
  const statusQuery = useCourseSection("setup-status");
  const loopQuery = useCourseSection("home-loop");
  const pulseQuery = useCourseSection("outcome-mastery");
  const setupStatus = statusQuery.data;
  const homeLoop = loopQuery.data;
  const outcomePulse = pulseQuery.data;
  const loading = statusQuery.loading || loopQuery.loading || pulseQuery.loading;
  const [expandedWeek, setExpandedWeek] = useState(null);
  // Teachers: the weeks and the outcome pulse open in a side panel, so the home shows only what
  // needs them now. null | "weeks" | "outcomes".
  const [panel, setPanel] = useState(null);
  // This week starts open, once the week is known.
  const [openedCurrent, setOpenedCurrent] = useState(false);
  useEffect(() => {
    if (!homeLoop || openedCurrent) return;
    setOpenedCurrent(true);
    setExpandedWeek(homeLoop.currentModuleId ?? null);
  }, [homeLoop, openedCurrent]);

  const isDraft = course?.lifecycle === "draft";
  // Setup warnings join the attention list once the course is published (the baseline has its
  // own optional card below).
  const setupWarnings = !isDraft && Array.isArray(setupStatus?.warnings) ? setupStatus.warnings.filter((w) => w.id !== "baseline_pending") : [];
  // Measuring where learners start is optional: offered once, never required.
  const offerBaseline = isCourseTeacher && setupStatus?.baseline?.status === "pending" && (setupStatus?.counts?.outcomes || 0) > 0;
  const [skipping, setSkipping] = useState(false);
  const skipBaseline = async () => {
    setSkipping(true);
    try {
      await apiFetch(`/courses/${courseId}/baseline/skip`, { method: "POST", json: { reason: t("home.baselineCard.skipReason") } });
      refresh();
    } catch (err) {
      showToast(err?.body?.message || t("home.baselineCard.failed"), "error");
    } finally {
      setSkipping(false);
    }
  };

  const beatInfo = homeLoop || {};
  const needsAttention = beatInfo.needsAttention || [];
  const timeline = beatInfo.timeline || [];
  const outcomesList = outcomePulse?.outcomes || [];
  // Teachers: who asked to join with the code (approved here or on People).
  const peopleQuery = useCourseSection(isTeacher ? "people" : null);


  const weekText = beatInfo.currentWeekNumber === null || beatInfo.currentWeekNumber === undefined
    ? (beatInfo.startDate ? t("home.noModuleThisWeek") : t("home.noDatesYet"))
    : beatInfo.currentWeekNumber === 0 ? t("weeks.baseline") : tf("weeks.week", { n: beatInfo.currentWeekNumber });

  // First load: the SOMABOX loader until the course's week, attention list and outcomes arrive.
  if (loading && !homeLoop && !setupStatus && !outcomePulse) return <Loader variant="page" />;

  return (
    <div>
      <Breadcrumbs sectionKey="home" />

      {/* Course banner (image only; the title lives in the PageHeader below) */}
      {course?.coverImageUrl ? (
        <div className="w-full h-32 md:h-44 bg-surface-sunken relative">
          <img src={apiUrl(course.coverImageUrl)} alt="" className="w-full h-full object-cover" />
        </div>
      ) : null}

      <div className="p-4 md:p-6 space-y-8 max-w-5xl">
        <PageHeader help="pages.home"
          eyebrow={t("home.eyebrow")}
          title={course?.title || t("nav.course")}
          // Staff see the status in the bar above; others only when the course has ended.
          meta={!isTeacher && (course?.lifecycle === "closed" || course?.lifecycle === "archived") ? (
            <span className="text-caption font-bold text-fg-muted bg-surface-sunken px-2.5 py-0.5 rounded-full">
              {lifecycleLabel(course)}
            </span>
          ) : null}
          actions={
            // Staff and admins: the class Insights. Learners open their progress from the buttons
            // below; observers have neither.
            isTeacher || adminView ? (
              <Link
                href={`/course/${courseId}/insights`}
                className="inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg border border-brand/40 hover:bg-brand-soft rounded-lg px-3 py-1.5"
              >
                <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" /> {t("nav.insights")}
              </Link>
            ) : null
          }
        />

        {/* A draft: what's left before it can be published (the bar above has the button). */}
        {isTeacher && isDraft && setupStatus ? (
          <section aria-labelledby="getting-ready-title" className="rounded-xl border border-line p-4 space-y-3">
            <div>
              <h2 id="getting-ready-title" className="text-item font-bold text-fg flex items-center gap-2"><ListChecks className="w-4 h-4 text-brand-fg" aria-hidden="true" /> {t("home.ready.title")}</h2>
              <p className="text-ui text-fg-muted mt-1">{(setupStatus.blocking || []).length > 0 ? t("home.ready.todo") : t("home.ready.done")}</p>
              {isCourseTeacher ? (
                <Link href={`/course/${courseId}/setup`} className="mt-2 inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg hover:underline">
                  {t("setup.open")} &rarr;
                </Link>
              ) : null}
            </div>
            {(setupStatus.blocking || []).length > 0 ? (
              <List label={t("home.ready.title")}>
                {setupStatus.blocking.map((b) => (
                  <ListRow
                    key={b.id}
                    title={blockingText(b)}
                    subtitle={blockingHelp(b) || undefined}
                    actions={b.href ? <Link href={b.href} className="text-caption font-semibold text-brand-fg hover:underline">{actionLabel(b, t("status.fix"))} &rarr;</Link> : null}
                  />
                ))}
              </List>
            ) : null}
          </section>
        ) : null}

        {/* Optional: measure where learners start (Week 0). */}
        {offerBaseline ? (
          <section aria-labelledby="baseline-card-title" className="rounded-xl border border-line bg-surface-sunken p-4 space-y-2">
            <h2 id="baseline-card-title" className="text-ui font-bold text-fg flex items-center gap-2"><Gauge className="w-4 h-4 text-brand-fg" aria-hidden="true" /> {t("home.baselineCard.title")}</h2>
            <p className="text-ui text-fg-muted">{t("home.baselineCard.text")}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild size="sm"><Link href={`/course/${courseId}/settings#course-setup`}>{t("home.baselineCard.build")}</Link></Button>
              <Button type="button" size="sm" variant="ghost" onClick={skipBaseline} disabled={skipping}>{t("home.baselineCard.notNow")}</Button>
            </div>
          </section>
        ) : null}

        {/* 1. NOW: this week (a published course; a draft has nothing running yet). */}
        {!(isTeacher && isDraft) ? (
        <section aria-labelledby="now-title" className="border-l-4 border-brand pl-4 py-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-caption font-semibold text-fg-subtle flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-fg-subtle" />
              {weekText}
            </span>
          </div>

          <div>
            <h2 id="now-title" className="text-section font-bold text-fg">{loopText("loopTitles", beatInfo.beatKey, beatInfo.beatParams, beatInfo.beatTitle) || t("home.currentBeat")}</h2>
          </div>

          {beatInfo.primaryAction && (
            <Link
              href={beatInfo.primaryAction.href}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-strong hover:bg-brand-strong/90 text-on-brand-strong rounded-lg text-ui font-semibold transition-colors"
            >
              <Play className="w-4 h-4 fill-white" /> {loopText("loopActions", beatInfo.primaryAction.key, null, beatInfo.primaryAction.label)}
            </Link>
          )}
        </section>
        ) : null}

        {/* Teachers: join requests and the course's join code, where they open the course. */}
        {isTeacher ? <JoinRequests courseId={courseId} people={peopleQuery.data} onChanged={peopleQuery.refetch} /> : null}
        {isCourseTeacher ? <JoinCodePanel courseId={courseId} isDraft={isDraft} /> : null}

        {/* Learners: what to do next, and the rest behind buttons that open a side panel. */}
        {isLearner ? <LearnerHome timeline={timeline} /> : null}

        {/* 2. NEEDS ATTENTION (teachers: grading and setup to look at, once published) */}
        {isTeacher && !isDraft && (
        <Section
          title={<span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-warning-fg" /> {t("home.needsAttention")}</span>}
        >
          {needsAttention.length === 0 && setupWarnings.length === 0 ? (
            <p className="text-caption text-success-fg flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-success-fg shrink-0" /> {t("home.allTagged")}
            </p>
          ) : (
            <List label={t("home.needsAttention")}>
              {needsAttention.map((item) => (
                <ListRow
                  key={item.id}
                  tone="warning"
                  icon={<AlertTriangle className="w-4 h-4 text-warning-fg" />}
                  title={loopText("attention", item.key, item.params, item.title)}
                  actions={
                    <Link href={item.href} className="text-caption font-bold text-warning-fg hover:underline">
                      {loopText("loopActions", item.actionKey, null, item.actionLabel)} &rarr;
                    </Link>
                  }
                />
              ))}
              {setupWarnings.map((w) => (
                <ListRow
                  key={`setup-${w.id}`}
                  tone="warning"
                  icon={<AlertTriangle className="w-4 h-4 text-warning-fg" />}
                  title={warningText(w)}
                  subtitle={warningHelp(w) || undefined}
                  actions={w.href ? <Link href={w.href} className="text-caption font-bold text-warning-fg hover:underline">{actionLabel(w, t("status.fix"))} &rarr;</Link> : null}
                />
              ))}
            </List>
          )}
        </Section>
        )}

        {/* 3. The rest, one tap away: buttons that open the weeks or the outcome pulse in a panel. */}
        {!isLearner ? (
          <nav aria-label={t("home.more")} className="flex flex-wrap gap-2">
            {[
              { key: "weeks", icon: Calendar, label: t("home.timeline"), count: timeline.length },
              { key: "outcomes", icon: Target, label: t("home.outcomePulse"), count: outcomesList.length },
            ].map(({ key, icon: Icon, label, count }) => (
              <button
                key={key}
                type="button"
                onClick={() => setPanel(key)}
                aria-haspopup="dialog"
                className="inline-flex items-center gap-2 rounded-xl border border-line px-3.5 py-2.5 text-ui font-semibold text-fg-muted hover:border-brand/40 hover:bg-surface-hover"
              >
                <Icon className="w-4 h-4 text-brand-fg" aria-hidden="true" /> {label}
                <span className="text-caption font-bold text-fg-subtle bg-surface-sunken rounded-full px-2 py-0.5">{count}</span>
              </button>
            ))}
          </nav>
        ) : null}

        {/* The outcome pulse (small tiles are allowed here); learners have it in their Progress panel. */}
        {!isLearner ? (
        <SidePanel open={panel === "outcomes"} onClose={() => setPanel(null)} title={t("home.outcomePulse")}
          footer={<Link href={`/course/${courseId}/outcomes`} className="text-caption font-semibold text-brand-fg hover:underline">{t("common.viewAll")} &rarr;</Link>}>
          {outcomesList.length === 0 ? (
            <p className="text-caption text-fg-subtle">{t("home.noOutcomeData")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {outcomesList.map((o) => (
                <div key={o.id} className="rounded-xl border border-line p-3 space-y-2">
                  <p className="text-caption font-semibold text-fg truncate" title={o.title}>{o.title}</p>
                  <p className="text-section font-bold text-brand-fg leading-none">
                    {o.currentMastery !== null ? `${o.currentMastery}%` : <span className="text-caption font-semibold text-fg-subtle">{t("home.noDataYet")}</span>}
                  </p>
                  <div className="w-full h-2 bg-surface-sunken rounded-full overflow-hidden flex">
                    <div className="bg-line-strong h-full" style={{ width: `${o.baselineScore ?? 0}%` }} title={t("home.baseline")} />
                    <div className="bg-brand h-full" style={{ width: `${o.currentMastery === null ? 0 : Math.max(0, o.currentMastery - (o.baselineScore ?? 0))}%` }} title={t("home.progress")} />
                  </div>
                  <MasterySummary outcome={o} isTeacher={isTeacher} size="text-caption" />
                </div>
              ))}
            </div>
          )}
        </SidePanel>
        ) : null}

        {/* The weeks (one row per week); learners have them in their Weeks panel. */}
        {!isLearner ? (
        <SidePanel open={panel === "weeks"} onClose={() => setPanel(null)} title={t("home.timeline")}>
          {timeline.length === 0 ? (
            <p className="text-caption text-fg-subtle">{t("home.noTimeline")}</p>
          ) : (
            <List label={t("home.courseTimeline")}>
              {timeline.map((m) => {
                const isExpanded = expandedWeek === m.id;
                return (
                  <li key={m.id} className={m.isCurrent ? "bg-brand-soft/40" : ""}>
                    <button
                      type="button"
                      onClick={() => setExpandedWeek(isExpanded ? null : m.id)}
                      aria-expanded={isExpanded}
                      className="w-full px-3 py-2.5 flex items-center gap-3 text-left text-ui hover:bg-surface-hover transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-fg-subtle shrink-0" /> : <ChevronRight className="w-4 h-4 text-fg-subtle shrink-0" />}
                      <span className={`text-caption font-bold px-2 py-0.5 rounded-md shrink-0 ${m.isCurrent ? "bg-brand text-on-brand" : "bg-surface-sunken text-fg-muted"}`}>
                        {weekLabel(m)}
                      </span>
                      <span className="min-w-0 flex-1">
                        {ownWeekTitle(m) ? <span className="block font-semibold text-fg truncate">{ownWeekTitle(m)}</span> : null}
                        <span className="block text-caption text-fg-subtle mt-0.5">
                          {m.resolvedStartDate ? formatRange(m.resolvedStartDate, m.resolvedEndDate) : t("home.noDatesYet")}
                        </span>
                      </span>
                      {m.isCurrent && <span className="text-caption font-bold text-brand-fg bg-brand-soft px-2 py-0.5 rounded-full shrink-0">{t("home.current")}</span>}
                    </button>

                    {isExpanded && (
                      <div className="pl-10 pr-3 pb-3 space-y-2">
                        <p className="text-caption text-fg-muted">{m.description || t("home.defaultModuleDescription")}</p>
                        <Link
                          href={`/course/${courseId}/modules#module-${m.id}`}
                          className="inline-flex items-center gap-1.5 text-caption font-bold text-brand-fg hover:underline"
                        >
                          {t("home.openModuleItems")} &rarr;
                        </Link>
                      </div>
                    )}
                  </li>
                );
              })}
            </List>
          )}
        </SidePanel>
        ) : null}
      </div>
    </div>
  );
}
