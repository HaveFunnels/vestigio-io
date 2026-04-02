"use client";

import { useState } from "react";
import DataTable, { Column } from "@/components/console/DataTable";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import SummaryCards from "@/components/console/SummaryCards";
import ImpactBadge from "@/components/console/ImpactBadge";
import ConsoleState from "@/components/console/ConsoleState";
import { loadWorkspaces } from "@/lib/console-data";
import type { WorkspaceProjection, FindingProjection } from "../../../../packages/projections";

const workspaceTypeLabels: Record<string, string> = { preflight: "Scale Readiness", revenue: "Revenue Integrity", chargeback: "Chargeback Resilience" };
const impactTypeLabels: Record<string, string> = { revenue_loss: "Revenue Loss", conversion_loss: "Conversion Loss", chargeback_risk: "Chargeback Risk", traffic_waste: "Traffic Waste", lifetime_value_loss: "LTV Loss" };

function formatCurrency(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

export default function WorkspacesPage() {
  const dataState = loadWorkspaces();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Workspaces</h1>
        <p className="mt-1 text-sm text-zinc-500">Contextual analysis views with quantified impact.</p>
      </div>
      <ConsoleState state={dataState} loadingLabel="Loading workspaces..." emptyLabel="No workspaces available.">
        {(workspaces) => <WorkspacesContent workspaces={workspaces} />}
      </ConsoleState>
    </div>
  );
}

function WorkspacesContent({ workspaces }: { workspaces: WorkspaceProjection[] }) {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceProjection | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<FindingProjection | null>(null);

  const findingColumns: Column<FindingProjection>[] = [
    { key: "title", label: "Finding", render: (row) => (<div><div className="text-sm text-zinc-200">{row.title}</div>{row.root_cause && <div className="mt-0.5 text-xs text-zinc-500">{row.root_cause}</div>}</div>) },
    { key: "severity", label: "Severity", className: "w-24", render: (row) => <SeverityBadge value={row.severity} /> },
    { key: "impact", label: "Est. Impact", className: "w-44", render: (row) => <ImpactBadge min={row.impact.monthly_range.min} max={row.impact.monthly_range.max} /> },
    { key: "confidence", label: "Conf", className: "w-16", render: (row) => <span className="font-mono text-xs text-zinc-400">{row.confidence}%</span> },
    { key: "surface", label: "Surface", className: "w-28", render: (row) => <code className="text-xs text-zinc-400">{row.surface}</code> },
  ];

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {workspaces.map((ws) => {
          const isActive = activeWorkspace?.id === ws.id;
          return (
            <button key={ws.id} onClick={() => { setActiveWorkspace(isActive ? null : ws); setSelectedFinding(null); }}
              className={`group w-full rounded-lg border text-left transition-colors ${isActive ? "border-blue-600/50 bg-blue-500/5" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-900/80"}`}>
              <div className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-base font-semibold text-zinc-100">{ws.name}</span>
                    <span className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-400">{workspaceTypeLabels[ws.type] || ws.type}</span>
                  </div>
                  <SeverityBadge value={ws.decision_impact} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div><div className="text-xs text-zinc-500">Monthly Loss</div><div className="text-sm font-bold text-red-400">{formatCurrency(ws.summary.total_loss_mid)}</div></div>
                  <div><div className="text-xs text-zinc-500">Issues</div><div className="text-sm font-medium text-zinc-300">{ws.summary.issue_count}</div></div>
                  <div><div className="text-xs text-zinc-500">Confidence</div><div className="text-sm font-medium text-zinc-300">{ws.summary.confidence}%</div></div>
                  <div><div className="text-xs text-zinc-500">Top Issue</div><div className="truncate text-xs text-zinc-400">{ws.summary.top_issues[0] || '—'}</div></div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {activeWorkspace && (
        <div className="space-y-6">
          <SummaryCards cards={[
            { label: "Total Monthly Loss", value: formatCurrency(activeWorkspace.summary.total_loss_mid), variant: activeWorkspace.summary.total_loss_mid >= 20000 ? "danger" : "warning", subtext: `${formatCurrency(activeWorkspace.summary.total_loss_range.min)} – ${formatCurrency(activeWorkspace.summary.total_loss_range.max)}` },
            { label: "Highest Impact", value: activeWorkspace.summary.top_issues[0]?.split(" ").slice(0, 3).join(" ") + "…" || "—", variant: "danger" },
            { label: "Issues Found", value: activeWorkspace.summary.issue_count, variant: activeWorkspace.summary.issue_count > 3 ? "warning" : "default" },
            { label: "Confidence", value: `${activeWorkspace.summary.confidence}%`, variant: "default" },
          ]} />
          <div>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">Findings &mdash; {activeWorkspace.name}</h2>
            <DataTable columns={findingColumns} data={activeWorkspace.findings} onRowClick={(row) => setSelectedFinding(row)} getRowKey={(row) => row.id} />
          </div>
        </div>
      )}

      <SideDrawer open={selectedFinding !== null} onClose={() => setSelectedFinding(null)} title={selectedFinding?.title || ""}>
        {selectedFinding && (
          <div className="space-y-6">
            {/* Summary + badges */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Summary</h3>
              <p className="text-sm text-zinc-300">{selectedFinding.cause}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {selectedFinding.polarity === 'positive'
                  ? <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">Healthy</span>
                  : <SeverityBadge value={selectedFinding.severity} />}
                <span className="text-xs text-zinc-500">Confidence {selectedFinding.confidence}%</span>
                {selectedFinding.surface && <code className="rounded border border-zinc-700 px-2 py-0.5 text-xs text-zinc-500">{selectedFinding.surface}</code>}
              </div>
            </section>

            {/* Effect */}
            {selectedFinding.effect && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Effect</h3>
                <p className="text-sm text-zinc-400">{selectedFinding.effect}</p>
              </section>
            )}

            {/* Root Cause */}
            {selectedFinding.root_cause && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Root Cause</h3>
                <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                  <span className="text-sm font-medium text-zinc-200">{selectedFinding.root_cause}</span>
                </div>
              </section>
            )}

            {/* Impact Breakdown */}
            {selectedFinding.polarity !== 'positive' && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Impact Breakdown</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2">
                    <span className="text-xs text-zinc-500">Monthly Range</span>
                    <ImpactBadge min={selectedFinding.impact.monthly_range.min} max={selectedFinding.impact.monthly_range.max} />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2">
                    <span className="text-xs text-zinc-500">Midpoint</span>
                    <ImpactBadge min={selectedFinding.impact.midpoint} max={selectedFinding.impact.midpoint} compact />
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-2">
                    <span className="text-xs text-zinc-500">Impact Type</span>
                    <span className="text-xs text-zinc-300">{impactTypeLabels[selectedFinding.impact.impact_type] || selectedFinding.impact.impact_type}</span>
                  </div>
                </div>
              </section>
            )}

            {/* Reasoning */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                {selectedFinding.polarity === 'positive' ? 'Why This Is Good' : 'Reasoning'}
              </h3>
              <p className="text-sm leading-relaxed text-zinc-400">{selectedFinding.reasoning}</p>
            </section>

            {/* Truth Context */}
            {selectedFinding.truth_context && selectedFinding.truth_context.has_contradictions && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-amber-500">Evidence Contradictions</h3>
                <div className="rounded-md border border-amber-900/50 bg-amber-500/5 px-4 py-3">
                  <p className="text-xs text-amber-300">
                    {selectedFinding.truth_context.contradiction_count} contradiction{selectedFinding.truth_context.contradiction_count > 1 ? 's' : ''} detected in backing evidence.
                    Confidence adjusted by {selectedFinding.truth_context.truth_confidence_delta > 0 ? '+' : ''}{selectedFinding.truth_context.truth_confidence_delta}%.
                  </p>
                </div>
              </section>
            )}
          </div>
        )}
      </SideDrawer>
    </>
  );
}
