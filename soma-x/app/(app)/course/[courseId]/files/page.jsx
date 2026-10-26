"use client";

import { useState } from "react";
import { File as FileIcon, Trash2, Upload } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { PageHeader, List } from "@/components/layout";
import { useCourseText } from "@/components/course/useCourseText";
import { useToast } from "@/context/ToastContext";
import { apiFetch, apiUrl, getErrorMessage } from "@/lib/api";

export default function FilesPage() {
  const { courseId, isTeacher } = useCourse();
  const { t, tf } = useCourseText();
  const { showToast } = useToast();
  const { data: files, loading, error, refetch } = useCourseSection("files");
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await apiFetch(`/courses/${courseId}/files`, { method: "POST", body: formData });
      refetch();
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id) => {
    try {
      await apiFetch(`/courses/${courseId}/files/${id}`, { method: "DELETE", json: {} });
    } catch (err) {
      showToast(getErrorMessage(err), "error");
    }
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="files" />
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader help="pages.files"
          title={t("nav.files")}
          actions={isTeacher ? (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] rounded-lg px-3 py-2 cursor-pointer focus-within:ring-2 focus-within:ring-[var(--brand-secondary)]">
              <Upload className="w-3.5 h-3.5" /> {uploading ? t("editors.file.uploading") : t("editors.file.title")}
              <input type="file" className="sr-only" onChange={(e) => handleUpload(e.target.files?.[0])} />
            </label>
          ) : null}
        />

        <AsyncListState loading={loading} error={error} data={files} onRetry={refetch} emptyMessage={t("files.empty")}>
          {(list) => (
            <List label={t("nav.files")}>
              {list.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <a href={apiUrl(f.downloadUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 hover:text-[var(--brand-primary)] min-w-0">
                    <FileIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{f.original_name}</span>
                  </a>
                  {isTeacher ? (
                    <button onClick={() => remove(f.id)} aria-label={tf("modules.deleteNamed", { title: f.original_name })} className="p-1.5 rounded-md hover:bg-slate-100 text-rose-500 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </List>
          )}
        </AsyncListState>
      </div>
    </div>
  );
}
