"use client";

import { useEffect, useRef, useState } from "react";

export function usePageScrollTracker({ SERVER_URL, courseId, pageId, userEmail, initialView }) {
  const [completed, setCompleted] = useState(Boolean(initialView?.completed));
  const [scrollPct, setScrollPct] = useState(Number(initialView?.scroll_pct_reached) || 0);
  const maxScrollRef = useRef(Number(initialView?.scroll_pct_reached) || 0);

  useEffect(() => {
    if (initialView) {
      setCompleted(Boolean(initialView.completed));
      setScrollPct(Number(initialView.scroll_pct_reached) || 0);
      maxScrollRef.current = Number(initialView.scroll_pct_reached) || 0;
    }
  }, [initialView]);

  useEffect(() => {
    if (!SERVER_URL || !courseId || !pageId || !userEmail) return;

    let timeoutId = null;

    const reportView = async (pct) => {
      try {
        const res = await fetch(`${SERVER_URL}/courses/${courseId}/pages/${pageId}/view`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scrollPct: pct }),
        });
        const data = await res.json();
        if (res.ok) {
          if (data.completed) setCompleted(true);
          setScrollPct(data.scroll_pct_reached || pct);
        }
      } catch (err) {
        console.error("Failed to report page scroll view:", err);
      }
    };

    // Initial page load report (e.g. 5% viewed)
    reportView(Math.max(5, maxScrollRef.current));

    const handleScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) {
        // Short page, 100% viewed
        if (maxScrollRef.current < 100) {
          maxScrollRef.current = 100;
          reportView(100);
        }
        return;
      }

      const currentPct = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100));

      if (currentPct > maxScrollRef.current) {
        maxScrollRef.current = currentPct;
        setScrollPct(currentPct);

        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
          reportView(currentPct);
        }, 500);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [SERVER_URL, courseId, pageId, userEmail]);

  return { completed, scrollPct };
}
