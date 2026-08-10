"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react";
import { Video } from "lucide-react";

function parseVideoSource(src = "") {
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

function VideoEmbedComponent({ node }) {
  const { src, video_type } = node.attrs;
  const videoInfo = parseVideoSource(src);

  return (
    <NodeViewWrapper className="my-4 select-none">
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
    </NodeViewWrapper>
  );
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
