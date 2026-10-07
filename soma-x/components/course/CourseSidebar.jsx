"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
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
} from "lucide-react";
import { useCourse } from "@/context/CourseContext";

const NAV_ICONS = {
  home: Home,
  announcements: Megaphone,
  syllabus: BookOpen,
  modules: Layers,
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
};

export default function CourseSidebar() {
  const { courseId, nav, isTeacher } = useCourse();
  const pathname = usePathname();

  const visibleNav = nav.filter((item) => isTeacher || item.visibleToStudents);

  return (
    <nav className="w-56 shrink-0 border-r border-slate-200 bg-white py-4">
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
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-[#203A3A] text-white"
                  : isHiddenFromStudents
                  ? "text-slate-400 hover:bg-slate-50"
                  : "text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {isHiddenFromStudents ? <EyeOff className="w-3.5 h-3.5 shrink-0" /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
