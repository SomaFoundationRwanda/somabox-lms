"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";

export default function RubricsPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const { data: rubrics, loading, error, refetch } = useCourseSection("rubrics");
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [criteria, setCriteria] = useState([{ description: "", points: 10 }]);

  const addCriterion = () => setCriteria((p) => [...p, { description: "", points: 10 }]);
  const updateCriterion = (idx, patch) => setCriteria((p) => p.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const removeCriterion = (idx) => setCriteria((p) => p.filter((_, i) => i !== idx));

  const create = async () => {
    if (!title.trim()) return;
    await fetch(`${SERVER_URL}/courses/${courseId}/rubrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherEmail: userEmail, title: title.trim(), criteria }),
    });
    setTitle("");
    setCriteria([{ description: "", points: 10 }]);
    setCreating(false);
    refetch();
  };

  const remove = async (id) => {
    await fetch(`${SERVER_URL}/courses/${courseId}/rubrics/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherEmail: userEmail }),
    });
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="rubrics" />
      <div className="p-4 md:p-6 space-y-4 max-w-2xl">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">Rubrics</h1>
          {isTeacher ? (
            <button onClick={() => setCreating((v) => !v)} className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg px-3 py-2">
              <Plus className="w-3.5 h-3.5" /> New Rubric
            </button>
          ) : null}
        </div>

        {creating ? (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Rubric title" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
            {criteria.map((c, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input value={c.description} onChange={(e) => updateCriterion(idx, { description: e.target.value })} placeholder="Criterion description" className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none" />
                <input type="number" value={c.points} onChange={(e) => updateCriterion(idx, { points: Number(e.target.value) })} className="w-20 text-sm border border-slate-200 rounded-lg px-2 py-2" />
                <button onClick={() => removeCriterion(idx)} className="text-rose-500"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <button onClick={addCriterion} className="text-xs font-semibold text-[#203A3A] hover:underline">+ Add criterion</button>
              <button onClick={create} className="ml-auto text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2">Create</button>
            </div>
          </div>
        ) : null}

        {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!loading && !error && (!rubrics || rubrics.length === 0) ? <EmptyState message="No rubrics yet." /> : null}

        <div className="space-y-3">
          {(rubrics || []).map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-slate-800">{r.title}</p>
                {isTeacher ? <button onClick={() => remove(r.id)} className="text-rose-500"><Trash2 className="w-3.5 h-3.5" /></button> : null}
              </div>
              <div className="mt-1.5 space-y-1">
                {r.criteria.map((c, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-slate-600">
                    <span>{c.description}</span>
                    <span className="font-semibold">{c.points} pts</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
