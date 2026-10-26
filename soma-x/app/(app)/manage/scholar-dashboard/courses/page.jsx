"use client";

import { useContext, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus } from "lucide-react";
import DataContext from "@/context/DataContext";
import { EmptyState } from "@/components/ui/empty-state";
import HeaderSection from "@/components/ui/HeaderSection";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/context/LanguageContext";
import Loader from "@/components/ui/Loader";
import { useRouter } from "next/navigation";
import { startRouteLoading } from "@/components/global/RouteLoader";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, getErrorMessage } from "@/lib/api";
import { queryKeys } from "@/lib/queryKeys";

export default function ScholarCoursesPage() {
  const { SERVER_URL, user } = useContext(DataContext);
  const { t } = useLanguage();
  const router = useRouter();
  const [joining, setJoining] = useState(false);
  const [courseCode, setCourseCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [joinLoading, setJoinLoading] = useState(false);

  const scholarEmail = user?.email || "";

  // The same kept list as every other "my courses" screen.
  const queryClient = useQueryClient();
  const mine = useQuery({ queryKey: queryKeys.myCourses, queryFn: () => apiFetch("/courses/mine"), enabled: !!scholarEmail });
  const courses = Array.isArray(mine.data) ? mine.data : [];
  const loading = mine.isPending;

  const handleJoin = async () => {
    if (!courseCode.trim()) return;
    setJoinError("");
    setJoinLoading(true);
    try {
      // The code the teacher gives out (People > Join code), as on Discover courses.
      let data;
      try {
        data = await apiFetch("/courses/join-by-code", { method: "POST", json: { code: courseCode } });
      } catch (err) {
        setJoinError((err?.code && t(`learner.discover.code.errors.${err.code}`)) || err?.body?.message || (err?.status === 0 ? getErrorMessage(err, t) : t("learner.discover.joinFailed")));
        return;
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.courses });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      setCourseCode("");
      setJoining(false);
      startRouteLoading();
      router.push(`/course/${data.courseId}/home`);
    } catch {
      setJoinError(t("shell.common.somethingWrong"));
    } finally {
      setJoinLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 md:bg-transparent pb-12">
      <HeaderSection title={t("learner.dashboard.myCourses")} subtitle={t("learner.courses.subtitle")} />
      <div className="px-4 md:px-0 mt-6 space-y-4">
        <div className="flex justify-end">
          <Button onClick={() => setJoining((v) => !v)} className="h-9 gap-1.5">
            <Plus className="w-4 h-4" /> {t("learner.courses.joinCourse")}
          </Button>
        </div>

        {joining ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
            <input aria-label={t("learner.discover.code.title")}
              value={courseCode}
              onChange={(e) => setCourseCode(e.target.value)}
              placeholder={t("learner.discover.code.placeholder")}
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-accent-dark"
            />
            <button onClick={handleJoin} disabled={joinLoading} className="text-xs font-semibold text-white bg-accent-dark rounded-lg px-3 py-2 disabled:opacity-50">
              {joinLoading ? t("learner.discover.joining") : t("learner.courses.join")}
            </button>
          </div>
        ) : null}
        {joinError ? <p className="text-xs text-rose-600">{joinError}</p> : null}

        {loading ? (
          <Loader variant="page" />
        ) : courses.length === 0 ? (
          <EmptyState message={t("learner.courses.empty")} />
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
