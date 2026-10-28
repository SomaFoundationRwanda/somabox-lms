"use client";

// Small celebrations for learners (handing work in, coming back, milestones): any screen calls
// celebrate(...) and the CelebrationHost in the app layout shows it.
//   celebrate({ title, message, actions: [{ label, href }] })
export const CELEBRATE_EVENT = "somabox:celebrate";

export function celebrate(detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CELEBRATE_EVENT, { detail }));
}

// Pieces of work handed in that are worth a bigger celebration.
export const MILESTONES = [1, 5, 10, 25, 50, 100];
