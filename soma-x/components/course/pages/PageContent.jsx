"use client";

// Read-only page renderer. Pages are stored as TipTap JSON (body_json) plus HTML
// (body_html); learners only ever read them, so this renders them without loading the
// editor (TipTap/ProseMirror), keeping the page route light on low-end devices.
//
// Safety: nothing is injected as HTML. body_json is walked node by node into React
// elements; body_html/body (older pages without JSON) are parsed with DOMParser (which
// runs no scripts and loads nothing) and mapped through the same allowlist TipTap's schema
// used: unknown tags are unwrapped, script/style/iframe etc. dropped, no attributes are
// copied except the ones read explicitly, and link URLs are limited to safe protocols.
import { Fragment, useMemo } from "react";
import { FileAttachmentView, VideoEmbedView, ImageView } from "./pageBlocks";

const SAFE_HREF = /^(https?:|mailto:|tel:|\/|#|\.\.?\/)/i;
function safeHref(href) {
  const value = String(href || "").trim();
  if (!value) return null;
  // Scheme-less values ("example.com/x") are relative, like the editor's links.
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) return value;
  return SAFE_HREF.test(value) ? value : null;
}

// ---------- HTML (legacy) -> TipTap-shaped JSON, via an allowlist ----------
const DROP_TAGS = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE", "NOSCRIPT", "HEAD", "TITLE", "META", "LINK", "SVG", "MATH", "FORM", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "IMG", "VIDEO", "AUDIO", "CANVAS"]);
const MARK_TAGS = { STRONG: "bold", B: "bold", EM: "italic", I: "italic", S: "strike", STRIKE: "strike", DEL: "strike", CODE: "code", U: "underline" };
const BLOCK_TYPES = new Set(["paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "horizontalRule", "customImage", "fileAttachment", "videoEmbed"]);

function convertChildren(el, marks) {
  return Array.from(el.childNodes).flatMap((child) => convertNode(child, marks));
}

function convertNode(node, marks = []) {
  if (node.nodeType === 3) {
    const text = node.nodeValue.replace(/[ \t\r\n\f]+/g, " ");
    return text ? [{ type: "text", text, marks }] : [];
  }
  if (node.nodeType !== 1) return [];
  const el = node;
  const tag = el.tagName.toUpperCase();
  if (el.hasAttribute("data-custom-image") && (tag === "FIGURE" || tag === "IMG")) {
    const img = tag === "IMG" ? el : el.querySelector("img");
    return [{
      type: "customImage",
      attrs: {
        url: img?.getAttribute("src") || "",
        alt_text: img?.getAttribute("alt") || "",
        caption: tag === "FIGURE" ? el.querySelector("figcaption")?.textContent || "" : "",
        alignment: el.getAttribute("data-alignment") || "center",
        size: el.getAttribute("data-size") || "medium",
      },
    }];
  }
  if (tag === "DIV" && el.hasAttribute("data-file-attachment")) {
    return [{
      type: "fileAttachment",
      attrs: {
        url: el.getAttribute("data-url") || "",
        filename: el.getAttribute("data-filename") || "",
        file_size: Number(el.getAttribute("data-file-size")) || 0,
        mime_type: el.getAttribute("data-mime-type") || "",
      },
    }];
  }
  if (tag === "DIV" && el.hasAttribute("data-video-embed")) {
    return [{ type: "videoEmbed", attrs: { src: el.getAttribute("data-src") || "" } }];
  }
  if (DROP_TAGS.has(tag)) return [];
  if (MARK_TAGS[tag]) return convertChildren(el, [...marks, { type: MARK_TAGS[tag] }]);
  if (tag === "A") return convertChildren(el, [...marks, { type: "link", attrs: { href: el.getAttribute("href") } }]);
  if (tag === "BR") return [{ type: "hardBreak" }];
  if (tag === "HR") return [{ type: "horizontalRule" }];
  if (tag === "P" || /^H[4-6]$/.test(tag)) return [{ type: "paragraph", content: convertChildren(el, marks) }];
  if (/^H[1-3]$/.test(tag)) return [{ type: "heading", attrs: { level: Number(tag[1]) }, content: convertChildren(el, marks) }];
  if (tag === "UL") return [{ type: "bulletList", content: blockify(convertChildren(el, marks)) }];
  if (tag === "OL") return [{ type: "orderedList", attrs: { start: Number(el.getAttribute("start")) || 1 }, content: blockify(convertChildren(el, marks)) }];
  if (tag === "LI") return [{ type: "listItem", content: blockify(convertChildren(el, marks)) }];
  if (tag === "BLOCKQUOTE") return [{ type: "blockquote", content: blockify(convertChildren(el, marks)) }];
  if (tag === "PRE") return [{ type: "codeBlock", content: [{ type: "text", text: el.textContent || "" }] }];
  // Any other element (div, span, section, ...): keep its content, drop the element.
  return convertChildren(el, marks);
}

// Wrap runs of inline content in paragraphs, as the editor's schema does in block context.
function blockify(nodes) {
  const out = [];
  let run = [];
  const flush = () => {
    const meaningful = run.some((n) => n.type !== "text" || n.text.trim());
    if (meaningful) out.push({ type: "paragraph", content: run });
    run = [];
  };
  for (const n of nodes) {
    if (BLOCK_TYPES.has(n.type)) {
      flush();
      out.push(n);
    } else {
      run.push(n);
    }
  }
  flush();
  return out;
}

function htmlToDoc(html) {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return null;
  const parsed = new DOMParser().parseFromString(String(html), "text/html");
  return { type: "doc", content: blockify(convertChildren(parsed.body, [])) };
}

// ---------- JSON -> React ----------
function trimInline(content = []) {
  // Collapse leading/trailing whitespace of a block's inline content (HTML-derived text).
  const nodes = content.map((n) => ({ ...n }));
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (first?.type === "text") first.text = first.text.replace(/^ +/, "");
  if (last?.type === "text") last.text = last.text.replace(/ +$/, "");
  return nodes.filter((n) => n.type !== "text" || n.text);
}

function renderMarks(text, marks = [], key) {
  return marks.reduceRight((child, mark, i) => {
    const k = `${key}-${i}`;
    switch (mark.type) {
      case "bold": return <strong key={k}>{child}</strong>;
      case "italic": return <em key={k}>{child}</em>;
      case "strike": return <s key={k}>{child}</s>;
      case "underline": return <u key={k}>{child}</u>;
      case "code": return <code key={k}>{child}</code>;
      case "link": {
        const href = safeHref(mark.attrs?.href);
        return href
          ? <a key={k} href={href} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline cursor-pointer">{child}</a>
          : <span key={k}>{child}</span>;
      }
      default: return child;
    }
  }, text);
}

function renderInline(content, key, fromHtml) {
  const nodes = fromHtml ? trimInline(content) : content || [];
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    if (n.type === "hardBreak") return <br key={k} />;
    if (n.type === "text") return <Fragment key={k}>{renderMarks(n.text, n.marks, k)}</Fragment>;
    return renderNode(n, k, fromHtml);
  });
}

function renderChildren(node, key, fromHtml) {
  return (node.content || []).map((child, i) => renderNode(child, `${key}.${i}`, fromHtml));
}

function renderNode(node, key, fromHtml) {
  if (!node || typeof node !== "object") return null;
  const attrs = node.attrs || {};
  switch (node.type) {
    case "doc":
      return renderChildren(node, key, fromHtml);
    case "paragraph": {
      const inline = renderInline(node.content, key, fromHtml);
      // An empty paragraph keeps its line height, as in the editor.
      return <p key={key}>{inline.length ? inline : <br />}</p>;
    }
    case "heading": {
      const level = [1, 2, 3].includes(Number(attrs.level)) ? Number(attrs.level) : 1;
      const H = `h${level}`;
      return <H key={key}>{renderInline(node.content, key, fromHtml)}</H>;
    }
    case "bulletList":
      return <ul key={key}>{renderChildren(node, key, fromHtml)}</ul>;
    case "orderedList": {
      const start = Number(attrs.start) || 1;
      return <ol key={key} start={start !== 1 ? start : undefined}>{renderChildren(node, key, fromHtml)}</ol>;
    }
    case "listItem":
      return <li key={key}>{renderChildren(node, key, fromHtml)}</li>;
    case "blockquote":
      return <blockquote key={key}>{renderChildren(node, key, fromHtml)}</blockquote>;
    case "codeBlock": {
      const text = (node.content || []).map((n) => n.text || "").join("");
      const lang = typeof attrs.language === "string" && /^[\w-]+$/.test(attrs.language) ? `language-${attrs.language}` : undefined;
      return <pre key={key}><code className={lang}>{text}</code></pre>;
    }
    case "horizontalRule":
      return <hr key={key} />;
    case "hardBreak":
      return <br key={key} />;
    case "text":
      return renderInline([node], key, false);
    case "customImage":
      return <ImageView key={key} attrs={attrs} />;
    case "fileAttachment":
      return <FileAttachmentView key={key} attrs={attrs} />;
    case "videoEmbed":
      return <VideoEmbedView key={key} attrs={attrs} />;
    default:
      // Unknown node types: keep any content, drop the wrapper.
      return node.content ? renderChildren(node, key, fromHtml) : null;
  }
}

export default function PageContent({ bodyJson, bodyHtml, body }) {
  const { doc, fromHtml } = useMemo(() => {
    if (bodyJson) {
      try {
        const parsed = typeof bodyJson === "string" ? JSON.parse(bodyJson) : bodyJson;
        if (parsed && typeof parsed === "object") return { doc: parsed, fromHtml: false };
      } catch (err) {
        console.error("Failed to parse bodyJson:", err);
      }
    }
    if (bodyHtml) return { doc: htmlToDoc(bodyHtml), fromHtml: true };
    if (body) return { doc: htmlToDoc(`<p>${body}</p>`), fromHtml: true };
    return { doc: null, fromHtml: false };
  }, [bodyJson, bodyHtml, body]);

  return (
    <div className="page-content-wrapper">
      <div className="ProseMirror prose prose-sm max-w-none focus:outline-none px-0 py-2">
        {doc ? renderNode(doc, "n", fromHtml) : <p><br /></p>}
      </div>
      <style jsx global>{`
        .page-content-wrapper .ProseMirror {
          position: relative;
          word-wrap: break-word;
          white-space: pre-wrap;
          white-space: break-spaces;
          font-variant-ligatures: none;
          font-feature-settings: "liga" 0;
          outline: none;
        }
        .page-content-wrapper .ProseMirror pre {
          white-space: pre-wrap;
        }
        .page-content-wrapper .ProseMirror li {
          position: relative;
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
