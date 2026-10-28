"use client";

import { useState } from "react";
import { Field as FormField, Fieldset, Radio, Select, TextInput, Textarea } from "@/components/form";
import { Plus, Trash2 } from "lucide-react";
import { useProgressText } from "@/components/progress/text";

// Inline editor for an AI draft's payload. The teacher edits text, questions, criteria, etc.;
// Save sends the whole payload back (PATCH) and the server checks it.

const addBtn = "inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg hover:underline";
const removeBtn = "p-1.5 rounded text-fg-subtle hover:text-danger-fg hover:bg-danger-soft disabled:opacity-30";

const clone = (v) => JSON.parse(JSON.stringify(v ?? {}));
const setAt = (arr, i, value) => arr.map((x, j) => (j === i ? value : x));
const without = (arr, i) => arr.filter((_, j) => j !== i);

// One labelled value of the draft (text, a number, or several lines), on the app's form controls.
function Field({ label, value, onChange, multiline = false, rows = 3, type = "text", min, className = "" }) {
  return (
    <FormField label={label} className={className}>
      {multiline ? (
        <Textarea size="sm" rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <TextInput size="sm" type={type} min={min} inputMode={type === "number" ? "decimal" : undefined} value={value ?? ""} onChange={(e) => onChange(type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />
      )}
    </FormField>
  );
}

function OutcomeSelect({ label, value, onChange, outcomes }) {
  const { tp } = useProgressText();
  return (
    <FormField label={label || tp("common.outcome")}>
      <Select size="sm" value={value == null ? "" : String(value)} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
        <option value="">{tp("common.noOutcome")}</option>
        {(outcomes || []).map((o) => (
          <option key={o.id} value={String(o.id)}>{o.code || `OUT-${o.id}`}: {o.title}</option>
        ))}
      </Select>
    </FormField>
  );
}

function QuestionsEditor({ questions, onChange, outcomes }) {
  const { tp } = useProgressText();
  const list = questions || [];
  const update = (i, patch) => onChange(setAt(list, i, { ...list[i], ...patch }));
  return (
    <div className="space-y-2">
      <ol aria-label={tp("ai.editor.questions")} className="divide-y divide-line rounded-xl border border-line">
        {list.map((q, i) => {
          const options = q.options || [];
          const group = `q-${i}-correct`;
          return (
            <li key={i} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption font-bold text-fg-subtle">{tp("ai.editor.questionN", { n: i + 1 })}</span>
                <button type="button" onClick={() => onChange(without(list, i))} aria-label={tp("ai.editor.removeQuestionN", { n: i + 1 })} className={removeBtn}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <Field label={tp("ai.editor.question")} value={q.prompt} onChange={(v) => update(i, { prompt: v })} multiline rows={2} />
              <Fieldset legend={tp("ai.editor.answerOptions")}>
                <div className="space-y-1.5">
                  {options.map((opt, j) => (
                    <div key={j} className="flex items-center gap-2">
                      <Radio
                        name={group}
                        checked={q.correctIndex === j}
                        onChange={() => update(i, { correctIndex: j })}
                        aria-label={tp("ai.editor.optionCorrect", { n: j + 1 })}
                      />
                      <TextInput
                        size="sm"
                        value={opt}
                        onChange={(e) => update(i, { options: setAt(options, j, e.target.value) })}
                        aria-label={tp("ai.editor.optionAria", { q: i + 1, n: j + 1 })}
                      />
                      <button
                        type="button"
                        disabled={options.length <= 2}
                        onClick={() => {
                          const next = without(options, j);
                          let correctIndex = q.correctIndex;
                          if (correctIndex === j) correctIndex = 0;
                          else if (correctIndex > j) correctIndex -= 1;
                          update(i, { options: next, correctIndex });
                        }}
                        aria-label={tp("ai.editor.removeOptionN", { n: j + 1 })}
                        className={removeBtn}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={() => update(i, { options: [...options, ""] })} className={`${addBtn} mt-1.5`}>
                  <Plus className="w-3.5 h-3.5" /> {tp("ai.editor.addOption")}
                </button>
              </Fieldset>
              <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-2">
                <Field label={tp("common.points")} type="number" min={1} value={q.points} onChange={(v) => update(i, { points: v })} />
                <OutcomeSelect value={q.outcomeId} onChange={(v) => update(i, { outcomeId: v })} outcomes={outcomes} />
              </div>
            </li>
          );
        })}
      </ol>
      <button type="button" onClick={() => onChange([...list, { prompt: "", options: ["", ""], correctIndex: 0, points: 1, outcomeId: null }])} className={addBtn}>
        <Plus className="w-3.5 h-3.5" /> {tp("ai.editor.addQuestion")}
      </button>
    </div>
  );
}

function CriteriaEditor({ criteria, onChange, outcomes }) {
  const { tp } = useProgressText();
  const list = criteria || [];
  const update = (i, patch) => onChange(setAt(list, i, { ...list[i], ...patch }));
  return (
    <div className="space-y-2">
      <ol aria-label={tp("common.rubricCriteria")} className="divide-y divide-line rounded-xl border border-line">
        {list.map((c, i) => (
          <li key={i} className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-caption font-bold text-fg-subtle">{tp("common.criterionN", { n: i + 1 })}</span>
              <button type="button" onClick={() => onChange(without(list, i))} aria-label={tp("common.removeCriterionN", { n: i + 1 })} className={removeBtn}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Field label={tp("common.title")} value={c.title} onChange={(v) => update(i, { title: v })} />
              <OutcomeSelect value={c.outcomeId} onChange={(v) => update(i, { outcomeId: v })} outcomes={outcomes} />
              <Field label={tp("common.description")} value={c.description} onChange={(v) => update(i, { description: v })} multiline rows={2} className="sm:col-span-2" />
              <Field label={tp("common.maxPoints")} type="number" min={0} value={c.points} onChange={(v) => update(i, { points: v })} />
            </div>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => onChange([...list, { title: "", description: "", points: 4, outcomeId: null }])} className={addBtn}>
        <Plus className="w-3.5 h-3.5" /> {tp("common.addCriterion")}
      </button>
    </div>
  );
}

/** A list of objects edited with the same fields; `blank` is a new row. `item` picks the
 *  ai.editor.rows.<item> texts ("Section 1", "Remove section 1", "Add section"). */
function RowsEditor({ label, item, rows, onChange, blank, render }) {
  const { tp } = useProgressText();
  const list = rows || [];
  return (
    <div className="space-y-2">
      <p className="text-caption font-bold text-fg-muted">{label}</p>
      <ol aria-label={label} className="divide-y divide-line rounded-xl border border-line">
        {list.map((row, i) => (
          <li key={i} className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-caption font-bold text-fg-subtle">{tp(`ai.editor.rows.${item}.item`, { n: i + 1 })}</span>
              <button type="button" onClick={() => onChange(without(list, i))} aria-label={tp(`ai.editor.rows.${item}.remove`, { n: i + 1 })} className={removeBtn}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {render(row, (patch) => onChange(setAt(list, i, typeof row === "object" ? { ...row, ...patch } : patch)), i)}
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => onChange([...list, blank(list.length)])} className={addBtn}>
        <Plus className="w-3.5 h-3.5" /> {tp(`ai.editor.rows.${item}.add`)}
      </button>
    </div>
  );
}

export default function DraftEditor({ type, payload, outcomes, saving, error, onSave, onCancel }) {
  const { tp } = useProgressText();
  const [p, setP] = useState(() => clone(payload));
  const set = (patch) => setP((cur) => ({ ...cur, ...patch }));

  let body = null;
  if (type === "page") {
    body = (
      <>
        <Field label={tp("common.title")} value={p.title} onChange={(v) => set({ title: v })} />
        <RowsEditor
          label={tp("ai.editor.sections")} item="section" rows={p.sections}
          onChange={(v) => set({ sections: v })}
          blank={() => ({ heading: "", body: "" })}
          render={(s, up) => (
            <>
              <Field label={tp("ai.editor.heading")} value={s.heading} onChange={(v) => up({ heading: v })} />
              <Field label={tp("ai.editor.text")} value={s.body} onChange={(v) => up({ body: v })} multiline rows={4} />
            </>
          )}
        />
      </>
    );
  } else if (type === "quiz") {
    body = (
      <>
        <Field label={tp("common.title")} value={p.title} onChange={(v) => set({ title: v })} />
        <QuestionsEditor questions={p.questions} onChange={(v) => set({ questions: v })} outcomes={outcomes} />
      </>
    );
  } else if (type === "assignment") {
    body = (
      <>
        <Field label={tp("common.title")} value={p.title} onChange={(v) => set({ title: v })} />
        <Field label={tp("ai.editor.instructions")} value={p.instructions} onChange={(v) => set({ instructions: v })} multiline rows={5} />
        <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-2">
          <Field label={tp("ai.editor.pointsPossible")} type="number" min={1} value={p.pointsPossible} onChange={(v) => set({ pointsPossible: v })} />
          <OutcomeSelect value={p.outcomeId} onChange={(v) => set({ outcomeId: v })} outcomes={outcomes} />
        </div>
        <div className="space-y-2">
          <p className="text-caption font-bold text-fg-muted">{tp("ai.editor.rubric")}</p>
          {p.rubric ? (
            <>
              <CriteriaEditor criteria={p.rubric.criteria} onChange={(v) => set({ rubric: { ...p.rubric, criteria: v } })} outcomes={outcomes} />
              <button type="button" onClick={() => set({ rubric: null })} className="text-caption font-semibold text-danger-fg hover:underline">{tp("ai.editor.removeRubric")}</button>
            </>
          ) : (
            <button type="button" onClick={() => set({ rubric: { criteria: [{ title: "", description: "", points: 4, outcomeId: p.outcomeId ?? null }] } })} className={addBtn}>
              <Plus className="w-3.5 h-3.5" /> {tp("ai.editor.addRubric")}
            </button>
          )}
        </div>
      </>
    );
  } else if (type === "story") {
    body = (
      <>
        <Field label={tp("common.title")} value={p.title} onChange={(v) => set({ title: v })} />
        <RowsEditor
          label={tp("ai.editor.storyParagraphs")} item="paragraph" rows={p.paragraphs}
          onChange={(v) => set({ paragraphs: v })}
          blank={() => ""}
          render={(t, up) => <Field label={tp("ai.editor.text")} value={t} onChange={(v) => up(v)} multiline rows={3} />}
        />
        <p className="text-caption font-bold text-fg-muted">{tp("ai.editor.questions")}</p>
        <QuestionsEditor questions={p.questions} onChange={(v) => set({ questions: v })} outcomes={outcomes} />
        <Field label={tp("ai.editor.discussionPrompt")} value={p.discussionPrompt} onChange={(v) => set({ discussionPrompt: v })} multiline rows={2} />
      </>
    );
  } else if (type === "outline") {
    body = (
      <>
        <RowsEditor
          label={tp("common.outcomes")} item="outcome" rows={p.outcomes}
          onChange={(v) => set({ outcomes: v })}
          blank={(n) => ({ code: `OUT-${n + 1}`, title: "", description: "" })}
          render={(o, up) => (
            <div className="grid grid-cols-1 sm:grid-cols-[7rem_1fr] gap-2">
              <Field label={tp("ai.editor.code")} value={o.code} onChange={(v) => up({ code: v })} />
              <Field label={tp("common.title")} value={o.title} onChange={(v) => up({ title: v })} />
              <Field label={tp("common.description")} value={o.description} onChange={(v) => up({ description: v })} multiline rows={2} className="sm:col-span-2" />
            </div>
          )}
        />
        <RowsEditor
          label={tp("ai.editor.weeks")} item="week" rows={p.modules}
          onChange={(v) => set({ modules: v.map((m, i) => ({ ...m, week: i + 1 })) })}
          blank={(n) => ({ week: n + 1, title: "", description: "" })}
          render={(m, up) => (
            <>
              <Field label={tp("common.title")} value={m.title} onChange={(v) => up({ title: v })} />
              <Field label={tp("common.description")} value={m.description} onChange={(v) => up({ description: v })} multiline rows={2} />
            </>
          )}
        />
      </>
    );
  } else if (type === "outcome") {
    body = (
      <>
        <Field label={tp("ai.editor.outcomeStatement")} value={p.title} onChange={(v) => set({ title: v })} />
        <Field label={tp("common.description")} value={p.description} onChange={(v) => set({ description: v })} multiline rows={2} />
        <RowsEditor
          label={tp("ai.editor.masteryLevels")} item="level" rows={p.masteryLevels}
          onChange={(v) => set({ masteryLevels: v })}
          blank={() => ({ level: "", points: 1, description: "" })}
          render={(l, up) => (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_6rem] gap-2">
              <Field label={tp("ai.editor.levelName")} value={l.level} onChange={(v) => up({ level: v })} />
              <Field label={tp("common.points")} type="number" min={0} value={l.points} onChange={(v) => up({ points: v })} />
              <Field label={tp("ai.editor.looksLike")} value={l.description} onChange={(v) => up({ description: v })} multiline rows={2} className="sm:col-span-2" />
            </div>
          )}
        />
      </>
    );
  } else if (type === "rubric") {
    body = <CriteriaEditor criteria={p.criteria} onChange={(v) => set({ criteria: v })} outcomes={outcomes} />;
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => { e.preventDefault(); onSave(p); }}
    >
      {body}
      {error ? <p role="alert" className="text-caption font-semibold text-danger-fg">{error}</p> : null}
      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} disabled={saving} className="text-caption font-semibold text-fg-subtle px-4 py-2">{tp("common.cancel")}</button>
        <button type="submit" disabled={saving} className="text-caption font-bold text-on-brand bg-brand hover:bg-brand/90 disabled:opacity-60 px-5 py-2 rounded-lg">
          {saving ? tp("common.saving") : tp("ai.editor.saveChanges")}
        </button>
      </div>
    </form>
  );
}
