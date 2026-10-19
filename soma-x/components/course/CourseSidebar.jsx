"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  ChevronDown,
  Menu,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  EyeOff,
  FileText,
  Folder,
  GraduationCap,
  Layers,
  ListChecks,
  Megaphone,
  MessageSquare,
  Settings as SettingsIcon,
  Share2,
  Target,
  HelpCircle,
  Home,
  Users,
  Sparkles,
} from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseText } from "@/components/course/useCourseText";

const NAV_ICONS = {
  home: Home,
  announcements: Megaphone,
  syllabus: BookOpen,
  modules: Layers,
  calendar: CalendarDays,
  grades: GraduationCap,
  people: Users,
  assignments: ClipboardList,
  rubrics: ListChecks,
  files: Folder,
  collaborations: Share2,
  outcomes: Target,
  quizzes: HelpCircle,
  pages: FileText,
  discussions: MessageSquare,
  settings: SettingsIcon,
  insights: BarChart3,
  attendance: ClipboardCheck,
};

// Teachers see these first; the rest of the course tools sit under "More" so a new teacher
// isn't faced with 19 links. Order within each group follows the course's nav order.
const TEACHER_CORE = new Set(["home", "modules", "outcomes", "grades", "people", "announcements", "attendance", "settings"]);
const MORE_KEY = "somabox.courseNav.moreOpen";

function useVisibleNav() {
  const { courseId, nav, isTeacher } = useCourse();
  const visibleNav = nav.filter((item) => isTeacher || item.visibleToStudents);
  return { courseId, isTeacher, visibleNav };
}

function NavLinks({ onNavigate }) {
  const { courseId, isTeacher, visibleNav } = useVisibleNav();
  const pathname = usePathname();
  const { t, navLabel } = useCourseText();
  const moreId = useId();

  const isActiveKey = (key) => {
    const href = `/course/${courseId}/${key}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  };
  const primary = isTeacher ? visibleNav.filter((item) => TEACHER_CORE.has(item.navKey)) : visibleNav;
  const more = isTeacher ? visibleNav.filter((item) => !TEACHER_CORE.has(item.navKey)) : [];
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    try { if (window.localStorage.getItem(MORE_KEY) === "1") setMoreOpen(true); } catch { /* storage unavailable */ }
  }, []);
  const toggleMore = () => setMoreOpen((v) => {
    try { window.localStorage.setItem(MORE_KEY, v ? "0" : "1"); } catch { /* storage unavailable */ }
    return !v;
  });
  // A page that lives under "More" keeps the group open while you're on it.
  const showMore = moreOpen || more.some((item) => isActiveKey(item.navKey));

  const renderItem = (item) => {
    const Icon = NAV_ICONS[item.navKey] || Home;
    const href = `/course/${courseId}/${item.navKey}`;
    const isActive = pathname === href || pathname.startsWith(`${href}/`);
    const isHiddenFromStudents = isTeacher && !item.visibleToStudents;

    return (
      <Link
        key={item.navKey}
        href={href}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-[var(--brand-primary)] text-white"
            : isHiddenFromStudents
            ? "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/40"
            : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40"
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 truncate">{navLabel(item.navKey, item.label)}</span>
        {isHiddenFromStudents ? <EyeOff className="w-3.5 h-3.5 shrink-0" aria-label={t("nav.hiddenFromStudents")} /> : null}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-0.5 px-2">
      {primary.map(renderItem)}
      {isTeacher ? (() => {
        // Not a course_nav_items key: a teacher-only link to the AI drafts review page.
        const href = `/course/${courseId}/ai`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive ? "bg-[var(--brand-primary)] text-white" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">{t("nav.ai")}</span>
          </Link>
        );
      })() : null}
      {more.length > 0 ? (
        <>
          <button
            type="button"
            onClick={toggleMore}
            aria-expanded={showMore}
            aria-controls={moreId}
            className="mt-1 flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-900/40"
          >
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showMore ? "rotate-180" : ""}`} aria-hidden="true" />
            <span className="flex-1 text-left">{t("nav.more")}</span>
            <span className="text-[10px] font-bold text-slate-400">{more.length}</span>
          </button>
          {showMore ? <div id={moreId} className="flex flex-col gap-0.5">{more.map(renderItem)}</div> : null}
        </>
      ) : null}
    </div>
  );
}

// md+ only: the fixed course navigation column. On phones, CourseMenuButton replaces it.
export default function CourseSidebar() {
  const { t } = useCourseText();
  return (
    <nav aria-label={t("nav.courseNavigation")} className="hidden md:block w-56 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-transparent py-4">
      <NavLinks />
    </nav>
  );
}

// Phones (< md): a compact "Course menu" disclosure at the top of the course content that
// opens the same navigation. Closes on Escape, on navigation, or when focus leaves it.
export function CourseMenuButton() {
  const [open, setOpen] = useState(false);
  const { visibleNav, courseId } = useVisibleNav();
  const pathname = usePathname();
  const panelId = useId();
  const { t, navLabel } = useCourseText();
  const buttonRef = useRef(null);
  const wrapperRef = useRef(null);

  const current = visibleNav.find((item) => {
    const href = `/course/${courseId}/${item.navKey}`;
    return pathname === href || pathname.startsWith(`${href}/`);
  });

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="md:hidden relative border-b border-slate-200 dark:border-slate-800 px-4 py-2">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900/40"
      >
        <Menu className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">{t("nav.courseMenu")}</span>
        {current ? <span className="text-xs font-medium text-slate-500 truncate">{navLabel(current.navKey, current.label)}</span> : null}
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <nav
          id={panelId}
          aria-label={t("nav.courseNavigation")}
          className="absolute left-4 right-4 top-full z-30 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-2 shadow-lg"
        >
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      ) : null}
    </div>
  );
}
