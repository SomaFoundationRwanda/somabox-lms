"use client";

import { useState } from "react";
import { X, Sparkles, Target } from "lucide-react";

export default function AssignmentEditorModal({ open, onClose, onSave, initialData }) {
  const isEdit = Boolean(initialData?.id);
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [releaseDay, setReleaseDay] = useState(initialData?.release_day ?? 0);
  const [dueDay, setDueDay] = useState(initialData?.due_day ?? 7);
  const [pointsPossible, setPointsPossible] = useState(initialData?.points_possible ?? 100);
  const [rubricDraft, setRubricDraft] = useState(initialData?.rubric_draft || "");
  const [saving, setSaving] = useState(false);

  const generateRubricDraft = () => {
    setRubricDraft(
      `Rubric (Derived from Learning Outcome Mastery Levels):\n` +
      `- Exceeds Mastery (4 pts): Complete accuracy, clear multi-step reasoning, flawless solution.\n` +
      `- Meets Mastery (3 pts): Correct application with minor procedural errors.\n` +
      `- Approaching Mastery (2 pts): Partial understanding; demonstrates correct formulas but misses steps.\n` +
      `- Below Mastery (1 pt): Struggling with basic concepts; needs targeted reteaching.`
    );
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description,
        releaseDay: Number(releaseDay) || 0,
        dueDay: Number(dueDay) || 7,
        pointsPossible: Number(pointsPossible) || 100,
        rubricDraft,
      });
      onClose();
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
            {isEdit ? "Edit Assignment" : "New Assignment"}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Assignment Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Linear Equations Problem Set"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Instructions & Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Assignment instructions..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488] resize-none"
            />
          </div>

          {/* Relative Timing */}
          <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
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

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">Points Possible</label>
              <input
                type="number"
                min="0"
                value={pointsPossible}
                onChange={(e) => setPointsPossible(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none bg-white"
              />
            </div>
          </div>

          {/* Rubric Generator from Tagged Outcomes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">Assignment Rubric</label>
              <button
                type="button"
                onClick={generateRubricDraft}
                className="flex items-center gap-1 text-[11px] font-bold text-[#0D9488] hover:underline"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#0D9488]" /> AI Generate Rubric from Outcomes
              </button>
            </div>
            <textarea
              value={rubricDraft}
              onChange={(e) => setRubricDraft(e.target.value)}
              rows={3}
              placeholder="Rubric criteria derived from outcome mastery levels..."
              className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488]"
            />
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
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}
