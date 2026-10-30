"use client";

import { useProgressText } from "@/components/progress/text";

// One line describing an outcome's movement: "Baseline X% → Now Y% (+Z%) · gain N%",
// plus "based on N learners" for staff. Null values read "No data yet".
export default function MasterySummary({ outcome, isTeacher = false, size = "text-caption", className = "" }) {
  const { tp, tpn } = useProgressText();
  const o = outcome || {};
  const pct = (v) => (v === null || v === undefined ? tp("common.noDataYet") : `${v}%`);
  const deltaTone = o.deltaPoints == null ? "text-fg-subtle" : o.deltaPoints >= 0 ? "text-brand-fg" : "text-danger-fg";
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 ${size} text-fg-muted ${className}`}>
      <span>
        {tp("mastery.baseline")} <strong>{pct(o.baselineScore)}</strong> → {tp("mastery.now")} <strong>{pct(o.currentMastery)}</strong>
      </span>
      {o.delta ? <span className={`font-semibold ${deltaTone}`}>({o.delta})</span> : null}
      {o.normalizedGain !== null && o.normalizedGain !== undefined ? (
        <span className="font-semibold text-fg-muted">{tp("mastery.gain", { n: Math.round(o.normalizedGain * 100) })}</span>
      ) : null}
      {isTeacher ? (
        <span className="text-fg-subtle">{tpn("mastery.basedOn", o.learnersWithData ?? 0)}</span>
      ) : null}
    </div>
  );
}
