"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { DataTable } from "@/components/layout";
import { DeltaText, fmtGain, fmtPct, fmtRate, relativeDay } from "./bits";
import { useProgressText } from "@/components/progress/text";
import { useAttendanceText } from "@/components/attendance/text";
import { startRouteLoading } from "@/components/global/RouteLoader";
import { CheckboxField, TextInput } from "@/components/form";

// Name for sorting and search; the "Learner" fallback only matters for rows with neither.
const nameOf = (l) => l.name || l.email || "Learner";

// Sort values: nulls always go last, whichever direction.
const SORTS = {
  name: (l) => nameOf(l).toLowerCase(),
  overall: (l) => l.overall,
  baseline: (l) => l.overallBaseline,
  delta: (l) => l.deltaPoints,
  gain: (l) => l.normalizedGain,
  onTime: (l) => l.timeliness?.onTime,
  late: (l) => l.timeliness?.late,
  missing: (l) => l.timeliness?.missing,
  active: (l) => (l.engagement?.lastActivityAt ? new Date(l.engagement.lastActivityAt).getTime() : null),
  attendance: (l) => l.attendance?.rate,
  flags: (l) => (l.risk?.reasons?.length || 0),
};

export function ReasonChips({ risk }) {
  const { tp } = useProgressText();
  const reasons = Array.isArray(risk?.reasons) ? risk.reasons : [];
  if (!risk?.flagged || reasons.length === 0) return <span className="text-caption text-fg-subtle">{tp("common.none")}</span>;
  return (
    <ul className="flex flex-wrap gap-1" aria-label={tp("insights.learners.flagReasons")}>
      {reasons.map((r) => (
        <li key={r.code} className="text-caption font-semibold rounded-full border border-warning/30 bg-warning-soft text-warning-fg px-1.5 py-0.5">
          {r.message}
        </li>
      ))}
    </ul>
  );
}

export default function LearnersTab({ data, flaggedOnly, setFlaggedOnly }) {
  const { courseId } = useCourse();
  const router = useRouter();
  const { tx } = useAttendanceText();
  const { tp, locale } = useProgressText();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const learners = Array.isArray(data.learners) ? data.learners : [];

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = learners.filter((l) => (!flaggedOnly || l.risk?.flagged) && (!q || nameOf(l).toLowerCase().includes(q)));
    const get = SORTS[sort.key] || SORTS.name;
    const dir = sort.dir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return list;
  }, [learners, flaggedOnly, query, sort]);

  const onSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const detailHref = (l) => `/course/${courseId}/insights/learners/${l.id}`;
  const flaggedCount = learners.filter((l) => l.risk?.flagged).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <TextInput
          type="search"
          aria-label={tp("insights.learners.searchLabel")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tp("insights.learners.searchPlaceholder")}
          size="sm"
          icon={Search}
          className="flex-1 min-w-[12rem] max-w-sm"
        />
        <CheckboxField
          label={`${tp("insights.learners.flaggedOnly")} (${flaggedCount})`}
          checked={flaggedOnly}
          onCheckedChange={setFlaggedOnly}
        />
        <span className="text-caption text-fg-subtle" aria-live="polite">{tp("insights.learners.countOf", { n: rows.length, total: learners.length })}</span>
      </div>

      <DataTable
        caption={tp("insights.tabs.learners")}
        rows={rows}
        rowKey={(l) => l.id}
        sort={sort}
        onSort={onSort}
        onRowClick={(l) => { startRouteLoading(); router.push(detailHref(l)); }}
        empty={learners.length === 0 ? tp("common.noLearnersEnrolled") : flaggedOnly ? tp("insights.learners.noneFlagged") : tp("insights.learners.noMatch")}
        columns={[
          {
            key: "name",
            header: tp("common.learner"),
            sortable: true,
            className: "min-w-[10rem]",
            render: (l) => (
              <Link href={detailHref(l)} onClick={(e) => e.stopPropagation()} className="font-medium text-fg hover:text-brand-fg hover:underline">
                {l.name || l.email || tp("common.learner")}
              </Link>
            ),
          },
          { key: "overall", header: tp("common.now"), sortable: true, align: "right", render: (l) => (l.overall == null ? <span className="text-caption text-fg-subtle whitespace-nowrap">{tp("common.noResultsYet")}</span> : <span className="font-semibold">{fmtPct(l.overall)}</span>) },
          { key: "baseline", header: tp("common.baseline"), sortable: true, align: "right", render: (l) => <span className={l.overallBaseline == null ? "text-fg-subtle" : ""}>{fmtPct(l.overallBaseline)}</span> },
          { key: "delta", header: tp("common.change"), sortable: true, align: "right", render: (l) => <DeltaText value={l.deltaPoints} /> },
          { key: "gain", header: tp("common.gain"), sortable: true, align: "right", hideOnMobile: true, render: (l) => <span className={l.normalizedGain == null ? "text-fg-subtle" : ""}>{fmtGain(l.normalizedGain)}</span> },
          { key: "onTime", header: tp("insights.onTime"), sortable: true, align: "right", render: (l) => l.timeliness?.onTime ?? "—" },
          { key: "late", header: tp("common.late"), sortable: true, align: "right", render: (l) => l.timeliness?.late ?? "—" },
          { key: "missing", header: tp("common.missing"), sortable: true, align: "right", render: (l) => <span className={l.timeliness?.missing ? "font-semibold text-danger-fg" : ""}>{l.timeliness?.missing ?? "—"}</span> },
          { key: "attendance", header: tx("colAttendance"), sortable: true, align: "right", render: (l) => (l.attendance?.rate == null ? <span className="text-caption text-fg-subtle whitespace-nowrap">{tx("noneCounted")}</span> : <span className={l.risk?.reasons?.some((r) => r.code === "absent_in_a_row" || r.code === "low_attendance") ? "font-semibold text-danger-fg" : ""}>{fmtRate(l.attendance.rate)}</span>) },
          { key: "active", header: tp("insights.lastActive"), sortable: true, className: "whitespace-nowrap text-caption text-fg-muted", render: (l) => relativeDay(l.engagement?.lastActivityAt, tp, locale) },
          { key: "flags", header: tp("insights.flags"), sortable: true, className: "min-w-[12rem]", render: (l) => <ReasonChips risk={l.risk} /> },
        ]}
      />
      <p className="text-caption text-fg-subtle">
        {tp("insights.learners.footnote")}
      </p>
    </div>
  );
}
