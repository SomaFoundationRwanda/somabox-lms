"use client";

import { useState } from "react";
import { X, Plus, Trash2, Check, Sparkles } from "lucide-react";
import InfoTooltip from "@/components/ui/InfoTooltip";

function QuestionBuilder({ question, index, onChange, onRemove }) {
  const updateField = (field, value) => onChange(index, { ...question, [field]: value });
  const options = Array.isArray(question.options) ? question.options : [];

  const addOption = () => updateField("options", [...options, { text: "", id: `opt_${Date.now()}` }]);
  const removeOption = (optIdx) => {
    const next = options.filter((_, i) => i !== optIdx);
    updateField("options", next);
    if (question.correctOption === options[optIdx]?.id) updateField("correctOption", null);
  };
  const updateOptionText = (optIdx, text) => {
    const next = options.map((o, i) => i === optIdx ? { ...o, text } : o);
    updateField("options", next);
  };

  const generateAiDistractors = () => {
    if (!question.prompt) return;
    const baseText = question.prompt.slice(0, 20);
    const newOpts = [
      { text: `Correct Answer: ${baseText} Principle`, id: `opt_corr_${Date.now()}` },
      { text: `Plausible Distractor A (${baseText})`, id: `opt_dist1_${Date.now()}` },
      { text: `Plausible Distractor B (${baseText})`, id: `opt_dist2_${Date.now()}` },
      { text: `Common Misconception (${baseText})`, id: `opt_dist3_${Date.now()}` },
    ];
    updateField("options", newOpts);
    updateField("correctOption", newOpts[0].id);
  };

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase text-slate-400">Question {index + 1}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={generateAiDistractors}
            className="flex items-center gap-1 text-[11px] font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md hover:bg-teal-100 transition-colors"
          >
            <Sparkles className="w-3 h-3 text-[#0D9488]" /> AI Generate Distractors
          </button>
          <button type="button" onClick={() => onRemove(index)} className="p-1 rounded hover:bg-rose-50 text-rose-400 hover:text-rose-600">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <input
        value={question.prompt || ""}
        onChange={(e) => updateField("prompt", e.target.value)}
        placeholder="Question prompt..."
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] bg-white"
      />

      <div className="flex items-center gap-3">
        <select
          value={question.questionType || "multiple_choice"}
          onChange={(e) => updateField("questionType", e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="multiple_choice">Multiple Choice</option>
          <option value="open">Open Ended</option>
        </select>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500">Points:</label>
          <input
            type="number"
            min="1"
            value={question.points || 1}
            onChange={(e) => updateField("points", Number(e.target.value) || 1)}
            className="w-16 text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white outline-none"
          />
        </div>
      </div>

      {question.questionType !== "open" && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center gap-1">
            <label className="text-[10px] font-bold uppercase text-slate-400">Options (click ✓ to mark correct)</label>
            <InfoTooltip text="Click the circle beside a choice to mark it as correct." />
          </div>
          {options.map((opt, optIdx) => (
            <div key={opt.id || optIdx} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateField("correctOption", opt.id || String(optIdx))}
                aria-pressed={question.correctOption === (opt.id || String(optIdx))}
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
                className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-[#0D9488] bg-white"
              />
              <button type="button" onClick={() => removeOption(optIdx)} className="p-1 text-slate-300 hover:text-rose-500">
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

export default function QuizEditorModal({ open, onClose, onSave, initialData }) {
  const isEdit = Boolean(initialData?.id);
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [releaseDay, setReleaseDay] = useState(initialData?.release_day ?? 0);
  const [dueDay, setDueDay] = useState(initialData?.due_day ?? 7);
  const [questions, setQuestions] = useState(
    Array.isArray(initialData?.questions)
      ? initialData.questions.map((q) => ({
          prompt: q.prompt,
          questionType: q.question_type || q.questionType || "multiple_choice",
          options: typeof q.options === "string" ? JSON.parse(q.options || "[]") : (q.options || []),
          correctOption: q.correct_option || q.correctOption || null,
          points: q.points || 1,
        }))
      : []
  );
  const [saving, setSaving] = useState(false);

  const addQuestion = () => setQuestions((prev) => [
    ...prev,
    { prompt: "", questionType: "multiple_choice", options: [{ text: "", id: `opt_${Date.now()}_a` }, { text: "", id: `opt_${Date.now()}_b` }], correctOption: null, points: 1 },
  ]);

  const updateQuestion = (index, updated) => setQuestions((prev) => prev.map((q, i) => i === index ? updated : q));
  const removeQuestion = (index) => setQuestions((prev) => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description,
        releaseDay: Number(releaseDay) || 0,
        dueDay: Number(dueDay) || 7,
        questions,
      });
      onClose();
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
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Quiz Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Quiz title"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief description..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] resize-none"
            />
          </div>

          {/* Relative Timing */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Release Day (Relative)</label>
              <input
                type="number"
                min="0"
                value={releaseDay}
                onChange={(e) => setReleaseDay(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none bg-white"
              />
              <span className="text-[10px] text-slate-400">Days from module start</span>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Due Day (Relative)</label>
              <input
                type="number"
                min="0"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none bg-white"
              />
              <span className="text-[10px] text-slate-400">Days from module start</span>
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase text-slate-500">Questions ({questions.length})</label>
              <button type="button" onClick={addQuestion} className="flex items-center gap-1 text-xs font-semibold text-white bg-[#0D9488] rounded-lg px-3 py-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Question
              </button>
            </div>
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <QuestionBuilder key={idx} question={q} index={idx} onChange={updateQuestion} onRemove={removeQuestion} />
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
            disabled={saving || !title.trim()}
            className="text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Quiz"}
          </button>
        </div>
      </div>
    </div>
  );
}
