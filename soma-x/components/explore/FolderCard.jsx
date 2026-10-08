"use client";

// A folder in Explore (a level, a class, a subject...). Folder slugs are full path_keys,
// e.g. "rwandan-education/primary-school-content/p1"; the card links to "/<slug>".
import Link from "next/link";
import { useState } from "react";
import { Folder } from "lucide-react";
import Typography from "@/components/ui/Typography";
import { useLanguage } from "@/context/LanguageContext";

/** A public file under the API (e.g. a cover "/pdf-book-covers/x/y.avif"), or null. */
export function serverAsset(path) {
    if (!path) return null;
    return `${process.env.NEXT_PUBLIC_SERVER_URL}${encodeURI(path)}`;
}

/**
 * Shown title for a folder. The cloud content (Rwandan education) uses known folder names
 * that have translations under educationLevels.<last segment>; school content keeps the
 * title the school gave it.
 */
export function folderTitle(slug, title, t) {
    const key = String(slug || "");
    if (key === "rwandan-education" || key === "custom-content") {
        return t(`explore.categories.${key}`) || title || key;
    }
    if (key.startsWith("rwandan-education/")) {
        const last = key.split("/").pop();
        return t(`educationLevels.${last}`) || title || last;
    }
    return title || key.split("/").pop();
}

export default function FolderCard({ folder }) {
    const { t } = useLanguage();
    const [imageFailed, setImageFailed] = useState(false);
    const title = folderTitle(folder.slug, folder.title, t);
    const cover = !imageFailed ? serverAsset(folder.image) : null;
    const count = Number(folder.count) || 0;

    return (
        <Link
            href={`/${folder.slug}`}
            className="group block rounded-xl overflow-hidden bg-white shadow-md hover:shadow-xl transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-dark focus-visible:ring-offset-2"
        >
            <div className="relative aspect-[4/3] bg-slate-700 flex items-center justify-center overflow-hidden">
                {cover ? (
                    <img
                        src={cover}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-300"
                        onError={() => setImageFailed(true)}
                    />
                ) : (
                    <>
                        <img src="/imageFallback.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
                        <Folder className="relative w-12 h-12 text-white/80" aria-hidden="true" />
                    </>
                )}
                <span className="absolute bottom-2 right-2 bg-black/70 text-white text-xs font-semibold px-2 py-1 rounded-full">
                    {count === 1 ? t("explore.oneFile") : `${count} ${t("explore.files")}`}
                </span>
            </div>
            <div className="px-4 py-4">
                <Typography variant="title" as="h3" className="line-clamp-2 group-hover:text-accent-dark transition-colors">
                    {title}
                </Typography>
            </div>
        </Link>
    );
}
