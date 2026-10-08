import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import UniversalPlayerModal from "@/components/ui/UniversalPlayerModal";
import { BookOpen, Film, Music } from "lucide-react";
import { useGuestGate } from "@/components/guest/GuestGate";
import { useLanguage } from "@/context/LanguageContext";
import { libraryCoverUrl, libraryFileUrl, libraryShelf, libraryViewer } from "./libraryEntry";

// react-reader (epub.js) loads only when a book is opened.
const EpubReader = dynamic(() => import("./EpubReader"), { ssr: false });

// Fallback gradient colors per book index
const COVER_GRADIENTS = [
    "from-violet-400 to-purple-600",
    "from-blue-400 to-indigo-600",
    "from-teal-400 to-emerald-600",
    "from-amber-400 to-orange-500",
    "from-rose-400 to-pink-600",
    "from-cyan-400 to-sky-600",
];

function getCoverGradient(index) {
    return COVER_GRADIENTS[index % COVER_GRADIENTS.length];
}

const TYPE_ICONS = { video: Film, audio: Music };

// `books` come from GET /library/books (loaded by the Library page). `shelf` is null for All,
// "" for Other (files at the top of the library), or a top folder title.
const BooksPage = ({ books = [], loading = false, shelf = null, searchQuery }) => {
    const { t } = useLanguage();
    const [selectedBook, setSelectedBook] = useState(null);
    const [imageErrors, setImageErrors] = useState({});
    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;
    // Guests see the shelf and covers; reading a book needs an account.
    const { isGuest, requireAccount } = useGuestGate();

    const openBook = (book) => {
        if (!requireAccount(`/library?book=${encodeURIComponent(book.id)}`)) return;
        setSelectedBook(book);
    };

    // Back from signing up (or logging in) to read a book: ?book=<id> opens it.
    useEffect(() => {
        if (isGuest || !books.length) return;
        let bookId = null;
        try { bookId = new URLSearchParams(window.location.search).get("book"); } catch { /* ignore */ }
        if (!bookId) return;
        const book = books.find((b) => String(b.id) === bookId);
        if (book) setSelectedBook(book);
        window.history.replaceState(null, "", window.location.pathname);
    }, [isGuest, books]);

    const filteredBooks = books.filter(book => {
        if (searchQuery && !String(book.name || "").toLowerCase().includes(searchQuery.toLowerCase())) return false;
        if (shelf !== null && libraryShelf(book) !== shelf) return false;
        return true;
    });

    const viewer = selectedBook ? libraryViewer(selectedBook) : null;
    const actionLabel = (book) => {
        const v = libraryViewer(book);
        return v === "video" ? t("explore.watch") : v === "audio" ? t("explore.listen") : t("explore.read");
    };

    const handleImageError = (itemId) => {
        setImageErrors(prev => ({ ...prev, [itemId]: true }));
    };

    if (loading) {
        return (
            <div className="p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="animate-pulse">
                            <div className="aspect-[2/3] rounded-xl bg-slate-100 mb-2" />
                            <div className="h-2.5 bg-slate-100 rounded w-3/4 mb-1.5" />
                            <div className="h-2 bg-slate-100 rounded w-1/2" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (filteredBooks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mb-3">
                    <BookOpen className="w-6 h-6 text-slate-500" />
                </div>
                <p className="text-[13px] font-semibold text-slate-500">No books found</p>
                <p className="text-[11px] text-slate-600 mt-1">Try adjusting your search or category filters</p>
            </div>
        );
    }

    return (
        <>
            <div className="p-5">
                {/* Header row */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center">
                            <BookOpen size={13} className="text-white" />
                        </div>
                        <p className="text-[13px] font-bold text-slate-800">Books</p>
                    </div>
                    <span className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-500">
                        {filteredBooks.length} {filteredBooks.length === 1 ? "book" : "books"}
                    </span>
                </div>

                {/* Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                    {filteredBooks.map((item, index) => {
                        const coverUrl = libraryCoverUrl(SERVER_URL, item);
                        const TypeIcon = TYPE_ICONS[item.type] || BookOpen;
                        return (
                        <button
                            key={item.id ?? index}
                            type="button"
                            onClick={() => openBook(item)}
                            className="group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] focus-visible:ring-offset-2 rounded-xl"
                        >
                            {/* Cover */}
                            <div className="relative aspect-[2/3] overflow-hidden rounded-xl shadow-sm group-hover:shadow-lg transition-all duration-300 group-hover:-translate-y-0.5 mb-2.5">
                                {coverUrl && !imageErrors[item.id] ? (
                                    <img
                                        src={coverUrl}
                                        alt={item.name}
                                        className="w-full h-full object-cover"
                                        loading="lazy"
                                        onError={() => handleImageError(item.id)}
                                    />
                                ) : (
                                    <div className={`w-full h-full bg-gradient-to-br ${getCoverGradient(index)} flex flex-col items-center justify-center p-3 text-center`}>
                                        <TypeIcon size={28} className="text-white/70 mb-2" />
                                        <p className="text-white font-bold text-[11px] line-clamp-3 leading-snug">
                                            {item.name}
                                        </p>
                                    </div>
                                )}

                                {/* Read overlay on hover */}
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                                    <span className="bg-white text-slate-900 text-[11px] font-bold px-3 py-1.5 rounded-full shadow">
                                        {actionLabel(item)} →
                                    </span>
                                </div>
                            </div>

                            {/* Meta — always visible */}
                            <p className="text-[12px] font-semibold text-slate-800 line-clamp-2 leading-snug mb-0.5">
                                {item.name}
                            </p>
                            <p className="text-[10px] text-slate-600 truncate capitalize">
                                {libraryShelf(item) || t("explore.library.other")}
                            </p>
                        </button>
                        );
                    })}
                </div>
            </div>

            {/* EPUB books → dedicated reader */}
            {selectedBook && viewer === 'epub' && (
                <EpubReader
                    url={libraryFileUrl(SERVER_URL, selectedBook)}
                    title={selectedBook.name}
                    onClose={() => setSelectedBook(null)}
                />
            )}

            {/* PDF books, videos and audio → UniversalPlayerModal */}
            <UniversalPlayerModal
                isOpen={Boolean(selectedBook) && viewer !== 'epub'}
                onClose={() => setSelectedBook(null)}
                mediaItem={selectedBook && viewer !== 'epub' ? {
                    title: selectedBook.name,
                    type: viewer,
                    url: libraryFileUrl(SERVER_URL, selectedBook),
                } : null}
            />
        </>
    );
};

export default BooksPage;
