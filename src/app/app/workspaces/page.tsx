"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import SeverityBadge from "@/components/console/SeverityBadge";
import ConsoleState from "@/components/console/ConsoleState";
import PageHeader from "@/components/console/PageHeader";
import PulseSummary from "@/components/console/PulseSummary";
import RevenueMap from "@/components/console/RevenueMap";
import CycleDelta from "@/components/console/CycleDelta";
import BraggingRights from "@/components/console/BraggingRights";
import CrossSignalChainCard from "@/components/console/cross-signals/CrossSignalChainCard";
import TrendSparkline, { synthesizeSparklineData } from "@/components/console/workspace/TrendSparkline";
import { loadWorkspaces } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import type { WorkspaceProjection } from "../../../../packages/projections";
import type { CrossSignalChain } from "@/lib/dashboard/types";

// ──────────────────────────────────────────────
// Panorama — workspace command center
//
// Layout:
//   [Pulse Summary — full width intel strip]
//   [Revenue Map (60%)  | Delta + Rights (40%)]
//   [Perspective cards — horizontal chapters]
// ──────────────────────────────────────────────

function fmtCurrency(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

function classifyPerspective(ws: WorkspaceProjection): string {
  if (ws.category === "behavioral") return "behavior";
  if (ws.type === "revenue" || ws.type === "chargeback") return "revenue";
  if (ws.type === "copy_alignment") return "copy";
  if (ws.type === "preflight") return "trust";
  return "trust";
}

export default function WorkspacesPage() {
  const mcpData = useMcpData();
  const dataState =
    mcpData.workspaces.status !== "not_ready"
      ? mcpData.workspaces
      : loadWorkspaces();
  const t = useTranslations("console.workspaces");
  const tc = useTranslations("console.common");

  return (
    <div className="p-6">
      <PageHeader
        title={t("panorama_title")}
        tooltip={tc("page_tooltips.workspaces")}
      />
      <ConsoleState
        state={dataState}
        loadingLabel={t("loading")}
        emptyLabel={t("empty")}
      >
        {(workspaces) => <PanoramaContent workspaces={workspaces} />}
      </ConsoleState>
    </div>
  );
}

// ── Perspective card definitions ────────────────

const PERSPECTIVES = [
  {
    key: "revenue",
    icon: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    borderColor: "border-l-red-500/60",
    accentText: "text-red-400",
    accentBg: "bg-red-500/[0.04]",
    hoverBg: "hover:bg-red-500/[0.06]",
  },
  {
    key: "trust",
    icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
    borderColor: "border-l-amber-500/60",
    accentText: "text-amber-400",
    accentBg: "bg-amber-500/[0.04]",
    hoverBg: "hover:bg-amber-500/[0.06]",
  },
  {
    key: "copy",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    borderColor: "border-l-sky-500/60",
    accentText: "text-sky-400",
    accentBg: "bg-sky-500/[0.04]",
    hoverBg: "hover:bg-sky-500/[0.06]",
  },
  {
    key: "behavior",
    icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
    borderColor: "border-l-violet-500/60",
    accentText: "text-violet-400",
    accentBg: "bg-violet-500/[0.04]",
    hoverBg: "hover:bg-violet-500/[0.06]",
  },
] as const;

const SEVERITY_RANK: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1, none: 0,
};

// ── Cross-Signal Chains — collapsible section ──

const MAX_INLINE_CHAINS = 5;

function CrossSignalSection() {
  const t = useTranslations("console.cross_signals");
  const { currency } = useMcpData();
  const [chains, setChains] = useState<CrossSignalChain[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/api/cross-signals")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.chains) setChains(data.chains);
      })
      .catch(() => {});
  }, []);

  if (chains.length === 0) return null;

  const visible = expanded ? chains.slice(0, MAX_INLINE_CHAINS) : chains.slice(0, 2);

  return (
    <section className="rounded-2xl border border-edge bg-surface-card shadow-lg">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <svg className="h-4 w-4 text-indigo-400 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
          </svg>
          <span className="text-[13px] font-semibold text-content">
            {t("title")}
          </span>
          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-indigo-400">
            {chains.length}
          </span>
        </div>
        <svg
          className={`h-4 w-4 text-content-faint transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`space-y-2 px-5 pb-5 ${expanded ? "" : ""}`}>
        {visible.map((chain, i) => (
          <CrossSignalChainCard
            key={`${chain.surface}-${i}`}
            surface={chain.surface}
            links={chain.links}
            totalImpactCents={chain.totalImpactCents}
            temporalPattern={chain.temporalPattern}
            narrative={chain.narrative}
            firstDetectedAt={chain.firstDetectedAt}
            currency={currency}
          />
        ))}
        {!expanded && chains.length > 2 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
            className="w-full rounded-lg border border-dashed border-edge py-2 text-[11px] text-content-faint transition-colors hover:border-edge-strong hover:text-content-muted"
          >
            {t("more_patterns", { count: chains.length - 2 })}
          </button>
        )}
      </div>
    </section>
  );
}

function PanoramaContent({ workspaces }: { workspaces: WorkspaceProjection[] }) {
  const router = useRouter();
  const t = useTranslations("console.workspaces");

  const allFindings = useMemo(
    () => workspaces.flatMap((ws) => ws.findings),
    [workspaces],
  );
  // Aggregate per perspective
  // Count actions in progress per perspective
  const perspectiveActionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of PERSPECTIVES) counts[p.key] = 0;

    for (const ws of workspaces) {
      const p = classifyPerspective(ws);
      if (!counts.hasOwnProperty(p)) continue;
      const actionIds = new Set<string>();
      for (const f of ws.findings) {
        for (const ref of f.action_refs ?? []) {
          actionIds.add(ref.id);
        }
      }
      counts[p] += actionIds.size;
    }
    return counts;
  }, [workspaces]);

  const perspectiveData = useMemo(() => {
    const map: Record<string, { issues: number; loss: number; topSeverity: string; hasData: boolean; isLocked: boolean; sparkline: number[]; trend: string }> = {};
    for (const p of PERSPECTIVES) {
      map[p.key] = { issues: 0, loss: 0, topSeverity: "none", hasData: false, isLocked: false, sparkline: [], trend: "stable" };
    }

    let hasBehavioral = false;
    let allBehavioralLocked = true;

    for (const ws of workspaces) {
      const p = classifyPerspective(ws);
      if (!map[p]) continue;

      map[p].issues += ws.summary.issue_count;
      map[p].loss += ws.summary.total_loss_mid;
      map[p].hasData = true;

      if (ws.category === "behavioral") {
        hasBehavioral = true;
        if (ws.pixel_status === "active") allBehavioralLocked = false;
      }

      const rank = SEVERITY_RANK[ws.decision_impact] ?? 0;
      if (rank > (SEVERITY_RANK[map[p].topSeverity] ?? 0)) {
        map[p].topSeverity = ws.decision_impact;
      }
    }

    if (hasBehavioral && allBehavioralLocked) map.behavior.isLocked = true;

    // Synthesize sparkline data per perspective
    for (const p of PERSPECTIVES) {
      const d = map[p.key];
      // Aggregate change summaries across workspaces in this perspective
      let totalReg = 0, totalImp = 0, totalRes = 0;
      let dominantTrend = "stable";
      for (const ws of workspaces) {
        if (classifyPerspective(ws) !== p.key) continue;
        if (ws.change_summary) {
          totalReg += ws.change_summary.regression_count;
          totalImp += ws.change_summary.improvement_count;
          totalRes += ws.change_summary.resolved_count;
          if (ws.change_summary.trend !== "stable") dominantTrend = ws.change_summary.trend;
        }
      }
      const synthSummary = d.hasData ? {
        trend: dominantTrend,
        regression_count: totalReg,
        improvement_count: totalImp,
        resolved_count: totalRes,
      } : null;
      d.sparkline = synthesizeSparklineData(synthSummary, d.issues);
      d.trend = synthSummary?.trend ?? "stable";
    }

    return map;
  }, [workspaces]);

  return (
    <div className="space-y-6">
      {/* ── Lens 1: Intel Briefing ── */}
      <PulseSummary />

      {/* ── Cross-Signal Chains (collapsible) ── */}
      <CrossSignalSection />

      {/* ── Lenses 2-4: Revenue Map | Delta + Rights ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="overflow-hidden rounded-2xl border border-edge bg-surface-card shadow-lg">
          <RevenueMap workspaces={workspaces} />
        </div>
        <div className="flex flex-col gap-0 overflow-hidden rounded-2xl border border-edge bg-surface-card shadow-lg">
          <div className="flex-1 p-5">
            <CycleDelta workspaces={workspaces} />
          </div>
          <div className="border-t border-edge/40 p-5">
            <BraggingRights workspaces={workspaces} />
          </div>
        </div>
      </div>

      {/* ── Perspective Cards ── */}
      <section>
        <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
          {t("perspectives_heading")}
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PERSPECTIVES.map((pDef) => {
            const data = perspectiveData[pDef.key];
            const isLocked = data?.isLocked;
            const hasData = data?.hasData;

            return (
              <button
                key={pDef.key}
                onClick={() => {
                  if (isLocked) router.push("/app/settings/data-sources");
                  else router.push(`/app/workspaces/perspective/${pDef.key}`);
                }}
                className={`group relative overflow-hidden rounded-2xl border border-edge bg-surface-card px-5 py-4 text-left shadow-lg transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl ${
                  isLocked ? "opacity-50" : "hover:border-content-faint"
                }`}
              >
                {/* Subtle gradient per perspective — intensifies on hover */}
                <div className={`pointer-events-none absolute inset-0 rounded-2xl ${pDef.accentBg} bg-gradient-to-br from-current via-transparent to-transparent opacity-[0.12] transition-opacity duration-200 group-hover:opacity-[0.25]`} />

                {/* Icon + Name */}
                <div className="relative flex items-center gap-2.5">
                  <svg
                    className={`h-4 w-4 ${pDef.accentText} opacity-60`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={pDef.icon} />
                  </svg>
                  <span className="text-[13px] font-semibold text-content">
                    {t(`perspectives.${pDef.key}`)}
                  </span>
                </div>

                {/* Stats row */}
                <div className="relative mt-3 flex items-end justify-between">
                  {isLocked ? (
                    <span className="text-[11px] text-amber-500">
                      {t("pixel_required")}
                    </span>
                  ) : hasData ? (
                    <>
                      <div>
                        <div className="font-mono text-2xl font-medium tabular-nums leading-none text-content">
                          {data.issues}
                        </div>
                        <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-content-muted">
                          {t("issues")}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <div className="flex items-center gap-2">
                          {data.loss > 0 && (
                            <span className={`font-mono text-sm font-medium tabular-nums ${pDef.accentText}`}>
                              {fmtCurrency(data.loss)}
                            </span>
                          )}
                          <SeverityBadge value={data.topSeverity} />
                        </div>
                        {data.sparkline.length >= 2 && new Set(data.sparkline).size > 1 && (
                          <TrendSparkline data={data.sparkline} width={64} height={20} />
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] text-content-faint">
                      {t("no_data_yet")}
                    </span>
                  )}
                </div>

                {/* Action count badge */}
                {hasData && !isLocked && (perspectiveActionCounts[pDef.key] ?? 0) > 0 && (
                  <div className="relative mt-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      {perspectiveActionCounts[pDef.key] === 1
                        ? t("actions_in_progress_one")
                        : t("actions_in_progress", { count: perspectiveActionCounts[pDef.key] })}
                    </span>
                  </div>
                )}

                {/* Hover arrow */}
                {!isLocked && (
                  <div className="absolute top-4 right-4 text-content-faint opacity-0 transition-opacity group-hover:opacity-100">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
