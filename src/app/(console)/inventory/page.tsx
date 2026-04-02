"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import DataTable, { Column } from "@/components/console/DataTable";
import SummaryCards, { SummaryCard } from "@/components/console/SummaryCards";
import ConsoleState from "@/components/console/ConsoleState";
import { loadInventory, type InventorySurface, type DataState } from "@/lib/console-data";

// ──────────────────────────────────────────────
// Inventory Page — Surface-Level Intelligence
//
// Displays normalized surfaces (not raw URLs).
// Each row = a logical page/route/step.
// Shows: live status, page type, sessions, findings.
//
// Clicking findings count → navigates to Findings
// with surface filter applied.
// ──────────────────────────────────────────────

type LiveFilter = "all" | "live" | "not_live";
type TypeFilter = "all" | "commercial" | "support" | "policy" | "other";

export default function InventoryPage() {
  const router = useRouter();
  const [liveFilter, setLiveFilter] = useState<LiveFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [dataState, setDataState] = useState<DataState<InventorySurface[]>>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    loadInventory().then((result) => {
      if (!cancelled) setDataState(result);
    });
    return () => { cancelled = true; };
  }, []);

  const surfaces = dataState.status === "ready" ? dataState.data : [];

  const filtered = useMemo(() => {
    return surfaces.filter((s) => {
      if (liveFilter === "live" && !s.is_live) return false;
      if (liveFilter === "not_live" && s.is_live) return false;
      if (typeFilter === "commercial" && !s.is_commercial) return false;
      if (typeFilter === "support" && s.page_type !== "support") return false;
      if (typeFilter === "policy" && s.page_type !== "policy") return false;
      if (typeFilter === "other" && s.is_commercial) return false;
      return true;
    });
  }, [surfaces, liveFilter, typeFilter]);

  const summaryCards: SummaryCard[] = [
    { label: "Total Surfaces", value: surfaces.length },
    { label: "Live", value: surfaces.filter((s) => s.is_live).length, variant: "success" },
    { label: "Commercial", value: surfaces.filter((s) => s.is_commercial).length, variant: "info" },
    { label: "With Findings", value: surfaces.filter((s) => s.finding_count > 0).length, variant: "warning" },
  ];

  const columns: Column<InventorySurface>[] = [
    {
      key: "label",
      label: "Surface",
      render: (row: InventorySurface) => (
        <div>
          <div className="text-sm text-zinc-200">{row.label}</div>
          <div className="text-xs text-zinc-500 font-mono">{row.host}{row.normalized_path}</div>
        </div>
      ),
    },
    {
      key: "page_type",
      label: "Type",
      render: (row: InventorySurface) => (
        <span className={`text-xs px-2 py-0.5 rounded ${row.is_commercial ? "bg-blue-900/30 text-blue-400" : "bg-zinc-800 text-zinc-400"}`}>
          {row.page_type}
        </span>
      ),
    },
    {
      key: "is_live",
      label: "Status",
      render: (row: InventorySurface) => (
        <span className={`inline-flex items-center gap-1 text-xs ${row.is_live ? "text-green-400" : "text-zinc-500"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${row.is_live ? "bg-green-400" : "bg-zinc-600"}`} />
          {row.is_live ? "Live" : "Not seen"}
        </span>
      ),
    },
    {
      key: "session_count",
      label: "Sessions",
      render: (row: InventorySurface) => (
        <span className="text-xs text-zinc-400 font-mono">{row.session_count.toLocaleString()}</span>
      ),
    },
    {
      key: "finding_count",
      label: "Findings",
      render: (row: InventorySurface) => (
        <button
          onClick={() => {
            if (row.finding_count > 0) {
              router.push(`/analysis?surface=${encodeURIComponent(row.normalized_path)}`);
            }
          }}
          className={`text-xs font-mono ${row.finding_count > 0 ? "text-amber-400 hover:text-amber-300 cursor-pointer underline" : "text-zinc-600"}`}
          disabled={row.finding_count === 0}
        >
          {row.finding_count}
        </button>
      ),
    },
    {
      key: "discovery_sources",
      label: "Sources",
      render: (row: InventorySurface) => (
        <div className="flex gap-1">
          {row.discovery_sources.map((src) => (
            <span key={src} className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">
              {src.replace('_', ' ')}
            </span>
          ))}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Inventory</h1>
        <p className="text-sm text-zinc-500 mt-1">Normalized surfaces across your commercial environment</p>
      </div>

      <ConsoleState
        state={dataState}
        loadingLabel="Loading inventory..."
        emptyLabel="No surfaces discovered yet. Install the Vestigio snippet to start collecting behavioral data and surface inventory."
      >
        {() => (
          <>
            <SummaryCards cards={summaryCards} />

            <div className="flex items-center gap-3">
              <select
                value={liveFilter}
                onChange={(e) => setLiveFilter(e.target.value as LiveFilter)}
                className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-300"
              >
                <option value="all">All Status</option>
                <option value="live">Live</option>
                <option value="not_live">Not Seen</option>
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
                className="bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-300"
              >
                <option value="all">All Types</option>
                <option value="commercial">Commercial</option>
                <option value="support">Support</option>
                <option value="policy">Policy</option>
                <option value="other">Other</option>
              </select>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 text-zinc-500">
                <p className="text-lg">No surfaces match the current filters</p>
                <p className="text-sm mt-2">Try adjusting the status or type filters above.</p>
              </div>
            ) : (
              <DataTable columns={columns} data={filtered} />
            )}
          </>
        )}
      </ConsoleState>
    </div>
  );
}
