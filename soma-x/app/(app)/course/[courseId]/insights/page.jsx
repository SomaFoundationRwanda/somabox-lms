"use client";

import { Suspense, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DataContext from "@/context/DataContext";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader } from "@/components/layout";
import MyProgress from "@/components/progress/MyProgress";
import { trackEvent } from "@/lib/usage";
import { LoadingRows, ErrorNote } from "@/components/insights/bits";
import ClassTab from "@/components/insights/ClassTab";
import OutcomesTab from "@/components/insights/OutcomesTab";
import LearnersTab from "@/components/insights/LearnersTab";
import ItemsTab from "@/components/insights/ItemsTab";

const TABS = [
  { key: "class", label: "Class" },
  { key: "outcomes", label: "Outcomes" },
  { key: "learners", label: "Learners" },
  { key: "items", label: "Items" },
];

function TeacherInsights() {
  const { SERVER_URL, courseId, course } = useCourse();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab = TABS.some((t) => t.key === tabParam) ? tabParam : "class";
  const flaggedOnly = searchParams.get("flagged") === "1";
  const tabRefs = useRef({});

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!SERVER_URL || !courseId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/insights`);
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.message || "Couldn't load insights.");
      setData(payload);
    } catch (err) {
      setError(err.message || "Couldn't load insights.");
    } finally {
      setLoading(false);
    }
  }, [SERVER_URL, courseId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (courseId) trackEvent("insights_viewed", { tab }, courseId);
  }, [tab, courseId]);

  const setParams = (next) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v == null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const selectTab = (key, focus = false) => {
    setParams({ tab: key === "class" ? null : key, flagged: key === "learners" ? searchParams.get("flagged") : null });
    if (focus) tabRefs.current[key]?.focus();
  };

  const onTabKey = (e) => {
    const i = TABS.findIndex((t) => t.key === tab);
    let next = null;
    if (e.key === "ArrowRight") next = TABS[(i + 1) % TABS.length];
    else if (e.key === "ArrowLeft") next = TABS[(i - 1 + TABS.length) % TABS.length];
    else if (e.key === "Home") next = TABS[0];
    else if (e.key === "End") next = TABS[TABS.length - 1];
    if (next) {
      e.preventDefault();
      selectTab(next.key, true);
    }
  };

  return (
    <div>
      <Breadcrumbs sectionKey="insights" />
      <div className="p-4 md:p-6 space-y-6 max-w-6xl">
        <PageHeader
          title="Insights"
          help="pages.insights"
          description={`How ${data?.course?.title || course?.title || "this course"} is going, from graded work and graded quizzes only. Practice doesn't count. Growth is measured against each outcome's Week 0 baseline.`}
          meta={data?.today ? <span>Figures as of {new Date(`${data.today}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span> : null}
        />

        <div role="tablist" aria-label="Insights views" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" onKeyDown={onTabKey}>
          {TABS.map((t) => {
            const selected = t.key === tab;
            return (
              <button
                key={t.key}
                ref={(el) => { tabRefs.current[t.key] = el; }}
                type="button"
                role="tab"
                id={`insights-tab-${t.key}`}
                aria-selected={selected}
                aria-controls={`insights-panel-${t.key}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => selectTab(t.key)}
                className={`shrink-0 px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                  selected ? "border-[#0D9488] text-[#0D9488]" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div role="tabpanel" id={`insights-panel-${tab}`} aria-labelledby={`insights-tab-${tab}`} tabIndex={0} className="focus:outline-none">
          {loading && !data ? (
            <LoadingRows count={4} />
          ) : error ? (
            <ErrorNote message={error} onRetry={load} />
          ) : !data ? null : tab === "class" ? (
            <ClassTab data={data} reload={load} onShowFlagged={() => setParams({ tab: "learners", flagged: "1" })} />
          ) : tab === "outcomes" ? (
            <OutcomesTab data={data} />
          ) : tab === "learners" ? (
            <LearnersTab data={data} flaggedOnly={flaggedOnly} setFlaggedOnly={(v) => setParams({ flagged: v ? "1" : null })} />
          ) : (
            <ItemsTab data={data} />
          )}
        </div>
      </div>
    </div>
  );
}

function InsightsRoute() {
  const { isTeacher, course } = useCourse();
  const { role } = useContext(DataContext);
  // Teachers (and admins) see the class view. Learners only reach this page when the teacher
  // shows the Insights nav item to them: they see their own progress instead.
  if (isTeacher || role === "admin") return <TeacherInsights />;
  if (!course) return null;
  return <MyProgress sectionKey="insights" />;
}

export default function InsightsPage() {
  return (
    <Suspense fallback={<div className="p-4 md:p-6"><LoadingRows /></div>}>
      <InsightsRoute />
    </Suspense>
  );
}
