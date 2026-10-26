"use client";

import { useState } from "react";
import Link from "next/link";
import { X, Target } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import ScheduleFields, { initialScheduleValues, scheduleError, schedulePayload } from "./ScheduleFields";
import { useCourseText } from "@/components/course/useCourseText";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Checkbox, TextInput, Textarea } from "@/components/form";

// initialDays: the module item's { release_day, due_day, close_day } when editing.
// moduleStartDate: the module's first day ('YYYY-MM-DD'), for previewing dates.
// initialOutcomeIds: the outcomes the assignment is tagged with when editing.
export default function AssignmentEditorModal({ open, onClose, onSave, initialData, initialDays, moduleStartDate, initialOutcomeIds = [] }) {
  const { SERVER_URL, courseId } = useCourse();
  const isEdit = Boolean(initialData?.id);
  const { t } = useCourseText();
  // Tagging happens here so a new assignment can be published right away (untagged graded
  // work is saved unpublished).
  const outcomesQuery = useQuery({
    queryKey: queryKeys.courseSection(courseId, "outcomes"),
    queryFn: () => apiFetch(`/courses/${courseId}/outcomes`),
    enabled: !!open && !!SERVER_URL && !!courseId,
  });
  // null while loading; [] when there are none (or they couldn't be loaded).
  const outcomes = outcomesQuery.isPending ? null : Array.isArray(outcomesQuery.data) ? outcomesQuery.data : [];
  const [outcomeIds, setOutcomeIds] = useState(() => initialOutcomeIds.map(Number));
  const toggleOutcome = (id) => setOutcomeIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [schedule, setSchedule] = useState(() => initialScheduleValues(initialDays));
  const [pointsPossible, setPointsPossible] = useState(initialData?.points_possible ?? 100);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || scheduleError(schedule)) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description,
        ...schedulePayload(schedule),
        pointsPossible: Number(pointsPossible) || 100,
        outcomeIds,
      });
      onClose();
    } catch {
      // Save failed: the parent already reported the error; keep the editor open.
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-auto py-8">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl mx-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">
            {isEdit ? t("editors.editAssignment") : t("editors.newAssignment")}
          </h2>
          <button aria-label={t("common.close")} onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t("editors.assignmentTitle")} *</label>
            <TextInput aria-label={t("editors.assignmentTitle")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("editors.assignmentTitlePlaceholder")} className="w-full" />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t("editors.instructions")}</label>
            <Textarea aria-label={t("editors.instructions")} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={t("editors.instructionsPlaceholder")} className="w-full resize-none" />
          </div>

          {/* Relative timing */}
          <ScheduleFields values={schedule} onChange={setSchedule} moduleStartDate={moduleStartDate} />

          <div className="max-w-[10rem]">
            <label htmlFor="assignment-points" className="block text-[11px] font-bold text-slate-700 mb-1">{t("editors.pointsPossible")}</label>
            <TextInput size="sm" id="assignment-points" type="number" min="0" value={pointsPossible} onChange={(e) => setPointsPossible(e.target.value)} className="w-full" />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
              <Target className="w-3.5 h-3.5 text-[var(--brand-secondary)]" aria-hidden="true" /> {t("editors.assignmentOutcomes")} *
            </legend>
            {outcomes === null ? null : outcomes.length === 0 ? (
              <p className="text-xs text-amber-800">
                {t("editors.noOutcomesYet")}{" "}
                <Link href={`/course/${courseId}/outcomes`} className="font-semibold underline">{t("editors.addOutcomesLink")}</Link>
              </p>
            ) : (
              <>
                <div className="max-h-40 overflow-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {outcomes.map((o) => (
                    <label key={o.id} className="flex items-start gap-2 px-3 py-2 text-xs text-slate-700 cursor-pointer hover:bg-slate-50">
                      <Checkbox checked={outcomeIds.includes(Number(o.id))} onCheckedChange={() => toggleOutcome(Number(o.id))} className="mt-0.5" />
                      <span>{o.code ? <span className="font-bold text-[var(--brand-secondary)] mr-1">{o.code}</span> : null}{o.title}</span>
                    </label>
                  ))}
                </div>
                {outcomeIds.length === 0 ? <p className="text-[11px] text-amber-800">{t("editors.assignmentOutcomesHelp")}</p> : null}
              </>
            )}
          </fieldset>

          {/* Rubrics are built on the assignment's page (criteria linked to outcomes); this
              editor used to offer a free-text "rubric draft" that was never saved. */}
          <p className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{t("editors.assignmentRubric")}:</span> {t("editors.rubricLater")}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="text-xs font-semibold text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-50">
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || Boolean(scheduleError(schedule))}
            className="text-xs font-semibold text-white bg-[var(--brand-secondary)] hover:bg-[var(--brand-secondary-dark)] disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
          >
            {saving ? t("common.saving") : isEdit ? t("editors.saveChanges") : t("editors.createAssignment")}
          </button>
        </div>
      </div>
    </div>
  );
}
