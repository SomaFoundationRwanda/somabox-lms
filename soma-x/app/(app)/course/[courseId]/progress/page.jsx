"use client";

import MyProgress from "@/components/progress/MyProgress";

// A learner's own progress in the course. Staff and admins are sent to the class Insights by the
// course layout; observers don't have progress of their own.
export default function ProgressPage() {
  return <MyProgress sectionKey="progress" />;
}
