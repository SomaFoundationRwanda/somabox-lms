"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { DataTable } from "@/components/layout";
import { DeltaText, fmtGain, fmtPct, fmtRate, relativeDay } from "./bits";
import { useAttendanceText } from "@/components/attendance/text";

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
  const reasons = Array.isArray(risk?.reasons) ? risk.reasons : [];
  if (!risk?.flagged || reasons.length === 0) return <span className="text-xs text-slate-400">None</span>;
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Flag reasons">
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
          <span className="sr-only">Search learners by name</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 pl-8 pr-2.5 text-sm outline-none focus:border-[#0D9488]"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} className="h-4 w-4 accent-[#0D9488]" />
          Flagged only <span className="text-xs text-slate-500">({flaggedCount})</span>
        </label>
        <span className="text-xs text-slate-500" aria-live="polite">{rows.length} of {learners.length} learners</span>
      </div>

      <DataTable
        caption="Learners"
        rows={rows}
        rowKey={(l) => l.id}
        sort={sort}
        onSort={onSort}
        onRowClick={(l) => router.push(detailHref(l))}
        empty={learners.length === 0 ? "No learners enrolled yet." : flaggedOnly ? "No learners are flagged." : "No learners match your search."}
        columns={[
          {
            key: "name",
            header: "Learner",
            sortable: true,
            className: "min-w-[10rem]",
            render: (l) => (
              <Link href={detailHref(l)} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-800 dark:text-slate-100 hover:text-[#0D9488] hover:underline">
                {nameOf(l)}
              </Link>
            ),
          },
          { key: "overall", header: "Now", sortable: true, align: "right", render: (l) => (l.overall == null ? <span className="text-xs text-slate-400 whitespace-nowrap">No results yet</span> : <span className="font-semibold">{fmtPct(l.overall)}</span>) },
          { key: "baseline", header: "Baseline", sortable: true, align: "right", render: (l) => <span className={l.overallBaseline == null ? "text-slate-400" : ""}>{fmtPct(l.overallBaseline)}</span> },
          { key: "delta", header: "Change", sortable: true, align: "right", render: (l) => <DeltaText value={l.deltaPoints} /> },
          { key: "gain", header: "Gain", sortable: true, align: "right", hideOnMobile: true, render: (l) => <span className={l.normalizedGain == null ? "text-slate-400" : ""}>{fmtGain(l.normalizedGain)}</span> },
          { key: "onTime", header: "On time", sortable: true, align: "right", render: (l) => l.timeliness?.onTime ?? "—" },
          { key: "late", header: "Late", sortable: true, align: "right", render: (l) => l.timeliness?.late ?? "—" },
          { key: "missing", header: "Missing", sortable: true, align: "right", render: (l) => <span className={l.timeliness?.missing ? "font-semibold text-rose-700 dark:text-rose-400" : ""}>{l.timeliness?.missing ?? "—"}</span> },
          { key: "attendance", header: tx("colAttendance"), sortable: true, align: "right", render: (l) => (l.attendance?.rate == null ? <span className="text-xs text-slate-400 whitespace-nowrap">{tx("noneCounted")}</span> : <span className={l.risk?.reasons?.some((r) => r.code === "absent_in_a_row" || r.code === "low_attendance") ? "font-semibold text-rose-700 dark:text-rose-400" : ""}>{fmtRate(l.attendance.rate)}</span>) },
          { key: "active", header: "Last active", sortable: true, className: "whitespace-nowrap text-xs text-slate-600 dark:text-slate-300", render: (l) => relativeDay(l.engagement?.lastActivityAt) },
          { key: "flags", header: "Flags", sortable: true, className: "min-w-[12rem]", render: (l) => <ReasonChips risk={l.risk} /> },
        ]}
      />
      <p className="text-xs text-slate-500">
        &quot;Now&quot; and &quot;Baseline&quot; are each learner&apos;s average across outcomes. Gain is the share of the possible improvement achieved. Flags follow fixed rules and show their reasons.
      </p>
    </div>
  );
}
