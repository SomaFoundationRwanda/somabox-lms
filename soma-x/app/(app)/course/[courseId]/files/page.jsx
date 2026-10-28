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
import { FileButton } from "@/components/form";

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
            <FileButton variant="default" onFiles={([f]) => handleUpload(f)} disabled={uploading}>
              <Upload className="w-3.5 h-3.5" aria-hidden="true" /> {uploading ? t("editors.file.uploading") : t("editors.file.title")}
            </FileButton>
          ) : null}
        />

        <AsyncListState loading={loading} error={error} data={files} onRetry={refetch} emptyMessage={t("files.empty")}>
          {(list) => (
            <List label={t("nav.files")}>
              {list.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <a href={apiUrl(f.downloadUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-ui text-fg-muted hover:text-brand-fg min-w-0">
                    <FileIcon className="w-4 h-4 text-fg-subtle shrink-0" />
                    <span className="truncate">{f.original_name}</span>
                  </a>
                  {isTeacher ? (
                    <button onClick={() => remove(f.id)} aria-label={tf("modules.deleteNamed", { title: f.original_name })} className="p-1.5 rounded-md hover:bg-surface-hover text-danger-fg shrink-0">
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
