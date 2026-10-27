"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCourseSection } from "@/lib/useCourseSection";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Plus, Trash2, Sparkles, TrendingUp, CheckCircle2, Pencil } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, DataTable, EmptyState } from "@/components/layout";
import MasterySummary from "@/components/course/outcomes/MasterySummary";
import useAiStatus from "@/lib/useAiStatus";
import { startAiJob } from "@/lib/ai";
import { AiStatusNote, AiOffBadge } from "@/components/ai/AiBits";
import AiJobPanel from "@/components/ai/AiJobPanel";
import { useProgressText } from "@/components/progress/text";
import Loader from "@/components/ui/Loader";
import { Label, TextInput, Textarea } from "@/components/form";

const MASTERY_LEVELS = [
  { points: 4, level: "exceeds" },
  { points: 3, level: "meets" },
  { points: 2, level: "approaching" },
  { points: 1, level: "below" },
];

// Mastery statuses the server sends (English) -> translation keys.
const STATUS_KEYS = { "Needs Reteach": "needsReteach", "On Track": "onTrack", "Mastery Achieved": "masteryAchieved" };

export default function OutcomesPage() {
  const { SERVER_URL, courseId, isTeacher, isLearner } = useCourse();
  const { tp, tpn, tpOr } = useProgressText();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const outcomesQuery = useCourseSection("outcomes");
  const masteryQuery = useCourseSection("outcome-mastery");
  const outcomes = Array.isArray(outcomesQuery.data) ? outcomesQuery.data : [];
  const masteryData = masteryQuery.data;
  const loading = outcomesQuery.loading || masteryQuery.loading;
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", description: "" });
  const [aiGoal, setAiGoal] = useState("");
  const [saving, setSaving] = useState(false);
  // Manual edit of one outcome: { id, title, description } or null.
  const [editing, setEditing] = useState(null);
  const aiStatus = useAiStatus();
  // AI rewrite: target is null (a new outcome) or the outcome being rewritten.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiTarget, setAiTarget] = useState(null);
  const [aiJob, setAiJob] = useState(null);
  const [aiError, setAiError] = useState("");

  // Outcomes are tagged on items and shown on Home, the syllabus and the weeks: reload the course.
  const loadData = () => queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });

  const createOutcome = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      // Keep the form (and what the teacher typed) open when the save fails.
      const failed = await apiFetch(`/courses/${courseId}/outcomes`, { method: "POST", json: { title: form.title.trim(), description: form.description } })
        .then(() => false)
        .catch((err) => { showToast(err?.body?.message || tp("outcomes.saveFailed"), "error"); return true; });
      if (failed) return;
      setForm({ title: "", description: "" });
      setCreating(false);
      loadData();
    } catch {
      showToast(tp("outcomes.saveFailed"), "error");
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

  const saveEdit = async () => {
    if (!editing?.title.trim()) return;
    setSaving(true);
    try {
      const failed = await apiFetch(`/courses/${courseId}/outcomes/${editing.id}`, { method: "PATCH", json: { title: editing.title.trim(), description: editing.description } })
        .then(() => false)
        .catch((err) => { showToast(err?.body?.message || tp("outcomes.saveFailed"), "error"); return true; });
      if (failed) return;
      setEditing(null);
      loadData();
    } catch {
      showToast(tp("outcomes.saveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const removeOutcome = async (outcome) => {
    if (!window.confirm(tp("outcomes.confirmDelete", { name: [outcome.code, outcome.title].filter(Boolean).join(" ") }))) return;
    try {
      await apiFetch(`/courses/${courseId}/outcomes/${outcome.id}`, { method: "DELETE", json: {} });
    } catch (err) {
      if (err?.status === 0) showToast(tp("outcomes.deleteFailed"), "error");
      else showToast(err?.body?.message || tp("outcomes.deleteFailed"), "error", 8000);
      return;
    }
    loadData();
  };

  // The list comes from the mastery figures; if those didn't load, still list the outcomes
  // themselves (with no data) so they don't look deleted.
  const masteryList = Array.isArray(masteryData?.outcomes)
    ? masteryData.outcomes
    : (Array.isArray(outcomes) ? outcomes : []).map((o) => ({ ...o, status: null, currentMastery: null, baselineScore: null }));

  return (
    <div>
      <Breadcrumbs sectionKey="outcomes" />
      <div className="p-4 md:p-6 space-y-8 max-w-4xl">
        <PageHeader help="pages.outcomes"
          title={tp("outcomes.title")}
          description={isLearner ? undefined : tp("outcomes.description")}
          actions={isTeacher ? (
            <div className="flex flex-wrap items-center gap-2">
            {/* Write with AI sits next to New outcome so teachers find it without opening the form. */}
            {aiStatus.allowed ? (
              <button
                type="button"
                onClick={() => { setCreating(false); openAiRewrite(null); }}
                className="flex items-center gap-1.5 text-caption font-semibold text-brand-fg border border-brand/40 hover:bg-brand-soft rounded-lg px-3.5 py-2 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" /> {tp("outcomes.writeWithAi")}
              </button>
            ) : <AiOffBadge status={aiStatus} />}
            <button
              onClick={() => setCreating((v) => !v)}
              aria-expanded={creating}
              className="flex items-center gap-1.5 text-caption font-semibold text-on-brand bg-brand hover:bg-brand/90 rounded-lg px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> {tp("outcomes.newOutcome")}
            </button>
            </div>
          ) : null}
        />

        {isTeacher ? <AiStatusNote status={aiStatus} /> : null}

        {isTeacher && aiOpen ? (
          <Section
            title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-brand-fg" /> {aiTarget ? tp("outcomes.aiRewriteTitle", { code: aiTarget.code || tp("outcomes.outcomeWord") }) : tp("outcomes.aiWriteTitle")}</span>}
            description={tp("outcomes.aiDescription")}
            actions={<button type="button" onClick={() => setAiOpen(false)} className="text-caption font-semibold text-fg-subtle px-2 py-1">{tp("common.close")}</button>}
          >
            <div className="space-y-3">
              <form onSubmit={aiRewriteOutcome} className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[12rem]">
                  <Label htmlFor="ai-goal">
                    {aiTarget ? tp("outcomes.aiChangeLabel") : tp("outcomes.aiGoalLabel")}
                  </Label>
                  <Textarea id="ai-goal" rows={2} value={aiGoal} maxLength={500} onChange={(e) => setAiGoal(e.target.value)} placeholder={tp("outcomes.aiGoalPlaceholder")} className="w-full" />
                </div>
                <button
                  type="submit"
                  disabled={saving || !aiGoal.trim() || (aiJob && ["queued", "running"].includes(aiJob.status))}
                  className="flex items-center gap-1 text-caption font-semibold text-on-brand bg-brand hover:bg-brand/90 disabled:opacity-50 px-3.5 py-2 rounded-lg"
                >
                  <Sparkles className="w-3.5 h-3.5" /> {saving ? tp("common.starting") : tp("outcomes.draftWithAi")}
                </button>
              </form>
              {aiError ? <p role="alert" className="text-caption font-semibold text-danger-fg">{aiError}</p> : null}
              {aiJob ? (
                <AiJobPanel
                  key={aiJob.id}
                  SERVER_URL={SERVER_URL}
                  courseId={courseId}
                  job={aiJob}
                  label={aiTarget ? tp("outcomes.rewriting", { name: aiTarget.code || aiTarget.title }) : tp("outcomes.newOutcomeJob")}
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
            title={tp("outcomes.addTitle")}
            actions={aiStatus.allowed ? (
              <button
                type="button"
                onClick={() => openAiRewrite(null)}
                className="flex items-center gap-1 text-caption font-semibold text-on-brand-strong bg-brand-strong px-3 py-1.5 rounded-lg"
              >
                <Sparkles className="w-3.5 h-3.5 text-brand-fg" /> {tp("outcomes.writeWithAi")}
              </button>
            ) : null}
          >
            <div className="space-y-3">
              <div>
                <Label htmlFor="outcome-title">{tp("outcomes.statementLabel")}</Label>
                <TextInput id="outcome-title" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder={tp("outcomes.statementPlaceholder")} className="w-full" />
              </div>

              <div>
                <Label htmlFor="outcome-description">{tp("outcomes.descriptionLabel")}</Label>
                <Textarea id="outcome-description" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} placeholder={tp("outcomes.descriptionPlaceholder")} className="w-full" />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={() => setCreating(false)} className="text-caption font-semibold text-fg-subtle px-3 py-2">{tp("common.cancel")}</button>
                <button onClick={createOutcome} disabled={saving || !form.title.trim()} className="text-caption font-semibold text-on-brand bg-brand rounded-lg px-4 py-2">
                  {saving ? tp("common.saving") : tp("outcomes.save")}
                </button>
              </div>
            </div>
          </Section>
        )}

        {/* Mastery vs baseline: one list, a row per outcome with its mastery bar */}
        <Section
          divided={creating}
          title={<span className="flex items-center gap-2"><TrendingUp className="w-4 h-4 text-brand-fg" /> {isLearner ? tp("outcomes.masteryTitleLearner") : tp("outcomes.masteryTitle")}</span>}
        >
          {masteryList.length === 0 ? (
            loading ? (
              <Loader variant="page" size={48} className="min-h-[25vh]" label={tp("outcomes.loading")} />
            ) : (
              <EmptyState compact title={tp("outcomes.empty")} description={isTeacher ? tp("outcomes.emptyHint") : tp("outcomes.emptyHintLearner")} />
            )
          ) : (
            <List label={tp("outcomes.masteryList")}>
              {masteryList.map((m) => (
                <li key={m.id} className="px-3 py-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className="text-caption font-bold text-brand-fg bg-brand-soft border border-brand/40 px-2 py-0.5 rounded-md shrink-0">
                        {m.code}
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-ui font-bold text-fg">{m.title}</h3>
                        {m.description && <p className="text-caption text-fg-subtle mt-0.5">{m.description}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-caption font-bold px-2.5 py-1 rounded-full ${
                        m.status === null ? 'bg-surface-sunken text-fg-muted'
                          : m.status === 'Needs Reteach' ? 'bg-danger-soft text-danger-fg' : 'bg-brand-soft text-brand-fg'
                      }`}>
                        {m.status == null ? tp("common.noDataYet") : STATUS_KEYS[m.status] ? tpOr(`outcomes.status.${STATUS_KEYS[m.status]}`, m.status) : m.status}
                      </span>
                      {isTeacher && aiStatus.allowed ? (
                        <button
                          type="button"
                          onClick={() => openAiRewrite(outcomes.find((o) => Number(o.id) === Number(m.id)) || m)}
                          aria-label={tp("outcomes.rewriteAria", { name: m.code || m.title })}
                          title={tp("outcomes.rewriteWithAi")}
                          className="text-fg-subtle hover:text-brand-fg p-1"
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                      ) : null}
                      {isTeacher && (
                        <button
                          type="button"
                          onClick={() => setEditing({ id: m.id, title: m.title || "", description: m.description || "" })}
                          aria-label={tp("outcomes.editAria", { name: m.code || m.title })}
                          title={tp("common.edit")}
                          className="text-fg-subtle hover:text-brand-fg p-1"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {isTeacher && (
                        <button onClick={() => removeOutcome(m)} aria-label={tp("outcomes.deleteAria", { name: m.code || m.title })} className="text-fg-subtle hover:text-danger-fg p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {editing?.id === m.id ? (
                    <div className="space-y-2 border border-line rounded-lg p-3">
                      <div>
                        <Label htmlFor={`edit-outcome-title-${m.id}`}>{tp("outcomes.statementLabel")}</Label>
                        <TextInput id={`edit-outcome-title-${m.id}`} value={editing.title} onChange={(e) => setEditing((p) => ({ ...p, title: e.target.value }))} className="w-full" autoFocus />
                      </div>
                      <div>
                        <Label htmlFor={`edit-outcome-description-${m.id}`}>{tp("outcomes.descriptionLabel")}</Label>
                        <Textarea id={`edit-outcome-description-${m.id}`} rows={2} value={editing.description} onChange={(e) => setEditing((p) => ({ ...p, description: e.target.value }))} className="w-full" />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setEditing(null)} className="text-caption font-semibold text-fg-subtle px-3 py-2">{tp("common.cancel")}</button>
                        <button type="button" onClick={saveEdit} disabled={saving || !editing.title.trim()} className="text-caption font-semibold text-on-brand bg-brand disabled:opacity-50 rounded-lg px-4 py-2">
                          {saving ? tp("common.saving") : tp("outcomes.save")}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <MasterySummary outcome={m} isTeacher={isTeacher} />

                    <div className="w-full h-2.5 bg-line rounded-full overflow-hidden flex">
                      <div className="bg-line-strong h-full" style={{ width: `${m.baselineScore ?? 0}%` }} title={tp("outcomes.baselineBar")} />
                      <div className="bg-brand h-full" style={{ width: `${m.currentMastery === null ? 0 : Math.max(0, m.currentMastery - (m.baselineScore ?? 0))}%` }} title={tp("outcomes.growth")} />
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
          title={<span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-brand-fg" /> {tp("outcomes.levelsTitle")}</span>}
          description={tp("outcomes.levelsDescription")}
        >
          <DataTable
            caption={tp("outcomes.levelsTitle")}
            rowKey={(r) => r.points}
            rows={MASTERY_LEVELS}
            columns={[
              { key: "points", header: tp("common.points"), className: "font-bold text-brand-fg whitespace-nowrap", render: (r) => tpn("common.points", r.points) },
              { key: "level", header: tp("common.level"), className: "text-fg-muted", render: (r) => tp(`outcomes.levels.${r.level}`) },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
