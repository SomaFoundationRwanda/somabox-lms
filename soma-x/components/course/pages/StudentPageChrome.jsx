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
          <span className="flex items-center gap-1 font-medium text-fg-muted">
            <Clock className="w-3.5 h-3.5 text-brand-fg" />
            {tf("pageView.readMinutes", { n: readMins })}
          </span>
        }
        actions={
          completed ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold bg-success-soft text-success-fg border border-success/30">
              <CheckCircle2 className="w-4 h-4 text-success-fg" />
              <span>{t("pageView.completed")}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold bg-surface-sunken text-fg-muted border border-line">
              <BookOpen className="w-3.5 h-3.5 text-fg-subtle" />
              <span>{tf("pageView.reading", { pct: Math.round(scrollPct) })}</span>
            </span>
          )
        }
      />

      {/* Shared Page Content Renderer (100% Identical Rendering to Teacher) */}
      <div className="px-1 py-2 border-t border-line pt-6">
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
