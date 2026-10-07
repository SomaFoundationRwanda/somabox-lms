"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { PageHeader, List, ListRow, EmptyState } from "@/components/layout";

export default function PagesListPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    if (!SERVER_URL || !courseId) return;
    try {
      setLoading(true);
      const pageRes = await fetch(`${SERVER_URL}/courses/${courseId}/pages`);
      if (pageRes.ok) setPages(await pageRes.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [SERVER_URL, courseId, userEmail]);

  return (
    <div>
      <Breadcrumbs sectionKey="pages" />
      <div className="p-4 md:p-6 space-y-6 max-w-4xl">
        <PageHeader
          title="Pages"
          description="Pages provide readings and study content bound to module week slots."
          actions={isTeacher ? (
            <Link
              href={`/course/${courseId}/modules`}
              className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#0D9488] hover:bg-teal-700 rounded-lg px-3.5 py-2 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add from Modules
            </Link>
          ) : null}
        />

        {pages.length === 0 ? (
          <EmptyState compact title={loading ? "Loading pages..." : "No pages created yet."} />
        ) : (
          <List label="Pages">
            {pages.map((p) => (
              <ListRow
                key={p.id}
                icon={<FileText className="w-4 h-4 text-[#0D9488]" />}
                title={p.title}
                href={`/course/${courseId}/pages/${p.id}`}
                actions={
                  <Link href={`/course/${courseId}/pages/${p.id}`} className="text-xs font-semibold text-[#0D9488] hover:underline">
                    Read &rarr;
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
