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
                const res = await fetch(`${SERVER_URL}/sol/interleaving/session`);
                if (res.ok) {
                    const data = await res.json();
                    setSessionData(data);
                }
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
                <Link href="/manage/scholar-dashboard" className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors">
                    <ArrowLeft className="w-4 h-4" /> {t("learner.review.backToDashboard")}
                </Link>
                <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300 rounded-full border border-teal-200 dark:border-teal-800">
                    {t("learner.dashboard.interleaved")}
                </span>
            </div>

            {questions.length === 0 ? (
                <div className="bg-white dark:bg-[#0f1318] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl text-center">
                    <Shuffle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <h2 className="text-lg font-black text-slate-900 dark:text-white mb-2">{t("learner.review.notEnoughTitle")}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-6 max-w-sm mx-auto">
                        {sessionData?.description || t("learner.review.notEnoughBody")}
                    </p>
                    <Link href="/manage/scholar-dashboard">
                        <Button className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white text-xs font-bold px-8 h-10 rounded-xl">
                            {t("learner.review.returnToDashboard")}
                        </Button>
                    </Link>
                </div>
            ) : !isFinished ? (
                <div className="bg-white dark:bg-[#0f1318] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl">
                    <div className="flex items-center gap-3 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                        <div className="p-2.5 bg-[var(--brand-primary)] text-white rounded-2xl">
                            <Shuffle className="w-5 h-5" />
                        </div>
                        <div>
                            <h1 className="text-base font-black text-slate-900 dark:text-white">
                                {sessionData?.title || t("learner.dashboard.interleaved")}
                            </h1>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                {sessionData?.description}
                            </p>
                            <PracticeLabel className="mt-1.5" />
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-xs font-bold mb-3">
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-extrabold">
                            {q?.subject} · {q?.topic}
                        </span>
                        <span className="text-slate-600">{fill(t("learner.diagnostic.questionOf"), { n: currentIdx + 1, total: questions.length })}</span>
                    </div>

                    <div className="bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 mb-4">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                            {q?.question}
                        </p>
                    </div>

                    <div className="mb-4">
                        <label className="text-xs font-semibold text-slate-600 mb-1.5 block">{t("learner.review.recallLabel")}</label>
                        <textarea aria-label={t("learner.review.recallLabel")}
                            value={recallText}
                            onChange={(e) => setRecallText(e.target.value)}
                            rows={3}
                            placeholder={t("learner.review.answerPlaceholder")}
                            className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2.5 outline-none focus:border-[var(--brand-secondary)] bg-white dark:bg-slate-900"
                        />
                    </div>

                    {q?.previousAnswer ? (
                        revealedPrevious ? (
                            <div className="rounded-xl border border-teal-100 bg-teal-50 dark:bg-teal-950/30 dark:border-teal-900 p-3 mb-4">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-400 mb-1">{t("learner.review.lastAnswer")}</p>
                                <p className="text-xs text-slate-700 dark:text-slate-300">{q.previousAnswer}</p>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setRevealedPrevious(true)}
                                className="text-xs font-semibold text-[var(--brand-secondary)] hover:underline mb-4"
                            >
                                {t("learner.review.showLast")}
                            </button>
                        )
                    ) : null}

                    <div className="flex justify-end gap-2 mt-2">
                        <Button
                            onClick={handleNext}
                            className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white text-xs font-bold px-6 h-10 rounded-xl"
                        >
                            {currentIdx + 1 < questions.length ? t("learner.diagnostic.next") : t("learner.review.finish")}
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-[#0f1318] border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl text-center">
                    <Sparkles className="w-16 h-16 text-teal-500 mx-auto mb-3" />
                    <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">{t("learner.review.completeTitle")}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
                        {fill(t(reviewedCount === 1 ? "learner.review.revisitedOne" : "learner.review.revisitedMany"), { n: reviewedCount })}
                    </p>
                    <p className="-mt-4 mb-6"><PracticeLabel /></p>
                    <Link href="/manage/scholar-dashboard">
                        <Button className="bg-[var(--brand-primary)] hover:bg-[var(--brand-primary-dark)] text-white text-xs font-bold px-8 h-10 rounded-xl">
                            {t("learner.review.returnToDashboard")}
                        </Button>
                    </Link>
                </div>
            )}
        </div>
    );
}
