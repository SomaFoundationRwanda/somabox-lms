"use client"
import { useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Shuffle, Sparkles } from "lucide-react";
import DataContext from "@/context/DataContext";
import { Button } from "@/components/ui/button";
import PracticeLabel from "@/components/sol/PracticeLabel";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";
import Loader from "@/components/ui/Loader";
import { apiFetch } from "@/lib/api";
import { Label, Textarea } from "@/components/form";

export default function InterleavedReviewPage() {
    const { SERVER_URL, user } = useContext(DataContext);
    const { t } = useLanguage();
    const [sessionData, setSessionData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [currentIdx, setCurrentIdx] = useState(0);
    const [recallText, setRecallText] = useState("");
    const [revealedPrevious, setRevealedPrevious] = useState(false);
    const [reviewedCount, setReviewedCount] = useState(0);
    const [isFinished, setIsFinished] = useState(false);

    const scholarEmail = user?.email || "";

    useEffect(() => {
        if (!SERVER_URL || !scholarEmail) return;
        const load = async () => {
            try {
                // A practice session is dealt once per visit and never reloaded behind the learner.
                setSessionData(await apiFetch("/sol/interleaving/session"));
            } catch {
                /* leave sessionData null, handled below */
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [SERVER_URL, scholarEmail]);

    if (loading) {
        return <Loader variant="page" label={t("learner.review.loading")} />;
    }

    const questions = sessionData?.questions || [];
    const q = questions[currentIdx];

    const handleNext = () => {
        setReviewedCount((prev) => prev + 1);
        setRecallText("");
        setRevealedPrevious(false);
        if (currentIdx + 1 < questions.length) {
            setCurrentIdx(currentIdx + 1);
        } else {
            setIsFinished(true);
        }
    };

    return (
        <div className="min-h-screen pb-12 p-4 md:p-6 max-w-3xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <Link href="/manage/scholar-dashboard" className="flex items-center gap-1.5 text-caption font-bold text-fg-subtle hover:text-fg transition-colors">
                    <ArrowLeft className="w-4 h-4" /> {t("learner.review.backToDashboard")}
                </Link>
                <span className="text-caption font-extrabold px-3 py-1 bg-brand-soft text-brand-fg rounded-full border border-brand/40">
                    {t("learner.dashboard.interleaved")}
                </span>
            </div>

            {questions.length === 0 ? (
                <div className="bg-surface border border-line rounded-3xl p-8 shadow-xl text-center">
                    <Shuffle className="w-12 h-12 text-fg-subtle mx-auto mb-3" />
                    <h2 className="text-section font-extrabold text-fg mb-2">{t("learner.review.notEnoughTitle")}</h2>
                    <p className="text-caption text-fg-subtle mb-6 max-w-sm mx-auto">
                        {sessionData?.description || t("learner.review.notEnoughBody")}
                    </p>
                    <Link href="/manage/scholar-dashboard">
                        <Button className="bg-brand-strong hover:bg-brand-strong/90 text-on-brand-strong text-caption font-bold px-8 h-10 rounded-xl">
                            {t("learner.review.returnToDashboard")}
                        </Button>
                    </Link>
                </div>
            ) : !isFinished ? (
                <div className="bg-surface border border-line rounded-3xl p-6 shadow-xl">
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-line">
                        <div className="p-2.5 bg-brand-strong text-on-brand-strong rounded-2xl">
                            <Shuffle className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-item font-extrabold text-fg">
                                {sessionData?.title || t("learner.dashboard.interleaved")}
                            </h1>
                            <p className="text-caption text-fg-subtle mt-0.5">
                                {sessionData?.description}
                            </p>
                            <PracticeLabel className="mt-1.5" />
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-caption font-bold mb-3">
                        <span className="px-2.5 py-0.5 rounded-full bg-surface-sunken text-fg-muted font-extrabold">
                            {q?.subject} · {q?.topic}
                        </span>
                        <span className="text-fg-muted">{fill(t("learner.diagnostic.questionOf"), { n: currentIdx + 1, total: questions.length })}</span>
                    </div>

                    <div className="bg-surface-sunken p-4 rounded-2xl border border-line mb-4">
                        <p className="text-ui font-bold text-fg">
                            {q?.question}
                        </p>
                    </div>

                    <div className="mb-4">
                        <Label>{t("learner.review.recallLabel")}</Label>
                        <Textarea aria-label={t("learner.review.recallLabel")}
                            value={recallText}
                            onChange={(e) => setRecallText(e.target.value)}
                            rows={3}
                            placeholder={t("learner.review.answerPlaceholder")}
                        />
                    </div>

                    {q?.previousAnswer ? (
                        revealedPrevious ? (
                            <div className="rounded-xl border border-brand/40 bg-brand-soft p-3 mb-4">
                                <p className="text-caption font-bold text-brand-fg mb-1">{t("learner.review.lastAnswer")}</p>
                                <p className="text-caption text-fg-muted">{q.previousAnswer}</p>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setRevealedPrevious(true)}
                                className="text-caption font-semibold text-brand-fg hover:underline mb-4"
                            >
                                {t("learner.review.showLast")}
                            </button>
                        )
                    ) : null}

                    <div className="flex justify-end gap-2 mt-2">
                        <Button
                            onClick={handleNext}
                            className="bg-brand-strong hover:bg-brand-strong/90 text-on-brand-strong text-caption font-bold px-6 h-10 rounded-xl"
                        >
                            {currentIdx + 1 < questions.length ? t("learner.diagnostic.next") : t("learner.review.finish")}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="bg-surface border border-line rounded-3xl p-8 shadow-xl text-center">
                    <Sparkles className="w-16 h-16 text-brand-fg mx-auto mb-3" />
                    <h2 className="text-section font-extrabold text-fg mb-2">{t("learner.review.completeTitle")}</h2>
                    <p className="text-caption text-fg-subtle mb-6">
                        {fill(t(reviewedCount === 1 ? "learner.review.revisitedOne" : "learner.review.revisitedMany"), { n: reviewedCount })}
                    </p>
                    <p className="-mt-4 mb-6"><PracticeLabel /></p>
                    <Link href="/manage/scholar-dashboard">
                        <Button className="bg-brand-strong hover:bg-brand-strong/90 text-on-brand-strong text-caption font-bold px-8 h-10 rounded-xl">
                            {t("learner.review.returnToDashboard")}
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    );
}
