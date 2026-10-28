"use client";

import { useContext } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import DataContext from "@/context/DataContext";
import { canGoBackInApp } from "@/lib/inAppHistory";
import { useCourseText } from "@/components/course/useCourseText";

const DASHBOARDS = { admin: "/manage/admin", teacher: "/teacher/dashboard" };

/**
 * Where "Back" goes when there's no earlier page in the app (a link opened directly): one level
 * up. An item goes to its list, a section to the course home, the course home to the dashboard.
 */
function parentOf(pathname, role) {
  const parts = pathname.split("/").filter(Boolean); // ["course", id, section, ...]
  if (parts.length > 3) return `/${parts.slice(0, -1).join("/")}`;
  if (parts.length === 3 && parts[2] !== "home") return `/${parts[0]}/${parts[1]}/home`;
  return DASHBOARDS[role] || "/manage/scholar-dashboard";
}

// The course pages' Back button (every role): the previous page, as the browser's would.
export default function BackButton() {
  const router = useRouter();
  const pathname = usePathname() || "";
  const { user } = useContext(DataContext);
  const { t } = useCourseText();
  const back = () => (canGoBackInApp() ? router.back() : router.push(parentOf(pathname, user?.role)));
  return (
    <button
      type="button"
      onClick={back}
      className="inline-flex items-center gap-1 font-semibold text-fg-muted hover:text-brand-fg rounded-md pr-2 mr-1 border-r border-line"
    >
      <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {t("common.back")}
    </button>
  );
}
