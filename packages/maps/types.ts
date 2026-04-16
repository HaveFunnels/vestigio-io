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
  | 'measurement'
  | 'journey_commercial'
  | 'journey_support'
  | 'journey_other_events'
  | 'journey_dropoff';

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

export type MapEdgeType =
  | 'causal'
  | 'transition'
  | 'contributes_to'
  | 'addresses'
  | 'redirect';

export interface MapEdge {
  id: string;
  source: string;
  target: string;
  type: MapEdgeType;
  label: string | null;
}

export type MapType =
  | 'revenue_leakage'
  | 'chargeback_risk'
  | 'root_cause'
  | 'user_journey';

// Legend entries are declared by the builder so the UI can render a
// legend that actually matches the nodes/edges on screen. Each entry
// references a translation key (resolved in the UI) plus a swatch
// token that maps to a pre-defined visual treatment. Keeping the
// visual treatment as a token (not a raw class string) keeps the
// engine package free of Tailwind / CSS assumptions.
export type LegendNodeSwatch =
  | 'root_cause'
  | 'finding'
  | 'action'
  | 'category'
  | 'journey_homepage'
  | 'journey_product'
  | 'journey_pricing'
  | 'journey_cart'
  | 'journey_checkout'
  | 'journey_confirmation'
  | 'journey_support'
  | 'journey_other_events'
  | 'journey_dropoff';

export type LegendEdgeSwatch =
  | 'causal'
  | 'transition'
  | 'contributes_to'
  | 'addresses'
  | 'redirect';

export interface MapLegendNodeEntry {
  labelKey: string;
  swatch: LegendNodeSwatch;
}

export interface MapLegendEdgeEntry {
  labelKey: string;
  swatch: LegendEdgeSwatch;
}

export interface MapLegend {
  nodes: MapLegendNodeEntry[];
  edges: MapLegendEdgeEntry[];
}

export interface MapDefinition {
  id: string;
  name: string;
  type: MapType;
  nodes: MapNode[];
  edges: MapEdge[];
  legend: MapLegend;
  /** Builder-scoped metadata (mode, applied filters, counts, etc.).
   *  The shape is intentionally open — consumers destructure on a
   *  best-effort basis. User Journey sets { mode, pageCount, … }. */
  metadata?: Record<string, unknown>;
}
