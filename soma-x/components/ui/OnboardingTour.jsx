"use client"
import { useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Sparkles, Rocket, BarChart3, BookOpen, Zap, Compass } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

const TOUR_KEY = "somabox_tour_seen_v1";

const STEPS = [
    {
        id: "welcome",
        icon: Rocket,
        pointer: null,
        cardPos: "center",
    },
    {
        id: "stats",
        icon: BarChart3,
        pointer: { top: "30%", left: "50%" },
        cardPos: "bottom",
    },
    {
        id: "lessons",
        icon: BookOpen,
        pointer: { top: "65%", left: "35%" },
        cardPos: "top",
    },
    {
        id: "quick-access",
        icon: Zap,
        pointer: { top: "65%", left: "75%" },
        cardPos: "top",
    },
    {
        id: "nav",
        icon: Compass,
        pointer: { top: "50%", left: "8%" },
        cardPos: "right",
    },
    {
        id: "finish",
        icon: Sparkles,
        pointer: null,
        cardPos: "center",
    },
];

function Pointer({ top, left }) {
    return (
        <div
            className="fixed z-[10001] pointer-events-none"
            style={{ top, left, transform: "translate(-50%, -50%)" }}
        >
            {/* Outer expanding ring */}
            <div
                className="absolute rounded-full animate-ping bg-brand-strong/25"
                style={{
                    width: 64,
                    height: 64,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                }}
            />
            {/* Middle ring */}
            <div
                className="absolute rounded-full animate-pulse bg-brand-strong/35 border-2 border-brand-strong/50"
                style={{
                    width: 40,
                    height: 40,
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                }}
            />
            {/* Center dot */}
            <div className="relative w-4 h-4 rounded-full bg-brand-strong" />
        </div>
    );
}

function TourCard({ step, stepIndex, total, onNext, onPrev, onSkip }) {
    const { t } = useLanguage();
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
                className="dark relative rounded-[20px] overflow-hidden shadow-2xl border border-line"
                style={{
                    background: "linear-gradient(145deg, color-mix(in srgb, var(--brand-deep) 22%, black) 0%, color-mix(in srgb, var(--brand-deep) 30%, black) 50%, color-mix(in srgb, var(--brand-deep) 15%, black) 100%)",
                }}
            >
                {/* Decorative dot grid */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.06] text-fg"
                    style={{
                        backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1px)",
                        backgroundSize: "18px 18px",
                    }}
                />

                {/* Glow blob */}
                <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full blur-3xl pointer-events-none bg-brand-strong/60" />

                {/* Content */}
                <div className="relative z-10 p-6">
                    {/* Top row: tag + skip */}
                    <div className="flex items-center justify-between mb-5">
                        <span
                            className="text-caption font-extrabold px-2.5 py-1 rounded-full bg-surface-hover text-fg-subtle"
                        >
                            {t(`learner.tour.${step.id}.tag`)}
                        </span>
                        <button
                            onClick={onSkip}
                            className="flex items-center gap-1 text-caption font-semibold text-fg-subtle hover:text-fg-muted transition-colors"
                        >
                            <X size={12} /> {t("learner.tour.skip")}
                        </button>
                    </div>

                    {/* Icon */}
                    {step.icon && (
                        <div className="w-12 h-12 rounded-2xl bg-brand/20 border border-brand/30 flex items-center justify-center text-brand-fg mb-3 shadow-md">
                            <step.icon className="w-6 h-6" />
                        </div>
                    )}

                    {/* Title */}
                    <h3 className="text-section font-extrabold text-fg leading-tight mb-2 tracking-tight">
                        {t(`learner.tour.${step.id}.title`)}
                    </h3>

                    {/* Body */}
                    <p className="text-small leading-relaxed mb-6 text-fg-muted">
                        {t(`learner.tour.${step.id}.body`)}
                    </p>

                    {/* Progress dots */}
                    <div className="flex items-center gap-1.5 mb-5">
                        {STEPS.map((_, i) => (
                            <div
                                key={i}
                                className={`rounded-full transition-all duration-300 ${i === stepIndex ? "bg-fg/85" : i < stepIndex ? "bg-fg/35" : "bg-fg/10"}`}
                                style={{
                                    width: i === stepIndex ? 20 : 6,
                                    height: 6,
                                }}
                            />
                        ))}
                    </div>

                    {/* Buttons */}
                    <div className="flex items-center gap-2">
                        {!isFirst && (
                            <button
                                onClick={onPrev}
                                className="flex items-center gap-1.5 h-10 px-4 rounded-xl text-caption font-bold bg-surface-hover hover:bg-fg/15 text-fg-muted border border-line transition-all"
                            >
                                <ChevronLeft size={14} /> {t("learner.tour.back")}
                            </button>
                        )}
                        <button
                            onClick={isLast ? onSkip : onNext}
                            className="flex items-center gap-1.5 h-10 px-5 rounded-xl text-caption font-extrabold flex-1 justify-center bg-brand-strong text-on-brand-strong hover:brightness-110 transition-all shadow-lg"
                        >
                            {isLast ? (
                                <><Sparkles size={13} /> {t("learner.tour.start")}</>
                            ) : (
                                <>{t("learner.tour.next")} <ChevronRight size={14} /></>
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
                className="fixed inset-0 z-[10000] bg-scrim"
                style={{ backdropFilter: "blur(3px)" }}
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
    const { t } = useLanguage();
    const [seen, setSeen] = useState(true);

    useEffect(() => {
        setSeen(!!localStorage.getItem(TOUR_KEY));
    }, []);

    const restart = () => {
        localStorage.removeItem(TOUR_KEY);
        window.location.reload();
    };

    if (!seen) return null;

    return (
        <button
            onClick={restart}
            className={`flex items-center gap-1.5 text-caption font-semibold px-3 py-1.5 rounded-full bg-brand-soft hover:bg-brand/20 text-brand-fg transition-colors ${className}`}
        >
            <Sparkles size={12} /> {t("learner.tour.take")}
        </button>
    );
}
