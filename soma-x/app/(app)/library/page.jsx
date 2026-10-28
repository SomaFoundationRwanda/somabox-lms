"use client"

import { useMemo, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import BooksPage from "@/components/ui/library/books";
import LibrarySidebar from "@/components/ui/library/LibrarySidebar";
import { libraryShelves } from "@/components/ui/library/libraryEntry";
import { useLanguage } from "@/context/LanguageContext";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";
import { TextInput } from "@/components/form";

const Library = () => {
    // Shelf: null = All, "" = Other (files at the top of the library), else a top folder title.
    const { t } = useLanguage();
    const [shelf, setShelf] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterPanelOpen, setFilterPanelOpen] = useState(false);
    // The box's books, kept with the rest of the catalogue (same copy as Explore and the admin).
    const library = useQuery({ queryKey: queryKeys.libraryBooks, queryFn: () => apiFetch("/library/books") });
    const books = useMemo(() => (Array.isArray(library.data) ? library.data : []), [library.data]);
    const loading = library.isPending;


    const shelves = useMemo(() => libraryShelves(books), [books]);
    // A shelf that's no longer there (e.g. after a reload) falls back to All.
    const activeShelf = shelf !== null && shelves.includes(shelf) ? shelf : null;
    const activeFilterCount = activeShelf !== null ? 1 : 0;

    return (
        <div className="min-h-screen bg-surface-sunken pb-24 md:pb-8">

            {/* Top bar */}
            <div className="flex items-center justify-between pl-12 pr-4 md:px-6 py-3 bg-surface border-b border-line sticky top-0 z-10">
                <div>
                    <h1 className="text-section font-bold text-fg">{t("nav.library") || "Library"}</h1>
                    <p className="text-caption text-fg-muted hidden sm:block">{t("learner.library.subtitle")}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setFilterPanelOpen(v => !v)}
                    className="relative flex items-center gap-1.5 h-8 px-3 rounded-xl text-caption font-semibold border border-line text-fg-muted hover:bg-surface-hover transition-colors xl:hidden"
                >
                    {filterPanelOpen ? <X size={13} /> : <Filter size={13} />}
                    {t("learner.library.filters")}
                    {activeFilterCount > 0 && (
                        <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-danger text-on-danger text-caption font-bold flex items-center justify-center">
                            {activeFilterCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Search bar */}
            <div className="px-3 sm:px-5 pt-4">
                <TextInput aria-label={t("learner.library.searchLabel")}
                    type="search"
                    placeholder={t("learner.library.searchPlaceholder")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    icon={Search}
                    onClear={() => setSearchQuery("")}
                    clearLabel={t("learner.common.clearSearch")}
                />
            </div>

            {/* Mobile filter panel */}
            <LibrarySidebar
                shelves={shelves}
                shelf={activeShelf}
                setShelf={setShelf}
                mobile
                open={filterPanelOpen}
            />

            {/* Main layout */}
            <div className="px-3 sm:px-5 pt-4">
                <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-4">

                    {/* Desktop sidebar */}
                    <div className="hidden xl:block">
                        <LibrarySidebar
                            shelves={shelves}
                            shelf={activeShelf}
                            setShelf={setShelf}
                        />
                    </div>

                    {/* Books grid */}
                    <div className="bg-surface rounded-2xl border border-line shadow-sm overflow-hidden">
                        <BooksPage books={books} loading={loading} shelf={activeShelf} searchQuery={searchQuery} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Library;
