"use client";

import { useState } from "react";
import EditorFrame from "./EditorFrame";
import { useCourseText } from "@/components/course/useCourseText";
import { Field, Textarea, TextInput } from "@/components/form";

// A discussion: its title and the question or prompt learners answer. Grading a discussion is
// set on its own page, once it exists.
export default function DiscussionEditor({ asPage = false, open, onClose, onSave, initialData }) {
  const isEdit = Boolean(initialData?.id);
  const { t } = useCourseText();
  const [title, setTitle] = useState(initialData?.title || "");
  const [body, setBody] = useState(initialData?.body || "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), body: body.trim() });
      onClose();
    } catch {
      // Save failed: the error was shown; keep the editor open.
    } finally {
      setSaving(false);
    }
  };

  if (!open && !asPage) return null;

  return (
    <EditorFrame asPage={asPage} title={isEdit ? t("editors.editDiscussion") : t("editors.newDiscussion")} onClose={onClose} maxWidth="max-w-2xl">
      <div className="px-6 py-4 space-y-4">
        <Field id="discussion-title" label={t("editors.discussionTitle")} required>
          <TextInput id="discussion-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("editors.discussionTitlePlaceholder")} className="w-full" />
        </Field>
        <Field id="discussion-prompt" label={t("editors.discussionPrompt")} hint={t("editors.discussionPromptHint")}>
          <Textarea id="discussion-prompt" value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full" />
        </Field>
      </div>
      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
        <button onClick={onClose} className="text-caption font-semibold text-fg-muted hover:text-fg px-4 py-2 rounded-lg hover:bg-surface-hover">
          {t("common.cancel")}
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
        >
          {saving ? t("common.saving") : isEdit ? t("editors.saveChanges") : t("editors.createDiscussion")}
        </button>
      </div>
    </EditorFrame>
  );
}
