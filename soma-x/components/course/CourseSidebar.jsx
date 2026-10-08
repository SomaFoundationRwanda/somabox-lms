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

function useVisibleNav() {
  const { courseId, nav, isTeacher } = useCourse();
  const visibleNav = nav.filter((item) => isTeacher || item.visibleToStudents);
  return { courseId, isTeacher, visibleNav };
}

function NavLinks({ onNavigate }) {
  const { courseId, isTeacher, visibleNav } = useVisibleNav();
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-0.5 px-2">
      {visibleNav.map((item) => {
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
                ? "bg-[#203A3A] text-white"
                : isHiddenFromStudents
                ? "text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900/40"
                : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">{item.label}</span>
            {isHiddenFromStudents ? <EyeOff className="w-3.5 h-3.5 shrink-0" aria-label="Hidden from students" /> : null}
          </Link>
        );
      })}
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
              isActive ? "bg-[#203A3A] text-white" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900/40"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">AI drafts</span>
          </Link>
        );
      })() : null}
    </div>
  );
}

// md+ only: the fixed course navigation column. On phones, CourseMenuButton replaces it.
export default function CourseSidebar() {
  return (
    <nav aria-label="Course navigation" className="hidden md:block w-56 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-transparent py-4">
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
        <span className="flex-1 text-left">Course menu</span>
        {current ? <span className="text-xs font-medium text-slate-500 truncate">{current.label}</span> : null}
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <nav
          id={panelId}
          aria-label="Course navigation"
          className="absolute left-4 right-4 top-full z-30 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 py-2 shadow-lg"
        >
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      ) : null}
    </div>
  );
}
