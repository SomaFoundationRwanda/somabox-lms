"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Sparkles, TrendingUp, CheckCircle2 } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, DataTable, EmptyState } from "@/components/layout";
import MasterySummary from "@/components/course/outcomes/MasterySummary";
import useAiStatus from "@/lib/useAiStatus";
import { startAiJob } from "@/lib/ai";
import { AiStatusNote } from "@/components/ai/AiBits";
import AiJobPanel from "@/components/ai/AiJobPanel";

const MASTERY_LEVELS = [
  { points: "4 pts", level: "Exceeds Mastery" },
  { points: "3 pts", level: "Meets Mastery" },
  { points: "2 pts", level: "Approaching Mastery" },
  { points: "1 pt", level: "Below Mastery" },
];

export default function OutcomesPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const [outcomes, setOutcomes] = useState([]);
  const [masteryData, setMasteryData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });
  const [aiGoal, setAiGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const aiStatus = useAiStatus();
  // AI rewrite: target is null (a new outcome) or the outcome being rewritten.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState(null);
  const [aiJob, setAiJob] = useState(null);
  const [aiError, setAiError] = useState("");

  const loadData = async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      setLoading(true);
      const [outRes, mastRes] = await Promise.all([
        fetch(`${SERVER_URL}/courses/${courseId}/outcomes`),
        fetch(`${SERVER_URL}/courses/${courseId}/outcome-mastery`),
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

  const openAiRewrite = (outcome) => {
    setAiTarget(outcome || null);
    setAiGoal(outcome ? [outcome.title, outcome.description].filter(Boolean).join(". ") : "");
    setAiJob(null);
    setAiError("");
    setAiOpen(true);
  };

  const aiRewriteOutcome = async (e) => {
    e?.preventDefault();
    if (!aiGoal.trim()) return;
    setSaving(true);
    setAiError("");
    const r = await startAiJob(SERVER_URL, courseId, {
      kind: "outcome_rewrite",
      input: { goal: aiGoal.trim(), ...(aiTarget ? { outcomeId: aiTarget.id } : {}) },
    });
    setSaving(false);
    if (!r.ok) { setAiError(r.message); return; }
    setAiJob(r.data);
  };

  const removeOutcome = async (id) => {
    await fetch(`${SERVER_URL}/courses/${courseId}/outcomes/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    loadData();
  };

  const masteryList = masteryData?.outcomes || [];

  return (
    <div>
      <Breadcrumbs sectionKey="outcomes" />
      <div className="p-4 md:p-6 space-y-8 max-w-4xl">
        <PageHeader help="pages.outcomes"
          title="Learning outcomes & mastery"
          description="Outcomes define mastery standards. Baseline assessment (Week 0) vs real-time student mastery tracking."
          actions={isTeacher ? (
            <button
              onClick={() => setCreating((v) => !v)}
              aria-expanded={creating}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 rounded-lg px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Outcome
            </button>
          ) : null}
        />

        {isTeacher ? <AiStatusNote status={aiStatus} /> : null}

        {isTeacher && aiOpen ? (
          <Section
            title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#0D9488]" /> {aiTarget ? `Rewrite ${aiTarget.code || "outcome"} with AI` : "Write an outcome with AI"}</span>}
            description="The AI turns your goal into a measurable outcome with four mastery levels. It's a draft: nothing changes until you add it."
            actions={<button type="button" onClick={() => setAiOpen(false)} className="text-xs font-semibold text-slate-500 px-2 py-1">Close</button>}
          >
            <div className="space-y-3">
              <form onSubmit={aiRewriteOutcome} className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[12rem]">
                  <label htmlFor="ai-goal" className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {aiTarget ? "What should change? (start from the current wording)" : "Your goal, in your own words"}
                  </label>
                  <textarea
                    id="ai-goal"
                    rows={2}
                    value={aiGoal}
                    maxLength={500}
                    onChange={(e) => setAiGoal(e.target.value)}
                    placeholder="e.g. learners can add fractions"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving || !aiGoal.trim() || (aiJob && ["queued", "running"].includes(aiJob.status))}
                  className="flex items-center gap-1 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 disabled:opacity-50 px-3.5 py-2 rounded-lg"
                >
                  <Sparkles className="w-3.5 h-3.5" /> {saving ? "Starting…" : "Draft with AI"}
                </button>
              </form>
              {aiError ? <p role="alert" className="text-xs font-semibold text-rose-600">{aiError}</p> : null}
              {aiJob ? (
                <AiJobPanel
                  key={aiJob.id}
                  SERVER_URL={SERVER_URL}
                  courseId={courseId}
                  job={aiJob}
                  label={aiTarget ? `Rewriting ${aiTarget.code || aiTarget.title}` : "New outcome"}
                  outcomes={outcomes}
                  onApproved={() => loadData()}
                  onClose={() => setAiJob(null)}
                />
              ) : null}
            </div>
          </Section>
        ) : null}

        {/* Add outcome form (flat section) */}
        {creating && (
          <Section
            title="Add learning outcome"
            actions={aiStatus.allowed ? (
              <button
                type="button"
                onClick={() => openAiRewrite(null)}
                className="flex items-center gap-1 text-xs font-semibold text-white bg-[#203A3A] px-3 py-1.5 rounded-lg"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-400" /> Write it with AI
              </button>
            ) : null}
          >
            <div className="space-y-3">
              <div>
                <label htmlFor="outcome-title" className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Measurable Outcome Statement *</label>
                <input
                  id="outcome-title"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="e.g. Can solve linear equations with two variables independently"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488]"
                />
              </div>

              <div>
                <label htmlFor="outcome-description" className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">Description / Mastery Level Criteria</label>
                <textarea
                  id="outcome-description"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  rows={2}
                  placeholder="Describe what mastery looks like..."
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0D9488]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setCreating(false)} className="text-xs font-semibold text-slate-500 px-3 py-2">Cancel</button>
                <button onClick={createOutcome} disabled={saving || !form.title.trim()} className="text-xs font-semibold text-white bg-[#0D9488] rounded-lg px-4 py-2">
                  {saving ? "Saving..." : "Save Outcome"}
                </button>
              </div>
            </div>
          </Section>
        )}

        {/* Mastery vs baseline: one list, a row per outcome with its mastery bar */}
        <Section
          divided={creating}
          title={<span className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-[#0D9488]" /> Outcome mastery vs Week 0 baseline</span>}
        >
          {masteryList.length === 0 ? (
            <EmptyState
              compact
              title={loading ? "Loading outcomes..." : "No learning outcomes defined yet."}
              description={loading ? undefined : "Add outcomes to start tracking baseline vs current student mastery."}
            />
          ) : (
            <List label="Outcome mastery">
              {masteryList.map((m) => (
                <li key={m.id} className="px-3 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-xs font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md shrink-0">
                        {m.code}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white">{m.title}</h3>
                        {m.description && <p className="text-xs text-slate-500 mt-0.5">{m.description}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                        m.status === null ? 'bg-slate-100 text-slate-600'
                          : m.status === 'Needs Reteach' ? 'bg-rose-100 text-rose-700' : 'bg-teal-100 text-teal-800'
                      }`}>
                        {m.status ?? "No data yet"}
                      </span>
                      {isTeacher && aiStatus.allowed ? (
                        <button
                          type="button"
                          onClick={() => openAiRewrite(outcomes.find((o) => Number(o.id) === Number(m.id)) || m)}
                          aria-label={`Rewrite outcome ${m.code || m.title} with AI`}
                          title="Rewrite with AI"
                          className="text-slate-400 hover:text-[#0D9488] p-1"
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                      ) : null}
                      {isTeacher && (
                        <button onClick={() => removeOutcome(m.id)} aria-label={`Delete outcome ${m.code || m.title}`} className="text-slate-400 hover:text-rose-500 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <MasterySummary outcome={m} isTeacher={isTeacher} />

                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
                      <div className="bg-slate-400 h-full" style={{ width: `${m.baselineScore ?? 0}%` }} title="Week 0 Baseline" />
                      <div className="bg-[#0D9488] h-full" style={{ width: `${m.currentMastery === null ? 0 : Math.max(0, m.currentMastery - (m.baselineScore ?? 0))}%` }} title="Growth" />
                    </div>
                  </div>
                </li>
              ))}
            </List>
          )}
        </Section>

        {/* Mastery levels reference */}
        <Section
          divided
          title={<span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-[#0D9488]" /> Outcome mastery levels</span>}
          description="When assignments are graded in this course, scores instantiate rubrics directly from these outcome mastery levels."
        >
          <DataTable
            caption="Outcome mastery levels"
            rowKey={(r) => r.points}
            rows={MASTERY_LEVELS}
            columns={[
              { key: "points", header: "Points", className: "font-bold text-teal-800 dark:text-teal-300 whitespace-nowrap" },
              { key: "level", header: "Level", className: "text-slate-700 dark:text-slate-300" },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
