"use client";

import { useLanguage } from "@/context/LanguageContext";

/**
 * The SOMABOX loader: the logo's box (hexagon outline, top face, stacked layers) drawing itself.
 *
 * variant:
 * - "icon" (default): just the animated logo, inline
 * - "page": centred in the space it's given (a page or a section that's waiting for data)
 * - "overlay": centred on the whole screen over a soft backdrop (page changes, full-screen waits)
 * - fullScreen (older prop): a solid brand-coloured screen with the logo, as before
 *
 * The logo uses the text colour (brand green, light teal in dark mode) unless `color` is given.
 */
export default function Loader({
  size,
  color,
  variant = "icon",
  label,
  fullScreen = false,
  background = "#203A3A",
  className = "",
}) {
  // Safe outside the LanguageProvider too (falls back to English).
  const t = useLanguage()?.t;
  const text = label ?? t?.("shell.common.loading") ?? "Loading";
  const px = size ?? (variant === "overlay" ? 88 : variant === "page" ? 64 : 48);

  const icon = (
    <svg
      className="sb-loader"
      width={px}
      height={px}
      viewBox="0 0 100 100"
      fill="none"
      stroke={color ?? (fullScreen ? "#ffffff" : "currentColor")}
      strokeWidth="5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* outer box outline draws itself */}
      <polygon className="sb-hex" pathLength="1" points="50,6 88,28 88,72 50,94 12,72 12,28" />
      {/* the box's layers drop in, bottom to top, like the logo's stacked "S" */}
      <path className="sb-layer" style={{ animationDelay: "0.35s" }} d="M26 61 L50 74 L74 61" />
      <path className="sb-layer" style={{ animationDelay: "0.6s" }} d="M26 50 L50 63 L74 50" />
      <path className="sb-layer" style={{ animationDelay: "0.85s" }} d="M50 24 L72 37 L50 50 L28 37 Z" />
      <style>{`
        .sb-loader { animation: sb-pulse 2.4s ease-in-out infinite; transform-origin: 50% 50%; overflow: visible; }
        .sb-hex { stroke-dasharray: 1; stroke-dashoffset: 1; animation: sb-draw 2.4s ease-in-out infinite; }
        .sb-layer { opacity: 0; animation: sb-drop 2.4s ease-in-out infinite backwards; }
        @keyframes sb-draw {
          0%   { stroke-dashoffset: 1; opacity: 1; }
          40%  { stroke-dashoffset: 0; }
          85%  { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes sb-drop {
          0%   { opacity: 0; transform: translateY(-8px); }
          25%  { opacity: 1; transform: translateY(0); }
          80%  { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(0); }
        }
        @keyframes sb-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @media (prefers-reduced-motion: reduce) {
          .sb-loader, .sb-hex, .sb-layer { animation: none; opacity: 1; stroke-dashoffset: 0; }
        }
      `}</style>
    </svg>
  );

  // Screen readers hear "Loading" once; the drawing itself is decorative.
  const status = <span className="sr-only">{text}</span>;

  if (fullScreen) {
    return (
      <div role="status" aria-live="polite" style={{ position: "fixed", inset: 0, display: "grid", placeItems: "center", background, zIndex: 9999 }}>
        {icon}
        {status}
      </div>
    );
  }

  if (variant === "overlay") {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`fixed inset-0 z-[9999] grid place-items-center bg-white/70 dark:bg-slate-950/60 backdrop-blur-[2px] text-[#203A3A] dark:text-teal-300 ${className}`}
      >
        <div className="flex flex-col items-center gap-3">
          {icon}
          {status}
        </div>
      </div>
    );
  }

  if (variant === "page") {
    // A height passed in className replaces the default (two min-h classes would fight, and
    // Tailwind's CSS order, not the class order, would decide which one wins).
    const height = /(^|\s)min-h-/.test(className) ? "" : "min-h-[40vh]";
    return (
      <div role="status" aria-live="polite" className={`w-full ${height} grid place-items-center text-[#203A3A] dark:text-teal-300 ${className}`}>
        {icon}
        {status}
      </div>
    );
  }

  return (
    <span role="status" className={`inline-flex text-[#203A3A] dark:text-teal-300 ${className}`}>
      {icon}
      {status}
    </span>
  );
}
