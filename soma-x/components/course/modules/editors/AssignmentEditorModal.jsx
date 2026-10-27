"use client";

import EditorFrame from "./EditorFrame";
import { useState } from "react";
import Link from "next/link";
import { Target } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import ScheduleFields, { initialScheduleValues, scheduleError, schedulePayload } from "./ScheduleFields";
import { useCourseText } from "@/components/course/useCourseText";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { CheckboxList, Fieldset, Label, TextInput, Textarea } from "@/components/form";

// initialDays: the module item's { release_day, due_day, close_day } when editing.
// moduleStartDate: the module's first day ('YYYY-MM-DD'), for previewing dates.
// initialOutcomeIds: the outcomes the assignment is tagged with when editing.
export default function AssignmentEditorModal({ asPage = false, open, onClose, onSave, initialData, initialDays, moduleStartDate, initialOutcomeIds = [] }) {
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

  if (!open && !asPage) return null;

  return (
    <EditorFrame asPage={asPage} title={isEdit ? t("editors.editAssignment") : t("editors.newAssignment")} onClose={onClose} maxWidth="max-w-xl">

        <div className="px-6 py-4 space-y-4">
          <div>
            <Label>{t("editors.assignmentTitle")} *</Label>
            <TextInput aria-label={t("editors.assignmentTitle")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("editors.assignmentTitlePlaceholder")} className="w-full" />
          </div>

          <div>
            <Label>{t("editors.instructions")}</Label>
            <Textarea aria-label={t("editors.instructions")} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={t("editors.instructionsPlaceholder")} className="w-full" />
          </div>

          {/* Relative timing */}
          <ScheduleFields values={schedule} onChange={setSchedule} moduleStartDate={moduleStartDate} />

          <div className="max-w-[10rem]">
            <Label htmlFor="assignment-points">{t("editors.pointsPossible")}</Label>
            <TextInput size="sm" id="assignment-points" type="number" min="0" value={pointsPossible} onChange={(e) => setPointsPossible(e.target.value)} className="w-full" />
          </div>

          <Fieldset legend={<><Target className="w-3.5 h-3.5 text-brand-fg" aria-hidden="true" /> {t("editors.assignmentOutcomes")}</>} required>
            {outcomes === null ? null : outcomes.length === 0 ? (
              <p className="text-caption text-warning-fg">
                {t("editors.noOutcomesYet")}{" "}
                <Link href={`/course/${courseId}/outcomes`} className="font-semibold underline">{t("editors.addOutcomesLink")}</Link>
              </p>
            ) : (
              <>
                <CheckboxList
                  items={outcomes.map((o) => ({ value: Number(o.id), label: o.code ? `${o.code} ${o.title}` : o.title }))}
                  selected={outcomeIds}
                  onChange={setOutcomeIds}
                />
                {outcomeIds.length === 0 ? <p className="text-caption text-warning-fg">{t("editors.assignmentOutcomesHelp")}</p> : null}
              </>
            )}
          </Fieldset>

          {/* Rubrics are built on the assignment's page (criteria linked to outcomes); this
              editor used to offer a free-text "rubric draft" that was never saved. */}
          <p className="text-caption text-fg-subtle">
            <span className="font-semibold text-fg-muted">{t("editors.assignmentRubric")}:</span> {t("editors.rubricLater")}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
          <button onClick={onClose} className="text-caption font-semibold text-fg-muted hover:text-fg px-4 py-2 rounded-lg hover:bg-surface-hover">
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || Boolean(scheduleError(schedule))}
            className="text-caption font-semibold text-on-brand bg-brand hover:bg-brand/90 disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
          >
            {saving ? t("common.saving") : isEdit ? t("editors.saveChanges") : t("editors.createAssignment")}
          </button>
        </div>
    </EditorFrame>
  );
}
