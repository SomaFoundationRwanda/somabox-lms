"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, Eye, EyeOff, MessageSquareText, Search, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import SidePanel from "@/components/ui/SidePanel";
import { RubricTable } from "@/components/course/grading/RubricSection";
import { useCourse } from "@/context/CourseContext";
import { useLanguage } from "@/context/LanguageContext";
import { useToast } from "@/context/ToastContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, DataTable, EmptyState } from "@/components/layout";
import { formatDate } from "@/lib/dates";
import { useProgressText, itemTypeLabel, fmtDateTime } from "@/components/progress/text";
import { GRADE_CATEGORIES, categoryLabel } from "@/lib/gradeCategories";
import Loader from "@/components/ui/Loader";
import MyAttendance from "@/components/attendance/MyAttendance";
import { Select, TextInput } from "@/components/form";

const fmtNum = (n) => (n == null ? "" : Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(2).replace(/\.?0+$/, ""));

function columnHref(courseId, col) {
  if (col.type === "quiz") return `/course/${courseId}/quizzes/${col.id}`;
  // Graded discussions are backed by an assignment: its id is the column id.
  return `/course/${courseId}/assignments/${col.id}`;
}

// One learner's work on one column, for the teacher: an assignment opens that learner's submission.
function workHref(courseId, col, email) {
  if (col.type === "quiz") return `/course/${courseId}/quizzes/${col.id}`;
  return `/course/${courseId}/assignments/${col.id}/submissions/${encodeURIComponent(email)}`;
}

function LateMarker() {
  const { tp } = useProgressText();
  return (
    <span className="inline-flex items-center gap-0.5 text-caption font-semibold text-warning-fg" title={tp("grades.submittedLate")}>
      <Clock className="w-3 h-3" aria-hidden="true" /> {tp("common.late")}
    </span>
  );
}

function SubmittedBadge() {
  const { tp } = useProgressText();
  return (
    <span className="text-caption font-semibold text-warning-fg bg-warning-soft border border-warning/30 rounded-full px-1.5 py-0.5 whitespace-nowrap">
      {tp("common.submitted")}
    </span>
  );
}

// One gradebook cell: pct (big) + points/possible (small), "—" when nothing was handed in.
function GradeCell({ cell, pointsPossible }) {
  const { tp } = useProgressText();
  if (!cell || cell.status === "not_submitted") {
    return <span className="text-fg-subtle" aria-label={tp("common.notSubmitted")}>—</span>;
  }
  if (cell.status === "submitted") {
    return (
      <span className="inline-flex flex-col items-center gap-0.5">
        <SubmittedBadge />
        {cell.late ? <LateMarker /> : null}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-center leading-tight">
      <span className="font-semibold text-fg">{cell.pct != null ? `${fmtNum(cell.pct)}%` : "—"}</span>
      <span className="text-caption text-fg-subtle whitespace-nowrap">
        {fmtNum(cell.points)}{pointsPossible ? ` / ${fmtNum(pointsPossible)}` : ""}
      </span>
      {cell.late ? <LateMarker /> : null}
    </span>
  );
}

// A learner's score: "9 / 10"; a closed eye over the points while it isn't marked or published
// yet (hover says which); "– / 10" when nothing was handed in.
function LearnerScore({ cell, pointsPossible }) {
  const { tp } = useProgressText();
  const of = pointsPossible ? ` / ${fmtNum(pointsPossible)}` : "";
  if (cell?.status === "graded") {
    return (
      <span className="inline-flex flex-col items-end leading-tight whitespace-nowrap">
        <span className="font-semibold text-fg">{fmtNum(cell.points)}{of}</span>
        {cell.pct != null ? <span className="text-caption text-fg-subtle">{fmtNum(cell.pct)}%</span> : null}
      </span>
    );
  }
  if (cell?.status === "submitted") {
    const why = cell.scoresHidden ? tp("grades.hiddenScore") : tp("grades.notMarkedYet");
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-fg-muted cursor-help" title={why}>
        <EyeOff className="w-4 h-4" aria-hidden="true" />
        <span className="sr-only">{why}</span>
        <span aria-hidden="true">{of}</span>
      </span>
    );
  }
  return <span className="text-fg-subtle whitespace-nowrap" aria-label={tp("common.notSubmitted")}>–{of}</span>;
}

function TypeLabel({ col }) {
  const { tp } = useProgressText();
  const label = itemTypeLabel(tp, col.type === "quiz" ? "quiz" : col.discussion ? "discussion" : "assignment");
  return (
    <span className={`text-caption font-bold ${col.type === "quiz" ? "text-info-fg" : "text-fg-subtle"}`}>
      {label}
    </span>
  );
}

// Search box + type filter above both gradebooks.
function Filters({ query, onQuery, category, onCategory, placeholder, categories }) {
  const { tp } = useProgressText();
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <TextInput
        icon={Search}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onClear={() => onQuery("")}
        clearLabel={t("learner.common.clearSearch")}
        placeholder={placeholder}
        aria-label={tp("grades.searchLabel")}
        className="w-full sm:w-64"
      />
      <Select size="md" aria-label={tp("grades.typeFilter")} value={category} onChange={(e) => onCategory(e.target.value)} className="w-full sm:w-56">
        <option value="">{tp("grades.allTypes")}</option>
        {categories.map((k) => <option key={k} value={k}>{categoryLabel(tp, k)}</option>)}
      </Select>
    </div>
  );
}

// The learner's side panel: the total (starting from 100%, marks missed come off) and each type.
function TotalPanel({ data }) {
  const { tp } = useProgressText();
  const total = data.totalPct ?? 100;
  return (
    <aside className="space-y-4 lg:w-72 shrink-0" aria-labelledby="grades-total">
      <div className="rounded-xl border border-line p-4 space-y-1">
        <h2 id="grades-total" className="text-ui font-semibold text-fg-muted">{tp("grades.total")}</h2>
        <p className="text-display font-extrabold text-brand-fg">{fmtNum(total)}%</p>
        <p className="text-caption text-fg-subtle">{data.gradedCount ? tp("grades.totalHint") : tp("grades.nothingMarked")}</p>
      </div>
      <div className="rounded-xl border border-line overflow-hidden">
        <h2 className="text-caption font-semibold text-fg-subtle bg-surface-sunken px-3 py-2">{tp("grades.byType")}</h2>
        <ul className="divide-y divide-line">
          {(data.categories || []).map((c) => (
            <li key={c.key} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0">
                <span className="block text-ui font-semibold text-fg">{categoryLabel(tp, c.key)}</span>
                <span className="block text-caption text-fg-subtle">{tp("grades.markedCount", { graded: c.graded, items: c.items })}</span>
              </span>
              <span className={`text-ui font-bold whitespace-nowrap ${c.items ? "text-fg" : "text-fg-subtle"}`}>
                {c.items ? `${fmtNum(c.pct ?? 100)}%` : "—"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

// Publish/hide a column's scores for learners (teachers).
function VisibilityToggle({ courseId, col, onChanged }) {
  const { tp } = useProgressText();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await apiFetch(`/courses/${courseId}/grades/visibility`, { method: "POST", json: { key: col.key, hidden: !col.scoresHidden } });
      onChanged();
    } catch {
      showToast(tp("grades.visibilityFailed"), "error");
    } finally {
      setBusy(false);
    }
  };
  const Icon = col.scoresHidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={col.scoresHidden ? tp("grades.scoresHidden") : tp("grades.scoresVisible")}
      className={`inline-flex items-center gap-1 text-caption font-semibold rounded-full px-2 py-0.5 border disabled:opacity-50 ${
        col.scoresHidden ? "text-warning-fg bg-warning-soft border-warning/30" : "text-fg-subtle border-line hover:bg-surface-hover"
      }`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {col.scoresHidden ? tp("grades.publishScores") : tp("grades.hideScores")}
    </button>
  );
}

// A learner's marked work in full: score, rubric with their marks, and the teacher's comment (which
// can be long), in a panel on the right (from the bottom on phones).
function FeedbackPanel({ courseId, col, cell, onClose }) {
  const { tp } = useProgressText();
  const work = useQuery({
    queryKey: queryKeys.courseSection(courseId, `assignments/${col.id}`),
    queryFn: () => apiFetch(`/courses/${courseId}/assignments/${col.id}`),
    enabled: col.type === "assignment",
  });
  const rubric = useQuery({
    queryKey: [...queryKeys.courseSection(courseId, `assignments/${col.id}`), "rubric"],
    queryFn: () => apiFetch(`/courses/${courseId}/assignments/${col.id}/rubric`).catch(() => null),
    enabled: col.type === "assignment" && !!col.hasRubric,
  });
  const mine = work.data?.mySubmission;
  const scores = Object.fromEntries((mine?.rubricScores || []).map((r) => [r.criterion_id, r]));
  const comment = mine?.feedback || cell?.feedback || "";
  return (
    <SidePanel open onClose={onClose} title={col.title}>
      <div className="space-y-5">
        <div>
          <p className="text-caption font-semibold text-fg-subtle">{tp("common.score")}</p>
          <p className="text-section font-bold text-fg">
            {fmtNum(cell?.points)}{col.pointsPossible ? ` / ${fmtNum(col.pointsPossible)}` : ""}
            {cell?.pct != null ? <span className="text-ui font-semibold text-fg-subtle"> · {fmtNum(cell.pct)}%</span> : null}
          </p>
        </div>
        {col.hasRubric ? (
          rubric.isPending || work.isPending ? <Loader size={32} /> : rubric.data ? <RubricTable rubric={rubric.data} scores={scores} /> : null
        ) : null}
        <div>
          <p className="text-caption font-semibold text-fg-subtle mb-1">{tp("common.feedback")}</p>
          {comment ? <p className="text-body text-fg whitespace-pre-wrap">{comment}</p> : <p className="text-ui text-fg-subtle">—</p>}
        </div>
      </div>
    </SidePanel>
  );
}

const matches = (text, query) => String(text || "").toLowerCase().includes(query.trim().toLowerCase());

export default function GradesPage() {
  const { courseId } = useCourse();
  const { tp, tpn, locale } = useProgressText();
  const { data, loading, error, refetch } = useCourseSection("grades");
  const columns = useMemo(() => (Array.isArray(data?.columns) ? data.columns : []), [data]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [feedbackFor, setFeedbackFor] = useState(null); // a learner's column whose feedback is open
  // Only the types this course uses (plus "other" for work without one).
  const usedCategories = useMemo(() => {
    const used = new Set(columns.map((c) => c.category || "other"));
    return [...GRADE_CATEGORIES, "other"].filter((k) => used.has(k));
  }, [columns]);
  const inCategory = (c) => !category || (c.category || "other") === category;

  return (
    <div>
      <Breadcrumbs sectionKey="grades" />
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader help="pages.grades"
          title={tp("grades.title")}
          actions={data?.role === "student" ? (
            <Link
              href={`/course/${courseId}/progress`}
              className="inline-flex items-center gap-1.5 text-caption font-semibold text-brand-fg border border-brand/40 hover:bg-brand-soft rounded-lg px-3 py-1.5"
            >
              <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" /> {tp("common.myProgress")}
            </Link>
          ) : null}
        />

        {loading ? (
          <Loader variant="page" size={56} className="min-h-[30vh]" />
        ) : error ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4 flex items-center justify-between gap-3">
            <p className="text-ui text-danger-fg">{error}</p>
            <button onClick={refetch} className="text-caption font-semibold text-danger-fg hover:text-danger-fg">{tp("common.retry")}</button>
          </div>
        ) : !data ? (
          <EmptyState compact title={tp("grades.noData")} />
        ) : data.role === "student" ? (
          columns.length === 0 ? (
            <EmptyState compact title={tp("grades.noGradedWork")} />
          ) : (
            <div className="flex flex-col-reverse lg:flex-row gap-6 items-start">
              <div className="flex-1 min-w-0 w-full space-y-3">
                <Filters query={query} onQuery={setQuery} category={category} onCategory={setCategory} placeholder={tp("grades.searchPlaceholder")} categories={usedCategories} />
                <Section>
                  <DataTable
                    caption={tp("grades.yourGrades")}
                    rows={columns.filter((c) => inCategory(c) && matches(c.title, query))}
                    rowKey={(c) => c.key}
                    empty={tp("grades.noMatches")}
                    columns={[
                      {
                        key: "title",
                        header: tp("common.item"),
                        render: (c) => (
                          <div className="min-w-[10rem]">
                            <Link href={columnHref(courseId, c)} className="font-medium text-fg hover:text-brand-fg hover:underline">
                              {c.title}
                            </Link>
                            <div className="text-caption text-fg-subtle">{categoryLabel(tp, c.category)}</div>
                          </div>
                        ),
                      },
                      {
                        key: "due",
                        header: tp("common.due"),
                        className: "whitespace-nowrap text-fg-subtle",
                        render: (c) => (c.dueDate ? formatDate(c.dueDate) : "—"),
                      },
                      {
                        key: "submitted",
                        header: tp("grades.submitted"),
                        className: "whitespace-nowrap text-fg-subtle",
                        render: (c) => {
                          const cell = data.cells?.[c.key];
                          return (
                            <span className="inline-flex flex-col gap-0.5">
                              {cell?.submittedAt ? fmtDateTime(cell.submittedAt, locale) : "—"}
                              {cell?.late ? <LateMarker /> : null}
                            </span>
                          );
                        },
                      },
                      {
                        key: "score",
                        header: tp("common.score"),
                        align: "right",
                        render: (c) => <LearnerScore cell={data.cells?.[c.key]} pointsPossible={c.pointsPossible} />,
                      },
                      {
                        key: "feedback",
                        header: tp("common.feedback"),
                        align: "center",
                        render: (c) => {
                          const cell = data.cells?.[c.key];
                          // Marked work with a comment or rubric marks opens in full.
                          if (cell?.status !== "graded" || !(cell.feedback || c.hasRubric)) return null;
                          return (
                            <button
                              type="button"
                              onClick={() => setFeedbackFor(c)}
                              aria-label={`${tp("common.feedback")}: ${c.title}`}
                              title={tp("common.feedback")}
                              className="inline-flex items-center justify-center rounded-lg p-1.5 text-brand-fg hover:bg-brand-soft"
                            >
                              <MessageSquareText className="w-4 h-4" aria-hidden="true" />
                            </button>
                          );
                        },
                      },
                    ]}
                  />
                </Section>
              </div>
              <TotalPanel data={data} />
              {feedbackFor ? <FeedbackPanel courseId={courseId} col={feedbackFor} cell={data.cells?.[feedbackFor.key]} onClose={() => setFeedbackFor(null)} /> : null}
            </div>
          )
        ) : data.role === "teacher" ? (
          !data.rows || data.rows.length === 0 ? (
            <EmptyState compact title={tp("common.noLearnersEnrolled")} />
          ) : columns.length === 0 ? (
            <EmptyState compact title={tp("grades.noGradedWorkTitle")} description={tp("grades.noGradedWorkHint")} />
          ) : (
            <div className="space-y-3">
              <Filters query={query} onQuery={setQuery} category={category} onCategory={setCategory} placeholder={tp("grades.searchLearners")} categories={usedCategories} />
              <DataTable
                caption={tp("grades.gradebook")}
                rows={data.rows.filter((row) => matches(row.fullName || row.email, query))}
                rowKey={(row) => row.email}
                empty={tp("grades.noMatches")}
                columns={[
                  {
                    key: "fullName",
                    header: tp("common.learner"),
                    className: "sticky left-0 z-10 bg-surface font-medium text-fg-muted whitespace-nowrap shadow-[1px_0_0_0_rgb(226,232,240)]",
                    render: (row) => row.fullName || row.email,
                  },
                  ...columns.filter(inCategory).map((col) => ({
                    key: col.key,
                    align: "center",
                    className: "min-w-[8rem] normal-case",
                    header: (
                      <span className="flex flex-col items-center gap-0.5 normal-case tracking-normal">
                        <Link
                          href={columnHref(courseId, col)}
                          className="text-caption font-semibold text-fg-muted hover:text-brand-fg hover:underline line-clamp-2 max-w-[10rem]"
                          title={col.title}
                        >
                          {col.title}
                        </Link>
                        <span className="flex items-center gap-1">
                          <TypeLabel col={col} />
                          {col.dueDate ? <span className="text-caption font-normal text-fg-subtle whitespace-nowrap">{formatDate(col.dueDate, { day: "numeric", month: "short" })}</span> : null}
                        </span>
                        <span className={`text-caption font-normal ${col.category ? "text-fg-subtle" : "text-warning-fg"}`} title={col.category ? undefined : tp("grades.noType")}>
                          {categoryLabel(tp, col.category)}
                        </span>
                        {col.pointsPossible ? <span className="text-caption font-normal text-fg-subtle">{tpn("common.points", fmtNum(col.pointsPossible))}</span> : null}
                        <VisibilityToggle courseId={courseId} col={col} onChanged={refetch} />
                      </span>
                    ),
                    render: (row) => (
                      <Link
                        href={workHref(courseId, col, row.email)}
                        aria-label={tp("grades.openWork", { name: row.fullName || row.email, item: col.title })}
                        className="block rounded-lg px-1 py-1 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        <GradeCell cell={row.cells?.[col.key]} pointsPossible={col.pointsPossible} />
                      </Link>
                    ),
                  })),
                  {
                    key: "average",
                    header: tp("grades.total"),
                    align: "right",
                    className: "font-bold whitespace-nowrap",
                    render: (row) => (row.averagePct != null ? `${fmtNum(row.averagePct)}%` : <span className="text-fg-subtle">—</span>),
                  },
                ]}
              />
            </div>
          )
        ) : (
          <EmptyState compact title={tp("grades.noData")} />
        )}

        {/* Learners' attendance lives here (there's no Attendance tab for them), once it's been taken. */}
        {data?.role === "student" ? <MyAttendance embedded /> : null}
      </div>
    </div>
  );
}
