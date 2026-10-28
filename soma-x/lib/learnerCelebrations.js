"use client";

// When learners are celebrated, and what they're offered next:
// - handing in work (an assignment, a quiz): "well done", or a milestone (1st, 5th, 10th…),
//   with the next piece of work to do;
// - coming back after a while: "welcome back", with what's next.
import { useContext, useEffect } from "react";
import DataContext from "@/context/DataContext";
import { useLanguage } from "@/context/LanguageContext";
import { apiFetch } from "@/lib/api";
import { fill } from "@/lib/fill";
import { celebrate, MILESTONES } from "@/lib/celebrate";

const AWAY_MS = 8 * 60 * 60 * 1000; // "welcome back" after this long away
const lastSeenKey = (userId) => `somabox.lastSeen.${userId}`;
const milestonesKey = (userId) => `somabox.milestones.${userId}`;

const read = (key) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { window.localStorage.setItem(key, value); } catch { /* storage unavailable */ } };

/** The next piece of work to hand in (not this one), as a link, or null. */
function nextWork(summary, exceptAssignmentId) {
  const next = (summary?.outstanding || []).find((o) => o.status !== "submitted" && String(o.assignment_id) !== String(exceptAssignmentId));
  return next ? { title: next.title, href: `/course/${next.course_id}/assignments/${next.assignment_id}` } : null;
}

/**
 * After a learner hands in work. t: useLanguage().t; userId: the learner's id; title: the work's
 * title; assignmentId: to leave it out of "next".
 */
export async function celebrateWork({ t, userId, title, assignmentId }) {
  let summary = null;
  try { summary = await apiFetch("/users/me/assignment-summary"); } catch { /* celebrate without "next" */ }
  const next = nextWork(summary, assignmentId);
  const actions = [
    next ? { label: fill(t("learner.celebrate.next"), { title: next.title }), href: next.href } : null,
    { label: t("learner.celebrate.dashboard"), href: "/manage/scholar-dashboard" },
  ].filter(Boolean);

  // A milestone is celebrated once per learner and device.
  const count = Number(summary?.handed_in_count || 0);
  const seen = new Set(String(read(milestonesKey(userId)) || "").split(",").filter(Boolean).map(Number));
  if (MILESTONES.includes(count) && !seen.has(count)) {
    write(milestonesKey(userId), [...seen, count].join(","));
    celebrate({
      emoji: count === 1 ? "🌱" : "🏆",
      title: count === 1 ? t("learner.celebrate.firstTitle") : fill(t("learner.celebrate.milestoneTitle"), { n: count }),
      message: count === 1 ? t("learner.celebrate.firstMessage") : t("learner.celebrate.milestoneMessage"),
      actions,
    });
    return;
  }
  celebrate({
    emoji: "🎉",
    title: t("learner.celebrate.submittedTitle"),
    message: fill(next ? t("learner.celebrate.submittedNext") : t("learner.celebrate.submittedDone"), { title }),
    actions,
  });
}

/** Learners: "welcome back" when they return after a while away (once per return). */
export function useWelcomeBack() {
  const { user, authenticated } = useContext(DataContext);
  const { t } = useLanguage();
  const userId = user?.id;
  const isLearner = authenticated && user?.role === "scholar" && !user?.mustChangePassword;

  useEffect(() => {
    if (!isLearner || !userId) return undefined;
    const last = Number(read(lastSeenKey(userId)) || 0);
    write(lastSeenKey(userId), String(Date.now()));
    if (last && Date.now() - last > AWAY_MS) {
      apiFetch("/users/me/assignment-summary").catch(() => null).then((summary) => {
        const next = nextWork(summary);
        const name = String(user?.full_name || user?.fullName || "").split(" ")[0];
        celebrate({
          emoji: "👋",
          title: name ? fill(t("learner.celebrate.welcomeNamed"), { name }) : t("learner.celebrate.welcome"),
          message: next ? fill(t("learner.celebrate.welcomeNext"), { title: next.title }) : t("learner.celebrate.welcomeDone"),
          actions: next ? [{ label: t("learner.celebrate.start"), href: next.href }] : [{ label: t("learner.celebrate.dashboard"), href: "/manage/scholar-dashboard" }],
        });
      });
    }
    // Still here: keep "last seen" fresh, so a long visit doesn't count as being away.
    const timer = setInterval(() => write(lastSeenKey(userId), String(Date.now())), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [isLearner, userId]); // eslint-disable-line react-hooks/exhaustive-deps
}
