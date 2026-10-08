'use client'
import { BookOpen, ChevronDown } from "lucide-react";
import HeaderSection from '@/components/ui/HeaderSection';
import FolderCard from '@/components/explore/FolderCard';
import { useContext, useState, useMemo, useEffect } from "react";
import { useRouter } from 'next/navigation';
import DataContext from "@/context/DataContext";
import { useLanguage } from '@/context/LanguageContext';
import Typography from "@/components/ui/Typography";
import { Button } from "@/components/ui/button";
import { useGuestGate } from "@/components/guest/GuestGate";

export default function SomaboxHomepage() {
    const router = useRouter();
    const { t } = useLanguage();
    const { mainCategories } = useContext(DataContext);
    const [activeTab, setActiveTab] = useState(null);
    // Web lessons (Khan Academy, W3Schools, Wikipedia...) open only with an account.
    const { requireAccount } = useGuestGate();

    const loading = mainCategories == null;
    const noCategories = Array.isArray(mainCategories) && mainCategories.length === 0;

    const sidebarItems = useMemo(() => {
        if (loading) {
            return Array.from({ length: 3 }).map((_, i) => ({
                title: t("loading"),
                slug: `loading-${i}`,
            }));
        }
        return mainCategories.map((category) => ({
            title: t(`explore.categories.${category.slug}`) || t(`categories.${category.slug}`) || category.title,
            slug: category.slug,
        }));
    }, [loading, mainCategories, t]);

    const activeCategory = useMemo(
        () => (mainCategories || []).find((cat) => cat.slug === activeTab) || null,
        [activeTab, mainCategories]
    );
    const isWeb = activeCategory?.kind === "web";
    const itemsToDisplay = activeCategory?.items || [];

    // Default to the first tab, and move off a tab that has disappeared after a refresh.
    useEffect(() => {
        if (!mainCategories?.length) return;
        if (!activeTab || !mainCategories.some((cat) => cat.slug === activeTab)) {
            setActiveTab(mainCategories[0].slug);
        }
    }, [mainCategories, activeTab]);

    return (
        <div className="min-h-screen bg-slate-50 md:bg-transparent">
            <HeaderSection
                title={t("homeTitle")}
                subtitle={t("homeSubtitle")}
                buttonText={t("howToUse")}
            />

            <div className="flex flex-col md:flex-row gap-4 px-4 md:px-0">
                {/* Mobile Category Switcher */}
                <div className="md:hidden overflow-x-auto whitespace-nowrap scrollbar-hide -mx-4 px-4 sticky top-0 z-30 bg-slate-50/80 backdrop-blur-md py-4 border-b border-slate-200 shadow-sm">
                    <div className="flex gap-2">
                        {sidebarItems.map((item, index) => (
                            <Button
                                key={index}
                                variant={activeTab === item.slug ? "default" : "ghost"}
                                aria-pressed={activeTab === item.slug}
                                onClick={() => setActiveTab(item.slug)}
                                className={`rounded-full px-6 h-10 text-sm font-bold transition-all shadow-sm shrink-0 ${activeTab === item.slug
                                    ? "bg-accent-dark text-white shadow-accent-dark/20"
                                    : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
                                    }`}
                            >
                                {item.title}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Sidebar (Desktop only) */}
                <aside className="hidden md:block w-[25%] rounded-2xl min-h-[calc(100vh-12rem)] bg-white/40 backdrop-blur-md border border-white/40 shadow-xl overflow-hidden self-start sticky top-6">
                    <div className="p-4 flex flex-col gap-2">
                        <Typography variant="label" className="px-4 py-2 opacity-50">
                            {t("explore.categoriesLabel")}
                        </Typography>
                        {sidebarItems.length === 0 ? (
                            <div className="text-gray-600 text-sm p-4 text-center italic">{t("explore.noCategoriesShort")}</div>
                        ) : (
                            sidebarItems.map((item, index) => (
                                <button
                                    type="button"
                                    key={index}
                                    onClick={() => setActiveTab(item.slug)}
                                    aria-pressed={activeTab === item.slug}
                                    className={`w-full text-left flex items-center justify-between py-3.5 px-5 rounded-xl transition-all duration-300 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-dark focus-visible:ring-offset-2 ${activeTab === item.slug
                                        ? 'bg-accent-dark text-white shadow-lg shadow-accent-dark/20 -translate-x-1'
                                        : 'hover:bg-accent-light-3/40 text-slate-600 hover:text-accent-dark'
                                        }`}
                                >
                                    <Typography as="span" color={activeTab === item.slug ? "white" : "default"} weight={activeTab === item.slug ? "bold" : "semibold"} className="text-[15px]">
                                        {item.title}
                                    </Typography>
                                    <ChevronDown aria-hidden="true" className={`w-4 h-4 transition-all duration-300 ${activeTab === item.slug ? '-rotate-90 text-white' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-hover:translate-x-1'}`} />
                                </button>
                            ))
                        )}
                    </div>
                </aside>

                <main className="flex-1 p-2 md:p-6 rounded-xl bg-accent-light-3/30 backdrop-blur-md shadow-inner min-h-[60vh]">
                    {noCategories ? (
                        <EmptyState text={t("explore.noCategories")} />
                    ) : activeCategory && (
                        itemsToDisplay.length === 0 ? (
                            <EmptyState text={isWeb ? t("explore.noWebContent") : t("explore.emptyRoot")} />
                        ) : isWeb ? (
                            <div className="flex flex-col gap-4">
                                {itemsToDisplay.map((course) => (
                                    <a
                                        key={course.slug}
                                        href={`/frame?slug=${course.slug}`}
                                        onClick={(e) => {
                                            if (!requireAccount(`/frame?slug=${course.slug}`)) e.preventDefault();
                                        }}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-dark focus-visible:ring-offset-2"
                                    >
                                        <div className="bg-white/80 hover:bg-white backdrop-blur-sm rounded-2xl p-6 transition-all duration-300 ring-1 ring-slate-200 hover:ring-accent-dark/30 hover:shadow-xl hover:-translate-y-1">
                                            <div className="flex items-center gap-6">
                                                <div className={`p-4 rounded-xl shadow-inner ${course.colorClass || 'bg-slate-100'}`}>
                                                    <img src={`/images/${course.slug}.png`} className="w-12 h-12 object-contain" alt="" />
                                                </div>
                                                <div className="flex-1">
                                                    <Typography variant="h4" className="group-hover:text-accent-dark transition-colors mb-1">
                                                        {t(`platforms.${course.slug}.title`) || course.title}
                                                    </Typography>
                                                    <Typography variant="muted" className="line-clamp-2">
                                                        {t(`platforms.${course.slug}.description`) || course.description}
                                                    </Typography>
                                                </div>
                                            </div>
                                        </div>
                                    </a>
                                ))}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {itemsToDisplay.map((folder) => (
                                    <FolderCard key={folder.slug} folder={folder} />
                                ))}
                            </div>
                        )
                    )}
                </main>
            </div>
        </div>
    );
}

function EmptyState({ text }) {
    return (
        <div className="flex flex-col items-center justify-center h-full py-12 text-slate-500 gap-4">
            <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center opacity-50">
                <BookOpen className="text-slate-600 w-6 h-6" aria-hidden="true" />
            </div>
            <Typography variant="body" color="muted" className="text-center max-w-xs md:max-w-md">
                {text}
            </Typography>
        </div>
    );
}
