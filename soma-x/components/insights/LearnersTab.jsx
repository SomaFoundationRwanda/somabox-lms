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
  if (!risk?.flagged || reasons.length === 0) return <span className="text-xs text-slate-400">{tp("common.none")}</span>;
  return (
    <ul className="flex flex-wrap gap-1" aria-label={tp("insights.learners.flagReasons")}>
      {reasons.map((r) => (
        <li key={r.code} className="text-[10px] font-semibold rounded-full border border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 dark:border-amber-900 px-1.5 py-0.5">
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
        <label className="relative flex-1 min-w-[12rem] max-w-sm">
          <span className="sr-only">{tp("insights.learners.searchLabel")}</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tp("insights.learners.searchPlaceholder")}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 pl-8 pr-2.5 text-sm outline-none focus:border-[var(--brand-secondary)]"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} className="h-4 w-4 accent-[var(--brand-secondary)]" />
          {tp("insights.learners.flaggedOnly")} <span className="text-xs text-slate-500">({flaggedCount})</span>
        </label>
        <span className="text-xs text-slate-500" aria-live="polite">{tp("insights.learners.countOf", { n: rows.length, total: learners.length })}</span>
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
              <Link href={detailHref(l)} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-800 dark:text-slate-100 hover:text-[var(--brand-secondary)] hover:underline">
                {l.name || l.email || tp("common.learner")}
              </Link>
            ),
          },
          { key: "overall", header: tp("common.now"), sortable: true, align: "right", render: (l) => (l.overall == null ? <span className="text-xs text-slate-400 whitespace-nowrap">{tp("common.noResultsYet")}</span> : <span className="font-semibold">{fmtPct(l.overall)}</span>) },
          { key: "baseline", header: tp("common.baseline"), sortable: true, align: "right", render: (l) => <span className={l.overallBaseline == null ? "text-slate-400" : ""}>{fmtPct(l.overallBaseline)}</span> },
          { key: "delta", header: tp("common.change"), sortable: true, align: "right", render: (l) => <DeltaText value={l.deltaPoints} /> },
          { key: "gain", header: tp("common.gain"), sortable: true, align: "right", hideOnMobile: true, render: (l) => <span className={l.normalizedGain == null ? "text-slate-400" : ""}>{fmtGain(l.normalizedGain)}</span> },
          { key: "onTime", header: tp("insights.onTime"), sortable: true, align: "right", render: (l) => l.timeliness?.onTime ?? "—" },
          { key: "late", header: tp("common.late"), sortable: true, align: "right", render: (l) => l.timeliness?.late ?? "—" },
          { key: "missing", header: tp("common.missing"), sortable: true, align: "right", render: (l) => <span className={l.timeliness?.missing ? "font-semibold text-rose-700 dark:text-rose-400" : ""}>{l.timeliness?.missing ?? "—"}</span> },
          { key: "attendance", header: tx("colAttendance"), sortable: true, align: "right", render: (l) => (l.attendance?.rate == null ? <span className="text-xs text-slate-400 whitespace-nowrap">{tx("noneCounted")}</span> : <span className={l.risk?.reasons?.some((r) => r.code === "absent_in_a_row" || r.code === "low_attendance") ? "font-semibold text-rose-700 dark:text-rose-400" : ""}>{fmtRate(l.attendance.rate)}</span>) },
          { key: "active", header: tp("insights.lastActive"), sortable: true, className: "whitespace-nowrap text-xs text-slate-600 dark:text-slate-300", render: (l) => relativeDay(l.engagement?.lastActivityAt, tp, locale) },
          { key: "flags", header: tp("insights.flags"), sortable: true, className: "min-w-[12rem]", render: (l) => <ReasonChips risk={l.risk} /> },
        ]}
      />
      <p className="text-xs text-slate-500">
        {tp("insights.learners.footnote")}
      </p>
    </div>
  );
}
