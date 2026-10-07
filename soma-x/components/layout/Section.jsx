// A titled region of a page. Separated by spacing and an optional top rule, never a card
// border, so sections can hold lists or tables without nesting boxes.
export default function Section({ id, title, description, actions, divided = false, className = "", children }) {
  return (
    <section id={id} className={`${divided ? "pt-6 border-t border-slate-200 dark:border-slate-800" : ""} ${className}`}>
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            {title ? <h2 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
