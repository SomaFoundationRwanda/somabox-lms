import { Book, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// Dot colors for shelves — same cycling approach as lessons page
const CAT_DOTS = [
    "bg-info", "bg-warning", "bg-brand",
    "bg-danger",   "bg-info",  "bg-warning",
    "bg-info", "bg-info",
];

function getCatDot(index) {
    return CAT_DOTS[index % CAT_DOTS.length];
}

// Shelves are the library's top folders. `shelf` is null for "All", "" for "Other" (files at
// the top of the library), or a folder title.
const LibrarySidebar = ({ shelves = [], shelf, setShelf, mobile = false, open = false }) => {
    const { t } = useLanguage();

    const options = [
        { key: "__all__", value: null, label: t("explore.library.all") },
        ...shelves.map((s) => ({ key: s || "__other__", value: s, label: s || t("explore.library.other") })),
    ];

    const content = (
        <div className="bg-surface rounded-2xl border border-line p-4">
            <div className="flex items-center justify-between mb-3">
                <p className="text-caption font-bold text-fg-muted">{t("explore.library.shelves")}</p>
            </div>

            {shelves.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                    <Book className="w-7 h-7 text-line-strong mb-2" />
                    <p className="text-caption text-fg-muted">{t("explore.library.noShelves")}</p>
                </div>
            ) : (
                <div className="space-y-0.5">
                    {options.map((opt, i) => {
                        const isChecked = shelf === opt.value;
                        return (
                            <button
                                key={opt.key}
                                type="button"
                                aria-pressed={isChecked}
                                onClick={() => setShelf(opt.value)}
                                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                                    isChecked ? "bg-surface-sunken" : "hover:bg-surface-hover"
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${opt.value === null ? "bg-line-strong" : getCatDot(i - 1)}`} />
                                <p className="text-caption font-medium text-fg-muted flex-1 truncate capitalize">{opt.label}</p>
                                {isChecked && <CheckCircle2 size={12} className="shrink-0 text-fg-muted" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );

    // Mobile: inline panel shown under top bar when open
    if (mobile) {
        if (!open) return null;
        return <div className="xl:hidden mx-3 mt-3">{content}</div>;
    }

    // Desktop: always visible
    return content;
};

export default LibrarySidebar;
