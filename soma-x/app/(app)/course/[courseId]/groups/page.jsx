"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardList, MessageSquare, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, EmptyState } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useCourseText } from "@/components/course/useCourseText";
import Loader from "@/components/ui/Loader";
import { CheckboxList, Field, TextInput } from "@/components/form";

// Making or editing one group: its name and which enrolled learners are in it.
function GroupForm({ courseId, group, learners, onDone, onCancel }) {
  const { t } = useCourseText();
  const { showToast } = useToast();
  const [name, setName] = useState(group?.name || "");
  const [members, setMembers] = useState(() => (group?.members || []).map((m) => m.email));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      const body = { name: name.trim(), memberEmails: members };
      if (group) await apiFetch(`/courses/${courseId}/groups/${group.id}`, { method: "PATCH", json: body });
      else await apiFetch(`/courses/${courseId}/groups`, { method: "POST", json: body });
      showToast(t("groups.saved"), "success");
      onDone();
    } catch (err) {
      setError(err?.body?.code === "NAME_TAKEN" ? t("groups.nameTaken") : t("groups.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const formId = group ? `group-${group.id}` : "group-new";
  return (
    <div className="rounded-xl border border-brand/40 bg-brand-soft/30 p-4 space-y-3">
      <Field id={`${formId}-name`} label={t("groups.name")} required>
        <TextInput id={`${formId}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("groups.namePlaceholder")} className="w-full sm:w-72" />
      </Field>
      <div>
        <p className="text-ui font-semibold text-fg mb-1">{t("groups.members")}</p>
        {learners.length === 0 ? (
          <p className="text-caption text-fg-subtle">{t("groups.noLearners")}</p>
        ) : (
          <>
            <p className="text-caption text-fg-subtle mb-1.5">{t("groups.pickMembers")}</p>
            <CheckboxList
              items={learners.map((p) => ({ value: String(p.account).toLowerCase(), label: p.fullName || p.learnerCode || p.account }))}
              selected={members}
              onChange={setMembers}
              className="max-h-64 bg-surface"
            />
          </>
        )}
      </div>
      {error ? <p role="alert" className="text-caption font-semibold text-danger-fg">{error}</p> : null}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-caption font-semibold text-fg-muted hover:text-fg px-3 py-2 rounded-lg hover:bg-surface-hover">{t("groups.cancel")}</button>
        <button type="button" onClick={save} disabled={saving || !name.trim()} className="text-caption font-semibold text-on-brand bg-brand hover:bg-brand/90 disabled:opacity-50 rounded-lg px-4 py-2">
          {saving ? t("common.saving") : group ? t("groups.save") : t("groups.create")}
        </button>
      </div>
    </div>
  );
}

// One group: who's in it, and the work and discussions that are only for it.
function GroupCard({ courseId, group, staff, onEdit, onDelete }) {
  const { t, tf } = useCourseText();
  return (
    <section aria-labelledby={`group-${group.id}-name`} className="rounded-xl border border-line p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`group-${group.id}-name`} className="text-ui font-bold text-fg flex items-center gap-2">
            <UsersRound className="w-4 h-4 text-brand-fg" aria-hidden="true" /> {group.name}
          </h2>
          <p className="text-caption text-fg-subtle">{group.members.length ? tf("groups.membersCount", { n: group.members.length }) : t("groups.noMembers")}</p>
        </div>
        {staff ? (
          <div className="flex gap-1">
            <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 text-caption font-semibold text-fg-muted hover:text-fg rounded-lg px-2.5 py-1.5 hover:bg-surface-hover">
              <Pencil className="w-3.5 h-3.5" aria-hidden="true" /> {t("groups.edit")}
            </button>
            <button type="button" onClick={onDelete} className="inline-flex items-center gap-1 text-caption font-semibold text-danger-fg rounded-lg px-2.5 py-1.5 hover:bg-danger-soft">
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" /> {t("groups.delete")}
            </button>
          </div>
        ) : null}
      </div>

      {group.members.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={t("groups.members")}>
          {group.members.map((m, i) => (
            <li key={m.email || i} className="text-caption font-semibold text-fg-muted bg-surface-sunken rounded-full px-2.5 py-1">{m.fullName || m.email}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <h3 className="text-caption font-bold text-fg-subtle mb-1">{t("groups.assignments")}</h3>
          {group.assignments.length ? (
            <ul className="space-y-1">
              {group.assignments.map((a) => (
                <li key={a.id}>
                  <Link href={`/course/${courseId}/assignments/${a.id}`} className="inline-flex items-center gap-1.5 text-ui text-fg hover:text-brand-fg hover:underline">
                    <ClipboardList className="w-3.5 h-3.5 text-fg-subtle" aria-hidden="true" /> {a.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-caption text-fg-subtle">{t("groups.noWork")}</p>}
        </div>
        <div>
          <h3 className="text-caption font-bold text-fg-subtle mb-1">{t("groups.discussions")}</h3>
          {group.discussions.length ? (
            <ul className="space-y-1">
              {group.discussions.map((d) => (
                <li key={d.id}>
                  <Link href={`/course/${courseId}/discussions/${d.id}`} className="inline-flex items-center gap-1.5 text-ui text-fg hover:text-brand-fg hover:underline">
                    <MessageSquare className="w-3.5 h-3.5 text-fg-subtle" aria-hidden="true" /> {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="text-caption text-fg-subtle">{t("groups.noWork")}</p>}
        </div>
      </div>
    </section>
  );
}

export default function GroupsPage() {
  const { courseId } = useCourse();
  const { t, tf } = useCourseText();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { data, loading, error, refetch } = useCourseSection("groups");
  const staff = data?.role === "teacher";
  const { data: people } = useCourseSection(staff ? "people" : null);
  const learners = (Array.isArray(people) ? people : []).filter((p) => p.role === "student" && p.status === "active" && p.account);
  const [editing, setEditing] = useState(null); // "new" | group id
  const groups = Array.isArray(data?.groups) ? data.groups : [];

  // Groups change who sees assignments and discussions: reload those lists too.
  const changed = () => {
    setEditing(null);
    refetch();
    for (const section of ["discussions", "assignments", "modules", "grades"]) {
      queryClient.invalidateQueries({ queryKey: queryKeys.courseSection(courseId, section) });
    }
  };

  const remove = async (group) => {
    if (!window.confirm(tf("groups.confirmDelete", { name: group.name }))) return;
    try {
      await apiFetch(`/courses/${courseId}/groups/${group.id}`, { method: "DELETE" });
      showToast(t("groups.deleted"), "success");
      changed();
    } catch {
      showToast(t("groups.deleteFailed"), "error");
    }
  };

  return (
    <div>
      <Breadcrumbs sectionKey="groups" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <PageHeader
          title={t("groups.title")}
          actions={staff && editing !== "new" ? (
            <Button onClick={() => setEditing("new")} className="h-9 gap-1.5">
              <Plus className="w-3.5 h-3.5" aria-hidden="true" /> {t("groups.newGroup")}
            </Button>
          ) : null}
        />

        {editing === "new" ? <GroupForm courseId={courseId} learners={learners} onDone={changed} onCancel={() => setEditing(null)} /> : null}

        {loading ? (
          <Loader variant="page" size={48} className="min-h-[20vh]" />
        ) : error ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4 flex items-center justify-between gap-3">
            <p className="text-ui text-danger-fg">{t("groups.loadFailed")}</p>
            <button type="button" onClick={refetch} className="text-caption font-semibold text-danger-fg">{t("common.retry")}</button>
          </div>
        ) : groups.length === 0 ? (
          <EmptyState compact title={staff ? t("groups.empty") : t("groups.emptyLearner")} />
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              editing === g.id ? (
                <GroupForm key={g.id} courseId={courseId} group={g} learners={learners} onDone={changed} onCancel={() => setEditing(null)} />
              ) : (
                <GroupCard key={g.id} courseId={courseId} group={g} staff={staff} onEdit={() => setEditing(g.id)} onDelete={() => remove(g)} />
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
