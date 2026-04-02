import { BuiltGraph } from './builder';
import {
  GraphNode,
  GraphEdge,
  PathResult,
  CommercialPathResult,
  TrustBoundaryResult,
  TrustGap,
} from './types';

// ──────────────────────────────────────────────
// Graph Query — answers structural questions
// ──────────────────────────────────────────────

const MAX_DEPTH = 10;

export class GraphQuery {
  constructor(private graph: BuiltGraph) {}

  // 1. Commercial path query
  findCommercialPaths(fromUrl: string): CommercialPathResult {
    const startNodeId = this.graph.nodesByUrl.get(fromUrl);
    if (!startNodeId) {
      return {
        path: { nodes: [], edges: [], depth: 0 },
        has_external_handoff: false,
        external_hosts: [],
        provider_nodes: [],
        policy_nodes: [],
      };
    }

    const path = this.bfs(startNodeId, (node) => {
      return (
        node.node_type === 'endpoint' ||
        node.node_type === 'provider' ||
        (node.metadata as any)?.has_payment_fields === true
      );
    });

    const externalHosts = new Set<string>();
    const providerNodes: GraphNode[] = [];
    const policyNodes: GraphNode[] = [];
    let hasExternalHandoff = false;

    for (const node of path.nodes) {
      if (node.is_external && node.host) {
        hasExternalHandoff = true;
        externalHosts.add(node.host);
      }
      if (node.node_type === 'provider') providerNodes.push(node);
      if (node.node_type === 'policy_document') policyNodes.push(node);
    }

    return {
      path,
      has_external_handoff: hasExternalHandoff,
      external_hosts: Array.from(externalHosts),
      provider_nodes: providerNodes,
      policy_nodes: policyNodes,
    };
  }

  // 2. Checkout posture query
  findCheckoutNodes(): GraphNode[] {
    return Array.from(this.graph.nodes.values()).filter(
      (n) =>
        n.node_type === 'endpoint' &&
        (n.metadata as any)?.has_payment_fields === true,
    );
  }

  // 3. Trust boundary query
  findTrustBoundaries(): TrustBoundaryResult {
    const boundaryEdges: GraphEdge[] = [];
    const externalHosts = new Set<string>();
    const trustGaps: TrustGap[] = [];

    for (const edge of this.graph.edges) {
      const source = this.graph.nodes.get(edge.source_id);
      const target = this.graph.nodes.get(edge.target_id);
      if (!source || !target) continue;

      // Trust boundary: internal node -> external node
      if (!source.is_external && target.is_external) {
        boundaryEdges.push(edge);
        if (target.host) externalHosts.add(target.host);

        // Determine gap type
        const isKnownProvider = target.node_type === 'provider' ||
          (target.metadata as any)?.known_provider != null;

        const gapType = isKnownProvider ? 'off_domain' as const : 'unknown_provider' as const;
        const severity = isKnownProvider ? 'medium' as const : 'high' as const;

        trustGaps.push({
          source_node: source,
          target_node: target,
          edge,
          gap_type: gapType,
          severity,
        });
      }
    }

    return {
      boundary_edges: boundaryEdges,
      external_hosts: Array.from(externalHosts),
      trust_gaps: trustGaps,
    };
  }

  // 4. Critical route coverage query
  findCriticalRoutes(): GraphNode[] {
    return Array.from(this.graph.nodes.values()).filter(
      (n) => n.node_type === 'page' && !n.is_external,
    );
  }

  // 5. Provider nodes
  findProviders(): GraphNode[] {
    return Array.from(this.graph.nodes.values()).filter(
      (n) => n.node_type === 'provider',
    );
  }

  // 6. Policy nodes
  findPolicies(): GraphNode[] {
    return Array.from(this.graph.nodes.values()).filter(
      (n) => n.node_type === 'policy_document',
    );
  }

  // 7. External assets
  findExternalAssets(): GraphNode[] {
    return Array.from(this.graph.nodes.values()).filter(
      (n) => n.is_external && (n.node_type === 'asset' || n.node_type === 'endpoint'),
    );
  }

  // 8. Redirect chains
  findRedirectChains(): GraphEdge[] {
    return this.graph.edges.filter((e) => e.edge_type === 'redirect');
  }

  // 9. Get node by URL
  getNodeByUrl(url: string): GraphNode | undefined {
    const id = this.graph.nodesByUrl.get(url);
    return id ? this.graph.nodes.get(id) : undefined;
  }

  // 10. Get all edges from a node (uses edge index for O(1) lookup)
  getEdgesFrom(nodeId: string): GraphEdge[] {
    return this.graph.edgeIndex?.get(nodeId) || [];
  }

  // 11. Get all edges to a node
  getEdgesTo(nodeId: string): GraphEdge[] {
    return this.graph.edges.filter((e) => e.target_id === nodeId);
  }

  // BFS traversal
  private bfs(
    startId: string,
    isTarget: (node: GraphNode) => boolean,
  ): PathResult {
    const visited = new Set<string>();
    const queue: { nodeId: string; depth: number; path: string[] }[] = [
      { nodeId: startId, depth: 0, path: [startId] },
    ];
    const resultNodes: GraphNode[] = [];
    const resultEdges: GraphEdge[] = [];
    let maxDepth = 0;

    visited.add(startId);
    const startNode = this.graph.nodes.get(startId);
    if (startNode) resultNodes.push(startNode);

    while (queue.length > 0) {
      const { nodeId, depth, path } = queue.shift()!;
      if (depth >= MAX_DEPTH) continue;

      const outEdges = this.getEdgesFrom(nodeId);
      for (const edge of outEdges) {
        if (visited.has(edge.target_id)) continue;
        visited.add(edge.target_id);

        const targetNode = this.graph.nodes.get(edge.target_id);
        if (!targetNode) continue;

        resultNodes.push(targetNode);
        resultEdges.push(edge);
        maxDepth = Math.max(maxDepth, depth + 1);

        if (!isTarget(targetNode)) {
          queue.push({
            nodeId: edge.target_id,
            depth: depth + 1,
            path: [...path, edge.target_id],
          });
        }
      }
    }

    return { nodes: resultNodes, edges: resultEdges, depth: maxDepth };
  }

  // Summary stats
  stats(): {
    total_nodes: number;
    total_edges: number;
    page_count: number;
    host_count: number;
    external_host_count: number;
    provider_count: number;
    policy_count: number;
    redirect_count: number;
  } {
    const nodes = Array.from(this.graph.nodes.values());
    return {
      total_nodes: nodes.length,
      total_edges: this.graph.edges.length,
      page_count: nodes.filter((n) => n.node_type === 'page').length,
      host_count: nodes.filter((n) => n.node_type === 'host').length,
      external_host_count: nodes.filter((n) => n.node_type === 'host' && n.is_external).length,
      provider_count: nodes.filter((n) => n.node_type === 'provider').length,
      policy_count: nodes.filter((n) => n.node_type === 'policy_document').length,
      redirect_count: this.graph.edges.filter((e) => e.edge_type === 'redirect').length,
    };
  }
}
