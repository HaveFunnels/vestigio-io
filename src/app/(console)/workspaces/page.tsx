"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import SeverityBadge from "@/components/console/SeverityBadge";
import ConsoleState from "@/components/console/ConsoleState";
import { loadWorkspaces } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import { ShinyButton } from "@/components/ui/shiny-button";
import type { WorkspaceProjection } from "../../../../packages/projections";

// ──────────────────────────────────────────────
// Workspaces Page — Phase 4 UX Overhaul
// ──────────────────────────────────���───────────

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export default function WorkspacesPage() {
  const mcpData = useMcpData();
  const dataState = mcpData.workspaces.status !== "not_ready" ? mcpData.workspaces : loadWorkspaces();
  const t = useTranslations("console.workspaces");

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-content">{t("title")}</h1>
        <p className="mt-1 text-sm text-content-muted">{t("subtitle")}</p>
      </div>
      <ConsoleState
        state={dataState}
        loadingLabel={t("loading")}
        emptyLabel={t("empty")}
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
  const t = useTranslations("console.workspaces");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  return (
    <>
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-4 rounded-lg border border-edge bg-surface-card px-4 py-2.5 shadow-lg">
          <span className="text-sm font-medium text-content">{t("selected", { count: selectedIds.size })}</span>
          <div className="flex-1" />
          <ShinyButton onClick={() => router.push(`/chat?context=workspaces:${[...selectedIds].join(",")}`)}>
            {t("use_as_context")}
          </ShinyButton>
          <button onClick={() => setSelectedIds(new Set())} className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-content-muted transition-colors hover:bg-surface-card-hover">{t("clear")}</button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {workspaces.map((ws) => (
        <button
          key={ws.id}
          onClick={() => router.push(`/app/workspaces/${ws.id}`)}
          className={`group relative w-full rounded-lg border text-left transition-colors hover:border-edge hover:bg-surface-card-hover ${selectedIds.has(ws.id) ? "border-indigo-500/40 bg-indigo-500/5" : "border-edge bg-surface-card"}`}
        >
          <div className="absolute right-3 top-3 z-10" onClick={(e) => toggleSelect(ws.id, e)}>
            <input type="checkbox" checked={selectedIds.has(ws.id)} readOnly className="h-3.5 w-3.5 cursor-pointer rounded border-edge bg-surface-input text-indigo-500 focus:ring-0" />
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-base font-semibold text-content">
                  {ws.name}
                </span>
                <span className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">
                  {t.has(`types.${ws.type}`) ? t(`types.${ws.type}`) : ws.type}
                </span>
                <WorkspaceChangeTrend summary={ws.change_summary} />
              </div>
              <SeverityBadge value={ws.decision_impact} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-content-faint">{t("monthly_loss")}</div>
                <div className="text-sm font-bold text-red-500 dark:text-red-400">
                  {formatCurrency(ws.summary.total_loss_mid)}
                </div>
              </div>
              <div>
                <div className="text-xs text-content-faint">{t("issues")}</div>
                <div className="text-sm font-medium text-content-secondary">
                  {ws.summary.issue_count}
                </div>
              </div>
              <div>
                <div className="text-xs text-content-faint">{t("confidence")}</div>
                <div className="text-sm font-medium text-content-secondary">
                  {ws.summary.confidence}%
                </div>
              </div>
              <div>
                <div className="text-xs text-content-faint">{t("top_issue")}</div>
                <div className="truncate text-xs text-content-muted">
                  {ws.summary.top_issues[0] || "\u2014"}
                </div>
              </div>
            </div>
            {ws.confidence_narrative && (
              <div className="mt-3 border-t border-edge pt-3">
                <div className="flex items-center gap-3 mb-2">
                  <ConfidenceBar
                    label={t("structural")}
                    level={ws.confidence_narrative.structural_confidence}
                  />
                  <ConfidenceBar
                    label={t("economic")}
                    level={ws.confidence_narrative.economic_confidence}
                  />
                </div>
                <p className="text-xs text-content-muted leading-relaxed">
                  {ws.confidence_narrative.narrative}
                </p>
                {ws.confidence_narrative.uncertainty_factors.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {ws.confidence_narrative.uncertainty_factors.map(
                      (factor, i) => (
                        <li key={i} className="text-[11px] text-content-faint">
                          &bull; {factor}
                        </li>
                      )
                    )}
                  </ul>
                )}
              </div>
            )}
            <div className="mt-3 flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
              {t("view_details")} <span>&rarr;</span>
            </div>
          </div>
        </button>
      ))}
    </div>
    </>
  );
}

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
        color: "text-red-500 dark:text-red-400",
        label: `${summary.regression_count} regression${
          summary.regression_count !== 1 ? "s" : ""
        }`,
      },
      improving: {
        icon: "\u2193",
        color: "text-emerald-600 dark:text-emerald-400",
        label: `${summary.improvement_count} improvement${
          summary.improvement_count !== 1 ? "s" : ""
        }`,
      },
      stable: { icon: "\u2014", color: "text-content-faint", label: "stable" },
      mixed: {
        icon: "\u2195",
        color: "text-amber-600 dark:text-amber-400",
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
      ? "text-emerald-600 dark:text-emerald-400"
      : level === "medium"
      ? "text-amber-600 dark:text-amber-400"
      : "text-red-600 dark:text-red-400";
  const widthPct = level === "high" ? 100 : level === "medium" ? 60 : 30;

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-content-faint">{label}</span>
        <span className={`text-[10px] font-medium ${textColor}`}>{level}</span>
      </div>
      <div className="h-1 rounded-full bg-surface-inset">
        <div
          className={`h-1 rounded-full ${color}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}
