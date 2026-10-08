"use client"
import { useEffect, useState, useCallback, useContext } from "react";
import { X, ChevronLeft, ChevronRight, Sparkles, Rocket, BarChart3, BookOpen, Zap, Compass } from "lucide-react";
import DataContext from "@/context/DataContext";

const TOUR_KEY = "somabox_tour_seen_v1";

const STEPS = [
    {
        id: "welcome",
        icon: Rocket,
        tag: "WELCOME",
        title: "Hey there, Scholar!",
        body: "Welcome to SOMABOX — your personal learning space! Let me give you a super quick tour of what's here. It'll only take about 30 seconds!",
        pointer: null,
        cardPos: "center",
    },
    {
        id: "stats",
        icon: BarChart3,
        tag: "STATS",
        title: "Your Learning Stats",
        body: "These cards show your classes, lessons in progress, and how much you've completed. The more you learn, the bigger these numbers grow!",
        pointer: { top: "30%", left: "50%" },
        cardPos: "bottom",
    },
    {
        id: "lessons",
        icon: BookOpen,
        tag: "LESSONS",
        title: "Recent Lessons",
        body: "Here you can see your latest lessons and their status. Click any lesson to jump right in and continue where you left off!",
        pointer: { top: "65%", left: "35%" },
        cardPos: "top",
    },
    {
        id: "quick-access",
        icon: Zap,
        tag: "QUICK ACCESS",
        title: "Quick Access Panel",
        body: "Jump straight to your classes, lessons, library, or completed work — all in one tap! Think of it as your shortcut board.",
        pointer: { top: "65%", left: "75%" },
        cardPos: "top",
    },
    {
        id: "nav",
        icon: Compass,
        tag: "NAVIGATION",
        title: "Your Navigation Sidebar",
        body: "Use this sidebar on the left to move between Dashboard, Lessons, Library, and your Account anytime. You're always one click away!",
        pointer: { top: "50%", left: "8%" },
        cardPos: "right",
    },
    {
        id: "finish",
        icon: Sparkles,
        tag: "ALL DONE",
        title: "You're All Set!",
        body: "Amazing — you know everything! Now go ahead and start learning. Every lesson brings you closer to your goals. You've totally got this!",
        pointer: null,
        cardPos: "center",
    },
];

const ACCENT = "#203A3A";

function Pointer({ top, left }) {
    return (
        <div
            className="fixed z-[10001] pointer-events-none"
            style={{ top, left, transform: "translate(-50%, -50%)" }}
        >
            {/* Outer expanding ring */}
            <div
                className="absolute rounded-full animate-ping"
                style={{
                    width: 64,
                    height: 64,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    backgroundColor: "rgba(32,58,58,0.25)",
                }}
            />
            {/* Middle ring */}
            <div
                className="absolute rounded-full animate-pulse"
                style={{
                    width: 40,
                    height: 40,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    backgroundColor: "rgba(32,58,58,0.35)",
                    border: "2px solid rgba(32,58,58,0.5)",
                }}
            />
            {/* Center dot */}
            <div
                className="relative w-4 h-4 rounded-full"
                style={{ backgroundColor: ACCENT }}
            />
        </div>
    );
}

function TourCard({ step, stepIndex, total, onNext, onPrev, onSkip }) {
    const isFirst = stepIndex === 0;
    const isLast = stepIndex === total - 1;

    const cardClass = {
        center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
        bottom: "bottom-8 left-1/2 -translate-x-1/2",
        top: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 mt-[60px]",
        right: "top-1/2 left-[calc(180px+20px)] -translate-y-1/2 md:left-[calc(180px+32px)]",
    }[step.cardPos] || "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2";

    return (
        <div
            className={`fixed z-[10002] w-[min(360px,calc(100vw-32px))] ${cardClass}`}
            style={{
                animation: "tourCardIn 0.35s cubic-bezier(0.34,1.56,0.64,1) both",
            }}
        >
            {/* Card */}
            <div
                className="relative rounded-[20px] overflow-hidden shadow-2xl"
                style={{
                    background: "linear-gradient(145deg, #0d2020 0%, #112828 50%, #0a1a1a 100%)",
                    border: "1px solid rgba(255,255,255,0.1)",
                }}
            >
                {/* Decorative dot grid */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.06]"
                    style={{
                        backgroundImage: "radial-gradient(circle, rgba(255,255,255,1) 1px, transparent 1px)",
                        backgroundSize: "18px 18px",
                    }}
                />

                {/* Glow blob */}
                <div
                    className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl pointer-events-none"
                    style={{ backgroundColor: "rgba(32,58,58,0.6)" }}
                />

                {/* Content */}
                <div className="relative z-10 p-6">
                    {/* Top row: tag + skip */}
                    <div className="flex items-center justify-between mb-5">
                        <span
                            className="text-[11px] font-black tracking-[0.15em] px-2.5 py-1 rounded-full"
                            style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
                        >
                            {step.tag}
                        </span>
                        <button
                            onClick={onSkip}
                            className="flex items-center gap-1 text-[11px] font-semibold transition-colors"
                            style={{ color: "rgba(255,255,255,0.35)" }}
                            onMouseEnter={e => e.currentTarget.style.color = "rgba(255,255,255,0.7)"}
                            onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.35)"}
                        >
                            <X size={12} /> Skip tour
                        </button>
                    </div>

                    {/* Icon */}
                    {step.icon && (
                        <div className="w-12 h-12 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-300 mb-3 shadow-md">
                            <step.icon className="w-6 h-6" />
                        </div>
                    )}

                    {/* Title */}
                    <h3 className="text-[20px] font-black text-white leading-tight mb-2 tracking-tight">
                        {step.title}
                    </h3>

                    {/* Body */}
                    <p className="text-[13px] leading-relaxed mb-6" style={{ color: "rgba(255,255,255,0.6)" }}>
                        {step.body}
                    </p>

                    {/* Progress dots */}
                    <div className="flex items-center gap-1.5 mb-5">
                        {STEPS.map((_, i) => (
                            <div
                                key={i}
                                className="rounded-full transition-all duration-300"
                                style={{
                                    width: i === stepIndex ? 20 : 6,
                                    height: 6,
                                    backgroundColor: i === stepIndex
                                        ? "rgba(255,255,255,0.85)"
                                        : i < stepIndex
                                            ? "rgba(255,255,255,0.35)"
                                            : "rgba(255,255,255,0.12)",
                                }}
                            />
                        ))}
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center gap-2">
                        {!isFirst && (
                            <button
                                onClick={onPrev}
                                className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-[12px] font-bold transition-all"
                                style={{
                                    backgroundColor: "rgba(255,255,255,0.08)",
                                    color: "rgba(255,255,255,0.7)",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                }}
                                onMouseEnter={e => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.14)"}
                                onMouseLeave={e => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)"}
                            >
                                <ChevronLeft size={14} /> Back
                            </button>
                        )}
                        <button
                            onClick={isLast ? onSkip : onNext}
                            className="flex items-center gap-1.5 h-10 px-5 rounded-xl text-[12px] font-black flex-1 justify-center transition-all shadow-lg"
                            style={{ backgroundColor: ACCENT, color: "#fff" }}
                            onMouseEnter={e => e.currentTarget.style.backgroundColor = "#2d5050"}
                            onMouseLeave={e => e.currentTarget.style.backgroundColor = ACCENT}
                        >
                            {isLast ? (
                                <><Sparkles size={13} /> Start Learning!</>
                            ) : (
                                <>Next <ChevronRight size={14} /></>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function OnboardingTour({ onDone }) {
    const [visible, setVisible] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);

    useEffect(() => {
        const seen = localStorage.getItem(TOUR_KEY);
        if (!seen) setVisible(true);
    }, []);

    const finish = useCallback(() => {
        localStorage.setItem(TOUR_KEY, "1");
        setVisible(false);
        onDone?.();
    }, [onDone]);

    const next = useCallback(() => {
        setStepIndex(i => {
            if (i >= STEPS.length - 1) { finish(); return i; }
            return i + 1;
        });
    }, [finish]);

    const prev = useCallback(() => {
        setStepIndex(i => Math.max(0, i - 1));
    }, []);

    if (!visible) return null;

    const step = STEPS[stepIndex];

    return (
        <>
            {/* Keyframes */}
            <style>{`
                @keyframes tourCardIn {
                    from { opacity: 0; transform: translateX(-50%) translateY(calc(-50% + 16px)) scale(0.92); }
                    to   { opacity: 1; transform: translateX(-50%) translateY(-50%) scale(1); }
                }
                @keyframes tourCardInBottom {
                    from { opacity: 0; transform: translateX(-50%) translateY(16px) scale(0.92); }
                    to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
                }
                @keyframes tourCardInRight {
                    from { opacity: 0; transform: translateX(16px) translateY(-50%) scale(0.92); }
                    to   { opacity: 1; transform: translateX(0) translateY(-50%) scale(1); }
                }
            `}</style>

            {/* Overlay */}
            <div
                className="fixed inset-0 z-[10000]"
                style={{ backgroundColor: "rgba(0,0,0,0.72)", backdropFilter: "blur(3px)" }}
            />

            {/* Pointer beacon */}
            {step.pointer && <Pointer top={step.pointer.top} left={step.pointer.left} />}

            {/* Tour card */}
            <TourCard
                step={step}
                stepIndex={stepIndex}
                total={STEPS.length}
                onNext={next}
                onPrev={prev}
                onSkip={finish}
            />
        </>
    );
}

export function TourLaunchButton({ className = "" }) {
    const { isDark } = useContext(DataContext);
    const [seen, setSeen] = useState(true);

    useEffect(() => {
        setSeen(!!localStorage.getItem(TOUR_KEY));
    }, []);

    const restart = () => {
        localStorage.removeItem(TOUR_KEY);
        window.location.reload();
    };

    if (!seen) return null;

    const bg      = isDark ? "rgba(13,148,136,0.12)"  : "rgba(32,58,58,0.08)";
    const bgHover = isDark ? "rgba(13,148,136,0.20)"  : "rgba(32,58,58,0.14)";
    const color   = isDark ? "#0D9488"                 : ACCENT;

    return (
        <button
            onClick={restart}
            className={`flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors ${className}`}
            style={{ backgroundColor: bg, color }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = bgHover}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = bg}
        >
            <Sparkles size={12} /> Take the Tour
        </button>
    );
}
