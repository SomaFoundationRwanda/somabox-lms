"use client"

import { useState } from "react";
import { Filter, Search, X } from "lucide-react";
import BooksPage from "@/components/ui/library/books";
import LibrarySidebar from "@/components/ui/library/LibrarySidebar";

const Library = () => {
    const [selectedFilters, setSelectedFilters] = useState({});
    const [searchQuery, setSearchQuery] = useState("");
    const [filterPanelOpen, setFilterPanelOpen] = useState(false);

    const activeFilterCount = Object.values(selectedFilters).reduce((sum, arr) => sum + (arr?.length || 0), 0);

    return (
        <div className="min-h-screen bg-[#F8F9FA] pb-24 md:pb-8">

            {/* Top bar */}
            <div className="flex items-center justify-between pl-12 pr-4 md:px-6 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
                <div>
                    <h1 className="text-[17px] font-bold text-slate-900">Library</h1>
                    <p className="text-[11px] text-slate-400 hidden sm:block">Browse and read books in your collection</p>
                </div>
                <button
                    type="button"
                    onClick={() => setFilterPanelOpen(v => !v)}
                    className="relative flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors xl:hidden"
                >
                    {filterPanelOpen ? <X size={13} /> : <Filter size={13} />}
                    Filters
                    {activeFilterCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center">
                            {activeFilterCount}
                        </span>
                    )}
                </button>
            </div>

            {/* Search bar */}
            <div className="px-3 sm:px-5 pt-4">
                <div className="relative">
                    <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        placeholder="Search books by title…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full h-10 pl-9 pr-4 rounded-xl border border-slate-200 bg-white text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-slate-300 shadow-sm"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            <X size={13} />
                        </button>
                    )}
                </div>
            </div>

            {/* Mobile filter panel */}
            <LibrarySidebar
                selectedFilters={selectedFilters}
                setSelectedFilters={setSelectedFilters}
                mobile
                open={filterPanelOpen}
            />

            {/* Main layout */}
            <div className="px-3 sm:px-5 pt-4">
                <div className="grid grid-cols-1 xl:grid-cols-[240px_1fr] gap-4">

                    {/* Desktop sidebar */}
                    <div className="hidden xl:block">
                        <LibrarySidebar
                            selectedFilters={selectedFilters}
                            setSelectedFilters={setSelectedFilters}
                        />
                    </div>

                    {/* Books grid */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <BooksPage selectedFilters={selectedFilters} searchQuery={searchQuery} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Library;
