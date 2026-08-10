"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { CustomImageNode } from "@/components/course/editor/nodes/CustomImageNode";
import { FileAttachmentNode } from "@/components/course/editor/nodes/FileAttachmentNode";
import { VideoEmbedNode } from "@/components/course/editor/nodes/VideoEmbedNode";
import { useEffect } from "react";

export default function PageContent({ bodyJson, bodyHtml, body }) {
  const parsedContent = (() => {
    if (bodyJson) {
      try {
        return typeof bodyJson === "string" ? JSON.parse(bodyJson) : bodyJson;
      } catch (err) {
        console.error("Failed to parse bodyJson:", err);
      }
    }
    if (bodyHtml) return bodyHtml;
    if (body) return `<p>${body}</p>`;
    return "";
  })();

  const editor = useEditor({
    editable: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: true,
        HTMLAttributes: { class: "text-teal-700 underline cursor-pointer", target: "_blank", rel: "noreferrer" },
      }),
      CustomImageNode,
      FileAttachmentNode,
      VideoEmbedNode,
    ],
    content: parsedContent || "",
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none px-0 py-2",
      },
    },
  });

  useEffect(() => {
    if (editor && parsedContent && !editor.isDestroyed) {
      editor.commands.setContent(parsedContent);
    }
  }, [parsedContent, editor]);

  if (!editor) return null;

  return (
    <div className="page-content-wrapper">
      <EditorContent editor={editor} />
      <style jsx global>{`
        .page-content-wrapper .ProseMirror {
          outline: none;
        }
        .page-content-wrapper .ProseMirror h1 {
          font-size: 1.6rem;
          font-weight: 700;
          color: #0f172a;
          margin: 1.25rem 0 0.6rem;
          line-height: 1.3;
        }
        .page-content-wrapper .ProseMirror h2 {
          font-size: 1.3rem;
          font-weight: 600;
          color: #1e293b;
          margin: 1rem 0 0.5rem;
          line-height: 1.35;
        }
        .page-content-wrapper .ProseMirror h3 {
          font-size: 1.15rem;
          font-weight: 600;
          color: #334155;
          margin: 0.8rem 0 0.4rem;
          line-height: 1.4;
        }
        .page-content-wrapper .ProseMirror p {
          margin: 0.5rem 0;
          color: #334155;
          font-size: 0.95rem;
          line-height: 1.7;
        }
        .page-content-wrapper .ProseMirror ul,
        .page-content-wrapper .ProseMirror ol {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .page-content-wrapper .ProseMirror li {
          margin: 0.2rem 0;
          font-size: 0.95rem;
          color: #334155;
        }
        .page-content-wrapper .ProseMirror a {
          color: #0f766e;
          text-decoration: underline;
        }
        .page-content-wrapper .ProseMirror blockquote {
          border-left: 4px solid #cbd5e1;
          padding-left: 1rem;
          margin: 0.75rem 0;
          color: #64748b;
          font-style: italic;
        }
        .page-content-wrapper .ProseMirror hr {
          border: none;
          border-top: 1px solid #e2e8f0;
          margin: 1.5rem 0;
        }
        .page-content-wrapper .ProseMirror code {
          background: #f1f5f9;
          border-radius: 4px;
          padding: 0.15rem 0.35rem;
          font-size: 0.85em;
          font-family: ui-monospace, monospace;
          color: #be185d;
        }
        .page-content-wrapper .ProseMirror pre {
          background: #0f172a;
          color: #f8fafc;
          border-radius: 8px;
          padding: 0.85rem 1.1rem;
          margin: 0.75rem 0;
          overflow-x: auto;
        }
        .page-content-wrapper .ProseMirror pre code {
          background: none;
          color: inherit;
          padding: 0;
        }
      `}</style>
    </div>
  );
}
