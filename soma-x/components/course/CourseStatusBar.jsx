"use client";

// The course's status, on every course page for its staff: a chip (Draft, Published, Ended,
// Archived), one sentence on what that means for learners, the one main action as a button
// (Publish course / Reopen course) and the rest in a "⋯" menu. Only the course's own teachers
// change the status; assistants see it.
import { useState } from "react";
import Link from "next/link";
import { Archive, Lock, Rocket, RotateCcw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import { useCourseSection } from "@/lib/useCourseSection";
import useSetupText from "@/lib/useSetupText";
import { ApiError, apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useCourseText } from "@/components/course/useCourseText";
import { Button } from "@/components/ui/button";
import ActionMenu from "@/components/ui/ActionMenu";
import Modal from "@/components/ui/Modal";

const CHIP = {
  draft: "bg-warning-soft text-warning-fg border-warning/30",
  open: "bg-success-soft text-success-fg border-success/30",
  closed: "bg-surface-sunken text-fg-muted border-line",
  archived: "bg-surface-sunken text-fg-subtle border-line",
};

export default function CourseStatusBar() {
  const { courseId, course, isCourseTeacher, refresh } = useCourse();
  const { t, lifecycleLabel } = useCourseText();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [publishing, setPublishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const lifecycle = course?.lifecycle || "draft";

  const changed = () => {
    refresh();
    queryClient.invalidateQueries({ queryKey: queryKeys.courses });
  };

  // Ended, archived and back again: the moves the server allows (PATCH lifecycle).
  const move = async (to) => {
    if (!window.confirm(t(`settings.status.confirm.${to}`))) return;
    setBusy(true);
    try {
      await apiFetch(`/courses/${courseId}`, { method: "PATCH", json: { lifecycle: to } });
      showToast(t(`settings.status.done.${to}`), "success");
      changed();
    } catch (err) {
      showToast(err?.body?.message || t("settings.status.failed"), "error");
    } finally {
      setBusy(false);
    }
  };

  const main = !isCourseTeacher ? null
    : lifecycle === "draft" ? { label: t("status.publish"), icon: Rocket, run: () => setPublishing(true) }
    : lifecycle === "closed" ? { label: t("settings.status.action.open"), icon: RotateCcw, run: () => move("open") }
    : lifecycle === "archived" ? { label: t("status.unarchive"), icon: RotateCcw, run: () => move("closed") }
    : null;
  const menu = !isCourseTeacher ? [] : [
    lifecycle === "open" ? { key: "end", label: t("settings.status.action.closed"), icon: Lock, onSelect: () => move("closed") } : null,
    lifecycle === "open" || lifecycle === "closed" ? { key: "archive", label: t("settings.status.action.archived"), icon: Archive, onSelect: () => move("archived") } : null,
  ];

  return (
    <div className="mx-4 sm:mx-6 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface-sunken px-3 py-2">
      <span className={`text-caption font-bold px-2.5 py-0.5 rounded-full border ${CHIP[lifecycle] || CHIP.draft}`}>{lifecycleLabel(course)}</span>
      <p className="flex-1 min-w-[12rem] text-caption text-fg-muted">{t(`status.note.${lifecycle}`)}</p>
      {main ? (
        <Button type="button" size="sm" onClick={main.run} disabled={busy} className="gap-1.5">
          <main.icon className="w-3.5 h-3.5" aria-hidden="true" /> {main.label}
        </Button>
      ) : null}
      <ActionMenu label={t("status.more")} items={menu} />
      {publishing ? <PublishDialog courseId={courseId} course={course} onClose={() => setPublishing(false)} onDone={changed} /> : null}
    </div>
  );
}

/**
 * Publishing: either what's still missing (with links), or a question: publish the weeks that
 * have content too, so learners see them? (A published course with only draft weeks shows
 * learners nothing.)
 */
export function PublishDialog({ courseId, course, onClose, onDone }) {
  const { t, tf } = useCourseText();
  const { showToast } = useToast();
  const { blockingText } = useSetupText();
  const status = useCourseSection("setup-status");
  const [sending, setSending] = useState(false);
  const [problems, setProblems] = useState([]);
  const data = status.data;
  const hidden = Array.isArray(data?.hiddenWeekIds) ? data.hiddenWeekIds.length : 0;
  const blocking = problems.length ? problems : Array.isArray(data?.blocking) ? data.blocking : [];

  const publish = async (publishWeeks) => {
    setSending(true);
    try {
      await apiFetch(`/courses/${courseId}/open-course`, { method: "POST", json: { publishWeeks } });
      showToast(t("status.published"), "success");
      onDone();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && Array.isArray(err.body?.blocking)) setProblems(err.body.blocking);
      else showToast(err?.body?.message || t("status.publishFailed"), "error");
      setSending(false);
    }
  };

  if (!data) return null;
  if (blocking.length > 0) {
    return (
      <Modal title={t("status.missingTitle")} onClose={onClose}>
        <p className="text-ui text-fg-muted mb-3">{t("status.missingText")}</p>
        <ul className="space-y-2">
          {blocking.map((b) => (
            <li key={b.id} className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2 text-ui text-fg">
              <span>{blockingText(b)}</span>
              {b.href ? <Link href={b.href} onClick={onClose} className="shrink-0 text-caption font-semibold text-brand-fg hover:underline">{t("status.fix")} &rarr;</Link> : null}
            </li>
          ))}
        </ul>
      </Modal>
    );
  }
  return (
    <Modal title={t("status.publishTitle")} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-ui text-fg-muted">{t("status.publishText")}</p>
        <p className="text-caption text-fg-subtle">{course?.visibility === "public" ? t("status.joinPublic") : t("status.joinPrivate")}</p>
        {hidden > 0 ? <p className="text-ui text-fg">{tf(hidden === 1 ? "status.weeksAskOne" : "status.weeksAskMany", { n: hidden })}</p> : null}
        <div className="flex flex-col gap-2 pt-1">
          {hidden > 0 ? (
            <>
              <Button type="button" onClick={() => publish(true)} disabled={sending}>{tf(hidden === 1 ? "status.publishWithWeekOne" : "status.publishWithWeeksMany", { n: hidden })}</Button>
              <Button type="button" variant="outline" onClick={() => publish(false)} disabled={sending}>{t("status.publishOnly")}</Button>
            </>
          ) : (
            <Button type="button" onClick={() => publish(false)} disabled={sending}>{t("status.publish")}</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
