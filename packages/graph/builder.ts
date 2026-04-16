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
import type { IntegrationSnapshot, MetaAdsSnapshotData, GoogleAdsSnapshotData } from '../integrations/types';

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
  integrationSnapshots?: IntegrationSnapshot[],
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

  // Paid acquisition nodes — ads become first-class graph citizens.
  // Created AFTER evidence so destination URLs resolve to existing
  // page nodes when the page was crawled. Unknown destinations get
  // their own page node (external or on-domain) — this is intentional
  // because it surfaces "creative targets a page we never found in
  // the crawl" as a distinct graph pattern.
  if (integrationSnapshots) {
    processAdsIntegrations(graph, integrationSnapshots, rootDomain, cycle_ref, nodeIds, edgeIds);
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

// ──────────────────────────────────────────────
// Paid Acquisition Graph — ads as first-class nodes
//
// Each Meta creative and Google campaign becomes a graph node. An
// `ad_targets` edge connects the ad node to the destination page
// node (resolved via nodesByUrl or created fresh). Metadata on the
// ad node carries: platform, spend, headline, body, cta, status.
//
// This foundation enables:
//   - Maps: visualize spend flowing into site topology
//   - MCP: "this page receives $X from 3 Meta creatives"
//   - Compound findings: "creative targets page with trust gap"
//   - Workspaces: "Paid Acquisition Health" grouping
//   - Copy Pack (future): LLM creative→page alignment scoring
// ──────────────────────────────────────────────

function processAdsIntegrations(
  graph: BuiltGraph,
  snapshots: IntegrationSnapshot[],
  rootDomain: string,
  cycle_ref: string,
  nodeIds: IdGenerator,
  edgeIds: IdGenerator,
): void {
  for (const snap of snapshots) {
    if (snap.provider === 'meta_ads') {
      processMetaAdsSnapshot(graph, snap.data as MetaAdsSnapshotData, rootDomain, cycle_ref, nodeIds, edgeIds);
    } else if (snap.provider === 'google_ads') {
      processGoogleAdsSnapshot(graph, snap.data as GoogleAdsSnapshotData, rootDomain, cycle_ref, nodeIds, edgeIds);
    }
  }
}

function processMetaAdsSnapshot(
  graph: BuiltGraph,
  data: MetaAdsSnapshotData,
  rootDomain: string,
  cycle_ref: string,
  nodeIds: IdGenerator,
  edgeIds: IdGenerator,
): void {
  for (const creative of data.creatives) {
    if (!creative.destination_url) continue;
    const key = `ad_creative:meta_ads:${creative.id}`;
    const existing = graph.nodesByKey.get(key);
    if (existing) continue;

    const adNode: GraphNode = {
      id: nodeIds.next(),
      node_type: 'ad_creative',
      label: creative.headline || `Meta Ad ${creative.id}`,
      url: creative.destination_url,
      host: null,
      is_external: true,
      metadata: {
        platform: 'meta_ads',
        creative_id: creative.id,
        headline: creative.headline,
        body: creative.body,
        cta: creative.cta,
        status: creative.status,
        spend_30d: creative.spend_30d,
        currency: data.currency,
      },
      evidence_refs: [],
    };

    graph.nodes.set(adNode.id, adNode);
    graph.nodesByKey.set(key, adNode.id);

    const destUrl = normaliseUrl(creative.destination_url);
    if (destUrl) {
      const pageNode = getOrCreatePageNode(graph, destUrl, rootDomain, '', nodeIds);
      addEdge(graph, 'ad_targets', adNode.id, pageNode.id, 95, cycle_ref, null, edgeIds, {
        spend_30d: creative.spend_30d,
        platform: 'meta_ads',
      });
    }
  }
}

function processGoogleAdsSnapshot(
  graph: BuiltGraph,
  data: GoogleAdsSnapshotData,
  rootDomain: string,
  cycle_ref: string,
  nodeIds: IdGenerator,
  edgeIds: IdGenerator,
): void {
  for (const campaign of data.campaigns) {
    if (!campaign.final_url) continue;
    const key = `ad_campaign:google_ads:${campaign.id}`;
    const existing = graph.nodesByKey.get(key);
    if (existing) continue;

    const adNode: GraphNode = {
      id: nodeIds.next(),
      node_type: 'ad_campaign',
      label: campaign.name || `Google Campaign ${campaign.id}`,
      url: campaign.final_url,
      host: null,
      is_external: true,
      metadata: {
        platform: 'google_ads',
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        headlines: campaign.headlines,
        descriptions: campaign.descriptions,
        spend_30d: campaign.spend_30d,
        currency: data.currency,
      },
      evidence_refs: [],
    };

    graph.nodes.set(adNode.id, adNode);
    graph.nodesByKey.set(key, adNode.id);

    const destUrl = normaliseUrl(campaign.final_url);
    if (destUrl) {
      const pageNode = getOrCreatePageNode(graph, destUrl, rootDomain, '', nodeIds);
      addEdge(graph, 'ad_targets', adNode.id, pageNode.id, 95, cycle_ref, null, edgeIds, {
        spend_30d: campaign.spend_30d,
        platform: 'google_ads',
      });
    }
  }
}

function normaliseUrl(raw: string): string | null {
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return u.href;
  } catch {
    return null;
  }
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
