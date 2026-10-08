"use client";

import { useContext } from "react";
import { Moon, Sun } from "lucide-react";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";

// Replaces the old binary dark/light toggle. Dragging this slider
// continuously recomputes the page canvas colors (see DataContext's
// applyBrightness/computeCanvasVars) — text contrast is guaranteed
// >=4.5:1 (WCAG AA) at every point, not just the two endpoints.
export default function BrightnessSlider({ className = "", labelColor, trackAccent = "#0D9488" }) {
  const { brightness, setBrightness, isDark } = useContext(DataContext);
  const { t } = useLanguage();
  const value = brightness ?? 100;
  const fg = labelColor || (isDark ? "#7A8595" : "#475569");

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Moon size={13} strokeWidth={2} style={{ color: fg }} className="shrink-0" aria-hidden="true" />
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setBrightness(Number(e.target.value))}
        aria-label={t("shell.nav.brightness")}
        aria-valuetext={fill(t("shell.nav.brightnessValue"), { value })}
        className="flex-1 min-w-0 h-1.5 rounded-full appearance-none cursor-pointer accent-teal-600"
        style={{
          background: `linear-gradient(to right, ${trackAccent} 0%, ${trackAccent} ${value}%, rgba(148,163,184,0.35) ${value}%, rgba(148,163,184,0.35) 100%)`,
        }}
      />
      <Sun size={13} strokeWidth={2} style={{ color: fg }} className="shrink-0" aria-hidden="true" />
    </div>
  );
}
