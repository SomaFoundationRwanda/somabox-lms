"use client"
import { useContext, useMemo, useState } from "react"
import Link from "next/link"
import DataContext from "@/context/DataContext"
import { useLanguage } from "@/context/LanguageContext"
import { folderTitle, serverAsset } from "@/components/explore/FolderCard"
import Loader from "@/components/ui/Loader";
import { useQuery } from "@tanstack/react-query"
import { apiFetch } from "@/lib/api"
import { queryKeys } from "@/lib/queryKeys"
import { TextInput } from "@/components/form"

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
      <div className="w-full h-full flex items-center justify-center bg-line px-2">
        <span className="text-caption text-fg-muted text-center leading-snug">{book.name}</span>
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

  // The box's books, kept with the rest of the catalogue (same copy as the Library pages).
  const library = useQuery({ queryKey: queryKeys.libraryBooks, queryFn: () => apiFetch("/library/books") })
  const books = Array.isArray(library.data) ? library.data : library.data?.books || []
  const booksError = library.isError ? (library.error?.body?.message || t("explore.teacher.booksFailed")) : ""
  const loading = library.isPending
  const [search, setSearch] = useState("")
  const [activeTab, setActiveTab] = useState("categories")


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
      <h1 className="text-section font-semibold text-fg mb-2">{t("explore.teacher.title")}</h1>
      <p className="text-ui text-fg-muted mb-5">{t("explore.teacher.subtitle")}</p>

      <TextInput
        type="search"
        placeholder={activeTab === "categories" ? t("explore.teacher.searchExplore") : t("explore.teacher.searchBooks")}
        aria-label={activeTab === "categories" ? t("explore.teacher.searchExplore") : t("explore.teacher.searchBooks")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm mb-5"
      />

      <div className="flex gap-1 mb-6 bg-surface-sunken rounded-lg p-1 w-fit" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => { setActiveTab(tab.key); setSearch("") }}
            className={`px-4 py-1.5 rounded-md text-ui font-medium transition-all ${
              activeTab === tab.key
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-muted hover:text-fg-muted"
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
          <p className="text-ui text-fg-muted">{query ? t("explore.teacher.noMatches") : t("explore.emptyRoot")}</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {filteredEntries.map((entry) => (
              <Link
                key={entry.key}
                href={entry.href}
                target={entry.external ? "_blank" : undefined}
                rel={entry.external ? "noopener noreferrer" : undefined}
                className="w-44 border border-line rounded-xl overflow-hidden bg-surface shadow-sm hover:shadow-md transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <div className="w-full h-28 bg-surface-sunken relative flex items-center justify-center">
                  {entry.external ? (
                    <img src={entry.image} alt="" className="w-12 h-12 object-contain" />
                  ) : (
                    <img src={entry.image || getCategoryImage(entry.title)} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="p-3">
                  <p className="text-caption font-semibold text-fg-muted line-clamp-2 mb-1">{entry.title}</p>
                  <p className="text-caption text-fg-muted line-clamp-1">
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
          <p className="text-ui text-danger-fg" role="alert">{booksError}</p>
        ) : filteredBooks.length === 0 ? (
          <p className="text-ui text-fg-muted">{t("explore.teacher.noBooks")}</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {filteredBooks.map((book) => (
              <div key={book.id} className="w-36 border border-line rounded-xl overflow-hidden bg-surface shadow-sm">
                <div className="w-full h-44 bg-surface-sunken relative">
                  <BookCover book={book} SERVER_URL={SERVER_URL} />
                </div>
                <div className="p-2.5">
                  <p className="text-caption font-semibold text-fg-muted line-clamp-2 mb-2">{book.name}</p>
                  {book.ext && <p className="text-caption font-bold text-fg-muted mb-2">{String(book.ext).replace(/^\./, "")}</p>}
                  <Link
                    href={`/library?book=${encodeURIComponent(book.id)}`}
                    className="inline-flex items-center gap-1 text-caption text-fg-muted border border-line-strong rounded-full px-2 py-1 hover:bg-surface-hover transition-colors"
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
