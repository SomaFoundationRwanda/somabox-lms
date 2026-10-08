"use client";

import { useProgressText } from "@/components/progress/text";

// One line describing an outcome's movement: "Baseline X% → Now Y% (+Z%) · gain N%",
// plus "based on N learners" for staff. Null values read "No data yet".
export default function MasterySummary({ outcome, isTeacher = false, size = "text-xs", className = "" }) {
  const { tp, tpn } = useProgressText();
  const o = outcome || {};
  const pct = (v) => (v === null || v === undefined ? tp("common.noDataYet") : `${v}%`);
  const deltaTone = o.deltaPoints == null ? "text-slate-500" : o.deltaPoints >= 0 ? "text-teal-700 dark:text-teal-400" : "text-rose-600";
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${size} text-slate-600 dark:text-slate-400 ${className}`}>
      <span>
        {tp("mastery.baseline")} <strong>{pct(o.baselineScore)}</strong> → {tp("mastery.now")} <strong>{pct(o.currentMastery)}</strong>
      </span>
      {o.delta ? <span className={`font-semibold ${deltaTone}`}>({o.delta})</span> : null}
      {o.normalizedGain !== null && o.normalizedGain !== undefined ? (
        <span className="font-semibold text-slate-700 dark:text-slate-300">{tp("mastery.gain", { n: Math.round(o.normalizedGain * 100) })}</span>
      ) : null}
      {isTeacher ? (
        <span className="text-slate-500">{tpn("mastery.basedOn", o.learnersWithData ?? 0)}</span>
      ) : null}
    </div>
  );
}
