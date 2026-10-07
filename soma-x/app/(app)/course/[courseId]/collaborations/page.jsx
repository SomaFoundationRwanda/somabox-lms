"use client";

import { useState } from "react";
import { ExternalLink, Plus, Share2, Trash2 } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { Button } from "@/components/ui/button";
import { PageHeader, List } from "@/components/layout";

export default function CollaborationsPage() {
  const { SERVER_URL, courseId, userEmail } = useCourse();
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
        <PageHeader
          title="Collaborations"
          description="Share a link to an external doc, sheet, or board with specific course members."
          actions={
            <Button onClick={() => setCreating((v) => !v)} className="h-9 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Collaboration
            </Button>
          }
        />

        {creating ? (
          <div className="space-y-3">
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Title (e.g. Lab Report — Group A)"
              aria-label="Collaboration title"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
            />
            <input
              value={form.url}
              onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
              placeholder="https://docs.google.com/..."
              aria-label="Link"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
            />
            <fieldset>
              <legend className="text-xs font-semibold text-slate-600 mb-1.5">Who can access this? (leave empty for everyone in the course)</legend>
              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {(people || []).map((person) => (
                  <label key={person.email} className="flex items-center gap-2 px-2.5 py-1.5 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={memberEmails.includes(person.email)} onChange={() => toggleMember(person.email)} />
                    {person.fullName} <span className="text-xs text-slate-400">({person.role})</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="text-xs font-medium text-slate-500 px-3 py-2">Cancel</button>
              <button onClick={create} disabled={saving || !form.title.trim() || !form.url.trim()} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2 disabled:opacity-50">
                {saving ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        ) : null}

        <AsyncListState loading={loading} error={error} data={collaborations} onRetry={refetch} emptyMessage="No collaborations shared yet.">
          {(list) => (
            <List label="Collaborations">
              {list.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <a href={c.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 hover:text-[#203A3A] min-w-0">
                    <Share2 className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{c.title}</span>
                    <ExternalLink className="w-3 h-3 text-slate-300 shrink-0" />
                  </a>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.memberCount != null ? (
                      <span className="text-xs text-slate-400">{c.memberCount > 0 ? `${c.memberCount} member${c.memberCount === 1 ? "" : "s"}` : "Everyone"}</span>
                    ) : null}
                    {normalizeEq(c.created_by, userEmail) ? (
                      <button onClick={() => remove(c.id)} aria-label={`Delete ${c.title}`} className="text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button>
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
