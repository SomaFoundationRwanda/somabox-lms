"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, Lock, RotateCcw, Trash2 } from "lucide-react";
import { Section } from "@/components/layout";
import { useToast } from "@/context/ToastContext";
import { useCourseText } from "@/components/course/useCourseText";

// Settings (teachers): end a course. Closed: learners keep reading and see their grades but can't
// hand in. Archived: gone from learners' course lists, results kept. Delete only works while no
// learner has work in the course (the server says so otherwise).

// The moves the server allows from each state (PATCH lifecycle); drafts open through setup.
const MOVES = {
  open: ["closed", "archived"],
  closed: ["open", "archived"],
  archived: ["closed"],
};
const ICONS = { open: RotateCcw, closed: Lock, archived: Archive };

export default function CourseStatusSection({ SERVER_URL, courseId, course, refresh }) {
  const router = useRouter();
  const { showToast } = useToast();
  const { t, tf } = useCourseText();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const lifecycle = course?.lifecycle || "draft";

  const move = async (to) => {
    if (!window.confirm(t(`settings.status.confirm.${to}`))) return;
    setBusy(to);
    setError("");
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lifecycle: to }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || t("settings.status.failed"));
      showToast(t(`settings.status.done.${to}`), "success");
      refresh();
    } catch (err) {
      setError(err.message || t("settings.status.failed"));
    } finally {
      setBusy("");
    }
  };

  const remove = async () => {
    if (!window.confirm(tf("settings.status.confirm.delete", { title: course?.title || "" }))) return;
    setBusy("delete");
    setError("");
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}`, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.code === "HAS_LEARNER_WORK" ? t("settings.status.hasWork") : payload.message || t("settings.status.failed"));
      }
      showToast(t("settings.status.deleted"), "success");
      router.push("/teacher/courses");
    } catch (err) {
      setError(err.message || t("settings.status.failed"));
      setBusy("");
    }
  };

  return (
    <Section divided title={t("settings.status.title")} description={t(`settings.status.now.${lifecycle}`)}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(MOVES[lifecycle] || []).map((to) => {
            const Icon = ICONS[to];
            return (
              <button
                key={to}
                type="button"
                onClick={() => move(to)}
                disabled={!!busy}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 rounded-lg px-3 py-2"
              >
                {busy === to ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Icon className="w-3.5 h-3.5" aria-hidden="true" />}
                {t(`settings.status.action.${to}`)}
              </button>
            );
          })}
          <button
            type="button"
            onClick={remove}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700 border border-rose-200 hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-950/30 disabled:opacity-50 rounded-lg px-3 py-2"
          >
            {busy === "delete" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
            {t("settings.status.action.delete")}
          </button>
        </div>
        {error ? <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p> : null}
      </div>
    </Section>
  );
}
