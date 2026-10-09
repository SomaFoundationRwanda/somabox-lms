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

export default function CollaborationsPage() {
  const { SERVER_URL, courseId, userEmail } = useCourse();
  const { t, tf, tOr } = useCourseText();
  const { data: collaborations, loading, error, refetch } = useCourseSection("collaborations");
  const { data: people } = useCourseSection("people");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", url: "" });
  const [memberEmails, setMemberEmails] = useState([]);
  const [saving, setSaving] = useState(false);

  const toggleMember = (email) => {
    setMemberEmails((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));
  };

  const create = async () => {
    if (!form.title.trim() || !form.url.trim()) return;
    setSaving(true);
    try {
      await fetch(`${SERVER_URL}/courses/${courseId}/collaborations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title.trim(), url: form.url.trim(), memberEmails }),
      });
      setForm({ title: "", url: "" });
      setMemberEmails([]);
      setCreating(false);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    await fetch(`${SERVER_URL}/courses/${courseId}/collaborations/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="collaborations" />
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
        <PageHeader help="pages.collaborations"
          title={t("nav.collaborations")}
          description={t("collab.description")}
          actions={
            <Button onClick={() => setCreating((v) => !v)} className="h-9 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> {t("collab.new")}
            </Button>
          }
        />

        {creating ? (
          <div className="space-y-3">
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder={t("collab.titlePlaceholder")}
              aria-label={t("collab.titleLabel")}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[var(--brand-primary)]"
            />
            <input
              value={form.url}
              onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
              placeholder="https://docs.google.com/..."
              aria-label={t("collab.link")}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[var(--brand-primary)]"
            />
            <fieldset>
              <legend className="text-xs font-semibold text-slate-600 mb-1.5">{t("collab.whoCanAccess")}</legend>
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {(people || []).map((person) => (
                  <label key={person.email} className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={memberEmails.includes(person.email)} onChange={() => toggleMember(person.email)} />
                    {person.fullName} <span className="text-xs text-slate-400">({tOr(`people.roles.${person.role}`, person.role)})</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="text-xs font-medium text-slate-500 px-3 py-2">{t("common.cancel")}</button>
              <button onClick={create} disabled={saving || !form.title.trim() || !form.url.trim()} className="text-xs font-semibold text-white bg-[var(--brand-primary)] rounded-lg px-3 py-2 disabled:opacity-50">
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
                  <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 hover:text-[var(--brand-primary)] min-w-0">
                    <Share2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{c.title}</span>
                    <ExternalLink className="w-3 h-3 text-slate-300 shrink-0" />
                  </a>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.memberCount != null ? (
                      <span className="text-xs text-slate-400">{c.memberCount > 0 ? tf(c.memberCount === 1 ? "collab.oneMember" : "collab.manyMembers", { n: c.memberCount }) : t("collab.everyone")}</span>
                    ) : null}
                    {normalizeEq(c.created_by, userEmail) ? (
                      <button onClick={() => remove(c.id)} aria-label={tf("modules.deleteNamed", { title: c.title })} className="text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
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
