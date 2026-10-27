"use client";

import { useState } from "react";
import { Award, ArrowUp, ArrowDown, Plus, Trash2, Pencil, Sparkles } from "lucide-react";
import { Section, DataTable, EmptyState } from "@/components/layout";
import { useToast } from "@/context/ToastContext";
import { fmtPoints } from "@/lib/rubric";
import useAiStatus from "@/lib/useAiStatus";
import { startAiJob } from "@/lib/ai";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { AiStatusNote } from "@/components/ai/AiBits";
import AiJobPanel from "@/components/ai/AiJobPanel";
import { useProgressText } from "@/components/progress/text";
import { Label, Select, TextInput, Textarea } from "@/components/form";

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

// Teacher rubric for one assignment: read-only table, or an editor that PUTs the whole rubric.
// `taggedOutcomes` are this assignment's outcome tags ({ outcome_id, outcome_code, outcome_title })
// used to seed a new rubric with one row per outcome.
export default function RubricSection({ courseId, assignmentId, rubric, outcomes, taggedOutcomes, pointsPossible, onChange }) {
  // Still passed to the AI helpers (lib/ai.js, AiJobPanel).
  const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;
  const { showToast } = useToast();
  const { tp } = useProgressText();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const base = `/courses/${courseId}/assignments/${assignmentId}/rubric`;

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
    onChange?.(await apiFetch(base).catch(() => null));
  };
  const aiButton = aiStatus.allowed ? (
    <button type="button" onClick={startAiRubric} disabled={aiStarting || aiRunning} className="inline-flex items-center gap-1.5 text-caption font-semibold text-info-fg border border-info/30 hover:bg-info-soft disabled:opacity-50 px-3 py-1.5 rounded-lg">
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
      const payload = await apiFetch(base, {
        method: "PUT",
        json: {
          ...(title.trim() ? { title: title.trim() } : {}),
          criteria: rows.map((r) => ({
            title: r.title.trim(),
            description: r.description,
            points: Number(r.points),
            weight: r.weight === "" ? 1 : Number(r.weight),
            ...(r.outcomeId ? { outcomeId: Number(r.outcomeId) } : {}),
          })),
        },
      }).catch((err) => { setError(err?.body?.message || (err?.status === 0 ? getErrorMessage(err) : tp("rubric.saveFailed"))); return null; });
      if (!payload) return;
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
      const removed = await apiFetch(base, { method: "DELETE" }).then(() => true).catch((err) => {
        showToast(err?.body?.message || (err?.status === 0 ? getErrorMessage(err) : tp("rubric.removeFailed")), "error");
        return false;
      });
      if (!removed) return;
      showToast(tp("rubric.removed"), "success");
      setEditing(false);
      onChange?.(null);
    } catch (err) {
      showToast(err.message || tp("rubric.removeFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const heading = <span className="flex items-center gap-2"><Award className="w-4 h-4 text-brand-fg" /> {tp("rubric.title")}</span>;

  if (editing) {
    return (
      <Section divided title={heading} description={tp("rubric.convertHint", { n: fmtPoints(pointsPossible) })}>
        <div className="space-y-4">
          <div>
            <Label htmlFor="rubric-title">{tp("rubric.titleLabel")}</Label>
            <TextInput id="rubric-title" value={title} onChange={(e) => setTitle(e.target.value)} size="sm" className="w-full" placeholder={tp("rubric.titlePlaceholder")} />
          </div>

          <ol aria-label={tp("common.rubricCriteria")} className="divide-y divide-line rounded-xl border border-line">
            {rows.map((r, idx) => {
              const id = `crit-${r.key}`;
              return (
                <li key={r.key} className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-caption font-bold text-fg-subtle">{tp("common.criterionN", { n: idx + 1 })}</span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={tp("rubric.moveUp", { n: idx + 1 })} className="p-1.5 rounded text-fg-subtle hover:bg-surface-hover disabled:opacity-30">
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => move(idx, 1)} disabled={idx === rows.length - 1} aria-label={tp("rubric.moveDown", { n: idx + 1 })} className="p-1.5 rounded text-fg-subtle hover:bg-surface-hover disabled:opacity-30">
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => remove(r.key)} aria-label={tp("common.removeCriterionN", { n: idx + 1 })} className="p-1.5 rounded text-fg-subtle hover:text-danger-fg hover:bg-danger-soft">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor={`${id}-title`}>{tp("rubric.titleRequired")}</Label>
                      <TextInput id={`${id}-title`} value={r.title} onChange={(e) => update(r.key, { title: e.target.value })} size="sm" className="w-full" />
                    </div>
                    <div>
                      <Label htmlFor={`${id}-outcome`}>{tp("common.outcome")}</Label>
                      <Select id={`${id}-outcome`} value={r.outcomeId} onChange={(e) => update(r.key, { outcomeId: e.target.value })} size="sm" className="w-full">
                        <option value="">{tp("common.noOutcome")}</option>
                        {(outcomes || []).map((o) => (
                          <option key={o.id} value={String(o.id)}>{o.code || `OUT-${o.id}`}: {o.title}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <Label htmlFor={`${id}-desc`}>{tp("common.description")}</Label>
                      <Textarea id={`${id}-desc`} rows={2} value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} size="sm" className="w-full" placeholder={tp("rubric.descriptionPlaceholder")} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:max-w-xs">
                      <div>
                        <Label htmlFor={`${id}-points`}>{tp("common.maxPoints")}</Label>
                        <TextInput id={`${id}-points`} type="number" min={0} step="any" inputMode="decimal" value={r.points} onChange={(e) => update(r.key, { points: e.target.value })} size="sm" className="w-full" />
                      </div>
                      <div>
                        <Label htmlFor={`${id}-weight`}>{tp("common.weight")}</Label>
                        <TextInput id={`${id}-weight`} type="number" min={0} step="any" inputMode="decimal" value={r.weight} onChange={(e) => update(r.key, { weight: e.target.value })} size="sm" className="w-full" />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow()])} className="inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg hover:underline">
            <Plus className="w-3.5 h-3.5" /> {tp("common.addCriterion")}
          </button>

          {error ? <p role="alert" className="text-caption font-semibold text-danger-fg">{error}</p> : null}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div>
              {rubric ? (
                <button type="button" onClick={removeRubric} disabled={saving} className="text-caption font-semibold text-danger-fg hover:text-danger-fg px-2 py-2">
                  {tp("rubric.remove")}
                </button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setEditing(false)} disabled={saving} className="text-caption font-semibold text-fg-subtle px-4 py-2">{tp("common.cancel")}</button>
              <button type="button" onClick={save} disabled={saving} className="text-caption font-bold text-on-brand bg-brand hover:bg-brand/90 disabled:opacity-60 px-5 py-2.5 rounded-lg">
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
              <button type="button" onClick={startEdit} className="inline-flex items-center gap-1.5 text-caption font-bold text-on-brand bg-brand hover:bg-brand/90 px-4 py-2 rounded-lg">
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
          <button type="button" onClick={startEdit} className="inline-flex items-center gap-1.5 text-caption font-semibold text-fg-muted bg-surface-sunken hover:bg-surface-hover px-3 py-1.5 rounded-lg">
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
              <p className="font-semibold text-fg">{c.title}</p>
              {c.description ? <p className="text-caption text-fg-subtle mt-0.5 sm:hidden">{c.description}</p> : null}
            </div>
          ),
        },
        { key: "description", header: tp("common.description"), hideOnMobile: true, className: "text-caption text-fg-muted", render: (c) => c.description || "" },
        {
          key: "outcome",
          header: tp("common.outcome"),
          render: (c) => (c.outcome_code ? (
            <span title={c.outcome_title || ""} className="text-caption font-bold text-brand-fg bg-brand-soft border border-brand/40 px-2 py-0.5 rounded-md whitespace-nowrap">{c.outcome_code}</span>
          ) : <span className="text-fg-subtle">—</span>),
        },
        ...(hasScores ? [{
          key: "score",
          header: tp("common.score"),
          align: "right",
          className: "whitespace-nowrap font-semibold",
          render: (c) => {
            const s = scores[c.id];
            return s && s.points != null ? `${fmtPoints(s.points)} / ${fmtPoints(c.points)}` : <span className="text-fg-subtle">— / {fmtPoints(c.points)}</span>;
          },
        }] : [{ key: "points", header: tp("rubric.max"), align: "right", className: "whitespace-nowrap", render: (c) => fmtPoints(c.points) }]),
        { key: "weight", header: tp("common.weight"), align: "right", hideOnMobile: hasScores, render: (c) => fmtPoints(c.weight) },
      ]}
    />
  );
}
