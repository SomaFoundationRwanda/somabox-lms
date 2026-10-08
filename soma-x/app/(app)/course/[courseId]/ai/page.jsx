"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Inbox, ChevronDown, ChevronRight } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useToast } from "@/context/ToastContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, Section, List, EmptyState } from "@/components/layout";
import useAiStatus from "@/lib/useAiStatus";
import { aiFetch, cancelAiJob, isActiveJob } from "@/lib/ai";
import { useProgressText, jobKindLabel, weekLabel } from "@/components/progress/text";
import { AiStatusNote, JobProgress } from "@/components/ai/AiBits";
import DraftCard, { ApprovedNote, DecidedDraftRow } from "@/components/ai/DraftCard";
import Loader from "@/components/ui/Loader";

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

  const [jobs, setJobs] = useState([]);
  const [pending, setPending] = useState([]);
  const [decided, setDecided] = useState([]);
  const [modules, setModules] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(() => new Set());
  const [cancelling, setCancelling] = useState(null);
  const [showDecided, setShowDecided] = useState(false);
  const [lastApproved, setLastApproved] = useState(null); // { draft, message }

  useEffect(() => { setDismissed(readDismissed()); }, []);

  const base = `${SERVER_URL}/courses/${courseId}/ai`;

  const loadDrafts = useCallback(async () => {
    const [p, a, r] = await Promise.all([
      aiFetch(`${base}/drafts?status=pending`),
      aiFetch(`${base}/drafts?status=approved`),
      aiFetch(`${base}/drafts?status=rejected`),
    ]);
    if (!p.ok) { setError(p.message); return; }
    setPending(p.data || []);
    const done = [...(a.ok ? a.data || [] : []), ...(r.ok ? r.data || [] : [])];
    done.sort((x, y) => new Date(y.decidedAt || y.createdAt) - new Date(x.decidedAt || x.createdAt));
    setDecided(done);
  }, [base]);

  const loadJobs = useCallback(async () => {
    const j = await aiFetch(`${base}/jobs`);
    if (!j.ok) { setError(j.message); return null; }
    setJobs(j.data || []);
    return j.data || [];
  }, [base]);

  const loadAll = useCallback(async () => {
    if (!SERVER_URL || !courseId || !isTeacher) return;
    setLoading(true);
    setError("");
    const [m, o] = await Promise.all([
      aiFetch(`${SERVER_URL}/courses/${courseId}/modules`),
      aiFetch(`${SERVER_URL}/courses/${courseId}/outcomes`),
      loadJobs(),
      loadDrafts(),
    ]);
    if (m.ok && Array.isArray(m.data)) setModules(m.data);
    if (o.ok && Array.isArray(o.data)) setOutcomes(o.data);
    setLoading(false);
  }, [SERVER_URL, courseId, isTeacher, loadJobs, loadDrafts]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Poll while any job is queued or running; when one finishes, reload the drafts.
  const activeIds = jobs.filter(isActiveJob).map((j) => j.id).join(",");
  const prevActive = useRef("");
  useEffect(() => {
    if (!activeIds) {
      if (prevActive.current) loadDrafts();
      prevActive.current = "";
      return undefined;
    }
    const before = prevActive.current.split(",").filter(Boolean);
    const now = activeIds.split(",");
    if (before.some((id) => !now.includes(id))) loadDrafts();
    prevActive.current = activeIds;
    const t = setTimeout(loadJobs, 3000);
    return () => clearTimeout(t);
  }, [activeIds, jobs, loadJobs, loadDrafts]);

  const cancel = async (job) => {
    setCancelling(job.id);
    const r = await cancelAiJob(SERVER_URL, courseId, job.id);
    setCancelling(null);
    if (!r.ok) { showToast(r.message, "error"); return; }
    setJobs((list) => list.map((j) => (j.id === job.id ? r.data : j)));
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
            <Link href={`/course/${courseId}/modules`} className="text-xs font-semibold text-[#203A3A] dark:text-teal-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg px-3 py-2">
              {tp("ai.page.goToModules")}
            </Link>
          }
        >
          <AiStatusNote status={aiStatus} className="mt-2" />
        </PageHeader>

        {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : null}
        {lastApproved ? (
          <ApprovedNote draft={lastApproved.draft} courseId={courseId} message={lastApproved.message} onDismiss={() => setLastApproved(null)} />
        ) : null}

        <Section
          title={tp("ai.page.inProgress")}
          description={tp("ai.page.inProgressHint")}
        >
          {visibleJobs.length === 0 ? (
            loading ? <Loader variant="page" size={48} className="min-h-[25vh]" label={tp("common.loadingDots")} /> : <EmptyState compact title={tp("ai.page.nothingRunning")} description={tp("ai.page.nothingRunningHint")} />
          ) : (
            <List label={tp("ai.page.jobsList")}>
              {visibleJobs.map((j) => (
                <li key={j.id} className={`px-3 py-3 ${j.status === "failed" ? "bg-rose-50/60 dark:bg-rose-950/20" : ""}`}>
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
                  onUpdated={(next) => setPending((list) => list.map((x) => (x.id === next.id ? next : x)))}
                  onDecided={(next, result) => {
                    setPending((list) => list.filter((x) => x.id !== d.id));
                    setDecided((list) => [{ ...next, decidedAt: new Date().toISOString() }, ...list]);
                    if (result.status === "approved") {
                      setLastApproved({ draft: next, message: result.message });
                      if (next.type === "outline" || next.type === "outcome") {
                        aiFetch(`${SERVER_URL}/courses/${courseId}/outcomes`).then((o) => { if (o.ok && Array.isArray(o.data)) setOutcomes(o.data); });
                        aiFetch(`${SERVER_URL}/courses/${courseId}/modules`).then((m) => { if (m.ok && Array.isArray(m.data)) setModules(m.data); });
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
            className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white"
          >
            {showDecided ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {tp("ai.page.recentlyDecided", { n: decided.length })}
          </button>
          {showDecided ? (
            decided.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500">{tp("ai.page.noneDecided")}</p>
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
