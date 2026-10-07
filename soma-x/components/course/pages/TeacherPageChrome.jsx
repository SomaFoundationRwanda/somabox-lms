"use client";

import PageContent from "./PageContent";
import { Eye, EyeOff, Edit, Users, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/layout";

export default function TeacherPageChrome({ page, onEdit, onTogglePublish }) {
  const stats = page?.teacherStats || null;

  return (
    <div className="space-y-6">
      {/* Teacher page header: flat band, not a card */}
      <PageHeader
        title={page.title}
        meta={
          <>
            <button
              type="button"
              onClick={onTogglePublish}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                page.published
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
              }`}
            >
              {page.published ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Published</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                  <span>Draft (Unpublished)</span>
                </>
              )}
            </button>
            {stats && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                <Users className="w-3.5 h-3.5 text-[#203A3A]" />
                <span>
                  <strong>{stats.viewedCount}</strong>/{stats.totalEnrolled} students viewed
                </span>
                <span className="text-slate-300">·</span>
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                <span>
                  <strong>{stats.completedCount}</strong> completed
                </span>
              </span>
            )}
          </>
        }
        actions={
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg transition-colors"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>Edit Page</span>
          </button>
        }
      />

      {/* Shared Page Content Renderer */}
      <div className="px-1 py-2 border-t border-slate-200 dark:border-slate-800 pt-6">
        <PageContent
          bodyJson={page.body_json}
          bodyHtml={page.body_html}
          body={page.body}
        />
      </div>
    </div>
  );
}
