"use client";

import { useState, useEffect } from "react";

// ──────────────────────────────────────────────
// Admin Overview — platform-wide stats (wired)
// ──────────────────────────────────────────────

interface PlatformStats {
  total_orgs: number;
  total_mcp_queries: number;
  total_playwright_runs: number;
  total_cost_cents: number;
  orgs_over_mcp_limit: number;
}

function cents(n: number): string {
  return `$${(n / 100).toFixed(2)}`;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/usage");
        if (res.ok) {
          const data = await res.json();
          setStats(data.totals || null);
        }
      } catch { /* ignore */ }
      setLoading(false);
    }
    load();
  }, []);

  const cards = stats
    ? [
        { label: "Organizations", value: String(stats.total_orgs) },
        { label: "MCP Today", value: String(stats.total_mcp_queries) },
        { label: "Playwright Today", value: String(stats.total_playwright_runs) },
        { label: "Revenue Est.", value: cents(stats.total_cost_cents) },
      ]
    : [
        { label: "Organizations", value: loading ? "..." : "—" },
        { label: "MCP Today", value: loading ? "..." : "—" },
        { label: "Playwright Today", value: loading ? "..." : "—" },
        { label: "Revenue Est.", value: loading ? "..." : "—" },
      ];

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Platform Overview</h1>
        <p className="mt-1 text-sm text-zinc-500">Platform-wide metrics and health.</p>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">{card.label}</div>
            <div className="mt-1 text-xl font-bold text-zinc-100">{card.value}</div>
          </div>
        ))}
      </div>

      {stats && stats.orgs_over_mcp_limit > 0 && (
        <div className="rounded-md border border-amber-800/50 bg-amber-900/20 px-4 py-3 text-sm text-amber-400">
          {stats.orgs_over_mcp_limit} organization(s) have exceeded their daily MCP budget.
        </div>
      )}

      {!loading && !stats && (
        <p className="text-sm text-zinc-500">
          Connect usage data to see live platform metrics.
        </p>
      )}
    </div>
  );
}
