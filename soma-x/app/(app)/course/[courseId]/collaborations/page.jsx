"use client";

import { useState } from "react";
import { ExternalLink, Plus, Share2, Trash2 } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { Button } from "@/components/ui/button";
import { PageHeader, List } from "@/components/layout";
import { useCourseText } from "@/components/course/useCourseText";
import { useToast } from "@/context/ToastContext";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { CheckboxList, Fieldset, TextInput } from "@/components/form";

export default function CollaborationsPage() {
  const { courseId, userEmail, canTakePart, isTeacher } = useCourse();
  const { t, tf, tOr } = useCourseText();
  const { showToast } = useToast();
  const { data: collaborations, loading, error, refetch } = useCourseSection("collaborations");
  const { data: people } = useCourseSection("people");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", url: "" });
  // Chosen by their place in the class (enrollment id): learners don't see classmates' emails.
  const [memberIds, setMemberIds] = useState([]);
  const [saving, setSaving] = useState(false);


  const create = async () => {
    if (!form.title.trim() || !form.url.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/courses/${courseId}/collaborations`, { method: "POST", json: { title: form.title.trim(), url: form.url.trim(), memberIds: memberIds.map(Number) } });
      setForm({ title: "", url: "" });
      setMemberIds([]);
      setCreating(false);
      refetch();
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await apiFetch(`/courses/${courseId}/collaborations/${id}`, { method: "DELETE", json: {} });
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    }
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="collaborations" />
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
        <PageHeader help="pages.collaborations"
          title={t("nav.collaborations")}
          actions={canTakePart ? (
            <Button onClick={() => setCreating((v) => !v)} className="h-9 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> {t("collab.new")}
            </Button>
          ) : null}
        />

        {creating && canTakePart ? (
          <div className="space-y-3">
            <TextInput value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder={t("collab.titlePlaceholder")} aria-label={t("collab.titleLabel")} className="w-full" />
            <TextInput value={form.url} onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))} placeholder="https://docs.google.com/..." aria-label={t("collab.link")} className="w-full" />
            <Fieldset legend={t("collab.whoCanAccess")}>
              <CheckboxList
                items={(people || []).map((person) => ({ value: String(person.id), label: `${person.fullName} (${tOr(`people.roles.${person.role}`, person.role)})` }))}
                selected={memberIds}
                onChange={setMemberIds}
              />
            </Fieldset>
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="text-caption font-medium text-fg-subtle px-3 py-2">{t("common.cancel")}</button>
              <button onClick={create} disabled={saving || !form.title.trim() || !form.url.trim()} className="text-caption font-semibold text-on-brand-strong bg-brand-strong rounded-lg px-3 py-2 disabled:opacity-50">
                {saving ? t("collab.creating") : t("common.create")}
              </button>
            </div>
          </div>
        ) : null}

        <AsyncListState loading={loading} error={error} data={collaborations} onRetry={refetch} emptyMessage={t("collab.empty")}>
          {(list) => (
            <List label={t("nav.collaborations")}>
              {list.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ui text-fg-muted hover:text-brand-fg min-w-0">
                    <Share2 className="w-4 h-4 text-fg-subtle shrink-0" />
                    <span className="truncate">{c.title}</span>
                    <ExternalLink className="w-3 h-3 text-fg-subtle shrink-0" />
                  </a>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.memberCount != null ? (
                      <span className="text-caption text-fg-subtle">{c.memberCount > 0 ? tf(c.memberCount === 1 ? "collab.oneMember" : "collab.manyMembers", { n: c.memberCount }) : t("collab.everyone")}</span>
                    ) : null}
                    {normalizeEq(c.created_by_teacher_email, userEmail) ? (
                      <button onClick={() => remove(c.id)} aria-label={tf("modules.deleteNamed", { title: c.title })} className="text-danger-fg"><Trash2 className="w-3.5 h-3.5" /></button>
                    ) : null}
                  </div>
                </li>
              ))}
            </List>
          )}
        </AsyncListState>
      </div>
    </div>
  );
}

function normalizeEq(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}
