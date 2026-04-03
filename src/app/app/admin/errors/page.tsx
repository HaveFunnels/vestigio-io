"use client";

import { useCallback, useEffect, useState } from "react";

// ──────────────────────────────────────────────
// Admin Error Tracking — smart grouping, muting, frequency trends
// ──────────────────────────────────────────────

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

/* ---------- Fingerprint grouping types ---------- */

interface FingerprintGroup {
  fingerprint: string;
  errorType: string;
  endpoint: string;
  stackFirstLine: string;
  errors: PlatformError[];
  count: number;
  lastOccurrence: string;
  trend: "increasing" | "stable" | "decreasing";
  muted: boolean;
}

/* ---------- Constants ---------- */

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/30",
  error: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
};

const MUTED_STORAGE_KEY = "vestigio-admin-muted-error-groups";

/* ---------- Helpers ---------- */

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

function getFingerprint(err: PlatformError): string {
  const stackFirstLine = err.stackTrace
    ? err.stackTrace.split("\n").find((l) => l.trim().length > 0)?.trim() || ""
    : "";
  return `${err.errorType}::${err.endpoint || "unknown"}::${stackFirstLine}`;
}

function getStackFirstLine(err: PlatformError): string {
  if (!err.stackTrace) return "";
  return err.stackTrace.split("\n").find((l) => l.trim().length > 0)?.trim() || "";
}

function computeTrend(errors: PlatformError[]): "increasing" | "stable" | "decreasing" {
  const now = Date.now();
  const oneHourAgo = now - 60 * 60 * 1000;
  const twoHoursAgo = now - 2 * 60 * 60 * 1000;

  const lastHour = errors.filter(
    (e) => new Date(e.createdAt).getTime() > oneHourAgo
  ).length;
  const prevHour = errors.filter((e) => {
    const t = new Date(e.createdAt).getTime();
    return t > twoHoursAgo && t <= oneHourAgo;
  }).length;

  if (lastHour > prevHour) return "increasing";
  if (lastHour < prevHour) return "decreasing";
  return "stable";
}

function getMutedFingerprints(): Set<string> {
  try {
    const raw = localStorage.getItem(MUTED_STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch {
    // ignore
  }
  return new Set();
}

function saveMutedFingerprints(set: Set<string>) {
  try {
    localStorage.setItem(MUTED_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

function groupByFingerprint(
  errors: PlatformError[],
  mutedSet: Set<string>
): FingerprintGroup[] {
  const map = new Map<string, PlatformError[]>();

  for (const err of errors) {
    const fp = getFingerprint(err);
    if (!map.has(fp)) map.set(fp, []);
    map.get(fp)!.push(err);
  }

  const groups: FingerprintGroup[] = [];
  for (const [fp, errs] of map) {
    const sorted = errs.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    groups.push({
      fingerprint: fp,
      errorType: sorted[0].errorType,
      endpoint: sorted[0].endpoint || "unknown",
      stackFirstLine: getStackFirstLine(sorted[0]),
      errors: sorted,
      count: sorted.length,
      lastOccurrence: sorted[0].createdAt,
      trend: computeTrend(sorted),
      muted: mutedSet.has(fp),
    });
  }

  return groups.sort(
    (a, b) =>
      new Date(b.lastOccurrence).getTime() - new Date(a.lastOccurrence).getTime()
  );
}

/* ---------- Icons ---------- */

const icons = {
  chevronDown: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  ),
  chevronRight: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
  volumeOff: (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-3.15a.75.75 0 011.28.53v13.74a.75.75 0 01-1.28.53L6.75 14.25H3.75a.75.75 0 01-.75-.75v-3a.75.75 0 01.75-.75h3z" />
    </svg>
  ),
  volumeOn: (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-3.15a.75.75 0 011.28.53v12.74a.75.75 0 01-1.28.53l-4.72-3.15H3.75a.75.75 0 01-.75-.75v-3a.75.75 0 01.75-.75h3z" />
    </svg>
  ),
};

/* ---------- Skeleton ---------- */

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="h-4 w-4 animate-pulse rounded bg-white/[0.06]" />
      <div className="h-5 w-16 animate-pulse rounded bg-white/[0.06]" />
      <div className="h-4 w-48 flex-1 animate-pulse rounded bg-white/[0.06]" />
      <div className="h-4 w-20 animate-pulse rounded bg-white/[0.06]" />
    </div>
  );
}

function SkeletonGroupRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 border-b border-edge">
      <div className="h-4 w-4 animate-pulse rounded bg-white/[0.06]" />
      <div className="h-5 w-12 animate-pulse rounded bg-white/[0.06]" />
      <div className="flex-1 space-y-1.5">
        <div className="h-4 w-40 animate-pulse rounded bg-white/[0.06]" />
        <div className="h-3 w-56 animate-pulse rounded bg-white/[0.06]" />
      </div>
      <div className="h-5 w-20 animate-pulse rounded bg-white/[0.06]" />
      <div className="h-5 w-16 animate-pulse rounded bg-white/[0.06]" />
    </div>
  );
}

/* ---------- Trend Badge ---------- */

function TrendBadge({ trend }: { trend: "increasing" | "stable" | "decreasing" }) {
  if (trend === "increasing") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
        <span className="text-xs leading-none">&uarr;</span> Increasing
      </span>
    );
  }
  if (trend === "decreasing") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
        <span className="text-xs leading-none">&darr;</span> Decreasing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-surface-inset px-1.5 py-0.5 text-[10px] font-medium text-content-faint">
      <span className="text-xs leading-none">&rarr;</span> Stable
    </span>
  );
}

/* ---------- Main Page ---------- */

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
  const limit = 200; // fetch more for grouping

  // View mode
  const [viewMode, setViewMode] = useState<"grouped" | "list">("grouped");

  // Grouped view state
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [mutedFingerprints, setMutedFingerprints] = useState<Set<string>>(new Set());
  const [showMuted, setShowMuted] = useState(false);

  // Load muted state from localStorage
  useEffect(() => {
    setMutedFingerprints(getMutedFingerprints());
  }, []);

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

  const toggleMute = (fingerprint: string) => {
    setMutedFingerprints((prev) => {
      const next = new Set(prev);
      if (next.has(fingerprint)) next.delete(fingerprint);
      else next.add(fingerprint);
      saveMutedFingerprints(next);
      return next;
    });
  };

  // Compute groups
  const allGroups = data
    ? groupByFingerprint(data.errors, mutedFingerprints)
    : [];
  const visibleGroups = showMuted
    ? allGroups
    : allGroups.filter((g) => !g.muted);
  const mutedCount = allGroups.filter((g) => g.muted).length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-content">Error Tracking</h1>
          <p className="mt-1 text-sm text-content-muted">
            Platform-wide error monitoring with smart grouping.{" "}
            {data ? `${data.total} total errors.` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <button
              onClick={resolveSelected}
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
            >
              Resolve ({selectedIds.size})
            </button>
          )}
          <button
            onClick={purgeOld}
            className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-content-muted transition-colors hover:bg-surface-inset hover:text-content"
          >
            Purge 14d+
          </button>
          <button
            onClick={fetchErrors}
            className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-content-muted transition-colors hover:bg-surface-inset hover:text-content"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Error type summary cards */}
      {data?.groupedByType && data.groupedByType.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {data.groupedByType.slice(0, 4).map((g) => (
            <div
              key={g.errorType}
              className="rounded-lg border border-edge bg-surface-card p-3 transition-colors hover:bg-surface-card-hover"
            >
              <div className="truncate text-xs font-medium text-content-muted">
                {g.errorType}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-bold text-content">{g.count}</span>
                <span className="text-[10px] text-content-faint">
                  {timeAgo(g.lastOccurrence)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View mode tabs + Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Tab bar */}
        <div className="flex rounded-lg border border-edge bg-surface-card p-0.5">
          <button
            onClick={() => setViewMode("grouped")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "grouped"
                ? "bg-accent-subtle-bg/20 text-accent-text"
                : "text-content-muted hover:text-content"
            }`}
          >
            Grouped
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "list"
                ? "bg-accent-subtle-bg/20 text-accent-text"
                : "text-content-muted hover:text-content"
            }`}
          >
            List
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filter.severity}
            onChange={(e) => {
              setFilter((f) => ({ ...f, severity: e.target.value }));
              setPage(0);
            }}
            className="rounded-lg border border-edge bg-surface-inset px-2.5 py-1.5 text-xs text-content outline-none transition-colors focus:border-accent/40"
          >
            <option value="">All Severities</option>
            <option value="critical">Critical</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
          </select>

          <select
            value={filter.resolved}
            onChange={(e) => {
              setFilter((f) => ({ ...f, resolved: e.target.value }));
              setPage(0);
            }}
            className="rounded-lg border border-edge bg-surface-inset px-2.5 py-1.5 text-xs text-content outline-none transition-colors focus:border-accent/40"
          >
            <option value="false">Unresolved</option>
            <option value="true">Resolved</option>
            <option value="">All</option>
          </select>

          <input
            type="text"
            placeholder="Filter by endpoint..."
            value={filter.endpoint}
            onChange={(e) => {
              setFilter((f) => ({ ...f, endpoint: e.target.value }));
              setPage(0);
            }}
            className="rounded-lg border border-edge bg-surface-inset px-2.5 py-1.5 text-xs text-content placeholder-content-faint outline-none transition-colors focus:border-accent/40"
          />
        </div>
      </div>

      {/* Muted toggle (grouped view only) */}
      {viewMode === "grouped" && mutedCount > 0 && (
        <button
          onClick={() => setShowMuted(!showMuted)}
          className="text-xs text-content-faint transition-colors hover:text-content-muted"
        >
          {showMuted ? "Hide" : "Show"} muted ({mutedCount})
        </button>
      )}

      {/* ── GROUPED VIEW ── */}
      {viewMode === "grouped" && (
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="border-b border-edge px-5 py-3">
            <div className="flex items-center gap-4 text-[10px] font-medium uppercase tracking-wider text-content-muted">
              <span className="w-5" />
              <span className="w-14">Count</span>
              <span className="flex-1">Error Group</span>
              <span className="w-24">Trend</span>
              <span className="w-20 text-right">Last Seen</span>
              <span className="w-16 text-right">Actions</span>
            </div>
          </div>

          {loading ? (
            <div>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonGroupRow key={i} />
              ))}
            </div>
          ) : visibleGroups.length === 0 ? (
            <div className="px-5 py-12 text-center text-sm text-content-faint">
              {mutedCount > 0 && !showMuted
                ? "All error groups are muted. Click \"Show muted\" to reveal them."
                : "No errors found. Your platform is running clean."}
            </div>
          ) : (
            <div className="divide-y divide-edge">
              {visibleGroups.map((group) => (
                <div key={group.fingerprint} className={group.muted ? "opacity-50" : ""}>
                  {/* Group header */}
                  <div
                    className="flex cursor-pointer items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-card-hover"
                    onClick={() =>
                      setExpandedGroup(
                        expandedGroup === group.fingerprint
                          ? null
                          : group.fingerprint
                      )
                    }
                  >
                    <span className="w-5 shrink-0 text-content-faint">
                      {expandedGroup === group.fingerprint
                        ? icons.chevronDown
                        : icons.chevronRight}
                    </span>

                    <span className="w-14 shrink-0">
                      <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs font-bold tabular-nums text-red-400">
                        {group.count}
                      </span>
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-content">
                        {group.errorType}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-content-faint">
                        <span className="font-mono">{group.endpoint}</span>
                        {group.stackFirstLine && (
                          <>
                            {" "}
                            <span className="text-content-faint/50">&middot;</span>{" "}
                            <span className="font-mono opacity-60">
                              {group.stackFirstLine.slice(0, 80)}
                            </span>
                          </>
                        )}
                      </p>
                    </div>

                    <div className="w-24 shrink-0">
                      <TrendBadge trend={group.trend} />
                    </div>

                    <span className="w-20 shrink-0 text-right text-xs text-content-faint">
                      {timeAgo(group.lastOccurrence)}
                    </span>

                    <div className="w-16 shrink-0 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMute(group.fingerprint);
                        }}
                        className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                          group.muted
                            ? "bg-surface-inset text-content-faint hover:text-content-muted"
                            : "text-content-faint hover:bg-surface-inset hover:text-content-muted"
                        }`}
                        title={group.muted ? "Unmute" : "Mute"}
                      >
                        {group.muted ? icons.volumeOff : icons.volumeOn}
                        <span>{group.muted ? "Muted" : "Mute"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded: individual errors */}
                  {expandedGroup === group.fingerprint && (
                    <div className="border-t border-edge bg-surface-inset/30">
                      <div className="px-5 py-2 text-[10px] font-medium uppercase tracking-wider text-content-muted">
                        {group.count} occurrence{group.count !== 1 ? "s" : ""}
                      </div>
                      <div className="divide-y divide-edge/50">
                        {group.errors.map((err) => (
                          <div
                            key={err.id}
                            className={`${
                              err.resolved ? "opacity-50" : ""
                            }`}
                          >
                            <div
                              className="flex cursor-pointer items-center gap-3 px-5 py-2.5 transition-colors hover:bg-surface-card-hover/50"
                              onClick={() =>
                                setExpandedId(
                                  expandedId === err.id ? null : err.id
                                )
                              }
                            >
                              <input
                                type="checkbox"
                                checked={selectedIds.has(err.id)}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  toggleSelect(err.id);
                                }}
                                className="h-3.5 w-3.5 rounded border-edge bg-surface-inset"
                              />

                              <span
                                className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                                  SEVERITY_COLORS[err.severity] ||
                                  "bg-surface-inset text-content-muted border-edge"
                                }`}
                              >
                                {err.severity}
                              </span>

                              <span className="min-w-0 flex-1 truncate text-xs text-content">
                                {err.message}
                              </span>

                              <span className="shrink-0 text-[10px] text-content-faint">
                                {err.endpoint && (
                                  <span className="mr-2 font-mono">
                                    {err.method} {err.endpoint}
                                  </span>
                                )}
                                {timeAgo(err.createdAt)}
                              </span>
                            </div>

                            {/* Error detail */}
                            {expandedId === err.id && (
                              <div className="border-t border-edge/50 px-5 py-3 text-xs">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                                  <div>
                                    <span className="text-content-faint">Type:</span>{" "}
                                    <span className="text-content">{err.errorType}</span>
                                  </div>
                                  <div>
                                    <span className="text-content-faint">Status:</span>{" "}
                                    <span className="text-content">{err.statusCode || "--"}</span>
                                  </div>
                                  <div>
                                    <span className="text-content-faint">User:</span>{" "}
                                    <span className="text-content">
                                      {err.userEmail || err.userId || "--"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-content-faint">Org:</span>{" "}
                                    <span className="text-content">
                                      {err.organizationId || "--"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-content-faint">Correlation:</span>{" "}
                                    <span className="font-mono text-content-muted">
                                      {err.correlationId || "--"}
                                    </span>
                                  </div>
                                  <div>
                                    <span className="text-content-faint">Time:</span>{" "}
                                    <span className="text-content">
                                      {new Date(err.createdAt).toLocaleString()}
                                    </span>
                                  </div>
                                </div>

                                {err.stackTrace && (
                                  <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-surface-inset p-3 font-mono text-[11px] leading-relaxed text-content-faint">
                                    {err.stackTrace}
                                  </pre>
                                )}

                                {err.requestBody && (
                                  <div className="mt-2">
                                    <span className="text-content-faint">
                                      Request Body (sanitized):
                                    </span>
                                    <pre className="mt-1 max-h-24 overflow-auto rounded-lg bg-surface-inset p-3 font-mono text-[11px] text-content-faint">
                                      {(() => {
                                        try {
                                          return JSON.stringify(
                                            JSON.parse(err.requestBody!),
                                            null,
                                            2
                                          );
                                        } catch {
                                          return err.requestBody;
                                        }
                                      })()}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {viewMode === "list" && (
        <div className="rounded-lg border border-edge bg-surface-card">
          {loading ? (
            <div>
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : !data?.errors.length ? (
            <div className="px-5 py-12 text-center text-sm text-content-faint">
              No errors found. Your platform is running clean.
            </div>
          ) : (
            <div className="divide-y divide-edge">
              {data.errors.map((err) => (
                <div
                  key={err.id}
                  className={err.resolved ? "opacity-50" : ""}
                >
                  <div
                    className="flex cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-card-hover"
                    onClick={() =>
                      setExpandedId(expandedId === err.id ? null : err.id)
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(err.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelect(err.id);
                      }}
                      className="h-3.5 w-3.5 rounded border-edge bg-surface-inset"
                    />

                    <span
                      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                        SEVERITY_COLORS[err.severity] ||
                        "bg-surface-inset text-content-muted border-edge"
                      }`}
                    >
                      {err.severity}
                    </span>

                    <span className="min-w-0 flex-1 truncate text-xs text-content">
                      {err.message}
                    </span>

                    <span className="shrink-0 text-[10px] text-content-faint">
                      {err.endpoint && (
                        <span className="mr-2 font-mono">
                          {err.method} {err.endpoint}
                        </span>
                      )}
                      {timeAgo(err.createdAt)}
                    </span>
                  </div>

                  {expandedId === err.id && (
                    <div className="border-t border-edge px-4 py-3 text-xs">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-4">
                        <div>
                          <span className="text-content-faint">Type:</span>{" "}
                          <span className="text-content">{err.errorType}</span>
                        </div>
                        <div>
                          <span className="text-content-faint">Status:</span>{" "}
                          <span className="text-content">{err.statusCode || "--"}</span>
                        </div>
                        <div>
                          <span className="text-content-faint">User:</span>{" "}
                          <span className="text-content">
                            {err.userEmail || err.userId || "--"}
                          </span>
                        </div>
                        <div>
                          <span className="text-content-faint">Org:</span>{" "}
                          <span className="text-content">
                            {err.organizationId || "--"}
                          </span>
                        </div>
                        <div>
                          <span className="text-content-faint">Correlation:</span>{" "}
                          <span className="font-mono text-content-muted">
                            {err.correlationId || "--"}
                          </span>
                        </div>
                        <div>
                          <span className="text-content-faint">Time:</span>{" "}
                          <span className="text-content">
                            {new Date(err.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {err.stackTrace && (
                        <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-surface-inset p-3 font-mono text-[11px] leading-relaxed text-content-faint">
                          {err.stackTrace}
                        </pre>
                      )}

                      {err.requestBody && (
                        <div className="mt-2">
                          <span className="text-content-faint">
                            Request Body (sanitized):
                          </span>
                          <pre className="mt-1 max-h-24 overflow-auto rounded-lg bg-surface-inset p-3 font-mono text-[11px] text-content-faint">
                            {(() => {
                              try {
                                return JSON.stringify(
                                  JSON.parse(err.requestBody!),
                                  null,
                                  2
                                );
                              } catch {
                                return err.requestBody;
                              }
                            })()}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-content-faint">
            Showing {page * limit + 1}--{Math.min((page + 1) * limit, data.total)}{" "}
            of {data.total}
          </span>
          <div className="flex gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-lg border border-edge px-2.5 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-inset disabled:opacity-30"
            >
              Prev
            </button>
            <button
              disabled={(page + 1) * limit >= data.total}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-lg border border-edge px-2.5 py-1.5 text-xs text-content-muted transition-colors hover:bg-surface-inset disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
