"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Compass, Users } from "lucide-react";
import DataContext from "@/context/DataContext";
import AsyncListState from "@/components/course/AsyncListState";
import { useGuestGate } from "@/components/guest/GuestGate";
import { useLanguage } from "@/context/LanguageContext";
import { fill } from "@/lib/fill";

export default function DiscoverCoursesPage() {
  const router = useRouter();
  const { SERVER_URL, user } = useContext(DataContext);
  const [courses, setCourses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [joiningId, setJoiningId] = useState(null);
  const { t } = useLanguage();
  // Guests can see public courses; joining one needs an account.
  const { isGuest, requireAccount } = useGuestGate();
  // Back from signing up to join a course: ?join=<id> points it out (joining stays a click).
  const [highlightId, setHighlightId] = useState(null);

  const userEmail = user?.email || "";

  const load = useCallback(async () => {
    if (!SERVER_URL) return;
    try {
      setLoading(true);
      setError("");
      const res = await fetch(`${SERVER_URL}/courses/public`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.message || t("learner.discover.loadFailed"));
      setCourses(payload.courses || []);
    } catch (err) {
      setError(err.message || t("learner.discover.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [SERVER_URL, t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isGuest || !courses?.length) return;
    let joinId = null;
    try { joinId = new URLSearchParams(window.location.search).get("join"); } catch { /* ignore */ }
    if (!joinId) return;
    setHighlightId(joinId);
    window.history.replaceState(null, "", window.location.pathname);
    requestAnimationFrame(() => {
      document.getElementById(`course-${joinId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [isGuest, courses]);

  const join = async (courseId) => {
    if (!requireAccount(`/discover-courses?join=${encodeURIComponent(courseId)}`)) return;
    if (!userEmail) return;
    setJoiningId(courseId);
    try {
      const res = await fetch(`${SERVER_URL}/courses/${courseId}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).message || t("learner.discover.joinFailed"));
      router.push(`/course/${courseId}/home`);
    } catch (err) {
      setError(err.message || t("learner.discover.joinFailed"));
      setJoiningId(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-24 md:pb-8">
      <div className="flex items-center justify-between pl-12 pr-4 md:px-6 py-3 bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-slate-500" />
          <div>
            <h1 className="text-[17px] font-bold text-slate-900">{t("shell.nav.discoverCourses")}</h1>
            <p className="text-[11px] text-slate-600 hidden sm:block">{t("learner.discover.subtitle")}</p>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6">
        <AsyncListState
          loading={loading}
          error={error}
          data={courses}
          onRetry={load}
          emptyMessage={t("learner.discover.empty")}
        >
          {(list) => (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {list.map((course) => (
                <div
                  key={course.id}
                  id={`course-${course.id}`}
                  className={`rounded-xl border bg-white overflow-hidden flex flex-col ${String(course.id) === highlightId ? "border-[#203A3A] ring-2 ring-[#203A3A]/40" : "border-slate-200"}`}
                >
                  {course.coverImageUrl ? (
                    <img src={`${SERVER_URL}${course.coverImageUrl}`} alt={course.title} className="w-full h-28 object-cover" />
                  ) : (
                    <div className="w-full h-28 bg-slate-100 flex items-center justify-center">
                      <Compass className="w-6 h-6 text-slate-300" />
                    </div>
                  )}
                  <div className="p-4 flex flex-col gap-2 flex-1">
                    <h2 className="text-sm font-bold text-slate-900 truncate">{course.title}</h2>
                    {course.grade ? <span className="text-[10px] font-semibold uppercase text-slate-500 bg-slate-100 rounded-full px-2 py-0.5 w-fit">{course.grade}</span> : null}
                    {course.description ? <p className="text-xs text-slate-600 line-clamp-2">{course.description}</p> : null}
                    <div className="flex items-center gap-1 text-xs text-slate-400 mt-auto pt-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>{fill(t(course.studentCount === 1 ? "learner.discover.oneEnrolled" : "learner.discover.nEnrolled"), { n: course.studentCount })}</span>
                    </div>
                    <button
                      onClick={() => join(course.id)}
                      disabled={joiningId === course.id}
                      className="mt-1 text-xs font-semibold text-white bg-[#203A3A] rounded-lg px-3 py-2 disabled:opacity-50"
                    >
                      {isGuest ? t("guest.signUpToJoin") : joiningId === course.id ? t("learner.discover.joining") : t("learner.discover.join")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AsyncListState>
      </div>
    </div>
  );
}
