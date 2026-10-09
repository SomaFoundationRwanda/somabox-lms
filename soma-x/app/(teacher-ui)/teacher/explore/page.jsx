"use client"
import { useContext, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import DataContext from "@/context/DataContext"
import { useLanguage } from "@/context/LanguageContext"
import { folderTitle, serverAsset } from "@/components/explore/FolderCard"
import Loader from "@/components/ui/Loader";

const CATEGORY_IMAGES = {
  math: "/images/math.webp",
  science: "/images/bio.png",
  english: "/images/English.jpg.webp",
  french: "/images/french.png",
  kinyarwanda: "/images/Kinyarwanda.jpg",
  swahili: "/images/kiswahili.jpg",
}

function getCategoryImage(title = "") {
  const lower = title.toLowerCase()
  for (const [key, img] of Object.entries(CATEGORY_IMAGES)) {
    if (lower.includes(key)) return img
  }
  return "/imageFallback.png"
}

// One card per folder at the top of each file root (full-path slugs, opening the Explore
// browser at /<slug>), plus the web resources (opened in /frame).
function exploreEntries(mainCategories, t) {
  const out = []
  for (const cat of mainCategories || []) {
    const section = t(`explore.categories.${cat.slug}`) || cat.title
    for (const item of cat.items || []) {
      if (cat.kind === "web") {
        out.push({
          key: `web-${item.slug}`,
          title: t(`platforms.${item.slug}.title`) || item.title,
          section,
          href: `/frame?slug=${item.slug}`,
          image: `/images/${item.slug}.png`,
          external: true,
        })
      } else {
        out.push({
          key: item.slug,
          title: folderTitle(item.slug, item.title, t),
          section,
          href: `/${item.slug}`,
          image: serverAsset(item.image),
          count: Number(item.count) || 0,
        })
      }
    }
  }
  return out
}

function BookCover({ book, SERVER_URL }) {
  const [failed, setFailed] = useState(false)
  if (failed || !book.cover) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-700 px-2">
        <span className="text-xs text-slate-600 dark:text-slate-300 text-center leading-snug">{book.name}</span>
      </div>
    )
  }
  return (
    <img
      src={`${SERVER_URL}${book.cover}`}
      alt=""
      loading="lazy"
      className="w-full h-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}

export default function TeacherExplorePage() {
  const { SERVER_URL, mainCategories } = useContext(DataContext)
  const { t } = useLanguage()

  const [books, setBooks] = useState([])
  const [booksError, setBooksError] = useState("")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("categories")

  useEffect(() => {
    if (!SERVER_URL) return
    const load = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/library/books`)
        if (res.ok) {
          const data = await res.json()
          setBooks(Array.isArray(data) ? data : data?.books || [])
        } else {
          let message = ""
          try { message = (await res.json())?.message || "" } catch { /* not JSON */ }
          setBooksError(message || t("explore.teacher.booksFailed"))
        }
      } catch (err) {
        console.error(err)
        setBooksError(t("explore.teacher.booksFailed"))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [SERVER_URL, t])

  const query = search.trim().toLowerCase()
  const filteredBooks = books.filter((b) => !query || String(b.name || "").toLowerCase().includes(query))

  const entries = useMemo(() => exploreEntries(mainCategories, t), [mainCategories, t])
  const filteredEntries = entries.filter((e) =>
    !query || e.title.toLowerCase().includes(query) || e.section.toLowerCase().includes(query)
  )

  const tabs = [
    { key: "categories", label: t("explore.teacher.tabExplore") },
    { key: "books", label: t("explore.teacher.tabBooks") },
  ]

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">{t("explore.teacher.title")}</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-5">{t("explore.teacher.subtitle")}</p>

      <input
        type="text"
        placeholder={activeTab === "categories" ? t("explore.teacher.searchExplore") : t("explore.teacher.searchBooks")}
        aria-label={activeTab === "categories" ? t("explore.teacher.searchExplore") : t("explore.teacher.searchBooks")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 outline-none focus:border-[var(--brand-secondary)] bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 mb-5"
      />

      <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => { setActiveTab(tab.key); setSearch("") }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "categories" && (
        mainCategories == null ? (
          <Loader variant="page" label={t("explore.teacher.loading")} />
        ) : filteredEntries.length === 0 ? (
          <p className="text-sm text-slate-600">{query ? t("explore.teacher.noMatches") : t("explore.emptyRoot")}</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {filteredEntries.map((entry) => (
              <Link
                key={entry.key}
                href={entry.href}
                target={entry.external ? "_blank" : undefined}
                rel={entry.external ? "noopener noreferrer" : undefined}
                className="w-44 border border-slate-200 dark:border-slate-700/50 rounded-xl overflow-hidden bg-white dark:bg-[#0f1318] shadow-sm hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-secondary)]"
              >
                <div className="w-full h-28 bg-slate-100 dark:bg-slate-800 relative flex items-center justify-center">
                  {entry.external ? (
                    <img src={entry.image} alt="" className="w-12 h-12 object-contain" />
                  ) : (
                    <img src={entry.image || getCategoryImage(entry.title)} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2 mb-1">{entry.title}</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-1">
                    {entry.section}
                    {entry.count != null ? ` · ${entry.count === 1 ? t("explore.oneFile") : `${entry.count} ${t("explore.files")}`}` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )
      )}

      {activeTab === "books" && (
        loading ? (
          <Loader variant="page" label={t("explore.teacher.loading")} />
        ) : booksError ? (
          <p className="text-sm text-red-700" role="alert">{booksError}</p>
        ) : filteredBooks.length === 0 ? (
          <p className="text-sm text-slate-600">{t("explore.teacher.noBooks")}</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {filteredBooks.map((book) => (
              <div key={book.id} className="w-36 border border-slate-200 dark:border-slate-700/50 rounded-xl overflow-hidden bg-white dark:bg-[#0f1318] shadow-sm">
                <div className="w-full h-44 bg-slate-100 dark:bg-slate-800 relative">
                  <BookCover book={book} SERVER_URL={SERVER_URL} />
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-2 mb-2">{book.name}</p>
                  {book.ext && <p className="text-[10px] font-bold uppercase text-slate-600 mb-2">{String(book.ext).replace(/^\./, "")}</p>}
                  <Link
                    href={`/library?book=${encodeURIComponent(book.id)}`}
                    className="inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-full px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {t("explore.teacher.openLibrary")}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
