"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

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

  return (
    <div className="overflow-x-auto rounded-md border border-edge">
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
  );
}
