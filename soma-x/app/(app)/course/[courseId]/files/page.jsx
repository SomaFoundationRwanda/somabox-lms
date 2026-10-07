"use client";

import { useState } from "react";
import { File as FileIcon, Trash2, Upload } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import AsyncListState from "@/components/course/AsyncListState";
import { PageHeader, List } from "@/components/layout";

export default function FilesPage() {
  const { SERVER_URL, courseId, isTeacher } = useCourse();
  const { data: files, loading, error, refetch } = useCourseSection("files");
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      await fetch(`${SERVER_URL}/courses/${courseId}/files`, { method: "POST", body: formData });
      refetch();
    } finally {
      setUploading(false);
    }
  };

  const remove = async (id) => {
    await fetch(`${SERVER_URL}/courses/${courseId}/files/${id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="files" />
      <div className="p-4 md:p-6 space-y-6">
        <PageHeader
          title="Files"
          actions={isTeacher ? (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg px-3 py-2 cursor-pointer focus-within:ring-2 focus-within:ring-[#0D9488]">
              <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading..." : "Upload File"}
              <input type="file" className="sr-only" onChange={(e) => handleUpload(e.target.files?.[0])} />
            </label>
          ) : null}
        />

        <AsyncListState loading={loading} error={error} data={files} onRetry={refetch} emptyMessage="No files uploaded yet.">
          {(list) => (
            <List label="Files">
              {list.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <a href={`${SERVER_URL}${f.downloadUrl}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200 hover:text-[#203A3A] min-w-0">
                    <FileIcon className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{f.original_name}</span>
                  </a>
                  {isTeacher ? (
                    <button onClick={() => remove(f.id)} aria-label={`Delete ${f.original_name}`} className="p-1.5 rounded-md hover:bg-slate-100 text-rose-500 shrink-0">
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
