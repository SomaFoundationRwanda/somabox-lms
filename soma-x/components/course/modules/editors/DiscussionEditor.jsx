"use client";

import { useRef, useState } from "react";
import { useFormDraft } from "@/lib/drafts";
import useUnsavedChanges from "@/lib/useUnsavedChanges";
import DraftBanner from "@/components/ui/DraftBanner";
import EditorFrame from "./EditorFrame";
import { useQuery } from "@tanstack/react-query";
import { useCourse } from "@/context/CourseContext";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useCourseText } from "@/components/course/useCourseText";
import { Field, Select, Textarea, TextInput } from "@/components/form";

// A discussion: its title and the question or prompt learners answer, and (when new) whether
// it's one group's own discussion. Grading a discussion is set on its own page, once it exists.
export default function DiscussionEditor({ asPage = false, open, onClose, onSave, initialData }) {
  const isEdit = Boolean(initialData?.id);
  const { t, tf } = useCourseText();
  const { courseId } = useCourse();
  const groupsQuery = useQuery({
    queryKey: queryKeys.courseSection(courseId, "groups"),
    queryFn: () => apiFetch(`/courses/${courseId}/groups`),
    enabled: (!!open || asPage) && !isEdit && !!courseId,
  });
  const groups = Array.isArray(groupsQuery.data?.groups) ? groupsQuery.data.groups : [];
  const [groupId, setGroupId] = useState("");
  const [title, setTitle] = useState(initialData?.title || "");
  const [body, setBody] = useState(initialData?.body || "");
  const [saving, setSaving] = useState(false);

  // Unsaved changes: kept as a draft on this device, and asked about before leaving.
  const values = { title, body, groupId };
  const initialValues = useRef(JSON.stringify(values));
  const dirty = JSON.stringify(values) !== initialValues.current;
  const draft = useFormDraft(`editor:${courseId}:discussion:${initialData?.id ?? "new"}`, values, dirty);
  const restoreDraft = () => {
    const v = draft.restore();
    if (!v) return;
    setTitle(v.title ?? ""); setBody(v.body ?? ""); setGroupId(v.groupId ?? "");
  };

  const handleSave = async () => {
    if (!title.trim()) return false;
    setSaving(true);
    try {
      await onSave({ title: title.trim(), body: body.trim(), ...(isEdit ? {} : { groupId: groupId ? Number(groupId) : null }) });
      draft.clear();
      initialValues.current = JSON.stringify(values);
      onClose();
      return true;
    } catch {
      // Save failed: the error was shown; keep the editor open.
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
    <EditorFrame asPage={asPage} title={isEdit ? t("editors.editDiscussion") : t("editors.newDiscussion")} onClose={close} maxWidth="max-w-2xl">
      <div className="px-6 py-4 space-y-4">
        <DraftBanner draft={draft.saved} onRestore={restoreDraft} onDiscard={draft.discard} />
        <Field id="discussion-title" label={t("editors.discussionTitle")} required>
          <TextInput id="discussion-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("editors.discussionTitlePlaceholder")} className="w-full" />
        </Field>
        <Field id="discussion-prompt" label={t("editors.discussionPrompt")} hint={t("editors.discussionPromptHint")}>
          <Textarea id="discussion-prompt" value={body} onChange={(e) => setBody(e.target.value)} rows={5} className="w-full" />
        </Field>
        {!isEdit && groups.length ? (
          <Field id="discussion-group" label={t("groups.discussionGroup")}>
            <Select id="discussion-group" value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-full sm:w-72">
              <option value="">{t("groups.everyone")}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{tf("groups.groupBadge", { name: g.name })}</option>)}
            </Select>
          </Field>
        ) : null}
      </div>
      <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
        <button onClick={close} className="text-caption font-semibold text-fg-muted hover:text-fg px-4 py-2 rounded-lg hover:bg-surface-hover">
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
    {dialog}
    </>
  );
}
