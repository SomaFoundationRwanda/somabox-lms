"use client";

import { Suspense } from "react";
import { useContext, useEffect, useMemo, useState } from "react";
import {
  BookOpen, Calendar, CheckCircle2, ChevronRight,
  Clock, Filter, GraduationCap, MessageSquare,
  Play, Star, X, Zap,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import DataContext from "@/context/DataContext";

function parseDueTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return Number.POSITIVE_INFINITY;
  const parsed = new Date(raw).getTime();
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

// Color palettes — per class
const PALETTE = [
  { gradient: "from-indigo-500 to-violet-600", dot: "bg-indigo-400" },
  { gradient: "from-amber-500 to-orange-500",  dot: "bg-amber-400" },
  { gradient: "from-teal-500 to-emerald-600",  dot: "bg-teal-400" },
  { gradient: "from-rose-500 to-pink-500",     dot: "bg-rose-400" },
  { gradient: "from-blue-500 to-cyan-500",     dot: "bg-blue-400" },
  { gradient: "from-orange-500 to-amber-400",  dot: "bg-orange-400" },
];

function getClassPalette(classId) {
  const str = String(classId || "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

const statusConfig = {
  not_started: { label: "Not Started", pill: "bg-slate-100 text-slate-500",                         actionLabel: "Open",   actionStyle: "primary" },
  in_progress:  { label: "In Progress", pill: "bg-amber-50 text-amber-600 border border-amber-200",  actionLabel: "Resume", actionStyle: "primary" },
  completed:    { label: "Completed",   pill: "bg-emerald-50 text-emerald-600 border border-emerald-200", actionLabel: "Review", actionStyle: "outline" },
};

function LessonCard({ lesson, accent, serverUrl }) {
  const status = String(lesson?.progress?.status || "not_started");
  const currentStep = Number(lesson?.progress?.current_step || 1);
  const totalSteps = Number(lesson?.stepCount || 1);
  const summary = lesson?.submissionSummary;
  const cfg = statusConfig[status] || statusConfig.not_started;
  const palette = getClassPalette(lesson.classId);

  const progressPct = status === "completed" ? 100
    : status === "in_progress" ? Math.min(100, Math.round(((currentStep - 1) / Math.max(totalSteps, 1)) * 100))
    : 0;

  const dueLabel = lesson?.dueAt
    ? new Date(lesson.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  const isDueSoon = lesson?.dueAt && (() => {
    const diff = new Date(lesson.dueAt).getTime() - Date.now();
    return diff > 0 && diff < 3 * 24 * 60 * 60 * 1000;
  })();

  const isOverdue = lesson?.dueAt && new Date(lesson.dueAt).getTime() < Date.now() && status !== "completed";

  // Use the lesson or class cover image if available
  const coverSrc = lesson?.cover_image
    ? `${serverUrl}/class-covers/${lesson.cover_image}`
    : lesson?.classCoverImage
    ? `${serverUrl}/class-covers/${lesson.classCoverImage}`
    : "/imageFallback.png";

  return (
    <Link href={`/manage/scholar-dashboard/lessons/${lesson.id}`} className="block group">
      <div className={`bg-white rounded-2xl border overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 ${
        isOverdue ? "border-red-200" : "border-slate-200 hover:border-slate-300"
      }`}>

        {/* Cover image */}
        <div className="w-full h-44 bg-slate-100 relative overflow-hidden">
          <Image
            src={coverSrc}
            alt={lesson.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            unoptimized
          />
          {/* Dark overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent" />

          {/* Status pill — overlaid on image */}
          <div className="absolute top-3 right-3">
            <span className={`inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded-full backdrop-blur-sm ${cfg.pill}`}>
              {cfg.label}
              {status === "in_progress" && ` · p.${currentStep}`}
            </span>
          </div>

          {/* Due soon badge */}
          {isDueSoon && !isOverdue && (
            <div className="absolute top-3 left-3">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white">
                <Zap size={9} /> Due soon
              </span>
            </div>
          )}
          {isOverdue && (
            <div className="absolute top-3 left-3">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-600 text-white">
                Overdue
              </span>
            </div>
          )}

          {/* Progress bar at bottom of image */}
          {(status === "in_progress" || status === "completed") && (
            <div className="absolute bottom-0 left-0 right-0 h-1.5">
              <div className="h-full bg-black/20" />
              <div
                className={`absolute inset-y-0 left-0 bg-gradient-to-r ${palette.gradient} transition-all duration-700`}
                style={{ width: `${Math.max(progressPct, 3)}%` }}
              />
            </div>
          )}
        </div>

        {/* Card body */}
        <div className="p-4">
          {/* Title */}
          <h3 className="text-[14px] font-bold text-slate-800 leading-snug group-hover:text-slate-900 transition-colors line-clamp-2 mb-1">
            {lesson.title}
          </h3>

          {/* Class name */}
          <div className="flex items-center gap-1.5 mb-3">
            <span className={`w-2 h-2 rounded-full shrink-0 ${palette.dot}`} />
            <span className="text-[11px] text-slate-500 truncate">
              {lesson.className}{lesson.classGrade ? ` · ${lesson.classGrade}` : ""}
            </span>
          </div>

          {/* Meta row */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <GraduationCap size={11} className="shrink-0" />
              {totalSteps} {totalSteps === 1 ? "step" : "steps"}
            </span>

            {dueLabel && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                isOverdue ? "text-red-500" : isDueSoon ? "text-orange-500" : "text-slate-400"
              }`}>
                <Calendar size={11} className="shrink-0" />
                {dueLabel}
              </span>
            )}

            {summary?.grade !== null && summary?.grade !== undefined && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold">
                <Star size={10} strokeWidth={2.5} />
                {summary.grade}/{summary.totalPoints}
              </span>
            )}

            {status === "completed" && (summary?.grade === null || summary?.grade === undefined) && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-500">
                <Clock size={10} strokeWidth={2.5} />
                Awaiting grade
              </span>
            )}

            {Number(summary?.feedbackCount || 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <MessageSquare size={10} strokeWidth={2.5} />
                {summary.feedbackCount}
              </span>
            )}
          </div>

          {/* Action button */}
          <button
            type="button"
            className={`w-full flex items-center justify-center gap-1.5 h-9 rounded-xl text-[12px] font-semibold transition-all duration-150 ${
              cfg.actionStyle === "primary"
                ? "text-white hover:opacity-90"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
            style={cfg.actionStyle === "primary" ? { backgroundColor: accent } : {}}
          >
            {status === "in_progress" && <Play size={11} />}
            {status === "completed" && <CheckCircle2 size={11} />}
            {cfg.actionLabel}
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </Link>
  );
}

function ScholarLessonsPage() {
  const { authenticated, role, unshiftString, SERVER_URL, isDark } = useContext(DataContext);
  const router = useRouter();
  const ACCENT = isDark ? "#0D9488" : "#203A3A";
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [joinedClasses, setJoinedClasses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [selectedClassIds, setSelectedClassIds] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [filtersInitialized, setFiltersInitialized] = useState(false);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [scholarEmail, setScholarEmail] = useState("");

  const currentRole = useMemo(() => {
    if (!role) return "";
    return unshiftString(role);
  }, [role, unshiftString]);

  useEffect(() => {
    const stored = localStorage.getItem("al");
    setScholarEmail(stored ? unshiftString(stored) : "");
  }, [unshiftString]);

  const classIdFromQuery = useMemo(() => String(searchParams?.get("classId") || "").trim(), [searchParams]);

  const loadData = async () => {
    if (!SERVER_URL || !scholarEmail) return;
    try {
      setLoading(true);
      const [classesRes, lessonsRes] = await Promise.all([
        fetch(`${SERVER_URL}/classes/mine?scholarEmail=${encodeURIComponent(scholarEmail)}`),
        fetch(`${SERVER_URL}/classes/lessons/mine?scholarEmail=${encodeURIComponent(scholarEmail)}`),
      ]);
      const classesPayload = await classesRes.json();
      const lessonsPayload = await lessonsRes.json();
      if (!classesRes.ok) throw new Error(classesPayload.message || "Failed to load classes");
      if (!lessonsRes.ok) throw new Error(lessonsPayload.message || "Failed to load lessons");
      setJoinedClasses(classesPayload);
      setLessons(lessonsPayload);
    } catch (err) {
      console.error("Failed to load scholar lessons data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated && currentRole === "scholar") loadData();
  }, [authenticated, currentRole, SERVER_URL, scholarEmail]);

  useEffect(() => {
    if (filtersInitialized || joinedClasses.length === 0) return;
    const availableIds = joinedClasses.map((c) => String(c.id));
    setSelectedClassIds(
      classIdFromQuery && availableIds.includes(classIdFromQuery) ? [classIdFromQuery] : availableIds
    );
    setFiltersInitialized(true);
  }, [filtersInitialized, joinedClasses, classIdFromQuery]);

  const toggleClassFilter = (classId) => {
    const id = String(classId);
    setSelectedClassIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const filteredLessons = useMemo(() => {
    const selected = new Set(selectedClassIds.map(String));
    return [...lessons]
      .filter((lesson) => {
        if (selected.size > 0 && !selected.has(String(lesson.classId))) return false;
        const s = String(lesson?.progress?.status || "not_started");
        if (statusFilter === "in_progress") return s === "in_progress";
        if (statusFilter === "completed") return s === "completed";
        return true;
      })
      .sort((a, b) => {
        const dA = parseDueTime(a?.dueAt), dB = parseDueTime(b?.dueAt);
        if (dA !== dB) return dA - dB;
        const sA = String(a?.progress?.status || "not_started");
        const sB = String(b?.progress?.status || "not_started");
        if (sA !== sB) {
          if (sA === "in_progress") return -1;
          if (sB === "in_progress") return 1;
        }
        return String(a?.title || "").localeCompare(String(b?.title || ""));
      });
  }, [lessons, selectedClassIds, statusFilter]);

  const counts = useMemo(() => ({
    all: lessons.length,
    in_progress: lessons.filter((l) => l?.progress?.status === "in_progress").length,
    completed: lessons.filter((l) => l?.progress?.status === "completed").length,
  }), [lessons]);

  const activeFilterCount = (statusFilter !== "all" ? 1 : 0) +
    (selectedClassIds.length < joinedClasses.length ? 1 : 0);

  useEffect(() => {
    if (authenticated && currentRole && currentRole !== "scholar") router.replace("/");
  }, [authenticated, currentRole, router]);

  if (!authenticated || currentRole !== "scholar") return null;

  const statusTabs = [
    { value: "all",         label: "All",        count: counts.all },
    { value: "in_progress", label: "In Progress", count: counts.in_progress },
    { value: "completed",   label: "Completed",   count: counts.completed },
  ];

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24 md:pb-8">

      {/* Top bar */}
      <div className="flex items-center justify-between pl-12 pr-4 md:px-6 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div>
          <h1 className="text-[17px] font-bold text-slate-900">My Lessons</h1>
          <p className="text-[11px] text-slate-400 hidden sm:block">Track and open your assigned lessons</p>
        </div>
        <button
          type="button"
          onClick={() => setFilterPanelOpen(v => !v)}
          className="relative flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors xl:hidden"
        >
          {filterPanelOpen ? <X size={13} /> : <Filter size={13} />}
          Filters
          {activeFilterCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center" style={{ backgroundColor: ACCENT }}>
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Mobile filter drawer */}
      {filterPanelOpen && (
        <div className="xl:hidden mx-3 mt-3 bg-white border border-slate-200 rounded-2xl p-4 space-y-4 shadow-sm">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {statusTabs.map(({ value, label, count }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStatusFilter(value)}
                  className={`h-7 px-3 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                    statusFilter === value ? "text-white" : "bg-slate-100 text-slate-600"
                  }`}
                  style={statusFilter === value ? { backgroundColor: ACCENT } : {}}
                >
                  {label}
                  <span className={`text-[10px] ${statusFilter === value ? "opacity-60" : "text-slate-400"}`}>{count}</span>
                </button>
              ))}
            </div>
          </div>
          {joinedClasses.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Classes</p>
              <div className="grid grid-cols-2 gap-1.5">
                {joinedClasses.map((cls) => {
                  const isChecked = selectedClassIds.includes(String(cls.id));
                  const { dot } = getClassPalette(cls.id);
                  return (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => toggleClassFilter(cls.id)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium border transition-colors ${
                        isChecked ? "border-slate-300 bg-slate-50 text-slate-700" : "border-slate-200 text-slate-500 bg-white"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                      <span className="truncate">{cls.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Layout */}
      <div className="p-3 sm:p-5">
        <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-4">

          {/* Desktop sidebar */}
          <aside className="hidden xl:flex flex-col gap-3 h-fit">

            {/* Status */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Status</p>
              <div className="space-y-0.5">
                {statusTabs.map(({ value, label, count }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusFilter(value)}
                    className={`w-full flex items-center justify-between h-8 px-3 rounded-lg text-[12px] font-medium transition-colors cursor-pointer ${
                      statusFilter === value ? "text-white" : "text-slate-600 hover:bg-slate-50"
                    }`}
                    style={statusFilter === value ? { backgroundColor: ACCENT } : {}}
                  >
                    <span>{label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${
                      statusFilter === value ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                    }`}>
                      {count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Classes filter */}
            {joinedClasses.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Classes</p>
                <div className="space-y-0.5">
                  {joinedClasses.map((cls) => {
                    const isChecked = selectedClassIds.includes(String(cls.id));
                    const { dot } = getClassPalette(cls.id);
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        onClick={() => toggleClassFilter(cls.id)}
                        className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                          isChecked ? "bg-slate-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-medium text-slate-700 truncate">{cls.name}</p>
                          {cls.grade && <p className="text-[9px] text-slate-400">{cls.grade}</p>}
                        </div>
                        {isChecked && <CheckCircle2 size={12} className="shrink-0 text-slate-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </aside>

          {/* Lessons grid */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <p className="text-[13px] font-semibold text-slate-700">
                {statusFilter === "all" ? "All Lessons" : statusFilter === "in_progress" ? "In Progress" : "Completed"}
              </p>
              {!loading && (
                <span className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-500">
                  {filteredLessons.length} {filteredLessons.length === 1 ? "lesson" : "lessons"}
                </span>
              )}
            </div>

            {loading ? (
              /* Skeleton cards matching the image card layout */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                    <div className="w-full h-44 bg-slate-100 animate-pulse" />
                    <div className="p-4 space-y-2.5">
                      <div className="h-4 bg-slate-100 rounded animate-pulse w-4/5" />
                      <div className="h-3 bg-slate-100 rounded animate-pulse w-3/5" />
                      <div className="flex gap-2 mt-1">
                        <div className="h-5 bg-slate-100 rounded animate-pulse w-14" />
                        <div className="h-5 bg-slate-100 rounded animate-pulse w-20" />
                      </div>
                      <div className="h-9 bg-slate-100 rounded-xl animate-pulse mt-2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredLessons.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-100">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                  <BookOpen className="w-7 h-7 text-slate-300" />
                </div>
                <p className="text-[14px] font-bold text-slate-400">No lessons match your filters</p>
                <p className="text-[12px] text-slate-300 mt-1">Try adjusting the class or status filter</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredLessons.map((lesson) => (
                  <LessonCard key={lesson.id} lesson={lesson} accent={ACCENT} serverUrl={SERVER_URL} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default function ScholarLessonsPageWrapper() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400 p-4">Loading...</p>}>
      <ScholarLessonsPage />
    </Suspense>
  );
}
