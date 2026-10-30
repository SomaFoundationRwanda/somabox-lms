"use client";

// Shows celebrate(...) pop-ins: a burst of confetti, balloons and flowers (CSS only, nothing to
// download), a message, and buttons to what's next. Calm when the device asks for less motion.
// Closes with its button, Escape, or by itself after a while.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { CELEBRATE_EVENT } from "@/lib/celebrate";
import { useLanguage } from "@/context/LanguageContext";

const PIECES = ["🎉", "🎈", "🌸", "⭐", "🎊", "🌼", "✨", "🎈"];
const SHOW_MS = 9000;

function Burst() {
  // Positions and timings fixed per celebration (not re-drawn on every render).
  const pieces = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    char: PIECES[i % PIECES.length],
    left: Math.round(Math.random() * 100),
    delay: Math.round(Math.random() * 600),
    duration: 1800 + Math.round(Math.random() * 1400),
    size: 18 + Math.round(Math.random() * 16),
    drift: Math.round(Math.random() * 80 - 40),
  })), []);
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden motion-reduce:hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute bottom-[-3rem] somabox-rise"
          style={{ left: `${p.left}%`, fontSize: p.size, animationDelay: `${p.delay}ms`, animationDuration: `${p.duration}ms`, "--drift": `${p.drift}px` }}
        >
          {p.char}
        </span>
      ))}
      <style>{`
        @keyframes somabox-rise {
          0% { transform: translate(0, 0) rotate(0deg); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translate(var(--drift), -110vh) rotate(25deg); opacity: 0; }
        }
        .somabox-rise { animation-name: somabox-rise; animation-timing-function: ease-out; animation-fill-mode: forwards; }
      `}</style>
    </div>
  );
}

export default function CelebrationHost() {
  const { t } = useLanguage();
  const [current, setCurrent] = useState(null);

  useEffect(() => {
    const onCelebrate = (e) => setCurrent({ ...e.detail, at: Date.now() });
    window.addEventListener(CELEBRATE_EVENT, onCelebrate);
    return () => window.removeEventListener(CELEBRATE_EVENT, onCelebrate);
  }, []);

  useEffect(() => {
    if (!current) return undefined;
    const timer = setTimeout(() => setCurrent(null), SHOW_MS);
    const onKey = (e) => { if (e.key === "Escape") setCurrent(null); };
    window.addEventListener("keydown", onKey);
    return () => { clearTimeout(timer); window.removeEventListener("keydown", onKey); };
  }, [current]);

  if (!current) return null;
  const actions = Array.isArray(current.actions) ? current.actions.filter((a) => a?.label && a?.href) : [];
  return (
    <>
      <Burst key={current.at} />
      <div role="status" aria-live="polite" className="fixed z-[61] inset-x-3 bottom-20 md:bottom-6 md:left-auto md:right-6 md:w-[24rem] rounded-2xl border border-brand/30 bg-surface shadow-2xl p-4 animate-in slide-in-from-bottom-4 fade-in-0 motion-reduce:animate-none">
        <div className="flex items-start gap-3">
          <span className="text-display leading-none" aria-hidden="true">{current.emoji || "🎉"}</span>
          <div className="min-w-0 flex-1">
            <p className="text-item font-bold text-fg">{current.title}</p>
            {current.message ? <p className="text-ui text-fg-muted mt-0.5">{current.message}</p> : null}
          </div>
          <button type="button" onClick={() => setCurrent(null)} aria-label={t("shell.notifications.dismiss")} className="p-1 rounded-lg text-fg-subtle hover:bg-surface-hover">
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        {actions.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((a, i) => (
              <Link
                key={a.href}
                href={a.href}
                onClick={() => setCurrent(null)}
                className={i === 0
                  ? "inline-flex items-center rounded-lg bg-brand-strong px-3 py-2 text-caption font-semibold text-on-brand-strong hover:bg-brand-strong/90"
                  : "inline-flex items-center rounded-lg border border-line px-3 py-2 text-caption font-semibold text-fg-muted hover:bg-surface-hover"}
              >
                {a.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
