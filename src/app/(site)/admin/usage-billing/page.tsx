"use client";

import { useState, useEffect } from "react";

// ──────────────────────────────────────────────
// Admin — Usage Dashboard + Unit Economics
// Matches Overview visual identity.
// ──────────────────────────────────────────────

interface OrgUsageRow {
  org_id: string;
  org_name: string;
  plan: string;
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
  limits: {
    daily_mcp_budget: number;
    playwright_budget: number;
  };
}

interface UsageTotals {
  total_orgs: number;
  total_mcp_queries: number;
  total_playwright_runs: number;
  total_cost_cents: number;
  orgs_over_mcp_limit: number;
}

interface PlanEconomics {
  plan: string;
  monthly_price_cents: number;
  estimated_max_daily_cost_cents: number;
  estimated_max_monthly_cost_cents: number;
  margin_pct: number;
}

/* ---------- Helpers ---------- */

function cents(n: number): string {
  return `$${(n / 100).toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

/* ---------- Icons ---------- */

const icons = {
  bolt: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
    </svg>
  ),
  playwright: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
    </svg>
  ),
  currencyDollar: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  exclamation: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  building: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21" />
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

export default function AdminUsageBillingPage() {
  const [tab, setTab] = useState<"usage" | "economics" | "tokens">("usage");
  const [date, setDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [orgs, setOrgs] = useState<OrgUsageRow[]>([]);
  const [totals, setTotals] = useState<UsageTotals | null>(null);
  const [economics, setEconomics] = useState<PlanEconomics[]>([]);
  const [tokenData, setTokenData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab === "usage") fetchUsage();
    if (tab === "economics") fetchEconomics();
    if (tab === "tokens") fetchTokenCosts();
  }, [tab, date, period]);

  async function fetchUsage() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/usage?date=${date}`);
      if (res.ok) {
        const data = await res.json();
        setOrgs(data.organizations || []);
        setTotals(data.totals || null);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function fetchEconomics() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/usage?view=unit_economics");
      if (res.ok) {
        const data = await res.json();
        setEconomics(data.economics || []);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  async function fetchTokenCosts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/usage?view=token_costs&period=${period}`);
      if (res.ok) {
        const data = await res.json();
        setTokenData(data);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  const placeholder = loading ? "..." : "--";

  const tabs = [
    { key: "usage" as const, label: "Usage" },
    { key: "economics" as const, label: "Unit Economics" },
    { key: "tokens" as const, label: "Tokens" },
  ];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-content">Usage & Billing</h1>
          <p className="mt-1 text-sm text-content-muted">
            Daily capacity usage, cost estimates, and unit economics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Tab switcher */}
          <div className="flex rounded-lg border border-edge">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.key
                    ? "bg-accent-subtle-bg/10 text-accent-text"
                    : "text-content-muted hover:text-content-secondary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab === "usage" && (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          )}
          {tab === "tokens" && (
            <input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="rounded-lg border border-edge bg-surface-card px-3 py-1.5 text-sm text-content focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          )}
        </div>
      </div>

      {/* ── Usage Tab ── */}
      {tab === "usage" && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Organizations"
              value={totals ? String(totals.total_orgs) : placeholder}
              sub="Active orgs with usage"
              icon={icons.building}
            />
            <StatCard
              label="MCP Queries"
              value={totals ? formatNum(totals.total_mcp_queries) : placeholder}
              sub="Today"
              icon={icons.bolt}
              accent
            />
            <StatCard
              label="Playwright Runs"
              value={totals ? formatNum(totals.total_playwright_runs) : placeholder}
              sub="Today"
              icon={icons.playwright}
            />
            <StatCard
              label="Est. Cost Today"
              value={totals ? cents(totals.total_cost_cents) : placeholder}
              sub={totals && totals.orgs_over_mcp_limit > 0 ? `${totals.orgs_over_mcp_limit} over limit` : "All within limits"}
              icon={icons.currencyDollar}
              accent
              warn={!!totals && totals.orgs_over_mcp_limit > 0}
            />
          </div>

          {/* Over limit warning */}
          {totals && totals.orgs_over_mcp_limit > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-5 py-3">
              <span className="text-amber-400">{icons.exclamation}</span>
              <p className="text-sm text-amber-300">
                <span className="font-semibold">{totals.orgs_over_mcp_limit} organization(s)</span>{" "}
                have exceeded their daily MCP budget.
              </p>
            </div>
          )}

          {/* Usage table */}
          <div className="rounded-lg border border-edge bg-surface-card">
            <div className="border-b border-edge px-5 py-4">
              <h2 className="text-sm font-semibold text-content">Usage by Organization</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-edge">
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Organization</th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Plan</th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">MCP</th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Playwright</th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Tokens</th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Est. Cost</th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-sm text-content-faint">Loading...</td>
                    </tr>
                  ) : orgs.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-12 text-center text-sm text-content-faint">No usage data for this date.</td>
                    </tr>
                  ) : (
                    orgs.map((row) => (
                      <tr key={row.org_id} className="hover:bg-surface-card-hover">
                        <td className="px-5 py-3 font-medium text-content">{row.org_name}</td>
                        <td className="px-5 py-3">
                          <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${
                            row.plan === "max"
                              ? "bg-purple-500/10 text-purple-400"
                              : row.plan === "pro"
                                ? "bg-accent-subtle-bg/10 text-accent-text"
                                : "bg-surface-inset text-content-muted"
                          }`}>
                            {row.plan}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-content-secondary">
                          {row.mcp_queries}/{row.limits.daily_mcp_budget}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-content-secondary">
                          {row.playwright_runs}/{row.limits.playwright_budget}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-content-secondary">
                          {formatTokens(row.estimated_tokens)}
                        </td>
                        <td className="px-5 py-3 font-mono text-sm font-semibold text-content tabular-nums">
                          {cents(row.cost.total_cost_cents)}
                        </td>
                        <td className="px-5 py-3">
                          {row.is_over_mcp_limit || row.is_over_playwright_limit ? (
                            <span className="rounded bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                              Over limit
                            </span>
                          ) : (
                            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
                              OK
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Unit Economics Tab ── */}
      {tab === "economics" && (
        <div className="rounded-lg border border-edge bg-surface-card">
          <div className="border-b border-edge px-5 py-4">
            <h2 className="text-sm font-semibold text-content">Unit Economics by Plan</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-edge">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Plan</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Monthly Price</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Max Daily Cost</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Max Monthly Cost</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-content-faint">Loading...</td>
                  </tr>
                ) : economics.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-content-faint">No economics data.</td>
                  </tr>
                ) : (
                  economics.map((row) => (
                    <tr key={row.plan} className="hover:bg-surface-card-hover">
                      <td className="px-5 py-3 font-medium capitalize text-content">{row.plan}</td>
                      <td className="px-5 py-3 font-mono text-content-secondary tabular-nums">{cents(row.monthly_price_cents)}</td>
                      <td className="px-5 py-3 font-mono text-content-secondary tabular-nums">{cents(row.estimated_max_daily_cost_cents)}</td>
                      <td className="px-5 py-3 font-mono text-content-secondary tabular-nums">{cents(row.estimated_max_monthly_cost_cents)}</td>
                      <td className="px-5 py-3">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                          row.margin_pct >= 50
                            ? "bg-emerald-500/10 text-emerald-400"
                            : row.margin_pct >= 20
                              ? "bg-amber-500/10 text-amber-400"
                              : "bg-red-500/10 text-red-400"
                        }`}>
                          {row.margin_pct}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tokens Tab ── */}
      {tab === "tokens" && (
        <>
          {/* Token summary cards */}
          {tokenData && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total Cost"
                value={cents(tokenData.totals?.totalCostCents || 0)}
                sub="This period"
                icon={icons.currencyDollar}
                accent
              />
              <StatCard
                label="Total Calls"
                value={formatNum(tokenData.totals?.totalCalls || 0)}
                sub="LLM invocations"
                icon={icons.bolt}
              />
              <StatCard
                label="Input Tokens"
                value={formatTokens(tokenData.totals?.totalInputTokens || 0)}
                sub="Prompt tokens"
                icon={icons.bolt}
              />
              <StatCard
                label="Output Tokens"
                value={formatTokens(tokenData.totals?.totalOutputTokens || 0)}
                sub="Completion tokens"
                icon={icons.bolt}
              />
            </div>
          )}

          {/* Token usage by org */}
          <div className="rounded-lg border border-edge bg-surface-card">
            <div className="border-b border-edge px-5 py-4">
              <h2 className="text-sm font-semibold text-content">Token Usage by Organization</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-edge">
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Organization</th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Calls</th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Input Tokens</th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Output Tokens</th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">Cost</th>
                    <th className="px-5 py-3 text-xs font-medium uppercase tracking-wider text-content-muted">By Model</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-edge">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-sm text-content-faint">Loading...</td>
                    </tr>
                  ) : tokenData?.organizations?.length > 0 ? (
                    tokenData.organizations.map((org: any) => (
                      <tr key={org.organizationId} className="hover:bg-surface-card-hover">
                        <td className="px-5 py-3 font-medium text-content">{org.orgName}</td>
                        <td className="px-5 py-3 font-mono text-content-secondary">{org.callCount}</td>
                        <td className="px-5 py-3 font-mono text-content-secondary">{formatTokens(org.totalInputTokens)}</td>
                        <td className="px-5 py-3 font-mono text-content-secondary">{formatTokens(org.totalOutputTokens)}</td>
                        <td className="px-5 py-3 font-mono font-semibold text-content tabular-nums">{cents(org.totalCostCents)}</td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(org.byModel || {}).map(([model, data]: [string, any]) => (
                              <span key={model} className="rounded bg-surface-inset px-1.5 py-0.5 text-[10px] font-medium text-content-muted">
                                {model.replace(/_/g, " ")}: {cents(data.cost)}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-5 py-12 text-center text-sm text-content-faint">No token usage data for this period.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!tokenData && !loading && (
            <div className="rounded-lg border border-dashed border-edge px-6 py-12 text-center">
              <p className="text-sm text-content-faint">No token data available.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
