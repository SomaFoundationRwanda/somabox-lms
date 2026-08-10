"use client"
import { useContext, useEffect, useState } from "react"
import Image from "next/image"
import { Plus } from "lucide-react"
import DataContext from "@/context/DataContext"

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

export default function TeacherExplorePage() {
  const { SERVER_URL, mainCategories } = useContext(DataContext)

  const [books, setBooks] = useState([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("categories")

  useEffect(() => {
    if (!SERVER_URL) return
    const load = async () => {
      try {
        const res = await fetch(`${SERVER_URL}/library/books`)
        if (res.ok) setBooks(await res.json())
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [SERVER_URL])

  const filteredBooks = books.filter((b) =>
    b.title?.toLowerCase().includes(search.toLowerCase()) ||
    b.author?.toLowerCase().includes(search.toLowerCase())
  )

  const filteredCategories = (mainCategories || []).filter((c) =>
    c.title?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800 dark:text-white mb-2">Explore Content</h1>
      <p className="text-sm text-slate-600 dark:text-slate-500 mb-5">Browse categories and books to add to your courses.</p>

      <input
        type="text"
        placeholder={activeTab === "categories" ? "Search categories..." : "Search books..."}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 outline-none focus:border-[#2E8282] bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 mb-5"
      />

      <div className="flex gap-1 mb-6 bg-slate-100 dark:bg-slate-800 rounded-lg p-1 w-fit">
        {["categories", "books"].map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); setSearch("") }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-all ${
              activeTab === tab
                ? "bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "categories" && (
        <div className="flex flex-wrap gap-4">
          {filteredCategories.length === 0 ? (
            <p className="text-sm text-slate-600">No categories found.</p>
          ) : (
            filteredCategories.map((cat) => (
              <div key={cat.id} className="w-44 border border-slate-200 dark:border-slate-700/50 rounded-xl overflow-hidden bg-white dark:bg-[#0f1318] shadow-sm">
                <div className="w-full h-28 bg-slate-100 dark:bg-slate-800 relative">
                  <Image src={getCategoryImage(cat.title)} alt={cat.title} fill className="object-cover" />
                </div>
                <div className="p-3">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-1 mb-1">{cat.title}</p>
                  {cat.subtitle && <p className="text-xs text-slate-600 line-clamp-1 mb-2">{cat.subtitle}</p>}
                  <button className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 rounded-full px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    Add to Class <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "books" && (
        loading ? (
          <p className="text-sm text-slate-600">Loading...</p>
        ) : filteredBooks.length === 0 ? (
          <p className="text-sm text-slate-600">No books found.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {filteredBooks.map((book) => (
              <div key={book.id} className="w-36 border border-slate-200 dark:border-slate-700/50 rounded-xl overflow-hidden bg-white dark:bg-[#0f1318] shadow-sm">
                <div className="w-full h-44 bg-slate-100 dark:bg-slate-800 relative">
                  {book.cover_image ? (
                    <Image src={`${SERVER_URL}/library-book-covers/${book.cover_image}`} alt={book.title} fill className="object-cover" unoptimized />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-200 dark:bg-slate-700 px-2">
                      <span className="text-xs text-slate-500 dark:text-slate-400 text-center leading-snug">{book.title}</span>
                    </div>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 line-clamp-1 mb-0.5">{book.title}</p>
                  {book.author && <p className="text-xs text-slate-600 line-clamp-1 mb-2">{book.author}</p>}
                  <button className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-600 rounded-full px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    Add to Class <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
