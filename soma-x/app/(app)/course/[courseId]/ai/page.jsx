"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useCourseSection } from "@/lib/useCourseSection";
import Link from "next/link";
import { Sparkles, Inbox, ChevronDown, ChevronRight } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, EmptyState } from "@/components/layout";
import useAiStatus from "@/lib/useAiStatus";
import { cancelAiJob, isActiveJob, startAiJob } from "@/lib/ai";
import { useProgressText, jobKindLabel, weekLabel } from "@/components/progress/text";
import { AiStatusNote, JobProgress } from "@/components/ai/AiBits";
import DraftCard, { ApprovedNote, DecidedDraftRow } from "@/components/ai/DraftCard";
import Loader from "@/components/ui/Loader";
import { Select } from "@/components/form";

const DAY_MS = 24 * 60 * 60 * 1000;
const DISMISS_KEY = "ai-dismissed-jobs";

function readDismissed() {
  try { return new Set(JSON.parse(sessionStorage.getItem(DISMISS_KEY) || "[]")); } catch { return new Set(); }
}
function writeDismissed(set) {
  try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set])); } catch { /* storage unavailable */ }
}

export default function AiDraftsPage() {
  const { SERVER_URL, courseId, isTeacher, course, loading: courseLoading } = useCourse();
  const { showToast } = useToast();
  const { tp } = useProgressText();
  const aiStatus = useAiStatus();

  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(() => new Set());
  const [cancelling, setCancelling] = useState(null);
  const [showDecided, setShowDecided] = useState(false);
  const [lastApproved, setLastApproved] = useState(null); // { draft, message }
  // Start a week draft from here, so the page isn't only a place to wait.
  const [fillWeekId, setFillWeekId] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => { setDismissed(readDismissed()); }, []);

  const enabled = !!courseId && isTeacher;
  const key = (...parts) => queryKeys.courseSection(courseId, ["ai", ...parts].join("/"));
  const draftsKey = key("drafts");
  const jobsKey = key("jobs");

  const jobsQuery = useQuery({
    queryKey: jobsKey,
    queryFn: () => apiFetch(`/courses/${courseId}/ai/jobs`),
    enabled,
    refetchInterval: (q) => ((q.state.data || []).some(isActiveJob) ? 3000 : false),
  });
  const draftsQuery = useQuery({
    queryKey: draftsKey,
    queryFn: async () => {
      const [pendingList, approved, rejected] = await Promise.all(
        ["pending", "approved", "rejected"].map((status) => apiFetch(`/courses/${courseId}/ai/drafts?status=${status}`).catch((err) => (status === "pending" ? Promise.reject(err) : []))),
      );
      const decidedList = [...(approved || []), ...(rejected || [])]
        .sort((x, y) => new Date(y.decidedAt || y.createdAt) - new Date(x.decidedAt || x.createdAt));
      return { pending: pendingList || [], decided: decidedList };
    },
    enabled,
  });
  const { data: modulesData, loading: modulesLoading } = useCourseSection(isTeacher ? "modules" : null);
  const { data: outcomesData } = useCourseSection(isTeacher ? "outcomes" : null);

  const jobs = jobsQuery.data || [];
  const pending = draftsQuery.data?.pending || [];
  const decided = draftsQuery.data?.decided || [];
  const modules = Array.isArray(modulesData) ? modulesData : [];
  const outcomes = Array.isArray(outcomesData) ? outcomesData : [];
  const loading = enabled && (jobsQuery.isPending || draftsQuery.isPending || modulesLoading);
  const error = jobsQuery.isError ? getErrorMessage(jobsQuery.error) : draftsQuery.isError ? getErrorMessage(draftsQuery.error) : "";

  const activeIds = jobs.filter(isActiveJob).map((j) => j.id).join(",");
  const prevActive = useRef("");
  useEffect(() => {
    if (prevActive.current && prevActive.current !== activeIds) queryClient.invalidateQueries({ queryKey: draftsKey });
    prevActive.current = activeIds;
  }, [activeIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDrafts = (change) => queryClient.setQueryData(draftsKey, (d) => (d ? change(d) : d));
  const loadJobs = () => queryClient.invalidateQueries({ queryKey: jobsKey });

  const cancel = async (job) => {
    setCancelling(job.id);
    const r = await cancelAiJob(SERVER_URL, courseId, job.id);
    setCancelling(null);
    if (!r.ok) { showToast(r.message, "error"); return; }
    queryClient.setQueryData(jobsKey, (list) => (list || []).map((j) => (j.id === job.id ? r.data : j)));
  };

  const startFillWeek = async (e) => {
    e?.preventDefault();
    if (!fillWeekId) return;
    setStarting(true);
    const r = await startAiJob(SERVER_URL, courseId, { kind: "fill_week", moduleId: Number(fillWeekId), input: {} });
    setStarting(false);
    if (!r.ok) { showToast(r.message, "error"); return; }
    showToast(tp("ai.page.started"), "success");
    setFillWeekId("");
    loadJobs();
  };

  const dismiss = (id) => {
    setDismissed((s) => {
      const next = new Set(s);
      next.add(id);
      writeDismissed(next);
      return next;
    });
  };

  if (!courseLoading && course && !isTeacher) {
    return (
      <div>
        <Breadcrumbs sectionKey="ai" />
        <div className="p-4 md:p-6 max-w-4xl">
          <EmptyState compact title={tp("ai.page.notAvailable")} description={tp("ai.page.teachersOnly")} />
        </div>
      </div>
    );
  }

  const moduleFor = (id) => modules.find((m) => Number(m.id) === Number(id));
  const activeJobs = jobs.filter(isActiveJob);
  const failedJobs = jobs.filter((j) => j.status === "failed" && !dismissed.has(j.id) && Date.now() - new Date(j.finishedAt || j.createdAt).getTime() < DAY_MS);
  const visibleJobs = [...activeJobs, ...failedJobs].filter((j) => j.kind !== "grading" || isActiveJob(j));

  // Regular weeks a draft can be made for; a week already being filled is listed but disabled.
  const weeks = modules.filter((m) => m.kind === "regular");
  const busyWeekIds = new Set(activeJobs.filter((j) => j.kind === "fill_week").map((j) => Number(j.moduleId)));

  const jobLabel = (j) => {
    const m = j.moduleId ? moduleFor(j.moduleId) : null;
    return `${jobKindLabel(tp, j.kind)}${m ? ` · ${weekLabel(tp, m)}${m.title ? `: ${m.title}` : ""}` : ""}`;
  };

  return (
    <div>
      <Breadcrumbs sectionKey="ai" />
      <div className="p-4 md:p-6 space-y-8 max-w-4xl">
        <PageHeader
          eyebrow={<span className="inline-flex items-center gap-1"><Sparkles className="w-3 h-3" /> {tp("ai.page.eyebrow")}</span>}
          title={tp("ai.page.title")}
          description={tp("ai.page.description")}
          actions={
            <Link href={`/course/${courseId}/modules`} className="text-caption font-semibold text-brand-fg border border-line hover:bg-surface-hover rounded-lg px-3 py-2">
              {tp("ai.page.goToModules")}
            </Link>
          }
        >
          <AiStatusNote status={aiStatus} className="mt-2" />
        </PageHeader>

        {error ? <p role="alert" className="text-ui text-danger-fg">{error}</p> : null}
        {lastApproved ? (
          <ApprovedNote draft={lastApproved.draft} courseId={courseId} message={lastApproved.message} onDismiss={() => setLastApproved(null)} />
        ) : null}

        {aiStatus.allowed ? (
          <Section
            title={<span className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-brand-fg" /> {tp("ai.page.startTitle")}</span>}
            description={tp("ai.page.startHint")}
          >
            {weeks.length === 0 ? (
              <p className="text-caption text-fg-subtle">
                {tp("ai.page.noWeeks")}{" "}
                <Link href={`/course/${courseId}/modules`} className="font-semibold text-brand-fg hover:underline">{tp("ai.page.goToModules")}</Link>
              </p>
            ) : (
              <form onSubmit={startFillWeek} className="flex flex-wrap items-center gap-2">
                <Select aria-label={tp("ai.page.chooseWeek")} value={fillWeekId} onChange={(e) => setFillWeekId(e.target.value)} className="min-w-[14rem]" >
                  <option value="">{tp("ai.page.chooseWeek")}</option>
                  {weeks.map((m) => (
                    <option key={m.id} value={m.id} disabled={busyWeekIds.has(Number(m.id))}>
                      {weekLabel(tp, m)}{m.title ? `: ${m.title}` : ""}
                    </option>
                  ))}
                </Select>
                <button
                  type="submit"
                  disabled={!fillWeekId || starting}
                  className="inline-flex items-center gap-1.5 text-caption font-semibold text-on-brand bg-brand hover:bg-brand/90 disabled:opacity-50 rounded-lg px-3.5 py-2"
                >
                  <Sparkles className="w-3.5 h-3.5" /> {starting ? tp("common.starting") : tp("ai.page.startButton")}
                </button>
              </form>
            )}
          </Section>
        ) : null}

        <Section
          divided={aiStatus.allowed}
          title={tp("ai.page.inProgress")}
          description={tp("ai.page.inProgressHint")}
        >
          {visibleJobs.length === 0 ? (
            loading ? <Loader variant="page" size={48} className="min-h-[25vh]" label={tp("common.loadingDots")} /> : <EmptyState compact title={tp("ai.page.nothingRunning")} description={tp("ai.page.nothingRunningHint")} />
          ) : (
            <List label={tp("ai.page.jobsList")}>
              {visibleJobs.map((j) => (
                <li key={j.id} className={`px-3 py-3 ${j.status === "failed" ? "bg-danger-soft/60" : ""}`}>
                  <JobProgress
                    job={j}
                    label={jobLabel(j)}
                    onCancel={() => cancel(j)}
                    cancelling={cancelling === j.id}
                    onDismiss={j.status === "failed" ? () => dismiss(j.id) : undefined}
                  />
                </li>
              ))}
            </List>
          )}
        </Section>

        <Section
          divided
          title={`${tp("ai.page.waiting")}${pending.length ? ` (${pending.length})` : ""}`}
          description={tp("ai.page.waitingHint")}
        >
          {pending.length === 0 ? (
            loading ? <Loader variant="page" size={48} className="min-h-[25vh]" label={tp("common.loadingDots")} /> : <EmptyState compact icon={<Inbox className="w-6 h-6" />} title={tp("ai.page.noneWaiting")} />
          ) : (
            <div className="space-y-4">
              {pending.map((d) => (
                <DraftCard
                  key={d.id}
                  draft={d}
                  SERVER_URL={SERVER_URL}
                  courseId={courseId}
                  modules={modules}
                  outcomes={outcomes}
                  headingLevel={3}
                  onUpdated={(next) => setDrafts((d) => ({ ...d, pending: d.pending.map((x) => (x.id === next.id ? next : x)) }))}
                  onDecided={(next, result) => {
                    setDrafts((all) => ({ pending: all.pending.filter((x) => x.id !== d.id), decided: [{ ...next, decidedAt: new Date().toISOString() }, ...all.decided] }));
                    if (result.status === "approved") {
                      setLastApproved({ draft: next, message: result.message });
                      if (next.type === "outline" || next.type === "outcome") {
                        queryClient.invalidateQueries({ queryKey: queryKeys.courseSection(courseId, "outcomes") });
                        queryClient.invalidateQueries({ queryKey: queryKeys.courseSection(courseId, "modules") });
                      }
                    }
                  }}
                />
              ))}
            </div>
          )}
        </Section>

        <Section divided>
          <button
            type="button"
            onClick={() => setShowDecided((v) => !v)}
            aria-expanded={showDecided}
            className="flex items-center gap-1.5 text-ui font-bold text-fg"
          >
            {showDecided ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {tp("ai.page.recentlyDecided", { n: decided.length })}
          </button>
          {showDecided ? (
            decided.length === 0 ? (
              <p className="mt-2 text-caption text-fg-subtle">{tp("ai.page.noneDecided")}</p>
            ) : (
              <List label={tp("ai.page.decidedList")} className="mt-3">
                {decided.map((d) => (
                  <DecidedDraftRow key={d.id} draft={d} modules={modules} outcomes={outcomes} courseId={courseId} />
                ))}
              </List>
            )
          ) : null}
        </Section>
      </div>
    </div>
  );
}
