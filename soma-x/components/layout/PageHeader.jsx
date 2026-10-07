import Explainer from "@/components/help/Explainer";

// Top of a page: title, optional description and meta line, and actions on the right.
// Plain band, not a card. Use once per page. `help` is an explainer key (e.g. "pages.grades")
// shown as "What is this?" next to the title.
export default function PageHeader({ title, description, eyebrow, meta, actions, help, children }) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="text-[11px] font-bold uppercase tracking-wider text-[#0D9488]">{eyebrow}</p> : null}
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white leading-tight">{title}</h1>
          {help ? <Explainer k={help} /> : null}
        </div>
        {description ? <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-2xl">{description}</p> : null}
        {meta ? <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">{meta}</div> : null}
        {children}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </header>
  );
}
