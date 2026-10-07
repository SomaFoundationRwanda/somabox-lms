// A real <table> for tabular data (admin lists, gradebooks). On narrow screens it scrolls
// horizontally inside its own box instead of the page.
//
// rowClassName?(row) -> string adds classes to a row (e.g. muted inactive rows).
// columns: [{ key, header, render?(row) -> node, className?, align?: 'left'|'right'|'center', hideOnMobile? }]
export default function DataTable({ columns, rows, rowKey = (r) => r.id, caption, empty = "Nothing to show.", onRowClick, rowClassName, className = "" }) {
  const alignClass = { right: "text-right", center: "text-center", left: "text-left" };
  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 ${className}`}>
      <table className="min-w-full text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="bg-slate-50 dark:bg-slate-900/50 text-[11px] uppercase tracking-wide text-slate-500">
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-3 py-2 font-semibold ${alignClass[c.align || "left"]} ${c.hideOnMobile ? "hidden md:table-cell" : ""} ${c.className || ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="px-3 py-6 text-center text-slate-500">{empty}</td></tr>
          ) : rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`${onRowClick ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/40" : ""} ${rowClassName ? rowClassName(row) || "" : ""}`}
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
