"use client";

import { X, AlertTriangle } from "lucide-react";
import { useCourseText } from "@/components/course/useCourseText";

export default function DeleteItemDialog({ open, onClose, item, onRemove, onDeletePermanently }) {
  const { t } = useCourseText();
  if (!open || !item) return null;
  const isSubHeader = item.item_type === "sub_header";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="delete-item-title" className="bg-surface rounded-2xl w-full max-w-sm shadow-2xl mx-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-line">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-warning-fg" />
            <h2 id="delete-item-title" className="text-ui font-bold text-fg">{t("modules.deleteDialog.title")}</h2>
          </div>
          <button aria-label={t("common.close")} onClick={onClose} className="p-1 rounded-lg hover:bg-surface-hover text-fg-subtle">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-ui text-fg-muted mb-1">
            {t("modules.deleteDialog.question")} <strong className="text-fg">{item.title}</strong>
          </p>
          {!isSubHeader && (
            <p className="text-caption text-fg-subtle">
              {t("modules.deleteDialog.help")}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 px-5 pb-5">
          <button
            onClick={() => { onRemove(); onClose(); }}
            className="w-full text-ui font-semibold text-brand-fg bg-surface-sunken hover:bg-surface-hover border border-line rounded-xl px-4 py-2.5 transition-colors"
          >
            {isSubHeader ? t("modules.deleteDialog.deleteSubHeader") : t("modules.deleteDialog.moveToUnassigned")}
          </button>
          {!isSubHeader && (
            <button
              onClick={() => { onDeletePermanently(); onClose(); }}
              className="w-full text-ui font-semibold text-danger-fg bg-danger-soft hover:bg-danger-soft border border-danger/30 rounded-xl px-4 py-2.5 transition-colors"
            >
              {t("modules.deleteDialog.deletePermanently")}
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full text-caption text-fg-subtle hover:text-fg-muted py-1.5"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
