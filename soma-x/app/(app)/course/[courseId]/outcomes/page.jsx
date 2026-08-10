"use client";

import { useState } from "react";
import { Plus, Target, Trash2 } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { Button } from "@/components/ui/button";

const MASTERY_SCALES = [
  { value: "4pt", label: "4-point (Exceeds / Meets / Approaching / Below)" },
  { value: "percent", label: "Percentage (0-100%)" },
  { value: "pass_fail", label: "Pass / Fail" },
];

export default function OutcomesPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const { data: outcomes, loading, error, refetch } = useCourseSection("outcomes");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", masteryScale: "4pt" });
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await fetch(`${SERVER_URL}/courses/${courseId}/outcomes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherEmail: userEmail, title: form.title.trim(), description: form.description, masteryScale: form.masteryScale }),
      });
      setForm({ title: "", description: "", masteryScale: "4pt" });
      setCreating(false);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    await fetch(`${SERVER_URL}/courses/${courseId}/outcomes/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherEmail: userEmail }),
    });
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="outcomes" />
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">Outcomes</h1>
          {isTeacher ? (
            <Button onClick={() => setCreating((v) => !v)} className="h-9 gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Outcome
            </Button>
          ) : null}
        </div>

        {creating ? (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <input
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Outcome title (e.g. Can solve linear equations)"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
            />
            <textarea
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              rows={2}
              placeholder="What does mastering this look like?"
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
            />
            <select
              value={form.masteryScale}
              onChange={(e) => setForm((p) => ({ ...p, masteryScale: e.target.value }))}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none bg-white"
            >
              {MASTERY_SCALES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreating(false)} className="text-xs font-medium text-slate-500 px-3 py-2">Cancel</button>
              <button onClick={create} disabled={saving || !form.title.trim()} className="text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2 disabled:opacity-50">
                {saving ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        ) : null}

        <AsyncListState loading={loading} error={error} data={outcomes} onRetry={refetch} emptyMessage="No learning outcomes defined yet.">
          {(list) => (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
              {list.map((o) => (
                <div key={o.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="flex items-start gap-2 min-w-0">
                    <Target className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700">{o.title}</p>
                      {o.description ? <p className="text-xs text-slate-500 mt-0.5">{o.description}</p> : null}
                      <span className="inline-block mt-1 text-[10px] font-semibold uppercase text-slate-400 bg-slate-100 rounded-full px-2 py-0.5">
                        {MASTERY_SCALES.find((s) => s.value === o.mastery_scale)?.label.split(" (")[0] || o.mastery_scale || "4-point"}
                      </span>
                    </div>
                  </div>
                  {isTeacher ? (
                    <button onClick={() => remove(o.id)} className="text-rose-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </AsyncListState>
      </div>
    </div>
  );
}
