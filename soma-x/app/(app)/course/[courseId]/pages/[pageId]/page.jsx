"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { useCourse } from "@/context/CourseContext";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import RichTextEditor from "@/components/course/editor/RichTextEditor";
import TeacherPageChrome from "@/components/course/pages/TeacherPageChrome";
import StudentPageChrome from "@/components/course/pages/StudentPageChrome";
import PrevNextNav from "@/components/course/navigation/PrevNextNav";
import { AlertCircle } from "lucide-react";

export default function PageDetailPage() {
  const { courseId, pageId } = useParams();
  const { SERVER_URL, userEmail, isTeacher } = useCourse();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [editorData, setEditorData] = useState({ json: null, html: "" });
  const [published, setPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [altWarning, setAltWarning] = useState(null);

  const editorRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`${SERVER_URL}/courses/${courseId}/pages/${pageId}`);
    const payload = await res.json();
    if (res.ok) {
      setPage(payload);
      setTitle(payload.title);
      setPublished(Boolean(payload.published));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (SERVER_URL && userEmail) load();
  }, [SERVER_URL, userEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePublish = async () => {
    if (!page) return;
    const nextState = !page.published;
    await fetch(`${SERVER_URL}/courses/${courseId}/pages/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ published: nextState }),
    });
    load();
  };

  const save = async () => {
    setAltWarning(null);

    // Validate Alt Text on Image Nodes
    if (editorRef.current) {
      const validation = editorRef.current.validateAltText();
      if (!validation.isValid) {
        setAltWarning(`Add alt text for accessibility on all ${validation.missingCount} image(s) before saving.`);
        return;
      }
    }

    setSaving(true);
    try {
      await fetch(`${SERVER_URL}/courses/${courseId}/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body: editorData.html || page?.body || "",
          bodyJson: editorData.json ? JSON.stringify(editorData.json) : page?.body_json || null,
          bodyHtml: editorData.html || page?.body_html || "",
          published,
        }),
      });
      setEditing(false);
      load();
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

  if (loading) return <div className="p-6"><p className="text-sm text-slate-500">Loading...</p></div>;
  if (!page) return <div className="p-6"><p className="text-sm text-rose-600">Page not found.</p></div>;

  return (
    <div>
      <Breadcrumbs sectionKey="pages" itemName={page.title} />
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        {editing ? (
          <div className="space-y-4 bg-white p-5 border border-slate-200 rounded-2xl shadow-sm">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Page Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Page Title"
                className="w-full text-lg font-bold border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
              />
            </div>

            {/* Alt Text Validation Banner */}
            {altWarning && (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{altWarning}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Content</label>
              <RichTextEditor
                ref={editorRef}
                content={getEditorContent()}
                onUpdate={setEditorData}
                minHeight="400px"
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={published}
                  onChange={(e) => setPublished(e.target.checked)}
                  className="rounded border-slate-300 text-[#203A3A] focus:ring-[#203A3A]"
                />
                Published (visible to students)
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setEditing(false); setAltWarning(null); }}
                  className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={saving}
                  className="text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] disabled:opacity-50 rounded-lg px-5 py-2.5 transition-colors shadow-sm"
                >
                  {saving ? "Saving..." : "Save Changes"}
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
          contentRefId={pageId}
        />
      </div>
    </div>
  );
}
