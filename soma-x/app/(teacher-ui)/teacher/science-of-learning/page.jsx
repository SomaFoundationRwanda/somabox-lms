import { redirect } from "next/navigation"

// This standalone "studio" page boasted about the pedagogical framework itself
// rather than applying it. The underlying structure is now baked directly into
// course/module design instead of living in a separate tab.
export default function ScienceOfLearningRedirect() {
  redirect("/teacher/dashboard")
}
