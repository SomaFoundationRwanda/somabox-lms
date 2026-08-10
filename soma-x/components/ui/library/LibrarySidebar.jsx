import { useEffect, useState } from "react";
import { Book, CheckCircle2, X } from "lucide-react";

// Dot colors for categories — same cycling approach as lessons page
const CAT_DOTS = [
    "bg-indigo-400", "bg-amber-400", "bg-teal-400",
    "bg-rose-400",   "bg-blue-400",  "bg-orange-400",
    "bg-violet-400", "bg-cyan-400",
];

function getCatDot(index) {
    return CAT_DOTS[index % CAT_DOTS.length];
}

const LibrarySidebar = ({ selectedFilters, setSelectedFilters, mobile = false, open = false }) => {
    const [categories, setCategories] = useState([]);
    const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL;

    useEffect(() => {
        async function fetchCategories() {
            try {
                const res = await fetch(`${SERVER_URL}/library/categories`);
                if (res.ok) setCategories(await res.json());
            } catch (err) {
                console.error("Failed to fetch categories:", err);
            }
        }
        fetchCategories();
    }, [SERVER_URL]);

    const toggleCategory = (cat) => {
        setSelectedFilters(prev => {
            const current = prev.subjects || [];
            const updated = current.includes(cat)
                ? current.filter(c => c !== cat)
                : [...current, cat];
            return { ...prev, subjects: updated };
        });
    };

    const clearAll = () => setSelectedFilters({});
    const activeCount = (selectedFilters.subjects || []).length;

    const content = (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Categories</p>
                {activeCount > 0 && (
                    <button
                        type="button"
                        onClick={clearAll}
                        className="flex items-center gap-1 text-[10px] font-semibold text-slate-600 hover:text-slate-600 transition-colors"
                    >
                        <X size={10} />
                        Clear
                    </button>
                )}
            </div>

            {categories.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                    <Book className="w-7 h-7 text-slate-200 mb-2" />
                    <p className="text-[11px] text-slate-600">No categories found</p>
                </div>
            ) : (
                <div className="space-y-0.5">
                    {categories.map((cat, i) => {
                        const isChecked = (selectedFilters.subjects || []).includes(cat);
                        const dot = getCatDot(i);
                        return (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => toggleCategory(cat)}
                                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-left transition-colors cursor-pointer ${
                                    isChecked ? "bg-slate-50" : "hover:bg-slate-50"
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                                <p className="text-[11px] font-medium text-slate-700 flex-1 truncate capitalize">{cat}</p>
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
