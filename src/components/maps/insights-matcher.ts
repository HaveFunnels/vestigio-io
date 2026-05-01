// ──────────────────────────────────────────────
// AI Insights Layer — joins findings + actions to journey nodes
//
// The matching is deterministic: finding.surface is a semantic path
// descriptor (e.g., "/checkout", "/cart -> /checkout", "/ (sitewide)")
// that maps to journey node metadata.path. No LLM involved — pure
// data join. Results are grouped by root cause so the user sees
// "why this step is broken" not just "what signals we found."
// ──────────────────────────────────────────────

import type { MapNode } from "../../../packages/maps";
import type {
  FindingProjection,
  ActionProjection,
} from "../../../packages/projections";

export interface NodeInsight {
  finding: FindingProjection;
  actions: ActionProjection[];
}

export interface NodeInsights {
  items: NodeInsight[];
  highestSeverity: string;
  totalImpact: number;
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function matchInsightsToNodes(
  nodes: MapNode[],
  findings: FindingProjection[],
  actions: ActionProjection[],
): Map<string, NodeInsights> {
  // Build path -> nodeId index from journey commercial nodes
  const nodeIdsByPath = new Map<string, string[]>();
  for (const n of nodes) {
    if (n.type !== "journey_commercial") continue;
    const path = (n.metadata.path as string) || "";
    if (!path) continue;
    const normalized = path.replace(/\/$/, "") || "/";
    const arr = nodeIdsByPath.get(normalized) ?? [];
    arr.push(n.id);
    nodeIdsByPath.set(normalized, arr);
  }
  if (nodeIdsByPath.size === 0) return new Map();

  // Build action lookup by root_cause title for O(1) join
  const actionsByRootCause = new Map<string, ActionProjection[]>();
  for (const a of actions) {
    if (!a.root_cause) continue;
    const arr = actionsByRootCause.get(a.root_cause) ?? [];
    arr.push(a);
    actionsByRootCause.set(a.root_cause, arr);
  }

  // Match each finding to journey nodes via surface path
  const result = new Map<string, NodeInsight[]>();

  for (const f of findings) {
    if (f.polarity === "positive") continue;
    const surfacePaths = parseSurfacePaths(f.surface);
    const matchedActions = f.root_cause
      ? (actionsByRootCause.get(f.root_cause) ?? [])
      : [];

    for (const sp of surfacePaths) {
      if (sp === "sitewide") {
        for (const nodeIds of nodeIdsByPath.values()) {
          for (const nid of nodeIds) {
            pushInsight(result, nid, { finding: f, actions: matchedActions });
          }
        }
      } else {
        const nodeIds = nodeIdsByPath.get(sp);
        if (nodeIds) {
          for (const nid of nodeIds) {
            pushInsight(result, nid, { finding: f, actions: matchedActions });
          }
        }
      }
    }
  }

  // Aggregate per-node
  const aggregated = new Map<string, NodeInsights>();
  for (const [nodeId, items] of result) {
    // Deduplicate by finding.id
    const seen = new Set<string>();
    const unique = items.filter((it) => {
      if (seen.has(it.finding.id)) return false;
      seen.add(it.finding.id);
      return true;
    });
    // Sort by severity then impact
    unique.sort((a, b) => {
      const sa = SEVERITY_RANK[a.finding.severity] ?? 4;
      const sb = SEVERITY_RANK[b.finding.severity] ?? 4;
      if (sa !== sb) return sa - sb;
      return b.finding.impact.midpoint - a.finding.impact.midpoint;
    });
    const highest = unique[0]?.finding.severity ?? "low";
    const totalImpact = unique.reduce(
      (sum, it) => sum + it.finding.impact.midpoint,
      0,
    );
    aggregated.set(nodeId, {
      items: unique,
      highestSeverity: highest,
      totalImpact,
    });
  }
  return aggregated;
}

function pushInsight(
  map: Map<string, NodeInsight[]>,
  nodeId: string,
  insight: NodeInsight,
): void {
  const arr = map.get(nodeId) ?? [];
  arr.push(insight);
  map.set(nodeId, arr);
}

function parseSurfacePaths(surface: string): string[] {
  if (!surface) return [];
  const trimmed = surface.trim();
  // "/ (sitewide)" or "sitewide"
  if (trimmed.includes("sitewide")) return ["sitewide"];
  // "/cart -> /checkout" -> ["/cart", "/checkout"]
  if (trimmed.includes("\u2192")) {
    return trimmed
      .split("\u2192")
      .map((s) => s.trim().replace(/\/$/, "") || "/")
      .filter(Boolean);
  }
  // Single path: "/checkout"
  return [trimmed.replace(/\/$/, "") || "/"];
}
