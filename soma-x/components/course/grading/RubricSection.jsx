"use client";

import { useState } from "react";
import { Award, ArrowUp, ArrowDown, Plus, Trash2, Pencil, Sparkles } from "lucide-react";
import { Section, DataTable, EmptyState } from "@/components/layout";
import { useToast } from "@/context/ToastContext";
import { fmtPoints } from "@/lib/rubric";
import useAiStatus from "@/lib/useAiStatus";
import { startAiJob, aiFetch } from "@/lib/ai";
import { AiStatusNote } from "@/components/ai/AiBits";
import AiJobPanel from "@/components/ai/AiJobPanel";
import { useProgressText } from "@/components/progress/text";

let draftSeq = 0;
const newKey = () => `draft-${++draftSeq}`;

const emptyRow = (outcome) => ({
  key: newKey(),
  title: outcome ? outcome.title || outcome.code || "" : "",
  description: "",
  points: 4,
  weight: 1,
  outcomeId: outcome ? String(outcome.id) : "",
});

const inputClass = "w-full text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-1.5 outline-none focus:border-[#0D9488]";

// Teacher rubric for one assignment: read-only table, or an editor that PUTs the whole rubric.
// `taggedOutcomes` are this assignment's outcome tags ({ outcome_id, outcome_code, outcome_title })
// used to seed a new rubric with one row per outcome.
export default function RubricSection({ SERVER_URL, courseId, assignmentId, rubric, outcomes, taggedOutcomes, pointsPossible, onChange }) {
  const { showToast } = useToast();
  const { tp } = useProgressText();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const base = `${SERVER_URL}/courses/${courseId}/assignments/${assignmentId}/rubric`;

  // AI: draft a rubric for this assignment, reviewed inline before it replaces anything.
  const aiStatus = useAiStatus();
  const [aiJob, setAiJob] = useState(null);
  const [aiStarting, setAiStarting] = useState(false);
  const aiRunning = !!aiJob && ["queued", "running"].includes(aiJob.status);
  const startAiRubric = async () => {
    setAiStarting(true);
    const r = await startAiJob(SERVER_URL, courseId, { kind: "rubric", assignmentId: Number(assignmentId) });
    setAiStarting(false);
    if (!r.ok) { showToast(r.message, "error"); return; }
    setAiJob(r.data);
  };
  const afterAiApproved = async () => {
    const r = await aiFetch(base);
    onChange?.(r.ok ? r.data : null);
  };
  const aiButton = aiStatus.allowed ? (
    <button type="button" onClick={startAiRubric} disabled={aiStarting || aiRunning} className="inline-flex items-center gap-1.5 text-xs font-semibold text-violet-800 dark:text-violet-200 border border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50 px-3 py-1.5 rounded-lg">
      <Sparkles className="w-3.5 h-3.5" /> {aiStarting ? tp("common.starting") : tp("rubric.draftWithAi")}
    </button>
  ) : null;
  const aiPanel = (
    <>
      <AiStatusNote status={aiStatus} className="mb-2" />
      {aiJob ? (
        <div className="mb-3">
          <AiJobPanel
            key={aiJob.id}
            SERVER_URL={SERVER_URL}
            courseId={courseId}
            job={aiJob}
            label={tp("rubric.aiLabel")}
            outcomes={outcomes}
            confirmApprove={() => (rubric ? tp("rubric.confirmReplace") : null)}
            onApproved={afterAiApproved}
            onClose={() => setAiJob(null)}
          />
        </div>
      ) : null}
    </>
  );

  const startEdit = () => {
    setError("");
    if (rubric) {
      setTitle(rubric.title || "");
      setRows((rubric.criteria || []).map((c) => ({
        key: newKey(),
        title: c.title || "",
        description: c.description || "",
        points: c.points ?? 4,
        weight: c.weight ?? 1,
        outcomeId: c.outcome_id != null ? String(c.outcome_id) : "",
      })));
    } else {
      setTitle("");
      const seeded = (taggedOutcomes || []).map((t) => emptyRow({ id: t.outcome_id, title: t.outcome_title, code: t.outcome_code }));
      setRows(seeded.length ? seeded : [emptyRow()]);
    }
    setEditing(true);
  };

  const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (idx, dir) => setRows((rs) => {
    const j = idx + dir;
    if (j < 0 || j >= rs.length) return rs;
    const next = [...rs];
    [next[idx], next[j]] = [next[j], next[idx]];
    return next;
  });
  const remove = (key) => setRows((rs) => rs.filter((r) => r.key !== key));

  const save = async () => {
    setError("");
    if (rows.length === 0) { setError(tp("rubric.addOne")); return; }
    for (const [i, r] of rows.entries()) {
      if (!r.title.trim()) { setError(tp("rubric.needsTitle", { n: i + 1 })); return; }
      if (!(Number(r.points) >= 0) || r.points === "") { setError(tp("rubric.maxPointsInvalid", { n: i + 1 })); return; }
      if (r.weight !== "" && !(Number(r.weight) > 0)) { setError(tp("rubric.weightInvalid", { n: i + 1 })); return; }
    }
    setSaving(true);
    try {
      const res = await fetch(base, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(title.trim() ? { title: title.trim() } : {}),
          criteria: rows.map((r) => ({
            title: r.title.trim(),
            description: r.description,
            points: Number(r.points),
            weight: r.weight === "" ? 1 : Number(r.weight),
            ...(r.outcomeId ? { outcomeId: Number(r.outcomeId) } : {}),
          })),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) { setError(payload.message || tp("rubric.saveFailed")); return; }
      showToast(tp("rubric.saved"), "success");
      setEditing(false);
      onChange?.(payload);
    } catch (err) {
      setError(err.message || tp("rubric.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const removeRubric = async () => {
    if (!window.confirm(tp("rubric.confirmRemove"))) return;
    setSaving(true);
    try {
      const res = await fetch(base, { method: "DELETE" });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        showToast(payload.message || tp("rubric.removeFailed"), "error");
        return;
      }
      showToast(tp("rubric.removed"), "success");
      setEditing(false);
      onChange?.(null);
    } catch (err) {
      showToast(err.message || tp("rubric.removeFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const heading = <span className="flex items-center gap-2"><Award className="w-4 h-4 text-[#0D9488]" /> {tp("rubric.title")}</span>;

  if (editing) {
    return (
      <Section divided title={heading} description={tp("rubric.convertHint", { n: fmtPoints(pointsPossible) })}>
        <div className="space-y-4">
          <div>
            <label htmlFor="rubric-title" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{tp("rubric.titleLabel")}</label>
            <input id="rubric-title" value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} placeholder={tp("rubric.titlePlaceholder")} />
          </div>

          <ol aria-label={tp("common.rubricCriteria")} className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
            {rows.map((r, idx) => {
              const id = `crit-${r.key}`;
              return (
                <li key={r.key} className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-500">{tp("common.criterionN", { n: idx + 1 })}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={tp("rubric.moveUp", { n: idx + 1 })} className="p-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30">
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => move(idx, 1)} disabled={idx === rows.length - 1} aria-label={tp("rubric.moveDown", { n: idx + 1 })} className="p-1.5 rounded text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30">
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => remove(r.key)} aria-label={tp("common.removeCriterionN", { n: idx + 1 })} className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={`${id}-title`} className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">{tp("rubric.titleRequired")}</label>
                      <input id={`${id}-title`} value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor={`${id}-outcome`} className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">{tp("common.outcome")}</label>
                      <select id={`${id}-outcome`} value={r.outcomeId} onChange={(e) => update(r.key, { outcomeId: e.target.value })} className={inputClass}>
                        <option value="">{tp("common.noOutcome")}</option>
                        {(outcomes || []).map((o) => (
                          <option key={o.id} value={String(o.id)}>{o.code || `OUT-${o.id}`}: {o.title}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label htmlFor={`${id}-desc`} className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">{tp("common.description")}</label>
                      <textarea id={`${id}-desc`} rows={2} value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} className={inputClass} placeholder={tp("rubric.descriptionPlaceholder")} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:max-w-xs">
                      <div>
                        <label htmlFor={`${id}-points`} className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">{tp("common.maxPoints")}</label>
                        <input id={`${id}-points`} type="number" min={0} step="any" inputMode="decimal" value={r.points} onChange={(e) => update(r.key, { points: e.target.value })} className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor={`${id}-weight`} className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">{tp("common.weight")}</label>
                        <input id={`${id}-weight`} type="number" min={0} step="any" inputMode="decimal" value={r.weight} onChange={(e) => update(r.key, { weight: e.target.value })} className={inputClass} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow()])} className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0D9488] hover:underline">
            <Plus className="w-3.5 h-3.5" /> {tp("common.addCriterion")}
          </button>

          {error ? <p role="alert" className="text-xs font-semibold text-rose-600">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div>
              {rubric ? (
                <button type="button" onClick={removeRubric} disabled={saving} className="text-xs font-semibold text-rose-600 hover:text-rose-700 px-2 py-2">
                  {tp("rubric.remove")}
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} disabled={saving} className="text-xs font-semibold text-slate-500 px-4 py-2">{tp("common.cancel")}</button>
              <button type="button" onClick={save} disabled={saving} className="text-xs font-bold text-white bg-[#0D9488] hover:bg-teal-700 disabled:opacity-60 px-5 py-2.5 rounded-lg">
                {saving ? tp("common.saving") : tp("rubric.save")}
              </button>
            </div>
          </div>
        </div>
      </Section>
    );
  }

  if (!rubric) {
    return (
      <Section divided title={heading}>
        {aiPanel}
        <EmptyState
          compact
          title={tp("rubric.noneTitle")}
          description={tp("rubric.noneHint")}
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button type="button" onClick={startEdit} className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0D9488] hover:bg-teal-700 px-4 py-2 rounded-lg">
                <Plus className="w-3.5 h-3.5" /> {tp("rubric.create")}
              </button>
              {aiButton}
            </div>
          }
        />
      </Section>
    );
  }

  return (
    <Section
      divided
      title={heading}
      description={`${rubric.title || tp("rubric.title")} · ${tp("rubric.gradedOutOf", { n: fmtPoints(pointsPossible) })}`}
      actions={
        <>
          {aiButton}
          <button type="button" onClick={startEdit} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg">
            <Pencil className="w-3.5 h-3.5" /> {tp("rubric.editRubric")}
          </button>
        </>
      }
    >
      {aiPanel}
      <RubricTable rubric={rubric} />
    </Section>
  );
}

// Read-only criteria table. With `scores` ({ [criterionId]: { points } }) adds a Score column.
export function RubricTable({ rubric, scores }) {
  const { tp } = useProgressText();
  const hasScores = !!scores;
  return (
    <DataTable
      caption={tp("common.rubricCriteria")}
      rows={rubric?.criteria || []}
      rowKey={(c) => c.id}
      empty={tp("rubric.noCriteria")}
      columns={[
        {
          key: "title",
          header: tp("common.criterion"),
          render: (c) => (
            <div className="min-w-[8rem]">
              <p className="font-semibold text-slate-800 dark:text-slate-100">{c.title}</p>
              {c.description ? <p className="text-xs text-slate-500 mt-0.5 sm:hidden">{c.description}</p> : null}
            </div>
          ),
        },
        { key: "description", header: tp("common.description"), hideOnMobile: true, className: "text-xs text-slate-600 dark:text-slate-400", render: (c) => c.description || "" },
        {
          key: "outcome",
          header: tp("common.outcome"),
          render: (c) => (c.outcome_code ? (
            <span title={c.outcome_title || ""} className="text-xs font-bold text-[#0D9488] bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md whitespace-nowrap">{c.outcome_code}</span>
          ) : <span className="text-slate-400">—</span>),
        },
        ...(hasScores ? [{
          key: "score",
          header: tp("common.score"),
          align: "right",
          className: "whitespace-nowrap font-semibold",
          render: (c) => {
            const s = scores[c.id];
            return s && s.points != null ? `${fmtPoints(s.points)} / ${fmtPoints(c.points)}` : <span className="text-slate-400">— / {fmtPoints(c.points)}</span>;
          },
        }] : [{ key: "points", header: tp("rubric.max"), align: "right", className: "whitespace-nowrap", render: (c) => fmtPoints(c.points) }]),
        { key: "weight", header: tp("common.weight"), align: "right", hideOnMobile: hasScores, render: (c) => fmtPoints(c.weight) },
      ]}
    />
  );
}
