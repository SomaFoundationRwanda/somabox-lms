"use client";

import { useState, useId } from "react";
import { Info } from "lucide-react";

// Small inline "?" style help affordance. Keyboard-focusable (not just
// hover-only) and exposes the tip text via aria-describedby so screen
// readers announce it too.
export default function InfoTooltip({ text, className = "" }) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-describedby={id}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-slate-600 focus:text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488]"
      >
        <Info className="w-3.5 h-3.5" />
        <span className="sr-only">More info</span>
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1.5 w-56 rounded-lg bg-slate-900 text-white text-[11px] leading-snug px-2.5 py-2 shadow-lg transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {text}
      </span>
    </span>
  );
}
