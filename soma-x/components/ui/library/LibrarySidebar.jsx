import { Book, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";

// Dot colors for shelves — same cycling approach as lessons page
const CAT_DOTS = [
    "bg-indigo-400", "bg-amber-400", "bg-teal-400",
    "bg-rose-400",   "bg-blue-400",  "bg-orange-400",
    "bg-violet-400", "bg-cyan-400",
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
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">{t("explore.library.shelves")}</p>
            </div>

            {shelves.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                    <Book className="w-7 h-7 text-slate-200 mb-2" />
                    <p className="text-[11px] text-slate-600">{t("explore.library.noShelves")}</p>
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
                                    isChecked ? "bg-slate-50" : "hover:bg-slate-50"
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${opt.value === null ? "bg-slate-400" : getCatDot(i - 1)}`} />
                                <p className="text-[11px] font-medium text-slate-700 flex-1 truncate capitalize">{opt.label}</p>
                                {isChecked && <CheckCircle2 size={12} className="shrink-0 text-slate-600" />}
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
