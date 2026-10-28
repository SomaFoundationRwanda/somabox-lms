"use client";

// The frame around an item editor: a dialog over the page, or (asPage) a page of its own with a
// way back and the Save bar kept in view. The editor's own content is its children: a body, then
// its footer of buttons as the last child.
import Link from "next/link";
import { ArrowLeft, X } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseText } from "@/components/course/useCourseText";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { Heading } from "@/components/typography";

export default function EditorFrame({ asPage = false, title, onClose, backHref, maxWidth = "max-w-3xl", children }) {
  const { t } = useCourseText();
  const { courseId } = useCourse();

  if (asPage) {
    return (
      <div>
        <Breadcrumbs sectionKey="modules" itemName={title} />
        <div className={`p-4 md:p-6 ${maxWidth}`}>
          {/* Going back is the editor's own close (which asks about unsaved changes). */}
          {onClose ? (
            <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg hover:underline">
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {t("editors.backToWeeks")}
            </button>
          ) : (
            <Link href={backHref || `/course/${courseId}/modules`} className="inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg hover:underline">
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {t("editors.backToWeeks")}
            </Link>
          )}
          <Heading level={1} className="mt-2">{title}</Heading>
          {/* The editor's body, then its buttons, which stay at the bottom of the screen. */}
          <div className="mt-4 rounded-xl border border-line bg-surface [&>div:last-child]:sticky [&>div:last-child]:bottom-0 [&>div:last-child]:bg-surface [&>div:last-child]:rounded-b-xl">
            {children}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-auto py-8">
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-surface rounded-2xl w-full ${maxWidth} shadow-2xl mx-4`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="text-item font-bold text-fg">{title}</h2>
          <button aria-label={t("common.close")} onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover text-fg-subtle">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
