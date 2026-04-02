// ──────────────────────────────────────────────
// Map Types — data models for causal visualization
//
// Pure data structures. No React dependencies.
// Layout positions are pre-computed for React Flow.
// ──────────────────────────────────────────────

export type MapNodeType =
  | 'root_cause'
  | 'finding'
  | 'action'
  | 'checkout'
  | 'support'
  | 'policy'
  | 'trust'
  | 'measurement';

export interface MapNode {
  id: string;
  type: MapNodeType;
  label: string;
  severity: string | null;
  impact: { min: number; max: number; midpoint: number } | null;
  pack: string | null;
  metadata: Record<string, unknown>;
  position: { x: number; y: number };
}

export type MapEdgeType = 'causal' | 'transition' | 'contributes_to' | 'addresses';

export interface MapEdge {
  id: string;
  source: string;
  target: string;
  type: MapEdgeType;
  label: string | null;
}

export type MapType = 'revenue_leakage' | 'chargeback_risk' | 'root_cause';

export interface MapDefinition {
  id: string;
  name: string;
  type: MapType;
  nodes: MapNode[];
  edges: MapEdge[];
}
