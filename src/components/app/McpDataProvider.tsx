"use client";

import { createContext, useContext } from "react";
import type { DataState } from "@/lib/console-data";
import type { FindingProjection, ActionProjection, WorkspaceProjection, ChangeReportProjection } from "../../../packages/projections";
import type { MapDefinition } from "../../../packages/maps";

// ──────────────────────────────────────────────
// MCP Data Context
//
// The app layout (server component) pre-loads MCP data
// and passes it here so "use client" pages can access it
// without calling the MCP server directly (which only
// works server-side).
// ──────────────────────────────────────────────

export interface McpDataSnapshot {
  findings: DataState<FindingProjection[]>;
  actions: DataState<ActionProjection[]>;
  changeReport: DataState<ChangeReportProjection>;
  workspaces: DataState<WorkspaceProjection[]>;
  maps: DataState<MapDefinition[]>;
}

const McpDataContext = createContext<McpDataSnapshot | null>(null);

export function McpDataProvider({
  data,
  children,
}: {
  data: McpDataSnapshot;
  children: React.ReactNode;
}) {
  return (
    <McpDataContext.Provider value={data}>{children}</McpDataContext.Provider>
  );
}

export function useMcpData(): McpDataSnapshot {
  const ctx = useContext(McpDataContext);
  if (!ctx) {
    // Fallback for pages rendered outside the provider (e.g. /console route)
    return {
      findings: { status: "not_ready", reason: "No data provider." },
      actions: { status: "not_ready", reason: "No data provider." },
      changeReport: { status: "not_ready", reason: "No data provider." },
      workspaces: { status: "not_ready", reason: "No data provider." },
      maps: { status: "not_ready", reason: "No data provider." },
    };
  }
  return ctx;
}
