"use client";

import { useState, useEffect } from "react";

// ──────────────────────────────────────────────
// Admin — Usage Dashboard + Unit Economics
//
// Shows:
//   - Usage per org (MCP queries, Playwright, tokens)
//   - Cost estimate per org
//   - Orgs over limits
//   - Unit economics per plan (cost/margin)
//   - Auditable usage log
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

function cents(n: number): string {
  return `$${(n / 100).toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark dark:text-white">Usage & Billing</h1>
          <p className="mt-1 text-sm text-body-color">Daily capacity usage, cost estimates, and unit economics.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-md border border-stroke dark:border-stroke-dark">
            <button
              onClick={() => setTab("usage")}
              className={`px-3 py-1.5 text-xs font-medium ${tab === "usage" ? "bg-primary text-white" : "text-body-color hover:text-dark dark:hover:text-white"}`}
            >Usage</button>
            <button
              onClick={() => setTab("economics")}
              className={`px-3 py-1.5 text-xs font-medium ${tab === "economics" ? "bg-primary text-white" : "text-body-color hover:text-dark dark:hover:text-white"}`}
            >Unit Economics</button>
            <button
              onClick={() => setTab("tokens")}
              className={`px-3 py-1.5 text-xs font-medium ${tab === "tokens" ? "bg-primary text-white" : "text-body-color hover:text-dark dark:hover:text-white"}`}
            >Tokens</button>
          </div>
          {tab === "usage" && (
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-stroke bg-transparent px-3 py-1.5 text-sm dark:border-stroke-dark" />
          )}
          {tab === "tokens" && (
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)}
              className="rounded-md border border-stroke bg-transparent px-3 py-1.5 text-sm dark:border-stroke-dark" />
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {tab === "usage" && totals && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            { label: "Organizations", value: String(totals.total_orgs) },
            { label: "MCP Queries", value: String(totals.total_mcp_queries) },
            { label: "Playwright Runs", value: String(totals.total_playwright_runs) },
            { label: "Est. Cost Today", value: cents(totals.total_cost_cents) },
            { label: "Over Limit", value: String(totals.orgs_over_mcp_limit), warn: totals.orgs_over_mcp_limit > 0 },
          ].map((card) => (
            <div key={card.label} className="rounded-md border border-stroke bg-white px-4 py-3 dark:border-stroke-dark dark:bg-gray-dark">
              <div className="text-xs font-medium uppercase tracking-wider text-body-color">{card.label}</div>
              <div className={`mt-1 text-xl font-bold ${"warn" in card && card.warn ? "text-red-500" : "text-dark dark:text-white"}`}>
                {card.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Usage Table */}
      {tab === "usage" && (
        <div className="overflow-x-auto rounded-lg border border-stroke dark:border-stroke-dark">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stroke bg-gray-1 dark:border-stroke-dark dark:bg-gray-dark">
                <th className="px-4 py-3 font-medium">Organization</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">MCP</th>
                <th className="px-4 py-3 font-medium">Playwright</th>
                <th className="px-4 py-3 font-medium">Tokens</th>
                <th className="px-4 py-3 font-medium">Est. Cost</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-body-color">Loading...</td></tr>
              ) : orgs.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-body-color">No usage data for this date.</td></tr>
              ) : (
                orgs.map((row) => (
                  <tr key={row.org_id} className="border-b border-stroke dark:border-stroke-dark">
                    <td className="px-4 py-3 font-medium">{row.org_name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{row.plan}</span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {row.mcp_queries}/{row.limits.daily_mcp_budget}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      {row.playwright_runs}/{row.limits.playwright_budget}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{row.estimated_tokens.toLocaleString()}</td>
                    <td className="px-4 py-3 font-mono">{cents(row.cost.total_cost_cents)}</td>
                    <td className="px-4 py-3">
                      {row.is_over_mcp_limit || row.is_over_playwright_limit ? (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                          Over limit
                        </span>
                      ) : (
                        <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
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
      )}

      {/* Unit Economics Table */}
      {tab === "economics" && (
        <div className="overflow-x-auto rounded-lg border border-stroke dark:border-stroke-dark">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stroke bg-gray-1 dark:border-stroke-dark dark:bg-gray-dark">
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Monthly Price</th>
                <th className="px-4 py-3 font-medium">Max Daily Cost</th>
                <th className="px-4 py-3 font-medium">Max Monthly Cost</th>
                <th className="px-4 py-3 font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-body-color">Loading...</td></tr>
              ) : economics.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-body-color">No economics data.</td></tr>
              ) : (
                economics.map((row) => (
                  <tr key={row.plan} className="border-b border-stroke dark:border-stroke-dark">
                    <td className="px-4 py-3 font-medium capitalize">{row.plan}</td>
                    <td className="px-4 py-3 font-mono">{cents(row.monthly_price_cents)}</td>
                    <td className="px-4 py-3 font-mono">{cents(row.estimated_max_daily_cost_cents)}</td>
                    <td className="px-4 py-3 font-mono">{cents(row.estimated_max_monthly_cost_cents)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${
                        row.margin_pct >= 50
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : row.margin_pct >= 20
                            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
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
      )}

      {/* Tokens Tab */}
      {tab === "tokens" && tokenData && (
        <>
          {/* Token Summary Cards */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Cost", value: cents(tokenData.totals?.totalCostCents || 0) },
              { label: "Total Calls", value: String(tokenData.totals?.totalCalls || 0) },
              { label: "Input Tokens", value: formatTokens(tokenData.totals?.totalInputTokens || 0) },
              { label: "Output Tokens", value: formatTokens(tokenData.totals?.totalOutputTokens || 0) },
            ].map((card) => (
              <div key={card.label} className="rounded-md border border-stroke bg-white px-4 py-3 dark:border-stroke-dark dark:bg-gray-dark">
                <div className="text-xs font-medium uppercase tracking-wider text-body-color">{card.label}</div>
                <div className="mt-1 text-xl font-bold text-dark dark:text-white">{card.value}</div>
              </div>
            ))}
          </div>

          {/* Token Usage by Org */}
          <div className="overflow-x-auto rounded-lg border border-stroke dark:border-stroke-dark">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-1 dark:bg-gray-dark">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-body-color">Organization</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-body-color">Calls</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-body-color">Input Tokens</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-body-color">Output Tokens</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-body-color">Cost</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-body-color">By Model</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stroke dark:divide-stroke-dark">
                {(tokenData.organizations || []).map((org: any) => (
                  <tr key={org.organizationId} className="hover:bg-gray-1 dark:hover:bg-gray-dark/50">
                    <td className="px-4 py-3 font-medium text-dark dark:text-white">{org.orgName}</td>
                    <td className="px-4 py-3 font-mono text-body-color">{org.callCount}</td>
                    <td className="px-4 py-3 font-mono text-body-color">{formatTokens(org.totalInputTokens)}</td>
                    <td className="px-4 py-3 font-mono text-body-color">{formatTokens(org.totalOutputTokens)}</td>
                    <td className="px-4 py-3 font-mono font-bold text-dark dark:text-white">{cents(org.totalCostCents)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(org.byModel || {}).map(([model, data]: [string, any]) => (
                          <span key={model} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium dark:bg-gray-dark">
                            {model.replace(/_/g, " ")}: {cents(data.cost)}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {(!tokenData.organizations || tokenData.organizations.length === 0) && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-body-color">No token usage data for this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "tokens" && !tokenData && !loading && (
        <div className="py-12 text-center text-body-color">No token data available.</div>
      )}
    </div>
  );
}
