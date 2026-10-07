"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown, ChevronRight, Clock, AlertTriangle, Target, CheckCircle2, Play, Calendar,
} from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, ListRow } from "@/components/layout";
import MasterySummary from "@/components/course/outcomes/MasterySummary";
import SetupChecklist, { setupNeedsAttention } from "@/components/teacher/SetupChecklist";
import { moduleWeekLabel, courseLifecycleLabel } from "@/lib/moduleLabels";
import { formatRange } from "@/lib/dates";

export default function CourseHomePage() {
  const { courseId, course, SERVER_URL, userEmail, isTeacher, refresh } = useCourse();
  const [setupStatus, setSetupStatus] = useState(null);
  const [homeLoop, setHomeLoop] = useState(null);
  const [outcomePulse, setOutcomePulse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedWeek, setExpandedWeek] = useState(null);

  const loadHomeData = async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      setLoading(true);
      const [statusRes, loopRes, outcomeRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}/setup-status`),
        fetch(`${SERVER_URL}/courses/${courseId}/home-loop`),
        fetch(`${SERVER_URL}/courses/${courseId}/outcome-mastery`),
      ]);

      if (statusRes.ok) setSetupStatus(await statusRes.json());
      if (loopRes.ok) {
        const loopData = await loopRes.json();
        setHomeLoop(loopData);
        setExpandedWeek(loopData.currentModuleId ?? null);
      }
      if (outcomeRes.ok) setOutcomePulse(await outcomeRes.json());
    } catch (err) {
      console.error("Home data load error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHomeData();
  }, [SERVER_URL, courseId, userEmail]);

  const showSetupCard = isTeacher && setupNeedsAttention(setupStatus);

  const beatInfo = homeLoop || {};
  const currentBeat = beatInfo.currentBeat || "prepare";
  const needsAttention = beatInfo.needsAttention || [];
  const timeline = beatInfo.timeline || [];
  const outcomesList = outcomePulse?.outcomes || [];

  const BEAT_COLORS = {
    prepare: "bg-amber-500 text-white",
    release: "bg-emerald-600 text-white",
    collect: "bg-blue-600 text-white",
    grade: "bg-[#203A3A] text-white",
    review: "bg-teal-700 text-white",
  };

  const weekText = beatInfo.currentWeekNumber === null || beatInfo.currentWeekNumber === undefined
    ? (beatInfo.startDate ? "No module this week" : "No dates yet")
    : beatInfo.currentWeekNumber === 0 ? "Week 0 · Baseline" : `Week ${beatInfo.currentWeekNumber}`;

  return (
    <div>
      <Breadcrumbs sectionKey="home" />

      {/* Course banner (image only; the title lives in the PageHeader below) */}
      {course?.coverImageUrl ? (
        <div className="w-full h-32 md:h-44 bg-slate-100 relative">
          <img src={`${SERVER_URL}${course.coverImageUrl}`} alt="" className="w-full h-full object-cover" />
        </div>
      ) : null}

      <div className="p-4 md:p-6 space-y-8 max-w-5xl">
        <PageHeader
          eyebrow="Course home"
          title={course?.title || "Course"}
          meta={
            <span className="text-[10px] font-bold uppercase tracking-wider text-white bg-[#0D9488] px-2.5 py-0.5 rounded-full">
              {courseLifecycleLabel(course)}
            </span>
          }
        />

        {showSetupCard && (
          <SetupChecklist
            courseId={courseId}
            SERVER_URL={SERVER_URL}
            status={setupStatus}
            onChanged={() => {
              refresh();
              loadHomeData();
            }}
          />
        )}

        {/* 1. NOW: a flat header band, not a card */}
        <section aria-labelledby="now-title" className="border-l-4 border-[#0D9488] pl-4 py-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${BEAT_COLORS[currentBeat] || BEAT_COLORS.prepare}`}>
              Now: {currentBeat.toUpperCase()} BEAT
            </span>
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              {weekText}
            </span>
            {isTeacher && (
              <span className="text-xs font-semibold text-[#0D9488]">· Weekly loop active</span>
            )}
          </div>

          <div>
            <h2 id="now-title" className="text-lg font-bold text-slate-900 dark:text-white">{beatInfo.beatTitle || "Current Course Beat"}</h2>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              {currentBeat === "prepare" && "Prepare phase: verify module items, outcome tags, and approve AI drafts before students start."}
              {currentBeat === "release" && "Release phase: module items are live and open for student access."}
              {currentBeat === "collect" && "Collect phase: monitor student progress, submissions, and discussion participation."}
              {currentBeat === "grade" && "Grade phase: score student submissions using outcome-linked rubrics with AI assistance."}
              {currentBeat === "review" && "Review phase: evaluate outcome mastery vs baseline and adjust next week."}
            </p>
          </div>

          {beatInfo.primaryAction && (
            <Link
              href={beatInfo.primaryAction.href}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#203A3A] hover:bg-[#182c2c] text-white rounded-lg text-sm font-semibold transition-colors"
            >
              <Play className="w-4 h-4 fill-white" /> {beatInfo.primaryAction.label}
            </Link>
          )}
        </section>

        {/* 2. NEEDS ATTENTION */}
        <Section
          title={<span className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> Needs attention</span>}
        >
          {needsAttention.length === 0 ? (
            <p className="text-xs text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> All module items are tagged with outcomes and up to date!
            </p>
          ) : (
            <List label="Needs attention">
              {needsAttention.map((item) => (
                <ListRow
                  key={item.id}
                  tone="warning"
                  icon={<AlertTriangle className="w-4 h-4 text-amber-500" />}
                  title={item.title}
                  actions={
                    <Link href={item.href} className="text-xs font-bold text-amber-700 hover:underline">
                      {item.actionLabel} &rarr;
                    </Link>
                  }
                />
              ))}
            </List>
          )}
        </Section>

        {/* 3. OUTCOME PULSE (small tiles are allowed here) */}
        <Section
          title={<span className="flex items-center gap-2"><Target className="w-4 h-4 text-[#0D9488]" /> Outcome pulse (vs baseline)</span>}
          actions={
            <Link href={`/course/${courseId}/outcomes`} className="text-xs font-semibold text-[#0D9488] hover:underline">
              View all &rarr;
            </Link>
          }
        >
          {outcomesList.length === 0 ? (
            <p className="text-xs text-slate-500">No outcome data logged yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {outcomesList.slice(0, 3).map((o) => (
                <div key={o.id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate" title={o.title}>{o.title}</p>
                  <p className="text-lg font-bold text-[#0D9488] leading-none">
                    {o.currentMastery !== null ? `${o.currentMastery}%` : <span className="text-xs font-semibold text-slate-500">No data yet</span>}
                  </p>
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                    <div className="bg-slate-300 h-full" style={{ width: `${o.baselineScore ?? 0}%` }} title="Baseline" />
                    <div className="bg-[#0D9488] h-full" style={{ width: `${o.currentMastery === null ? 0 : Math.max(0, o.currentMastery - (o.baselineScore ?? 0))}%` }} title="Progress" />
                  </div>
                  <MasterySummary outcome={o} isTeacher={isTeacher} size="text-[11px]" />
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* 4. TIMELINE (one row per module) */}
        <Section
          title={<span className="flex items-center gap-2"><Calendar className="w-4 h-4 text-[#0D9488]" /> Timeline</span>}
          description="Modules ordered by week. Release dates are resolved from the course start date."
        >
          {timeline.length === 0 ? (
            <p className="text-xs text-slate-500">No modules added to timeline yet.</p>
          ) : (
            <List label="Course timeline">
              {timeline.map((m) => {
                const isExpanded = expandedWeek === m.id;
                return (
                  <li key={m.id} className={m.isCurrent ? "bg-teal-50/40 dark:bg-teal-950/20" : ""}>
                    <button
                      type="button"
                      onClick={() => setExpandedWeek(isExpanded ? null : m.id)}
                      aria-expanded={isExpanded}
                      className="w-full px-3 py-2.5 flex items-center gap-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-900/40 transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md shrink-0 ${m.isCurrent ? "bg-[#0D9488] text-white" : "bg-slate-100 text-slate-700"}`}>
                        {moduleWeekLabel(m)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-slate-900 dark:text-white truncate">{m.title}</span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">
                          {m.resolvedStartDate ? formatRange(m.resolvedStartDate, m.resolvedEndDate) : "No dates yet"}
                        </span>
                      </span>
                      {m.isCurrent && <span className="text-[10px] font-bold text-teal-700 uppercase bg-teal-100 px-2 py-0.5 rounded-full shrink-0">Current</span>}
                    </button>

                    {isExpanded && (
                      <div className="pl-10 pr-3 pb-3 space-y-2">
                        <p className="text-xs text-slate-600 dark:text-slate-400">{m.description || "Weekly study material and assignments."}</p>
                        <Link
                          href={`/course/${courseId}/modules`}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D9488] hover:underline"
                        >
                          Open module items &rarr;
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
