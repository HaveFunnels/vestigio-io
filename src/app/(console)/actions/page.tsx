"use client";

import { useState, useMemo } from "react";
import DataTable, { Column } from "@/components/console/DataTable";
import SideDrawer from "@/components/console/SideDrawer";
import SeverityBadge from "@/components/console/SeverityBadge";
import SummaryCards, { SummaryCard } from "@/components/console/SummaryCards";
import ImpactBadge from "@/components/console/ImpactBadge";
import ConsoleState from "@/components/console/ConsoleState";
import { loadActions } from "@/lib/console-data";
import type { ActionProjection } from "../../../../packages/projections";

// ──────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────

export default function ActionsPage() {
  const dataState = loadActions();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-zinc-100">Actions</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Globally prioritized actions sorted by estimated financial impact. Fix what matters most.
        </p>
      </div>

      <ConsoleState
        state={dataState}
        loadingLabel="Loading prioritized actions..."
        emptyLabel="No actions required. Your site has no significant issues detected."
      >
        {(actions) => <ActionsContent actions={actions} />}
      </ConsoleState>
    </div>
  );
}

function ActionsContent({ actions }: { actions: ActionProjection[] }) {
  const [selected, setSelected] = useState<ActionProjection | null>(null);

  const totalImpact = useMemo(() => {
    return actions.reduce((sum, a) => sum + (a.impact?.midpoint || 0), 0);
  }, [actions]);

  const cards: SummaryCard[] = [
    { label: "Total Actions", value: actions.length },
    {
      label: "Total Impact Addressable",
      value: totalImpact >= 1000 ? `$${(totalImpact / 1000).toFixed(1)}k` : `$${totalImpact}`,
      variant: "danger",
      subtext: "/month (midpoint)",
    },
    { label: "Cross-Pack", value: actions.filter((a) => a.cross_pack).length, variant: "info" },
    { label: "High Severity", value: actions.filter((a) => a.severity === "critical" || a.severity === "high").length, variant: "warning" },
  ];

  const columns: Column<ActionProjection>[] = [
    { key: "priority", label: "#", className: "w-10", render: (row: ActionProjection) => <span className="font-mono text-xs text-zinc-400">{row.priority_score}</span> },
    {
      key: "title", label: "Action",
      render: (row) => (
        <div>
          <div className="text-sm text-zinc-200">{row.title}</div>
          {row.root_cause && <div className="mt-0.5 text-xs text-zinc-500">{row.root_cause}</div>}
        </div>
      ),
    },
    { key: "severity", label: "Severity", className: "w-24", render: (row) => <SeverityBadge value={row.severity} /> },
    {
      key: "impact", label: "Est. Impact", className: "w-44",
      render: (row) => row.impact ? <ImpactBadge min={row.impact.monthly_range.min} max={row.impact.monthly_range.max} /> : <span className="text-xs text-zinc-500">—</span>,
    },
    { key: "confidence", label: "Conf", className: "w-16", render: (row) => <span className="font-mono text-xs text-zinc-400">{row.confidence}%</span> },
    { key: "cross_pack", label: "Scope", className: "w-24", render: (row) => <span className={`text-xs ${row.cross_pack ? "text-emerald-400" : "text-zinc-500"}`}>{row.cross_pack ? "cross-pack" : "single"}</span> },
  ];

  return (
    <>
      <div className="mb-6"><SummaryCards cards={cards} /></div>
      <DataTable columns={columns} data={actions} onRowClick={(row) => setSelected(row)} getRowKey={(row) => row.id} />
      <SideDrawer open={selected !== null} onClose={() => setSelected(null)} title={selected?.title || ""}>
        {selected && <ActionDrawerContent action={selected} />}
      </SideDrawer>
    </>
  );
}

function ActionDrawerContent({ action }: { action: ActionProjection }) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">What This Fixes</h3>
        <p className="text-sm text-zinc-300">{action.description}</p>
        <div className="mt-2 flex items-center gap-2">
          <SeverityBadge value={action.severity} />
          <span className="text-xs text-zinc-500">Confidence {action.confidence}%</span>
          <span className="text-xs text-zinc-500">{action.action_type.replace(/_/g, " ")}</span>
        </div>
      </section>
      {action.impact && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Impact Unlocked</h3>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Monthly Range</span>
              <ImpactBadge min={action.impact.monthly_range.min} max={action.impact.monthly_range.max} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">Midpoint</span>
              <ImpactBadge min={action.impact.midpoint} max={action.impact.midpoint} compact />
            </div>
          </div>
        </section>
      )}
      {action.root_cause && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Root Cause</h3>
          <div className="rounded-md border border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <span className="text-sm font-medium text-zinc-200">{action.root_cause}</span>
          </div>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Scope</h3>
        <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${action.cross_pack ? "border-emerald-800/50 text-emerald-400" : "border-zinc-800 text-zinc-400"}`}>
          {action.cross_pack ? "Affects multiple packs" : "Single pack"}
        </span>
      </section>
      <section>
        <button className="w-full rounded-md border border-emerald-800/50 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400 transition-colors hover:bg-emerald-500/20">
          Request Verification
        </button>
      </section>
    </div>
  );
}
