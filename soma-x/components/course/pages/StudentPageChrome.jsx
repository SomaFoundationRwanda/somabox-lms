"use client";

import PageContent from "./PageContent";
import { Clock, CheckCircle2, BookOpen } from "lucide-react";
import { usePageScrollTracker } from "@/lib/usePageScrollTracker";
import { PageHeader } from "@/components/layout";
import { useCourseText } from "@/components/course/useCourseText";

export default function StudentPageChrome({ page, SERVER_URL, courseId, userEmail }) {
  const { t, tf } = useCourseText();
  const readMins = Math.max(1, Number(page.estimated_read_minutes) || 1);
  const { completed, scrollPct } = usePageScrollTracker({
    SERVER_URL,
    courseId,
    pageId: page.id,
    userEmail,
    initialView: page.myView,
  });

  return (
    <div className="space-y-6">
      {/* Student page header: flat band */}
      <PageHeader
        title={page.title}
        meta={
          <span className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 text-teal-600" />
            {tf("pageView.readMinutes", { n: readMins })}
          </span>
        }
        actions={
          completed ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{t("pageView.completed")}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
              <BookOpen className="w-3.5 h-3.5 text-slate-500" />
              <span>{tf("pageView.reading", { pct: Math.round(scrollPct) })}</span>
            </span>
          )
        }
      />

      {/* Shared Page Content Renderer (100% Identical Rendering to Teacher) */}
      <div className="px-1 py-2 border-t border-slate-200 dark:border-slate-800 pt-6">
        <PageContent
          bodyJson={page.body_json}
          bodyHtml={page.body_html}
          body={page.body}
        />
      </div>

      {/* Scroll completion tracker bottom anchor */}
      <div id="page-bottom-anchor" className="h-4" />
    </div>
  );
}
