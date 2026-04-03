"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// ──────────────────────────────────────────────
// Admin Overview — full platform dashboard
//
// Fetches from:
//   /api/admin/usage          (summary view)
//   /api/admin/organizations  (org list + counts)
//   /api/admin/errors         (unresolved errors)
//   /api/admin/usage?view=health  (production health)
// ──────────────────────────────────────────────

/* ---------- Types ---------- */

interface OrgRow {
  id: string;
  name: string;
  plan: string;
  status: string;
  memberCount: number;
  envCount: number;
  createdAt: string;
}

interface UsageTotals {
  total_orgs: number;
  total_mcp_queries: number;
  total_playwright_runs: number;
  total_estimated_tokens: number;
  total_cost_cents: number;
  orgs_over_mcp_limit: number;
  orgs_over_playwright_limit: number;
}

interface OrgUsageRow {
  org_id: string;
  org_name: string;
  plan: string;
  status: string;
  mcp_queries: number;
  playwright_runs: number;
  estimated_tokens: number;
  is_over_mcp_limit: boolean;
  is_over_playwright_limit: boolean;
  cost: {
    mcp_cost_cents: number;
    playwright_cost_cents: number;
    token_cost_cents: number;
    total_cost_cents: number;
  };
}

interface ErrorSummary {
  total: number;
  groupedByType: { errorType: string; count: number; lastOccurrence: string }[];
}

interface HealthData {
  health: {
    status: string;
    checks: Record<string, { ok: boolean; message?: string }>;
  };
}

/* ---------- Helpers ---------- */

const PLAN_PRICES_CENTS: Record<string, number> = {
  vestigio: 9900,
  pro: 19900,
  max: 39900,
};

function cents(n: number): string {
  return `$${(n / 100).toFixed(2)}`;
}

function dollars(n: number): string {
  if (n >= 100000) return `$${(n / 100000).toFixed(1)}k`;
  return `$${(n / 100).toFixed(0)}`;
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

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

/* ---------- Icons (inline SVG) ---------- */

const icons = {
  building: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 0h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
    </svg>
  ),
  checkBadge: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
    </svg>
  ),
  currencyDollar: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  bolt: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  users: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  playwright: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  ),
  exclamation: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  heart: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
    </svg>
  ),
  arrowRight: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
    </svg>
  ),
};

/* ---------- Quick Link ---------- */

function QuickLink({
  href,
  label,
  desc,
}: {
  href: string;
  label: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between rounded-lg border border-edge bg-surface-card p-4 transition-all hover:border-accent/30 hover:bg-surface-card-hover"
    >
      <div>
        <p className="text-sm font-semibold text-content group-hover:text-accent-text">
          {label}
        </p>
        <p className="mt-0.5 text-xs text-content-faint">{desc}</p>
      </div>
      <span className="text-content-faint transition-transform group-hover:translate-x-1 group-hover:text-accent-text">
        {icons.arrowRight}
      </span>
    </Link>
  );
}

/* ---------- Main Page ---------- */

export default function AdminOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [usageTotals, setUsageTotals] = useState<UsageTotals | null>(null);
  const [usageOrgs, setUsageOrgs] = useState<OrgUsageRow[]>([]);
  const [errorSummary, setErrorSummary] = useState<ErrorSummary | null>(null);
  const [healthData, setHealthData] = useState<HealthData | null>(null);

  useEffect(() => {
    async function loadAll() {
      const results = await Promise.allSettled([
        fetch("/api/admin/organizations").then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/usage").then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/errors?limit=1&resolved=false").then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/usage?view=health").then((r) => r.ok ? r.json() : null),
      ]);

      const [orgResult, usageResult, errorResult, healthResult] = results;

      if (orgResult.status === "fulfilled" && orgResult.value) {
        setOrgs(orgResult.value.organizations || []);
      }
      if (usageResult.status === "fulfilled" && usageResult.value) {
        setUsageTotals(usageResult.value.totals || null);
        setUsageOrgs(usageResult.value.organizations || []);
      }
      if (errorResult.status === "fulfilled" && errorResult.value) {
        setErrorSummary({
          total: errorResult.value.total || 0,
          groupedByType: errorResult.value.groupedByType || [],
        });
      }
      if (healthResult.status === "fulfilled" && healthResult.value) {
        setHealthData(healthResult.value);
      }

      setLoading(false);
    }
    loadAll();
  }, []);

  /* ---------- Derived stats ---------- */

  const totalOrgs = orgs.length;
  const activeOrgs = orgs.filter((o) => o.status === "active").length;
  const totalMembers = orgs.reduce((s, o) => s + o.memberCount, 0);

  // MRR from active subscription plan prices
  const mrr = orgs
    .filter((o) => o.status === "active")
    .reduce((s, o) => s + (PLAN_PRICES_CENTS[o.plan] || 0), 0);

  const mcpToday = usageTotals?.total_mcp_queries ?? 0;
  const playwrightToday = usageTotals?.total_playwright_runs ?? 0;
  const costToday = usageTotals?.total_cost_cents ?? 0;
  const overLimit = usageTotals?.orgs_over_mcp_limit ?? 0;

  const unresolvedErrors = errorSummary?.total ?? 0;

  // Health status
  const healthOk = healthData?.health?.status === "ok";
  const healthChecks = healthData?.health?.checks || {};
  const failedChecks = Object.entries(healthChecks).filter(
    ([, v]) => !v.ok
  ).length;

  // Top usage orgs (by cost, descending)
  const topUsageOrgs = [...usageOrgs]
    .sort((a, b) => b.cost.total_cost_cents - a.cost.total_cost_cents)
    .slice(0, 5);

  // Recent orgs (newest first, already sorted by createdAt desc from API)
  const recentOrgs = orgs.slice(0, 5);

  // Plan distribution
  const planCounts: Record<string, number> = {};
  for (const o of orgs) {
    const p = o.plan || "vestigio";
    planCounts[p] = (planCounts[p] || 0) + 1;
  }

  const placeholder = loading ? "..." : "--";

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-content">
          Platform Overview
        </h1>
        <p className="mt-1 text-sm text-content-muted">
          Real-time platform metrics, revenue, and operational health.
        </p>
      </div>

      {/* ── Row 1: Primary KPIs ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Organizations"
          value={loading ? placeholder : String(totalOrgs)}
          sub={`${activeOrgs} active, ${totalOrgs - activeOrgs} inactive`}
          icon={icons.building}
        />
        <StatCard
          label="Active Subscriptions"
          value={loading ? placeholder : String(activeOrgs)}
          sub={Object.entries(planCounts)
            .map(([k, v]) => `${v} ${k}`)
            .join(" / ")}
          icon={icons.checkBadge}
          accent
        />
        <StatCard
          label="Monthly Recurring Revenue"
          value={loading ? placeholder : dollars(mrr)}
          sub={loading ? undefined : `${cents(mrr)} / month`}
          icon={icons.currencyDollar}
          accent
        />
        <StatCard
          label="MCP Queries Today"
          value={loading ? placeholder : formatNum(mcpToday)}
          sub={overLimit > 0 ? `${overLimit} org(s) over limit` : "All within limits"}
          icon={icons.bolt}
          warn={overLimit > 0}
        />
      </div>

      {/* ── Row 2: Secondary KPIs ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Users"
          value={loading ? placeholder : formatNum(totalMembers)}
          sub={`Across ${totalOrgs} organizations`}
          icon={icons.users}
        />
        <StatCard
          label="Playwright Runs Today"
          value={loading ? placeholder : formatNum(playwrightToday)}
          sub={loading ? undefined : `Est. cost: ${cents(costToday)}`}
          icon={icons.playwright}
        />
        <StatCard
          label="Unresolved Errors"
          value={loading ? placeholder : String(unresolvedErrors)}
          sub={
            errorSummary && errorSummary.groupedByType.length > 0
              ? `Top: ${errorSummary.groupedByType[0].errorType} (${errorSummary.groupedByType[0].count})`
              : "No errors"
          }
          icon={icons.exclamation}
          warn={unresolvedErrors > 0}
        />
        <StatCard
          label="System Health"
          value={
            loading
              ? placeholder
              : healthData
                ? healthOk
                  ? "Healthy"
                  : `${failedChecks} issue(s)`
                : "Unknown"
          }
          sub={
            healthData
              ? `${Object.keys(healthChecks).length} checks run`
              : "Health endpoint unavailable"
          }
          icon={icons.heart}
          accent={healthOk}
          warn={healthData != null && !healthOk}
        />
      </div>

      {/* ── Over-limit warning ── */}
      {!loading && overLimit > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-5 py-3">
          <span className="text-amber-400">{icons.exclamation}</span>
          <p className="text-sm text-amber-300">
            <span className="font-semibold">{overLimit} organization(s)</span>{" "}
            have exceeded their daily MCP budget.{" "}
            <Link href="/app/admin/usage-billing" className="underline hover:text-amber-200">
              View usage details
            </Link>
          </p>
        </div>
      )}

      {/* ── Two-column section: Top Usage + Recent Orgs ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Usage Orgs */}
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="flex items-center justify-between border-b border-edge px-5 py-4">
            <h2 className="text-sm font-semibold text-content">
              Top Usage Today
            </h2>
            <Link
              href="/app/admin/usage-billing"
              className="text-xs text-accent-text hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-edge">
            {loading ? (
              <div className="px-5 py-8 text-center text-sm text-content-faint">
                Loading...
              </div>
            ) : topUsageOrgs.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-content-faint">
                No usage data yet.
              </div>
            ) : (
              topUsageOrgs.map((row) => (
                <div
                  key={row.org_id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-content">
                      {row.org_name}
                    </p>
                    <p className="text-xs text-content-faint">
                      {row.mcp_queries} MCP &middot; {row.playwright_runs} Playwright
                    </p>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-sm font-semibold text-content tabular-nums">
                      {cents(row.cost.total_cost_cents)}
                    </p>
                    <div className="flex items-center justify-end gap-1.5">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          row.plan === "max"
                            ? "bg-purple-500/10 text-purple-400"
                            : row.plan === "pro"
                              ? "bg-accent-subtle-bg/10 text-accent-text"
                              : "bg-surface-inset text-content-muted"
                        }`}
                      >
                        {row.plan}
                      </span>
                      {(row.is_over_mcp_limit || row.is_over_playwright_limit) && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                          over limit
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Orgs */}
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="flex items-center justify-between border-b border-edge px-5 py-4">
            <h2 className="text-sm font-semibold text-content">
              Recently Created Organizations
            </h2>
            <Link
              href="/app/admin/organizations"
              className="text-xs text-accent-text hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="divide-y divide-edge">
            {loading ? (
              <div className="px-5 py-8 text-center text-sm text-content-faint">
                Loading...
              </div>
            ) : recentOrgs.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-content-faint">
                No organizations yet.
              </div>
            ) : (
              recentOrgs.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center justify-between px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-content">
                      {org.name}
                    </p>
                    <p className="text-xs text-content-faint">
                      {org.memberCount} member{org.memberCount !== 1 ? "s" : ""} &middot;{" "}
                      {org.envCount} env{org.envCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="ml-4 text-right">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        org.status === "active"
                          ? "bg-accent-subtle-bg/10 text-accent-text"
                          : org.status === "suspended"
                            ? "bg-red-500/10 text-red-400"
                            : "bg-amber-500/10 text-amber-400"
                      }`}
                    >
                      {org.status}
                    </span>
                    <p className="mt-1 text-[11px] text-content-faint">
                      {timeAgo(org.createdAt)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Plan Distribution ── */}
      {!loading && totalOrgs > 0 && (
        <div className="rounded-lg border border-edge bg-surface-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-content">
            Plan Distribution
          </h2>
          <div className="flex gap-3">
            {(["vestigio", "pro", "max"] as const).map((plan) => {
              const count = planCounts[plan] || 0;
              const pct = totalOrgs > 0 ? Math.round((count / totalOrgs) * 100) : 0;
              const colors: Record<string, string> = {
                vestigio: "bg-zinc-500",
                pro: "bg-emerald-500",
                max: "bg-purple-500",
              };
              return (
                <div key={plan} className="flex-1">
                  <div className="mb-2 flex items-baseline justify-between">
                    <span className="text-xs font-medium capitalize text-content-secondary">
                      {plan}
                    </span>
                    <span className="text-xs tabular-nums text-content-faint">
                      {count} ({pct}%)
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-surface-inset">
                    <div
                      className={`h-full rounded-full transition-all ${colors[plan]}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-content-faint">
                    {cents(PLAN_PRICES_CENTS[plan] || 0)}/mo &middot;{" "}
                    {cents(count * (PLAN_PRICES_CENTS[plan] || 0))} MRR
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Error Types (if any) ── */}
      {!loading && errorSummary && errorSummary.groupedByType.length > 0 && (
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="flex items-center justify-between border-b border-edge px-5 py-4">
            <h2 className="text-sm font-semibold text-content">
              Unresolved Errors by Type
            </h2>
            <Link
              href="/app/admin/errors"
              className="text-xs text-accent-text hover:underline"
            >
              View all errors
            </Link>
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
                {errorSummary.groupedByType.slice(0, 8).map((g) => (
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

      {/* ── Quick Links ── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-content">
          Quick Links
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink
            href="/app/admin/organizations"
            label="Organizations"
            desc="Manage tenants, plans, and suspensions"
          />
          <QuickLink
            href="/app/admin/environments"
            label="Environments"
            desc="Domains, audit status, production flags"
          />
          <QuickLink
            href="/app/admin/pricing"
            label="Pricing"
            desc="Plan pricing and feature gates"
          />
          <QuickLink
            href="/app/admin/usage-billing"
            label="Usage & Billing"
            desc="Daily capacity, cost estimates, token economics"
          />
          <QuickLink
            href="/app/admin/system-health"
            label="System Health"
            desc="MCP latency, active audits, observability"
          />
          <QuickLink
            href="/app/admin/errors"
            label="Error Tracking"
            desc="Unresolved platform errors and alerts"
          />
        </div>
      </div>

      {/* ── Empty state ── */}
      {!loading && !usageTotals && orgs.length === 0 && (
        <div className="rounded-lg border border-dashed border-edge px-6 py-12 text-center">
          <p className="text-sm text-content-faint">
            No platform data yet. Organizations and usage will appear here once
            users begin onboarding.
          </p>
        </div>
      )}
    </div>
  );
}
