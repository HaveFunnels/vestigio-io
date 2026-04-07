"use client";

// ──────────────────────────────────────────────
// ExportButton — CSV export for any table data
// ──────────────────────────────────────────────

export default function ExportButton({
  data,
  filename,
  label = "Export CSV",
}: {
  data: Record<string, any>[];
  filename: string;
  label?: string;
}) {
  function handleExport() {
    if (!data || data.length === 0) return;

    // Collect all keys from all rows to handle sparse data
    const keys = Array.from(
      data.reduce<Set<string>>((set, row) => {
        Object.keys(row).forEach((k) => set.add(k));
        return set;
      }, new Set<string>())
    );

    // Escape a CSV cell value
    function escapeCell(value: any): string {
      if (value == null) return "";
      const str = typeof value === "object" ? JSON.stringify(value) : String(value);
      // Wrap in quotes if the value contains commas, quotes, or newlines
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    const header = keys.map(escapeCell).join(",");
    const rows = data.map((row) =>
      keys.map((k) => escapeCell(row[k])).join(",")
    );
    const csv = [header, ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleExport}
      disabled={!data || data.length === 0}
      className="inline-flex items-center gap-1.5 rounded-lg border border-edge px-2.5 py-1.5 text-xs text-content-muted transition-colors hover:text-content-secondary disabled:cursor-not-allowed disabled:opacity-40"
    >
      <svg
        className="h-3.5 w-3.5"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
        />
      </svg>
      {label}
    </button>
  );
}
