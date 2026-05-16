"use client";

import { useMemo, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useMcpData } from "@/components/app/McpDataProvider";
import { fmtCurrency } from "@/lib/format-currency";
import type { WorkspaceProjection } from "../../../packages/projections";

// ──────────────────────────────────────────────
// Revenue Map — where the money leaks
// Styled to match dashboard widget cards.
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
  // Wave 18g — copy_alignment was being silently bucketed into "trust"
  // because of the catch-all return below, which is why the revenue
  // map showed only three dimensions even when the customer had real
  // copy_alignment findings. Now an explicit branch keeps copy as its
  // own dimension (the PERSPECTIVE_STYLE map already had the color).
  if (ws.category === "behavioral") return "behavior";
  if (ws.type === "revenue" || ws.type === "chargeback") return "revenue";
  if (ws.type === "preflight") return "trust";
  if (ws.type === "copy_alignment") return "copy";
  return "trust";
}

// fmt delegates to shared currency formatter — resolved per-component via useMcpData

interface RevenueMapProps {
  workspaces: WorkspaceProjection[];
  filterPerspective?: string;
}

export default function RevenueMap({ workspaces, filterPerspective }: RevenueMapProps) {
  const t = useTranslations("console.workspaces");
  const tc = useTranslations("console.common");
  const { currency } = useMcpData();
  const fmt = (value: number) => fmtCurrency(value, currency);
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
    <div className="flex h-full flex-col p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
          {t("lenses.revenue_map")}
        </span>
        <span className="font-mono text-[10px] tabular-nums text-content-faint">{tc("per_month_short")}</span>
      </div>

      <div className="flex-1 space-y-3">
        {buckets.map((b, i) => {
          const pct = Math.max(3, (b.totalLoss / maxLoss) * 100);
          return (
            <div key={b.key}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs text-content-secondary">{b.label}</span>
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] tabular-nums text-content-faint">{b.issueCount}</span>
                  <span className={`font-mono text-sm font-medium tabular-nums ${b.textColor}`}>{fmt(b.totalLoss)}</span>
                </div>
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface-inset">
                <div
                  className={`h-1.5 rounded-full ${b.barColor}`}
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

      {buckets.length > 1 && (
        <div className="mt-3 flex items-baseline justify-between border-t border-edge/40 pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
            {t("lenses.total_exposure")}
          </span>
          <span className="font-mono text-base font-medium tabular-nums text-red-400">
            {fmt(totalExposure)}
          </span>
        </div>
      )}
    </div>
  );
}
