"use client";

import { Check } from "lucide-react";
import { useProgressText } from "@/components/progress/text";

// Readable preview of an AI draft's payload, one layout per draft type.

export function outcomeCode(outcomes, id) {
  if (id == null) return null;
  const o = (outcomes || []).find((x) => Number(x.id) === Number(id));
  return o ? (o.code || `OUT-${o.id}`) : null;
}

function OutcomeTag({ outcomes, id }) {
  const code = outcomeCode(outcomes, id);
  if (!code) return null;
  const o = (outcomes || []).find((x) => Number(x.id) === Number(id));
  return (
    <span title={o?.title || ""} className="text-[10px] font-bold text-[#0D9488] bg-teal-50 border border-teal-200 dark:bg-teal-950/30 dark:border-teal-800 px-1.5 py-0.5 rounded-md whitespace-nowrap">
      {code}
    </span>
  );
}

const H = ({ children }) => <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mt-3 mb-1">{children}</h4>;
const Text = ({ children }) => <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{children}</p>;

export function QuestionsPreview({ questions, outcomes }) {
  const { tp, tpn } = useProgressText();
  return (
    <ol className="space-y-3">
      {(questions || []).map((q, i) => (
        <li key={i} className="text-sm">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-100">{i + 1}. {q.prompt}</span>
            <span className="text-[11px] text-slate-500">{tpn("common.points", q.points || 1)}</span>
            <OutcomeTag outcomes={outcomes} id={q.outcomeId} />
          </div>
          <ul className="mt-1 space-y-0.5 pl-4">
            {(q.options || []).map((opt, j) => {
              const correct = j === q.correctIndex;
              return (
                <li key={j} className={`flex items-start gap-1.5 text-xs ${correct ? "font-semibold text-emerald-700 dark:text-emerald-400" : "text-slate-600 dark:text-slate-400"}`}>
                  {correct ? <Check className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" /> : <span className="w-3.5 shrink-0 text-center" aria-hidden="true">·</span>}
                  <span>{opt}{correct ? <span className="sr-only">{tp("ai.preview.correctAnswerSr")}</span> : null}</span>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export function CriteriaPreview({ criteria, outcomes }) {
  const { tp } = useProgressText();
  const list = criteria || [];
  if (list.length === 0) return <p className="text-xs text-slate-500">{tp("ai.preview.noCriteria")}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <caption className="sr-only">{tp("common.rubricCriteria")}</caption>
        <thead className="text-[11px] uppercase tracking-wide text-slate-500 text-left">
          <tr>
            <th scope="col" className="py-1 pr-3 font-semibold">{tp("common.criterion")}</th>
            <th scope="col" className="py-1 pr-3 font-semibold">{tp("common.outcome")}</th>
            <th scope="col" className="py-1 font-semibold text-right">{tp("common.points")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.map((c, i) => (
            <tr key={i}>
              <td className="py-1.5 pr-3 align-top">
                <p className="font-semibold text-slate-800 dark:text-slate-100">{c.title}</p>
                {c.description ? <p className="text-xs text-slate-500">{c.description}</p> : null}
              </td>
              <td className="py-1.5 pr-3 align-top">{outcomeCode(outcomes, c.outcomeId) ? <OutcomeTag outcomes={outcomes} id={c.outcomeId} /> : <span className="text-slate-400">—</span>}</td>
              <td className="py-1.5 align-top text-right whitespace-nowrap">{c.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DraftPreview({ type, payload, outcomes }) {
  const { tp, tpn } = useProgressText();
  const p = payload || {};
  if (type === "page") {
    return (
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">{p.title}</h3>
        {(p.sections || []).map((s, i) => (
          <div key={i}>
            <H>{s.heading}</H>
            <Text>{s.body}</Text>
          </div>
        ))}
      </div>
    );
  }
  if (type === "quiz") {
    return (
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2">{p.title}</h3>
        <QuestionsPreview questions={p.questions} outcomes={outcomes} />
      </div>
    );
  }
  if (type === "assignment") {
    return (
      <div>
        <div className="flex flex-wrap items-baseline gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">{p.title}</h3>
          <span className="text-xs text-slate-500">{tpn("common.points", p.pointsPossible)}</span>
          <OutcomeTag outcomes={outcomes} id={p.outcomeId} />
        </div>
        <H>{tp("ai.preview.instructions")}</H>
        <Text>{p.instructions}</Text>
        <H>{tp("ai.preview.rubric")}</H>
        {p.rubric?.criteria?.length ? <CriteriaPreview criteria={p.rubric.criteria} outcomes={outcomes} /> : <p className="text-xs text-slate-500">{tp("ai.preview.noRubric")}</p>}
      </div>
    );
  }
  if (type === "story") {
    return (
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-white">{p.title}</h3>
        <div className="mt-1 space-y-2">
          {(p.paragraphs || []).map((t, i) => <Text key={i}>{t}</Text>)}
        </div>
        <H>{tp("ai.preview.storyQuestions")}</H>
        <QuestionsPreview questions={p.questions} outcomes={outcomes} />
        <H>{tp("ai.preview.discussionPrompt")}</H>
        <Text>{p.discussionPrompt}</Text>
      </div>
    );
  }
  if (type === "outline") {
    return (
      <div>
        <H>{tp("ai.preview.outcomesCount", { n: (p.outcomes || []).length })}</H>
        <ul className="space-y-1.5">
          {(p.outcomes || []).map((o, i) => (
            <li key={i} className="text-sm">
              {o.code ? <span className="text-[10px] font-bold text-[#0D9488] mr-1.5">{o.code}</span> : null}
              <span className="font-semibold text-slate-800 dark:text-slate-100">{o.title}</span>
              {o.description ? <p className="text-xs text-slate-500">{o.description}</p> : null}
            </li>
          ))}
        </ul>
        <H>{tp("ai.preview.weeksCount", { n: (p.modules || []).length })}</H>
        <ul className="space-y-1.5">
          {(p.modules || []).map((m, i) => (
            <li key={i} className="text-sm">
              <span className="text-[10px] font-bold text-[#0D9488] mr-1.5">{tp("common.weekN", { n: m.week ?? i + 1 })}</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{m.title}</span>
              {m.description ? <p className="text-xs text-slate-500">{m.description}</p> : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-slate-500">{tp("ai.preview.outlineNote")}</p>
      </div>
    );
  }
  if (type === "outcome") {
    return (
      <div>
        {p.outcomeId ? <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 mb-1">{tp("ai.preview.replacesOutcome", { code: outcomeCode(outcomes, p.outcomeId) || `#${p.outcomeId}` })}</p> : null}
        <h3 className="text-base font-bold text-slate-900 dark:text-white">{p.title}</h3>
        {p.description ? <Text>{p.description}</Text> : null}
        <H>{tp("ai.preview.masteryLevels")}</H>
        <ul className="space-y-1">
          {(p.masteryLevels || []).map((l, i) => (
            <li key={i} className="text-sm">
              <span className="font-semibold text-slate-800 dark:text-slate-100">{l.level}</span>
              <span className="text-xs text-slate-500"> · {tpn("common.points", l.points)}</span>
              {l.description ? <p className="text-xs text-slate-500">{l.description}</p> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (type === "rubric") return <CriteriaPreview criteria={p.criteria} outcomes={outcomes} />;
  return <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(p, null, 2)}</pre>;
}
