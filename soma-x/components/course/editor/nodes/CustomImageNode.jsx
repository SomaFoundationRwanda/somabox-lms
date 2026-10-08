"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { useState } from "react";
import { AlertCircle, AlignLeft, AlignCenter, AlignRight, Maximize2 } from "lucide-react";

const SIZE_PRESETS = {
  small: "max-w-[25%]",
  medium: "max-w-[50%]",
  large: "max-w-[75%]",
  original: "max-w-full",
};

const ALIGN_CLASSES = {
  left: "mr-auto ml-0",
  center: "mx-auto",
  right: "ml-auto mr-0",
  "full-width": "w-full",
};

function CustomImageComponent({ node, updateAttributes, editor }) {
  const isEditable = editor.isEditable;
  const { file_id, url, alt_text = "", caption = "", alignment = "center", size = "medium" } = node.attrs;
  const [altTextDraft, setAltTextDraft] = useState(alt_text);
  const [captionDraft, setCaptionDraft] = useState(caption);
  const [showSettings, setShowSettings] = useState(false);

  let imageUrl = url;
  if (imageUrl && !imageUrl.startsWith("http") && !imageUrl.startsWith("data:")) {
    const backendHost = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
    imageUrl = `${backendHost}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
  }

  const missingAlt = !alt_text || !alt_text.trim();

  const handleAltBlur = () => {
    updateAttributes({ alt_text: altTextDraft });
  };

  const handleCaptionBlur = () => {
    updateAttributes({ caption: captionDraft });
  };

  return (
    <NodeViewWrapper className="my-4 my-image-block">
      <div className={`flex flex-col ${ALIGN_CLASSES[alignment] || "mx-auto"} ${SIZE_PRESETS[size] || "max-w-[50%]"}`}>
        {/* Main Image Wrapper */}
        <div className={`relative group rounded-xl overflow-hidden border transition-all ${
          missingAlt && isEditable ? "border-amber-400 ring-2 ring-amber-300/50" : "border-slate-200"
        }`}>
          {/* Rendered Image */}
          <img
            src={imageUrl || "/placeholder-image.png"}
            alt={alt_text || "Embedded image"}
            className="w-full h-auto object-cover rounded-xl"
          />

          {/* Floating Controls for Teacher/Editor */}
          {isEditable && (
            <div className="absolute top-2 right-2 flex items-center gap-1 bg-slate-900/80 backdrop-blur-md text-white p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
              {/* Preset Sizes */}
              <button
                type="button"
                onClick={() => updateAttributes({ size: "small" })}
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${size === "small" ? "bg-teal-500 text-white" : "hover:bg-slate-700"}`}
                title="Small (25%)"
              >
                S
              </button>
              <button
                type="button"
                onClick={() => updateAttributes({ size: "medium" })}
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${size === "medium" ? "bg-teal-500 text-white" : "hover:bg-slate-700"}`}
                title="Medium (50%)"
              >
                M
              </button>
              <button
                type="button"
                onClick={() => updateAttributes({ size: "large" })}
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${size === "large" ? "bg-teal-500 text-white" : "hover:bg-slate-700"}`}
                title="Large (75%)"
              >
                L
              </button>
              <button
                type="button"
                onClick={() => updateAttributes({ size: "original" })}
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${size === "original" ? "bg-teal-500 text-white" : "hover:bg-slate-700"}`}
                title="Full Width (100%)"
              >
                100%
              </button>

              <div className="w-px h-3 bg-slate-700 mx-0.5" />

              {/* Alignments */}
              <button
                type="button"
                onClick={() => updateAttributes({ alignment: "left" })}
                className={`p-1 rounded ${alignment === "left" ? "bg-teal-500 text-white" : "hover:bg-slate-700"}`}
                title="Align Left"
              >
                <AlignLeft className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => updateAttributes({ alignment: "center" })}
                className={`p-1 rounded ${alignment === "center" ? "bg-teal-500 text-white" : "hover:bg-slate-700"}`}
                title="Align Center"
              >
                <AlignCenter className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => updateAttributes({ alignment: "right" })}
                className={`p-1 rounded ${alignment === "right" ? "bg-teal-500 text-white" : "hover:bg-slate-700"}`}
                title="Align Right"
              >
                <AlignRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Editor Alt Text & Caption Form */}
        {isEditable ? (
          <div className="mt-2 space-y-1.5">
            {/* Required Alt Text Field */}
            <div className="flex items-center gap-1.5">
              <input aria-label="Alt text for accessibility (required)"
                type="text"
                value={altTextDraft}
                onChange={(e) => setAltTextDraft(e.target.value)}
                onBlur={handleAltBlur}
                placeholder="Alt text for accessibility (required)"
                className={`flex-1 text-xs px-2.5 py-1.5 border rounded-lg outline-none transition-colors ${
                  missingAlt
                    ? "border-amber-400 bg-amber-50/50 text-amber-900 placeholder:text-amber-500 focus:border-amber-600"
                    : "border-slate-200 focus:border-[#203A3A] bg-white text-slate-700"
                }`}
              />
            </div>
            {missingAlt && (
              <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-md">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Add alt text for accessibility (required to save page)</span>
              </div>
            )}

            {/* Optional Caption Field */}
            <input aria-label="Add optional image caption"
              type="text"
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              onBlur={handleCaptionBlur}
              placeholder="Add optional image caption..."
              className="w-full text-xs px-2.5 py-1 border border-slate-200 rounded-lg outline-none focus:border-[#203A3A] bg-slate-50/50 text-slate-600 italic"
            />
          </div>
        ) : (
          /* Read-only Caption Rendering */
          caption ? (
            <p className="mt-1.5 text-center text-xs text-slate-500 italic">
              {caption}
            </p>
          ) : null
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const CustomImageNode = Node.create({
  name: "customImage",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      file_id: { default: null },
      url: { default: "" },
      alt_text: { default: "" },
      caption: { default: "" },
      alignment: { default: "center" },
      size: { default: "medium" },
    };
  },

  parseHTML() {
    return [
      {
        tag: "figure[data-custom-image]",
        getAttrs: (element) => ({
          file_id: element.getAttribute("data-file-id"),
          url: element.querySelector("img")?.getAttribute("src") || "",
          alt_text: element.querySelector("img")?.getAttribute("alt") || "",
          caption: element.querySelector("figcaption")?.innerText || "",
          alignment: element.getAttribute("data-alignment") || "center",
          size: element.getAttribute("data-size") || "medium",
        }),
      },
      {
        tag: "img[data-custom-image]",
        getAttrs: (element) => ({
          file_id: element.getAttribute("data-file-id"),
          url: element.getAttribute("src") || "",
          alt_text: element.getAttribute("alt") || "",
          alignment: element.getAttribute("data-alignment") || "center",
          size: element.getAttribute("data-size") || "medium",
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "figure",
      mergeAttributes(HTMLAttributes, {
        "data-custom-image": "true",
        "data-file-id": HTMLAttributes.file_id,
        "data-alignment": HTMLAttributes.alignment,
        "data-size": HTMLAttributes.size,
        class: `custom-image-figure align-${HTMLAttributes.alignment || "center"} size-${HTMLAttributes.size || "medium"}`,
      }),
      ["img", { src: HTMLAttributes.url, alt: HTMLAttributes.alt_text || "" }],
      HTMLAttributes.caption ? ["figcaption", {}, HTMLAttributes.caption] : ["figcaption"],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CustomImageComponent);
  },
});
