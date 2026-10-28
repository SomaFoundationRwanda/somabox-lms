"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardList, Pin, Plus, Tag, UsersRound } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { PageHeader, List } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useCourseText } from "@/components/course/useCourseText";
import { useToast } from "@/context/ToastContext";
import { apiFetch } from "@/lib/api";
import { useFormDraft } from "@/lib/drafts";
import useUnsavedChanges from "@/lib/useUnsavedChanges";
import DraftBanner from "@/components/ui/DraftBanner";
import { CheckboxField, CheckboxList, ChoiceGroup, Field, Select, TextInput, Textarea } from "@/components/form";

const EMPTY = { title: "", body: "", category: "general", customCategory: "", assignmentId: "", urgency: "normal", isPublic: true, groupIds: [], peopleEmails: [], notify: true };

// Urgent and important announcements stand out in the list.
const URGENCY_ROW = { urgent: "bg-danger-soft/60 border-l-4 border-danger", important: "bg-warning-soft/60 border-l-4 border-warning" };
const URGENCY_BADGE = { urgent: "text-danger-fg bg-danger-soft border-danger/30", important: "text-warning-fg bg-warning-soft border-warning/30" };

// Teachers: a new announcement, its category, urgency, and who it's for.
function NewAnnouncement({ courseId, onDone, onCancel }) {
  const { t } = useCourseText();
  const { showToast } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch) => setForm((p) => ({ ...p, ...patch }));
  // What's typed is kept on this device until it's posted, and leaving asks first.
  const dirty = JSON.stringify(form) !== JSON.stringify(EMPTY);
  const draft = useFormDraft(`announcement:${courseId}:new`, form, dirty);
  const { data: groupData } = useCourseSection("groups");
  const groups = Array.isArray(groupData?.groups) ? groupData.groups : [];
  const { data: people } = useCourseSection(form.isPublic ? null : "people");
  const members = (Array.isArray(people) ? people : []).filter((p) => p.status === "active" && p.account);
  const { data: work } = useCourseSection(form.category === "assignment" ? "assignments" : null);
  const assignments = (Array.isArray(work) ? work : []).filter((a) => a.kind === "assignment");

  const post = async () => {
    if (!form.title.trim()) return;
    if (!form.isPublic && !form.groupIds.length && !form.peopleEmails.length) {
      setError(t("announcements.needAudience"));
      return;
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/courses/${courseId}/announcements`, {
        method: "POST",
        json: {
          title: form.title.trim(), body: form.body, category: form.category, urgency: form.urgency, isPublic: form.isPublic, notify: form.notify,
          ...(form.category === "custom" ? { customCategory: form.customCategory } : {}),
          ...(form.category === "assignment" && form.assignmentId ? { assignmentId: Number(form.assignmentId) } : {}),
          ...(form.isPublic ? {} : { groupIds: form.groupIds, peopleEmails: form.peopleEmails }),
        },
      });
      draft.clear();
      setForm(EMPTY);
      onDone();
      return true;
    } catch (err) {
      setError(err?.body?.message || t("announcements.postFailed"));
      showToast(t("announcements.postFailed"), "error");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const { confirmLeave, dialog } = useUnsavedChanges({ dirty, onSave: post });

  return (
    <div className="rounded-xl border border-line p-4 space-y-4">
      {dialog}
      <DraftBanner draft={draft.saved} onRestore={() => { const v = draft.restore(); if (v) setForm({ ...EMPTY, ...v }); }} onDiscard={draft.discard} />
      <TextInput value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder={t("common.title")} aria-label={t("announcements.titleLabel")} className="w-full" />
      <Textarea value={form.body} onChange={(e) => set({ body: e.target.value })} rows={4} placeholder={t("announcements.message")} aria-label={t("announcements.messageLabel")} className="w-full" />

      <div className="grid sm:grid-cols-2 gap-3">
        <Field id="ann-category" label={t("announcements.category")}>
          <Select id="ann-category" value={form.category} onChange={(e) => set({ category: e.target.value })} className="w-full">
            {["general", "assignment", "custom"].map((k) => <option key={k} value={k}>{t(`announcements.categories.${k}`)}</option>)}
          </Select>
        </Field>
        {form.category === "custom" ? (
          <Field id="ann-custom" label={t("announcements.customName")} required>
            <TextInput id="ann-custom" value={form.customCategory} onChange={(e) => set({ customCategory: e.target.value })} placeholder={t("announcements.customPlaceholder")} className="w-full" />
          </Field>
        ) : form.category === "assignment" ? (
          <Field id="ann-assignment" label={t("announcements.whichAssignment")}>
            <Select id="ann-assignment" value={form.assignmentId} onChange={(e) => set({ assignmentId: e.target.value })} placeholder={t("announcements.chooseAssignment")} className="w-full">
              {assignments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
            </Select>
          </Field>
        ) : null}
      </div>

      <Field id="ann-urgency" label={t("announcements.urgency")}>
        <ChoiceGroup
          id="ann-urgency"
          options={["normal", "important", "urgent"].map((k) => ({ value: k, label: t(`announcements.urgencies.${k}`) }))}
          value={form.urgency}
          onChange={(v) => set({ urgency: v })}
          columns={3}
          size="sm"
        />
      </Field>

      <div className="space-y-2">
        <p className="text-ui font-semibold text-fg">{t("announcements.audience")}</p>
        <CheckboxField id="ann-public" label={t("announcements.public")} hint={t("announcements.publicHelp")} checked={form.isPublic} onCheckedChange={(v) => set({ isPublic: v })} />
        {!form.isPublic ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {groups.length ? (
              <div>
                <p className="text-caption font-semibold text-fg-muted mb-1">{t("announcements.groups")}</p>
                <CheckboxList items={groups.map((g) => ({ value: g.id, label: g.name }))} selected={form.groupIds} onChange={(v) => set({ groupIds: v })} />
              </div>
            ) : null}
            <div>
              <p className="text-caption font-semibold text-fg-muted mb-1">{t("announcements.people")}</p>
              <CheckboxList
                items={members.map((p) => ({ value: String(p.account).toLowerCase(), label: p.fullName || p.learnerCode || p.account }))}
                selected={form.peopleEmails}
                onChange={(v) => set({ peopleEmails: v })}
              />
            </div>
          </div>
        ) : null}
      </div>

      <CheckboxField id="ann-notify" label={t("announcements.notify")} hint={t("announcements.notifyHelp")} checked={form.notify || form.urgency === "urgent"} disabled={form.urgency === "urgent"} onCheckedChange={(v) => set({ notify: v })} />

      {error ? <p role="alert" className="text-caption font-semibold text-danger-fg">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => confirmLeave(() => { draft.clear(); onCancel(); })} className="text-caption font-medium text-fg-subtle px-3 py-2">{t("common.cancel")}</button>
        <button type="button" onClick={post} disabled={saving || !form.title.trim() || (form.category === "custom" && !form.customCategory.trim())} className="text-caption font-semibold text-on-brand-strong bg-brand-strong rounded-lg px-3 py-2 disabled:opacity-50">
          {saving ? t("common.saving") : t("announcements.post")}
        </button>
      </div>
    </div>
  );
}

export default function AnnouncementsPage() {
  const { courseId, isTeacher } = useCourse();
  const { t, tf, fmtDate } = useCourseText();
  const { showToast } = useToast();
  const { data: announcements, loading, error, refetch } = useCourseSection("announcements");
  const [creating, setCreating] = useState(false);

  const togglePin = async (a) => {
    try {
      await apiFetch(`/courses/${courseId}/announcements/${a.id}`, { method: "PATCH", json: { pinned: !a.pinned } });
    } catch {
      showToast(t("announcements.postFailed"), "error");
    }
    refetch();
  };

  // Pinned first, then urgent, then newest.
  const rank = { urgent: 0, important: 1, normal: 2 };
  const sorted = Array.isArray(announcements)
    ? [...announcements].sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        if (rank[a.urgency] !== rank[b.urgency]) return (rank[a.urgency] ?? 2) - (rank[b.urgency] ?? 2);
        return new Date(b.created_at) - new Date(a.created_at);
      })
    : announcements;

  const categoryLabel = (a) => (a.category === "custom" ? a.custom_category : t(`announcements.categories.${a.category || "general"}`));
  const audienceLabel = (a) => (a.isPublic ? t("announcements.everyone")
    : [...(a.groups || []).map((g) => g.name), ...(a.people || []).map((p) => p.fullName || p.email)].join(", "));

  return (
    <div>
      <Breadcrumbs sectionKey="announcements" />
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
        <PageHeader help="pages.announcements"
          title={t("nav.announcements")}
          actions={isTeacher && !creating ? (
            <Button onClick={() => setCreating(true)} className="h-9 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> {t("announcements.new")}
            </Button>
          ) : null}
        />

        {creating ? <NewAnnouncement courseId={courseId} onCancel={() => setCreating(false)} onDone={() => { setCreating(false); refetch(); }} /> : null}

        <AsyncListState loading={loading} error={error} data={sorted} onRetry={refetch} emptyMessage={t("announcements.empty")}>
          {(list) => (
            <List label={t("nav.announcements")}>
              {list.map((a) => (
                <li key={a.id} className={`px-3 py-3 ${URGENCY_ROW[a.urgency] || (a.pinned ? "bg-surface-sunken" : "")}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      {a.pinned ? <Pin className="w-3.5 h-3.5 text-warning-fg shrink-0" aria-label={t("announcements.pinned")} /> : null}
                      {URGENCY_BADGE[a.urgency] ? (
                        <span className={`inline-flex items-center gap-1 text-caption font-bold border rounded-full px-2 py-0.5 ${URGENCY_BADGE[a.urgency]}`}>
                          <AlertTriangle className="w-3 h-3" aria-hidden="true" /> {t(`announcements.urgencies.${a.urgency}`)}
                        </span>
                      ) : null}
                      <p className="text-ui font-bold text-fg">{a.title}</p>
                    </div>
                    <span className="text-caption text-fg-subtle shrink-0">{fmtDate(a.created_at)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="inline-flex items-center gap-1 text-caption font-semibold text-fg-muted bg-surface-sunken rounded-full px-2 py-0.5">
                      <Tag className="w-3 h-3" aria-hidden="true" /> {categoryLabel(a)}
                    </span>
                    {a.assignment ? (
                      <Link href={`/course/${courseId}/assignments/${a.assignment.id}`} className="inline-flex items-center gap-1 text-caption font-semibold text-brand-fg hover:underline">
                        <ClipboardList className="w-3 h-3" aria-hidden="true" /> {a.assignment.title}
                      </Link>
                    ) : null}
                    {isTeacher ? (
                      <span className="inline-flex items-center gap-1 text-caption text-fg-subtle">
                        <UsersRound className="w-3 h-3" aria-hidden="true" /> {tf("announcements.forAudience", { who: audienceLabel(a) })}
                      </span>
                    ) : null}
                  </div>
                  {a.body ? <p className="text-ui text-fg-muted mt-1.5 whitespace-pre-wrap">{a.body}</p> : null}
                  <div className="flex items-center gap-2 mt-1.5">
                    {!a.published && isTeacher ? <span className="text-caption font-bold text-warning-fg">{t("common.unpublished")}</span> : null}
                    {isTeacher ? (
                      <button onClick={() => togglePin(a)} className="text-caption font-semibold text-fg-subtle hover:text-fg-muted">
                        {a.pinned ? t("announcements.unpin") : t("announcements.pin")}
                      </button>
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
