"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { FileAttachmentView } from "@/components/course/pages/pageBlocks";

function FileAttachmentComponent({ node }) {
  return <FileAttachmentView attrs={node.attrs} Wrapper={NodeViewWrapper} />;
}

export const FileAttachmentNode = Node.create({
  name: "fileAttachment",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      file_id: { default: null },
      url: { default: "" },
      filename: { default: "Attachment" },
      file_size: { default: 0 },
      mime_type: { default: "" },
      uploading: { default: false },
      error: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-file-attachment]",
        getAttrs: (element) => ({
          file_id: element.getAttribute("data-file-id"),
          url: element.getAttribute("data-url") || "",
          filename: element.getAttribute("data-filename") || "",
          file_size: Number(element.getAttribute("data-file-size")) || 0,
          mime_type: element.getAttribute("data-mime-type") || "",
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-file-attachment": "true",
        "data-file-id": HTMLAttributes.file_id,
        "data-url": HTMLAttributes.url,
        "data-filename": HTMLAttributes.filename,
        "data-file-size": HTMLAttributes.file_size,
        "data-mime-type": HTMLAttributes.mime_type,
        class: "file-attachment-block",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileAttachmentComponent);
  },
});
