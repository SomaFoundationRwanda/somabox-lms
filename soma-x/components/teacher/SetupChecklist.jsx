"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Circle, ChevronRight, ListChecks, Settings } from "lucide-react";
import Explainer from "@/components/help/Explainer";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import useSetupText from "@/lib/useSetupText";

/** True when a teacher still has something to look at: a draft course, an unfinished checklist item, or warnings. */
export function setupNeedsAttention(status) {
  if (!status || !Array.isArray(status.checklist)) return false;
  if (!status.isOpened) return true;
  return status.checklist.some((c) => !c.done) || (status.warnings || []).length > 0;
}

/**
 * Teacher "Course setup" section (flat, not a card): checklist and warnings. Publishing is in the
 * status bar at the top of every course page. status: the teacher shape of GET /courses/:id/setup-status.
 */
export default function SetupChecklist({ courseId, status, onChanged, showSettingsLink = true }) {
  const { t } = useLanguage();
  const { checklistLabel, warningText } = useSetupText();

  if (!status || !Array.isArray(status.checklist)) return null;

  const checklist = status.checklist;
  const warnings = Array.isArray(status.warnings) ? status.warnings : [];
  const isDraft = !status.isOpened;
  const doneCount = checklist.filter((c) => c.done).length;

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

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {showSettingsLink ? (
          <div className="flex flex-wrap items-center gap-3">
            {isDraft && (
              <Link
                href={`/course/${courseId}/setup`}
                className="inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg bg-brand-soft border border-brand/40 hover:bg-brand-soft px-3 py-2 rounded-lg transition-colors"
              >
                <ListChecks className="w-3.5 h-3.5" aria-hidden="true" /> {t("course.setup.open")}
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
        {/* Publishing lives in the course's status bar, at the top of every page. */}
      </div>
    </section>
  );
}
