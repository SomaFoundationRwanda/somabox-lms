"use client";

import EditorFrame from "./EditorFrame";
import { useState } from "react";
import { Upload, FileIcon, CheckCircle } from "lucide-react";
import { useCourseText } from "@/components/course/useCourseText";
import { apiFetch } from "@/lib/api";
import { Label, TextInput } from "@/components/form";
import { FileDrop } from "@/components/form";

export default function FileUploadModal({ asPage = false, open, onClose, onUpload, courseId, moduleId }) {
  const { t } = useCourseText();
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const choose = ([selected]) => {
    setFile(selected);
    if (!title) setTitle(selected.name);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title || file.name);

      const data = await apiFetch(`/courses/${courseId}/modules/${moduleId}/items/file`, { method: "POST", body: formData })
        .catch(() => null);
      if (data) {
        setDone(true);
        setTimeout(() => {
          onUpload(data);
          onClose();
          // Reset
          setFile(null);
          setTitle("");
          setDone(false);
        }, 800);
      }
    } finally {
      setUploading(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!open && !asPage) return null;

  return (
    <EditorFrame asPage={asPage} title={t("editors.file.title")} onClose={onClose} maxWidth="max-w-md">

        <div className="px-6 py-4 space-y-4">
          {/* Drop zone */}
          <FileDrop onFiles={choose} label={t("editors.file.chooseAria")}>
            {file ? (
              <div className="flex flex-col items-center gap-2">
                {done ? (
                  <CheckCircle className="w-8 h-8 text-success-fg" />
                ) : (
                  <FileIcon className="w-8 h-8 text-brand-fg" />
                )}
                <p className="text-ui font-medium text-fg-muted truncate max-w-full">{file.name}</p>
                <p className="text-caption text-fg-subtle">{formatSize(file.size)} · {file.type || t("editors.file.unknownType")}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-fg-subtle" />
                <p className="text-ui text-fg-subtle">{t("editors.file.drop")}</p>
                <p className="text-caption text-fg-subtle">{t("editors.file.types")}</p>
              </div>
            )}
          </FileDrop>

          {/* Title */}
          {file && (
            <div>
              <Label>{t("editors.file.displayTitle")}</Label>
              <TextInput aria-label={t("editors.file.displayTitle")} value={title} onChange={(e) => setTitle(e.target.value)} className="w-full" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-line">
          <button onClick={onClose} className="text-caption font-semibold text-fg-muted hover:text-fg px-4 py-2 rounded-lg hover:bg-surface-hover">
            {t("common.cancel")}
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading || done}
            className="text-caption font-semibold text-on-brand-strong bg-brand-strong hover:bg-brand-strong/90 disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
          >
            {uploading ? t("editors.file.uploading") : done ? t("editors.file.done") : t("editors.file.uploadAdd")}
          </button>
        </div>
    </EditorFrame>
  );
}
