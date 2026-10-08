"use client";

import Link from "next/link";
import { useCourse } from "@/context/CourseContext";
import { Section, List, ListRow } from "@/components/layout";
import { moduleWeekLabel } from "@/lib/moduleLabels";
import AiClassSummary from "./AiClassSummary";
import { useAttendanceText } from "@/components/attendance/text";
import { BandBar, DeltaText, Figure, basedOn, fmtPct, fmtRate, itemHref, ITEM_TYPE_LABELS } from "./bits";

export default function ClassTab({ data, reload, onShowFlagged }) {
  const { courseId } = useCourse();
  const { tx, txn } = useAttendanceText();
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
      <Section title="The class at a glance">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <Figure
            label="Average mastery"
            value={fmtPct(c.averageMastery)}
            sub={c.averageMastery == null ? "No results yet" : (
              <>
                Baseline {fmtPct(c.averageBaseline)} · change <DeltaText value={c.averageDeltaPoints} />
                <span className="block">{basedOn(c.learnersWithData, c.learners)}{c.averageDeltaPoints != null ? `; change based on ${c.learnersWithGrowthData ?? 0}` : ""}</span>
              </>
            )}
          />
          <Figure
            label="Learners with results"
            value={c.learners ? `${c.learnersWithData ?? 0} of ${c.learners}` : "No learners yet"}
            sub="have at least one marked result"
          />
          <Figure
            label="Handed in on time"
            value={fmtRate(c.onTimeRate)}
            sub={c.onTimeRate == null ? "Nothing handed in yet" : "of work handed in so far"}
          />
          <Figure
            label="Missing items"
            value={c.missing ?? "—"}
            sub="past-due items not handed in, across all learners"
          />
          <Figure
            label="Learners flagged"
            value={c.atRisk ?? "—"}
            sub={(
              <button type="button" onClick={onShowFlagged} className="font-semibold text-[#0D9488] hover:underline">
                See who and why
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
            label="Active in the last 7 days"
            value={c.learners ? `${c.activeLast7Days ?? 0} of ${c.learners}` : "—"}
            sub="opened or handed in something"
          />
        </dl>
      </Section>

      <Section divided title="Where learners are" description="Each learner's average across outcomes, in bands.">
        <BandBar bands={c.bands} thresholds={thresholds} />
      </Section>

      <AiClassSummary summary={data.aiSummary} learners={c} onDone={reload} />

      <Section divided title="Needs attention">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="min-w-0">
            <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Outcomes with the most learners needing reteach</h3>
            {reteachOutcomes.length === 0 ? (
              <p className="text-sm text-slate-500">{outcomes.some((o) => o.learnersWithData > 0) ? "No outcome has learners below the reteach line." : "No results yet."}</p>
            ) : (
              <List label="Outcomes needing reteach">
                {reteachOutcomes.map((o) => (
                  <ListRow
                    key={o.id}
                    title={`${o.code ? `${o.code} · ` : ""}${o.title}`}
                    href={`/course/${courseId}/insights?tab=outcomes#outcome-${o.id}`}
                    subtitle={`${o.bands.needsReteach} of ${o.learnersWithData} learners with results below ${thresholds?.reteach ?? 60}% · class ${fmtPct(o.currentMastery)}`}
                    tone="warning"
                  />
                ))}
              </List>
            )}
          </div>
          <div className="min-w-0">
            <h3 className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Most-missed items</h3>
            {missedItems.length === 0 ? (
              <p className="text-sm text-slate-500">No past-due items are missing.</p>
            ) : (
              <List label="Most-missed items">
                {missedItems.map((i) => (
                  <ListRow
                    key={i.moduleItemId}
                    title={i.title}
                    href={itemHref(courseId, i) || undefined}
                    subtitle={`${i.missing} of ${i.learners} learners haven't handed it in · ${ITEM_TYPE_LABELS[i.type] || ""}${i.module ? ` · ${moduleWeekLabel(i.module)}` : ""}`}
                    tone="warning"
                  />
                ))}
              </List>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Flags are rule-based and always list their reasons. <Link href={`/course/${courseId}/insights?tab=learners&flagged=1`} className="font-semibold text-[#0D9488] hover:underline">Open flagged learners</Link>
        </p>
      </Section>
    </div>
  );
}
