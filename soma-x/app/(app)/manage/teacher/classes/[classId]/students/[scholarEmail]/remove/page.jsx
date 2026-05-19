"use client";

import { Suspense } from "react";
import { useContext, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import DataContext from "@/context/DataContext";
import Unauthorized from "@/components/sections/Unauthorized";
import HeaderSection from "@/components/ui/HeaderSection";
import Typography from "@/components/ui/Typography";
import { Button } from "@/components/ui/button";

function RemoveClassStudentPage() {
  const { authenticated, unshiftString, SERVER_URL } = useContext(DataContext);
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const classId = String(params?.classId || "").trim();
  const scholarEmailParam = String(params?.scholarEmail || "").trim();
  const scholarEmail = useMemo(() => {
    try {
      return decodeURIComponent(scholarEmailParam);
    } catch {
      return scholarEmailParam;
    }
  }, [scholarEmailParam]);

  const studentName = String(searchParams?.get("name") || "").trim();

  const [confirmStage, setConfirmStage] = useState(1);
  const [removing, setRemoving] = useState(false);

  const teacherEmail = useMemo(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem("al");
    return stored ? unshiftString(stored) : "";
  }, [unshiftString]);

  const handleRemoveStudent = async () => {
    if (!SERVER_URL || !classId || !teacherEmail || !scholarEmail || removing) return;

    try {
      setRemoving(true);
      const response = await fetch(
        `${SERVER_URL}/classes/${classId}/members/${encodeURIComponent(scholarEmail)}?teacherEmail=${encodeURIComponent(teacherEmail)}`,
        { method: "DELETE" }
      );
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message || "Failed to remove student from class");
      }

      router.push(`/manage/teacher/classes?classId=${classId}`);
    } catch (error) {
      console.error("Remove student failed:", error);
      alert(error.message || "Failed to remove student from class");
    } finally {
      setRemoving(false);
    }
  };

  if (!authenticated) return <Unauthorized />;

  return (
    <div className="min-h-screen bg-slate-50 md:bg-transparent pb-12">
      <HeaderSection
        title="Remove Student"
        subtitle="This will remove the student from this class and clear their class-specific progress data."
      />

      <div className="px-4 md:px-0 mt-6 space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          {studentName ? <Typography className="font-semibold">{studentName}</Typography> : null}
          <Typography variant="muted" className="text-sm">{scholarEmail}</Typography>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          {confirmStage === 1 ? (
            <>
              <Typography variant="h4" color="accent">Confirmation 1 of 2</Typography>
              <Typography variant="muted" className="text-sm">
                Confirm you want to remove this student from the class.
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
                  onClick={() => setConfirmStage(2)}
                >
                  Continue
                </Button>
              </div>
            </>
          ) : (
            <>
              <Typography variant="h4" color="accent">Confirmation 2 of 2</Typography>
              <Typography variant="muted" className="text-sm">
                Final check: this student will be removed from the class now.
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
                  disabled={removing}
                  onClick={handleRemoveStudent}
                >
                  {removing ? "Removing..." : "Remove Student"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RemoveClassStudentPageWrapper() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400 p-4">Loading...</p>}>
      <RemoveClassStudentPage />
    </Suspense>
  );
}
