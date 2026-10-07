"use client";

import { useEffect, useState } from "react";
import { Plus, Target, Trash2, Sparkles, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";

export default function OutcomesPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const [outcomes, setOutcomes] = useState([]);
  const [masteryData, setMasteryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });
  const [aiGoal, setAiGoal] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      setLoading(true);
      const [outRes, mastRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}/outcomes?userEmail=${encodeURIComponent(userEmail)}`),
        fetch(`${SERVER_URL}/courses/${courseId}/outcome-mastery?userEmail=${encodeURIComponent(userEmail)}`),
      ]);

      if (outRes.ok) setOutcomes(await outRes.json());
      if (mastRes.ok) setMasteryData(await mastRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [SERVER_URL, courseId, userEmail]);

  const createOutcome = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await fetch(`${SERVER_URL}/courses/${courseId}/outcomes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherEmail: userEmail,
          title: form.title.trim(),
          description: form.description,
        }),
      });
      setForm({ title: "", description: "" });
      setCreating(false);
      loadData();
    } finally {
      setSaving(false);
    }
  };

  const aiRewriteOutcome = async () => {
    if (!aiGoal.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/ai/rewrite-outcomes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherEmail: userEmail, goal: aiGoal }),
      });
      const data = await res.json();
      if (res.ok) {
        setForm({ title: data.title, description: data.description });
        setAiGoal("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const removeOutcome = async (id) => {
    await fetch(`${SERVER_URL}/courses/${courseId}/outcomes/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teacherEmail: userEmail }),
    });
    loadData();
  };

  const masteryList = masteryData?.outcomes || [];

  return (
    <div>
      <Breadcrumbs sectionKey="outcomes" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Target className="w-5 h-5 text-[#0D9488]" /> Learning Outcomes & Mastery Pulse
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Outcomes define mastery standards. Baseline assessment (Week 0) vs real-time student mastery tracking.
            </p>
          </div>
          {isTeacher ? (
            <button
              onClick={() => setCreating((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 rounded-xl px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Outcome
            </button>
          ) : null}
        </div>

        {/* AI Assistant form */}
        {creating && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-800">Add Learning Outcome</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type vague goal (e.g. learn algebra)"
                  value={aiGoal}
                  onChange={(e) => setAiGoal(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none"
                />
                <button
                  onClick={aiRewriteOutcome}
                  disabled={saving || !aiGoal.trim()}
                  className="flex items-center gap-1 text-xs font-semibold text-white bg-[#203A3A] px-3 py-1.5 rounded-lg"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" /> AI Refine Goal
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Measurable Outcome Statement *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Can solve linear equations with two variables independently"
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0D9488]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Description / Mastery Level Criteria</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Describe what mastery looks like..."
                  className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0D9488]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setCreating(false)} className="text-xs font-semibold text-slate-500 px-3 py-2">Cancel</button>
                <button onClick={createOutcome} disabled={saving || !form.title.trim()} className="text-xs font-semibold text-white bg-[#0D9488] rounded-xl px-4 py-2">
                  {saving ? "Saving..." : "Save Outcome"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MASTERY VS BASELINE SUMMARY GRID */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#0D9488]" /> Outcome Mastery vs Week 0 Baseline
          </h2>

          <div className="space-y-4">
            {masteryList.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-2xl">
                No learning outcomes defined yet. Add outcomes to start tracking baseline vs current student mastery.
              </div>
            ) : (
              masteryList.map((m) => (
                <div key={m.id} className="p-4 border border-slate-200 rounded-2xl space-y-2 bg-slate-50/50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-xs font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md shrink-0">
                        {m.code}
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-slate-900 truncate">{m.title}</h4>
                        {m.description && <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        m.status === 'Needs Reteach' ? 'bg-rose-100 text-rose-700' : 'bg-teal-100 text-teal-800'
                      }`}>
                        {m.status}
                      </span>
                      {isTeacher && (
                        <button onClick={() => removeOutcome(m.id)} className="text-slate-400 hover:text-rose-500 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar comparison */}
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between text-xs text-slate-600 font-medium">
                      <span>Baseline (Week 0): <strong>{m.baselineScore}%</strong></span>
                      <span>Current Mastery: <strong>{m.currentMastery}%</strong> ({m.delta})</span>
                    </div>

                    <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden flex">
                      <div className="bg-slate-400 h-full" style={{ width: `${m.baselineScore}%` }} title="Week 0 Baseline" />
                      <div className="bg-[#0D9488] h-full" style={{ width: `${Math.max(0, m.currentMastery - m.baselineScore)}%` }} title="Growth" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* MASTERY LEVELS SKELETON EXPLANATION */}
        <div className="bg-teal-50/60 border border-teal-200/80 rounded-2xl p-5 space-y-2 text-xs text-teal-900">
          <h3 className="font-bold flex items-center gap-1.5 text-teal-950">
            <CheckCircle2 className="w-4 h-4 text-[#0D9488]" /> Outcome Mastery Levels Skeleton
          </h3>
          <p>
            When assignments are graded in this course, scores instantiate rubrics directly from these outcome mastery levels:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            <div className="p-2 bg-white rounded-xl border border-teal-200 font-medium text-center">
              <span className="block font-bold text-teal-800">4 Points</span> Exceeds Mastery
            </div>
            <div className="p-2 bg-white rounded-xl border border-teal-200 font-medium text-center">
              <span className="block font-bold text-teal-800">3 Points</span> Meets Mastery
            </div>
            <div className="p-2 bg-white rounded-xl border border-teal-200 font-medium text-center">
              <span className="block font-bold text-teal-800">2 Points</span> Approaching Mastery
            </div>
            <div className="p-2 bg-white rounded-xl border border-teal-200 font-medium text-center">
              <span className="block font-bold text-teal-800">1 Point</span> Below Mastery
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
