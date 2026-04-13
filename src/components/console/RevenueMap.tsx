"use client";

import { useMemo, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import type { WorkspaceProjection } from "../../../packages/projections";

// ──────────────────────────────────────────────
// Revenue Map — where the money leaks
//
// Horizontal bars with inline labels.
// The hero lens — gets 60% width in the grid.
// Animates bars on mount for visual punch.
// ──────────────────────────────────────────────

interface PerspectiveBucket {
  key: string;
  label: string;
  totalLoss: number;
  issueCount: number;
  barColor: string;
  textColor: string;
}

const PERSPECTIVE_STYLE: Record<string, { barColor: string; textColor: string }> = {
  revenue: { barColor: "bg-red-500/80", textColor: "text-red-400" },
  trust: { barColor: "bg-amber-500/80", textColor: "text-amber-400" },
  behavior: { barColor: "bg-violet-500/80", textColor: "text-violet-400" },
  copy: { barColor: "bg-sky-500/80", textColor: "text-sky-400" },
};

function classifyWorkspacePerspective(ws: WorkspaceProjection): string {
  if (ws.category === "behavioral") return "behavior";
  if (ws.type === "revenue" || ws.type === "chargeback") return "revenue";
  if (ws.type === "preflight") return "trust";
  return "trust";
}

function fmt(value: number, currency = "BRL"): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

interface RevenueMapProps {
  workspaces: WorkspaceProjection[];
  filterPerspective?: string;
}

export default function RevenueMap({ workspaces, filterPerspective }: RevenueMapProps) {
  const t = useTranslations("console.workspaces");
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setAnimated(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const buckets = useMemo(() => {
    const map: Record<string, PerspectiveBucket> = {};
    const labels: Record<string, string> = {
      revenue: t("perspectives.revenue"),
      trust: t("perspectives.trust"),
      behavior: t("perspectives.behavior"),
      copy: t("perspectives.copy"),
    };

    for (const ws of workspaces) {
      const p = classifyWorkspacePerspective(ws);
      if (filterPerspective && p !== filterPerspective) continue;
      if (!map[p]) {
        const style = PERSPECTIVE_STYLE[p] || PERSPECTIVE_STYLE.trust;
        map[p] = { key: p, label: labels[p] || p, totalLoss: 0, issueCount: 0, ...style };
      }
      map[p].totalLoss += ws.summary.total_loss_mid;
      map[p].issueCount += ws.summary.issue_count;
    }

    return Object.values(map).sort((a, b) => b.totalLoss - a.totalLoss);
  }, [workspaces, filterPerspective, t]);

  const maxLoss = Math.max(...buckets.map((b) => b.totalLoss), 1);
  const totalExposure = buckets.reduce((s, b) => s + b.totalLoss, 0);

  if (buckets.length === 0) return null;

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500">
          {t("lenses.revenue_map")}
        </h3>
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-zinc-600">
          /mo
        </span>
      </div>

      <div className="space-y-2.5">
        {buckets.map((b, i) => {
          const pct = Math.max(3, (b.totalLoss / maxLoss) * 100);
          return (
            <div key={b.key}>
              {/* Label row */}
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[12px] font-medium text-zinc-400">
                  {b.label}
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-[11px] text-zinc-600">
                    {b.issueCount}
                  </span>
                  <span className={`font-[family-name:var(--font-jetbrains-mono)] text-[14px] font-semibold tabular-nums ${b.textColor}`}>
                    {fmt(b.totalLoss)}
                  </span>
                </div>
              </div>
              {/* Bar */}
              <div className="h-[6px] w-full bg-white/[0.03]">
                <div
                  className={`h-full ${b.barColor}`}
                  style={{
                    width: animated ? `${pct}%` : "0%",
                    transition: `width 600ms cubic-bezier(0.16, 1, 0.3, 1) ${i * 80}ms`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      {buckets.length > 1 && (
        <div className="mt-3 flex items-baseline justify-between border-t border-white/[0.04] pt-3">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] uppercase tracking-wider text-zinc-600">
            {t("lenses.total_exposure")}
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[16px] font-bold tabular-nums text-red-400">
            {fmt(totalExposure)}
          </span>
        </div>
      )}
    </div>
  );
}
