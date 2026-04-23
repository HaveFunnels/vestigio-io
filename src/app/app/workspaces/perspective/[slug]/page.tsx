"use client";

import { use, useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTrack } from "@/hooks/useProductTrack";
import Link from "next/link";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import DataTable, { Column } from "@/components/console/DataTable";
import SideDrawer from "@/components/console/SideDrawer";
import FindingDetailPanel from "@/components/console/FindingDetailPanel";
import SeverityBadge from "@/components/console/SeverityBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import ImpactBadge from "@/components/console/ImpactBadge";
import ConsoleState from "@/components/console/ConsoleState";
import PulseSummary from "@/components/console/PulseSummary";
import OpportunityPreview from "@/components/console/workspace/OpportunityPreview";
import TrustScoreCard from "@/components/console/workspace/TrustScoreCard";
import RevenueMap from "@/components/console/RevenueMap";
import CycleDelta from "@/components/console/CycleDelta";
import BraggingRights from "@/components/console/BraggingRights";
import VerificationPanel from "@/components/console/VerificationPanel";
import VerificationSufficiencyWarning from "@/components/console/VerificationSufficiencyWarning";
import { loadWorkspaces } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import type {
  WorkspaceProjection,
  FindingProjection,
} from "../../../../../../packages/projections";

// ──────────────────────────────────────────────
// Perspective detail — filtered view by lens
// ──────────────────────────────────────────────

const PERSPECTIVE_META: Record<string, {
  icon: string;
  accentColor: string;
  borderColor: string;
  barColor: string;
}> = {
  revenue: {
    icon: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    accentColor: "text-red-400",
    borderColor: "border-l-red-500/60",
    barColor: "bg-red-500/20",
  },
  trust: {
    icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
    accentColor: "text-amber-400",
    borderColor: "border-l-amber-500/60",
    barColor: "bg-amber-500/20",
  },
  behavior: {
    icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
    accentColor: "text-violet-400",
    borderColor: "border-l-violet-500/60",
    barColor: "bg-violet-500/20",
  },
  copy: {
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    accentColor: "text-sky-400",
    borderColor: "border-l-sky-500/60",
    barColor: "bg-sky-500/20",
  },
};

function classifyWorkspacePerspective(ws: WorkspaceProjection): string {
  if (ws.category === "behavioral") return "behavior";
  if (ws.type === "revenue" || ws.type === "chargeback") return "revenue";
  if (ws.type === "preflight") return "trust";
  return "trust";
}

function fmtCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export default function PerspectivePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const mcpData = useMcpData();
  const dataState = mcpData.workspaces.status !== "not_ready" ? mcpData.workspaces : loadWorkspaces();
  const t = useTranslations("console.workspaces");
  const { track } = useTrack();

  // Track perspective drill (3.16)
  useEffect(() => {
    track("workspace_drill", { perspective: slug });
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!["revenue", "trust", "behavior", "copy"].includes(slug)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-3 text-4xl text-zinc-300 dark:text-zinc-700">&empty;</div>
        <h2 className="text-lg font-semibold text-zinc-300">{t("perspective_not_found")}</h2>
        <Link href="/app/workspaces" className="mt-4 text-sm text-zinc-500 transition-colors hover:text-zinc-300">
          &larr; {t("back_to_panorama")}
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <ConsoleState state={dataState} loadingLabel={t("loading")} emptyLabel={t("empty")}>
        {(workspaces) => <PerspectiveContent slug={slug} workspaces={workspaces} />}
      </ConsoleState>
    </div>
  );
}

function PerspectiveContent({ slug, workspaces }: { slug: string; workspaces: WorkspaceProjection[] }) {
  const router = useRouter();
  const searchParamsPerspective = useSearchParams();
  const t = useTranslations("console.workspaces");
  const tc = useTranslations("console.common");
  const [selectedFinding, setSelectedFinding] = useState<FindingProjection | null>(null);

  const meta = PERSPECTIVE_META[slug] || PERSPECTIVE_META.trust;

  // 3.20: Finding-in-URL helpers
  const openFinding = (f: FindingProjection) => {
    setSelectedFinding(f);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("finding", f.id);
      window.history.replaceState({}, "", url.toString());
    }
  };
  const closeFinding = () => {
    setSelectedFinding(null);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("finding");
      window.history.replaceState({}, "", url.toString());
    }
  };

  const perspectiveWorkspaces = useMemo(
    () => workspaces.filter((ws) => classifyWorkspacePerspective(ws) === slug),
    [workspaces, slug],
  );

  const allFindings = useMemo(
    () => perspectiveWorkspaces.flatMap((ws) => ws.findings),
    [perspectiveWorkspaces],
  );

  const negativeFindings = useMemo(
    () => allFindings.filter((f) => f.polarity === "negative"),
    [allFindings],
  );

  const totalLoss = useMemo(
    () => perspectiveWorkspaces.reduce((s, ws) => s + ws.summary.total_loss_mid, 0),
    [perspectiveWorkspaces],
  );

  const isBehaviorLocked =
    slug === "behavior" &&
    perspectiveWorkspaces.length > 0 &&
    perspectiveWorkspaces.every((ws) => ws.pixel_status !== "active");

  const perspectiveLabel = t(`perspectives.${slug}`);

  const findingColumns: Column<FindingProjection>[] = [
    {
      key: "title",
      label: tc("columns.finding"),
      render: (row) => (
        <div>
          <div className="text-[13px] text-zinc-300">{row.title}</div>
          {row.root_cause && <div className="mt-0.5 text-[11px] text-zinc-600">{row.root_cause}</div>}
        </div>
      ),
    },
    {
      key: "severity",
      label: tc("columns.severity"),
      className: "w-24",
      render: (row) => <SeverityBadge value={row.severity} />,
    },
    {
      key: "impact",
      label: tc("columns.impact"),
      className: "w-44",
      render: (row) =>
        row.polarity === "positive" ? (
          <span className="text-[11px] text-emerald-400">{tc("healthy")}</span>
        ) : (
          <ImpactBadge min={row.impact.monthly_range.min} max={row.impact.monthly_range.max} />
        ),
    },
    {
      key: "verification",
      label: tc("columns.verification"),
      className: "w-28",
      render: (row) => <VerificationBadge value={row.verification_maturity} />,
    },
    {
      key: "change",
      label: tc("columns.change"),
      className: "w-28",
      render: (row) => <ChangeBadge value={row.change_class} />,
    },
  ];

  return (
    <>
      {/* Back nav */}
      <Link
        href="/app/workspaces"
        className="inline-flex items-center gap-1.5 text-[12px] text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400"
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {t("back_to_panorama")}
      </Link>

      {/* Perspective header — left accent border */}
      <div className={`mt-4 rounded border-l-2 ${meta.borderColor} px-5 py-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg className={`h-5 w-5 ${meta.accentColor} opacity-70`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} />
            </svg>
            <div>
              <h1 className="text-[16px] font-semibold text-zinc-200">{perspectiveLabel}</h1>
              <p className="mt-0.5 text-[12px] text-zinc-500">{t(`perspective_descriptions.${slug}`)}</p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="font-[family-name:var(--font-jetbrains-mono)] text-[20px] font-bold tabular-nums text-zinc-800 dark:text-zinc-200">
                {negativeFindings.length}
              </div>
              <div className="text-[10px] text-zinc-400 dark:text-zinc-600">{t("issues")}</div>
            </div>
            {totalLoss > 0 && (
              <div className="text-right">
                <div className={`font-[family-name:var(--font-jetbrains-mono)] text-[20px] font-bold tabular-nums ${meta.accentColor}`}>
                  {fmtCurrency(totalLoss)}
                </div>
                <div className="text-[10px] text-zinc-400 dark:text-zinc-600">/mo</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Locked banner */}
      {isBehaviorLocked && (
        <div className="mt-4 flex items-center gap-3 rounded border-l-2 border-l-amber-500/60 bg-amber-50 px-5 py-3 dark:bg-amber-500/[0.04]">
          <span className="text-[12px] text-amber-400/80">{t("categories.behavioral_locked_banner")}</span>
          <button
            onClick={() => router.push("/app/settings/data-sources")}
            className="ml-auto shrink-0 font-[family-name:var(--font-jetbrains-mono)] text-[11px] font-medium text-amber-400 transition-colors hover:text-amber-300"
          >
            {t("categories.configure_pixel_cta")} &rarr;
          </button>
        </div>
      )}

      {/* Pulse Summary */}
      <div className="mt-5">
        <PulseSummary perspective={slug} />
      </div>

      {/* Perspective-level enrichment (3.11B Fase 4) */}
      {slug === "revenue" && allFindings.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
              <OpportunityPreview findings={allFindings} />
            </section>
          </div>
          <div className="lg:col-span-2">
            <section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
              <TrustScoreCard findings={allFindings} filterPacks={["revenue_integrity", "revenue", "chargeback_resilience", "chargeback"]} />
            </section>
          </div>
        </div>
      )}
      {slug === "trust" && allFindings.length > 0 && (
        <div className="mt-5">
          <section className="rounded-2xl border border-edge bg-surface-card p-5 shadow-lg">
            <TrustScoreCard findings={allFindings} filterPacks={["security_posture", "scale_readiness"]} />
          </section>
        </div>
      )}

      {/* Lenses — same asymmetric layout */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-[3fr_2fr]">
        <div className="overflow-hidden rounded-2xl border border-edge bg-surface-card shadow-lg">
          <RevenueMap workspaces={workspaces} filterPerspective={slug} />
        </div>
        <div className="flex flex-col overflow-hidden rounded-2xl border border-edge bg-surface-card shadow-lg">
          <div className="flex-1 p-5">
            <CycleDelta workspaces={workspaces} filterPerspective={slug} />
          </div>
          <div className="border-t border-edge/40 p-5">
            <BraggingRights workspaces={workspaces} filterPerspective={slug} />
          </div>
        </div>
      </div>

      {/* Findings table */}
      {allFindings.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
            {t("perspective_findings")}
          </h2>
          <div className="overflow-hidden rounded-2xl border border-edge bg-surface-card shadow-lg">
            <DataTable
              columns={findingColumns}
              data={allFindings}
              onRowClick={(row) => openFinding(row)}
              getRowKey={(row) => row.id}
              emptyMessage={t("empty")}
            />
          </div>
        </section>
      )}

      {/* Workspace breakdown */}
      {perspectiveWorkspaces.length > 1 && (
        <section className="mt-6">
          <h2 className="mb-3 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
            {t("workspaces_in_perspective")}
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {perspectiveWorkspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => router.push(`/app/workspaces/${ws.id}`)}
                className="rounded-2xl border border-edge bg-surface-card px-5 py-3.5 text-left shadow-lg transition-all hover:shadow-xl"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-zinc-300">{ws.name}</span>
                  <SeverityBadge value={ws.decision_impact} />
                </div>
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-zinc-600">
                  <span>{ws.summary.issue_count} {t("issues").toLowerCase()}</span>
                  <span className={`font-[family-name:var(--font-jetbrains-mono)] font-medium ${meta.accentColor}`}>
                    {fmtCurrency(ws.summary.total_loss_mid)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Finding drawer */}
      <SideDrawer open={selectedFinding !== null} onClose={closeFinding} title={selectedFinding?.title || ""}>
        {selectedFinding && (
          <FindingDetailPanel finding={selectedFinding} variant="compact" />
        )}
      </SideDrawer>
    </>
  );
}

function FindingDrawerContent({ finding, onDiscuss }: { finding: FindingProjection; onDiscuss: () => void }) {
  const td = useTranslations("console.finding_drawer");
  const tc = useTranslations("console.common");
  const router = useRouter();

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
          {td("summary")}
        </h3>
        <p className="text-[13px] leading-relaxed text-zinc-400">{finding.cause}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {finding.polarity === "positive" ? (
            <span className="rounded-sm bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400">{tc("healthy")}</span>
          ) : (
            <SeverityBadge value={finding.severity} />
          )}
          <VerificationBadge value={finding.verification_maturity} />
          {finding.change_class && <ChangeBadge value={finding.change_class} />}
        </div>
      </section>

      {finding.effect && (
        <section>
          <h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
            {td("effect")}
          </h3>
          <p className="text-[13px] text-zinc-500">{finding.effect}</p>
        </section>
      )}

      {finding.polarity !== "positive" && (
        <section>
          <h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
            {td("impact_breakdown")}
          </h3>
          <div className="flex items-center justify-between rounded border border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-white/[0.04] dark:bg-white/[0.015]">
            <span className="text-[11px] text-zinc-600">{td("monthly_range")}</span>
            <ImpactBadge min={finding.impact.monthly_range.min} max={finding.impact.monthly_range.max} />
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
          {finding.polarity === "positive" ? td("why_good") : td("reasoning")}
        </h3>
        <p className="text-[13px] leading-relaxed text-zinc-500">{finding.reasoning}</p>
      </section>

      <section>
        <h3 className="mb-2 font-[family-name:var(--font-jetbrains-mono)] text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-600">
          {td("verification")}
        </h3>
        <VerificationPanel
          maturity={finding.verification_maturity}
          method={finding.verification_method}
          verifiedAt={null}
          expiresAt={null}
          reTriggerReason={null}
          decisionStatus={null}
          onRequestVerification={() =>
            router.push(`/app/chat?intent=verify&finding=${encodeURIComponent(finding.id)}`)
          }
        />
      </section>

      <VerificationSufficiencyWarning severity={finding.severity} maturity={finding.verification_maturity} />

      {finding.polarity !== "positive" && (
        <section>
          <button
            onClick={onDiscuss}
            className="w-full rounded border border-emerald-500/30 bg-emerald-50 px-4 py-2.5 font-[family-name:var(--font-jetbrains-mono)] text-[12px] font-medium text-emerald-600 transition-colors hover:bg-emerald-100 dark:bg-emerald-500/[0.06] dark:text-emerald-400 dark:hover:border-emerald-500/50 dark:hover:bg-emerald-500/[0.1]"
          >
            {td("discuss_finding")}
          </button>
        </section>
      )}
    </div>
  );
}
