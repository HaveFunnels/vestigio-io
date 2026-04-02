"use client";

import { useCallback, useEffect, useState } from "react";

type PlatformError = {
  id: string;
  errorType: string;
  message: string;
  stackTrace: string | null;
  endpoint: string | null;
  method: string | null;
  statusCode: number | null;
  userId: string | null;
  userEmail: string | null;
  organizationId: string | null;
  requestBody: string | null;
  correlationId: string | null;
  severity: string;
  resolved: boolean;
  createdAt: string;
};

type ErrorGroup = {
  errorType: string;
  count: number;
  lastOccurrence: string;
};

type ErrorResponse = {
  errors: PlatformError[];
  total: number;
  limit: number;
  offset: number;
  groupedByType: ErrorGroup[];
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  error: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminErrorsPage() {
  const [data, setData] = useState<ErrorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{
    severity: string;
    resolved: string;
    endpoint: string;
  }>({ severity: "", resolved: "false", endpoint: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const limit = 30;

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter.severity) params.set("severity", filter.severity);
      if (filter.resolved) params.set("resolved", filter.resolved);
      if (filter.endpoint) params.set("endpoint", filter.endpoint);
      params.set("limit", String(limit));
      params.set("offset", String(page * limit));

      const res = await fetch(`/api/admin/errors?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  const resolveSelected = async () => {
    if (selectedIds.size === 0) return;
    await fetch("/api/admin/errors", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    setSelectedIds(new Set());
    fetchErrors();
  };

  const purgeOld = async () => {
    if (!confirm("Purge errors older than 14 days?")) return;
    await fetch("/api/admin/errors?olderThanDays=14", { method: "DELETE" });
    fetchErrors();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Error Tracking</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Platform-wide error monitoring. {data ? `${data.total} total errors.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={resolveSelected}
              className="rounded border border-emerald-700 bg-emerald-900/50 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-900"
            >
              Resolve ({selectedIds.size})
            </button>
          )}
          <button
            onClick={purgeOld}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700"
          >
            Purge 14d+
          </button>
          <button
            onClick={fetchErrors}
            className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error type summary */}
      {data?.groupedByType && data.groupedByType.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {data.groupedByType.slice(0, 4).map((g) => (
            <div
              key={g.errorType}
              className="cursor-pointer rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 hover:border-zinc-700"
              onClick={() => setFilter((f) => ({ ...f, severity: "" }))}
            >
              <div className="truncate text-xs font-medium text-zinc-500">{g.errorType}</div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-lg font-bold text-zinc-100">{g.count}</span>
                <span className="text-[10px] text-zinc-500">{timeAgo(g.lastOccurrence)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={filter.severity}
          onChange={(e) => { setFilter((f) => ({ ...f, severity: e.target.value })); setPage(0); }}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="error">Error</option>
          <option value="warning">Warning</option>
        </select>

        <select
          value={filter.resolved}
          onChange={(e) => { setFilter((f) => ({ ...f, resolved: e.target.value })); setPage(0); }}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300"
        >
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
          <option value="">All</option>
        </select>

        <input
          type="text"
          placeholder="Filter by endpoint..."
          value={filter.endpoint}
          onChange={(e) => { setFilter((f) => ({ ...f, endpoint: e.target.value })); setPage(0); }}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 placeholder-zinc-600"
        />
      </div>

      {/* Error list */}
      {loading ? (
        <div className="py-12 text-center text-sm text-zinc-500">Loading...</div>
      ) : !data?.errors.length ? (
        <div className="rounded-md border border-zinc-800 bg-zinc-900/30 py-12 text-center text-sm text-zinc-500">
          No errors found. Your platform is running clean.
        </div>
      ) : (
        <div className="space-y-1">
          {data.errors.map((err) => (
            <div
              key={err.id}
              className={`rounded border ${
                err.resolved ? "border-zinc-800/50 opacity-60" : "border-zinc-800"
              } bg-zinc-900/50`}
            >
              <div
                className="flex cursor-pointer items-center gap-3 px-3 py-2"
                onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(err.id)}
                  onChange={(e) => { e.stopPropagation(); toggleSelect(err.id); }}
                  className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-800"
                />

                <span
                  className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                    SEVERITY_COLORS[err.severity] || "bg-zinc-800 text-zinc-400 border-zinc-700"
                  }`}
                >
                  {err.severity}
                </span>

                <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">{err.message}</span>

                <span className="shrink-0 text-[10px] text-zinc-500">
                  {err.endpoint && <span className="mr-2 font-mono">{err.method} {err.endpoint}</span>}
                  {timeAgo(err.createdAt)}
                </span>
              </div>

              {expandedId === err.id && (
                <div className="border-t border-zinc-800 px-4 py-3 text-xs">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                    <div>
                      <span className="text-zinc-500">Type:</span>{" "}
                      <span className="text-zinc-300">{err.errorType}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Status:</span>{" "}
                      <span className="text-zinc-300">{err.statusCode || "—"}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">User:</span>{" "}
                      <span className="text-zinc-300">{err.userEmail || err.userId || "—"}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Org:</span>{" "}
                      <span className="text-zinc-300">{err.organizationId || "—"}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Correlation:</span>{" "}
                      <span className="font-mono text-zinc-400">{err.correlationId || "—"}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">Time:</span>{" "}
                      <span className="text-zinc-300">{new Date(err.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {err.stackTrace && (
                    <pre className="mt-3 max-h-48 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-400">
                      {err.stackTrace}
                    </pre>
                  )}

                  {err.requestBody && (
                    <div className="mt-2">
                      <span className="text-zinc-500">Request Body (sanitized):</span>
                      <pre className="mt-1 max-h-24 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[11px] text-zinc-400">
                        {JSON.stringify(JSON.parse(err.requestBody), null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-zinc-500">
            Showing {page * limit + 1}–{Math.min((page + 1) * limit, data.total)} of {data.total}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-400 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              disabled={(page + 1) * limit >= data.total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-400 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
