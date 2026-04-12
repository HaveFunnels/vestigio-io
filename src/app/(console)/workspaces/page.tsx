"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import SeverityBadge from "@/components/console/SeverityBadge";
import ConsoleState from "@/components/console/ConsoleState";
import PageHeader from "@/components/console/PageHeader";
import PulseSummary from "@/components/console/PulseSummary";
import RevenueMap from "@/components/console/RevenueMap";
import CycleDelta from "@/components/console/CycleDelta";
import BraggingRights from "@/components/console/BraggingRights";
import { loadWorkspaces } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import type { WorkspaceProjection } from "../../../../packages/projections";

// ──────────────────────────────────────────────
// Panorama — redesigned Workspaces page
//
// 4 transversal lenses at the top:
//   1. Pulse Summary — LLM briefing
//   2. Revenue Map — $ impact by perspective
//   3. Cycle Delta — what changed
//   4. Bragging Rights — positive signals
//
// Below: Perspective cards linking to detail pages.
// ──────────────────────────────────────────────

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function classifyWorkspacePerspective(ws: WorkspaceProjection): string {
  if (ws.category === "behavioral") return "behavior";
  if (ws.type === "revenue" || ws.type === "chargeback") return "revenue";
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
        subtitle={t("panorama_subtitle")}
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

function PanoramaContent({
  workspaces,
}: {
  workspaces: WorkspaceProjection[];
}) {
  const router = useRouter();
  const t = useTranslations("console.workspaces");

  // Aggregate data for pulse summary
  const allFindings = useMemo(
    () => workspaces.flatMap((ws) => ws.findings),
    [workspaces]
  );
  const positiveChecks = useMemo(
    () =>
      allFindings
        .filter((f) => f.polarity === "positive")
        .map((f) => f.title),
    [allFindings]
  );

  // Compute perspective aggregates
  const perspectives = useMemo(() => {
    const map: Record<
      string,
      {
        key: string;
        findingCount: number;
        issueCount: number;
        totalLoss: number;
        topSeverity: string;
        hasData: boolean;
        isLocked: boolean;
      }
    > = {
      revenue: { key: "revenue", findingCount: 0, issueCount: 0, totalLoss: 0, topSeverity: "none", hasData: false, isLocked: false },
      trust: { key: "trust", findingCount: 0, issueCount: 0, totalLoss: 0, topSeverity: "none", hasData: false, isLocked: false },
      behavior: { key: "behavior", findingCount: 0, issueCount: 0, totalLoss: 0, topSeverity: "none", hasData: false, isLocked: false },
      copy: { key: "copy", findingCount: 0, issueCount: 0, totalLoss: 0, topSeverity: "none", hasData: false, isLocked: false },
    };

    const severityRank: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
      none: 0,
    };

    let hasBehavioral = false;
    let allBehavioralLocked = true;

    for (const ws of workspaces) {
      const p = classifyWorkspacePerspective(ws);
      if (!map[p]) continue;

      map[p].findingCount += ws.findings.length;
      map[p].issueCount += ws.summary.issue_count;
      map[p].totalLoss += ws.summary.total_loss_mid;
      map[p].hasData = true;

      if (ws.category === "behavioral") {
        hasBehavioral = true;
        if (ws.pixel_status === "active") allBehavioralLocked = false;
      }

      const rank = severityRank[ws.decision_impact] ?? 0;
      const currentRank = severityRank[map[p].topSeverity] ?? 0;
      if (rank > currentRank) map[p].topSeverity = ws.decision_impact;
    }

    if (hasBehavioral && allBehavioralLocked) {
      map.behavior.isLocked = true;
    }

    return map;
  }, [workspaces]);

  // Perspective card config
  const cards: {
    key: string;
    label: string;
    description: string;
    icon: string;
    accentColor: string;
    accentBg: string;
    accentBorder: string;
  }[] = [
    {
      key: "revenue",
      label: t("perspectives.revenue"),
      description: t("perspective_descriptions.revenue"),
      icon: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
      accentColor: "text-red-400",
      accentBg: "bg-red-500/[0.06]",
      accentBorder: "border-red-500/20 hover:border-red-500/40",
    },
    {
      key: "trust",
      label: t("perspectives.trust"),
      description: t("perspective_descriptions.trust"),
      icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
      accentColor: "text-amber-400",
      accentBg: "bg-amber-500/[0.06]",
      accentBorder: "border-amber-500/20 hover:border-amber-500/40",
    },
    {
      key: "behavior",
      label: t("perspectives.behavior"),
      description: t("perspective_descriptions.behavior"),
      icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
      accentColor: "text-violet-400",
      accentBg: "bg-violet-500/[0.06]",
      accentBorder: "border-violet-500/20 hover:border-violet-500/40",
    },
    {
      key: "copy",
      label: t("perspectives.copy"),
      description: t("perspective_descriptions.copy"),
      icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
      accentColor: "text-blue-400",
      accentBg: "bg-blue-500/[0.06]",
      accentBorder: "border-blue-500/20 hover:border-blue-500/40",
    },
  ];

  return (
    <>
      {/* ── Lens 1: Pulse Summary ── */}
      <PulseSummary
        findings={allFindings}
        positiveChecks={positiveChecks}
      />

      {/* ── Lenses 2-4: Revenue Map, Cycle Delta, Bragging Rights ── */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RevenueMap workspaces={workspaces} />
        <CycleDelta workspaces={workspaces} />
        <BraggingRights workspaces={workspaces} />
      </div>

      {/* ── Perspective Cards ── */}
      <section className="mt-8">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-content-muted">
          {t("perspectives_heading")}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {cards.map((card) => {
            const data = perspectives[card.key];
            const isLocked = data?.isLocked;
            const hasData = data?.hasData;
            const isCopyEmpty = card.key === "copy" && !hasData;

            return (
              <button
                key={card.key}
                onClick={() => {
                  if (isLocked) {
                    router.push("/app/settings/data-sources");
                  } else {
                    router.push(`/workspaces/perspective/${card.key}`);
                  }
                }}
                className={`group relative rounded-lg border text-left transition-all ${card.accentBorder} ${
                  isLocked || isCopyEmpty ? "opacity-60" : ""
                } bg-white/[0.02] hover:bg-white/[0.04]`}
              >
                <div className="p-5">
                  {/* Icon + Label */}
                  <div className="flex items-start gap-3">
                    <div className={`rounded-md ${card.accentBg} p-2`}>
                      <svg
                        className={`h-5 w-5 ${card.accentColor}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d={card.icon}
                        />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-content">
                        {card.label}
                      </h3>
                      <p className="mt-0.5 text-xs text-content-faint">
                        {card.description}
                      </p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="mt-4 border-t border-white/[0.04] pt-3">
                    {isLocked ? (
                      <div className="flex items-center gap-2 text-xs text-amber-400">
                        <span>{"\u26A0"}</span>
                        <span>{t("pixel_required")}</span>
                      </div>
                    ) : isCopyEmpty ? (
                      <div className="text-xs text-content-faint">
                        {t("coming_soon")}
                      </div>
                    ) : hasData ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div>
                            <div className="text-[10px] uppercase text-content-faint">
                              {t("issues")}
                            </div>
                            <div className="font-[family-name:var(--font-jetbrains-mono)] text-sm font-bold text-content-secondary">
                              {data.issueCount}
                            </div>
                          </div>
                          {data.totalLoss > 0 && (
                            <div>
                              <div className="text-[10px] uppercase text-content-faint">
                                {t("monthly_loss")}
                              </div>
                              <div className="font-[family-name:var(--font-jetbrains-mono)] text-sm font-bold text-red-400">
                                {formatCurrency(data.totalLoss)}
                              </div>
                            </div>
                          )}
                        </div>
                        <SeverityBadge value={data.topSeverity} />
                      </div>
                    ) : (
                      <div className="text-xs text-content-faint">
                        {t("no_data_yet")}
                      </div>
                    )}
                  </div>

                  {/* Arrow indicator */}
                  {!isLocked && !isCopyEmpty && (
                    <div className="mt-3 flex items-center gap-1 text-xs font-medium text-content-faint opacity-0 transition-opacity group-hover:opacity-100">
                      {t("view_perspective")} <span>&rarr;</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
