"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HelpCircle, Plus, Target, Layers, Clock } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";

export default function QuizzesListPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const [quizzes, setQuizzes] = useState([]);
  const [modules, setModules] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", moduleId: "", releaseDay: 0, dueDay: 7, outcomeId: "" });

  const loadData = async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      setLoading(true);
      const [quizRes, modRes, outRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}/quizzes?userEmail=${encodeURIComponent(userEmail)}`),
        fetch(`${SERVER_URL}/courses/${courseId}/modules?userEmail=${encodeURIComponent(userEmail)}`),
        fetch(`${SERVER_URL}/courses/${courseId}/outcomes?userEmail=${encodeURIComponent(userEmail)}`),
      ]);

      if (quizRes.ok) setQuizzes(await quizRes.json());
      if (modRes.ok) {
        const mods = await modRes.json();
        setModules(mods);
        if (mods.length > 0) setForm(p => ({ ...p, moduleId: mods[0].id }));
      }
      if (outRes.ok) {
        const outs = await outRes.json();
        setOutcomes(outs);
        if (outs.length > 0) setForm(p => ({ ...p, outcomeId: outs[0].id }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [SERVER_URL, courseId, userEmail]);

  const createQuiz = async () => {
    if (!form.title.trim() || !form.moduleId) return;
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${form.moduleId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherEmail: userEmail,
          itemType: "quiz",
          title: form.title.trim(),
          releaseDay: Number(form.releaseDay) || 0,
          dueDay: Number(form.dueDay) || 7,
        }),
      });

      const data = await res.json();
      if (res.ok && form.outcomeId && data.content_ref_id) {
        await fetch(`${SERVER_URL}/courses/${courseId}/item-outcomes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teacherEmail: userEmail,
            itemType: "quiz",
            itemId: data.content_ref_id,
            outcomeIds: [Number(form.outcomeId)]
          })
        });
      }

      setForm({ title: "", moduleId: modules[0]?.id || "", releaseDay: 0, dueDay: 7, outcomeId: outcomes[0]?.id || "" });
      setCreating(false);
      loadData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <Breadcrumbs sectionKey="quizzes" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-[#0D9488]" /> Course Quizzes
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Quizzes are bound to weekly modules and assess tagged outcome baselines.
            </p>
          </div>
          {isTeacher ? (
            <button
              onClick={() => setCreating((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 rounded-xl px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Quiz
            </button>
          ) : null}
        </div>

        {/* CREATION FORM WITH MODULE BINDING */}
        {creating && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
            <h3 className="text-sm font-bold text-slate-800">Add Quiz to Module Slot</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Title *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Quiz title"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0D9488]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Target Module *</label>
                  <select
                    value={form.moduleId}
                    onChange={(e) => setForm((p) => ({ ...p, moduleId: Number(e.target.value) }))}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none"
                  >
                    {modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        Week {m.week_offset || 1}: {m.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Tag Outcome *</label>
                  <select
                    value={form.outcomeId}
                    onChange={(e) => setForm((p) => ({ ...p, outcomeId: Number(e.target.value) }))}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white outline-none"
                  >
                    {outcomes.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.code || `OUT-${o.id}`}: {o.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Due Day Offset</label>
                  <input
                    type="number"
                    min="1"
                    value={form.dueDay}
                    onChange={(e) => setForm((p) => ({ ...p, dueDay: e.target.value }))}
                    className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setCreating(false)} className="text-xs font-semibold text-slate-500 px-3 py-2">Cancel</button>
                <button onClick={createQuiz} disabled={!form.title.trim() || !form.moduleId} className="text-xs font-bold text-white bg-[#0D9488] rounded-xl px-4 py-2">
                  Create Quiz
                </button>
              </div>
            </div>
          </div>
        )}

        {/* QUIZZES LIST */}
        <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm">
          {quizzes.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">No quizzes created yet.</div>
          ) : (
            quizzes.map((q) => (
              <Link key={q.id} href={`/course/${courseId}/quizzes/${q.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50/80 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <HelpCircle className="w-4 h-4 text-[#0D9488] shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-900 truncate">{q.title}</p>
                    <p className="text-xs text-slate-500">
                      {q.questionCount || 0} question(s) · {q.due_at ? `Due ${new Date(q.due_at).toLocaleDateString()}` : "Relative Timing Active"}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-[#0D9488] shrink-0 bg-teal-50 px-3 py-1 rounded-full border border-teal-200">
                  Open Quiz &rarr;
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
