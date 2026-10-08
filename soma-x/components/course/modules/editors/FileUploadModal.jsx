"use client";

import { useState, useRef } from "react";
import { X, Upload, FileIcon, CheckCircle } from "lucide-react";
import { clickableProps } from "@/lib/a11y";

export default function FileUploadModal({ open, onClose, onUpload, courseId, moduleId, SERVER_URL }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      if (!title) setTitle(dropped.name);
    }
  };

  const handleSelect = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      if (!title) setTitle(selected.name);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title || file.name);

      const res = await fetch(`${SERVER_URL}/courses/${courseId}/modules/${moduleId}/items/file`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (res.ok) {
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-auto py-8">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl mx-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-900">Upload File</h2>
          <button aria-label="Close" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            {...clickableProps(() => inputRef.current?.click(), "Choose a file, or drop one here")}
            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-[#203A3A] hover:bg-slate-50/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
          >
            {file ? (
              <div className="flex flex-col items-center gap-2">
                {done ? (
                  <CheckCircle className="w-8 h-8 text-emerald-500" />
                ) : (
                  <FileIcon className="w-8 h-8 text-[#203A3A]" />
                )}
                <p className="text-sm font-medium text-slate-700 truncate max-w-full">{file.name}</p>
                <p className="text-xs text-slate-400">{formatSize(file.size)} · {file.type || "unknown type"}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-slate-300" />
                <p className="text-sm text-slate-500">Drop a file here, or click to browse</p>
                <p className="text-xs text-slate-400">PDF, DOCX, images, videos, etc.</p>
              </div>
            )}
            <input ref={inputRef} type="file" onChange={handleSelect} className="hidden" />
          </div>

          {/* Title */}
          {file && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Display Title</label>
              <input aria-label="Display Title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#203A3A]"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="text-xs font-semibold text-slate-600 hover:text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading || done}
            className="text-xs font-semibold text-white bg-[#203A3A] hover:bg-[#162727] disabled:opacity-50 rounded-lg px-4 py-2 transition-colors"
          >
            {uploading ? "Uploading..." : done ? "Done!" : "Upload & Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
