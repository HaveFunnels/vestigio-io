"use client";

import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// DataTable
//
// Renders a responsive table:
//   - md+ (≥768px): classic horizontal table.
//   - <md: stacked card-per-row layout. Pure CSS swap (Tailwind
//     md:hidden / hidden md:block) so there's no useMediaQuery
//     hydration mismatch — both layouts ship to the client and the
//     browser hides one. Cards are usable down to ~360px.
//
// Card layout uses the first column as the headline (it's almost
// always a title + badges) and stacks every other column as a
// label/value pair below. No API changes — existing callers don't
// have to opt in.
// ──────────────────────────────────────────────

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  getRowKey?: (row: T) => string;
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  onRowClick,
  emptyMessage,
  getRowKey,
}: DataTableProps<T>) {
  const t = useTranslations("console.data_table");
  const headColumn = columns[0];
  const tailColumns = columns.slice(1);

  return (
    <>
      {/* ── md+ : horizontal table ── */}
      <div className="hidden overflow-x-auto rounded-md border border-edge md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-edge bg-surface-inset/60">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-content-muted ${col.className || ""}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-content-faint">
                  {emptyMessage || t("no_data")}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr
                  key={getRowKey ? getRowKey(row) : i}
                  onClick={() => onRowClick?.(row)}
                  className={`border-b border-edge transition-colors ${
                    onRowClick ? "cursor-pointer hover:bg-surface-card-hover" : ""
                  }`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-content-tertiary ${col.className || ""}`}>
                      {col.render ? col.render(row) : String(row[col.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── <md : stacked cards ── */}
      <div className="space-y-2 md:hidden">
        {data.length === 0 ? (
          <div className="rounded-md border border-edge bg-surface-card px-4 py-8 text-center text-sm text-content-faint">
            {emptyMessage || t("no_data")}
          </div>
        ) : (
          data.map((row, i) => (
            <div
              key={getRowKey ? getRowKey(row) : i}
              onClick={() => onRowClick?.(row)}
              className={`rounded-xl border border-edge bg-surface-card p-3 ${
                onRowClick ? "cursor-pointer active:scale-[0.99] active:bg-surface-card-hover" : ""
              }`}
            >
              {headColumn && (
                <div className="mb-2 text-[14px] font-medium leading-snug text-content">
                  {headColumn.render ? headColumn.render(row) : String(row[headColumn.key] ?? "")}
                </div>
              )}
              {tailColumns.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                  {tailColumns.map((col) => (
                    <div key={col.key} className="min-w-0">
                      <dt className="text-[9px] font-semibold uppercase tracking-wider text-content-faint">
                        {col.label}
                      </dt>
                      <dd className="mt-0.5 truncate text-content-secondary">
                        {col.render ? col.render(row) : String(row[col.key] ?? "")}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
