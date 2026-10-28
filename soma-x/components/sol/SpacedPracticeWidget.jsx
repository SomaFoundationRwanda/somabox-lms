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
        <div className="dark bg-gradient-to-r from-brand-strong via-surface to-brand-strong text-fg rounded-2xl p-4 sm:p-5 shadow-lg border border-brand/40 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-3 opacity-10 pointer-events-none">
                <Sparkles className="w-24 h-24 text-brand-fg" />
            </div>

            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-brand/20 text-brand-fg rounded-lg">
                        <Clock className="w-4 h-4" />
                    </span>
                    <div>
                        <h3 className="text-ui font-bold tracking-tight">{t("learner.practice.revisitTitle")}</h3>
                        <p className="text-caption text-brand-fg/70">{t("learner.practice.revisitSubtitle")}</p>
                        <PracticeLabel className="mt-1 text-brand-fg border-brand bg-brand-strong/40" />
                    </div>
                </div>
                <span className="text-caption font-extrabold px-2 py-0.5 rounded-full bg-brand/20 text-brand-fg border border-brand/30">
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
                                <span className="text-caption font-extrabold px-2 py-0.2 rounded bg-brand/20 text-brand-fg">
                                    {fill(t("learner.practice.interval"), { n: item.interval_days })}
                                </span>
                                <span className="text-caption text-fg-subtle flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-brand-fg" /> {t("learner.practice.dueNow")}
                                </span>
                            </div>
                            <p className="text-caption font-semibold text-white truncate">{item.topic_title}</p>
                        </div>
                        <Button
                            onClick={() => handleComplete(item.id)}
                            className="h-8 px-3 text-caption font-bold bg-brand hover:bg-brand/90 text-on-brand rounded-lg flex items-center gap-1 shrink-0"
                        >
                            <Check className="w-3.5 h-3.5" /> {t("learner.practice.review")}
                        </Button>
                    </div>
                ))}
            </div>
        </div>
    );
}
