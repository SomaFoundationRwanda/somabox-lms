"use client";

import PageContent from "./PageContent";
import { Clock, CheckCircle2, BookOpen } from "lucide-react";
import { usePageScrollTracker } from "@/lib/usePageScrollTracker";

export default function StudentPageChrome({ page, SERVER_URL, courseId, userEmail }) {
  const readMins = Math.max(1, Number(page.estimated_read_minutes) || 1);
  const { completed, scrollPct } = usePageScrollTracker({
    SERVER_URL,
    courseId,
    pageId: page.id,
    userEmail,
    initialView: page.myView,
  });

  return (
    <div className="space-y-4">
      {/* Student Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{page.title}</h1>
          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
            <span className="flex items-center gap-1 font-medium text-slate-600">
              <Clock className="w-3.5 h-3.5 text-teal-600" />
              ~{readMins} min read
            </span>
          </div>
        </div>

        {/* Student Completion Badge */}
        <div className="flex items-center gap-2">
          {completed ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>Completed</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
              <BookOpen className="w-3.5 h-3.5 text-slate-500" />
              <span>Reading ({Math.round(scrollPct)}%)</span>
            </span>
          )}
        </div>
      </div>

      {/* Shared Page Content Renderer (100% Identical Rendering to Teacher) */}
      <div className="px-1 py-2">
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
