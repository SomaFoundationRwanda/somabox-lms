"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useParams } from "next/navigation";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import TeacherPageChrome from "@/components/course/pages/TeacherPageChrome";
import StudentPageChrome from "@/components/course/pages/StudentPageChrome";
import PrevNextNav from "@/components/course/navigation/PrevNextNav";
import { useItemOpened } from "@/lib/usage";
import { useCourseText } from "@/components/course/useCourseText";
import Loader from "@/components/ui/Loader";

export default function PageDetailPage() {
  const { courseId, pageId } = useParams();
  useItemOpened("page", pageId, courseId);
  const { SERVER_URL, userEmail, isTeacher } = useCourse();
  const { t } = useCourseText();
  const pageQuery = useQuery({
    queryKey: queryKeys.courseSection(courseId, `pages/${pageId}`),
    queryFn: () => apiFetch(`/courses/${courseId}/pages/${pageId}`),
    enabled: !!SERVER_URL && !!userEmail,
  });
  const page = pageQuery.data || null;
  const loading = pageQuery.isPending;
  if (loading) return <Loader variant="page" />;
  if (!page) return <div className="p-6"><p className="text-ui text-fg-muted">{t("pageView.notFound")}</p></div>;

  return (
    <div>
      <Breadcrumbs sectionKey="pages" itemName={page.title} />
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        {isTeacher ? (
          <TeacherPageChrome page={page} />
        ) : (
          <StudentPageChrome
            page={page}
            SERVER_URL={SERVER_URL}
            courseId={courseId}
            userEmail={userEmail}
          />
        )}

        <PrevNextNav
          courseId={courseId}
          itemType="page"
          contentId={pageId}
        />
      </div>
    </div>
  );
}
