"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { WorkspaceProjection } from "../../../packages/projections";

// ──────────────────────────────────────────────
// Revenue Map — horizontal bar chart showing $
// impact by perspective. Uses JetBrains Mono for
// dollar amounts. Color-coded by severity.
// ──────────────────────────────────────────────

interface PerspectiveBucket {
  key: string;
  label: string;
  totalLoss: number;
  issueCount: number;
  color: string;
  bgColor: string;
}

const PERSPECTIVE_CONFIG: Record<
  string,
  { color: string; bgColor: string }
> = {
  revenue: { color: "bg-red-500", bgColor: "text-red-400" },
  trust: { color: "bg-amber-500", bgColor: "text-amber-400" },
  behavior: { color: "bg-violet-500", bgColor: "text-violet-400" },
  copy: { color: "bg-blue-500", bgColor: "text-blue-400" },
};

function classifyWorkspacePerspective(ws: WorkspaceProjection): string {
  if (ws.category === "behavioral") return "behavior";
  if (ws.type === "revenue" || ws.type === "chargeback") return "revenue";
  if (ws.type === "preflight") return "trust";
  // copy perspective — would be separate packs when available
  return "trust";
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

interface RevenueMapProps {
  workspaces: WorkspaceProjection[];
  /** Filter to a single perspective */
  filterPerspective?: string;
}

export default function RevenueMap({
  workspaces,
  filterPerspective,
}: RevenueMapProps) {
  const t = useTranslations("console.workspaces");

  const buckets = useMemo(() => {
    const map: Record<string, PerspectiveBucket> = {};

    const perspectiveLabels: Record<string, string> = {
      revenue: t("perspectives.revenue"),
      trust: t("perspectives.trust"),
      behavior: t("perspectives.behavior"),
      copy: t("perspectives.copy"),
    };

    for (const ws of workspaces) {
      const perspective = classifyWorkspacePerspective(ws);
      if (filterPerspective && perspective !== filterPerspective) continue;

      if (!map[perspective]) {
        const config = PERSPECTIVE_CONFIG[perspective] || PERSPECTIVE_CONFIG.trust;
        map[perspective] = {
          key: perspective,
          label: perspectiveLabels[perspective] || perspective,
          totalLoss: 0,
          issueCount: 0,
          color: config.color,
          bgColor: config.bgColor,
        };
      }
      map[perspective].totalLoss += ws.summary.total_loss_mid;
      map[perspective].issueCount += ws.summary.issue_count;
    }

    return Object.values(map).sort((a, b) => b.totalLoss - a.totalLoss);
  }, [workspaces, filterPerspective, t]);

  const maxLoss = Math.max(...buckets.map((b) => b.totalLoss), 1);

  if (buckets.length === 0) return null;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
      <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-content-muted">
        {t("lenses.revenue_map")}
      </h3>
      <div className="space-y-3">
        {buckets.map((bucket) => {
          const widthPct = Math.max(4, (bucket.totalLoss / maxLoss) * 100);
          return (
            <div key={bucket.key}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-content-secondary">
                  {bucket.label}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-content-faint">
                    {bucket.issueCount} {bucket.issueCount === 1 ? "issue" : "issues"}
                  </span>
                  <span
                    className={`font-[family-name:var(--font-jetbrains-mono)] text-sm font-semibold ${bucket.bgColor}`}
                  >
                    {formatCurrency(bucket.totalLoss)}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full rounded-full bg-white/[0.04]">
                <div
                  className={`h-2 rounded-full ${bucket.color} transition-all duration-500`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 border-t border-white/[0.04] pt-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-content-faint">{t("lenses.total_exposure")}</span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-sm font-bold text-red-400">
            {formatCurrency(buckets.reduce((s, b) => s + b.totalLoss, 0))}
          </span>
        </div>
      </div>
    </div>
  );
}
