"use client";

import EditorFrame from "./EditorFrame";
import { useRef, useState } from "react";
import { useFormDraft } from "@/lib/drafts";
import useUnsavedChanges from "@/lib/useUnsavedChanges";
import DraftBanner from "@/components/ui/DraftBanner";
import { Plus, Trash2, Check } from "lucide-react";
import InfoTooltip from "@/components/ui/InfoTooltip";
import { useCourse } from "@/context/CourseContext";
import Explainer from "@/components/help/Explainer";
import ScheduleFields, { initialScheduleValues, scheduleError, schedulePayload } from "./ScheduleFields";
import { useCourseText } from "@/components/course/useCourseText";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Label, Select, TextInput, Textarea } from "@/components/form";
import GradingFields from "./GradingFields";

function QuestionBuilder({ question, index, onChange, onRemove, outcomes }) {
  const { t, tf } = useCourseText();
  const n = index + 1;
  const updateField = (field, value) => onChange(index, { ...question, [field]: value });
  // Several fields at once: separate updateField calls would each start from the same stale
  // question and the last one would overwrite the others.
  const updateFields = (fields) => onChange(index, { ...question, ...fields });
  const options = Array.isArray(question.options) ? question.options : [];

  const addOption = () => updateField("options", [...options, { text: "", id: `opt_${Date.now()}` }]);
  const removeOption = (optIdx) => {
    const next = options.filter((_, i) => i !== optIdx);
    const clearsCorrect = question.correctOption === options[optIdx]?.id;
    updateFields(clearsCorrect ? { options: next, correctOption: null } : { options: next });
  };
  const updateOptionText = (optIdx, text) => {
    const next = options.map((o, i) => i === optIdx ? { ...o, text } : o);
    updateField("options", next);
  };

  return (
    <div className="border border-line rounded-xl p-4 bg-surface-sunken/50 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-caption font-bold text-fg-subtle">{tf("editors.quiz.questionN", { n })}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onRemove(index)} aria-label={tf("editors.quiz.removeQuestionN", { n })} title={t("editors.quiz.removeQuestion")} className="p-1 rounded hover:bg-danger-soft text-danger-fg hover:text-danger-fg">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <TextInput value={question.prompt || ""} onChange={(e) => updateField("prompt", e.target.value)} placeholder={t("editors.quiz.promptPlaceholder")} aria-label={tf("editors.quiz.promptN", { n })} className="w-full" />

      <div className="flex flex-wrap items-center gap-3">
        <Select size="sm" aria-label={tf("editors.quiz.typeN", { n })} value={question.questionType || "multiple_choice"} onChange={(e) => updateField("questionType", e.target.value)} >
          <option value="multiple_choice">{t("editors.quiz.multipleChoice")}</option>
          <option value="open">{t("editors.quiz.openEnded")}</option>
        </Select>
        <div className="flex items-center gap-1.5">
          <Label htmlFor={`q-${index}-points`}>{t("editors.quiz.points")}</Label>
          <TextInput size="sm" id={`q-${index}-points`} type="number" min="1" value={question.points || 1} onChange={(e) => updateField("points", Number(e.target.value) || 1)} className="w-16" />
        </div>
        <div className="flex items-center gap-1.5 min-w-0 flex-1 basis-48">
          <Label htmlFor={`q-${index}-outcome`}>{t("editors.quiz.outcome")}</Label>
          <Select size="sm" id={`q-${index}-outcome`} value={question.outcomeId ? String(question.outcomeId) : ""} onChange={(e) => updateField("outcomeId", outcomes.find((o) => String(o.id) === e.target.value)?.id ?? null)} className="min-w-0 flex-1" >
            <option value="">{t("editors.quiz.noOutcome")}</option>
            {outcomes.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.code ? `${o.code}: ` : ""}{o.title}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {question.questionType !== "open" && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-1">
            <p className="text-caption font-bold text-fg-subtle">{t("editors.quiz.options")}</p>
            <InfoTooltip text={t("editors.quiz.optionsHelp")} />
          </div>
          {options.map((opt, optIdx) => (
            <div key={opt.id || optIdx} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateField("correctOption", opt.id || String(optIdx))}
                aria-pressed={question.correctOption === (opt.id || String(optIdx))}
                aria-label={tf("editors.quiz.markCorrect", { n: optIdx + 1 })}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  question.correctOption === (opt.id || String(optIdx))
                    ? "border-success bg-success text-on-success"
                    : "border-line-strong text-transparent hover:border-success/30"
                }`}
              >
                <Check className="w-3 h-3" />
              </button>
              <TextInput size="sm" value={opt.text || ""} onChange={(e) => updateOptionText(optIdx, e.target.value)} placeholder={tf("editors.quiz.optionN", { n: optIdx + 1 })} aria-label={tf("editors.quiz.questionOption", { q: n, n: optIdx + 1 })} className="flex-1" />
              <button type="button" onClick={() => removeOption(optIdx)} aria-label={tf("editors.quiz.removeOptionN", { n: optIdx + 1 })} title={t("editors.quiz.removeOption")} className="p-1 text-fg-subtle hover:text-danger-fg">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1 text-caption font-semibold text-brand-fg hover:underline mt-1"
          >
            <Plus className="w-3 h-3" /> {t("editors.quiz.addOption")}
          </button>
        </div>
      )}
    </div>
  );
}

// initialDays: the module item's { release_day, due_day, close_day } when editing.
// moduleStartDate: the module's first day ('YYYY-MM-DD'), for previewing dates.
export default function QuizEditorModal({ asPage = false, open, onClose, onSave, initialData, initialDays, moduleStartDate }) {
  const { SERVER_URL, courseId } = useCourse();
  const isEdit = Boolean(initialData?.id);
  const { t, tf } = useCourseText();
  // The course's outcomes (the same kept list as the Outcomes page); if they can't be loaded the
  // select just offers "No outcome".
  const outcomesQuery = useQuery({
    queryKey: queryKeys.courseSection(courseId, "outcomes"),
    queryFn: () => apiFetch(`/courses/${courseId}/outcomes`),
    enabled: !!open && !!SERVER_URL && !!courseId,
  });
  const outcomes = Array.isArray(outcomesQuery.data) ? outcomesQuery.data : [];
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [schedule, setSchedule] = useState(() => initialScheduleValues(initialDays));
  const [kind, setKind] = useState(initialData?.kind || "graded");
  const [category, setCategory] = useState(initialData?.category || "");
  const [scoresHidden, setScoresHidden] = useState(Boolean(initialData?.scores_hidden));
  // Only graded quizzes count in Grades, so only they need a type.
  const needsCategory = kind === "graded" && !category;
  const [attemptsAllowed, setAttemptsAllowed] = useState(
    initialData?.attempts_allowed === null || initialData?.attempts_allowed === undefined
      ? ""
      : String(initialData.attempts_allowed)
  );
  const [questions, setQuestions] = useState(
    Array.isArray(initialData?.questions)
      ? initialData.questions.map((q) => ({
          prompt: q.prompt,
          questionType: q.question_type || q.questionType || "multiple_choice",
          options: typeof q.options === "string" ? JSON.parse(q.options || "[]") : (q.options || []),
          correctOption: q.correct_option || q.correctOption || null,
          points: q.points || 1,
          outcomeId: q.outcome_id ?? q.outcomeId ?? null,
        }))
      : []
  );
  const [saving, setSaving] = useState(false);

  const addQuestion = () => setQuestions((prev) => [
    ...prev,
    { prompt: "", questionType: "multiple_choice", options: [{ text: "", id: `opt_${Date.now()}_a` }, { text: "", id: `opt_${Date.now()}_b` }], correctOption: null, points: 1, outcomeId: null },
  ]);

  const updateQuestion = (index, updated) => setQuestions((prev) => prev.map((q, i) => i === index ? updated : q));
  const removeQuestion = (index) => setQuestions((prev) => prev.filter((_, i) => i !== index));

  // Unsaved changes: kept as a draft on this device, and asked about before leaving.
  const values = { title, description, schedule, kind, attemptsAllowed, questions, category, scoresHidden };
  const initialValues = useRef(JSON.stringify(values));
  const dirty = JSON.stringify(values) !== initialValues.current;
  const draft = useFormDraft(`editor:${courseId}:quiz:${initialData?.id ?? "new"}`, values, dirty);
  const restoreDraft = () => {
    const v = draft.restore();
    if (!v) return;
    setTitle(v.title ?? ""); setDescription(v.description ?? ""); setSchedule(v.schedule ?? schedule); setKind(v.kind || "graded");
    setAttemptsAllowed(v.attemptsAllowed ?? ""); setQuestions(Array.isArray(v.questions) ? v.questions : []);
    setCategory(v.category ?? ""); setScoresHidden(!!v.scoresHidden);
  };

  const handleSave = async () => {
    if (!title.trim() || needsCategory || scheduleError(schedule)) return false;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description,
        ...schedulePayload(schedule),
        kind,
        ...(kind === "graded" ? { category, scoresHidden } : {}),
        attemptsAllowed: attemptsAllowed === "" ? null : Math.max(1, Number(attemptsAllowed) || 1),
        questions,
      });
      draft.clear();
      initialValues.current = JSON.stringify(values);
      onClose();
      return true;
    } catch {
      // Save failed: the parent already reported the error; keep the editor open.
      return false;
    } finally {
      setSaving(false);
    }
  };
  const { confirmLeave, dialog } = useUnsavedChanges({ dirty, onSave: handleSave });
  const close = () => confirmLeave(() => { draft.clear(); onClose(); });

  if (!open && !asPage) return null;

  return (
    <>
    <EditorFrame asPage={asPage} title={isEdit ? t("editors.quiz.edit") : t("editors.quiz.new")} onClose={close} maxWidth="max-w-2xl">

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <DraftBanner draft={draft.saved} onRestore={restoreDraft} onDiscard={draft.discard} />
          <div>
            <Label>{t("editors.quiz.title")} *</Label>
            <TextInput aria-label={t("editors.quiz.title")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("editors.quiz.title")} className="w-full" />
          </div>

          <div>
            <Label>{t("editors.quiz.descriptionOptional")}</Label>
            <Textarea aria-label={t("editors.quiz.descriptionOptional")} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={t("editors.quiz.descriptionPlaceholder")} className="w-full" />
          </div>

          {/* Quiz type & attempts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Label>{t("editors.quiz.type")}</Label>
                <Explainer k={`quizKinds.${kind}`} variant="icon" />
              </div>
              <Select aria-label={t("editors.quiz.type")} value={kind} onChange={(e) => setKind(e.target.value)} className="w-full" >
                <option value="graded">{t("quizKinds.graded")}</option>
                <option value="practice">{t("quizKinds.practice")}</option>
                <option value="baseline">{t("quizKinds.baseline")}</option>
              </Select>
              {kind === "baseline" ? (
                <span className="block text-caption text-warning-fg">{t("editors.quiz.baselineRule")}</span>
              ) : kind !== "practice" ? (
                <span className="text-caption text-fg-subtle">{t("editors.quiz.needsOutcome")}</span>
              ) : null}
            </div>
            <div>
              <Label>{t("editors.quiz.attempts")}</Label>
              <TextInput aria-label={t("editors.quiz.attempts")} type="number" min="1" value={attemptsAllowed} onChange={(e) => setAttemptsAllowed(e.target.value)} placeholder={t("editors.quiz.unlimited")} className="w-full" />
              <span className="text-caption text-fg-subtle">{t("editors.quiz.unlimitedHelp")}</span>
            </div>
          </div>

          {kind === "graded" ? (
            <GradingFields id="quiz" category={category} onCategory={setCategory} scoresHidden={scoresHidden} onScoresHidden={setScoresHidden} />
          ) : null}

          {/* Relative timing */}
          <ScheduleFields values={schedule} onChange={setSchedule} moduleStartDate={moduleStartDate} />

          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <Label>{tf("editors.quiz.questionsCount", { n: questions.length })}</Label>
              <button type="button" onClick={addQuestion} className="flex items-center gap-1 text-caption font-semibold text-on-brand bg-brand rounded-lg px-3 py-1.5">
                <Plus className="w-3.5 h-3.5" /> {t("editors.quiz.addQuestion")}
              </button>
            </div>
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <QuestionBuilder key={idx} question={q} index={idx} onChange={updateQuestion} onRemove={removeQuestion} outcomes={outcomes} />
              ))}
              {questions.length === 0 && (
                <p className="text-caption text-fg-subtle text-center py-6">{t("editors.quiz.noQuestions")}</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
          <button onClick={close} className="text-caption font-semibold text-fg-muted hover:text-fg px-4 py-2 rounded-lg hover:bg-surface-hover">
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || needsCategory || Boolean(scheduleError(schedule))}
            className="text-caption font-semibold text-on-brand bg-brand hover:bg-brand/90 disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
          >
            {saving ? t("common.saving") : isEdit ? t("editors.saveChanges") : t("editors.quiz.create")}
          </button>
        </div>
    </EditorFrame>
    {dialog}
    </>
  );
}
