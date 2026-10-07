"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import DataContext from "@/context/DataContext";
import { EmptyState } from "@/components/ui/empty-state";
import HeaderSection from "@/components/ui/HeaderSection";
import { Button } from "@/components/ui/button";

export default function ScholarCoursesPage() {
  const { SERVER_URL, user } = useContext(DataContext);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [courseCode, setCourseCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);

  const scholarEmail = user?.email || "";

  const load = async () => {
    if (!SERVER_URL || !scholarEmail) return;
    setLoading(true);
    const res = await fetch(`${SERVER_URL}/courses/mine`);
    if (res.ok) setCourses(await res.json());
    setLoading(false);
  };

  useEffect(() => { load(); }, [SERVER_URL, scholarEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleJoin = async () => {
    if (!courseCode.trim()) return;
    setJoinError("");
    setJoinLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseCode.trim()}/enroll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) { setJoinError(data.message || "Failed to join course"); return; }
      setCourseCode("");
      setJoining(false);
      load();
    } catch {
      setJoinError("Something went wrong");
    } finally {
      setJoinLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 md:bg-transparent pb-12">
      <HeaderSection title="My Courses" subtitle="Courses you're enrolled in." />
      <div className="px-4 md:px-0 mt-6 space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setJoining((v) => !v)} className="h-9 gap-1.5">
            <Plus className="w-4 h-4" /> Join a Course
          </Button>
        </div>

        {joining ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <input
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder="6-digit course code"
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-accent-dark"
            />
            <button onClick={handleJoin} disabled={joinLoading} className="text-xs font-semibold text-white bg-accent-dark rounded-lg px-3 py-2 disabled:opacity-50">
              {joinLoading ? "Joining..." : "Join"}
            </button>
          </div>
        ) : null}
        {joinError ? <p className="text-xs text-rose-600">{joinError}</p> : null}

        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : courses.length === 0 ? (
          <EmptyState message="You're not enrolled in any courses yet. Ask your teacher for a course code." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {courses.map((course) => (
              <Link key={course.id} href={`/course/${course.id}/home`} className="block border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow">
                <div className="w-full h-32 bg-slate-100 relative">
                  <Image
                    src={course.coverImageUrl ? `${SERVER_URL}${course.coverImageUrl}` : "/imageFallback.png"}
                    alt={course.title}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
                <div className="p-4">
                  <p className="text-base font-semibold text-slate-700 mb-1">{course.title}</p>
                  <p className="text-xs text-slate-600">{course.grade}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
