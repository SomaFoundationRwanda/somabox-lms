"use client";

import { useEffect, useState } from "react";
import { X, Plus, Trash2, Check } from "lucide-react";
import InfoTooltip from "@/components/ui/InfoTooltip";
import { useCourse } from "@/context/CourseContext";
import Explainer from "@/components/help/Explainer";
import ScheduleFields, { initialScheduleValues, scheduleError, schedulePayload } from "./ScheduleFields";

function QuestionBuilder({ question, index, onChange, onRemove, outcomes }) {
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
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase text-slate-400">Question {index + 1}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => onRemove(index)} aria-label={`Remove question ${index + 1}`} title="Remove question" className="p-1 rounded hover:bg-rose-50 text-rose-400 hover:text-rose-600">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <input
        value={question.prompt || ""}
        onChange={(e) => updateField("prompt", e.target.value)}
        placeholder="Question prompt..."
        aria-label={`Question ${index + 1} prompt`}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] bg-white"
      />

      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label={`Question ${index + 1} type`}
          value={question.questionType || "multiple_choice"}
          onChange={(e) => updateField("questionType", e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="multiple_choice">Multiple Choice</option>
          <option value="open">Open Ended</option>
        </select>
        <div className="flex items-center gap-1.5">
          <label htmlFor={`q-${index}-points`} className="text-xs text-slate-500">Points:</label>
          <input
            id={`q-${index}-points`}
            type="number"
            min="1"
            value={question.points || 1}
            onChange={(e) => updateField("points", Number(e.target.value) || 1)}
            className="w-16 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
          />
        </div>
        <div className="flex items-center gap-1.5 min-w-0 flex-1 basis-48">
          <label htmlFor={`q-${index}-outcome`} className="text-xs text-slate-500 shrink-0">Outcome:</label>
          <select
            id={`q-${index}-outcome`}
            value={question.outcomeId ? String(question.outcomeId) : ""}
            onChange={(e) => updateField("outcomeId", outcomes.find((o) => String(o.id) === e.target.value)?.id ?? null)}
            className="min-w-0 flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="">No outcome</option>
            {outcomes.map((o) => (
              <option key={o.id} value={String(o.id)}>
                {o.code ? `${o.code}: ` : ""}{o.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {question.questionType !== "open" && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-1">
            <p className="text-[10px] font-bold uppercase text-slate-400">Options (click ✓ to mark correct)</p>
            <InfoTooltip text="Click the circle beside a choice to mark it as correct." />
          </div>
          {options.map((opt, optIdx) => (
            <div key={opt.id || optIdx} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateField("correctOption", opt.id || String(optIdx))}
                aria-pressed={question.correctOption === (opt.id || String(optIdx))}
                aria-label={`Mark option ${optIdx + 1} as correct`}
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  question.correctOption === (opt.id || String(optIdx))
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-slate-300 text-transparent hover:border-emerald-300"
                }`}
              >
                <Check className="w-3 h-3" />
              </button>
              <input
                value={opt.text || ""}
                onChange={(e) => updateOptionText(optIdx, e.target.value)}
                placeholder={`Option ${optIdx + 1}`}
                aria-label={`Question ${index + 1}, option ${optIdx + 1}`}
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#0D9488] bg-white"
              />
              <button type="button" onClick={() => removeOption(optIdx)} aria-label={`Remove option ${optIdx + 1}`} title="Remove option" className="p-1 text-slate-300 hover:text-rose-500">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addOption}
            className="flex items-center gap-1 text-xs font-semibold text-[#0D9488] hover:underline mt-1"
          >
            <Plus className="w-3 h-3" /> Add Option
          </button>
        </div>
      )}
    </div>
  );
}

// initialDays: the module item's { release_day, due_day, close_day } when editing.
// moduleStartDate: the module's first day ('YYYY-MM-DD'), for previewing dates.
export default function QuizEditorModal({ open, onClose, onSave, initialData, initialDays, moduleStartDate }) {
  const { SERVER_URL, courseId } = useCourse();
  const isEdit = Boolean(initialData?.id);
  const [outcomes, setOutcomes] = useState([]);

  useEffect(() => {
    if (!open || !SERVER_URL || !courseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SERVER_URL}/courses/${courseId}/outcomes`);
        const payload = await res.json().catch(() => []);
        if (!cancelled && res.ok && Array.isArray(payload)) setOutcomes(payload);
      } catch { /* the select just offers "No outcome" */ }
    })();
    return () => { cancelled = true; };
  }, [open, SERVER_URL, courseId]);
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [schedule, setSchedule] = useState(() => initialScheduleValues(initialDays));
  const [kind, setKind] = useState(initialData?.kind || "graded");
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

  const handleSave = async () => {
    if (!title.trim() || scheduleError(schedule)) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description,
        ...schedulePayload(schedule),
        kind,
        attemptsAllowed: attemptsAllowed === "" ? null : Math.max(1, Number(attemptsAllowed) || 1),
        questions,
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
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl mx-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">
            {isEdit ? "Edit Quiz" : "New Quiz"}
          </h2>
          <button aria-label="Close" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Quiz Title *</label>
            <input aria-label="Quiz Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Quiz title"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description (optional)</label>
            <textarea aria-label="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] resize-none"
            />
          </div>

          {/* Quiz type & attempts */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <label className="block text-xs font-semibold text-slate-600">Quiz Type</label>
                <Explainer k={`quizKinds.${kind}`} variant="icon" />
              </div>
              <select aria-label="Quiz Type"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] bg-white"
              >
                <option value="graded">Graded</option>
                <option value="practice">Practice</option>
                <option value="baseline">Baseline</option>
              </select>
              {kind === "baseline" ? (
                <span className="block text-[10px] text-amber-700">Baseline questions must be multiple choice with a correct answer and an outcome.</span>
              ) : kind !== "practice" ? (
                <span className="text-[10px] text-slate-400">Needs an outcome tag before it can be published.</span>
              ) : null}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Attempts Allowed</label>
              <input aria-label="Attempts Allowed"
                type="number"
                min="1"
                value={attemptsAllowed}
                onChange={(e) => setAttemptsAllowed(e.target.value)}
                placeholder="Unlimited"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488]"
              />
              <span className="text-[10px] text-slate-400">Leave empty for unlimited</span>
            </div>
          </div>

          {/* Relative timing */}
          <ScheduleFields values={schedule} onChange={setSchedule} moduleStartDate={moduleStartDate} />

          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase text-slate-500">Questions ({questions.length})</label>
              <button type="button" onClick={addQuestion} className="flex items-center gap-1 text-xs font-semibold text-white bg-[#0D9488] rounded-lg px-3 py-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Question
              </button>
            </div>
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <QuestionBuilder key={idx} question={q} index={idx} onChange={updateQuestion} onRemove={removeQuestion} outcomes={outcomes} />
              ))}
              {questions.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-6">No questions yet. Click "Add Question" to start building your quiz.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="text-xs font-semibold text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim() || Boolean(scheduleError(schedule))}
            className="text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Quiz"}
          </button>
        </div>
      </div>
    </div>
  );
}
