"use client";

import { useState } from "react";
import { X } from "lucide-react";

export default function AssignmentEditorModal({ open, onClose, onSave, initialData }) {
  const isEdit = Boolean(initialData?.id);
  const [title, setTitle] = useState(initialData?.title || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [dueAt, setDueAt] = useState(initialData?.due_at ? initialData.due_at.slice(0, 16) : "");
  const [pointsPossible, setPointsPossible] = useState(initialData?.points_possible ?? 100);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description,
        dueAt: dueAt || null,
        pointsPossible: Number(pointsPossible) || 100,
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
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Assignment title"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Assignment instructions..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A] resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Due Date</label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Points Possible</label>
              <input
                type="number"
                min="0"
                value={pointsPossible}
                onChange={(e) => setPointsPossible(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
              />
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
            className="text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
          >
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Assignment"}
          </button>
        </div>
      </div>
    </div>
  );
}
