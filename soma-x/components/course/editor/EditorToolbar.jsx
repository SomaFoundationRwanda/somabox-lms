"use client";

import { useState, useCallback } from "react";
import {
  Bold, Italic, Underline, Heading1, Heading2, Heading3,
  List, ListOrdered, Link as LinkIcon, Unlink, Quote, Minus, Code,
} from "lucide-react";

function ToolbarButton({ onClick, isActive, children, title }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      title={title}
      className={`p-1.5 rounded-md transition-colors ${
        isActive
          ? "bg-[#203A3A] text-white"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-px h-5 bg-slate-200 mx-0.5" />;
}

export default function EditorToolbar({ editor }) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const setLink = useCallback(() => {
    if (!linkUrl) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setShowLinkInput(false);
      return;
    }
    const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkUrl("");
    setShowLinkInput(false);
  }, [editor, linkUrl]);

  if (!editor) return null;

  return (
    <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 bg-slate-50">
      {/* Headings */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive("heading", { level: 1 })}
        title="Heading 1"
      >
        <Heading1 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        title="Heading 2"
      >
        <Heading2 className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        title="Heading 3"
      >
        <Heading3 className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Inline marks */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="Bold"
      >
        <Bold className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="Italic"
      >
        <Italic className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        title="Underline"
      >
        <Underline className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Lists */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="Bullet List"
      >
        <List className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="Numbered List"
      >
        <ListOrdered className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Block elements */}
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        title="Block Quote"
      >
        <Quote className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive("codeBlock")}
        title="Code Block"
      >
        <Code className="w-4 h-4" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        isActive={false}
        title="Horizontal Rule"
      >
        <Minus className="w-4 h-4" />
      </ToolbarButton>

      <ToolbarDivider />

      {/* Link */}
      <ToolbarButton
        onClick={() => {
          if (editor.isActive("link")) {
            editor.chain().focus().unsetLink().run();
          } else {
            setShowLinkInput(true);
            setLinkUrl(editor.getAttributes("link").href || "");
          }
        }}
        isActive={editor.isActive("link")}
        title={editor.isActive("link") ? "Remove Link" : "Add Link"}
      >
        {editor.isActive("link") ? <Unlink className="w-4 h-4" /> : <LinkIcon className="w-4 h-4" />}
      </ToolbarButton>

      {/* Link input popover */}
      {showLinkInput && (
        <div className="flex items-center gap-1.5 ml-1 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); setLink(); } if (e.key === "Escape") setShowLinkInput(false); }}
            placeholder="https://..."
            className="text-xs border-none outline-none w-48 bg-transparent"
            autoFocus
          />
          <button
            type="button"
            onClick={setLink}
            className="text-[10px] font-semibold text-white bg-[#203A3A] rounded px-2 py-0.5"
          >
            Set
          </button>
          <button
            type="button"
            onClick={() => setShowLinkInput(false)}
            className="text-[10px] text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>
      )}

      <ToolbarDivider />

      {/* Insert Image */}
      <label className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer transition-colors" title="Insert Image">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" strokeWidth="2" />
          <circle cx="8.5" cy="8.5" r="1.5" strokeWidth="2" />
          <path d="M21 15l-5-5L5 21" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const domEvent = new CustomEvent("editor-upload-file", { detail: file });
              window.dispatchEvent(domEvent);
              e.target.value = "";
            }
          }}
        />
      </label>

      {/* Attach File */}
      <label className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 cursor-pointer transition-colors" title="Attach File">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <input
          type="file"
          accept="*/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              const domEvent = new CustomEvent("editor-upload-file", { detail: file });
              window.dispatchEvent(domEvent);
              e.target.value = "";
            }
          }}
        />
      </label>
    </div>
  );
}
