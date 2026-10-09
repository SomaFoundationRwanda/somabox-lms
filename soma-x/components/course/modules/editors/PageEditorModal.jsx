"use client";

import { useState, useRef } from "react";
import { X, AlertCircle } from "lucide-react";
import RichTextEditor from "@/components/course/editor/RichTextEditor";
import AIAssistantWidget from "@/components/course/editor/AIAssistantWidget";
import { useCourseText } from "@/components/course/useCourseText";

export default function PageEditorModal({ open, onClose, onSave, initialData }) {
  const isEdit = Boolean(initialData?.id);
  const { t, tf } = useCourseText();
  const [title, setTitle] = useState(initialData?.title || "");
  const [editorData, setEditorData] = useState({ json: null, html: "" });
  const [saving, setSaving] = useState(false);
  const [altWarning, setAltWarning] = useState(null);
  const editorRef = useRef(null);

  const initialContent = initialData?.body_json
    ? (typeof initialData.body_json === "string" ? JSON.parse(initialData.body_json) : initialData.body_json)
    : initialData?.body_html || initialData?.body || "";

  const handleSave = async () => {
    if (!title.trim()) return;
    setAltWarning(null);

    if (editorRef.current) {
      const validation = editorRef.current.validateAltText();
      if (!validation.isValid) {
        setAltWarning(tf(validation.missingCount === 1 ? "editors.altWarningOne" : "editors.altWarningMany", { n: validation.missingCount }));
        return;
      }
    }

    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        body: editorData.html || "",
        bodyJson: editorData.json ? JSON.stringify(editorData.json) : null,
        bodyHtml: editorData.html || "",
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
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl mx-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">
            {isEdit ? t("editors.editPage") : t("editors.newPage")}
          </h2>
          <button aria-label={t("common.close")} onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t("common.title")}</label>
            <input aria-label={t("common.title")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("editors.pageTitle")}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[var(--brand-primary)] transition-colors"
            />
          </div>

          {/* Teacher AI Assistant Widget */}
          <AIAssistantWidget
            lessonId={initialData?.id ? String(initialData.id) : ""}
            courseId={initialData?.course_id ? String(initialData.course_id) : ""}
            onInsertContent={(text) => editorRef.current?.insertContent(text)}
          />

          {altWarning && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{altWarning}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t("editors.content")}</label>
            <RichTextEditor
              ref={editorRef}
              content={initialContent}
              onUpdate={setEditorData}
              minHeight="300px"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="text-xs font-semibold text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-50">
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
          >
            {saving ? t("common.saving") : isEdit ? t("editors.saveChanges") : t("editors.createPage")}
          </button>
        </div>
      </div>
    </div>
  );
}
