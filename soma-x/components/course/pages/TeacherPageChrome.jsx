"use client";

import PageContent from "./PageContent";
import { Eye, EyeOff, Edit, Users, CheckCircle } from "lucide-react";
import { PageHeader } from "@/components/layout";
import { useCourseText } from "@/components/course/useCourseText";

export default function TeacherPageChrome({ page, onEdit, onTogglePublish }) {
  const { t, tf } = useCourseText();
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
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-caption font-semibold border transition-colors ${
                page.published
                  ? "bg-success-soft text-success-fg border-success/30 hover:bg-success-soft"
                  : "bg-warning-soft text-warning-fg border-warning/30 hover:bg-warning-soft"
              }`}
            >
              {page.published ? (
                <>
                  <Eye className="w-3.5 h-3.5 text-success-fg" />
                  <span>{t("common.published")}</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-warning-fg" />
                  <span>{t("pageView.draftUnpublished")}</span>
                </>
              )}
            </button>
            {stats && (
              <span className="inline-flex items-center gap-1.5 text-caption text-fg-muted">
                <Users className="w-3.5 h-3.5 text-brand-fg" />
                <span>
                  {tf("pageView.viewed", { n: stats.viewedCount, total: stats.totalEnrolled })}
                </span>
                <span className="text-fg-subtle">·</span>
                <CheckCircle className="w-3.5 h-3.5 text-success-fg" />
                <span>
                  {tf("pageView.completedCount", { n: stats.completedCount })}
                </span>
              </span>
            )}
          </>
        }
        actions={
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 rounded-lg transition-colors"
          >
            <Edit className="w-3.5 h-3.5" />
            <span>{t("editors.editPage")}</span>
          </button>
        }
      />

      {/* Shared Page Content Renderer */}
      <div className="px-1 py-2 border-t border-line pt-6">
        <PageContent
          bodyJson={page.body_json}
          bodyHtml={page.body_html}
          body={page.body}
        />
      </div>
    </div>
  );
}
