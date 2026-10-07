"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Bell, ChevronDown, ChevronRight, Clock, AlertTriangle, 
  Target, Sparkles, CheckCircle2, Play, Users, Award, Calendar, Layers 
} from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import CourseSetupWizard from "@/components/teacher/CourseSetupWizard";
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

  // If teacher and course is not opened yet, show Course Setup Wizard
  if (isTeacher && setupStatus && !setupStatus.isOpened) {
    return (
      <CourseSetupWizard
        SERVER_URL={SERVER_URL}
        courseId={courseId}
        userEmail={userEmail}
        course={course}
        onCompleted={() => {
          refresh();
          loadHomeData();
        }}
      />
    );
  }

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

  return (
    <div>
      <Breadcrumbs sectionKey="home" />

      {/* Course Banner */}
      {course?.coverImageUrl ? (
        <div className="w-full h-36 md:h-48 bg-slate-100 relative">
          <img src={`${SERVER_URL}${course.coverImageUrl}`} alt={course.title} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-4 left-6 text-white">
            <span className="text-[10px] font-bold uppercase tracking-wider bg-[#0D9488] px-2.5 py-0.5 rounded-full">{courseLifecycleLabel(course)}</span>
            <h1 className="text-xl md:text-2xl font-black mt-1">{course.title}</h1>
          </div>
        </div>
      ) : null}

      <div className="p-4 md:p-6 space-y-6 max-w-5xl">
        {!course?.coverImageUrl && (
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-[#0D9488]">Course Dashboard</span>
              <h1 className="text-2xl font-black text-slate-900 mt-0.5">{course?.title || "Course"}</h1>
            </div>
            {isTeacher && (
              <button
                onClick={() => setSetupStatus((p) => ({ ...p, isOpened: false }))}
                className="text-xs font-semibold text-[#0D9488] bg-teal-50 border border-teal-200 px-3 py-1.5 rounded-xl hover:bg-teal-100 transition-colors"
              >
                Re-open Setup Wizard
              </button>
            )}
          </div>
        )}

        {/* 1. NOW BEAT CARD */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold uppercase px-3 py-1 rounded-full ${BEAT_COLORS[currentBeat] || BEAT_COLORS.prepare}`}>
                Now: {currentBeat.toUpperCase()} BEAT
              </span>
              <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                {beatInfo.currentWeekNumber === null || beatInfo.currentWeekNumber === undefined
                  ? (beatInfo.startDate ? "No module this week" : "No dates yet")
                  : beatInfo.currentWeekNumber === 0 ? "Week 0 · Baseline" : `Week ${beatInfo.currentWeekNumber}`}
              </span>
            </div>

            {isTeacher && (
              <span className="text-xs font-semibold text-[#0D9488] bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
                Weekly Loop Active
              </span>
            )}
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900">{beatInfo.beatTitle || "Current Course Beat"}</h2>
            <p className="text-xs text-slate-500 mt-1">
              {currentBeat === "prepare" && "Prepare phase: verify module items, outcome tags, and approve AI drafts before students start."}
              {currentBeat === "release" && "Release phase: module items are live and open for student access."}
              {currentBeat === "collect" && "Collect phase: monitor student progress, submissions, and discussion participation."}
              {currentBeat === "grade" && "Grade phase: score student submissions using outcome-linked rubrics with AI assistance."}
              {currentBeat === "review" && "Review phase: evaluate outcome mastery vs baseline and adjust next week."}
            </p>
          </div>

          {beatInfo.primaryAction && (
            <div className="pt-2">
              <Link
                href={beatInfo.primaryAction.href}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#203A3A] hover:bg-[#182c2c] text-white rounded-xl text-sm font-semibold transition-colors shadow-sm"
              >
                <Play className="w-4 h-4 fill-white" /> {beatInfo.primaryAction.label}
              </Link>
            </div>
          )}
        </div>

        {/* 2. NEEDS ATTENTION & OUTCOME PULSE GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Needs Attention */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> Needs Attention
            </h3>

            {needsAttention.length === 0 ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> All module items are tagged with outcomes and up to date!
              </div>
            ) : (
              <div className="space-y-2">
                {needsAttention.map((item) => (
                  <div key={item.id} className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between gap-3">
                    <p className="text-xs font-semibold text-amber-900">{item.title}</p>
                    <Link href={item.href} className="text-xs font-bold text-amber-700 hover:underline shrink-0">
                      {item.actionLabel} &rarr;
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outcome Pulse */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Target className="w-4 h-4 text-[#0D9488]" /> Outcome Pulse (vs Baseline)
              </h3>
              <Link href={`/course/${courseId}/outcomes`} className="text-xs font-semibold text-[#0D9488] hover:underline">
                View All &rarr;
              </Link>
            </div>

            {outcomesList.length === 0 ? (
              <p className="text-xs text-slate-500">No outcome data logged yet.</p>
            ) : (
              <div className="space-y-2.5">
                {outcomesList.slice(0, 3).map((o) => (
                  <div key={o.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-800 truncate">{o.title}</span>
                      <span className="font-bold text-[#0D9488] shrink-0 ml-2">
                        {o.currentMastery !== null ? `${o.currentMastery}%` : "No data yet"}
                        {" "}(Base: {o.baselineScore !== null ? `${o.baselineScore}%` : "none"})
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                      <div className="bg-slate-300 h-full" style={{ width: `${o.baselineScore ?? 0}%` }} title="Baseline" />
                      <div className="bg-[#0D9488] h-full" style={{ width: `${o.currentMastery === null ? 0 : Math.max(0, o.currentMastery - (o.baselineScore ?? 0))}%` }} title="Progress" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3. INTERACTIVE TIMELINE (MODULES BY WEEK) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-[#0D9488]" /> Course Weekly Timeline
              </h3>
              <p className="text-xs text-slate-500">Modules ordered by week. Dynamic release dates resolved from start date.</p>
            </div>
          </div>

          <div className="space-y-3">
            {timeline.length === 0 ? (
              <p className="text-xs text-slate-500">No modules added to timeline yet.</p>
            ) : (
              timeline.map((m) => {
                const isExpanded = expandedWeek === m.id;
                return (
                  <div key={m.id} className={`border rounded-2xl overflow-hidden transition-all ${m.isCurrent ? "border-[#0D9488] bg-teal-50/20" : "border-slate-200 bg-white"}`}>
                    <button
                      onClick={() => setExpandedWeek(isExpanded ? null : m.id)}
                      className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-lg shrink-0 ${m.isCurrent ? "bg-[#0D9488] text-white" : "bg-slate-100 text-slate-700"}`}>
                          {moduleWeekLabel(m)}
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 truncate">{m.title}</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {m.resolvedStartDate ? formatRange(m.resolvedStartDate, m.resolvedEndDate) : "No dates yet"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {m.isCurrent && <span className="text-[10px] font-bold text-teal-700 uppercase bg-teal-100 px-2 py-0.5 rounded-full">Current Week</span>}
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 pt-0 border-t border-slate-100 bg-slate-50/50 space-y-2">
                        <p className="text-xs text-slate-600 mt-2">{m.description || "Weekly study material and assignments."}</p>
                        <div className="pt-2">
                          <Link
                            href={`/course/${courseId}/modules`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0D9488] hover:underline"
                          >
                            Open Module Items &rarr;
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
