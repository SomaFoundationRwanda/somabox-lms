"use client";

// The pages visited in this tab since the app loaded, so a Back button can tell whether going
// back stays inside the app (else it goes up a level instead of leaving the site or doing
// nothing). Module state lives across client-side navigations; a full reload starts over.
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const stack = [];

/** Mounted once, in the app layout. Back to the page before pops; anything else pushes. */
export function useTrackPages() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname || stack[stack.length - 1] === pathname) return;
    if (stack[stack.length - 2] === pathname) stack.pop();
    else stack.push(pathname);
  }, [pathname]);
}

/** Whether the browser's previous page is one of the app's. */
export const canGoBackInApp = () => stack.length > 1;
