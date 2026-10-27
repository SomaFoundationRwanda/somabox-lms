"use client";

import EditorFrame from "./EditorFrame";
import { useState, useRef } from "react";
import { AlertCircle } from "lucide-react";
import RichTextEditor from "@/components/course/editor/RichTextEditor";
import AIAssistantWidget from "@/components/course/editor/AIAssistantWidget";
import { useCourseText } from "@/components/course/useCourseText";
import { Label, TextInput } from "@/components/form";

export default function PageEditorModal({ asPage = false, open, onClose, onSave, initialData }) {
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

  if (!open && !asPage) return null;

  return (
    <EditorFrame asPage={asPage} title={isEdit ? t("editors.editPage") : t("editors.newPage")} onClose={onClose} maxWidth="max-w-3xl">

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <div>
            <Label>{t("common.title")}</Label>
            <TextInput aria-label={t("common.title")} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("editors.pageTitle")} className="w-full" />
          </div>

          {/* Teacher AI Assistant Widget */}
          <AIAssistantWidget
            lessonId={initialData?.id ? String(initialData.id) : ""}
            courseId={initialData?.course_id ? String(initialData.course_id) : ""}
            onInsertContent={(text) => editorRef.current?.insertContent(text)}
          />

          {altWarning && (
            <div className="flex items-center gap-2 p-3 bg-warning-soft border border-warning/30 text-warning-fg rounded-xl text-caption font-semibold">
              <AlertCircle className="w-4 h-4 text-warning-fg shrink-0" />
              <span>{altWarning}</span>
            </div>
          )}

          <div>
            <Label>{t("editors.content")}</Label>
            <RichTextEditor
              ref={editorRef}
              content={initialContent}
              onUpdate={setEditorData}
              minHeight="300px"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
          <button onClick={onClose} className="text-caption font-semibold text-fg-muted hover:text-fg px-4 py-2 rounded-lg hover:bg-surface-hover">
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
          >
            {saving ? t("common.saving") : isEdit ? t("editors.saveChanges") : t("editors.createPage")}
          </button>
        </div>
    </EditorFrame>
  );
}
