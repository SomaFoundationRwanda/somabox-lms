"use client"

import { useEffect, useMemo, useState } from "react";
import { Filter, Search, X } from "lucide-react";
import BooksPage from "@/components/ui/library/books";
import LibrarySidebar from "@/components/ui/library/LibrarySidebar";
import { libraryShelves } from "@/components/ui/library/libraryEntry";
import { useLanguage } from "@/context/LanguageContext";

const Library = () => {
    // Shelf: null = All, "" = Other (files at the top of the library), else a top folder title.
    const { t } = useLanguage();
    const [shelf, setShelf] = useState(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterPanelOpen, setFilterPanelOpen] = useState(false);
    const [books, setBooks] = useState([]);
    const [loading, setLoading] = useState(true);
    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

    useEffect(() => {
        async function loadBooks() {
            try {
                setLoading(true);
                const res = await fetch(`${SERVER_URL}/library/books`);
                if (res.ok) {
                    const data = await res.json();
                    setBooks(Array.isArray(data) ? data : []);
                }
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        loadBooks();
    }, [SERVER_URL]);

    const shelves = useMemo(() => libraryShelves(books), [books]);
    // A shelf that's no longer there (e.g. after a reload) falls back to All.
    const activeShelf = shelf !== null && shelves.includes(shelf) ? shelf : null;
    const activeFilterCount = activeShelf !== null ? 1 : 0;

    return (
        <div className="min-h-screen bg-[#F8F9FA] pb-24 md:pb-8">

            {/* Top bar */}
            <div className="flex items-center justify-between pl-12 pr-4 md:px-6 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
                <div>
                    <h1 className="text-[17px] font-bold text-slate-900">{t("nav.library") || "Library"}</h1>
                    <p className="text-[11px] text-slate-600 hidden sm:block">{t("learner.library.subtitle")}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setFilterPanelOpen(v => !v)}
                    className="relative flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors xl:hidden"
                >
                    {filterPanelOpen ? <X size={13} /> : <Filter size={13} />}
                    {t("learner.library.filters")}
                    {activeFilterCount > 0 && (
                        <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center">
                            {activeFilterCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Search bar */}
            <div className="px-3 sm:px-5 pt-4">
                <div className="relative">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                    <input aria-label={t("learner.library.searchLabel")}
                        type="text"
                        placeholder={t("learner.library.searchPlaceholder")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-slate-300 shadow-sm"
                    />
                    {searchQuery && (
                        <button aria-label={t("learner.common.clearSearch")}
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-600"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>
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
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <BooksPage books={books} loading={loading} shelf={activeShelf} searchQuery={searchQuery} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Library;
