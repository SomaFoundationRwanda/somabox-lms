// Props that make a non-button element (a drop zone, a table row) usable from the keyboard:
// focusable, announced as a button, and activated by Enter or Space like a real button.
// Prefer a real <button> or <a>; use this only where the element can't be one.
export function clickableProps(onActivate, label) {
  return {
    role: "button",
    tabIndex: 0,
    ...(label ? { "aria-label": label } : {}),
    onClick: onActivate,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return; // keys inside nested controls stay theirs
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onActivate(e);
      }
    },
  };
}

// The visible keyboard focus ring used across the app.
export const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0D9488] focus-visible:ring-offset-1";
