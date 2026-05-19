'use client'
import { ChevronDown } from "lucide-react";
import HeaderSection from '@/components/ui/HeaderSection';
import ContentCard from '@/components/ui/ContentCard';
import { useContext, useState, useMemo, useEffect } from "react";
import { useRouter } from 'next/navigation';
import DataContext from "@/context/DataContext";
import Link from "next/link";
import { useLanguage } from '@/context/LanguageContext';
import Typography from "@/components/ui/Typography";
import { Button } from "@/components/ui/button";
import { BookOutlined } from "@mui/icons-material";

export default function SomaboxHomepage() {
    const router = useRouter();
    const { t } = useLanguage();
    const { mainCategories, customContentSummary } = useContext(DataContext);
    const [activeTab, setActiveTab] = useState(null);

    // --- Optimized State Handling with useMemo ---

    const sidebarItems = useMemo(() => {
        if (!mainCategories || mainCategories.length === 0) {
            return Array.from({ length: 4 }).map((_, i) => ({
                title: t("loading"),
                slug: `loading-${i}`
            }));
        }
        return mainCategories.map(category => ({
            title: t(`categories.${category.slug}`) || category.title,
            slug: category.slug,
        }));
    }, [mainCategories, t]);

    const itemsToDisplay = useMemo(() => {
        if (!activeTab) return [];

        if (activeTab === 'school-content' || activeTab === 'custom-content') {
            const source = customContentSummary?.['custom-content'] || customContentSummary?.['school-content'];
            return source?.items || [];
        }

        if (!mainCategories) return [];
        const category = mainCategories.find((cat) => cat.slug === activeTab);
        return category?.items || [];
    }, [activeTab, mainCategories, customContentSummary]);

    // Set default active tab once categories load
    useEffect(() => {
        if (mainCategories?.length > 0 && !activeTab) {
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
                            Categories
                        </Typography>
                        {sidebarItems.length === 0 ? (
                            <div className="text-gray-400 text-sm p-4 text-center italic">{t("loadingCategories")}</div>
                        ) : (
                            sidebarItems.map((item, index) => (
                                <div
                                    key={index}
                                    onClick={() => setActiveTab(item.slug)}
                                    className={`flex items-center justify-between py-3.5 px-5 rounded-xl transition-all duration-300 cursor-pointer group ${activeTab === item.slug
                                        ? 'bg-accent-dark text-white shadow-lg shadow-accent-dark/20 -translate-x-1'
                                        : 'hover:bg-accent-light-3/40 text-slate-600 hover:text-accent-dark'
                                        }`}
                                >
                                    <Typography color={activeTab === item.slug ? "white" : "default"} weight={activeTab === item.slug ? "bold" : "semibold"} className="text-[15px]">
                                        {item.title}
                                    </Typography>
                                    <ChevronDown className={`w-4 h-4 transition-all duration-300 ${activeTab === item.slug ? '-rotate-90 text-white' : 'opacity-0 group-hover:opacity-100 group-hover:translate-x-1'}`} />
                                </div>
                            ))
                        )}
                    </div>
                </aside>

                <main className="flex-1 p-2 md:p-6 rounded-xl bg-accent-light-3/30 backdrop-blur-md shadow-inner min-h-[60vh]">
                    {activeTab && (
                        itemsToDisplay.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full py-12 text-slate-500 gap-4">
                                <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center opacity-50">
                                    <BookOutlined className="text-slate-400" />
                                </div>
                                <Typography variant="body" color="muted" className="text-center max-w-xs md:max-w-md">
                                    {activeTab === 'custom-content' || activeTab === 'school-content'
                                        ? t("noCustomContent") || "No custom content available yet. Access the manage section to upload files."
                                        : t("noCategoryContent") || "No content available in this category yet."}
                                </Typography>
                            </div>
                        ) : (
                            <div className={activeTab === 'international-education'
                                ? "flex flex-col gap-4"
                                : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
                            }>
                                {itemsToDisplay.map((course, index) => (
                                    activeTab === "international-education" ? (
                                        <a
                                            key={index}
                                            href={`/frame?slug=${course.slug}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="block group"
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
                                    ) : (
                                        <Link href={`/${course.slug}`} key={index} className="block transition-transform duration-200 active:scale-95">
                                            <ContentCard
                                                title={activeTab === 'custom-content' || activeTab === 'school-content'
                                                    ? course.title
                                                    : (t(`educationLevels.${course.slug}`) || course.title)}
                                                image='/imageFallBack.png'
                                                colorClass={course.colorClass || 'bg-slate-400'}
                                            />
                                        </Link>
                                    )
                                ))}
                            </div>
                        )
                    )}
                </main>
            </div>
        </div>
    );
}