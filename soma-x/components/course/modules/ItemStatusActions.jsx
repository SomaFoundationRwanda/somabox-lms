"use client";

// The top of an item's own page, for teachers: whether learners can see it (in words), Publish
// as the one button on a draft, Edit, and the rest in a "⋯" menu. Same for pages, assignments,
// quizzes and discussions.
import { useState } from "react";
import Link from "next/link";
import { EyeOff, Pencil } from "lucide-react";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { useCourseText } from "@/components/course/useCourseText";
import { Button } from "@/components/ui/button";
import ActionMenu from "@/components/ui/ActionMenu";
import { editItemHref, useItemEditor } from "./useItemEditor";

const PATHS = { page: "pages", assignment: "assignments", quiz: "quizzes", discussion: "discussions" };

export default function ItemStatusActions({ type, contentId, published, title, editable = true }) {
  const { courseId } = useCourse();
  const { t, tf } = useCourseText();
  const { showToast } = useToast();
  const { invalidate } = useItemEditor();
  const { data: modules } = useCourseSection("modules");
  const [busy, setBusy] = useState(false);
  // Whether the item's week is published: a published item in a draft week stays hidden.
  const week = (Array.isArray(modules) ? modules : []).find((m) => (m.items || []).some((i) => i.item_type === type && String(i.content_id) === String(contentId)));
  const weekHidden = week && !week.published && week.kind !== "unassigned";

  const setPublished = async (next) => {
    setBusy(true);
    try {
      const payload = await apiFetch(`/courses/${courseId}/${PATHS[type]}/${contentId}`, { method: "PATCH", json: { published: next } });
      if (payload?.notice) showToast(payload.notice, "info", 7000);
    } catch (err) {
      showToast(err?.status === 0 ? getErrorMessage(err) : err?.body?.message || t(next ? "modules.errors.publishItem" : "modules.errors.unpublishItem"), "error");
    } finally {
      invalidate();
      setBusy(false);
    }
  };

  const chip = !published ? { text: t("common.draft"), cls: "bg-surface-sunken text-fg-muted border-line" }
    : weekHidden ? { text: t("modules.hiddenByWeek"), cls: "bg-warning-soft text-warning-fg border-warning/30" }
    : { text: t("common.published"), cls: "bg-success-soft text-success-fg border-success/30" };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`text-caption font-semibold px-2.5 py-0.5 rounded-full border ${chip.cls}`}>{chip.text}</span>
      {!published ? (
        <Button type="button" size="sm" onClick={() => setPublished(true)} disabled={busy} aria-label={tf("modules.publishNamed", { title })}>{t("modules.publish")}</Button>
      ) : null}
      {editable ? (
        <Button asChild size="sm" variant="outline">
          <Link href={editItemHref(courseId, type, contentId)}><Pencil className="w-3.5 h-3.5" aria-hidden="true" /> {t("common.edit")}</Link>
        </Button>
      ) : null}
      <ActionMenu
        label={tf("modules.itemActions", { title })}
        items={[published ? { key: "unpublish", label: t("modules.unpublish"), icon: EyeOff, onSelect: () => setPublished(false), disabled: busy } : null]}
      />
    </div>
  );
}
