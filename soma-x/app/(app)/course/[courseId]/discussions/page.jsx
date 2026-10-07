"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { Button } from "@/components/ui/button";
import { PageHeader, List, ListRow } from "@/components/layout";
import { moduleWeekLabel } from "@/lib/moduleLabels";

export default function DiscussionsListPage() {
  const { SERVER_URL, courseId } = useCourse();
  const { data: discussions, loading, error, refetch } = useCourseSection("discussions");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", moduleId: "" });
  const [modules, setModules] = useState([]);
  const [createError, setCreateError] = useState("");

  // Discussions must live in a module. Learners only receive published modules
  // from the API; the "unassigned" bucket is never a valid target.
  useEffect(() => {
    if (!creating || !SERVER_URL || !courseId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules`);
        if (!res.ok) return;
        const mods = await res.json();
        if (cancelled) return;
        const choices = (Array.isArray(mods) ? mods : []).filter((m) => m.kind !== "unassigned");
        setModules(choices);
        setForm((p) => (p.moduleId || choices.length === 0 ? p : { ...p, moduleId: choices[0].id }));
      } catch (err) {
        console.error(err);
      }
    })();
    return () => { cancelled = true; };
  }, [creating, SERVER_URL, courseId]);

  const create = async () => {
    if (!form.title.trim()) return;
    if (!form.moduleId) {
      setCreateError("Choose a module for this discussion.");
      return;
    }
    setCreateError("");
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/discussions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: form.title.trim(), body: form.body, moduleId: Number(form.moduleId) }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setCreateError(payload.message || "Failed to create discussion.");
      return;
    }
    setForm({ title: "", body: "", moduleId: "" });
    setCreating(false);
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="discussions" />
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
        <PageHeader help="pages.discussions"
          title="Discussions"
          actions={
            <Button onClick={() => setCreating((v) => !v)} className="h-9 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Discussion
            </Button>
          }
        />

        {creating ? (
          <div className="space-y-2">
            <select
              value={form.moduleId}
              onChange={(e) => setForm((p) => ({ ...p, moduleId: e.target.value }))}
              aria-label="Module"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none bg-white"
            >
              <option value="" disabled>{modules.length === 0 ? "No modules available" : "Choose a module *"}</option>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {moduleWeekLabel(m)}: {m.title}
                </option>
              ))}
            </select>
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" aria-label="Discussion title" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            <textarea value={form.body} onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))} rows={3} placeholder="Start the discussion..." aria-label="Discussion prompt" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            {createError ? <p className="text-xs font-semibold text-rose-600">{createError}</p> : null}
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="text-xs font-medium text-slate-500 px-3 py-2">Cancel</button>
              <button onClick={create} disabled={!form.title.trim() || !form.moduleId} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2 disabled:opacity-50">Post</button>
            </div>
          </div>
        ) : null}

        <AsyncListState loading={loading} error={error} data={discussions} onRetry={refetch} emptyMessage="No discussions yet.">
          {(list) => (
            <List label="Discussions">
              {list.map((d) => (
                <ListRow
                  key={d.id}
                  icon={<MessageSquare className="w-4 h-4" />}
                  href={`/course/${courseId}/discussions/${d.id}`}
                  title={
                    <span className="inline-flex items-center gap-2 min-w-0">
                      <span className="truncate">{d.title}</span>
                      {d.graded ? <span className="text-[10px] font-bold uppercase text-teal-600 bg-teal-50 rounded-full px-1.5 py-0.5 shrink-0">Graded</span> : null}
                    </span>
                  }
                  actions={<span className="text-xs text-slate-400">{d.replyCount} repl{d.replyCount === 1 ? "y" : "ies"}</span>}
                />
              ))}
            </List>
          )}
        </AsyncListState>
      </div>
    </div>
  );
}
