"use client"
import { Suspense } from "react"
import { useContext, useEffect, useMemo, useState } from "react"
import { EmptyState } from "@/components/ui/empty-state"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { Camera, ChevronRight, Eye, EyeOff, Pencil, Plus, Trash2, UserMinus } from "lucide-react"
import DataContext from "@/context/DataContext"

const AVATAR_COLORS = [
  "bg-teal-500", "bg-blue-500", "bg-purple-500",
  "bg-orange-500", "bg-rose-500", "bg-indigo-500",
]

function getAvatarColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function getInitials(name) {
  if (!name) return "?"
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
}

function TeacherClassesPage() {
  const { SERVER_URL, unshiftString } = useContext(DataContext)
  const searchParams = useSearchParams()
  const router = useRouter()

  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(null)
  const [selectedClass, setSelectedClass] = useState(null)
  const [lessons, setLessons] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  const [addStudentEmail, setAddStudentEmail] = useState("")
  const [addStudentOpen, setAddStudentOpen] = useState(false)
  const [addStudentError, setAddStudentError] = useState("")
  const [addStudentLoading, setAddStudentLoading] = useState(false)

  const [imageUploading, setImageUploading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [removingStudent, setRemovingStudent] = useState(null) // scholar_email being removed

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return ""
    const stored = localStorage.getItem("al")
    return stored ? unshiftString(stored) : ""
  }, [unshiftString])

  const classIdFromQuery = searchParams?.get("classId") || ""

  const loadClasses = async () => {
    if (!SERVER_URL || !teacherEmail) return
    try {
      const res = await fetch(`${SERVER_URL}/classes?teacherEmail=${encodeURIComponent(teacherEmail)}`)
      if (!res.ok) return
      const data = await res.json()
      setClasses(data)
      if (data.length > 0) {
        const match = classIdFromQuery && data.some((c) => c.id === classIdFromQuery)
        setSelectedClassId(match ? classIdFromQuery : data[0].id)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadClasses() }, [SERVER_URL, teacherEmail, classIdFromQuery])

  const loadClassDetails = async (id) => {
    if (!id || !SERVER_URL || !teacherEmail) return
    try {
      const [classRes, membersRes, lessonsRes] = await Promise.all([
        fetch(`${SERVER_URL}/classes/${id}`),
        fetch(`${SERVER_URL}/classes/${id}/members?teacherEmail=${encodeURIComponent(teacherEmail)}`),
        fetch(`${SERVER_URL}/classes/${id}/lessons?teacherEmail=${encodeURIComponent(teacherEmail)}`),
      ])
      if (classRes.ok) setSelectedClass(await classRes.json())
      if (membersRes.ok) setMembers(await membersRes.json())
      if (lessonsRes.ok) setLessons(await lessonsRes.json())
    } catch (err) {
      console.error(err)
    }
  }

  useEffect(() => { loadClassDetails(selectedClassId) }, [selectedClassId, SERVER_URL, teacherEmail])

  const handleAddStudent = async () => {
    if (!addStudentEmail.trim()) return
    setAddStudentError("")
    setAddStudentLoading(true)
    try {
      const res = await fetch(`${SERVER_URL}/classes/${selectedClassId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherEmail, scholarEmail: addStudentEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setAddStudentError(data.message || "Failed to add student"); return }
      setAddStudentEmail("")
      setAddStudentOpen(false)
      const membersRes = await fetch(`${SERVER_URL}/classes/${selectedClassId}/members?teacherEmail=${encodeURIComponent(teacherEmail)}`)
      if (membersRes.ok) setMembers(await membersRes.json())
    } catch { setAddStudentError("Something went wrong") }
    finally { setAddStudentLoading(false) }
  }

  const handleToggleVisibility = async (lesson) => {
    try {
      await fetch(`${SERVER_URL}/classes/${selectedClassId}/lessons/${lesson.id}/visibility`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherEmail, isVisible: !lesson.isVisibleToStudents }),
      })
      const lessonsRes = await fetch(`${SERVER_URL}/classes/${selectedClassId}/lessons?teacherEmail=${encodeURIComponent(teacherEmail)}`)
      if (lessonsRes.ok) setLessons(await lessonsRes.json())
    } catch (err) { console.error(err) }
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedClassId) return
    setImageUploading(true)
    try {
      const formData = new FormData()
      formData.append("image", file)
      formData.append("teacherEmail", teacherEmail)
      const res = await fetch(`${SERVER_URL}/classes/${selectedClassId}/image`, { method: "POST", body: formData })
      if (res.ok) {
        const classRes = await fetch(`${SERVER_URL}/classes/${selectedClassId}`)
        if (classRes.ok) setSelectedClass(await classRes.json())
      }
    } catch (err) { console.error(err) }
    finally { setImageUploading(false) }
  }

  const handleRemoveStudent = async (scholarEmail) => {
    if (!scholarEmail || !selectedClassId || !teacherEmail) return
    setRemovingStudent(scholarEmail)
    try {
      const res = await fetch(
        `${SERVER_URL}/classes/${selectedClassId}/members/${encodeURIComponent(scholarEmail)}?teacherEmail=${encodeURIComponent(teacherEmail)}`,
        { method: "DELETE" }
      )
      if (res.ok) {
        setMembers((prev) => prev.filter((m) => (m.email || m.scholar_email) !== scholarEmail))
      }
    } catch (err) { console.error(err) }
    finally { setRemovingStudent(null) }
  }

  const handleDeleteClass = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`${SERVER_URL}/classes/${selectedClassId}`, { method: "DELETE" })
      if (res.ok) { router.push("/teacher/dashboard") }
    } catch (err) { console.error(err) }
    finally { setDeleting(false) }
  }

  if (loading) return <p className="text-sm text-slate-400">Loading...</p>

  if (classes.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mb-3"><EmptyState message="No classes yet." /></div>
        <Link href="/teacher/dashboard" className="text-sm text-[#2E8282] underline">Go to Dashboard</Link>
      </div>
    )
  }

  return (
    <div>
      {/* Class selector */}
      {classes.length > 1 && (
        <div className="mb-5">
          <select
            value={selectedClassId || ""}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="text-sm border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:border-[#2E8282]"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Class image + title */}
      <div className="mb-6">
        <div className="relative w-full h-36 rounded-xl overflow-hidden bg-slate-100 mb-3 group">
          {selectedClass?.cover_image ? (
            <Image src={`${SERVER_URL}/class-covers/${selectedClass.cover_image}`} alt={selectedClass.name} fill className="object-cover" unoptimized />
          ) : (
            <Image src="/imageFallback.png" alt="class" fill className="object-cover" />
          )}
          <label className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
            <div className="flex flex-col items-center gap-1 text-white text-xs font-medium">
              <Camera className="w-5 h-5" />
              <span>{imageUploading ? "Uploading..." : "Change Image"}</span>
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={imageUploading} />
          </label>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {classes.length > 1 ? (
              <select
                value={selectedClassId || ""}
                onChange={(e) => {
                  setSelectedClassId(e.target.value)
                  router.replace(`/teacher/classes?classId=${encodeURIComponent(e.target.value)}`)
                }}
                className="text-lg font-bold border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-none focus:border-[#2E8282]"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            ) : (
              <h1 className="text-xl font-bold text-slate-800 dark:text-white">{selectedClass?.name || "Loading..."}</h1>
            )}
          </div>
          {!deleteConfirm ? (
            <button onClick={() => setDeleteConfirm(true)} className="flex items-center gap-1.5 text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Delete Class
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Are you sure?</span>
              <button onClick={handleDeleteClass} disabled={deleting} className="text-xs px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-50">
                {deleting ? "Deleting..." : "Yes, Delete"}
              </button>
              <button onClick={() => setDeleteConfirm(false)} className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>


      {/* Lessons */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <Link href={`/teacher/classes/${selectedClassId}/lessons`} className="flex items-center gap-1 group">
            <h2 className="text-base font-semibold text-slate-700 group-hover:text-[#2E8282] transition-colors">Lessons</h2>
            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-[#2E8282] transition-colors" />
          </Link>
          <Link href={`/manage/teacher/classes/${selectedClassId}/create-lesson`}>
            <button className="flex items-center gap-1.5 text-xs font-medium text-white bg-[#2E8282] hover:bg-[#1f6767] rounded-lg px-3 py-1.5 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Create Lesson
            </button>
          </Link>
        </div>
        <div className="flex flex-col gap-2">
          {lessons.length === 0 ? (
            <div className="w-full"><EmptyState message="No lessons yet. Create one to get started." /></div>
          ) : (
            lessons.map((lesson) => (
              <div key={lesson.id} className="flex items-center justify-between gap-3 px-4 py-3 border border-slate-200 dark:border-slate-700/50 rounded-xl bg-white dark:bg-[#0f1318]">
                <Link href={`/teacher/classes/${selectedClassId}/lessons/${lesson.id}`} className="flex-1 min-w-0 hover:opacity-75 transition-opacity">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{lesson.title}</p>
                  <p className="text-xs text-slate-400">{lesson.stepCount} step{lesson.stepCount === 1 ? "" : "s"}</p>
                </Link>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${lesson.isVisibleToStudents ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                    {lesson.isVisibleToStudents ? "Visible" : "Hidden"}
                  </span>
                  <button onClick={() => handleToggleVisibility(lesson)} title={lesson.isVisibleToStudents ? "Hide from students" : "Show to students"}
                    className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                    {lesson.isVisibleToStudents ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <Link href={`/manage/teacher/classes/${selectedClassId}/lessons/${lesson.id}/edit`}>
                    <button className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Student List */}
      <section>
        <div className="flex items-center gap-1 mb-4">
          <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">Student List</h2>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </div>
        <div className="flex flex-wrap gap-3 mb-4">
          {members.length === 0 ? (
            <div className="w-full"><EmptyState message="No students yet." /></div>
          ) : (
            members.map((m) => {
              const email = m.email || m.scholar_email || ""
              const name = m.full_name || email || "?"
              const color = getAvatarColor(name)
              const isRemoving = removingStudent === email
              return (
                <div key={email} className="flex flex-col items-center gap-1 group relative">
                  <div className={`w-12 h-12 rounded-full ${color} flex items-center justify-center text-white text-sm font-bold`}>
                    {getInitials(name)}
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 max-w-[56px] text-center truncate">{name.split(" ")[0]}</span>
                  <button
                    onClick={() => handleRemoveStudent(email)}
                    disabled={isRemoving}
                    title="Remove student"
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                  >
                    <UserMinus className="w-2.5 h-2.5" />
                  </button>
                </div>
              )
            })
          )}
        </div>
        {addStudentOpen ? (
          <div className="flex flex-col gap-2 max-w-xs">
            <input type="email" placeholder="Student email" value={addStudentEmail}
              onChange={(e) => setAddStudentEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddStudent()}
              className="text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#2E8282] bg-white" />
            {addStudentError && <p className="text-xs text-red-500">{addStudentError}</p>}
            <div className="flex gap-2">
              <button onClick={handleAddStudent} disabled={addStudentLoading}
                className="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#2E8282] text-white hover:bg-[#1f6767] transition-colors disabled:opacity-50">
                {addStudentLoading ? "Adding..." : "Add"}
              </button>
              <button onClick={() => { setAddStudentOpen(false); setAddStudentEmail(""); setAddStudentError("") }}
                className="px-4 py-1.5 rounded-lg text-xs font-medium border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddStudentOpen(true)}
            className="flex items-center gap-1 text-sm text-slate-600 border border-slate-300 rounded-full px-3 py-1.5 hover:bg-slate-50 transition-colors">
            Add Student <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </section>
    </div>
  )
}

export default function TeacherClassesPageWrapper() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400">Loading...</p>}>
      <TeacherClassesPage />
    </Suspense>
  )
}
