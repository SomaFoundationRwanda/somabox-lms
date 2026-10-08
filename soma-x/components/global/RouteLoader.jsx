"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Loader from "@/components/ui/Loader";

// Short waits don't flash the loader; very long ones (a dropped link) don't leave it stuck.
const SHOW_AFTER_MS = 150;
const GIVE_UP_AFTER_MS = 20000;

/**
 * The page-change loader: the SOMABOX logo in the centre of the screen while the app moves to
 * another page. Starts when someone follows a link inside the app (or code calls
 * startRouteLoading()), and ends when the new page's address is showing.
 */
function RouteLoaderInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const timers = useRef({ show: null, giveUp: null });

  const stop = () => {
    clearTimeout(timers.current.show);
    clearTimeout(timers.current.giveUp);
    setVisible(false);
  };

  // The new page is showing.
  useEffect(() => {
    stop();
  }, [pathname, searchParams]);

  useEffect(() => {
    const start = () => {
      clearTimeout(timers.current.show);
      clearTimeout(timers.current.giveUp);
      timers.current.show = setTimeout(() => setVisible(true), SHOW_AFTER_MS);
      timers.current.giveUp = setTimeout(() => setVisible(false), GIVE_UP_AFTER_MS);
    };

    const onClick = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!anchor || anchor.target && anchor.target !== "_self" || anchor.hasAttribute("download")) return;
      let url;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      const sameRoute = url.pathname === window.location.pathname && url.search === window.location.search;
      if (sameRoute) return; // in-page anchors (#section) and links to the current page
      start();
    };

    window.addEventListener("click", onClick, true);
    window.addEventListener("somabox:route-loading", start);
    return () => {
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("somabox:route-loading", start);
      clearTimeout(timers.current.show);
      clearTimeout(timers.current.giveUp);
    };
  }, []);

  return visible ? <Loader variant="overlay" /> : null;
}

export default function RouteLoader() {
  return (
    <Suspense fallback={null}>
      <RouteLoaderInner />
    </Suspense>
  );
}

/** For code that navigates with router.push/replace: shows the loader until the page changes. */
export function startRouteLoading() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("somabox:route-loading"));
}
