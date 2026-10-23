"use client"

// A dialog: a title, a close button, and its content. Clicking outside closes it unless the
// form in it has unsaved input (`dirty`). size: "sm" (a short form) or "lg" (lists, tables).
import { X } from "lucide-react"
import { useLanguage } from "@/context/LanguageContext"

const SIZES = { sm: "max-w-sm", lg: "max-w-2xl" }

export default function Modal({ title, onClose, dirty = false, size = "sm", children }) {
  const { t } = useLanguage()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { if (!dirty) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`bg-white dark:bg-[#0f1318] border border-transparent dark:border-slate-700/50 rounded-2xl shadow-xl w-full ${SIZES[size] || SIZES.sm} mx-4 p-6 max-h-[calc(100dvh-2rem)] overflow-y-auto`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-white">{title}</h3>
          <button aria-label={t("teacher.common.close")} onClick={onClose} className="text-slate-600 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
