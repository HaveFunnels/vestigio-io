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
    key: "behavior",
    icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
    borderColor: "border-l-violet-500/60",
    accentText: "text-violet-400",
    accentBg: "bg-violet-500/[0.04]",
    hoverBg: "hover:bg-violet-500/[0.06]",
  },
  {
    key: "copy",
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    borderColor: "border-l-sky-500/60",
    accentText: "text-sky-400",
    accentBg: "bg-sky-500/[0.04]",
    hoverBg: "hover:bg-sky-500/[0.06]",
  },
] as const;

const SEVERITY_RANK: Record<string, number> = {
  critical: 4, high: 3, medium: 2, low: 1, none: 0,
};

function PanoramaContent({ workspaces }: { workspaces: WorkspaceProjection[] }) {
  const router = useRouter();
  const t = useTranslations("console.workspaces");

  const allFindings = useMemo(
    () => workspaces.flatMap((ws) => ws.findings),
    [workspaces],
  );
  const positiveChecks = useMemo(
    () => allFindings.filter((f) => f.polarity === "positive").map((f) => f.title),
    [allFindings],
  );

  // Aggregate per perspective
  const perspectiveData = useMemo(() => {
    const map: Record<string, { issues: number; loss: number; topSeverity: string; hasData: boolean; isLocked: boolean }> = {};
    for (const p of PERSPECTIVES) {
      map[p.key] = { issues: 0, loss: 0, topSeverity: "none", hasData: false, isLocked: false };
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
    return map;
  }, [workspaces]);

  return (
    <div className="space-y-6">
      {/* ── Lens 1: Intel Briefing ── */}
      <PulseSummary findings={allFindings} positiveChecks={positiveChecks} />

      {/* ── Lenses 2-4: Revenue Map | Delta + Rights ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[3fr_2fr]">
        {/* Left: Revenue Map */}
        <div className="rounded border border-zinc-200 bg-white p-5 dark:border-white/[0.04] dark:bg-white/[0.015]">
          <RevenueMap workspaces={workspaces} />
        </div>

        {/* Right: stacked Delta + Rights */}
        <div className="flex flex-col gap-5 rounded border border-zinc-200 bg-white p-5 dark:border-white/[0.04] dark:bg-white/[0.015]">
          <CycleDelta workspaces={workspaces} />
          <div className="border-t border-zinc-100 pt-4 dark:border-white/[0.04]">
            <BraggingRights workspaces={workspaces} />
          </div>
        </div>
      </div>

      {/* ── Perspective Cards ── */}
      <section>
        <h2 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
          {t("perspectives_heading")}
        </h2>

        <div className="grid grid-cols-1 gap-px overflow-hidden rounded bg-zinc-200 dark:bg-white/[0.03] sm:grid-cols-2 lg:grid-cols-4">
          {PERSPECTIVES.map((pDef) => {
            const data = perspectiveData[pDef.key];
            const isLocked = data?.isLocked;
            const isCopyEmpty = pDef.key === "copy" && !data?.hasData;
            const hasData = data?.hasData;

            return (
              <button
                key={pDef.key}
                onClick={() => {
                  if (isLocked) router.push("/app/settings/data-sources");
                  else router.push(`/workspaces/perspective/${pDef.key}`);
                }}
                className={`group relative border-l-2 ${pDef.borderColor} ${pDef.hoverBg} bg-white dark:bg-[rgb(var(--bg-card))] px-5 py-4 text-left transition-colors ${
                  isLocked || isCopyEmpty ? "opacity-50" : ""
                }`}
              >
                {/* Icon + Name */}
                <div className="flex items-center gap-2.5">
                  <svg
                    className={`h-4 w-4 ${pDef.accentText} opacity-60`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d={pDef.icon} />
                  </svg>
                  <span className="text-[13px] font-semibold text-zinc-700 dark:text-zinc-300">
                    {t(`perspectives.${pDef.key}`)}
                  </span>
                </div>

                {/* Stats row */}
                <div className="mt-3 flex items-end justify-between">
                  {isLocked ? (
                    <span className="text-[11px] text-amber-600 dark:text-amber-500/80">
                      {t("pixel_required")}
                    </span>
                  ) : isCopyEmpty ? (
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
                      {t("coming_soon")}
                    </span>
                  ) : hasData ? (
                    <>
                      {/* Big number: issue count */}
                      <div>
                        <div className="font-[family-name:var(--font-jetbrains-mono)] text-[22px] font-bold tabular-nums leading-none text-zinc-800 dark:text-zinc-200">
                          {data.issues}
                        </div>
                        <div className="mt-0.5 text-[10px] text-zinc-400 dark:text-zinc-600">
                          {t("issues")}
                        </div>
                      </div>

                      {/* Loss + severity */}
                      <div className="flex items-center gap-2">
                        {data.loss > 0 && (
                          <span className={`font-[family-name:var(--font-jetbrains-mono)] text-[13px] font-semibold tabular-nums ${pDef.accentText}`}>
                            {fmtCurrency(data.loss)}
                          </span>
                        )}
                        <SeverityBadge value={data.topSeverity} />
                      </div>
                    </>
                  ) : (
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-600">
                      {t("no_data_yet")}
                    </span>
                  )}
                </div>

                {/* Hover arrow */}
                {!isLocked && !isCopyEmpty && (
                  <div className="absolute bottom-4 right-4 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 dark:text-zinc-600">
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
