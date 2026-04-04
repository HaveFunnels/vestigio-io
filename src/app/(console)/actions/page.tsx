"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DataTable, { Column } from "@/components/console/DataTable";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import VerificationBadge from "@/components/console/VerificationBadge";
import ChangeBadge from "@/components/console/ChangeBadge";
import ChangeTimeline from "@/components/console/ChangeTimeline";
import SummaryCards, { SummaryCard } from "@/components/console/SummaryCards";
import ImpactBadge from "@/components/console/ImpactBadge";
import ConsoleState from "@/components/console/ConsoleState";
import VerificationPanel from "@/components/console/VerificationPanel";
import VerificationSufficiencyWarning from "@/components/console/VerificationSufficiencyWarning";
import { loadActions, loadChangeReport } from "@/lib/console-data";
import { useMcpData } from "@/components/app/McpDataProvider";
import type { ActionProjection, ChangeReportProjection } from "../../../../packages/projections";

// ──────────────────────────────────────────────
// Actions Page — Phase 1B UX Overhaul
//
// Operational queue with incident/opportunity distinction.
// Tab-based filtering, operational status timelines,
// resolve-path action buttons, and category badges.
// ──────────────────────────────────────────────

type CategoryTab = "all" | "incident" | "opportunity" | "verification";

const categoryConfig: Record<string, { label: string; dotColor: string; badgeStyle: string }> = {
  incident: {
    label: "Incident",
    dotColor: "bg-red-500",
    badgeStyle: "bg-red-500/10 text-red-400 border-red-500/20",
  },
  opportunity: {
    label: "Opportunity",
    dotColor: "bg-emerald-500",
    badgeStyle: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  },
  verification: {
    label: "Verification",
    dotColor: "bg-blue-500",
    badgeStyle: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  },
  observation: {
    label: "Observation",
    dotColor: "bg-zinc-500",
    badgeStyle: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  },
};

const effortConfig: Record<string, { label: string; style: string }> = {
  trivial: { label: "Trivial", style: "text-emerald-400" },
  low: { label: "Low", style: "text-blue-400" },
  medium: { label: "Medium", style: "text-amber-400" },
  high: { label: "High", style: "text-orange-400" },
  very_high: { label: "Very High", style: "text-red-400" },
};

const resolveConfig: Record<string, { label: string; style: string }> = {
  fix: { label: "Fix", style: "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20" },
  verify: { label: "Verify", style: "bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20" },
  track: { label: "Track", style: "bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20" },
  dismiss: { label: "Dismiss", style: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30 hover:bg-zinc-500/20" },
};

// ──────────────────────────────────────────────
// Incident operational timeline steps
// ──────────────────────────────────────────────

const incidentSteps = ["opened", "acknowledged", "mitigated", "verified", "closed"];
const opportunitySteps = ["identified", "sized", "accepted", "implemented", "verified", "archived"];

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function ActionsPage() {
  const mcpData = useMcpData();
  const dataState = mcpData.actions.status !== "not_ready" ? mcpData.actions : loadActions();
  const changeState = mcpData.changeReport.status !== "not_ready" ? mcpData.changeReport : loadChangeReport();
  const changeReport = changeState.status === 'ready' ? changeState.data : null;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Actions</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Prioritized queue of what needs attention
        </p>
      </div>

      <ConsoleState
        state={dataState}
        loadingLabel="Loading prioritized actions..."
        emptyLabel="No actions required. Your site has no significant issues detected."
      >
        {(actions) => <ActionsContent actions={actions} changeReport={changeReport} />}
      </ConsoleState>
    </div>
  );
}

// ──────────────────────────────────────────────
// Content
// ──────────────────────────────────────────────

function ActionsContent({ actions, changeReport }: { actions: ActionProjection[]; changeReport: ChangeReportProjection | null }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ActionProjection | null>(null);
  const [activeTab, setActiveTab] = useState<CategoryTab>("all");

  // Category counts
  const counts = useMemo(() => {
    const c = { incident: 0, opportunity: 0, verification: 0, observation: 0 };
    for (const a of actions) {
      if (a.category in c) c[a.category as keyof typeof c]++;
    }
    return c;
  }, [actions]);

  // Filtered actions based on active tab
  const filtered = useMemo(() => {
    if (activeTab === "all") return actions;
    return actions.filter((a) => a.category === activeTab);
  }, [actions, activeTab]);

  // Total addressable impact
  const totalImpact = useMemo(() => {
    return actions.reduce((sum, a) => sum + (a.impact?.midpoint || 0), 0);
  }, [actions]);

  // Summary cards
  const cards: SummaryCard[] = [
    {
      label: "Active Incidents",
      value: counts.incident,
      variant: "danger",
      subtext: counts.incident > 0 ? "require remediation" : "none detected",
    },
    {
      label: "Open Opportunities",
      value: counts.opportunity,
      variant: "success",
      subtext: counts.opportunity > 0 ? "actionable improvements" : "none identified",
    },
    {
      label: "Pending Verifications",
      value: counts.verification,
      variant: "info",
      subtext: counts.verification > 0 ? "awaiting confirmation" : "all verified",
    },
    {
      label: "Total Addressable Impact",
      value: totalImpact >= 1000 ? `${formatCurrency(totalImpact)}` : `$${totalImpact}`,
      variant: "warning",
      subtext: "/month (midpoint)",
    },
  ];

  // Tab definitions
  const tabs: { key: CategoryTab; label: string; count?: number; dotColor?: string }[] = [
    { key: "all", label: "All" },
    { key: "incident", label: "Incidents", count: counts.incident, dotColor: "bg-red-500" },
    { key: "opportunity", label: "Opportunities", count: counts.opportunity, dotColor: "bg-emerald-500" },
    { key: "verification", label: "Verifications", count: counts.verification, dotColor: "bg-blue-500" },
  ];

  // Table columns
  const columns: Column<ActionProjection>[] = [
    {
      key: "priority",
      label: "#",
      className: "w-12",
      render: (row: ActionProjection, _idx?: number) => {
        const rank = filtered.indexOf(row) + 1;
        return <span className="font-mono text-xs text-zinc-500">{rank}</span>;
      },
    },
    {
      key: "title",
      label: "Action",
      render: (row) => (
        <div>
          <div className="text-sm text-zinc-200">{row.title}</div>
          {row.root_cause && <div className="mt-0.5 text-xs text-zinc-500">{row.root_cause}</div>}
        </div>
      ),
    },
    {
      key: "category",
      label: "Category",
      className: "w-28",
      render: (row) => <CategoryBadge category={row.category} />,
    },
    {
      key: "status",
      label: "Status",
      className: "w-28",
      render: (row) => {
        const status = row.operational_status || row.decision_status;
        if (!status) return <span className="text-xs text-zinc-600">--</span>;
        return (
          <span className="inline-flex items-center rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
            {status.replace(/_/g, " ")}
          </span>
        );
      },
    },
    {
      key: "impact",
      label: "Impact",
      className: "w-40",
      render: (row) =>
        row.impact ? (
          <ImpactBadge min={row.impact.monthly_range.min} max={row.impact.monthly_range.max} />
        ) : (
          <span className="text-xs text-zinc-600">--</span>
        ),
    },
    {
      key: "severity",
      label: "Severity",
      className: "w-24",
      render: (row) => <SeverityBadge value={row.severity} />,
    },
    {
      key: "effort",
      label: "Effort",
      className: "w-20",
      render: (row) => {
        if (!row.effort_hint) return <span className="text-xs text-zinc-600">--</span>;
        const cfg = effortConfig[row.effort_hint];
        return (
          <span className={`text-xs font-medium ${cfg?.style || "text-zinc-400"}`}>
            {cfg?.label || row.effort_hint}
          </span>
        );
      },
    },
    {
      key: "resolve",
      label: "Resolve",
      className: "w-24",
      render: (row) => {
        if (!row.resolve_path) return <span className="text-xs text-zinc-600">--</span>;
        const cfg = resolveConfig[row.resolve_path];
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSelected(row);
            }}
            className={`rounded border px-2.5 py-1 text-xs font-medium transition-colors ${cfg?.style || ""}`}
          >
            {cfg?.label || row.resolve_path}
          </button>
        );
      },
    },
  ];

  return (
    <>
      {/* Summary Cards */}
      <div className="mb-6">
        <SummaryCards cards={cards} />
      </div>

      {/* Change Summary Banner */}
      <div className="mb-4">
        <ChangeSummaryBanner report={changeReport} />
      </div>

      {/* Tab Bar */}
      <div className="mb-4 flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-zinc-800 text-zinc-100"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab.dotColor && (
              <span className={`inline-block h-2 w-2 rounded-full ${tab.dotColor}`} />
            )}
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="rounded-full bg-zinc-700/60 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filtered}
        onRowClick={(row) => setSelected(row)}
        getRowKey={(row) => row.id}
      />

      {/* Side Drawer */}
      <SideDrawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected?.title || ""}
      >
        {selected && <ActionDrawerContent action={selected} onNavigateChat={(id) => router.push(`/chat?action=${id}`)} />}
      </SideDrawer>
    </>
  );
}

// ──────────────────────────────────────────────
// Change Summary Banner — Phase 2 UX
// ──────────────────────────────────────────────

const trendConfig: Record<string, { arrow: string; color: string; textColor: string }> = {
  degrading: { arrow: "\u2191", color: "border-red-800/50 bg-red-500/5", textColor: "text-red-400" },
  improving: { arrow: "\u2193", color: "border-emerald-800/50 bg-emerald-500/5", textColor: "text-emerald-400" },
  stable: { arrow: "\u2014", color: "border-zinc-800 bg-zinc-900/50", textColor: "text-zinc-400" },
  mixed: { arrow: "\u2195", color: "border-amber-800/50 bg-amber-500/5", textColor: "text-amber-400" },
};

function ChangeSummaryBanner({ report }: { report: ChangeReportProjection | null }) {
  const [expanded, setExpanded] = useState(false);

  // No change report — first analysis
  if (!report) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
        <span className="text-sm text-zinc-500">
          First analysis -- no change history yet
        </span>
      </div>
    );
  }

  const trend = trendConfig[report.overall_trend] || trendConfig.stable;
  const allChanges = [
    ...report.regressions,
    ...report.improvements,
    ...report.new_issues,
    ...report.resolved,
  ];

  return (
    <div className={`rounded-lg border ${trend.color} transition-all`}>
      {/* Compact header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          {/* Trend arrow */}
          <span className={`text-lg font-bold ${trend.textColor}`}>
            {trend.arrow}
          </span>

          {/* Headline text */}
          <span className="text-sm text-zinc-200">
            {report.headline}
          </span>

          {/* Count pills */}
          <div className="flex items-center gap-2">
            {report.regression_count > 0 && (
              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-400">
                {report.regression_count} regression{report.regression_count !== 1 ? "s" : ""}
              </span>
            )}
            {report.improvement_count > 0 && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                {report.improvement_count} improvement{report.improvement_count !== 1 ? "s" : ""}
              </span>
            )}
            {report.resolved_count > 0 && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                {report.resolved_count} resolved
              </span>
            )}
            {report.new_issue_count > 0 && (
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-400">
                {report.new_issue_count} new
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <svg
          className={`h-4 w-4 text-zinc-500 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded detail: change timeline */}
      {expanded && allChanges.length > 0 && (
        <div className="border-t border-zinc-800/60 px-4 py-4">
          <ChangeTimeline changes={allChanges} maxItems={10} />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Category Badge
// ──────────────────────────────────────────────

function CategoryBadge({ category }: { category: string }) {
  const cfg = categoryConfig[category];
  if (!cfg) return <span className="text-xs text-zinc-500">{category}</span>;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-medium ${cfg.badgeStyle}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dotColor}`} />
      {cfg.label}
    </span>
  );
}

// ──────────────────────────────────────────────
// Drawer Content
// ──────────────────────────────────────────────

function ActionDrawerContent({
  action,
  onNavigateChat,
}: {
  action: ActionProjection;
  onNavigateChat: (id: string) => void;
}) {
  const cfg = categoryConfig[action.category];
  const resolveCfg = action.resolve_path ? resolveConfig[action.resolve_path] : null;

  return (
    <div className="space-y-6">
      {/* Title + Description */}
      <section>
        <p className="text-sm text-zinc-300">{action.description}</p>
      </section>

      {/* Badge Row */}
      <section>
        <div className="flex flex-wrap items-center gap-2">
          <CategoryBadge category={action.category} />
          <SeverityBadge value={action.severity} />
          <VerificationBadge value={action.verification_maturity} />
          <ChangeBadge value={action.change_class} />
          {action.effort_hint && (
            <span className={`inline-flex items-center rounded border border-zinc-700 px-2 py-0.5 text-xs font-medium ${effortConfig[action.effort_hint]?.style || "text-zinc-400"}`}>
              {effortConfig[action.effort_hint]?.label || action.effort_hint} effort
            </span>
          )}
        </div>
      </section>

      {/* Impact Breakdown */}
      {action.impact && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Impact Breakdown
          </h3>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Monthly Range</span>
              <ImpactBadge min={action.impact.monthly_range.min} max={action.impact.monthly_range.max} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Midpoint</span>
              <ImpactBadge min={action.impact.midpoint} max={action.impact.midpoint} compact />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Confidence</span>
              <span className="font-mono text-xs text-zinc-400">{action.confidence}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Priority Score</span>
              <span className="font-mono text-xs text-zinc-300">{action.priority_score}</span>
            </div>
          </div>
        </section>
      )}

      {/* Root Cause */}
      {action.root_cause && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Root Cause
          </h3>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <span className="text-sm font-medium text-zinc-200">{action.root_cause}</span>
          </div>
        </section>
      )}

      {/* Operational Status Timeline */}
      {action.operational_status && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Operational Status
          </h3>
          <OperationalTimeline
            category={action.category}
            currentStatus={action.operational_status}
          />
        </section>
      )}

      {/* Verification Lifecycle Panel */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Verification
        </h3>
        <VerificationPanel
          maturity={action.verification_maturity}
          method="unknown"
          verifiedAt={null}
          expiresAt={null}
          confidenceAtVerification={null}
          currentConfidence={null}
          reTriggerReason={null}
          decisionStatus={action.decision_status}
          onRequestVerification={() => toast.success("Verification requested")}
          onConfirmResolution={() => toast.success("Confirmation verification requested")}
        />
      </section>

      {/* Verification Sufficiency Warning */}
      <VerificationSufficiencyWarning
        severity={action.severity}
        maturity={action.verification_maturity}
      />

      {/* Scope */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Scope
        </h3>
        <span
          className={`inline-flex rounded border px-2 py-0.5 text-xs ${
            action.cross_pack
              ? "border-emerald-800/50 text-emerald-400"
              : "border-zinc-800 text-zinc-400"
          }`}
        >
          {action.cross_pack ? "Affects multiple packs" : "Single pack"}
        </span>
      </section>

      {/* Action Buttons */}
      <section className="space-y-2">
        <button
          onClick={() => onNavigateChat(action.id)}
          className="w-full rounded-md border border-emerald-800/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400 transition-colors hover:bg-emerald-500/20"
        >
          Discuss in Chat
        </button>
        {resolveCfg && (
          <button
            className={`w-full rounded-md border px-4 py-2 text-sm font-medium transition-colors ${resolveCfg.style}`}
          >
            {resolveCfg.label} This {cfg?.label || "Action"}
          </button>
        )}
      </section>
    </div>
  );
}

// ──────────────────────────────────────────────
// Operational Timeline
// ──────────────────────────────────────────────

function OperationalTimeline({
  category,
  currentStatus,
}: {
  category: string;
  currentStatus: string;
}) {
  const steps = category === "incident" ? incidentSteps : opportunitySteps;
  const currentIndex = steps.indexOf(currentStatus);

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const isPast = i < currentIndex;
          const isCurrent = i === currentIndex;

          return (
            <div key={step} className="flex items-center">
              {/* Step indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                    isCurrent
                      ? category === "incident"
                        ? "bg-red-500/20 text-red-400 ring-2 ring-red-500/40"
                        : "bg-emerald-500/20 text-emerald-400 ring-2 ring-emerald-500/40"
                      : isPast
                        ? "bg-zinc-700 text-zinc-300"
                        : "bg-zinc-800/50 text-zinc-600"
                  }`}
                >
                  {isPast ? "\u2713" : i + 1}
                </div>
                <span
                  className={`mt-1.5 text-[10px] leading-tight ${
                    isCurrent ? "font-semibold text-zinc-200" : isPast ? "text-zinc-400" : "text-zinc-600"
                  }`}
                >
                  {step.replace(/_/g, " ")}
                </span>
              </div>

              {/* Connector line */}
              {i < steps.length - 1 && (
                <div
                  className={`mx-1 h-0.5 w-4 ${
                    i < currentIndex ? "bg-zinc-600" : "bg-zinc-800"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
