"use client";

// One learner's work on one assignment (teachers), opened from the gradebook or the assignment's
// submissions: read it, grade it, then step to the previous or next learner. ?group=<id> keeps
// the stepping inside one group.
import { Suspense } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, List } from "@/components/layout";
import SubmissionGrader from "@/components/course/grading/SubmissionGrader";
import { useCourseText } from "@/components/course/useCourseText";
import Loader from "@/components/ui/Loader";
import { Select } from "@/components/form";

const lower = (v) => String(v || "").toLowerCase();

function LearnerSubmission() {
  const { courseId, assignmentId, learner } = useParams();
  const email = lower(decodeURIComponent(learner || ""));
  const router = useRouter();
  const params = useSearchParams();
  const groupParam = params.get("group") || "";
  const { isTeacher, userEmail } = useCourse();
  const { t, tf } = useCourseText();
  const queryClient = useQueryClient();

  // The same kept copies as the assignment's own page.
  const assignmentKey = queryKeys.courseSection(courseId, `assignments/${assignmentId}`);
  const assignmentQuery = useQuery({
    queryKey: assignmentKey,
    queryFn: () => apiFetch(`/courses/${courseId}/assignments/${assignmentId}`),
    enabled: !!courseId && !!assignmentId && !!userEmail && isTeacher,
  });
  const rubricQuery = useQuery({
    queryKey: [...assignmentKey, "rubric"],
    queryFn: () => apiFetch(`/courses/${courseId}/assignments/${assignmentId}/rubric`).catch(() => null),
    enabled: !!courseId && !!assignmentId && !!userEmail && isTeacher,
  });
  const { data: peopleData, loading: peopleLoading } = useCourseSection(isTeacher ? "people" : null);
  const { data: groupData } = useCourseSection(isTeacher ? "groups" : null);

  if (!isTeacher) return <p className="p-6 text-ui text-fg-muted">{t("assignment.notFound")}</p>;
  if (assignmentQuery.isPending || rubricQuery.isPending || peopleLoading) return <Loader variant="page" label={t("assignment.loading")} />;
  const assignment = assignmentQuery.data;
  if (!assignment) return <p className="p-6 text-ui text-fg-muted">{t("assignment.notFound")}</p>;

  const groups = Array.isArray(groupData?.groups) ? groupData.groups : [];
  const group = groups.find((g) => String(g.id) === groupParam) || null;
  const inGroup = (g, who) => g.members.some((m) => lower(m.email) === lower(who));
  // Learners this assignment is for: everyone, or the members of the groups it was given to.
  const givenTo = (assignment.groups || []).map((g) => groups.find((x) => x.id === g.id)).filter(Boolean);
  const isGiven = (who) => !givenTo.length || givenTo.some((g) => inGroup(g, who));
  const learners = (Array.isArray(peopleData) ? peopleData : [])
    .filter((p) => p.role === "student" && p.status === "active" && p.account)
    .filter((p) => isGiven(p.account) && (!group || inGroup(group, p.account)))
    .sort((a, b) => String(a.fullName || a.account).localeCompare(String(b.fullName || b.account)));

  const submissions = Array.isArray(assignment.submissions) ? assignment.submissions : [];
  const person = (Array.isArray(peopleData) ? peopleData : []).find((p) => lower(p.account) === email) || null;
  const submission = submissions.find((s) => lower(s.scholar_email) === email)
    || (person ? { scholar_email: person.account, fullName: person.fullName, grade: null, feedback: "", rubricScores: [] } : null);
  const name = submission?.fullName || person?.fullName || email;

  const index = learners.findIndex((p) => lower(p.account) === email);
  const href = (who, groupId = groupParam) => `/course/${courseId}/assignments/${assignmentId}/submissions/${encodeURIComponent(who)}${groupId ? `?group=${groupId}` : ""}`;
  const prev = index > 0 ? learners[index - 1] : null;
  const next = index >= 0 && index < learners.length - 1 ? learners[index + 1] : null;

  const gradesChanged = () => {
    queryClient.invalidateQueries({ queryKey: assignmentKey });
    for (const section of ["grades", "insights", "outcome-mastery", "home-loop"]) {
      queryClient.invalidateQueries({ queryKey: queryKeys.courseSection(courseId, section) });
    }
  };

  // Changing the group keeps this learner when they're in it, else opens its first member.
  const pickGroup = (groupId) => {
    const g = groups.find((x) => String(x.id) === groupId);
    if (!g || inGroup(g, email)) return router.replace(href(email, groupId));
    const first = (Array.isArray(peopleData) ? peopleData : [])
      .filter((p) => p.role === "student" && p.status === "active" && p.account && inGroup(g, p.account) && isGiven(p.account))
      .sort((a, b) => String(a.fullName || a.account).localeCompare(String(b.fullName || b.account)))[0];
    return router.replace(first ? href(first.account, groupId) : href(email, groupId));
  };

  const stepButton = "inline-flex items-center gap-1 text-caption font-semibold rounded-lg px-3 py-2 border border-line";
  return (
    <div>
      <Breadcrumbs sectionKey="assignments" itemName={assignment.title} />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <Link href={`/course/${courseId}/assignments/${assignmentId}#submissions`} className="inline-flex items-center gap-1 text-caption font-semibold text-brand-fg hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" /> {t("submission.allSubmissions")}
        </Link>

        <PageHeader
          title={tf("submission.title", { name })}
          description={assignment.title}
          actions={groups.length ? (
            <Select size="sm" aria-label={t("submission.show")} value={groupParam} onChange={(e) => pickGroup(e.target.value)} className="w-48">
              <option value="">{t("submission.everyone")}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{tf("groups.groupBadge", { name: g.name })}</option>)}
            </Select>
          ) : null}
        />

        <nav aria-label={t("submission.learners")} className="flex flex-wrap items-center justify-between gap-2">
          {prev ? (
            <Link href={href(prev.account)} className={`${stepButton} text-fg-muted hover:bg-surface-hover`}>
              <ChevronLeft className="w-4 h-4" aria-hidden="true" /> {t("submission.previous")}
            </Link>
          ) : <span className={`${stepButton} text-fg-subtle opacity-50`} aria-disabled="true"><ChevronLeft className="w-4 h-4" aria-hidden="true" /> {t("submission.previous")}</span>}
          {index >= 0 ? <span className="text-caption text-fg-subtle">{tf("submission.position", { n: index + 1, total: learners.length })}</span> : null}
          {next ? (
            <Link href={href(next.account)} className={`${stepButton} text-fg-muted hover:bg-surface-hover`}>
              {t("submission.next")} <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </Link>
          ) : <span className={`${stepButton} text-fg-subtle opacity-50`} aria-disabled="true">{t("submission.next")} <ChevronRight className="w-4 h-4" aria-hidden="true" /></span>}
        </nav>

        {!submission ? (
          <p role="alert" className="text-ui text-fg-muted">{t("submission.notInCourse")}</p>
        ) : (
          <>
            {!isGiven(email) ? <p className="text-caption font-semibold text-warning-fg">{t("submission.notAssigned")}</p> : null}
            <List label={tf("submission.title", { name })}>
              <SubmissionGrader
                key={`${email}-${submission.graded_at || ""}-${submission.grade ?? ""}-${rubricQuery.data?.id ?? "none"}`}
                courseId={courseId}
                assignmentId={assignmentId}
                submission={submission}
                rubric={rubricQuery.data ?? null}
                pointsPossible={assignment.points_possible}
                defaultOpen
                onSaved={gradesChanged}
              />
            </List>
          </>
        )}
      </div>
    </div>
  );
}

export default function LearnerSubmissionPage() {
  return (
    <Suspense fallback={<Loader variant="page" />}>
      <LearnerSubmission />
    </Suspense>
  );
}
