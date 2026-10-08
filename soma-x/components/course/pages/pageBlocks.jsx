"use client";

// Read-only views of the page editor's custom blocks (file attachment, video, image).
// TipTap-free so learners can view pages without loading the editor; the editor's node
// views (components/course/editor/nodes) reuse these with Wrapper = NodeViewWrapper.
import { useState } from "react";
import {
  FileText, FileArchive, FileSpreadsheet, FileCode2, Image as ImageIcon,
  Download, Eye, EyeOff, FileIcon, ZoomIn, ZoomOut, Loader2, AlertCircle,
} from "lucide-react";

// Relative upload paths point at the backend.
export function resolveMediaUrl(url) {
  if (url && !url.startsWith("http") && !url.startsWith("data:")) {
    const backendHost = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
    return `${backendHost}${url.startsWith("/") ? "" : "/"}${url}`;
  }
  return url;
}

function getFileTypeDetails(mimeType = "", filename = "") {
  const mime = mimeType.toLowerCase();
  const ext = filename.split(".").pop()?.toLowerCase() || "";

  if (mime.includes("pdf") || ext === "pdf") {
    return { icon: FileText, label: "PDF Document", isPdf: true, isImage: false, color: "text-red-500 bg-red-50" };
  }
  if (mime.includes("word") || ["doc", "docx"].includes(ext)) {
    return { icon: FileText, label: "Word Document", isPdf: false, isImage: false, color: "text-blue-500 bg-blue-50" };
  }
  if (mime.includes("sheet") || mime.includes("excel") || ["xls", "xlsx", "csv"].includes(ext)) {
    return { icon: FileSpreadsheet, label: "Spreadsheet", isPdf: false, isImage: false, color: "text-emerald-500 bg-emerald-50" };
  }
  if (mime.includes("presentation") || mime.includes("powerpoint") || ["ppt", "pptx"].includes(ext)) {
    return { icon: FileCode2, label: "Presentation", isPdf: false, isImage: false, color: "text-amber-500 bg-amber-50" };
  }
  if (mime.includes("zip") || mime.includes("archive") || ["zip", "rar", "7z", "tar", "gz"].includes(ext)) {
    return { icon: FileArchive, label: "Archive", isPdf: false, isImage: false, color: "text-purple-500 bg-purple-50" };
  }
  if (mime.includes("image") || ["jpg", "jpeg", "png", "gif", "svg", "webp"].includes(ext)) {
    return { icon: ImageIcon, label: "Image File", isPdf: false, isImage: true, color: "text-teal-500 bg-teal-50" };
  }
  return { icon: FileIcon, label: "File Attachment", isPdf: false, isImage: false, color: "text-slate-500 bg-slate-50" };
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return "";
  const num = Number(bytes);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileAttachmentView({ attrs, Wrapper = "div" }) {
  const { url, filename = "Attachment", file_size = 0, mime_type = "", uploading = false, error = null } = attrs;
  const [previewOpen, setPreviewOpen] = useState(false);
  const [zoom, setZoom] = useState(100);

  const fileUrl = resolveMediaUrl(url);

  const fileType = getFileTypeDetails(mime_type, filename);
  const IconComponent = fileType.icon;
  const canPreview = fileType.isPdf || fileType.isImage;

  // 1. Uploading State Card
  if (uploading) {
    return (
      <Wrapper className="my-4 select-none">
        <div className="border border-amber-200 rounded-xl overflow-hidden bg-amber-50/60 p-4 flex items-center justify-between gap-3 animate-pulse">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-700 shrink-0">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-amber-900 truncate">
                Uploading {filename}...
              </p>
              <p className="text-xs text-amber-700 mt-0.5">Please wait while the file is being stored</p>
            </div>
          </div>
        </div>
      </Wrapper>
    );
  }

  // 2. Error State Card
  if (error) {
    return (
      <Wrapper className="my-4 select-none">
        <div className="border border-rose-200 rounded-xl overflow-hidden bg-rose-50 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="p-2 rounded-lg bg-rose-100 text-rose-700 shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-rose-900 truncate">
                Upload failed for {filename}
              </p>
              <p className="text-xs text-rose-700 mt-0.5">{error}</p>
            </div>
          </div>
        </div>
      </Wrapper>
    );
  }

  // 3. Completed State Card
  return (
    <Wrapper className="my-4 select-none">
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm hover:shadow transition-shadow">
        {/* Main Card Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-50/50">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className={`p-2.5 rounded-lg shrink-0 ${fileType.color}`}>
              <IconComponent className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate" title={filename}>
                {filename}
              </p>
              <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                <span>{fileType.label}</span>
                {file_size ? <span>· {formatBytes(file_size)}</span> : null}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Inline Preview Toggle (for PDF & Images) */}
            {canPreview && (
              <button
                type="button"
                onClick={() => setPreviewOpen(!previewOpen)}
                aria-expanded={previewOpen}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  previewOpen
                    ? "bg-[#203A3A] text-white border-[#203A3A]"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {previewOpen ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>Hide Preview</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5" />
                    <span>Preview Inline</span>
                  </>
                )}
              </button>
            )}

            {/* Download Button */}
            {(fileUrl || url) && (
              <a
                href={fileUrl || url}
                download={filename}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </a>
            )}
          </div>
        </div>

        {/* Expanded Inline Preview Block */}
        {previewOpen && canPreview && (
          <div className="border-t border-slate-200 bg-slate-900/5 p-4 animate-in fade-in duration-200">
            {fileType.isPdf ? (
              <div className="space-y-3">
                {/* PDF Toolbar */}
                <div className="flex items-center justify-between bg-slate-800 text-white px-4 py-2 rounded-lg text-xs">
                  <span className="font-medium truncate max-w-[200px]">{filename}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.max(50, z - 25))}
                      className="p-1 hover:bg-slate-700 rounded"
                      title="Zoom Out"
                      aria-label="Zoom out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="font-mono text-[11px]">{zoom}%</span>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.min(200, z + 25))}
                      className="p-1 hover:bg-slate-700 rounded"
                      title="Zoom In"
                      aria-label="Zoom in"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* PDF Viewer Container */}
                <div className="w-full h-[500px] rounded-lg overflow-hidden border border-slate-300 bg-white">
                  <iframe
                    src={`${fileUrl || url}#zoom=${zoom}`}
                    title={filename}
                    className="w-full h-full border-none"
                  />
                </div>
              </div>
            ) : fileType.isImage ? (
              <div className="flex justify-center p-2 bg-slate-100/80 rounded-lg border border-slate-200">
                <img
                  src={fileUrl || url}
                  alt={filename}
                  className="max-h-[450px] w-auto object-contain rounded-md"
                />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Wrapper>
  );
}

export function parseVideoSource(src = "") {
  if (!src) return { type: "unknown", embedUrl: "" };

  // YouTube match
  const ytMatch = src.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  if (ytMatch && ytMatch[1]) {
    return {
      type: "youtube",
      embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`,
    };
  }

  // Vimeo match
  const vimeoMatch = src.match(/(?:vimeo\.com\/)(?:video\/)?([0-9]+)/);
  if (vimeoMatch && vimeoMatch[1]) {
    return {
      type: "vimeo",
      embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`,
    };
  }

  // Direct video file
  return {
    type: "html5",
    embedUrl: src,
  };
}

export function VideoEmbedView({ attrs, Wrapper = "div" }) {
  const { src } = attrs;
  const videoInfo = parseVideoSource(src);

  return (
    <Wrapper className="my-4 select-none">
      <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-950 shadow-md">
        <div className="relative aspect-video w-full">
          {videoInfo.type === "youtube" || videoInfo.type === "vimeo" ? (
            <iframe
              src={videoInfo.embedUrl}
              title="Embedded Video Player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-none"
            />
          ) : (
            <video
              src={videoInfo.embedUrl}
              controls
              className="absolute inset-0 w-full h-full object-contain"
            >
              Your browser does not support HTML5 video player.
            </video>
          )}
        </div>
      </div>
    </Wrapper>
  );
}


export const IMAGE_SIZE_PRESETS = {
  small: "max-w-[25%]",
  medium: "max-w-[50%]",
  large: "max-w-[75%]",
  original: "max-w-full",
};

export const IMAGE_ALIGN_CLASSES = {
  left: "mr-auto ml-0",
  center: "mx-auto",
  right: "ml-auto mr-0",
  "full-width": "w-full",
};

// Read-only image block (same markup as the editor's node view when not editable).
export function ImageView({ attrs }) {
  const { url, alt_text = "", caption = "", alignment = "center", size = "medium" } = attrs;
  const imageUrl = resolveMediaUrl(url);
  return (
    <div className="my-4 my-image-block">
      <div className={`flex flex-col ${IMAGE_ALIGN_CLASSES[alignment] || "mx-auto"} ${IMAGE_SIZE_PRESETS[size] || "max-w-[50%]"}`}>
        <div className="relative group rounded-xl overflow-hidden border transition-all border-slate-200">
          <img
            src={imageUrl || "/placeholder-image.png"}
            alt={alt_text || "Embedded image"}
            className="w-full h-auto object-cover rounded-xl"
          />
        </div>
        {caption ? (
          <p className="mt-1.5 text-center text-xs text-slate-500 italic">
            {caption}
          </p>
        ) : null}
      </div>
    </div>
  );
}
