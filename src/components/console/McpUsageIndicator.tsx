"use client";

import { useState, useEffect, createContext, useContext } from "react";

// ──────────────────────────────────────────────
// MCP Usage Indicator — radial progress ring
//
// Shows % of daily MCP budget used.
// Color-coded: green (<60%), amber (60-85%), red (>85%).
// Updates on mount + every 30s.
// Exposes usage context for other components.
// ──────────────────────────────────────────────

export interface UsageSummary {
  date: string;
  usage: { mcp_queries: number };
  limits: { daily_mcp_budget: number };
  mcp_remaining: number;
  mcp_pct: number;
}

// Shared usage context for chat and other components
export const McpUsageContext = createContext<UsageSummary | null>(null);

export function useMcpUsage(): UsageSummary | null {
  return useContext(McpUsageContext);
}

export function useUsageData() {
  const [data, setData] = useState<UsageSummary | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/usage");
        if (res.ok && mounted) {
          setData(await res.json());
        }
      } catch { /* ignore */ }
    };

    load();
    const interval = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  return data;
}

export default function McpUsageIndicator() {
  const data = useUsageData();

  if (!data) return null;

  const pct = Math.min(100, data.mcp_pct);
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  // Color based on usage percentage
  const color =
    pct >= 85
      ? "text-red-500"
      : pct >= 60
        ? "text-amber-500"
        : "text-emerald-500";

  const strokeColor =
    pct >= 85
      ? "#ef4444"
      : pct >= 60
        ? "#f59e0b"
        : "#10b981";

  return (
    <McpUsageContext.Provider value={data}>
      <div className="group relative flex items-center gap-1.5">
        {/* Radial ring */}
        <svg width="32" height="32" className="-rotate-90">
          {/* Background ring */}
          <circle
            cx="16" cy="16" r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className="text-surface-tooltip"
          />
          {/* Usage ring */}
          <circle
            cx="16" cy="16" r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>

        {/* Percentage label */}
        <span className={`text-[10px] font-medium tabular-nums ${color}`}>
          {pct}%
        </span>

        {/* Tooltip on hover */}
        <div className="pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 rounded bg-surface-tooltip px-2 py-1 text-[10px] text-content-tertiary opacity-0 shadow-lg transition-opacity group-hover:opacity-100 whitespace-nowrap z-50">
          MCP: {data.usage.mcp_queries}/{data.limits.daily_mcp_budget} today ({data.mcp_remaining} left)
          {pct >= 80 && " — budget is low"}
        </div>
      </div>
    </McpUsageContext.Provider>
  );
}
