'use client'
import { BookOpen, ChevronDown } from "lucide-react";
import HeaderSection from '@/components/ui/HeaderSection';
import FolderCard from '@/components/explore/FolderCard';
import { useContext, useState, useMemo, useEffect } from "react";
import { useRouter } from 'next/navigation';
import DataContext from "@/context/DataContext";
import { useLanguage } from '@/context/LanguageContext';
import { Heading, Text } from "@/components/typography";
import { Button } from "@/components/ui/button";
import { useGuestGate } from "@/components/guest/GuestGate";
import Loader from "@/components/ui/Loader";

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
        <div className="min-h-screen bg-surface-sunken md:bg-transparent">
            <HeaderSection
                title={t("homeTitle")}
                subtitle={t("homeSubtitle")}
                buttonText={t("howToUse")}
            />

            <div className="flex flex-col md:flex-row gap-4 px-4 md:px-0">
                {/* Mobile Category Switcher */}
                <div className="md:hidden overflow-x-auto whitespace-nowrap scrollbar-hide -mx-4 px-4 sticky top-0 z-30 bg-surface-sunken/80 backdrop-blur-md py-4 border-b border-line shadow-sm">
                    <div className="flex gap-2">
                        {sidebarItems.map((item, index) => (
                            <Button
                                key={index}
                                variant={activeTab === item.slug ? "default" : "ghost"}
                                aria-pressed={activeTab === item.slug}
                                onClick={() => setActiveTab(item.slug)}
                                className={`rounded-full px-6 h-10 text-ui font-bold transition-all shadow-sm shrink-0 ${activeTab === item.slug
                                    ? "bg-brand-strong text-on-brand-strong shadow-brand-strong/20"
                                    : "bg-surface text-fg-muted hover:bg-surface-hover border border-line"
                                    }`}
                            >
                                {item.title}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Sidebar (Desktop only) */}
                <aside className="hidden md:block w-[25%] rounded-2xl min-h-[calc(100vh-12rem)] bg-surface/60 backdrop-blur-md border border-line shadow-xl overflow-hidden self-start sticky top-6">
                    <div className="p-4 flex flex-col gap-2">
                        <Text variant="caption" tone="subtle" className="px-4 py-2">
                            {t("explore.categoriesLabel")}
                        </Text>
                        {sidebarItems.length === 0 ? (
                            <div className="text-fg-muted text-ui p-4 text-center italic">{t("explore.noCategoriesShort")}</div>
                        ) : (
                            sidebarItems.map((item, index) => (
                                <button
                                    type="button"
                                    key={index}
                                    onClick={() => setActiveTab(item.slug)}
                                    aria-pressed={activeTab === item.slug}
                                    className={`w-full text-left flex items-center justify-between py-3.5 px-5 rounded-xl transition-all duration-300 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong focus-visible:ring-offset-2 ${activeTab === item.slug
                                        ? 'bg-brand-strong text-on-brand-strong shadow-lg shadow-brand-strong/20 -translate-x-1'
                                        : 'hover:bg-brand-soft/40 text-fg-muted hover:text-brand-fg'
                                        }`}
                                >
                                    <Text as="span" variant="body" tone="inherit" weight={activeTab === item.slug ? "bold" : "semibold"}>
                                        {item.title}
                                    </Text>
                                    <ChevronDown aria-hidden="true" className={`w-4 h-4 transition-all duration-300 ${activeTab === item.slug ? '-rotate-90 text-white' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 group-hover:translate-x-1'}`} />
                                </button>
                            ))
                        )}
                    </div>
                </aside>

                <main className="flex-1 p-2 md:p-6 rounded-xl bg-brand-soft/30 backdrop-blur-md shadow-inner min-h-[60vh]">
                    {loading ? (
                        <Loader variant="page" className="min-h-[50vh]" />
                    ) : noCategories ? (
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
                                        className="block group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-strong focus-visible:ring-offset-2"
                                    >
                                        <div className="bg-surface/80 hover:bg-surface backdrop-blur-sm rounded-2xl p-6 transition-all duration-300 ring-1 ring-line hover:ring-brand-strong/30 hover:shadow-xl hover:-translate-y-1">
                                            <div className="flex items-center gap-6">
                                                <div className={`p-4 rounded-xl shadow-inner ${course.colorClass || 'bg-surface-sunken'}`}>
                                                    <img src={`/images/${course.slug}.png`} className="w-12 h-12 object-contain" alt="" />
                                                </div>
                                                <div className="flex-1">
                                                    <Heading level={3} variant="item" className="group-hover:text-brand-fg transition-colors mb-1">
                                                        {t(`platforms.${course.slug}.title`) || course.title}
                                                    </Heading>
                                                    <Text tone="muted" className="line-clamp-2">
                                                        {t(`platforms.${course.slug}.description`) || course.description}
                                                    </Text>
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
        <div className="flex flex-col items-center justify-center h-full py-12 text-fg-subtle gap-4">
            <div className="w-16 h-16 bg-line rounded-full flex items-center justify-center opacity-50">
                <BookOpen className="text-fg-muted w-6 h-6" aria-hidden="true" />
            </div>
            <Text variant="body" tone="muted" className="text-center max-w-xs md:max-w-md">
                {text}
            </Text>
        </div>
    );
}
