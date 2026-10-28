"use client";

// What a person sees instead of a course page they can't use: a section that isn't open to them,
// or a course they aren't in (with Join for a public, open course).
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, LogIn } from "lucide-react";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Heading, Text } from "@/components/typography";
import { useCourseText } from "@/components/course/useCourseText";

function Panel({ title, children }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-3">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-surface-sunken text-fg-subtle" aria-hidden="true">
          <Lock className="h-5 w-5" />
        </span>
        <Heading level={1} variant="section">{title}</Heading>
        {children}
      </div>
    </div>
  );
}

/** A section of the course this person can't use (hidden from learners, or for staff only). */
export function SectionUnavailable({ courseId, section }) {
  const { t, tf, navLabel } = useCourseText();
  return (
    <Panel title={t("access.sectionTitle")}>
      <Text tone="muted">{tf("access.sectionText", { section: navLabel(section) })}</Text>
      <div className="pt-2">
        <Button asChild variant="outline">
          <Link href={`/course/${courseId}/home`}>{t("access.backToCourse")}</Link>
        </Button>
      </div>
    </Panel>
  );
}

/**
 * Not a member of this course. A public, open course shows what it is and a Join button
 * (POST /courses/:id/join, as on Discover); otherwise it says how to get in.
 */
export function NotEnrolled({ courseId, notEnrolled }) {
  const { t } = useCourseText();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const course = notEnrolled?.course;

  const join = async () => {
    setJoining(true);
    setError("");
    try {
      await apiFetch(`/courses/${courseId}/join`, { method: "POST", json: {} });
      await queryClient.invalidateQueries({ queryKey: queryKeys.course(courseId) });
      router.replace(`/course/${courseId}/home`);
    } catch (err) {
      setError(getErrorMessage(err) || t("access.joinFailed"));
      setJoining(false);
    }
  };

  // Joined with the course's code: the teacher hasn't let them in yet.
  if (notEnrolled?.code === "PENDING") {
    return (
      <Panel title={course?.title || t("access.pendingTitle")}>
        <Text tone="muted">{t("access.pendingText")}</Text>
        <div className="pt-2">
          <Button asChild variant="outline">
            <Link href="/manage/scholar-dashboard">{t("access.backToDashboard")}</Link>
          </Button>
        </div>
      </Panel>
    );
  }

  if (course) {
    return (
      <Panel title={course.title}>
        {course.description ? <Text tone="muted">{course.description}</Text> : null}
        <Text tone="muted">{t("access.publicText")}</Text>
        {error ? <p role="alert" className="text-ui text-danger-fg">{error}</p> : null}
        <div className="pt-2 flex flex-wrap justify-center gap-2">
          <Button onClick={join} disabled={joining} className="gap-1.5">
            <LogIn className="h-4 w-4" aria-hidden="true" /> {joining ? t("access.joining") : t("access.join")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/discover-courses">{t("access.discover")}</Link>
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title={notEnrolled?.code === "REMOVED" ? t("access.removedTitle") : t("access.privateTitle")}>
      <Text tone="muted">{notEnrolled?.code === "REMOVED" ? t("access.removedText") : t("access.privateText")}</Text>
      <div className="pt-2">
        <Button asChild variant="outline">
          <Link href="/discover-courses">{t("access.joinWithCode")}</Link>
        </Button>
      </div>
    </Panel>
  );
}
