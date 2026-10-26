"use client";

import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, List, ListRow, EmptyState } from "@/components/layout";
import { ExplainerText } from "@/components/help/Explainer";
import { useCourseText } from "@/components/course/useCourseText";
import Loader from "@/components/ui/Loader";

export default function PagesListPage() {
  const { courseId, isTeacher } = useCourse();
  const { t } = useCourseText();
  const section = useCourseSection("pages");
  const pages = Array.isArray(section.data) ? section.data : [];
  const loading = section.loading;

  return (
    <div>
      <Breadcrumbs sectionKey="pages" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <PageHeader help="pages.pages"
          title={t("nav.pages")}
          description={t("lists.pagesDescription")}
          actions={isTeacher ? (
            <Link
              href={`/course/${courseId}/modules`}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--brand-secondary)] hover:bg-[var(--brand-secondary-dark)] rounded-lg px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> {t("lists.addFromModules")}
            </Link>
          ) : null}
        />

        {pages.length === 0 ? (
          loading ? <Loader variant="page" size={48} className="min-h-[25vh]" label={t("lists.loadingPages")} /> : <EmptyState compact title={t("lists.noPages")} description={<ExplainerText k="pages.pages" />} />
        ) : (
          <List label={t("nav.pages")}>
            {pages.map((p) => (
              <ListRow
                key={p.id}
                icon={<FileText className="w-4 h-4 text-[var(--brand-secondary)]" />}
                title={p.title}
                href={`/course/${courseId}/pages/${p.id}`}
                actions={
                  <Link href={`/course/${courseId}/pages/${p.id}`} className="text-xs font-semibold text-[var(--brand-secondary)] hover:underline">
                    {t("lists.read")} &rarr;
                  </Link>
                }
              />
            ))}
          </List>
        )}
      </div>
    </div>
  );
}
