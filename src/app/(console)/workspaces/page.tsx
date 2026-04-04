"use client";

import { useRouter } from "next/navigation";
import SeverityBadge from "@/components/console/SeverityBadge";
import ConsoleState from "@/components/console/ConsoleState";
import { loadWorkspaces } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import type { WorkspaceProjection } from "../../../../packages/projections";

// ──────────────────────────────────────────────
// Workspaces Page — Phase 4 UX Overhaul
//
// Card grid linking to workspace detail views.
// Cards show summary stats, change trend, and
// confidence narrative. No inline expansion.
// ──────────────────────────────────────────────

const workspaceTypeLabels: Record<string, string> = {
  preflight: "Scale Readiness",
  revenue: "Revenue Integrity",
  chargeback: "Chargeback Resilience",
};

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export default function WorkspacesPage() {
  const mcpData = useMcpData();
  const dataState = mcpData.workspaces.status !== "not_ready" ? mcpData.workspaces : loadWorkspaces();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Workspaces</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Contextual analysis views with quantified impact.
        </p>
      </div>
      <ConsoleState
        state={dataState}
        loadingLabel="Loading workspaces..."
        emptyLabel="No workspaces available."
      >
        {(workspaces) => <WorkspacesContent workspaces={workspaces} />}
      </ConsoleState>
    </div>
  );
}

function WorkspacesContent({
  workspaces,
}: {
  workspaces: WorkspaceProjection[];
}) {
  const router = useRouter();

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          onClick={() => router.push(`/app/workspaces/${ws.id}`)}
          className="group w-full rounded-lg border border-zinc-800 bg-zinc-900/50 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/80"
        >
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold text-zinc-100">
                  {ws.name}
                </span>
                <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">
                  {workspaceTypeLabels[ws.type] || ws.type}
                </span>
                <WorkspaceChangeTrend summary={ws.change_summary} />
              </div>
              <SeverityBadge value={ws.decision_impact} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-zinc-500">Monthly Loss</div>
                <div className="text-sm font-bold text-red-400">
                  {formatCurrency(ws.summary.total_loss_mid)}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Issues</div>
                <div className="text-sm font-medium text-zinc-300">
                  {ws.summary.issue_count}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Confidence</div>
                <div className="text-sm font-medium text-zinc-300">
                  {ws.summary.confidence}%
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Top Issue</div>
                <div className="truncate text-xs text-zinc-400">
                  {ws.summary.top_issues[0] || "\u2014"}
                </div>
              </div>
            </div>
            {ws.confidence_narrative && (
              <div className="mt-3 border-t border-zinc-800 pt-3">
                <div className="flex items-center gap-3 mb-2">
                  <ConfidenceBar
                    label="Structural"
                    level={ws.confidence_narrative.structural_confidence}
                  />
                  <ConfidenceBar
                    label="Economic"
                    level={ws.confidence_narrative.economic_confidence}
                  />
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  {ws.confidence_narrative.narrative}
                </p>
                {ws.confidence_narrative.uncertainty_factors.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {ws.confidence_narrative.uncertainty_factors.map(
                      (factor, i) => (
                        <li key={i} className="text-[11px] text-zinc-600">
                          &bull; {factor}
                        </li>
                      )
                    )}
                  </ul>
                )}
              </div>
            )}
            {/* View details link */}
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-400 opacity-0 transition-opacity group-hover:opacity-100">
              View details <span>&rarr;</span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────
// Workspace Change Trend Indicator — Phase 2 UX
// ──────────────────────────────────────────────

function WorkspaceChangeTrend({
  summary,
}: {
  summary: WorkspaceProjection["change_summary"];
}) {
  if (!summary) return null;

  const config: Record<string, { icon: string; color: string; label: string }> =
    {
      degrading: {
        icon: "\u2191",
        color: "text-red-400",
        label: `${summary.regression_count} regression${
          summary.regression_count !== 1 ? "s" : ""
        }`,
      },
      improving: {
        icon: "\u2193",
        color: "text-emerald-400",
        label: `${summary.improvement_count} improvement${
          summary.improvement_count !== 1 ? "s" : ""
        }`,
      },
      stable: { icon: "\u2014", color: "text-zinc-500", label: "stable" },
      mixed: {
        icon: "\u2195",
        color: "text-amber-400",
        label: "mixed changes",
      },
    };

  const c = config[summary.trend] || config.stable;

  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium ${c.color}`}
    >
      <span className="text-xs">{c.icon}</span>
      {c.label}
    </span>
  );
}

function ConfidenceBar({
  label,
  level,
}: {
  label: string;
  level: "high" | "medium" | "low";
}) {
  const color =
    level === "high"
      ? "bg-emerald-500"
      : level === "medium"
      ? "bg-amber-500"
      : "bg-red-500";
  const textColor =
    level === "high"
      ? "text-emerald-400"
      : level === "medium"
      ? "text-amber-400"
      : "text-red-400";
  const widthPct = level === "high" ? 100 : level === "medium" ? 60 : 30;

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-zinc-500">{label}</span>
        <span className={`text-[10px] font-medium ${textColor}`}>{level}</span>
      </div>
      <div className="h-1 rounded-full bg-zinc-800">
        <div
          className={`h-1 rounded-full ${color}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}
