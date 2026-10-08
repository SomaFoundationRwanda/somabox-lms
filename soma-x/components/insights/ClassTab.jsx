"use client";

import Link from "next/link";
import { useCourse } from "@/context/CourseContext";
import { Section, List, ListRow } from "@/components/layout";
import AiClassSummary from "./AiClassSummary";
import { useAttendanceText } from "@/components/attendance/text";
import { useProgressText, weekLabel } from "@/components/progress/text";
import { BandBar, DeltaText, Figure, basedOn, fmtPct, fmtRate, itemHref, itemType } from "./bits";

export default function ClassTab({ data, reload, onShowFlagged }) {
  const { courseId } = useCourse();
  const { tx, txn } = useAttendanceText();
  const { tp } = useProgressText();
  const c = data.class || {};
  const thresholds = data.thresholds;
  const outcomes = Array.isArray(data.outcomes) ? data.outcomes : [];
  const items = Array.isArray(data.items) ? data.items : [];

  const reteachOutcomes = outcomes
    .filter((o) => (o.bands?.needsReteach || 0) > 0)
    .sort((a, b) => (b.bands.needsReteach - a.bands.needsReteach) || ((a.currentMastery ?? 101) - (b.currentMastery ?? 101)))
    .slice(0, 3);
  const missedItems = items
    .filter((i) => (i.missing || 0) > 0)
    .sort((a, b) => b.missing - a.missing)
    .slice(0, 3);

  return (
    <div className="space-y-8">
      <Section title={tp("insights.class.glance")}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <Figure
            label={tp("insights.class.averageMastery")}
            value={fmtPct(c.averageMastery)}
            sub={c.averageMastery == null ? tp("common.noResultsYet") : (
              <>
                {tp("insights.class.baselineChange", { value: fmtPct(c.averageBaseline) })} <DeltaText value={c.averageDeltaPoints} />
                <span className="block">{basedOn(c.learnersWithData, c.learners, tp)}{c.averageDeltaPoints != null ? tp("insights.class.changeBasedOn", { n: c.learnersWithGrowthData ?? 0 }) : ""}</span>
              </>
            )}
          />
          <Figure
            label={tp("insights.class.learnersWithResults")}
            value={c.learners ? tp("common.nOfTotal", { n: c.learnersWithData ?? 0, total: c.learners }) : tp("insights.class.noLearners")}
            sub={tp("insights.class.haveResult")}
          />
          <Figure
            label={tp("insights.handedInOnTime")}
            value={fmtRate(c.onTimeRate)}
            sub={c.onTimeRate == null ? tp("insights.class.nothingHandedIn") : tp("insights.class.ofWorkSoFar")}
          />
          <Figure
            label={tp("insights.class.missingItems")}
            value={c.missing ?? "—"}
            sub={tp("insights.class.missingHint")}
          />
          <Figure
            label={tp("insights.class.flaggedLabel")}
            value={c.atRisk ?? "—"}
            sub={(
              <button type="button" onClick={onShowFlagged} className="font-semibold text-[#0D9488] hover:underline">
                {tp("insights.class.seeWho")}
              </button>
            )}
          />
          <Figure
            label={tx("insightsRateLabel")}
            value={fmtPct(c.attendanceRate)}
            sub={c.attendanceRate == null ? tx("insightsNoAttendance") : (
              <>
                {txn("basedOnLearners", c.learnersWithAttendance ?? 0)}
                {" · "}
                <Link href={`/course/${courseId}/attendance`} className="font-semibold text-[#0D9488] hover:underline">{tx("openAttendance")}</Link>
              </>
            )}
          />
          <Figure
            label={tp("insights.class.active7")}
            value={c.learners ? tp("common.nOfTotal", { n: c.activeLast7Days ?? 0, total: c.learners }) : "—"}
            sub={tp("insights.class.active7Hint")}
          />
        </dl>
      </Section>

      <Section divided title={tp("insights.class.whereTitle")} description={tp("insights.class.whereDescription")}>
        <BandBar bands={c.bands} thresholds={thresholds} />
      </Section>

      <AiClassSummary summary={data.aiSummary} learners={c} onDone={reload} />

      <Section divided title={tp("insights.class.needsAttention")}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{tp("insights.class.reteachTitle")}</h3>
            {reteachOutcomes.length === 0 ? (
              <p className="text-sm text-slate-500">{outcomes.some((o) => o.learnersWithData > 0) ? tp("insights.class.noReteach") : tp("common.noResultsYetDot")}</p>
            ) : (
              <List label={tp("insights.class.reteachList")}>
                {reteachOutcomes.map((o) => (
                  <ListRow
                    key={o.id}
                    title={`${o.code ? `${o.code} · ` : ""}${o.title}`}
                    href={`/course/${courseId}/insights?tab=outcomes#outcome-${o.id}`}
                    subtitle={tp("insights.class.reteachRow", { n: o.bands.needsReteach, total: o.learnersWithData, line: thresholds?.reteach ?? 60, pct: fmtPct(o.currentMastery) })}
                    tone="warning"
                  />
                ))}
              </List>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{tp("insights.class.mostMissed")}</h3>
            {missedItems.length === 0 ? (
              <p className="text-sm text-slate-500">{tp("insights.class.noMissed")}</p>
            ) : (
              <List label={tp("insights.class.mostMissed")}>
                {missedItems.map((i) => (
                  <ListRow
                    key={i.moduleItemId}
                    title={i.title}
                    href={itemHref(courseId, i) || undefined}
                    subtitle={`${tp("insights.class.missedRow", { n: i.missing, total: i.learners })} · ${itemType(tp, i.type)}${i.module ? ` · ${weekLabel(tp, i.module)}` : ""}`}
                    tone="warning"
                  />
                ))}
              </List>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {tp("insights.class.flagsRuleNote")} <Link href={`/course/${courseId}/insights?tab=learners&flagged=1`} className="font-semibold text-[#0D9488] hover:underline">{tp("insights.class.openFlagged")}</Link>
        </p>
      </Section>
    </div>
  );
}
