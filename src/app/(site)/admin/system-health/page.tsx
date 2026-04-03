"use client";

import { useState, useEffect } from "react";

// ──────────────────────────────────────────────
// Admin — System Health
// MCP latency, error rate, health checks, recent activity.
// Matches Overview visual identity.
// ──────────────────────────────────────────────

interface HealthCheck {
  ok: boolean;
  message?: string;
}

interface HealthData {
  status: string;
  checks: Record<string, HealthCheck>;
}

interface ErrorSummary {
  total: number;
  groupedByType: { errorType: string; count: number; lastOccurrence: string }[];
}

interface UsageTotals {
  total_mcp_queries: number;
  total_playwright_runs: number;
  total_cost_cents: number;
  total_estimated_tokens: number;
}

/* ---------- Helpers ---------- */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

/* ---------- Icons ---------- */

const icons = {
  heart: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  ),
  bolt: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  exclamation: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  checkCircle: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  xCircle: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  playwright: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  ),
};

/* ---------- Stat Card ---------- */

function StatCard({
  label,
  value,
  sub,
  accent,
  icon,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  icon: React.ReactNode;
  warn?: boolean;
}) {
  return (
    <div className="group relative overflow-hidden rounded-lg border border-edge bg-surface-card p-5 transition-colors hover:bg-surface-card-hover">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-content-muted">
            {label}
          </p>
          <p
            className={`mt-2 text-2xl font-bold tracking-tight ${
              warn
                ? "text-amber-400"
                : accent
                  ? "text-accent-text"
                  : "text-content"
            }`}
          >
            {value}
          </p>
          {sub && (
            <p className="mt-1 text-xs text-content-faint">{sub}</p>
          )}
        </div>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
            warn
              ? "bg-amber-500/10 text-amber-400"
              : accent
                ? "bg-accent-subtle-bg/10 text-accent-text"
                : "bg-surface-inset text-content-muted"
          }`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function AdminSystemHealthPage() {
  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [errorSummary, setErrorSummary] = useState<ErrorSummary | null>(null);
  const [usageTotals, setUsageTotals] = useState<UsageTotals | null>(null);

  useEffect(() => {
    async function loadAll() {
      const results = await Promise.allSettled([
        fetch("/api/admin/usage?view=health").then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/errors?limit=1&resolved=false").then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/usage").then((r) => r.ok ? r.json() : null),
      ]);

      const [healthResult, errorResult, usageResult] = results;

      if (healthResult.status === "fulfilled" && healthResult.value) {
        setHealthData(healthResult.value.health || null);
      }
      if (errorResult.status === "fulfilled" && errorResult.value) {
        setErrorSummary({
          total: errorResult.value.total || 0,
          groupedByType: errorResult.value.groupedByType || [],
        });
      }
      if (usageResult.status === "fulfilled" && usageResult.value) {
        setUsageTotals(usageResult.value.totals || null);
      }

      setLoading(false);
    }
    loadAll();
  }, []);

  /* ---------- Derived stats ---------- */

  const healthOk = healthData?.status === "ok";
  const checks = healthData?.checks || {};
  const checkEntries = Object.entries(checks);
  const passedChecks = checkEntries.filter(([, v]) => v.ok).length;
  const failedChecks = checkEntries.filter(([, v]) => !v.ok).length;
  const unresolvedErrors = errorSummary?.total ?? 0;

  const placeholder = loading ? "..." : "--";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-content">System Health</h1>
        <p className="mt-1 text-sm text-content-muted">
          Infrastructure status, MCP performance, and error monitoring.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Overall Status"
          value={
            loading
              ? placeholder
              : healthData
                ? healthOk
                  ? "Healthy"
                  : `${failedChecks} Issue(s)`
                : "Unknown"
          }
          sub={healthData ? `${checkEntries.length} checks run` : "Health endpoint unavailable"}
          icon={icons.heart}
          accent={healthOk}
          warn={healthData != null && !healthOk}
        />
        <StatCard
          label="MCP Queries Today"
          value={usageTotals ? formatNum(usageTotals.total_mcp_queries) : placeholder}
          sub="Total across all orgs"
          icon={icons.bolt}
          accent
        />
        <StatCard
          label="Playwright Runs Today"
          value={usageTotals ? formatNum(usageTotals.total_playwright_runs) : placeholder}
          sub="Browser verification runs"
          icon={icons.playwright}
        />
        <StatCard
          label="Unresolved Errors"
          value={loading ? placeholder : String(unresolvedErrors)}
          sub={
            errorSummary && errorSummary.groupedByType.length > 0
              ? `Top: ${errorSummary.groupedByType[0].errorType}`
              : "No errors"
          }
          icon={icons.exclamation}
          warn={unresolvedErrors > 0}
        />
      </div>

      {/* Health Checks */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-content">Health Checks</h2>
        </div>
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-content-faint">
            Loading...
          </div>
        ) : checkEntries.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-content-faint">
            No health check data available. Health checks will appear once the health endpoint is configured.
          </div>
        ) : (
          <div className="divide-y divide-edge">
            {checkEntries.map(([name, check]) => (
              <div
                key={name}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-card-hover"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    check.ok
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {check.ok ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize text-content">
                    {name.replace(/_/g, " ")}
                  </p>
                  {check.message && (
                    <p className="mt-0.5 text-xs text-content-faint">{check.message}</p>
                  )}
                </div>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    check.ok
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {check.ok ? "Pass" : "Fail"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Error Types */}
      {!loading && errorSummary && errorSummary.groupedByType.length > 0 && (
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="border-b border-edge px-5 py-4">
            <h2 className="text-sm font-semibold text-content">
              Unresolved Errors by Type
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-edge">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                    Error Type
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                    Count
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                    Last Seen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {errorSummary.groupedByType.slice(0, 10).map((g) => (
                  <tr key={g.errorType} className="hover:bg-surface-card-hover">
                    <td className="px-5 py-3 font-mono text-xs text-content">
                      {g.errorType}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium tabular-nums text-red-400">
                        {g.count}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-content-faint">
                      {g.lastOccurrence ? timeAgo(g.lastOccurrence) : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !healthData && unresolvedErrors === 0 && (
        <div className="rounded-lg border border-dashed border-edge px-6 py-12 text-center">
          <p className="text-sm text-content-faint">
            Health monitoring will populate once the system begins processing requests.
          </p>
        </div>
      )}
    </div>
  );
}
