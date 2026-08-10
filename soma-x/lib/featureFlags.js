// Feature flags for functionality that's built and working but currently
// switched off product-side. Flip the flag back to re-enable — the
// underlying component/route/table stays intact, nothing is deleted.

// The post-registration "baseline diagnostic" quiz (components/sol/DiagnosticQuizModal.jsx)
// blocked every new scholar with a non-dismissible full-screen modal until they
// answered all 5 questions. Disabled because it delayed access to the platform
// and wasn't user-oriented. Re-enable by setting NEXT_PUBLIC_FEATURE_SOL_QUIZ_ENABLED=true.
export const SOL_QUIZ_ENABLED = process.env.NEXT_PUBLIC_FEATURE_SOL_QUIZ_ENABLED === "true";
