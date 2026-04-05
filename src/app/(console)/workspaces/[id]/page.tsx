"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import DataTable, { Column } from "@/components/console/DataTable";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import SummaryCards from "@/components/console/SummaryCards";
import ImpactBadge from "@/components/console/ImpactBadge";
import ConsoleState from "@/components/console/ConsoleState";
import VerificationPanel from "@/components/console/VerificationPanel";
import VerificationSufficiencyWarning from "@/components/console/VerificationSufficiencyWarning";
import ChangeTimeline from "@/components/console/ChangeTimeline";
import { loadWorkspaces, loadChangeReport } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import type {
  WorkspaceProjection,
  FindingProjection,
  DecisionChangeProjection,
} from "../../../../../packages/projections";

// ──────────────────────────────────────────────
// Workspace Detail Page — Phase 4 UX Overhaul
//
// Full detail view for a single workspace.
// Persistent operational instrument with change
// tracking, trust strength, coherence, and
// preflight checklist mode.
// ──────────────────────────────────────────────

const workspaceTypeLabels: Record<string, string> = {
  preflight: "Scale Readiness",
  revenue: "Revenue Integrity",
  chargeback: "Chargeback Resilience",
};

const workspaceTypeColors: Record<string, string> = {
  preflight: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  revenue: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  chargeback: "bg-red-500/10 text-red-400 border-red-500/20",
};

const impactTypeLabels: Record<string, string> = {
  revenue_loss: "Revenue Loss",
  conversion_loss: "Conversion Loss",
  chargeback_risk: "Chargeback Risk",
  traffic_waste: "Traffic Waste",
  lifetime_value_loss: "LTV Loss",
};

const packLabels: Record<string, string> = {
  scale_readiness: "Scale",
  revenue_integrity: "Revenue",
  chargeback_resilience: "Chargeback",
  saas_growth_readiness: "SaaS",
};

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export default function WorkspaceDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const mcpData = useMcpData();
  const dataState = mcpData.workspaces.status !== "not_ready" ? mcpData.workspaces : loadWorkspaces();

  return (
    <div className="p-6">
      <ConsoleState
        state={dataState}
        loadingLabel="Loading workspace..."
        emptyLabel="No workspaces available."
      >
        {(workspaces) => {
          const workspace = workspaces.find((w) => w.id === params.id);
          if (!workspace) {
            return (
              <div className="flex flex-col items-center justify-center py-24 text-center">
                <div className="mb-3 text-4xl text-content-faint">&#8709;</div>
                <h2 className="text-lg font-semibold text-content-secondary">
                  Workspace Not Found
                </h2>
                <p className="mt-1 text-sm text-content-muted">
                  No workspace matches the ID &quot;{params.id}&quot;.
                </p>
                <Link
                  href="/app/workspaces"
                  className="mt-4 rounded-md border border-edge px-4 py-2 text-sm text-content-secondary transition-colors hover:bg-surface-inset"
                >
                  Back to Workspaces
                </Link>
              </div>
            );
          }
          return <WorkspaceDetail workspace={workspace} />;
        }}
      </ConsoleState>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main Detail Component
// ──────────────────────────────────────────────

function WorkspaceDetail({ workspace }: { workspace: WorkspaceProjection }) {
  const router = useRouter();
  const [selectedFinding, setSelectedFinding] = useState<FindingProjection | null>(null);

  // Load change report for timeline
  const changeReportState = mcpData.changeReport.status !== "not_ready" ? mcpData.changeReport : loadChangeReport();
  const workspaceChanges: DecisionChangeProjection[] = useMemo(() => {
    if (changeReportState.status !== "ready") return [];
    const report = changeReportState.data;
    const all = [
      ...report.regressions,
      ...report.improvements,
      ...report.new_issues,
      ...report.resolved,
    ];
    // Filter to changes relevant to this workspace's decision key
    return all.filter((c) => c.decision_key === workspace.decision_key);
  }, [changeReportState, workspace.decision_key]);

  // Compute stats for quick cards
  const negativeFindings = workspace.findings.filter((f) => f.polarity === "negative");
  const positiveFindings = workspace.findings.filter((f) => f.polarity === "positive");
  const avgConfidence =
    workspace.findings.length > 0
      ? Math.round(
          workspace.findings.reduce((sum, f) => sum + f.confidence, 0) /
            workspace.findings.length
        )
      : 0;
  const topSeverity = getTopSeverity(workspace.findings);

  // Preflight readiness computation
  const isPreflight = workspace.type === "preflight";
  const preflightReadiness = isPreflight ? computePreflightReadiness(workspace.findings) : null;

  // ── Findings table columns ──
  const findingColumns: Column<FindingProjection>[] = [
    {
      key: "title",
      label: "Finding",
      render: (row) => (
        <div>
          <div className="text-sm text-content-secondary">{row.title}</div>
          {row.root_cause && (
            <div className="mt-0.5 text-xs text-content-muted">{row.root_cause}</div>
          )}
        </div>
      ),
    },
    {
      key: "severity",
      label: "Severity",
      className: "w-24",
      render: (row) => <SeverityBadge value={row.severity} />,
    },
    {
      key: "impact",
      label: "Impact",
      className: "w-44",
      render: (row) =>
        row.polarity === "positive" ? (
          <span className="text-xs text-emerald-400">Healthy</span>
        ) : (
          <ImpactBadge
            min={row.impact.monthly_range.min}
            max={row.impact.monthly_range.max}
          />
        ),
    },
    {
      key: "verification",
      label: "Verification",
      className: "w-28",
      render: (row) => <VerificationBadge value={row.verification_maturity} />,
    },
    {
      key: "change",
      label: "Change",
      className: "w-28",
      render: (row) => <ChangeBadge value={row.change_class} />,
    },
  ];

  return (
    <>
      {/* ── Back Link ── */}
      <Link
        href="/app/workspaces"
        className="inline-flex items-center gap-1 text-sm text-content-muted transition-colors hover:text-content-secondary"
      >
        <span>&larr;</span> Workspaces
      </Link>

      {/* ── Status Header ── */}
      <div className="mt-4 rounded-lg border border-edge bg-surface-card px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-content">{workspace.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${
                  workspaceTypeColors[workspace.type] || "bg-zinc-500/10 text-content-muted border-zinc-500/20"
                }`}
              >
                {workspaceTypeLabels[workspace.type] || workspace.type}
              </span>
              <SeverityBadge value={workspace.decision_impact} />
              <WorkspaceChangeTrend summary={workspace.change_summary} />
            </div>
          </div>
          <div className="flex items-center gap-6 text-right">
            <div>
              <div className="text-xs text-content-muted">Issues</div>
              <div className="text-lg font-bold text-content-secondary">
                {workspace.summary.issue_count}
              </div>
            </div>
            <div>
              <div className="text-xs text-content-muted">Monthly Loss</div>
              <div className="text-lg font-bold text-red-400">
                {formatCurrency(workspace.summary.total_loss_mid)}
              </div>
            </div>
            <div>
              <div className="text-xs text-content-muted">Confidence</div>
              <div className="text-lg font-bold text-content-secondary">
                {workspace.summary.confidence}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* ── Left Column ── */}
        <div className="space-y-6">
          {/* Change Summary */}
          <section className="rounded-lg border border-edge bg-surface-card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-content-muted">
              Change Summary
            </h2>
            {workspace.change_summary ? (
              <>
                <TrendHeadline summary={workspace.change_summary} />
                {workspaceChanges.length > 0 ? (
                  <div className="mt-4">
                    <ChangeTimeline changes={workspaceChanges} maxItems={8} />
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-content-muted">
                    No changes since last cycle
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-content-muted">
                No changes since last cycle
              </p>
            )}
          </section>

          {/* Findings (Table or Preflight Checklist) */}
          <section className="rounded-lg border border-edge bg-surface-card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-content-muted">
              {isPreflight ? "Preflight Checklist" : "Findings"}
            </h2>

            {isPreflight && preflightReadiness ? (
              <PreflightChecklist
                findings={workspace.findings}
                readiness={preflightReadiness}
                onFindingClick={(f) => setSelectedFinding(f)}
              />
            ) : (
              <DataTable
                columns={findingColumns}
                data={workspace.findings}
                onRowClick={(row) => setSelectedFinding(row)}
                getRowKey={(row) => row.id}
                emptyMessage="No findings in this workspace."
              />
            )}
          </section>
        </div>

        {/* ── Right Column ── */}
        <div className="space-y-6">
          {/* Trust Strength */}
          {workspace.confidence_narrative && (
            <section className="rounded-lg border border-edge bg-surface-card p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-content-muted">
                Trust Strength
              </h2>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <ConfidenceBar
                    label="Structural"
                    level={workspace.confidence_narrative.structural_confidence}
                  />
                  <ConfidenceBar
                    label="Economic"
                    level={workspace.confidence_narrative.economic_confidence}
                  />
                </div>
                <p className="text-sm text-content-muted leading-relaxed">
                  {workspace.confidence_narrative.narrative}
                </p>
                {workspace.confidence_narrative.uncertainty_factors.length > 0 && (
                  <div className="border-t border-edge pt-3">
                    <h3 className="mb-1.5 text-xs font-medium text-content-muted">
                      Uncertainty Factors
                    </h3>
                    <ul className="space-y-1">
                      {workspace.confidence_narrative.uncertainty_factors.map(
                        (factor, i) => (
                          <li
                            key={i}
                            className="text-xs text-content-muted"
                          >
                            &bull; {factor}
                          </li>
                        )
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Coherence */}
          {workspace.coherence && (
            <section className="rounded-lg border border-edge bg-surface-card p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-content-muted">
                Coherence
              </h2>
              <div className="space-y-3">
                {/* Score bar */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-content-muted">Coherence Score</span>
                    <span
                      className={`text-xs font-medium ${
                        workspace.coherence.coherence_score >= 70
                          ? "text-emerald-400"
                          : workspace.coherence.coherence_score >= 40
                          ? "text-amber-400"
                          : "text-red-400"
                      }`}
                    >
                      {workspace.coherence.coherence_score}/100
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-inset">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        workspace.coherence.coherence_score >= 70
                          ? "bg-emerald-500"
                          : workspace.coherence.coherence_score >= 40
                          ? "bg-amber-500"
                          : "bg-red-500"
                      }`}
                      style={{
                        width: `${Math.min(100, workspace.coherence.coherence_score)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Conflict annotations */}
                {workspace.coherence.conflict_annotations.length > 0 && (
                  <div className="space-y-2">
                    {workspace.coherence.conflict_annotations.map((note, i) => (
                      <div
                        key={i}
                        className="rounded-md border border-amber-900/50 bg-amber-500/5 px-3 py-2"
                      >
                        <p className="text-xs text-amber-300/90">{note}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Suppression warning */}
                {workspace.coherence.suppressed && (
                  <div className="rounded-md border border-red-900/50 bg-red-500/5 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-400">&#9888;</span>
                      <p className="text-xs text-red-300/90">
                        Suppressed by higher-priority pack
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Quick Stats Cards */}
          <section className="rounded-lg border border-edge bg-surface-card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-content-muted">
              Quick Stats
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Negative Findings"
                value={negativeFindings.length}
                color="text-red-400"
              />
              <StatCard
                label="Positive Findings"
                value={positiveFindings.length}
                color="text-emerald-400"
              />
              <StatCard
                label="Avg Confidence"
                value={`${avgConfidence}%`}
                color="text-content-secondary"
              />
              <StatCard
                label="Top Severity"
                value={topSeverity}
                color={
                  topSeverity === "critical"
                    ? "text-red-400"
                    : topSeverity === "high"
                    ? "text-orange-400"
                    : topSeverity === "medium"
                    ? "text-amber-400"
                    : "text-content-muted"
                }
              />
            </div>
          </section>
        </div>
      </div>

      {/* ── Finding Drawer ── */}
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

// ──────────────────────────────────────────────
// Preflight Checklist
// ──────────────────────────────────────────────

type PreflightReadiness = "ready" | "ready_with_risks" | "blocker";

const readinessConfig: Record<
  PreflightReadiness,
  { label: string; style: string }
> = {
  ready: {
    label: "Ready",
    style: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  ready_with_risks: {
    label: "Ready with Risks",
    style: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  },
  blocker: {
    label: "Blocker",
    style: "bg-red-500/10 text-red-400 border-red-500/30",
  },
};

function computePreflightReadiness(
  findings: FindingProjection[]
): PreflightReadiness {
  const hasBlocker = findings.some(
    (f) =>
      f.polarity === "negative" &&
      (f.severity === "critical" || f.severity === "high")
  );
  if (hasBlocker) return "blocker";

  const hasWarning = findings.some(
    (f) =>
      f.polarity === "negative" &&
      (f.severity === "medium" || f.severity === "low")
  );
  if (hasWarning) return "ready_with_risks";

  return "ready";
}

function PreflightChecklist({
  findings,
  readiness,
  onFindingClick,
}: {
  findings: FindingProjection[];
  readiness: PreflightReadiness;
  onFindingClick: (f: FindingProjection) => void;
}) {
  const cfg = readinessConfig[readiness];

  return (
    <div className="space-y-4">
      {/* Readiness badge */}
      <div
        className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-semibold ${cfg.style}`}
      >
        {readiness === "ready" && <span className="mr-1.5">&#10003;</span>}
        {readiness === "ready_with_risks" && <span className="mr-1.5">&#9888;</span>}
        {readiness === "blocker" && <span className="mr-1.5">&#10007;</span>}
        {cfg.label}
      </div>

      {/* Check items */}
      <div className="space-y-1">
        {findings.map((f) => {
          const isPass = f.polarity === "positive";
          const isWarning =
            f.polarity === "negative" &&
            (f.severity === "low" || f.severity === "medium");
          const isFail =
            f.polarity === "negative" &&
            (f.severity === "high" || f.severity === "critical");

          let iconClass: string;
          let icon: string;
          let textClass: string;

          if (isPass) {
            icon = "\u2713";
            iconClass = "text-emerald-400";
            textClass = "text-content-secondary";
          } else if (isWarning) {
            icon = "\u26A0";
            iconClass = "text-amber-400";
            textClass = "text-amber-300/90";
          } else if (isFail) {
            icon = "\u2717";
            iconClass = "text-red-400";
            textClass = "text-red-300/90";
          } else {
            icon = "\u25CB";
            iconClass = "text-content-muted";
            textClass = "text-content-muted";
          }

          return (
            <button
              key={f.id}
              onClick={() => onFindingClick(f)}
              className="flex w-full items-start gap-3 rounded-md border border-edge bg-surface-card/30 px-4 py-3 text-left transition-colors hover:border-edge hover:bg-surface-card/60"
            >
              <span className={`mt-0.5 text-sm font-bold ${iconClass}`}>
                {icon}
              </span>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-medium ${textClass}`}>
                  {f.title}
                </div>
                {f.root_cause && (
                  <div className="mt-0.5 text-xs text-content-muted">
                    {f.root_cause}
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <SeverityBadge value={f.severity} />
                  <VerificationBadge value={f.verification_maturity} />
                  {f.change_class && <ChangeBadge value={f.change_class} />}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Finding Drawer Content (reused pattern from analysis page)
// ──────────────────────────────────────────────

function FindingDrawerContent({
  finding,
  onDiscuss,
}: {
  finding: FindingProjection;
  onDiscuss: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Summary + badges */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
          Summary
        </h3>
        <p className="text-sm text-content-secondary">{finding.cause}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {finding.polarity === "positive" ? (
            <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
              Healthy
            </span>
          ) : (
            <SeverityBadge value={finding.severity} />
          )}
          <VerificationBadge value={finding.verification_maturity} />
          {finding.change_class && <ChangeBadge value={finding.change_class} />}
          <span className="text-xs text-content-muted">
            Confidence {finding.confidence}%
          </span>
          <span className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">
            {packLabels[finding.pack] || finding.pack}
          </span>
          {finding.surface && (
            <code className="rounded border border-edge px-2 py-0.5 text-xs text-content-muted">
              {finding.surface}
            </code>
          )}
        </div>
      </section>

      {/* Suppression Callout */}
      {finding.suppression_context && finding.suppression_context.is_suppressed && (
        <section>
          <div className="rounded-md border border-amber-900/50 bg-amber-500/5 px-4 py-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-amber-500 text-xs font-semibold">
                Suppressed
              </span>
              <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400">
                {finding.suppression_context.visibility}
              </span>
            </div>
            <p className="text-xs text-amber-300/80">
              {finding.suppression_context.explanation}
            </p>
            {finding.suppression_context.confidence_reduction > 0 && (
              <p className="mt-1 text-xs text-amber-400/60">
                Confidence reduced by{" "}
                {finding.suppression_context.confidence_reduction} points
              </p>
            )}
          </div>
        </section>
      )}

      {/* Effect */}
      {finding.effect && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
            Effect
          </h3>
          <p className="text-sm text-content-muted">{finding.effect}</p>
        </section>
      )}

      {/* Root Cause */}
      {finding.root_cause && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
            Root Cause
          </h3>
          <div className="rounded-md border border-edge bg-surface-card px-4 py-3">
            <span className="text-sm font-medium text-content-secondary">
              {finding.root_cause}
            </span>
          </div>
        </section>
      )}

      {/* Impact Breakdown */}
      {finding.polarity !== "positive" && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
            Impact Breakdown
          </h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-2">
              <span className="text-xs text-content-muted">Monthly Range</span>
              <ImpactBadge
                min={finding.impact.monthly_range.min}
                max={finding.impact.monthly_range.max}
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-2">
              <span className="text-xs text-content-muted">Midpoint</span>
              <ImpactBadge
                min={finding.impact.midpoint}
                max={finding.impact.midpoint}
                compact
              />
            </div>
            <div className="flex items-center justify-between rounded-md border border-edge bg-surface-card px-4 py-2">
              <span className="text-xs text-content-muted">Impact Type</span>
              <span className="text-xs text-content-secondary">
                {impactTypeLabels[finding.impact.impact_type] ||
                  finding.impact.impact_type}
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Evidence Quality */}
      {finding.evidence_quality && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
            Evidence Quality
          </h3>
          <div className="space-y-2 rounded-md border border-edge bg-surface-card px-4 py-3">
            <EvidenceQualityBar
              label="Source Reliability"
              value={finding.evidence_quality.source_reliability}
            />
            <EvidenceQualityBar
              label="Completeness"
              value={finding.evidence_quality.completeness}
            />
            <EvidenceQualityBar
              label="Recency"
              value={finding.evidence_quality.recency}
            />
            <EvidenceQualityBar
              label="Corroboration"
              value={finding.evidence_quality.corroboration}
            />
          </div>
        </section>
      )}

      {/* Verification Lifecycle Panel */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
          Verification
        </h3>
        <VerificationPanel
          maturity={finding.verification_maturity}
          method={finding.verification_method}
          verifiedAt={null}
          expiresAt={null}
          confidenceAtVerification={null}
          currentConfidence={null}
          reTriggerReason={null}
          decisionStatus={null}
          onRequestVerification={() =>
            toast.success("Verification requested")
          }
        />
      </section>

      {/* Verification Sufficiency Warning */}
      <VerificationSufficiencyWarning
        severity={finding.severity}
        maturity={finding.verification_maturity}
      />

      {/* Reasoning */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-content-muted">
          {finding.polarity === "positive" ? "Why This Is Good" : "Reasoning"}
        </h3>
        <p className="text-sm leading-relaxed text-content-muted">
          {finding.reasoning}
        </p>
      </section>

      {/* Truth Context */}
      {finding.truth_context && finding.truth_context.has_contradictions && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-500">
            Evidence Contradictions
          </h3>
          <div className="rounded-md border border-amber-900/50 bg-amber-500/5 px-4 py-3">
            <p className="text-xs text-amber-300">
              {finding.truth_context.contradiction_count} contradiction
              {finding.truth_context.contradiction_count > 1 ? "s" : ""}{" "}
              detected in backing evidence. Confidence adjusted by{" "}
              {finding.truth_context.truth_confidence_delta > 0 ? "+" : ""}
              {finding.truth_context.truth_confidence_delta}%.
            </p>
          </div>
        </section>
      )}

      {/* Discuss CTA */}
      {finding.polarity !== "positive" && (
        <section>
          <button
            onClick={onDiscuss}
            className="w-full rounded-md border border-emerald-800/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            Discuss This Finding
          </button>
        </section>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Sub-components
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
      stable: { icon: "\u2014", color: "text-content-muted", label: "stable" },
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

function TrendHeadline({
  summary,
}: {
  summary: NonNullable<WorkspaceProjection["change_summary"]>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {summary.regression_count > 0 && (
        <span className="text-red-400">
          {summary.regression_count} regression
          {summary.regression_count !== 1 ? "s" : ""}
        </span>
      )}
      {summary.improvement_count > 0 && (
        <span className="text-emerald-400">
          {summary.improvement_count} improvement
          {summary.improvement_count !== 1 ? "s" : ""}
        </span>
      )}
      {summary.resolved_count > 0 && (
        <span className="text-emerald-400">
          {summary.resolved_count} resolved
        </span>
      )}
      {summary.regression_count === 0 &&
        summary.improvement_count === 0 &&
        summary.resolved_count === 0 && (
          <span className="text-content-muted">No significant changes</span>
        )}
    </div>
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
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-content-muted">{label}</span>
        <span className={`text-xs font-medium ${textColor}`}>{level}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-inset">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="rounded-md border border-edge bg-surface-card/30 px-3 py-2.5">
      <div className="text-[10px] font-medium uppercase tracking-wider text-content-muted">
        {label}
      </div>
      <div className={`mt-1 text-lg font-bold ${color}`}>
        {typeof value === "string"
          ? value.replace(/_/g, " ")
          : value}
      </div>
    </div>
  );
}

function EvidenceQualityBar({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  const barColor =
    value >= 70
      ? "bg-emerald-500"
      : value >= 40
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 shrink-0 text-xs text-content-muted">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-inset">
        <div
          className={`h-1.5 rounded-full transition-all ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <span className="w-8 text-right font-mono text-xs text-content-muted">
        {value}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

function getTopSeverity(findings: FindingProjection[]): string {
  if (findings.length === 0) return "none";
  let top = "none";
  let topRank = -1;
  for (const f of findings) {
    const rank = SEVERITY_RANK[f.severity] ?? 0;
    if (rank > topRank) {
      topRank = rank;
      top = f.severity;
    }
  }
  return top;
}
