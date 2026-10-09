"use client";

import { Section, List, EmptyState } from "@/components/layout";
import { BandBar, BandChip, DeltaText, basedOn, fmtGain, fmtPct } from "./bits";
import { useProgressText, fillNode } from "@/components/progress/text";

export default function OutcomesTab({ data }) {
  const { tp, tpn } = useProgressText();
  const outcomes = Array.isArray(data.outcomes) ? data.outcomes : [];
  const thresholds = data.thresholds;
  const total = data.class?.learners ?? 0;

  if (outcomes.length === 0) {
    return <EmptyState compact title={tp("common.noOutcomesYet")} description={tp("insights.outcomesTab.emptyHint")} />;
  }

  return (
    <Section description={tp("insights.outcomesTab.description")}>
      <List label={tp("common.outcomes")}>
        {outcomes.map((o) => (
          <li key={o.id} id={`outcome-${o.id}`} className="px-3 py-4 text-sm space-y-3 scroll-mt-20">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {o.code ? <span className="mr-2 text-[11px] font-bold text-[var(--brand-secondary)]">{o.code}</span> : null}
                  {o.title}
                </p>
                <p className="text-xs text-slate-500">{basedOn(o.learnersWithData, total, tp)} · {tpn("common.results", o.resultsCount ?? 0)}</p>
              </div>
              <BandChip value={o.currentMastery} thresholds={thresholds} />
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              <div>
                <dt className="text-[11px] text-slate-500">{tp("insights.baselineToNow")}</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {fmtPct(o.baselineScore)} → {o.currentMastery == null ? tp("common.noResultsYet") : fmtPct(o.currentMastery)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500">{tp("common.change")}</dt>
                <dd><DeltaText value={o.deltaPoints} /></dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500">{tp("insights.outcomesTab.normalizedGain")}</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100">{fmtGain(o.normalizedGain)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500">{tp("insights.outcomesTab.reachedMastery")}</dt>
                <dd className="text-slate-800 dark:text-slate-100">
                  {fillNode(tpn("insights.outcomesTab.learners", o.learnersReachedMastery ?? 0, { n: "{n}" }), { n: <span className="font-semibold">{o.learnersReachedMastery ?? 0}</span> })}
                  {o.medianResultsToMastery != null ? (
                    <span className="block text-[11px] text-slate-500">{tpn("insights.outcomesTab.median", o.medianResultsToMastery)}</span>
                  ) : null}
                </dd>
              </div>
            </dl>

            <BandBar bands={o.bands} thresholds={thresholds} />
          </li>
        ))}
      </List>
    </Section>
  );
}
