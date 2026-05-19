"use client";

import { Suspense } from "react";
import { useContext, useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import DataContext from "@/context/DataContext";
import Unauthorized from "@/components/sections/Unauthorized";
import HeaderSection from "@/components/ui/HeaderSection";
import Typography from "@/components/ui/Typography";
import Input from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useSearchParams } from "next/navigation";
import { AddUserDrawer } from "@/components/AddUserDrawer";
import { EmptyState } from "@/components/ui/empty-state";

function TeacherClassesPage() {
  const { authenticated, unshiftString, SERVER_URL } = useContext(DataContext);
  const searchParams = useSearchParams();

  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [classMembers, setClassMembers] = useState([]);
  const [classLessons, setClassLessons] = useState([]);

  const [form, setForm] = useState({
    name: "",
    grade: "",
    schedule: "",
    notes: "",
  });

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem("al");
    return stored ? unshiftString(stored) : "";
  }, [unshiftString]);

  const selectedClassFromQuery = useMemo(() => {
    return searchParams?.get("classId") || "";
  }, [searchParams]);

  const classRosterUsers = useMemo(() => {
    return classMembers
      .map((member) => ({
        id: member.user_id,
        email: member.email || member.scholar_email,
        full_name: member.full_name || "",
        display_name: member.full_name || member.email || member.scholar_email,
        role: member.role || "scholar",
      }))
      .filter((member) => member.id && member.email);
  }, [classMembers]);

  const loadClasses = async () => {
    if (!SERVER_URL) return;
    try {
      setLoading(true);
      const url = teacherEmail
        ? `${SERVER_URL}/classes?teacherEmail=${encodeURIComponent(teacherEmail)}`
        : `${SERVER_URL}/classes`;

      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to load classes");

      setClasses(data);

      if (data.length > 0) {
        if (selectedClassFromQuery && data.some((classRow) => classRow.id === selectedClassFromQuery)) {
          setSelectedClassId(selectedClassFromQuery);
        } else {
          setSelectedClassId((prev) => prev ?? data[0].id);
        }
      } else {
        setSelectedClassId(null);
        setSelectedClass(null);
      }
    } catch (error) {
      console.error("Load classes error:", error);
      alert(error.message || "Failed to load classes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) loadClasses();
  }, [authenticated, SERVER_URL, teacherEmail, selectedClassFromQuery]);

  const loadClassDetails = async (classId) => {
    if (!classId || !SERVER_URL || !teacherEmail) return;

    try {
      const [classResponse, membersResponse, lessonsResponse] = await Promise.all([
        fetch(`${SERVER_URL}/classes/${classId}`),
        fetch(`${SERVER_URL}/classes/${classId}/members?teacherEmail=${encodeURIComponent(teacherEmail)}`),
        fetch(`${SERVER_URL}/classes/${classId}/lessons?teacherEmail=${encodeURIComponent(teacherEmail)}`),
      ]);

      const classData = await classResponse.json();
      const membersData = await membersResponse.json();
      const lessonsData = await lessonsResponse.json();

      if (!classResponse.ok) throw new Error(classData.message || "Failed to load class details");
      if (!membersResponse.ok) throw new Error(membersData.message || "Failed to load class members");
      if (!lessonsResponse.ok) throw new Error(lessonsData.message || "Failed to load class lessons");

      setSelectedClass(classData);
      setClassMembers(membersData);
      setClassLessons(lessonsData);
    } catch (error) {
      console.error("Load class details error:", error);
    }
  };

  useEffect(() => {
    if (!selectedClassId || !SERVER_URL) {
      setSelectedClass(null);
      setClassMembers([]);
      setClassLessons([]);
      return;
    }

    loadClassDetails(selectedClassId);
  }, [selectedClassId, SERVER_URL, teacherEmail]);

  const handleCreateClass = async () => {
    if (!form.name.trim() || !form.grade.trim()) {
      alert("Class name and grade are required.");
      return;
    }

    if (!teacherEmail) {
      alert("Teacher identity missing. Please log in again.");
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(`${SERVER_URL}/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          grade: form.grade.trim(),
          schedule: form.schedule.trim(),
          notes: form.notes.trim(),
          teacherEmail,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to create class");

      setShowCreateForm(false);
      setForm({ name: "", grade: "", schedule: "", notes: "" });

      await loadClasses();
      setSelectedClassId(data.id);
    } catch (error) {
      console.error("Create class error:", error);
      alert(error.message || "Failed to create class");
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) return <Unauthorized />;

  return (
    <div className="min-h-screen bg-slate-50 md:bg-transparent pb-12">
      <HeaderSection
        title="Classes"
        subtitle="Create and manage classes. Select any class to view its details."
      />

      <div className="px-4 md:px-0 mt-6 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        <aside className="bg-white/70 border border-slate-200 rounded-2xl p-3 flex flex-col h-fit lg:self-start">
          <div className="px-2 py-2">
            <Typography variant="h4" color="accent">Your Classes</Typography>
          </div>

          <div className="flex flex-col gap-2 mt-2 max-h-[420px] overflow-y-auto pr-1">
            {classes.map((classItem) => (
              <button
                key={classItem.id}
                onClick={() => {
                  setSelectedClassId(classItem.id);
                  setShowCreateForm(false);
                }}
                className={`w-full text-left px-3.5 py-3 rounded-xl border transition-all ${
                  selectedClassId === classItem.id
                    ? "bg-accent-dark text-white border-accent-dark shadow-sm"
                    : "bg-white border-slate-200 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    <span className="font-semibold">{classItem.name}</span>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      selectedClassId === classItem.id
                        ? "bg-white/20 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {classItem.id}
                  </span>
                </div>
                <div className={`text-xs mt-1.5 flex items-center justify-between ${selectedClassId === classItem.id ? "text-white/80" : "text-slate-500"}`}>
                  <span>{classItem.grade}</span>
                  <span>{Number(classItem.students || 0)} students</span>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-auto pt-3">
            <Button onClick={() => setShowCreateForm(true)} className="w-full h-11 gap-2">
              <Plus className="w-4 h-4" />
              Create Class
            </Button>
          </div>
        </aside>

        <section className="bg-white/70 border border-slate-200 rounded-2xl p-6">
          {loading ? (
            <Typography variant="muted">Loading...</Typography>
          ) : showCreateForm ? (
            <div className="space-y-4">
              <Typography variant="h3" color="accent">Create New Class</Typography>

              <Input id="class-name" placeholder="Class name (e.g. P5 Science)" value={form.name}
                onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} />
              <Input id="class-grade" placeholder="Grade/Level (e.g. Primary 5)" value={form.grade}
                onChange={(value) => setForm((prev) => ({ ...prev, grade: value }))} />
              <Input id="class-schedule" placeholder="Schedule (e.g. Mon/Wed 08:00)" value={form.schedule}
                onChange={(value) => setForm((prev) => ({ ...prev, schedule: value }))} />
              <Input id="class-notes" placeholder="Notes" value={form.notes}
                onChange={(value) => setForm((prev) => ({ ...prev, notes: value }))} />

              <div className="flex gap-3 pt-2">
                <Button onClick={handleCreateClass}>Save Class</Button>
                <Button variant="outline" onClick={() => setShowCreateForm(false)}>Cancel</Button>
              </div>
            </div>
          ) : selectedClass ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-3">
                <Typography variant="h3" color="accent">{selectedClass.name}</Typography>
                <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-3 py-1.5 text-xs font-semibold whitespace-nowrap">
                  <span className="opacity-80 mr-1">Join code</span>
                  <span className="font-bold tracking-wide">{selectedClass.id}</span>
                </span>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Typography variant="h4" color="accent">Class Roster</Typography>
                  <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2.5 py-1 text-xs font-semibold">
                    {classRosterUsers.length} Student{classRosterUsers.length === 1 ? "" : "s"}
                  </span>
                </div>
                {classRosterUsers.length === 0 ? (
                  <div className="w-full"><EmptyState message="No scholars have joined yet." /></div>
                ) : (
                  <div className="w-full overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse min-w-[460px]">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="pb-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                            Student
                          </th>
                          <th className="pb-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                            Email
                          </th>
                          <th className="pb-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">
                            Manage
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {classRosterUsers.map((member) => (
                          <tr key={member.id} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="py-4 px-4">
                              <span className="font-medium text-slate-700">{member.display_name}</span>
                            </td>
                            <td className="py-4 px-4">
                              <span className="text-slate-600 text-sm">{member.email}</span>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2">
                                <AddUserDrawer
                                  user={member}
                                  restrictToLoginInfo
                                  onSuccess={() => loadClassDetails(selectedClass.id)}
                                  trigger={
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-9 px-4 rounded-lg bg-slate-100/50 hover:bg-accent-dark hover:text-white border-none transition-all font-bold"
                                    >
                                      Manage
                                    </Button>
                                  }
                                />
                                <Link
                                  href={`/manage/teacher/classes/${selectedClass.id}/students/${encodeURIComponent(member.email)}/remove?name=${encodeURIComponent(member.display_name || "")}`}
                                >
                                  <Button variant="outline" size="sm" className="h-9">
                                    Remove
                                  </Button>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-4 bg-white space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Typography variant="h4" color="accent">Class Lessons</Typography>
                    <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-700 px-2.5 py-1 text-xs font-semibold">
                      {classLessons.length}
                    </span>
                  </div>
                  <Link href={`/manage/teacher/classes/${selectedClass.id}/create-lesson`}>
                    <Button className="h-9">Create Lesson</Button>
                  </Link>
                </div>

                {classLessons.length === 0 ? (
                  <div className="w-full"><EmptyState message="No lessons available yet." /></div>
                ) : (
                  <div className="w-full overflow-x-auto scrollbar-hide">
                    <table className="w-full text-left border-collapse min-w-[860px]">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="pb-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Lesson</th>
                          <th className="pb-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Pages</th>
                          <th className="pb-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Progress</th>
                          <th className="pb-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Visibility</th>
                          <th className="pb-4 px-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Manage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {classLessons.map((lesson) => (
                          <tr key={lesson.id} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="py-4 px-4">
                              <Typography className="font-semibold">{lesson.title}</Typography>
                              <Typography variant="muted" className="text-xs">{lesson.created_at}</Typography>
                            </td>
                            <td className="py-4 px-4">
                              <Typography className="text-sm">{lesson.stepCount} page{lesson.stepCount === 1 ? "" : "s"}</Typography>
                            </td>
                            <td className="py-4 px-4">
                              <Typography className="text-sm">
                                Started: {Number(lesson.startedCount || 0)}/{Number((lesson.targetCount ?? lesson.totalStudents) || 0)}
                              </Typography>
                              <Typography variant="muted" className="text-xs">
                                Completed: {Number(lesson.completedCount || 0)}
                              </Typography>
                            </td>
                            <td className="py-4 px-4">
                              <Typography className="text-sm">
                                {lesson.isVisibleToStudents ? "Visible" : "Hidden"}
                              </Typography>
                            </td>
                            <td className="py-4 px-4">
                              <div className="flex items-center gap-2">
                                <Link href={`/manage/teacher/classes/${selectedClass.id}/lessons/${lesson.id}/edit`}>
                                  <Button variant="outline" className="h-8">Edit Lesson</Button>
                                </Link>
                                <Link href={`/manage/teacher/classes/${selectedClass.id}/lessons/${lesson.id}/delete`}>
                                  <Button variant="outline" className="h-8">
                                    <Trash2 className="w-4 h-4" />
                                    Delete Lesson
                                  </Button>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="w-full"><EmptyState message="No classes yet. Use Create Class to add your first class." /></div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function TeacherClassesPageWrapper() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400 p-4">Loading...</p>}>
      <TeacherClassesPage />
    </Suspense>
  );
}