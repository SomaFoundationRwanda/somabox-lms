"use client";

import { useLanguage } from "@/context/LanguageContext";

// A real <table> for tabular data (admin lists, gradebooks). On narrow screens it scrolls
// horizontally inside its own box instead of the page.
//
// rowClassName?(row) -> string adds classes to a row (e.g. muted inactive rows).
// columns: [{ key, header, render?(row) -> node, className?, align?: 'left'|'right'|'center', hideOnMobile?, sortable? }]
// Sorting is optional and controlled: pass sort = { key, dir: 'asc'|'desc' } and onSort(key);
// sortable columns get a header button and aria-sort. The caller sorts the rows.
export default function DataTable({ columns, rows, rowKey = (r) => r.id, caption, empty, onRowClick, rowClassName, className = "", sort, onSort }) {
  const { t } = useLanguage();
  const emptyText = empty ?? t("course.common.nothingToShow") ?? "Nothing to show.";
  const alignClass = { right: "text-right", center: "text-center", left: "text-left" };
  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 ${className}`}>
      <table className="min-w-full text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-slate-50 dark:bg-slate-900/50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c) => {
              const sortable = !!(c.sortable && onSort);
              const active = sortable && sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sortable ? (active ? (sort.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
                  className={`px-3 py-2 font-semibold ${alignClass[c.align || "left"]} ${c.hideOnMobile ? "hidden md:table-cell" : ""} ${c.className || ""}`}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort(c.key)}
                      className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-900 dark:hover:text-white ${active ? "text-slate-900 dark:text-white" : ""}`}
                    >
                      {c.header}
                      <span aria-hidden="true" className="text-[11px]">{active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">{emptyText}</td></tr>
          ) : rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onRowClick(row); } } : undefined}
              className={`${onRowClick ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40 focus-visible:outline-none focus-visible:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-secondary)]" : ""} ${rowClassName ? rowClassName(row) || "" : ""}`}
            >
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2 align-middle ${alignClass[c.align || "left"]} ${c.hideOnMobile ? "hidden md:table-cell" : ""} ${c.className || ""}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
