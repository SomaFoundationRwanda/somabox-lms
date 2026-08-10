"use client";

import { useState } from "react";
import { File as FileIcon, Trash2, Upload, AlertTriangle, X } from "lucide-react";
import { useCourse } from "@/context/CourseContext";
import { useCourseSection } from "@/lib/useCourseSection";
import Breadcrumbs from "@/components/course/Breadcrumbs";
import { EmptyState } from "@/components/ui/empty-state";

export default function FilesPage() {
  const { SERVER_URL, courseId, userEmail, isTeacher } = useCourse();
  const { data: files, loading, error, refetch } = useCourseSection("files");
  const [uploading, setUploading] = useState(false);
  const [deleteWarning, setDeleteWarning] = useState(null); // { file, usedInPages }

  const handleUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("teacherEmail", userEmail);
    formData.append("file", file);
    await fetch(`${SERVER_URL}/courses/${courseId}/files`, { method: "POST", body: formData });
    setUploading(false);
    refetch();
  };

  const remove = async (f, force = false) => {
    const url = `${SERVER_URL}/courses/${courseId}/files/${f.id}?teacherEmail=${encodeURIComponent(userEmail)}${force ? "&force=true" : ""}`;
    const res = await fetch(url, { method: "DELETE" });

    if (res.status === 409) {
      const data = await res.json();
      setDeleteWarning({ file: f, usedInPages: data.usedInPages || [] });
      return;
    }

    setDeleteWarning(null);
    refetch();
  };

  return (
    <div>
      <Breadcrumbs sectionKey="files" />
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-slate-900">Files</h1>
          {isTeacher ? (
            <label className="flex items-center gap-1.5 text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] rounded-lg px-3 py-2 cursor-pointer transition-colors shadow-sm">
              <Upload className="w-3.5 h-3.5" /> {uploading ? "Uploading..." : "Upload File"}
              <input type="file" className="hidden" onChange={(e) => handleUpload(e.target.files?.[0])} />
            </label>
          ) : null}
        </div>

        {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}
        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {!loading && !error && (!files || files.length === 0) ? <EmptyState message="No files uploaded yet." /> : null}

        <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
          {(files || []).map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors">
              <a href={`${SERVER_URL}${f.downloadUrl}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-slate-700 hover:text-[#203A3A] min-w-0">
                <FileIcon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate">{f.original_name}</span>
              </a>
              {isTeacher ? (
                <button onClick={() => remove(f)} className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500 shrink-0">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Referenced File Deletion Warning Modal */}
      {deleteWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl mx-4 p-5 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-amber-600">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="text-base font-bold text-slate-900">File In Use Warning</h3>
              </div>
              <button onClick={() => setDeleteWarning(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p>
                <strong>{deleteWarning.file.original_name}</strong> is currently embedded or attached in the following page(s):
              </p>
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg max-h-36 overflow-y-auto bg-slate-50">
                {deleteWarning.usedInPages.map((p) => (
                  <li key={p.id} className="px-3 py-2 text-slate-800 font-semibold truncate">
                    • {p.title}
                  </li>
                ))}
              </ul>
              <p className="text-rose-600 font-medium pt-1">
                Deleting this file will break image or download embeds on these pages.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setDeleteWarning(null)}
                className="text-xs font-semibold text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={() => remove(deleteWarning.file, true)}
                className="text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg px-4 py-2 transition-colors shadow-sm"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
