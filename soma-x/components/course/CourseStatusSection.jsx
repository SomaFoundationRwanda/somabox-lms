"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { Section } from "@/components/layout";
import { useToast } from "@/context/ToastContext";
import { useCourseText } from "@/components/course/useCourseText";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

// Settings (teachers): what the course's status means, and deleting it. Publishing, ending and
// archiving are in the status bar at the top of every course page. Delete only works while no
// learner has work in the course (the server says so otherwise).


export default function CourseStatusSection({ courseId, course, refresh }) {
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { t, tf } = useCourseText();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const lifecycle = course?.lifecycle || "draft";

  const remove = async () => {
    if (!window.confirm(tf("settings.status.confirm.delete", { title: course?.title || "" }))) return;
    setBusy("delete");
    setError("");
    try {
      await apiFetch(`/courses/${courseId}`, { method: "DELETE" }).catch((err) => {
        throw new Error(err?.code === "HAS_LEARNER_WORK" ? t("settings.status.hasWork") : err?.body?.message || t("settings.status.failed"));
      });
      showToast(t("settings.status.deleted"), "success");
      queryClient.removeQueries({ queryKey: queryKeys.course(courseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.courses });
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
          <button
            type="button"
            onClick={remove}
            disabled={!!busy}
            className="inline-flex items-center gap-1.5 text-caption font-semibold text-danger-fg border border-danger/30 hover:bg-danger-soft disabled:opacity-50 rounded-lg px-3 py-2"
          >
            {busy === "delete" ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
            {t("settings.status.action.delete")}
          </button>
        </div>
        {error ? <p role="alert" className="text-caption font-semibold text-danger-fg">{error}</p> : null}
      </div>
    </Section>
  );
}
