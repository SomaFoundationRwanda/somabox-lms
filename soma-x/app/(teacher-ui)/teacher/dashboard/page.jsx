"use client"
import { useContext, useEffect, useMemo, useState } from "react"
import { EmptyState } from "@/components/ui/empty-state"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ChevronRight, Plus, X } from "lucide-react"
import DataContext from "@/context/DataContext"

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-[#0f1318] border border-transparent dark:border-slate-700/50 rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800 dark:text-white">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function TeacherDashboardPage() {
  const { SERVER_URL, unshiftString } = useContext(DataContext)
  const router = useRouter()

  const [classes, setClasses] = useState([])
  const [books, setBooks] = useState([])
  const [loading, setLoading] = useState(true)

  const [studentModal, setStudentModal] = useState(null) // classId
  const [contentModal, setContentModal] = useState(null) // classId
  const [studentEmail, setStudentEmail] = useState("")
  const [studentError, setStudentError] = useState("")
  const [studentLoading, setStudentLoading] = useState(false)
  const [contentSearch, setContentSearch] = useState("")
  const [contentAdding, setContentAdding] = useState(null)

  const [createModal, setCreateModal] = useState(false)
  const [newClass, setNewClass] = useState({ name: "", grade: "", schedule: "", notes: "" })
  const [createError, setCreateError] = useState("")
  const [createLoading, setCreateLoading] = useState(false)

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return ""
    const stored = localStorage.getItem("al")
    return stored ? unshiftString(stored) : ""
  }, [unshiftString])

  useEffect(() => {
    if (!SERVER_URL || !teacherEmail) return
    const load = async () => {
      try {
        const [classRes, booksRes] = await Promise.all([
          fetch(`${SERVER_URL}/classes?teacherEmail=${encodeURIComponent(teacherEmail)}`),
          fetch(`${SERVER_URL}/library/books`),
        ])
        if (classRes.ok) setClasses(await classRes.json())
        if (booksRes.ok) setBooks(await booksRes.json())
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [SERVER_URL, teacherEmail])

  const handleAddStudent = async () => {
    if (!studentEmail.trim() || !studentModal) return
    setStudentError("")
    setStudentLoading(true)
    try {
      const res = await fetch(`${SERVER_URL}/classes/${studentModal}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherEmail, scholarEmail: studentEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setStudentError(data.message || "Failed to add student"); return }
      setStudentEmail("")
      setStudentModal(null)
    } catch {
      setStudentError("Something went wrong")
    } finally {
      setStudentLoading(false)
    }
  }

  const handleCreateClass = async () => {
    if (!newClass.name.trim()) { setCreateError("Class name is required"); return }
    setCreateError("")
    setCreateLoading(true)
    try {
      const res = await fetch(`${SERVER_URL}/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newClass, teacherEmail }),
      })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.message || "Failed to create class"); return }
      setCreateModal(false)
      setNewClass({ name: "", grade: "", schedule: "", notes: "" })
      router.push(`/teacher/classes?classId=${data.id}`)
    } catch {
      setCreateError("Something went wrong")
    } finally {
      setCreateLoading(false)
    }
  }

  const filteredBooks = books.filter((b) =>
    b.title?.toLowerCase().includes(contentSearch.toLowerCase()) ||
    b.author?.toLowerCase().includes(contentSearch.toLowerCase())
  )

  return (
    <div>
      <h1 className="text-xl font-semibold text-slate-800 dark:text-white mb-6">Welcome, Teacher!</h1>

      <section>
        <div className="flex items-center justify-between mb-4">
          <Link href="/teacher/classes" className="inline-flex items-center gap-1 group">
            <h2 className="text-base font-semibold text-slate-700">Classes</h2>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
          </Link>
          <button
            onClick={() => { setCreateModal(true); setNewClass({ name: "", grade: "", schedule: "", notes: "" }); setCreateError("") }}
            className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#2E8282] hover:bg-[#1f6767] rounded-lg px-3 py-2 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New Class
          </button>
        </div>

        <div className="flex gap-5 overflow-x-auto pb-3 no-scrollbar">
          {loading ? (
            <p className="text-sm text-slate-400">Loading...</p>
          ) : classes.length === 0 ? (
            <div className="w-full flex justify-center py-8"><EmptyState message="No classes yet." /></div>
          ) : (
            classes.map((cls) => (
              <div key={cls.id} className="flex-shrink-0 w-72 border border-slate-200 dark:border-slate-700/50 rounded-2xl overflow-hidden bg-white dark:bg-[#0f1318] shadow-sm">
                <Link href={`/teacher/classes?classId=${cls.id}`}>
                  <div className="w-full h-44 bg-slate-100 relative cursor-pointer">
                    <Image
                      src={cls.cover_image ? `${SERVER_URL}/class-covers/${cls.cover_image}` : "/imageFallback.png"}
                      alt={cls.name}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                </Link>
                <div className="p-4">
                  <Link href={`/teacher/classes?classId=${cls.id}`}>
                    <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1 hover:text-[#2E8282] transition-colors cursor-pointer">{cls.name}</p>
                  </Link>
                  <p className="text-xs text-slate-400 mb-4">{cls.grade} · {cls.students || 0} students</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setStudentModal(cls.id); setStudentEmail(""); setStudentError("") }}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      Add Student <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => { setContentModal(cls.id); setContentSearch("") }}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-600 rounded-lg py-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                      Add Content <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Add Student Modal */}
      {studentModal && (
        <Modal title={`Add Student to ${classes.find(c => c.id === studentModal)?.name}`} onClose={() => setStudentModal(null)}>
          <input
            type="email"
            placeholder="Student email address"
            value={studentEmail}
            onChange={(e) => setStudentEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddStudent()}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282] mb-2"
          />
          {studentError && <p className="text-xs text-red-500 mb-2">{studentError}</p>}
          <button
            onClick={handleAddStudent}
            disabled={studentLoading || !studentEmail.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-medium bg-[#2E8282] text-white hover:bg-[#1f6767] transition-colors disabled:opacity-50"
          >
            {studentLoading ? "Adding..." : "Add Student"}
          </button>
        </Modal>
      )}

      {/* Create Class Modal */}
      {createModal && (
        <Modal title="Create New Class" onClose={() => setCreateModal(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Class Name *</label>
              <input
                type="text"
                placeholder="e.g. Grade 5 Mathematics"
                value={newClass.name}
                onChange={(e) => setNewClass((p) => ({ ...p, name: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282]"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Grade</label>
              <input
                type="text"
                placeholder="e.g. Grade 5"
                value={newClass.grade}
                onChange={(e) => setNewClass((p) => ({ ...p, grade: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282]"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Schedule</label>
              <input
                type="text"
                placeholder="e.g. Mon/Wed/Fri 8:00 AM"
                value={newClass.schedule}
                onChange={(e) => setNewClass((p) => ({ ...p, schedule: e.target.value }))}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282]"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Notes</label>
              <textarea
                placeholder="Any additional notes..."
                value={newClass.notes}
                onChange={(e) => setNewClass((p) => ({ ...p, notes: e.target.value }))}
                rows={2}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282] resize-none"
              />
            </div>
            {createError && <p className="text-xs text-red-500">{createError}</p>}
            <button
              onClick={handleCreateClass}
              disabled={createLoading || !newClass.name.trim()}
              className="w-full py-2.5 rounded-lg text-sm font-medium bg-[#2E8282] text-white hover:bg-[#1f6767] transition-colors disabled:opacity-50"
            >
              {createLoading ? "Creating..." : "Create Class"}
            </button>
          </div>
        </Modal>
      )}

      {/* Add Content Modal */}
      {contentModal && (
        <Modal title={`Add Content to ${classes.find(c => c.id === contentModal)?.name}`} onClose={() => setContentModal(null)}>
          <input
            type="text"
            placeholder="Search books..."
            value={contentSearch}
            onChange={(e) => setContentSearch(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2.5 outline-none focus:border-[#2E8282] mb-3"
          />
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {filteredBooks.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No books found.</p>
            ) : (
              filteredBooks.slice(0, 20).map((book) => (
                <div key={book.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 border border-slate-100">
                  <div className="w-10 h-12 bg-slate-200 rounded flex-shrink-0 relative overflow-hidden">
                    {book.cover_image && (
                      <Image src={`${SERVER_URL}/library-book-covers/${book.cover_image}`} alt={book.title} fill className="object-cover" unoptimized />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 line-clamp-1">{book.title}</p>
                    {book.author && <p className="text-xs text-slate-400">{book.author}</p>}
                  </div>
                  <button
                    disabled={contentAdding === book.id}
                    onClick={() => setContentAdding(book.id)}
                    className="text-xs px-3 py-1.5 rounded-lg bg-[#2E8282] text-white hover:bg-[#1f6767] transition-colors flex-shrink-0 disabled:opacity-50"
                  >
                    {contentAdding === book.id ? "Added" : "Add"}
                  </button>
                </div>
              ))
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
