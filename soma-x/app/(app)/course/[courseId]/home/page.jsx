"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown, ChevronRight, Clock, AlertTriangle, Target, CheckCircle2, Play, Calendar, TrendingUp,
} from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { apiUrl } from "@/lib/api";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, ListRow } from "@/components/layout";
import MasterySummary from "@/components/course/outcomes/MasterySummary";
import SetupChecklist, { setupNeedsAttention } from "@/components/teacher/SetupChecklist";
import { useCourseText } from "@/components/course/useCourseText";
import { formatRange } from "@/lib/dates";
import Loader from "@/components/ui/Loader";

export default function CourseHomePage() {
  const { courseId, course, isTeacher, refresh } = useCourse();
  const { t, tf, tOr, weekLabel, lifecycleLabel, fmtDay } = useCourseText();
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
  // This week starts open, once the week is known.
  const [openedCurrent, setOpenedCurrent] = useState(false);
  useEffect(() => {
    if (!homeLoop || openedCurrent) return;
    setOpenedCurrent(true);
    setExpandedWeek(homeLoop.currentModuleId ?? null);
  }, [homeLoop, openedCurrent]);

  const showSetupCard = isTeacher && setupNeedsAttention(setupStatus);

  const beatInfo = homeLoop || {};
  const currentBeat = beatInfo.currentBeat || "prepare";
  const needsAttention = beatInfo.needsAttention || [];
  const timeline = beatInfo.timeline || [];
  const outcomesList = outcomePulse?.outcomes || [];

  const BEAT_COLORS = {
    prepare: "bg-warning text-on-warning",
    release: "bg-success text-on-success",
    collect: "bg-info text-on-info",
    grade: "bg-brand-strong text-on-brand-strong",
    review: "bg-brand-strong text-on-brand-strong",
  };

  const weekText = beatInfo.currentWeekNumber === null || beatInfo.currentWeekNumber === undefined
    ? (beatInfo.startDate ? t("home.noModuleThisWeek") : t("home.noDatesYet"))
    : beatInfo.currentWeekNumber === 0 ? t("weeks.baseline") : tf("weeks.week", { n: beatInfo.currentWeekNumber });
  const beatName = ["prepare", "release", "collect", "grade", "review"].includes(currentBeat) ? t(`home.beats.${currentBeat}`) : currentBeat;

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
          meta={
            <span className="text-caption font-bold text-on-brand bg-brand px-2.5 py-0.5 rounded-full">
              {lifecycleLabel(course)}
            </span>
          }
          actions={
            <Link
              href={`/course/${courseId}/${isTeacher ? "insights" : "progress"}`}
              className="inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg border border-brand/40 hover:bg-brand-soft rounded-lg px-3 py-1.5"
            >
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" /> {isTeacher ? t("nav.insights") : t("nav.progress")}
            </Link>
          }
        />

        {showSetupCard && (
          <SetupChecklist
            courseId={courseId}
            status={setupStatus}
            onChanged={refresh}
          />
        )}

        {/* 1. NOW: a flat header band, not a card */}
        <section aria-labelledby="now-title" className="border-l-4 border-brand pl-4 py-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {/* The weekly beat (prepare, release, collect...) is the teacher's routine. */}
            {isTeacher && (
              <span className={`text-caption font-bold px-3 py-1 rounded-full ${BEAT_COLORS[currentBeat] || BEAT_COLORS.prepare}`}>
                {tf("home.nowBeat", { beat: beatName })}
              </span>
            )}
            <span className="text-caption font-semibold text-fg-subtle flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-fg-subtle" />
              {weekText}
            </span>
            {isTeacher && course?.lifecycle === "open" && beatInfo.startDate && (
              <span className="text-caption font-semibold text-brand-fg">· {t("home.weeklyLoopActive")}</span>
            )}
          </div>

          <div>
            <h2 id="now-title" className="text-section font-bold text-fg">{loopText("loopTitles", beatInfo.beatKey, beatInfo.beatParams, beatInfo.beatTitle) || t("home.currentBeat")}</h2>
            {isTeacher && (
              <p className="text-ui text-fg-subtle mt-1 max-w-2xl">
                {["prepare", "release", "collect", "grade", "review"].includes(currentBeat) ? t(`home.beatHelp.${currentBeat}`) : null}
              </p>
            )}
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

        {/* 2. NEEDS ATTENTION (teachers: setup and grading to do) */}
        {isTeacher && (
        <Section
          title={<span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-warning-fg" /> {t("home.needsAttention")}</span>}
        >
          {needsAttention.length === 0 ? (
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
            </List>
          )}
        </Section>
        )}

        {/* 3. OUTCOME PULSE (small tiles are allowed here) */}
        <Section
          title={<span className="flex items-center gap-2"><Target className="w-4 h-4 text-brand-fg" /> {isTeacher ? t("home.outcomePulse") : t("home.outcomePulseMine")}</span>}
          actions={
            <Link href={`/course/${courseId}/outcomes`} className="text-caption font-semibold text-brand-fg hover:underline">
              {t("common.viewAll")} &rarr;
            </Link>
          }
        >
          {outcomesList.length === 0 ? (
            <p className="text-caption text-fg-subtle">{t("home.noOutcomeData")}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {outcomesList.slice(0, 3).map((o) => (
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
        </Section>

        {/* 4. TIMELINE (one row per module) */}
        <Section
          title={<span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-brand-fg" /> {t("home.timeline")}</span>}
          description={t("home.timelineHelp")}
        >
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
                        <span className="block font-semibold text-fg truncate">{m.title}</span>
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
        </Section>
      </div>
    </div>
  );
}
