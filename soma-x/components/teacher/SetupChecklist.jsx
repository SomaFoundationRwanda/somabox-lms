"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, ChevronRight, ListChecks, Rocket, Settings } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import Explainer from "@/components/help/Explainer";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import useSetupText from "@/lib/useSetupText";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { CheckboxField } from "@/components/form";

/** True when a teacher still has something to look at: a draft course, an unfinished checklist item, or warnings. */
export function setupNeedsAttention(status) {
  if (!status || !Array.isArray(status.checklist)) return false;
  if (!status.isOpened) return true;
  return status.checklist.some((c) => !c.done) || (status.warnings || []).length > 0;
}

/**
 * Teacher "Course setup" section (flat, not a card): checklist, warnings and (for drafts) the Open course button.
 * status: the teacher shape of GET /courses/:id/setup-status. onChanged: called after the course opens.
 */
export default function SetupChecklist({ courseId, status, onChanged, showSettingsLink = true }) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { checklistLabel, blockingText, warningText } = useSetupText();
  const [opening, setOpening] = useState(false);
  const [openErrors, setOpenErrors] = useState([]);
  // Opening doesn't publish anything by itself: offer to publish the hidden weeks with content.
  const [publishWeeks, setPublishWeeks] = useState(true);

  if (!status || !Array.isArray(status.checklist)) return null;

  const checklist = status.checklist;
  const warnings = Array.isArray(status.warnings) ? status.warnings : [];
  const isDraft = !status.isOpened;
  const doneCount = checklist.filter((c) => c.done).length;
  const hiddenWeeks = Array.isArray(status.hiddenWeekIds) ? status.hiddenWeekIds.length : 0;

  const openCourse = async () => {
    setOpening(true);
    setOpenErrors([]);
    try {
      await apiFetch(`/courses/${courseId}/open-course`, { method: "POST", json: { publishWeeks: hiddenWeeks > 0 && publishWeeks } });
      showToast(t("teacher.setup.opened"), "success");
      // Opening changes the whole course (status, published weeks) and the course lists.
      queryClient.invalidateQueries({ queryKey: queryKeys.courses });
      onChanged?.();
    } catch (err) {
      if (err instanceof ApiError && err.status !== 0) {
        const payload = err.body;
        const blocking = Array.isArray(payload?.blocking) ? payload.blocking.map(blockingText).filter(Boolean) : [];
        setOpenErrors(blocking.length > 0 ? blocking : [payload?.message || t("teacher.setup.cantOpenYet")]);
        return;
      }
      setOpenErrors([t("teacher.setup.openFailed")]);
    } finally {
      setOpening(false);
    }
  };

  return (
    <section aria-labelledby="setup-checklist-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="setup-checklist-title" className="text-ui font-bold text-fg inline-flex items-center gap-2">{t("teacher.setup.title")} <Explainer k="pages.setup" variant="icon" /></h2>
          <p className="text-caption text-fg-subtle mt-0.5">
            {isDraft ? t("teacher.setup.draftNote") : t("teacher.setup.openNote")}
            {" "}{fill(t("teacher.setup.doneCount"), { done: doneCount, total: checklist.length })}
          </p>
        </div>
        {isDraft && (
          <span className="text-caption font-bold text-warning-fg bg-warning-soft px-2.5 py-1 rounded-full">{t("teacher.setup.draft")}</span>
        )}
      </div>

      <ul aria-label={t("teacher.setup.checklist")} className="divide-y divide-line border border-line rounded-xl">
        {checklist.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href || "#"}
              className="flex items-center gap-3 px-3 py-2.5 min-h-[44px] hover:bg-surface-hover transition-colors"
            >
              {item.done ? (
                <CheckCircle2 className="w-4 h-4 text-brand-fg shrink-0" aria-hidden="true" />
              ) : (
                <Circle className="w-4 h-4 text-fg-subtle shrink-0" aria-hidden="true" />
              )}
              <span className={`flex-1 min-w-0 text-ui ${item.done ? "text-fg-subtle" : "text-fg font-medium"}`}>
                <span className="sr-only">{item.done ? t("teacher.setup.srDone") : t("teacher.setup.srNotDone")}{" "}</span>
                {checklistLabel(item)}
              </span>
              {item.blocking && !item.done && (
                <span className="text-caption font-bold text-danger-fg bg-danger-soft border border-danger/30 px-2 py-0.5 rounded-full shrink-0">{t("teacher.setup.required")}</span>
              )}
              <ChevronRight className="w-4 h-4 text-fg-subtle shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>

      {warnings.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-caption font-bold text-warning-fg flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> {t("teacher.setup.worthChecking")}
          </h3>
          <ul className="divide-y divide-warning/30 border border-warning/30 rounded-xl overflow-hidden">
            {warnings.map((w) => (
              <li key={w.id} className="px-3 py-2.5 bg-warning-soft/60 flex flex-wrap items-center justify-between gap-2">
                <p className="text-caption font-medium text-warning-fg flex-1 min-w-[12rem]">{warningText(w)}</p>
                {w.href && (
                  <Link href={w.href} className="text-caption font-bold text-warning-fg hover:underline shrink-0">
                    {t("teacher.setup.fix")} &rarr;
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {openErrors.length > 0 && (
        <div role="alert" className="p-3 bg-danger-soft border border-danger/30 rounded-xl text-caption text-danger-fg space-y-1">
          <p className="font-bold">{t("teacher.setup.cantOpenTitle")}</p>
          <ul className="list-disc list-inside space-y-0.5">
            {openErrors.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {showSettingsLink ? (
          <div className="flex flex-wrap items-center gap-3">
            {isDraft && (
              <Link
                href={`/course/${courseId}/settings#guided-setup`}
                className="inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg bg-brand-soft border border-brand/40 hover:bg-brand-soft px-3 py-2 rounded-lg transition-colors"
              >
                <ListChecks className="w-3.5 h-3.5" aria-hidden="true" /> {t("teacher.wizard.guided")}
              </Link>
            )}
            <Link
              href={`/course/${courseId}/settings#course-setup`}
              className="inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg hover:underline"
            >
              <Settings className="w-3.5 h-3.5" aria-hidden="true" /> {t("teacher.setup.inSettings")}
            </Link>
          </div>
        ) : <span />}
        {isDraft && (
          <div className="flex flex-col items-end gap-1">
            {hiddenWeeks > 0 && (
              <CheckboxField
                label={fill(t("teacher.setup.publishWeeksToo"), { n: hiddenWeeks })}
                checked={publishWeeks}
                onCheckedChange={setPublishWeeks}
              />
            )}
            <button
              type="button"
              onClick={openCourse}
              disabled={!status.canOpen || opening}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand hover:bg-brand/90 text-on-brand rounded-xl text-ui font-bold transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Rocket className="w-4 h-4" aria-hidden="true" /> {opening ? t("teacher.setup.opening") : t("teacher.setup.openCourse")}
            </button>
            {!status.canOpen && (
              <span className="text-caption text-fg-subtle">{t("teacher.setup.finishRequired")}</span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
