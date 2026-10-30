"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { VideoEmbedView } from "@/components/course/pages/pageBlocks";

function VideoEmbedComponent({ node }) {
  return <VideoEmbedView attrs={node.attrs} Wrapper={NodeViewWrapper} />;
}

export const VideoEmbedNode = Node.create({
  name: "videoEmbed",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      src: { default: "" },
      video_type: { default: "youtube" },
      file_id: { default: null },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-video-embed]",
        getAttrs: (element) => ({
          src: element.getAttribute("data-src") || "",
          video_type: element.getAttribute("data-video-type") || "youtube",
          file_id: element.getAttribute("data-file-id"),
        }),
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        "data-video-embed": "true",
        "data-src": HTMLAttributes.src,
        "data-video-type": HTMLAttributes.video_type,
        "data-file-id": HTMLAttributes.file_id,
        class: "video-embed-block",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoEmbedComponent);
  },
});
