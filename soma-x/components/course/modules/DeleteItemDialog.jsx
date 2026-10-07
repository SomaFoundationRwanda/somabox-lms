"use client";

import { X, AlertTriangle } from "lucide-react";

export default function DeleteItemDialog({ open, onClose, item, onRemove, onDeletePermanently }) {
  if (!open || !item) return null;
  const isSubHeader = item.item_type === "sub_header";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl mx-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-900">Delete Item</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-slate-600 mb-1">
            How would you like to handle <strong className="text-slate-800">{item.title}</strong>?
          </p>
          {!isSubHeader && (
            <p className="text-xs text-slate-400">
              Removing from the module moves the {item.item_type} to &quot;Unassigned&quot; (unpublished) — it stays in the course. Deleting permanently removes it everywhere.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 px-5 pb-5">
          <button
            onClick={() => { onRemove(); onClose(); }}
            className="w-full text-sm font-semibold text-[#203A3A] bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 transition-colors"
          >
            {isSubHeader ? "Delete Sub-header" : "Move to Unassigned"}
          </button>
          {!isSubHeader && (
            <button
              onClick={() => { onDeletePermanently(); onClose(); }}
              className="w-full text-sm font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl px-4 py-2.5 transition-colors"
            >
              Delete permanently
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full text-xs text-slate-400 hover:text-slate-600 py-1.5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
