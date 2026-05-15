"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

// ──────────────────────────────────────────────
// Admin — System Health + Uptime History Grid
// MCP latency, error rate, health checks, uptime history.
// ──────────────────────────────────────────────

interface HealthCheck {
  ok: boolean;
  message?: string;
}

interface LiveCheck {
  service: string;
  status: "ok" | "degraded" | "down";
  latencyMs: number;
  message: string | null;
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

interface UptimeDayData {
  date: string;
  status: "ok" | "degraded" | "down" | "no_data";
  checkCount: number;
}

interface UptimeServiceData {
  days: UptimeDayData[];
  uptimePercent: number;
}

interface UptimeResponse {
  services: Record<string, UptimeServiceData>;
  empty: boolean;
  message?: string;
}

/* ---------- Helpers ---------- */

function timeAgo(
  iso: string,
  labels: { justNow: string; mAgo: (m: number) => string; hAgo: (h: number) => string; dAgo: (d: number) => string },
): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return labels.justNow;
  if (mins < 60) return labels.mAgo(mins);
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return labels.hAgo(hrs);
  const days = Math.floor(hrs / 24);
  return labels.dAgo(days);
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

/* ---------- Uptime Grid Skeleton ---------- */

function UptimeGridSkeleton() {
  return (
    <div className="rounded-lg border border-edge bg-surface-card">
      <div className="border-b border-edge px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-4 w-20 animate-pulse rounded bg-white/[0.06]" />
        </div>
      </div>
      <div className="p-5 space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-3 w-16 animate-pulse rounded bg-white/[0.06]" />
            <div className="flex gap-[2px]">
              {Array.from({ length: 30 }).map((_, j) => (
                <div
                  key={j}
                  className="h-3 w-3 animate-pulse rounded-[2px] bg-white/[0.06]"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Uptime Grid Cell ---------- */

const STATUS_COLORS: Record<string, string> = {
  ok: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
  no_data: "bg-surface-inset",
};

function UptimeCell({ day }: { day: UptimeDayData }) {
  const t = useTranslations("console.admin.system_health");
  const [showTooltip, setShowTooltip] = useState(false);

  const statusLabels: Record<string, string> = {
    ok: t("uptime_operational"),
    degraded: t("uptime_degraded"),
    down: t("uptime_down"),
    no_data: t("uptime_no_data"),
  };

  return (
    <div className="relative">
      <div
        className={`h-3 w-3 rounded-[2px] transition-opacity ${STATUS_COLORS[day.status]} ${
          day.status === "no_data" ? "opacity-40" : ""
        }`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      />
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-[11px] shadow-lg">
          <p className="font-medium text-content">{formatDate(day.date)}</p>
          <p className="text-content-faint">
            {statusLabels[day.status]}
            {day.checkCount > 0 && ` ${t("uptime_check_count", { count: day.checkCount })}`}
          </p>
          <div
            className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-edge"
          />
        </div>
      )}
    </div>
  );
}

/* ---------- Uptime Grid ---------- */

function UptimeGrid({ uptimeData, loading }: { uptimeData: UptimeResponse | null; loading: boolean }) {
  const t = useTranslations("console.admin.system_health");
  if (loading) return <UptimeGridSkeleton />;

  const isEmpty = !uptimeData || uptimeData.empty || Object.keys(uptimeData.services).length === 0;

  // Calculate overall uptime
  const services = uptimeData?.services || {};
  const serviceEntries = Object.entries(services);
  const overallUptime =
    serviceEntries.length > 0
      ? Math.round(
          (serviceEntries.reduce((sum, [, s]) => sum + s.uptimePercent, 0) /
            serviceEntries.length) *
            100
        ) / 100
      : 100;

  return (
    <div className="rounded-lg border border-edge bg-surface-card">
      <div className="flex items-center justify-between border-b border-edge px-5 py-4">
        <h2 className="text-sm font-semibold text-content">
          {t("uptime_history")}
        </h2>
        {!isEmpty && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-content-faint">{t("last_30_days")}</span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-medium ${
                overallUptime >= 99.5
                  ? "bg-emerald-500/10 text-emerald-400"
                  : overallUptime >= 95
                    ? "bg-amber-500/10 text-amber-400"
                    : "bg-red-500/10 text-red-400"
              }`}
            >
              {t("uptime_pct", { value: overallUptime })}
            </span>
          </div>
        )}
      </div>

      {isEmpty ? (
        <div className="px-5 py-12 text-center text-sm text-content-faint">
          {t("uptime_empty")}
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {serviceEntries.map(([service, data]) => (
            <div key={service}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-medium capitalize text-content-secondary">
                  {service.replace(/_/g, " ")}
                </span>
                <span
                  className={`text-xs tabular-nums ${
                    data.uptimePercent >= 99.5
                      ? "text-emerald-400"
                      : data.uptimePercent >= 95
                        ? "text-amber-400"
                        : "text-red-400"
                  }`}
                >
                  {data.uptimePercent}%
                </span>
              </div>
              <div className="flex gap-[2px]">
                {data.days.map((day) => (
                  <UptimeCell key={day.date} day={day} />
                ))}
              </div>
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center gap-4 pt-2 text-[10px] text-content-faint">
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-[1px] bg-emerald-500" />
              <span>{t("uptime_operational")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-[1px] bg-amber-500" />
              <span>{t("uptime_degraded")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-[1px] bg-red-500" />
              <span>{t("uptime_down")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="h-2.5 w-2.5 rounded-[1px] bg-surface-inset opacity-40" />
              <span>{t("uptime_no_data")}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Main Page ---------- */

export default function AdminSystemHealthPage() {
  const t = useTranslations("console.admin.system_health");
  const timeAgoLabels = {
    justNow: t("just_now"),
    mAgo: (m: number) => t("minutes_ago", { count: m }),
    hAgo: (h: number) => t("hours_ago", { count: h }),
    dAgo: (d: number) => t("days_ago", { count: d }),
  };
  const [loading, setLoading] = useState(true);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [liveChecks, setLiveChecks] = useState<LiveCheck[]>([]);
  const [overallStatus, setOverallStatus] = useState<string>("unknown");
  const [errorSummary, setErrorSummary] = useState<ErrorSummary | null>(null);
  const [usageTotals, setUsageTotals] = useState<UsageTotals | null>(null);
  const [uptimeData, setUptimeData] = useState<UptimeResponse | null>(null);
  const [uptimeLoading, setUptimeLoading] = useState(true);

  useEffect(() => {
    async function loadAll() {
      const results = await Promise.allSettled([
        fetch("/api/admin/usage?view=health").then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/errors?limit=1&resolved=false").then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/usage").then((r) => r.ok ? r.json() : null),
        fetch("/api/admin/uptime").then((r) => r.ok ? r.json() : null),
      ]);

      const [healthResult, errorResult, usageResult, uptimeResult] = results;

      if (healthResult.status === "fulfilled" && healthResult.value) {
        setHealthData(healthResult.value.health || null);
        if (healthResult.value.checks) setLiveChecks(healthResult.value.checks);
        if (healthResult.value.overall) setOverallStatus(healthResult.value.overall);
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
      if (uptimeResult.status === "fulfilled" && uptimeResult.value) {
        setUptimeData(uptimeResult.value);
      }

      setLoading(false);
      setUptimeLoading(false);
    }
    loadAll();
  }, []);

  /* ---------- Derived stats ---------- */

  const hasLiveChecks = liveChecks.length > 0;
  const healthOk = hasLiveChecks ? overallStatus === "healthy" : healthData?.status === "ok";
  const checks = healthData?.checks || {};
  const checkEntries = Object.entries(checks);
  const passedChecks = hasLiveChecks
    ? liveChecks.filter((c) => c.status === "ok").length
    : checkEntries.filter(([, v]) => v.ok).length;
  const failedChecks = hasLiveChecks
    ? liveChecks.filter((c) => c.status !== "ok").length
    : checkEntries.filter(([, v]) => !v.ok).length;
  const totalChecks = hasLiveChecks ? liveChecks.length : checkEntries.length;
  const unresolvedErrors = errorSummary?.total ?? 0;

  const placeholder = loading ? "..." : "--";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-content">{t("page_title")}</h1>
        <p className="mt-1 text-sm text-content-muted">
          {t("page_subtitle")}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("stat_overall_status")}
          value={
            loading
              ? placeholder
              : hasLiveChecks
                ? healthOk
                  ? t("status_healthy")
                  : overallStatus === "degraded"
                    ? t("status_degraded")
                    : t("status_issues", { count: failedChecks })
                : t("status_unknown")
          }
          sub={hasLiveChecks ? t("services_checked", { count: totalChecks }) : t("waiting_first_check")}
          icon={icons.heart}
          accent={healthOk}
          warn={healthData != null && !healthOk}
        />
        <StatCard
          label={t("stat_mcp_today")}
          value={usageTotals ? formatNum(usageTotals.total_mcp_queries) : placeholder}
          sub={t("stat_mcp_sub")}
          icon={icons.bolt}
          accent
        />
        <StatCard
          label={t("stat_playwright_today")}
          value={usageTotals ? formatNum(usageTotals.total_playwright_runs) : placeholder}
          sub={t("stat_playwright_sub")}
          icon={icons.playwright}
        />
        <StatCard
          label={t("stat_unresolved_errors")}
          value={loading ? placeholder : String(unresolvedErrors)}
          sub={
            errorSummary && errorSummary.groupedByType.length > 0
              ? t("top_error", { type: errorSummary.groupedByType[0].errorType })
              : t("no_errors")
          }
          icon={icons.exclamation}
          warn={unresolvedErrors > 0}
        />
      </div>

      {/* Health Checks */}
      <div className="rounded-lg border border-edge bg-surface-card">
        <div className="border-b border-edge px-5 py-4">
          <h2 className="text-sm font-semibold text-content">{t("health_checks")}</h2>
        </div>
        {loading ? (
          <div className="px-5 py-12 text-center text-sm text-content-faint">
            {t("loading")}
          </div>
        ) : liveChecks.length === 0 && checkEntries.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-content-faint">
            {t("no_health_data")}
          </div>
        ) : liveChecks.length > 0 ? (
          <div className="divide-y divide-edge">
            {liveChecks.map((check) => (
              <div
                key={check.service}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-surface-card-hover"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    check.status === "ok"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : check.status === "degraded"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {check.status === "ok" ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : check.status === "degraded" ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize text-content">
                    {check.service.replace(/_/g, " ")}
                  </p>
                  {check.message && (
                    <p className="mt-0.5 text-xs text-content-faint">{check.message}</p>
                  )}
                </div>
                {check.latencyMs > 0 && (
                  <span className="text-xs font-mono text-content-faint">{check.latencyMs}ms</span>
                )}
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${
                    check.status === "ok"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : check.status === "degraded"
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {check.status === "ok" ? t("status_healthy") : check.status === "degraded" ? t("status_degraded") : t("status_down")}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-edge">
            {checkEntries.map(([name, check]) => (
              <div key={name} className="flex items-center gap-4 px-5 py-3.5">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${check.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d={check.ok ? "M4.5 12.75l6 6 9-13.5" : "M6 18L18 6M6 6l12 12"} />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize text-content">{name.replace(/_/g, " ")}</p>
                  {check.message && <p className="mt-0.5 text-xs text-content-faint">{check.message}</p>}
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${check.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                  {check.ok ? t("check_pass") : t("check_fail")}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Uptime History Grid */}
      <UptimeGrid uptimeData={uptimeData} loading={uptimeLoading} />

      {/* Error Types */}
      {!loading && errorSummary && errorSummary.groupedByType.length > 0 && (
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="border-b border-edge px-5 py-4">
            <h2 className="text-sm font-semibold text-content">
              {t("unresolved_errors_by_type")}
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-edge">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                    {t("col_error_type")}
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                    {t("col_count")}
                  </th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">
                    {t("col_last_seen")}
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
                      {g.lastOccurrence ? timeAgo(g.lastOccurrence, timeAgoLabels) : "--"}
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
            {t("empty_state")}
          </p>
        </div>
      )}
    </div>
  );
}
