"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  UsersRound,
  BarChart3,
  BookOpen,
  ChevronDown,
  Menu,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
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
  groups: UsersRound,
  ai: Sparkles,
};

// Teachers see what they use every week first; the rest (Settings and AI drafts too) sit under
// "More" so a new teacher isn't faced with 19 links. Order within each group follows the course's
// nav order.
const TEACHER_CORE = new Set(["home", "modules", "assignments", "quizzes", "discussions", "outcomes", "grades", "people", "groups", "announcements", "attendance"]);
// Learners: the course week by week, their grades and the news; the rest under "More".
const LEARNER_CORE = new Set(["home", "modules", "grades", "groups", "announcements"]);
const MORE_KEY = "somabox.courseNav.moreOpen";
// In no one's menu: rubrics are on their assignment's page, and pages are opened from Weeks.
const NOT_IN_MENU = new Set(["rubrics", "pages"]);
// Learners can still open these, but not from the menu: pages are in Weeks, outcomes on My
// progress, their attendance on Grades. Fewer links when they open a course.
export const NOT_IN_LEARNER_MENU = new Set(["pages", "outcomes", "attendance"]);

function useVisibleNav() {
  const { courseId, nav, isTeacher, isCourseTeacher, adminView } = useCourse();
  // The server already leaves out what a learner, observer or admin can't open. Settings run the
  // course: only its teachers see them, not assistants.
  // Nobody's menu has NOT_IN_MENU; learners' menus also leave out NOT_IN_LEARNER_MENU.
  const visibleNav = nav.filter((item) => (isTeacher || item.visibleToStudents || adminView)
    && (item.navKey !== "settings" || isCourseTeacher)
    && !NOT_IN_MENU.has(item.navKey)
    && (isTeacher || adminView || !NOT_IN_LEARNER_MENU.has(item.navKey)));
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
  const core = isTeacher ? TEACHER_CORE : LEARNER_CORE;
  const primary = visibleNav.filter((item) => core.has(item.navKey));
  const more = visibleNav.filter((item) => !core.has(item.navKey));
  // Not a course_nav_items key: the teacher-only AI drafts review page, just before Settings.
  if (isTeacher) {
    const at = more.findIndex((item) => item.navKey === "settings");
    more.splice(at < 0 ? more.length : at, 0, { navKey: "ai", label: t("nav.ai"), visibleToStudents: false, staffOnly: true });
  }
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
    // Sections a teacher has hidden from learners say so; staff-only ones (Settings, Insights…) always are.
    const isHiddenFromStudents = isTeacher && !item.visibleToStudents && !item.staffOnly;

    return (
      <Link
        key={item.navKey}
        href={href}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-ui font-medium transition-colors ${
          isActive
            ? "bg-brand-strong text-on-brand-strong"
            : isHiddenFromStudents
            ? "text-fg-subtle hover:bg-surface-hover"
            : "text-fg-muted hover:bg-surface-hover"
        }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 truncate">{item.navKey === "ai" ? item.label : navLabel(item.navKey, item.label)}</span>
        {isHiddenFromStudents ? <span className="shrink-0 text-caption font-medium text-fg-subtle" title={t("nav.hiddenFromStudents")}>{t("nav.teachersOnly")}</span> : null}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-0.5 px-2">
      {primary.map(renderItem)}
      {more.length > 0 ? (
        <>
          <button
            type="button"
            onClick={toggleMore}
            aria-expanded={showMore}
            aria-controls={moreId}
            className="mt-1 flex items-center gap-2.5 px-3 py-2 rounded-lg text-caption font-semibold text-fg-subtle hover:bg-surface-hover"
          >
            <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showMore ? "rotate-180" : ""}`} aria-hidden="true" />
            <span className="flex-1 text-left">{t("nav.more")}</span>
            <span className="text-caption font-bold text-fg-subtle">{more.length}</span>
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
    <nav aria-label={t("nav.courseNavigation")} className="hidden md:block w-56 shrink-0 border-r border-line bg-surface py-4">
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
    <div ref={wrapperRef} className="md:hidden relative border-b border-line px-4 py-2">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 rounded-lg border border-line px-3 py-2 text-ui font-semibold text-fg-muted hover:bg-surface-hover"
      >
        <Menu className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="flex-1 text-left">{t("nav.courseMenu")}</span>
        {current ? <span className="text-caption font-medium text-fg-subtle truncate">{navLabel(current.navKey, current.label)}</span> : null}
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open ? (
        <nav
          id={panelId}
          aria-label={t("nav.courseNavigation")}
          className="absolute left-4 right-4 top-full z-30 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-surface py-2 shadow-lg"
        >
          <NavLinks onNavigate={() => setOpen(false)} />
        </nav>
      ) : null}
    </div>
  );
}
