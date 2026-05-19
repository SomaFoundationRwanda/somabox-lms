"use client";

import { useContext, useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BookOpen, AlertCircle } from "lucide-react";
import DataContext from "@/context/DataContext";
import Unauthorized from "@/components/sections/Unauthorized";
import HeaderSection from "@/components/ui/HeaderSection";
import Typography from "@/components/ui/Typography";
import { Button } from "@/components/ui/button";

export default function GradingPage() {
  const { authenticated, unshiftString, SERVER_URL } = useContext(DataContext);
  const router = useRouter();

  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedClass, setExpandedClass] = useState(null);

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem("al");
    return stored ? unshiftString(stored) : "";
  }, [unshiftString]);

  useEffect(() => {
    if (!authenticated || !teacherEmail || !SERVER_URL) return;

    const loadClasses = async () => {
      try {
        setLoading(true);
        // Fetch all classes for this teacher
        const response = await fetch(
          `${SERVER_URL}/classes?teacherEmail=${encodeURIComponent(teacherEmail)}`
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.message || "Failed to load classes");
        }

        // For each class, fetch lessons and filter to those with submissions
        const classesWithLessons = [];
        for (const classData of payload) {
          const lessonsResponse = await fetch(
            `${SERVER_URL}/classes/${classData.id}/lessons?teacherEmail=${encodeURIComponent(teacherEmail)}`
          );
          const lessons = await lessonsResponse.json();

          // Filter to only lessons with submissions
          const completedLessons = lessons.filter(
            (lesson) => lesson.completed_submissions > 0
          );

          if (completedLessons.length > 0) {
            classesWithLessons.push({
              ...classData,
              completedLessons
            });
          }
        }

        setClasses(classesWithLessons);
      } catch (error) {
        console.error("Load classes failed:", error);
      } finally {
        setLoading(false);
      }
    };

    if (authenticated) {
      loadClasses();
    }
  }, [authenticated, SERVER_URL, teacherEmail]);

  if (!authenticated) {
    return <Unauthorized />;
  }

  return (
    <div className="min-h-screen flex-1 bg-gradient-to-br from-slate-50 to-slate-100">
      <HeaderSection
        title="Grade Student Submissions"
        subtitle="Review and grade student responses to lessons"
        breadcrumbs={[
          { label: "Teacher Portal", href: "/manage/teacher" },
          { label: "Grading", active: true }
        ]}
      />

      <main className="flex-1 py-6 px-4 md:px-6">
        <div className="max-w-4xl mx-auto">
          {loading ? (
            <div className="text-center py-12">
              <Typography variant="body" color="muted">
                Loading classes and submissions...
              </Typography>
            </div>
          ) : classes.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 text-slate-400" />
              <Typography variant="body" color="muted">
                No classes with student submissions yet.
              </Typography>
              <Typography variant="body" color="muted" className="text-sm mt-2">
                Once students submit their lessons, they will appear here.
              </Typography>
            </div>
          ) : (
            <div className="space-y-4">
              {classes.map((classData) => (
                <div key={classData.id} className="bg-white rounded-xl border border-slate-200">
                  <button
                    onClick={() =>
                      setExpandedClass(expandedClass === classData.id ? null : classData.id)
                    }
                    className="w-full p-6 hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <BookOpen className="w-5 h-5 text-blue-600" />
                          <Typography variant="h4">
                            {classData.name}
                          </Typography>
                          <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-medium">
                            {classData.completedLessons.length} lessons
                          </span>
                        </div>
                        <Typography variant="body" color="muted" className="text-sm">
                          Grade: {classData.grade} • {classData.students} students
                        </Typography>
                      </div>
                      <ArrowRight
                        className={`w-5 h-5 text-slate-400 transition-transform ${
                          expandedClass === classData.id ? "rotate-90" : ""
                        }`}
                      />
                    </div>
                  </button>

                  {expandedClass === classData.id && (
                    <div className="border-t border-slate-200 divide-y divide-slate-200">
                      {classData.completedLessons.map((lesson) => (
                        <div key={lesson.id} className="p-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1">
                              <Typography variant="body" className="font-medium mb-1">
                                {lesson.title}
                              </Typography>
                              <div className="flex items-center gap-4 text-sm text-slate-600">
                                <span>{lesson.completed_submissions} submitted</span>
                                {lesson.graded_count > 0 && (
                                  <span className="text-green-600 font-medium">
                                    {lesson.graded_count} graded
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button
                              onClick={() =>
                                router.push(
                                  `/manage/teacher/classes/${classData.id}/review/${lesson.id}`
                                )
                              }
                              size="sm"
                            >
                              Grade
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
