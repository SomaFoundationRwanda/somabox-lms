"use client";

import { Section, List, EmptyState } from "@/components/layout";
import { BandBar, BandChip, DeltaText, basedOn, fmtGain, fmtPct } from "./bits";

export default function OutcomesTab({ data }) {
  const outcomes = Array.isArray(data.outcomes) ? data.outcomes : [];
  const thresholds = data.thresholds;
  const total = data.class?.learners ?? 0;

  if (outcomes.length === 0) {
    return <EmptyState compact title="This course has no outcomes yet." description="Add outcomes and link them to quiz questions or rubric criteria to see growth here." />;
  }

  return (
    <Section description="Class average per outcome now, compared with the Week 0 baseline. Normalized gain is the share of the possible improvement the class achieved.">
      <List label="Outcomes">
        {outcomes.map((o) => (
          <li key={o.id} id={`outcome-${o.id}`} className="px-3 py-4 text-sm space-y-3 scroll-mt-20">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {o.code ? <span className="mr-2 text-[11px] font-bold text-[#0D9488]">{o.code}</span> : null}
                  {o.title}
                </p>
                <p className="text-xs text-slate-500">{basedOn(o.learnersWithData, total)} · {o.resultsCount ?? 0} result{o.resultsCount === 1 ? "" : "s"}</p>
              </div>
              <BandChip value={o.currentMastery} thresholds={thresholds} />
            </div>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
              <div>
                <dt className="text-[11px] text-slate-500">Baseline → now</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
                  {fmtPct(o.baselineScore)} → {o.currentMastery == null ? "No results yet" : fmtPct(o.currentMastery)}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500">Change</dt>
                <dd><DeltaText value={o.deltaPoints} /></dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500">Normalized gain</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-100">{fmtGain(o.normalizedGain)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-slate-500">Reached mastery</dt>
                <dd className="text-slate-800 dark:text-slate-100">
                  <span className="font-semibold">{o.learnersReachedMastery ?? 0}</span> learner{o.learnersReachedMastery === 1 ? "" : "s"}
                  {o.medianResultsToMastery != null ? (
                    <span className="block text-[11px] text-slate-500">median {o.medianResultsToMastery} result{o.medianResultsToMastery === 1 ? "" : "s"} to get there</span>
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
