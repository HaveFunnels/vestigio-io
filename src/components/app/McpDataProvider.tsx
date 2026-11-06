"use client";

import { createContext, useContext } from "react";
import type { DataState, InventoryPayload } from "@/lib/console-data";
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
  /**
   * First-paint inventory snapshot. Optional because the layout only
   * preloads it for /app/inventory routes; other pages get `undefined`
   * and pay the /api/inventory fetch cost when (if) they need it.
   */
  inventory?: DataState<InventoryPayload>;
  /** ISO 4217 currency code for the current org (e.g. "BRL", "USD", "EUR") */
  currency: string;
  /**
   * The environment this snapshot describes.
   *
   * Carried so "use client" pages can KEY their own fetches on it.
   * Switching environments sets the active_env cookie and calls
   * router.refresh(), which re-renders server components and therefore
   * delivers a new snapshot here. A client page whose fetch effect has
   * `[]` as its dependency list never re-fires, so it kept rendering
   * the previous environment's data until the customer pressed reload,
   * which is the "switching havefunnels to casamontelle does nothing"
   * complaint. Putting the id in context gives every client page a
   * dependency that actually changes.
   */
  envId: string | null;
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
      // Outside the provider there is no active environment, and null
      // is the honest answer: a page keyed on it simply will not fetch.
      envId: null,
      inventory: undefined,
      currency: "USD",
    };
  }
  return ctx;
}

/**
 * The active environment id, or null outside the app shell.
 *
 * Use this in the dependency list of any effect that fetches
 * environment-scoped data:
 *
 *   const envId = useActiveEnvId();
 *   useEffect(() => { fetch(...) }, [envId]);
 */
export function useActiveEnvId(): string | null {
  return useContext(McpDataContext)?.envId ?? null;
}
