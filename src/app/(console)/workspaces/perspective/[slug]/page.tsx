"use client";

import { use, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import toast from "react-hot-toast";
import DataTable, { Column } from "@/components/console/DataTable";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import ImpactBadge from "@/components/console/ImpactBadge";
import ConsoleState from "@/components/console/ConsoleState";
import PulseSummary from "@/components/console/PulseSummary";
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
// Perspective Page — filtered view by business lens
//
// slug: revenue | trust | behavior | copy
// ──────────────────────────────────────────────

const PERSPECTIVE_META: Record<
  string,
  { icon: string; accentColor: string; accentBorder: string }
> = {
  revenue: {
    icon: "M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    accentColor: "text-red-400",
    accentBorder: "border-red-500/20",
  },
  trust: {
    icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z",
    accentColor: "text-amber-400",
    accentBorder: "border-amber-500/20",
  },
  behavior: {
    icon: "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
    accentColor: "text-violet-400",
    accentBorder: "border-violet-500/20",
  },
  copy: {
    icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    accentColor: "text-blue-400",
    accentBorder: "border-blue-500/20",
  },
};

function classifyWorkspacePerspective(ws: WorkspaceProjection): string {
  if (ws.category === "behavioral") return "behavior";
  if (ws.type === "revenue" || ws.type === "chargeback") return "revenue";
  if (ws.type === "preflight") return "trust";
  return "trust";
}

export default function PerspectivePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const mcpData = useMcpData();
  const dataState =
    mcpData.workspaces.status !== "not_ready"
      ? mcpData.workspaces
      : loadWorkspaces();
  const t = useTranslations("console.workspaces");

  const validSlugs = ["revenue", "trust", "behavior", "copy"];
  if (!validSlugs.includes(slug)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-3 text-4xl text-content-faint">&#8709;</div>
        <h2 className="text-lg font-semibold text-content-secondary">
          {t("perspective_not_found")}
        </h2>
        <Link
          href="/workspaces"
          className="mt-4 rounded-md border border-edge px-4 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-inset"
        >
          {t("back_to_panorama")}
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6">
      <ConsoleState
        state={dataState}
        loadingLabel={t("loading")}
        emptyLabel={t("empty")}
      >
        {(workspaces) => (
          <PerspectiveContent slug={slug} workspaces={workspaces} />
        )}
      </ConsoleState>
    </div>
  );
}

function PerspectiveContent({
  slug,
  workspaces,
}: {
  slug: string;
  workspaces: WorkspaceProjection[];
}) {
  const router = useRouter();
  const t = useTranslations("console.workspaces");
  const tc = useTranslations("console.common");
  const [selectedFinding, setSelectedFinding] =
    useState<FindingProjection | null>(null);

  const meta = PERSPECTIVE_META[slug] || PERSPECTIVE_META.trust;

  // Filter workspaces to this perspective
  const perspectiveWorkspaces = useMemo(
    () => workspaces.filter((ws) => classifyWorkspacePerspective(ws) === slug),
    [workspaces, slug]
  );

  // Aggregate findings from perspective workspaces
  const allFindings = useMemo(
    () => perspectiveWorkspaces.flatMap((ws) => ws.findings),
    [perspectiveWorkspaces]
  );

  // Check if this perspective is locked (behavior with no pixel)
  const isBehaviorLocked =
    slug === "behavior" &&
    perspectiveWorkspaces.length > 0 &&
    perspectiveWorkspaces.every((ws) => ws.pixel_status !== "active");

  // Positive checks for pulse summary
  const positiveChecks = useMemo(
    () =>
      allFindings
        .filter((f) => f.polarity === "positive")
        .map((f) => f.title),
    [allFindings]
  );

  const perspectiveLabel =
    slug === "revenue"
      ? t("perspectives.revenue")
      : slug === "trust"
        ? t("perspectives.trust")
        : slug === "behavior"
          ? t("perspectives.behavior")
          : t("perspectives.copy");

  // Finding table columns
  const findingColumns: Column<FindingProjection>[] = [
    {
      key: "title",
      label: tc("columns.finding"),
      render: (row) => (
        <div>
          <div className="text-sm text-content-secondary">{row.title}</div>
          {row.root_cause && (
            <div className="mt-0.5 text-xs text-content-muted">
              {row.root_cause}
            </div>
          )}
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
          <span className="text-xs text-emerald-600 dark:text-emerald-400">
            {tc("healthy")}
          </span>
        ) : (
          <ImpactBadge
            min={row.impact.monthly_range.min}
            max={row.impact.monthly_range.max}
          />
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
      {/* Back to Panorama */}
      <Link
        href="/workspaces"
        className="inline-flex items-center gap-1 text-sm text-content-muted transition-colors hover:text-content-secondary"
      >
        <span>&larr;</span> {t("back_to_panorama")}
      </Link>

      {/* Perspective Header */}
      <div className={`mt-4 rounded-lg border ${meta.accentBorder} bg-white/[0.02] px-6 py-5`}>
        <div className="flex items-center gap-3">
          <svg
            className={`h-6 w-6 ${meta.accentColor}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} />
          </svg>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-content">
              {perspectiveLabel}
            </h1>
            <p className="mt-0.5 text-sm text-content-muted">
              {t(`perspective_descriptions.${slug}`)}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-6">
            <div className="text-right">
              <div className="text-xs text-content-muted">{t("issues")}</div>
              <div className="font-[family-name:var(--font-jetbrains-mono)] text-lg font-bold text-content-secondary">
                {allFindings.filter((f) => f.polarity === "negative").length}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Locked banner for behavior */}
      {isBehaviorLocked && (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-amber-300">
          <span className="mt-0.5 text-base" aria-hidden>
            {"\u26A0"}
          </span>
          <p className="flex-1 text-sm leading-relaxed">
            {t("categories.behavioral_locked_banner")}
          </p>
          <button
            onClick={() => router.push("/app/settings/data-sources")}
            className="shrink-0 rounded-md border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-300 transition-colors hover:bg-amber-500/30"
          >
            {t("categories.configure_pixel_cta")}
          </button>
        </div>
      )}

      {/* Pulse Summary */}
      <div className="mt-6">
        <PulseSummary
          perspective={slug}
          findings={allFindings}
          positiveChecks={positiveChecks}
        />
      </div>

      {/* Lenses grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RevenueMap workspaces={workspaces} filterPerspective={slug} />
        <CycleDelta workspaces={workspaces} filterPerspective={slug} />
        <BraggingRights workspaces={workspaces} filterPerspective={slug} />
      </div>

      {/* Findings Table */}
      {allFindings.length > 0 && (
        <section className="mt-6 rounded-lg border border-white/[0.06] bg-white/[0.02] p-5">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
            {t("perspective_findings")}
          </h2>
          <DataTable
            columns={findingColumns}
            data={allFindings}
            onRowClick={(row) => setSelectedFinding(row)}
            getRowKey={(row) => row.id}
            emptyMessage={t("empty")}
          />
        </section>
      )}

      {/* Workspace breakdown */}
      {perspectiveWorkspaces.length > 1 && (
        <section className="mt-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-content-muted">
            {t("workspaces_in_perspective")}
          </h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {perspectiveWorkspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => router.push(`/app/workspaces/${ws.id}`)}
                className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-5 py-4 text-left transition-colors hover:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-content">
                    {ws.name}
                  </span>
                  <SeverityBadge value={ws.decision_impact} />
                </div>
                <div className="mt-2 flex items-center gap-4 text-xs text-content-muted">
                  <span>
                    {ws.summary.issue_count} {t("issues").toLowerCase()}
                  </span>
                  <span className="font-[family-name:var(--font-jetbrains-mono)] text-red-400">
                    {formatCurrency(ws.summary.total_loss_mid)}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Finding Drawer */}
      <SideDrawer
        open={selectedFinding !== null}
        onClose={() => setSelectedFinding(null)}
        title={selectedFinding?.title || ""}
      >
        {selectedFinding && (
          <FindingDrawerContent
            finding={selectedFinding}
            onDiscuss={() =>
              router.push(`/chat?finding=${selectedFinding.id}`)
            }
          />
        )}
      </SideDrawer>
    </>
  );
}

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

function FindingDrawerContent({
  finding,
  onDiscuss,
}: {
  finding: FindingProjection;
  onDiscuss: () => void;
}) {
  const td = useTranslations("console.finding_drawer");
  const tc = useTranslations("console.common");

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
          {td("summary")}
        </h3>
        <p className="text-sm text-content-secondary">{finding.cause}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {finding.polarity === "positive" ? (
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
              {tc("healthy")}
            </span>
          ) : (
            <SeverityBadge value={finding.severity} />
          )}
          <VerificationBadge value={finding.verification_maturity} />
          {finding.change_class && (
            <ChangeBadge value={finding.change_class} />
          )}
        </div>
      </section>

      {finding.effect && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
            {td("effect")}
          </h3>
          <p className="text-sm text-content-muted">{finding.effect}</p>
        </section>
      )}

      {finding.polarity !== "positive" && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
            {td("impact_breakdown")}
          </h3>
          <div className="flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-2">
            <span className="text-xs text-content-muted">
              {td("monthly_range")}
            </span>
            <ImpactBadge
              min={finding.impact.monthly_range.min}
              max={finding.impact.monthly_range.max}
            />
          </div>
        </section>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
          {finding.polarity === "positive" ? td("why_good") : td("reasoning")}
        </h3>
        <p className="text-sm leading-relaxed text-content-muted">
          {finding.reasoning}
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
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
            toast.success(td("verification_requested"))
          }
        />
      </section>

      <VerificationSufficiencyWarning
        severity={finding.severity}
        maturity={finding.verification_maturity}
      />

      {finding.polarity !== "positive" && (
        <section>
          <button
            onClick={onDiscuss}
            className="w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-400 transition-colors hover:border-emerald-500 hover:bg-emerald-500/15"
          >
            {td("discuss_finding")}
          </button>
        </section>
      )}
    </div>
  );
}
