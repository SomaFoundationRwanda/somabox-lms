"use client";

import PageContent from "./PageContent";
import { Users, CheckCircle } from "lucide-react";
import ItemStatusActions from "@/components/course/modules/ItemStatusActions";
import { PageHeader } from "@/components/layout";
import { useCourseText } from "@/components/course/useCourseText";

// Status, Publish, Edit and the rest: ItemStatusActions (the same on every item page).
export default function TeacherPageChrome({ page }) {
  const { tf } = useCourseText();
  const stats = page?.teacherStats || null;

  return (
    <div className="space-y-6">
      {/* Teacher page header: flat band, not a card */}
      <PageHeader
        title={page.title}
        meta={
          <>
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
        actions={<ItemStatusActions type="page" contentId={page.id} published={Boolean(page.published)} title={page.title} />}
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
