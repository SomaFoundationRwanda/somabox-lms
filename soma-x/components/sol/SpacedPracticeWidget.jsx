"use client"
import { useEffect, useState } from "react";
import { Calendar, Check, Clock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeSpacedReview, getPendingSpacedReviews } from "@/lib/sol-service";
import PracticeLabel from "@/components/sol/PracticeLabel";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";

export default function SpacedPracticeWidget({ serverUrl, scholarEmail }) {
    const { t } = useLanguage();
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchReviews = async () => {
        if (!serverUrl || !scholarEmail) return;
        setLoading(true);
        const data = await getPendingSpacedReviews(serverUrl);
        setReviews(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchReviews();
    }, [serverUrl, scholarEmail]);

    const handleComplete = async (reviewId) => {
        await completeSpacedReview(serverUrl, reviewId);
        setReviews(prev => prev.filter(r => r.id !== reviewId));
    };

    if (loading) return null;
    if (reviews.length === 0) return null;

    return (
        <div className="bg-gradient-to-r from-teal-900 via-slate-900 to-teal-950 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-teal-800/40 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                <Sparkles className="w-24 h-24 text-teal-400" />
            </div>

            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-teal-500/20 text-teal-300 rounded-lg">
                        <Clock className="w-4 h-4" />
                    </span>
                    <div>
                        <h3 className="text-sm font-bold tracking-tight">{t("learner.practice.revisitTitle")}</h3>
                        <p className="text-[10px] text-teal-200/70">{t("learner.practice.revisitSubtitle")}</p>
                        <PracticeLabel className="mt-1 text-teal-100 border-teal-700 bg-teal-950/40 dark:text-teal-100 dark:border-teal-700 dark:bg-teal-950/40" />
                    </div>
                </div>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                    {fill(t("learner.practice.dueToday"), { n: reviews.length })}
                </span>
            </div>

            <div className="space-y-2">
                {reviews.slice(0, 3).map((item) => (
                    <div
                        key={item.id}
                        className="bg-white/10 hover:bg-white/15 backdrop-blur-md rounded-xl p-3 flex items-center justify-between gap-3 border border-white/10 transition-all"
                    >
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[11px] font-black uppercase px-2 py-0.2 rounded bg-teal-400/20 text-teal-300">
                                    {fill(t("learner.practice.interval"), { n: item.interval_days })}
                                </span>
                                <span className="text-[10px] text-slate-500 flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-teal-300" /> {t("learner.practice.dueNow")}
                                </span>
                            </div>
                            <p className="text-xs font-semibold text-white truncate">{item.topic_title}</p>
                        </div>
                        <Button
                            onClick={() => handleComplete(item.id)}
                            className="h-8 px-3 text-[11px] font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 rounded-lg flex items-center gap-1 shrink-0"
                        >
                            <Check className="w-3.5 h-3.5" /> {t("learner.practice.review")}
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}
