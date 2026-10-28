import Link from "next/link";

// A bordered list whose rows are divided by lines: the default way to show a collection.
export function List({ children, className = "", label }) {
  return (
    <ul aria-label={label} className={`divide-y divide-line rounded-xl border border-line bg-surface ${className}`}>
      {children}
    </ul>
  );
}

// One row: optional leading icon, title (optionally a link), secondary line, meta on the
// right, and trailing actions. Rows are never cards.
export default function ListRow({ icon, title, href, subtitle, meta, actions, tone = "default", className = "", indent = 0 }) {
  const tones = {
    default: "",
    muted: "opacity-70",
    warning: "bg-warning-soft/60",
    danger: "bg-danger-soft/60",
  };
  const titleNode = href ? (
    <Link href={href} className="font-semibold text-fg hover:text-brand-fg hover:underline truncate">{title}</Link>
  ) : (
    <span className="font-semibold text-fg truncate">{title}</span>
  );
  return (
    <li className={`flex items-center gap-3 px-3 py-2.5 text-ui ${tones[tone] || ""} ${className}`} style={indent ? { paddingLeft: `${0.75 + indent * 1.25}rem` } : undefined}>
      {icon ? <span className="shrink-0 text-fg-subtle">{icon}</span> : null}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">{titleNode}</div>
        {subtitle ? <div className="mt-0.5 text-caption text-fg-subtle truncate">{subtitle}</div> : null}
      </div>
      {meta ? <div className="hidden sm:flex shrink-0 items-center gap-2 text-caption text-fg-subtle">{meta}</div> : null}
      {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
    </li>
  );
}
