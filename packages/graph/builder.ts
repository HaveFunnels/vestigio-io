import { URL } from 'url';
import {
  Evidence,
  EvidenceType,
  FreshnessState,
  Freshness,
  makeRef,
  IdGenerator,
  PageContentPayload,
  RedirectPayload,
  ScriptPayload,
  FormPayload,
  IframePayload,
  CheckoutIndicatorPayload,
  ProviderIndicatorPayload,
  PolicyPagePayload,
} from '../domain';
import { GraphNode, GraphEdge, GraphEdgeType } from './types';

// ──────────────────────────────────────────────
// Graph Builder — constructs graph from evidence
// Deterministic: no global state, scoped ID generators
// ──────────────────────────────────────────────

export interface BuiltGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  nodesByUrl: Map<string, string>;  // url -> node id
  nodesByHost: Map<string, string>; // host -> node id
  nodesByKey: Map<string, string>;  // "provider:<name>" or "asset:<url>" -> node id
  edgeIndex: Map<string, GraphEdge[]>; // source_id -> edges (for fast lookup)
}

export function buildGraph(
  evidenceItems: Evidence[],
  rootDomain: string,
  cycle_ref: string,
): BuiltGraph {
  const nodeIds = new IdGenerator('gn');
  const edgeIds = new IdGenerator('ge');

  const graph: BuiltGraph = {
    nodes: new Map(),
    edges: [],
    nodesByUrl: new Map(),
    nodesByHost: new Map(),
    nodesByKey: new Map(),
    edgeIndex: new Map(),
  };

  for (const e of evidenceItems) {
    switch (e.evidence_type) {
      case EvidenceType.PageContent:
        processPageContent(graph, e, rootDomain, cycle_ref, nodeIds, edgeIds);
        break;
      case EvidenceType.Redirect:
        processRedirect(graph, e, rootDomain, cycle_ref, nodeIds, edgeIds);
        break;
      case EvidenceType.Script:
        processScript(graph, e, rootDomain, cycle_ref, nodeIds, edgeIds);
        break;
      case EvidenceType.Form:
        processForm(graph, e, rootDomain, cycle_ref, nodeIds, edgeIds);
        break;
      case EvidenceType.Iframe:
        processIframe(graph, e, rootDomain, cycle_ref, nodeIds, edgeIds);
        break;
      case EvidenceType.CheckoutIndicator:
        processCheckoutIndicator(graph, e, rootDomain, cycle_ref, nodeIds, edgeIds);
        break;
      case EvidenceType.ProviderIndicator:
        processProviderIndicator(graph, e, rootDomain, cycle_ref, nodeIds, edgeIds);
        break;
      case EvidenceType.PolicyPage:
        processPolicyPage(graph, e, rootDomain, cycle_ref, nodeIds, edgeIds);
        break;
    }
  }

  return graph;
}

function getOrCreatePageNode(
  graph: BuiltGraph,
  url: string,
  rootDomain: string,
  evidenceRef: string,
  nodeIds: IdGenerator,
): GraphNode {
  const existing = graph.nodesByUrl.get(url);
  if (existing) {
    const node = graph.nodes.get(existing)!;
    if (!node.evidence_refs.includes(evidenceRef)) {
      node.evidence_refs.push(evidenceRef);
    }
    return node;
  }

  const host = safeHostname(url);
  const node: GraphNode = {
    id: nodeIds.next(),
    node_type: 'page',
    label: safePath(url),
    url,
    host,
    is_external: !isSameDomain(host, rootDomain),
    metadata: {},
    evidence_refs: [evidenceRef],
  };

  graph.nodes.set(node.id, node);
  graph.nodesByUrl.set(url, node.id);

  getOrCreateHostNode(graph, host, rootDomain, evidenceRef, nodeIds);
  return node;
}

function getOrCreateHostNode(
  graph: BuiltGraph,
  host: string,
  rootDomain: string,
  evidenceRef: string,
  nodeIds: IdGenerator,
): GraphNode {
  const existing = graph.nodesByHost.get(host);
  if (existing) {
    const node = graph.nodes.get(existing)!;
    if (!node.evidence_refs.includes(evidenceRef)) {
      node.evidence_refs.push(evidenceRef);
    }
    return node;
  }

  const node: GraphNode = {
    id: nodeIds.next(),
    node_type: 'host',
    label: host,
    url: null,
    host,
    is_external: !isSameDomain(host, rootDomain),
    metadata: {},
    evidence_refs: [evidenceRef],
  };

  graph.nodes.set(node.id, node);
  graph.nodesByHost.set(host, node.id);
  return node;
}

function getOrCreateProviderNode(
  graph: BuiltGraph,
  providerName: string,
  evidenceRef: string,
  nodeIds: IdGenerator,
): GraphNode {
  const key = `provider:${providerName}`;
  const existing = graph.nodesByKey.get(key);
  if (existing) {
    const node = graph.nodes.get(existing)!;
    if (!node.evidence_refs.includes(evidenceRef)) {
      node.evidence_refs.push(evidenceRef);
    }
    return node;
  }

  const node: GraphNode = {
    id: nodeIds.next(),
    node_type: 'provider',
    label: providerName,
    url: null,
    host: null,
    is_external: true,
    metadata: { provider_name: providerName },
    evidence_refs: [evidenceRef],
  };

  graph.nodes.set(node.id, node);
  graph.nodesByKey.set(key, node.id);
  return node;
}

// Deduplicates asset nodes (scripts, iframes) by URL
function getOrCreateAssetNode(
  graph: BuiltGraph,
  assetUrl: string,
  host: string,
  isExternal: boolean,
  rootDomain: string,
  evidenceRef: string,
  metadata: Record<string, unknown>,
  nodeIds: IdGenerator,
): GraphNode {
  const key = `asset:${assetUrl}`;
  const existing = graph.nodesByKey.get(key);
  if (existing) {
    const node = graph.nodes.get(existing)!;
    if (!node.evidence_refs.includes(evidenceRef)) {
      node.evidence_refs.push(evidenceRef);
    }
    return node;
  }

  const node: GraphNode = {
    id: nodeIds.next(),
    node_type: 'asset',
    label: assetUrl,
    url: assetUrl,
    host,
    is_external: isExternal,
    metadata,
    evidence_refs: [evidenceRef],
  };

  graph.nodes.set(node.id, node);
  graph.nodesByKey.set(key, node.id);
  return node;
}

// Deduplicates policy nodes by URL
function getOrCreatePolicyNode(
  graph: BuiltGraph,
  policyUrl: string,
  policyType: string,
  rootDomain: string,
  evidenceRef: string,
  nodeIds: IdGenerator,
): GraphNode {
  const key = `policy:${policyUrl}`;
  const existing = graph.nodesByKey.get(key);
  if (existing) {
    const node = graph.nodes.get(existing)!;
    if (!node.evidence_refs.includes(evidenceRef)) {
      node.evidence_refs.push(evidenceRef);
    }
    return node;
  }

  const node: GraphNode = {
    id: nodeIds.next(),
    node_type: 'policy_document',
    label: `${policyType} policy`,
    url: policyUrl,
    host: safeHostname(policyUrl),
    is_external: false,
    metadata: { policy_type: policyType, detected: true },
    evidence_refs: [evidenceRef],
  };

  graph.nodes.set(node.id, node);
  graph.nodesByKey.set(key, node.id);
  return node;
}

function addEdge(
  graph: BuiltGraph,
  edgeType: GraphEdgeType,
  sourceId: string,
  targetId: string,
  confidence: number,
  cycle_ref: string,
  evidenceRef: string | null,
  edgeIds: IdGenerator,
  metadata: Record<string, unknown> = {},
): void {
  const edge: GraphEdge = {
    id: edgeIds.next(),
    edge_type: edgeType,
    source_id: sourceId,
    target_id: targetId,
    confidence,
    cycle_ref,
    freshness: {
      observed_at: new Date(),
      fresh_until: new Date(Date.now() + 24 * 60 * 60 * 1000),
      freshness_state: FreshnessState.Fresh,
      staleness_reason: null,
    },
    evidence_ref: evidenceRef,
    metadata,
  };
  graph.edges.push(edge);

  // Maintain edge index for fast lookup
  const existing = graph.edgeIndex.get(sourceId);
  if (existing) {
    existing.push(edge);
  } else {
    graph.edgeIndex.set(sourceId, [edge]);
  }
}

function processPageContent(
  graph: BuiltGraph, evidence: Evidence, rootDomain: string,
  cycle_ref: string, nodeIds: IdGenerator, edgeIds: IdGenerator,
): void {
  const payload = evidence.payload as PageContentPayload;
  getOrCreatePageNode(graph, payload.url, rootDomain, makeRef('evidence', evidence.id), nodeIds);
}

function processRedirect(
  graph: BuiltGraph, evidence: Evidence, rootDomain: string,
  cycle_ref: string, nodeIds: IdGenerator, edgeIds: IdGenerator,
): void {
  const payload = evidence.payload as RedirectPayload;
  const ref = makeRef('evidence', evidence.id);
  const sourceNode = getOrCreatePageNode(graph, payload.source_url, rootDomain, ref, nodeIds);
  const targetNode = getOrCreatePageNode(graph, payload.target_url, rootDomain, ref, nodeIds);

  addEdge(graph, 'redirect', sourceNode.id, targetNode.id, 90, cycle_ref, ref, edgeIds, {
    hop_count: payload.hop_count,
    status_code: payload.status_code,
  });
}

function processScript(
  graph: BuiltGraph, evidence: Evidence, rootDomain: string,
  cycle_ref: string, nodeIds: IdGenerator, edgeIds: IdGenerator,
): void {
  const payload = evidence.payload as ScriptPayload;
  const ref = makeRef('evidence', evidence.id);
  const pageNode = getOrCreatePageNode(graph, payload.page_url, rootDomain, ref, nodeIds);
  const assetNode = getOrCreateAssetNode(
    graph, payload.src, payload.host, payload.is_external, rootDomain, ref,
    { known_provider: payload.known_provider }, nodeIds,
  );

  addEdge(graph, 'script_src', pageNode.id, assetNode.id, 95, cycle_ref, ref, edgeIds);
}

function processForm(
  graph: BuiltGraph, evidence: Evidence, rootDomain: string,
  cycle_ref: string, nodeIds: IdGenerator, edgeIds: IdGenerator,
): void {
  const payload = evidence.payload as FormPayload;
  const ref = makeRef('evidence', evidence.id);
  const pageNode = getOrCreatePageNode(graph, payload.page_url, rootDomain, ref, nodeIds);

  // Endpoints are unique per action URL, deduplicate via nodesByUrl
  const endpointKey = `endpoint:${payload.action}`;
  let endpointNode: GraphNode;
  const existingId = graph.nodesByKey.get(endpointKey);
  if (existingId) {
    endpointNode = graph.nodes.get(existingId)!;
    if (!endpointNode.evidence_refs.includes(ref)) {
      endpointNode.evidence_refs.push(ref);
    }
  } else {
    endpointNode = {
      id: nodeIds.next(),
      node_type: 'endpoint',
      label: payload.action,
      url: payload.action,
      host: payload.target_host,
      is_external: payload.is_external,
      metadata: { method: payload.method, has_payment_fields: payload.has_payment_fields },
      evidence_refs: [ref],
    };
    graph.nodes.set(endpointNode.id, endpointNode);
    graph.nodesByKey.set(endpointKey, endpointNode.id);
  }

  addEdge(graph, 'form_action', pageNode.id, endpointNode.id, 90, cycle_ref, ref, edgeIds, {
    has_payment_fields: payload.has_payment_fields,
  });
}

function processIframe(
  graph: BuiltGraph, evidence: Evidence, rootDomain: string,
  cycle_ref: string, nodeIds: IdGenerator, edgeIds: IdGenerator,
): void {
  const payload = evidence.payload as IframePayload;
  const ref = makeRef('evidence', evidence.id);
  const pageNode = getOrCreatePageNode(graph, payload.page_url, rootDomain, ref, nodeIds);
  const assetNode = getOrCreateAssetNode(
    graph, payload.src, payload.host, payload.is_external, rootDomain, ref,
    { known_provider: payload.known_provider }, nodeIds,
  );

  addEdge(graph, 'iframe_src', pageNode.id, assetNode.id, 90, cycle_ref, ref, edgeIds);
}

function processCheckoutIndicator(
  graph: BuiltGraph, evidence: Evidence, rootDomain: string,
  cycle_ref: string, nodeIds: IdGenerator, edgeIds: IdGenerator,
): void {
  const payload = evidence.payload as CheckoutIndicatorPayload;
  const ref = makeRef('evidence', evidence.id);
  const pageNode = getOrCreatePageNode(graph, payload.page_url, rootDomain, ref, nodeIds);

  if (payload.target_url) {
    const targetNode = getOrCreatePageNode(graph, payload.target_url, rootDomain, ref, nodeIds);
    addEdge(graph, 'intent_target', pageNode.id, targetNode.id, payload.confidence, cycle_ref, ref, edgeIds, {
      checkout_mode: payload.checkout_mode,
      indicator_source: payload.indicator_source,
    });
  }
}

function processProviderIndicator(
  graph: BuiltGraph, evidence: Evidence, rootDomain: string,
  cycle_ref: string, nodeIds: IdGenerator, edgeIds: IdGenerator,
): void {
  const payload = evidence.payload as ProviderIndicatorPayload;
  const ref = makeRef('evidence', evidence.id);
  const pageNode = getOrCreatePageNode(graph, payload.page_url, rootDomain, ref, nodeIds);
  const providerNode = getOrCreateProviderNode(graph, payload.provider_name, ref, nodeIds);

  addEdge(graph, 'uses_provider', pageNode.id, providerNode.id, payload.confidence, cycle_ref, ref, edgeIds, {
    detection_source: payload.detection_source,
  });
}

function processPolicyPage(
  graph: BuiltGraph, evidence: Evidence, rootDomain: string,
  cycle_ref: string, nodeIds: IdGenerator, edgeIds: IdGenerator,
): void {
  const payload = evidence.payload as PolicyPagePayload;
  const ref = makeRef('evidence', evidence.id);
  getOrCreatePageNode(graph, payload.url, rootDomain, ref, nodeIds);
  const policyNode = getOrCreatePolicyNode(
    graph, payload.url, payload.policy_type, rootDomain, ref, nodeIds,
  );

  addEdge(graph, 'references_policy', policyNode.id, policyNode.id, payload.confidence, cycle_ref, ref, edgeIds);
}

function safeHostname(url: string): string {
  try { return new URL(url).hostname; } catch { return ''; }
}

function safePath(url: string): string {
  try { return new URL(url).pathname; } catch { return url; }
}

function isSameDomain(host: string, rootDomain: string): boolean {
  return host === rootDomain || host.endsWith('.' + rootDomain);
}
