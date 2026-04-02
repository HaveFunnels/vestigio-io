import { Freshness, Ref } from '../domain';

// ──────────────────────────────────────────────
// Evidence Graph — Node and Edge types
// ──────────────────────────────────────────────

export type GraphNodeType =
  | 'workspace'
  | 'environment'
  | 'website'
  | 'page'
  | 'host'
  | 'endpoint'
  | 'provider'
  | 'policy_document'
  | 'asset'
  | 'critical_route';

export type GraphEdgeType =
  // Structural
  | 'anchor'
  | 'form_action'
  | 'iframe_src'
  | 'script_src'
  | 'stylesheet_src'
  | 'redirect'
  | 'canonical_external'
  | 'intent_target'
  // Context
  | 'belongs_to_environment'
  | 'belongs_to_website'
  | 'in_path_scope'
  | 'uses_provider'
  | 'references_policy'
  | 'affects_critical_route';

export interface GraphNode {
  id: string;
  node_type: GraphNodeType;
  label: string;
  url: string | null;
  host: string | null;
  is_external: boolean;
  metadata: Record<string, unknown>;
  evidence_refs: Ref[];
}

export interface GraphEdge {
  id: string;
  edge_type: GraphEdgeType;
  source_id: string;
  target_id: string;
  confidence: number;
  cycle_ref: string;
  freshness: Freshness;
  evidence_ref: Ref | null;
  metadata: Record<string, unknown>;
}

export interface PathResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  depth: number;
}

export interface CommercialPathResult {
  path: PathResult;
  has_external_handoff: boolean;
  external_hosts: string[];
  provider_nodes: GraphNode[];
  policy_nodes: GraphNode[];
}

export interface TrustBoundaryResult {
  boundary_edges: GraphEdge[];
  external_hosts: string[];
  trust_gaps: TrustGap[];
}

export interface TrustGap {
  source_node: GraphNode;
  target_node: GraphNode;
  edge: GraphEdge;
  gap_type: 'off_domain' | 'unknown_provider' | 'no_policy_coverage';
  severity: 'low' | 'medium' | 'high';
}
