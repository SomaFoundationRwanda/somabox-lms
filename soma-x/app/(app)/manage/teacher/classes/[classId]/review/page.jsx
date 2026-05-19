"use client";

import { useContext, useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Clock, AlertCircle } from "lucide-react";
import DataContext from "@/context/DataContext";
import Unauthorized from "@/components/sections/Unauthorized";
import HeaderSection from "@/components/ui/HeaderSection";
import Typography from "@/components/ui/Typography";
import { Button } from "@/components/ui/button";

export default function ReviewLessonsPage() {
  const { authenticated, unshiftString, SERVER_URL } = useContext(DataContext);
  const router = useRouter();
  const params = useParams();
  const classId = String(params?.classId || "");

  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(false);

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem("al");
    return stored ? unshiftString(stored) : "";
  }, [unshiftString]);

  useEffect(() => {
    if (!authenticated || !teacherEmail || !classId || !SERVER_URL) return;

    const loadCompletedLessons = async () => {
      try {
        setLoading(true);
        // Fetch all lessons for the class
        const response = await fetch(
          `${SERVER_URL}/classes/${classId}?teacherEmail=${encodeURIComponent(teacherEmail)}`
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.message || "Failed to load lessons");
        }

        // Filter to only completed lessons (where submissions exist)
        const classData = payload.class || payload;
        const completedLessons = (classData.lessons || []).filter((lesson) => lesson.completed_submissions > 0);

        setLessons(completedLessons);
      } catch (error) {
        console.error("Load lessons failed:", error);
      } finally {
        setLoading(false);
      }
    };

    if (authenticated) {
      loadCompletedLessons();
    }
  }, [authenticated, SERVER_URL, classId, teacherEmail]);

  if (!authenticated) {
    return <Unauthorized />;
  }

  return (
    <div className="min-h-screen flex-1 bg-gradient-to-br from-slate-50 to-slate-100">
      <HeaderSection
        title="Review Completed Lessons"
        subtitle="Grade student responses and provide feedback"
        breadcrumbs={[
          { label: "Classes", href: "/manage/teacher/classes" },
          { label: "Class", href: `/manage/teacher/classes/${classId}` },
          { label: "Review", active: true }
        ]}
      />

      <main className="flex-1 py-6 px-4 md:px-6">
        <div className="max-w-6xl mx-auto">
          <Button
            onClick={() => router.back()}
            className="mb-6 gap-2"
            variant="ghost"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>

          {loading ? (
            <div className="text-center py-12">
              <Typography variant="body" color="muted">
                Loading lessons...
              </Typography>
            </div>
          ) : lessons.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-400" />
              <Typography variant="body" color="muted">
                No completed lessons yet. Students need to submit their work first.
              </Typography>
            </div>
          ) : (
            <div className="space-y-4">
              {lessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="bg-white rounded-xl border border-slate-200 hover:border-accent-dark/30 hover:shadow-md transition-all p-4 md:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <Typography variant="h4" className="mb-2">
                        {lesson.title}
                      </Typography>
                      <Typography variant="body" color="muted" className="mb-4">
                        {lesson.description}
                      </Typography>
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle className="w-4 h-4 text-green-600" />
                          <span className="text-green-700 font-medium">
                            {lesson.completed_submissions} submitted
                          </span>
                        </div>
                        {lesson.graded_count > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <CheckCircle className="w-4 h-4 text-blue-600" />
                            <span className="text-blue-700 font-medium">
                              {lesson.graded_count} graded
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      onClick={() =>
                        router.push(
                          `/manage/teacher/classes/${classId}/review/${lesson.id}`
                        )
                      }
                      className="whitespace-nowrap"
                    >
                      Review & Grade
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
