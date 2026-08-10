"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { useEffect, useCallback, useImperativeHandle, forwardRef } from "react";
import EditorToolbar from "./EditorToolbar";
import { CustomImageNode } from "./nodes/CustomImageNode";
import { FileAttachmentNode } from "./nodes/FileAttachmentNode";
import { VideoEmbedNode } from "./nodes/VideoEmbedNode";
import { useCourse } from "@/context/CourseContext";

function detectVideoUrl(url = "") {
  const isYt = /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/.test(url);
  const isVimeo = /(?:vimeo\.com\/)(?:video\/)?([0-9]+)/.test(url);
  const isVideoFile = /\.(mp4|webm|ogg)$/i.test(url);
  if (isYt) return "youtube";
  if (isVimeo) return "vimeo";
  if (isVideoFile) return "html5";
  return null;
}

const RichTextEditor = forwardRef(function RichTextEditor(
  { content, onUpdate, placeholder = "Start writing...", minHeight = "200px" },
  ref
) {
  const { SERVER_URL, courseId, userEmail } = useCourse();

  const handleFileUploadAndInsert = useCallback(
    async (file, editorInstance) => {
      if (!file || !SERVER_URL || !courseId || !editorInstance) return;

      const isImg = (file.type || "").startsWith("image/");
      const isVid = (file.type || "").startsWith("video/");

      // For non-images or files, insert placeholder node immediately
      let placeholderInserted = false;
      if (!isImg && !isVid) {
        editorInstance
          .chain()
          .focus()
          .insertContent({
            type: "fileAttachment",
            attrs: {
              filename: file.name,
              file_size: file.size,
              mime_type: file.type || "",
              uploading: true,
              error: null,
            },
          })
          .run();
        placeholderInserted = true;
      }

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("userEmail", userEmail);
        formData.append("teacherEmail", userEmail);

        const res = await fetch(`${SERVER_URL}/courses/${courseId}/files/upload`, {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "File upload failed");

        const mime = (file.type || data.mime_type || "").toLowerCase();
        const fileId = data.file_id || data.id;
        let rawUrl = data.url || data.downloadUrl || "";
        if (rawUrl && !rawUrl.startsWith("http") && !rawUrl.startsWith("data:")) {
          const backendBase = SERVER_URL || "http://localhost:3000";
          rawUrl = `${backendBase}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`;
        }
        const fileUrl = rawUrl;
        const fileName = data.original_name || file.name;
        const fileSize = data.size || file.size || 0;

        if (mime.startsWith("image/")) {
          editorInstance
            .chain()
            .focus()
            .insertContent({
              type: "customImage",
              attrs: {
                file_id: fileId,
                url: fileUrl,
                alt_text: "",
                caption: "",
                alignment: "center",
                size: "medium",
              },
            })
            .run();
        } else if (mime.startsWith("video/")) {
          editorInstance
            .chain()
            .focus()
            .insertContent({
              type: "videoEmbed",
              attrs: {
                src: fileUrl,
                video_type: "html5",
                file_id: fileId,
              },
            })
            .run();
        } else {
          // Find placeholder node or update/insert real fileAttachment node
          let foundPos = null;
          editorInstance.state.doc.descendants((node, pos) => {
            if (node.type.name === "fileAttachment" && node.attrs.uploading && node.attrs.filename === file.name) {
              foundPos = pos;
            }
          });

          if (foundPos !== null) {
            editorInstance
              .chain()
              .focus()
              .setNodeSelection(foundPos)
              .insertContent({
                type: "fileAttachment",
                attrs: {
                  file_id: fileId,
                  url: fileUrl,
                  filename: fileName,
                  file_size: fileSize,
                  mime_type: mime,
                  uploading: false,
                  error: null,
                },
              })
              .run();
          } else {
            editorInstance
              .chain()
              .focus()
              .insertContent({
                type: "fileAttachment",
                attrs: {
                  file_id: fileId,
                  url: fileUrl,
                  filename: fileName,
                  file_size: fileSize,
                  mime_type: mime,
                  uploading: false,
                  error: null,
                },
              })
              .run();
          }
        }
      } catch (err) {
        console.error("Editor file upload error:", err);
        if (placeholderInserted) {
          let foundPos = null;
          editorInstance.state.doc.descendants((node, pos) => {
            if (node.type.name === "fileAttachment" && node.attrs.uploading && node.attrs.filename === file.name) {
              foundPos = pos;
            }
          });

          if (foundPos !== null) {
            editorInstance
              .chain()
              .focus()
              .setNodeSelection(foundPos)
              .insertContent({
                type: "fileAttachment",
                attrs: {
                  filename: file.name,
                  file_size: file.size,
                  mime_type: file.type || "",
                  uploading: false,
                  error: err.message || "Upload failed",
                },
              })
              .run();
          }
        } else {
          alert(`Failed to upload file: ${err.message}`);
        }
      }
    },
    [SERVER_URL, courseId, userEmail]
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-teal-700 underline cursor-pointer" },
      }),
      CustomImageNode,
      FileAttachmentNode,
      VideoEmbedNode,
    ],
    content: content || "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none px-4 py-3",
        style: `min-height: ${minHeight}`,
      },
      handleDrop(view, event, slice, moved) {
        if (!moved && event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0) {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          handleFileUploadAndInsert(file, editor);
          return true;
        }
        return false;
      },
      handlePaste(view, event) {
        // Handle image or file from clipboard paste
        if (event.clipboardData && event.clipboardData.files && event.clipboardData.files.length > 0) {
          event.preventDefault();
          const file = event.clipboardData.files[0];
          handleFileUploadAndInsert(file, editor);
          return true;
        }

        // Handle YouTube/Vimeo video URL paste
        const text = event.clipboardData?.getData("text/plain")?.trim();
        if (text) {
          const videoType = detectVideoUrl(text);
          if (videoType) {
            event.preventDefault();
            editor
              .chain()
              .focus()
              .insertContent({
                type: "videoEmbed",
                attrs: {
                  src: text,
                  video_type: videoType,
                  file_id: null,
                },
              })
              .run();
            return true;
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      if (onUpdate) {
        onUpdate({
          json: ed.getJSON(),
          html: ed.getHTML(),
        });
      }
    },
  });

  // Expose validation methods to parent via ref
  useImperativeHandle(ref, () => ({
    validateAltText() {
      if (!editor) return { isValid: true, missingCount: 0 };
      let missingCount = 0;
      editor.getJSON().content?.forEach(function checkNode(node) {
        if (node.type === "customImage") {
          const alt = node.attrs?.alt_text || "";
          if (!alt.trim()) missingCount += 1;
        }
        if (Array.isArray(node.content)) {
          node.content.forEach(checkNode);
        }
      });
      return { isValid: missingCount === 0, missingCount };
    },
    getEditor() {
      return editor;
    },
  }));

  // Listen for toolbar file upload event
  useEffect(() => {
    const handleCustomUpload = (e) => {
      if (e.detail && editor) {
        handleFileUploadAndInsert(e.detail, editor);
      }
    };
    window.addEventListener("editor-upload-file", handleCustomUpload);
    return () => window.removeEventListener("editor-upload-file", handleCustomUpload);
  }, [editor, handleFileUploadAndInsert]);

  // Update content when prop changes (for edit mode)
  useEffect(() => {
    if (editor && content && typeof content === "object" && !editor.isDestroyed && !editor.isFocused) {
      const currentJson = JSON.stringify(editor.getJSON());
      const newJson = JSON.stringify(content);
      if (currentJson !== newJson) {
        queueMicrotask(() => {
          if (editor && !editor.isDestroyed) {
            editor.commands.setContent(content);
          }
        });
      }
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <EditorToolbar editor={editor} />
      <div className="border-t border-slate-100">
        <EditorContent editor={editor} />
      </div>
      <style jsx global>{`
        .ProseMirror {
          outline: none;
        }
        .ProseMirror h1 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #1e293b;
          margin: 0.75rem 0 0.5rem;
          line-height: 1.3;
        }
        .ProseMirror h2 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #1e293b;
          margin: 0.75rem 0 0.4rem;
          line-height: 1.35;
        }
        .ProseMirror h3 {
          font-size: 1.1rem;
          font-weight: 600;
          color: #334155;
          margin: 0.6rem 0 0.35rem;
          line-height: 1.4;
        }
        .ProseMirror p {
          margin: 0.35rem 0;
          color: #334155;
          font-size: 0.875rem;
          line-height: 1.6;
        }
        .ProseMirror ul,
        .ProseMirror ol {
          padding-left: 1.5rem;
          margin: 0.35rem 0;
        }
        .ProseMirror li {
          margin: 0.15rem 0;
          font-size: 0.875rem;
          color: #334155;
        }
        .ProseMirror a {
          color: #0f766e;
          text-decoration: underline;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #94a3b8;
          pointer-events: none;
          height: 0;
          font-size: 0.875rem;
        }
        .ProseMirror blockquote {
          border-left: 3px solid #e2e8f0;
          padding-left: 1rem;
          margin: 0.5rem 0;
          color: #64748b;
        }
        .ProseMirror hr {
          border: none;
          border-top: 1px solid #e2e8f0;
          margin: 1rem 0;
        }
        .ProseMirror code {
          background: #f1f5f9;
          border-radius: 4px;
          padding: 0.15rem 0.35rem;
          font-size: 0.825rem;
          font-family: ui-monospace, monospace;
          color: #be185d;
        }
        .ProseMirror pre {
          background: #1e293b;
          color: #e2e8f0;
          border-radius: 8px;
          padding: 0.75rem 1rem;
          margin: 0.5rem 0;
          overflow-x: auto;
        }
        .ProseMirror pre code {
          background: none;
          color: inherit;
          padding: 0;
          font-size: 0.8rem;
        }
      `}</style>
    </div>
  );
});

export default RichTextEditor;
