"use client";

import { useEffect, useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { useParams } from "next/navigation";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import dynamic from "next/dynamic";
import TeacherPageChrome from "@/components/course/pages/TeacherPageChrome";
import StudentPageChrome from "@/components/course/pages/StudentPageChrome";
import PrevNextNav from "@/components/course/navigation/PrevNextNav";
import { AlertCircle } from "lucide-react";
import { useItemOpened } from "@/lib/usage";
import { useCourseText } from "@/components/course/useCourseText";
import Loader from "@/components/ui/Loader";
import { CheckboxField, Label, TextInput } from "@/components/form";

function EditorLoading() {
  const { t } = useCourseText();
  return <Loader variant="page" size={48} className="min-h-[30vh]" label={t("pageView.loadingEditor")} />;
}

// The editor (TipTap) loads only when a teacher clicks Edit; reading uses PageContent.
const RichTextEditor = dynamic(() => import("@/components/course/editor/RichTextEditor"), {
  ssr: false,
  loading: () => <EditorLoading />,
});

export default function PageDetailPage() {
  const { courseId, pageId } = useParams();
  useItemOpened("page", pageId, courseId);
  const { SERVER_URL, userEmail, isTeacher } = useCourse();
  const { t, tf } = useCourseText();
  const queryClient = useQueryClient();
  const pageQuery = useQuery({
    queryKey: queryKeys.courseSection(courseId, `pages/${pageId}`),
    queryFn: () => apiFetch(`/courses/${courseId}/pages/${pageId}`),
    enabled: !!SERVER_URL && !!userEmail,
  });
  const page = pageQuery.data || null;
  const loading = pageQuery.isPending;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [editorData, setEditorData] = useState({ json: null, html: "" });
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [altWarning, setAltWarning] = useState(null);

  const editorRef = useRef(null);

  // The form follows the page as loaded (and reloaded after a save).
  useEffect(() => {
    if (!page) return;
    setTitle(page.title);
    setPublished(Boolean(page.published));
  }, [page]);

  // A page's title and visibility also show in the pages list and on Modules.
  const pageChanged = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.courseSection(courseId, "pages") });
    queryClient.invalidateQueries({ queryKey: queryKeys.courseSection(courseId, "modules") });
  };

  const togglePublish = async () => {
    if (!page) return;
    const nextState = !page.published;
    await apiFetch(`/courses/${courseId}/pages/${pageId}`, { method: "PATCH", json: { published: nextState } }).catch(console.error);
    pageChanged();
  };

  const save = async () => {
    setAltWarning(null);

    // Validate Alt Text on Image Nodes
    if (editorRef.current) {
      const validation = editorRef.current.validateAltText();
      if (!validation.isValid) {
        setAltWarning(tf(validation.missingCount === 1 ? "editors.altWarningOne" : "editors.altWarningMany", { n: validation.missingCount }));
        return;
      }
    }

    setSaving(true);
    try {
      await apiFetch(`/courses/${courseId}/pages/${pageId}`, {
        method: "PATCH",
        json: {
          title,
          body: editorData.html || page?.body || "",
          bodyJson: editorData.json ? JSON.stringify(editorData.json) : page?.body_json || null,
          bodyHtml: editorData.html || page?.body_html || "",
          published,
        },
      }).catch(console.error);
      setEditing(false);
      pageChanged();
    } finally {
      setSaving(false);
    }
  };

  const getEditorContent = () => {
    if (page?.body_json) {
      try {
        return typeof page.body_json === "string" ? JSON.parse(page.body_json) : page.body_json;
      } catch { /* fall through */ }
    }
    if (page?.body_html) return page.body_html;
    if (page?.body) return `<p>${page.body}</p>`;
    return "";
  };

  if (loading) return <Loader variant="page" />;
  if (!page) return <div className="p-6"><p className="text-ui text-danger-fg">{t("pageView.notFound")}</p></div>;

  return (
    <div>
      <Breadcrumbs sectionKey="pages" itemName={page.title} />
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
        {editing ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="page-title">{t("editors.pageTitle")}</Label>
              <TextInput size="lg" id="page-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("editors.pageTitle")} className="w-full" />
            </div>

            {/* Alt Text Validation Banner */}
            {altWarning && (
              <div className="flex items-center gap-2 p-3 bg-warning-soft border border-warning/30 text-warning-fg rounded-xl text-caption font-semibold">
                <AlertCircle className="w-4 h-4 text-warning-fg shrink-0" />
                <span>{altWarning}</span>
              </div>
            )}

            <div>
              <p className="block text-caption font-semibold text-fg-muted mb-1">{t("editors.content")}</p>
              <RichTextEditor
                ref={editorRef}
                content={getEditorContent()}
                onUpdate={setEditorData}
                minHeight="400px"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-line">
              <CheckboxField label={t("pageView.publishedVisible")} checked={published} onCheckedChange={setPublished} />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setEditing(false); setAltWarning(null); }}
                  className="text-caption font-medium text-fg-subtle hover:text-fg-muted px-3 py-2"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 disabled:opacity-50 rounded-lg px-5 py-2.5 transition-colors shadow-sm"
                >
                  {saving ? t("common.saving") : t("editors.saveChanges")}
                </button>
              </div>
            </div>
          </div>
        ) : isTeacher ? (
          <TeacherPageChrome
            page={page}
            onEdit={() => setEditing(true)}
            onTogglePublish={togglePublish}
          />
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
