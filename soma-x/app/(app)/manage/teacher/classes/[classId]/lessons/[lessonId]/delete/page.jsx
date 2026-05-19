"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import DataContext from "@/context/DataContext";
import Unauthorized from "@/components/sections/Unauthorized";
import HeaderSection from "@/components/ui/HeaderSection";
import Typography from "@/components/ui/Typography";
import { Button } from "@/components/ui/button";

export default function DeleteClassLessonPage() {
  const { authenticated, unshiftString, SERVER_URL } = useContext(DataContext);
  const router = useRouter();
  const params = useParams();
  const classId = String(params?.classId || "").trim();
  const lessonId = String(params?.lessonId || "").trim();

  const [lesson, setLesson] = useState(null);
  const [loadingLesson, setLoadingLesson] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmStage, setConfirmStage] = useState(1);

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem("al");
    return stored ? unshiftString(stored) : "";
  }, [unshiftString]);

  useEffect(() => {
    const loadLesson = async () => {
      if (!authenticated || !SERVER_URL || !classId || !lessonId || !teacherEmail) return;

      try {
        setLoadingLesson(true);
        const response = await fetch(
          `${SERVER_URL}/classes/${classId}/lessons/${lessonId}?teacherEmail=${encodeURIComponent(teacherEmail)}`
        );
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || "Failed to load lesson");
        setLesson(payload);
      } catch (error) {
        console.error("Load lesson for deletion failed:", error);
        alert(error.message || "Failed to load lesson");
      } finally {
        setLoadingLesson(false);
      }
    };

    loadLesson();
  }, [authenticated, SERVER_URL, classId, lessonId, teacherEmail]);

  const handleDeleteLesson = async () => {
    if (!classId || !lessonId || !teacherEmail || deleting) return;

    try {
      setDeleting(true);
      const response = await fetch(
        `${SERVER_URL}/classes/${classId}/lessons/${lessonId}?teacherEmail=${encodeURIComponent(teacherEmail)}`,
        { method: "DELETE" }
      );
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "Failed to delete lesson");
      router.push(`/manage/teacher/classes?classId=${classId}`);
    } catch (error) {
      console.error("Delete lesson failed:", error);
      alert(error.message || "Failed to delete lesson");
    } finally {
      setDeleting(false);
    }
  };

  if (!authenticated) return <Unauthorized />;

  return (
    <div className="min-h-screen bg-slate-50 md:bg-transparent pb-12">
      <HeaderSection
        title="Delete Lesson"
        subtitle="This action permanently removes the lesson and student progress tied to it."
      />

      <div className="px-4 md:px-0 mt-6 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          {loadingLesson ? (
            <Typography variant="muted">Loading lesson details...</Typography>
          ) : lesson ? (
            <>
              <Typography className="font-semibold">{lesson.title}</Typography>
              <Typography variant="muted" className="text-sm">
                {lesson.description || "No description"}
              </Typography>
              <Typography variant="muted" className="text-sm">
                Pages: {Number(lesson.stepCount || 0)}
              </Typography>
            </>
          ) : (
            <Typography variant="muted">Lesson not found.</Typography>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          {confirmStage === 1 ? (
            <>
              <Typography variant="h4" color="accent">Confirmation 1 of 2</Typography>
              <Typography variant="muted">
                Click continue to move to final confirmation. This helps prevent accidental deletion.
              </Typography>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push(`/manage/teacher/classes?classId=${classId}`)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!lesson || loadingLesson}
                  onClick={() => setConfirmStage(2)}
                >
                  Continue
                </Button>
              </div>
            </>
          ) : (
            <>
              <Typography variant="h4" color="accent">Confirmation 2 of 2</Typography>
              <Typography variant="muted">
                Final check: deleting this lesson is permanent and cannot be undone.
              </Typography>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmStage(1)}
                >
                  Back
                </Button>
                <Button
                  type="button"
                  disabled={!lesson || deleting || loadingLesson}
                  onClick={handleDeleteLesson}
                >
                  {deleting ? "Deleting..." : "Delete Lesson Permanently"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
