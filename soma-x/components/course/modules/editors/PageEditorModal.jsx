"use client";

import EditorFrame from "./EditorFrame";
import { useState, useRef } from "react";
import { useCourse } from "@/context/CourseContext";
import { useFormDraft } from "@/lib/drafts";
import useUnsavedChanges from "@/lib/useUnsavedChanges";
import DraftBanner from "@/components/ui/DraftBanner";
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

  const { courseId } = useCourse();
  // A restored draft replaces the editor's starting content (the editor is remounted with it).
  const [restoredContent, setRestoredContent] = useState(null);
  const [contentTouched, setContentTouched] = useState(false);
  const initialContent = restoredContent ?? (initialData?.body_json
    ? (typeof initialData.body_json === "string" ? JSON.parse(initialData.body_json) : initialData.body_json)
    : initialData?.body_html || initialData?.body || "");

  // Unsaved changes: kept as a draft on this device, and asked about before leaving.
  const initialTitle = useRef(initialData?.title || "");
  const dirty = title !== initialTitle.current || contentTouched;
  const draft = useFormDraft(`editor:${courseId}:page:${initialData?.id ?? "new"}`, { title, json: editorData.json }, dirty);
  const restoreDraft = () => {
    const v = draft.restore();
    if (!v) return;
    setTitle(v.title ?? "");
    if (v.json) { setRestoredContent(v.json); setContentTouched(true); }
  };
  const onEditorUpdate = (data) => { setEditorData(data); setContentTouched(true); };

  const handleSave = async () => {
    if (!title.trim()) return false;
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
      draft.clear();
      initialTitle.current = title;
      setContentTouched(false);
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
    <EditorFrame asPage={asPage} title={isEdit ? t("editors.editPage") : t("editors.newPage")} onClose={close} maxWidth="max-w-3xl">

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <DraftBanner draft={draft.saved} onRestore={restoreDraft} onDiscard={draft.discard} />
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
              key={restoredContent ? "restored" : "initial"}
              ref={editorRef}
              content={initialContent}
              onUpdate={onEditorUpdate}
              minHeight="300px"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
          <button onClick={close} className="text-caption font-semibold text-fg-muted hover:text-fg px-4 py-2 rounded-lg hover:bg-surface-hover">
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
    {dialog}
    </>
  );
}
