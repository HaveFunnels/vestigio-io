import { FindingProjection, ActionProjection, ProjectionResult } from '../projections';
import type { EngineTranslations } from '../projections/types';
import { RootCause, GlobalAction } from '../intelligence';
import { MultiPackResult } from '../workspace';
import { makeRef } from '../domain';
import { MapNode, MapEdge, MapDefinition, MapNodeType } from './types';

// English source-of-truth for map names + category labels. Translation
// lookups fall back to these when no localized string is provided, so
// English users always see the same text they did before i18n landed.
const MAP_NAMES: Record<string, string> = {
  revenue_leakage: 'Revenue Leakage Map',
  chargeback_risk: 'Chargeback Risk Map',
  root_cause: 'Root Cause Map',
};

const CATEGORY_LABELS: Record<string, string> = {
  policy: 'Policy Surface',
  support: 'Support Surface',
  trust: 'Trust Surface',
};

function mapName(key: string, translations?: EngineTranslations): string {
  return translations?.maps?.names?.[key] ?? MAP_NAMES[key] ?? key;
}

function categoryLabel(key: string, translations?: EngineTranslations): string {
  return translations?.maps?.categories?.[key] ?? CATEGORY_LABELS[key] ?? key;
}

// ──────────────────────────────────────────────
// Map Engine — derive visualization data
//
// Produces MapDefinition from projections + intelligence.
// No React. No rendering. Pure data derivation.
// ──────────────────────────────────────────────

export function buildRevenueLeakageMap(
  projections: ProjectionResult,
  result: MultiPackResult,
  translations?: EngineTranslations,
): MapDefinition {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  // Filter findings related to revenue
  const revenueFindings = projections.findings.filter(f =>
    f.pack === 'revenue_integrity' || f.pack === 'scale_readiness',
  );

  // Root causes that affect revenue
  const revenueRCs = result.intelligence.root_causes.filter(rc =>
    rc.impact_types.includes('revenue_loss') ||
    rc.impact_types.includes('scale_risk') ||
    rc.impact_types.includes('trust_erosion'),
  );

  // Build root cause nodes
  for (const rc of revenueRCs) {
    const rcNodeId = `rc_${rc.root_cause_key}`;
    const rcImpact = computeRCImpact(rc, revenueFindings);

    nodes.push({
      id: rcNodeId,
      type: 'root_cause',
      label: rc.title,
      severity: rc.severity,
      impact: rcImpact,
      pack: null,
      metadata: { category: rc.category, confidence: rc.confidence },
      position: { x: 0, y: 0 },
    });

    // Connect findings to this root cause
    const linkedFindings = revenueFindings.filter(f => f.root_cause === rc.title);
    for (const finding of linkedFindings) {
      const fNodeId = `finding_${finding.inference_key}`;
      if (!nodes.find(n => n.id === fNodeId)) {
        nodes.push({
          id: fNodeId,
          type: 'finding',
          label: finding.title,
          severity: finding.severity,
          impact: { min: finding.impact.monthly_range.min, max: finding.impact.monthly_range.max, midpoint: finding.impact.midpoint },
          pack: finding.pack,
          metadata: { confidence: finding.confidence, surface: finding.surface },
          position: { x: 0, y: 0 },
        });
      }
      edges.push({
        id: `edge_${rcNodeId}_${fNodeId}`,
        source: rcNodeId,
        target: fNodeId,
        type: 'causal',
        label: null,
      });
    }
  }

  // Add unlinked findings (no root cause)
  const unlinked = revenueFindings.filter(f => !f.root_cause);
  for (const f of unlinked) {
    const fNodeId = `finding_${f.inference_key}`;
    if (!nodes.find(n => n.id === fNodeId)) {
      nodes.push({
        id: fNodeId,
        type: 'finding',
        label: f.title,
        severity: f.severity,
        impact: { min: f.impact.monthly_range.min, max: f.impact.monthly_range.max, midpoint: f.impact.midpoint },
        pack: f.pack,
        metadata: { confidence: f.confidence, surface: f.surface },
        position: { x: 0, y: 0 },
      });
    }
  }

  // Auto-layout: root causes left, findings right
  applyHierarchicalLayout(nodes, {
    rootCauses: { x: 0, nodeTypes: ['root_cause'] },
    findings: { x: 400, nodeTypes: ['finding'] },
  });

  return {
    id: 'revenue_leakage',
    name: mapName('revenue_leakage', translations),
    type: 'revenue_leakage',
    nodes,
    edges,
    legend: {
      nodes: [
        { labelKey: 'rootCause', swatch: 'root_cause' },
        { labelKey: 'finding', swatch: 'finding' },
      ],
      edges: [{ labelKey: 'causal', swatch: 'causal' }],
    },
  };
}

export function buildChargebackRiskMap(
  projections: ProjectionResult,
  result: MultiPackResult,
  translations?: EngineTranslations,
): MapDefinition {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  const cbFindings = projections.findings.filter(f => f.pack === 'chargeback_resilience');
  const cbRCs = result.intelligence.root_causes.filter(rc =>
    rc.impact_types.includes('chargeback_risk'),
  );

  // Layout: categories in a column, findings branching right
  const categoryNodes: Record<string, { type: MapNodeType; label: string }> = {
    policy: { type: 'policy', label: categoryLabel('policy', translations) },
    support: { type: 'support', label: categoryLabel('support', translations) },
    trust: { type: 'trust', label: categoryLabel('trust', translations) },
  };

  // Map root causes to category
  // Wave 2.3: elevated_dispute_risk renamed to dispute_defenses_absent
  const rcToCategory: Record<string, string> = {
    policy_deficiency: 'policy',
    support_gap: 'support',
    expectation_failure: 'trust',
    dispute_defenses_absent: 'trust',
  };

  for (const [catKey, catInfo] of Object.entries(categoryNodes)) {
    const catNodeId = `cat_${catKey}`;
    nodes.push({
      id: catNodeId,
      type: catInfo.type,
      label: catInfo.label,
      severity: null,
      impact: null,
      pack: 'chargeback_resilience',
      metadata: {},
      position: { x: 0, y: 0 },
    });

    // Root causes in this category
    const catRCs = cbRCs.filter(rc => rcToCategory[rc.root_cause_key] === catKey);
    for (const rc of catRCs) {
      const rcNodeId = `rc_${rc.root_cause_key}`;
      const rcImpact = computeRCImpact(rc, cbFindings);

      nodes.push({
        id: rcNodeId,
        type: 'root_cause',
        label: rc.title,
        severity: rc.severity,
        impact: rcImpact,
        pack: null,
        metadata: { category: rc.category, confidence: rc.confidence },
        position: { x: 0, y: 0 },
      });

      edges.push({
        id: `edge_${catNodeId}_${rcNodeId}`,
        source: catNodeId,
        target: rcNodeId,
        type: 'contributes_to',
        label: null,
      });

      // Connected findings
      const linkedFindings = cbFindings.filter(f => f.root_cause === rc.title);
      for (const f of linkedFindings) {
        const fNodeId = `finding_${f.inference_key}`;
        if (!nodes.find(n => n.id === fNodeId)) {
          nodes.push({
            id: fNodeId,
            type: 'finding',
            label: f.title,
            severity: f.severity,
            impact: { min: f.impact.monthly_range.min, max: f.impact.monthly_range.max, midpoint: f.impact.midpoint },
            pack: f.pack,
            metadata: { confidence: f.confidence },
            position: { x: 0, y: 0 },
          });
        }
        edges.push({
          id: `edge_${rcNodeId}_${fNodeId}`,
          source: rcNodeId,
          target: fNodeId,
          type: 'causal',
          label: null,
        });
      }
    }
  }

  // Auto-layout: categories left, root causes center, findings right
  applyHierarchicalLayout(nodes, {
    categories: { x: 0, nodeTypes: ['policy', 'support', 'trust'] },
    rootCauses: { x: 400, nodeTypes: ['root_cause'] },
    findings: { x: 800, nodeTypes: ['finding'] },
  });

  return {
    id: 'chargeback_risk',
    name: mapName('chargeback_risk', translations),
    type: 'chargeback_risk',
    nodes,
    edges,
    legend: {
      nodes: [
        { labelKey: 'category', swatch: 'category' },
        { labelKey: 'rootCause', swatch: 'root_cause' },
        { labelKey: 'finding', swatch: 'finding' },
      ],
      edges: [
        { labelKey: 'contributes', swatch: 'contributes_to' },
        { labelKey: 'causal', swatch: 'causal' },
      ],
    },
  };
}

export function buildRootCauseMap(
  projections: ProjectionResult,
  result: MultiPackResult,
  translations?: EngineTranslations,
): MapDefinition {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];
  const rootCauses = result.intelligence.root_causes;

  for (const rc of rootCauses) {
    const rcNodeId = `rc_${rc.root_cause_key}`;
    const rcImpact = computeRCImpact(rc, projections.findings);

    // Root cause node — center
    nodes.push({
      id: rcNodeId,
      type: 'root_cause',
      label: rc.title,
      severity: rc.severity,
      impact: rcImpact,
      pack: null,
      metadata: {
        category: rc.category,
        confidence: rc.confidence,
        affected_packs: rc.affected_packs,
      },
      position: { x: 0, y: 0 },
    });

    // Connected findings — left
    const linkedFindings = projections.findings.filter(f => f.root_cause === rc.title);
    for (const f of linkedFindings) {
      const fNodeId = `finding_${f.inference_key}`;
      if (!nodes.find(n => n.id === fNodeId)) {
        nodes.push({
          id: fNodeId,
          type: 'finding',
          label: f.title,
          severity: f.severity,
          impact: { min: f.impact.monthly_range.min, max: f.impact.monthly_range.max, midpoint: f.impact.midpoint },
          pack: f.pack,
          metadata: { confidence: f.confidence },
          position: { x: 0, y: 0 },
        });
      }
      edges.push({
        id: `edge_${fNodeId}_${rcNodeId}`,
        source: fNodeId,
        target: rcNodeId,
        type: 'contributes_to',
        label: null,
      });
    }

    // Connected actions — right
    const linkedActions = projections.actions.filter(a => a.root_cause === rc.title);
    for (const a of linkedActions) {
      const aNodeId = `action_${a.id}`;
      if (!nodes.find(n => n.id === aNodeId)) {
        nodes.push({
          id: aNodeId,
          type: 'action',
          label: a.title,
          severity: a.severity,
          impact: a.impact ? { min: a.impact.monthly_range.min, max: a.impact.monthly_range.max, midpoint: a.impact.midpoint } : null,
          pack: null,
          metadata: { cross_pack: a.cross_pack, action_type: a.action_type },
          position: { x: 0, y: 0 },
        });
      }
      edges.push({
        id: `edge_${rcNodeId}_${aNodeId}`,
        source: rcNodeId,
        target: aNodeId,
        type: 'addresses',
        label: null,
      });
    }
  }

  // Auto-layout: findings left, root causes center, actions right
  applyHierarchicalLayout(nodes, {
    findings: { x: 0, nodeTypes: ['finding'] },
    rootCauses: { x: 400, nodeTypes: ['root_cause'] },
    actions: { x: 800, nodeTypes: ['action'] },
  });

  return {
    id: 'root_cause',
    name: mapName('root_cause', translations),
    type: 'root_cause',
    nodes,
    edges,
    legend: {
      nodes: [
        { labelKey: 'finding', swatch: 'finding' },
        { labelKey: 'rootCause', swatch: 'root_cause' },
        { labelKey: 'action', swatch: 'action' },
      ],
      edges: [
        { labelKey: 'contributes', swatch: 'contributes_to' },
        { labelKey: 'addresses', swatch: 'addresses' },
      ],
    },
  };
}

export function buildCustomMap(
  name: string,
  description: string | null,
  selectedFindingIds: string[],
  projections: ProjectionResult,
  result: MultiPackResult,
): MapDefinition {
  const nodes: MapNode[] = [];
  const edges: MapEdge[] = [];

  const findingIdSet = new Set(selectedFindingIds);
  const selectedFindings = projections.findings.filter(f => findingIdSet.has(f.id));

  // Collect root causes referenced by selected findings
  const rootCauseTitles = new Set(
    selectedFindings.map(f => f.root_cause).filter((rc): rc is string => rc !== null),
  );
  const rootCauses = result.intelligence.root_causes.filter(rc =>
    rootCauseTitles.has(rc.title),
  );

  // Build root cause nodes + edges
  for (const rc of rootCauses) {
    const rcNodeId = `rc_${rc.root_cause_key}`;
    const rcImpact = computeRCImpact(rc, selectedFindings);

    nodes.push({
      id: rcNodeId,
      type: 'root_cause',
      label: rc.title,
      severity: rc.severity,
      impact: rcImpact,
      pack: null,
      metadata: { category: rc.category, confidence: rc.confidence },
      position: { x: 0, y: 0 },
    });

    const linked = selectedFindings.filter(f => f.root_cause === rc.title);
    for (const f of linked) {
      const fNodeId = `finding_${f.inference_key}`;
      if (!nodes.find(n => n.id === fNodeId)) {
        nodes.push({
          id: fNodeId,
          type: 'finding',
          label: f.title,
          severity: f.severity,
          impact: { min: f.impact.monthly_range.min, max: f.impact.monthly_range.max, midpoint: f.impact.midpoint },
          pack: f.pack,
          metadata: { confidence: f.confidence, surface: f.surface },
          position: { x: 0, y: 0 },
        });
      }
      edges.push({
        id: `edge_${fNodeId}_${rcNodeId}`,
        source: fNodeId,
        target: rcNodeId,
        type: 'contributes_to',
        label: null,
      });
    }

    // Actions that address this root cause
    const linkedActions = projections.actions.filter(a => a.root_cause === rc.title);
    for (const a of linkedActions) {
      const aNodeId = `action_${a.id}`;
      if (!nodes.find(n => n.id === aNodeId)) {
        nodes.push({
          id: aNodeId,
          type: 'action',
          label: a.title,
          severity: a.severity,
          impact: a.impact ? { min: a.impact.monthly_range.min, max: a.impact.monthly_range.max, midpoint: a.impact.midpoint } : null,
          pack: null,
          metadata: { cross_pack: a.cross_pack, action_type: a.action_type },
          position: { x: 0, y: 0 },
        });
      }
      edges.push({
        id: `edge_${rcNodeId}_${aNodeId}`,
        source: rcNodeId,
        target: aNodeId,
        type: 'addresses',
        label: null,
      });
    }
  }

  // Unlinked findings (no root cause)
  for (const f of selectedFindings) {
    const fNodeId = `finding_${f.inference_key}`;
    if (!nodes.find(n => n.id === fNodeId)) {
      nodes.push({
        id: fNodeId,
        type: 'finding',
        label: f.title,
        severity: f.severity,
        impact: { min: f.impact.monthly_range.min, max: f.impact.monthly_range.max, midpoint: f.impact.midpoint },
        pack: f.pack,
        metadata: { confidence: f.confidence, surface: f.surface },
        position: { x: 0, y: 0 },
      });
    }
  }

  applyHierarchicalLayout(nodes, {
    findings: { x: 0, nodeTypes: ['finding'] },
    rootCauses: { x: 400, nodeTypes: ['root_cause'] },
    actions: { x: 800, nodeTypes: ['action'] },
  });

  const hasFindings = nodes.some(n => n.type === 'finding');
  const hasRCs = nodes.some(n => n.type === 'root_cause');
  const hasActions = nodes.some(n => n.type === 'action');

  return {
    id: `custom_${Date.now()}`,
    name,
    type: 'root_cause',
    nodes,
    edges,
    legend: {
      nodes: [
        ...(hasFindings ? [{ labelKey: 'finding' as const, swatch: 'finding' as const }] : []),
        ...(hasRCs ? [{ labelKey: 'rootCause' as const, swatch: 'root_cause' as const }] : []),
        ...(hasActions ? [{ labelKey: 'action' as const, swatch: 'action' as const }] : []),
      ],
      edges: [
        ...(edges.some(e => e.type === 'contributes_to') ? [{ labelKey: 'contributes' as const, swatch: 'contributes_to' as const }] : []),
        ...(edges.some(e => e.type === 'addresses') ? [{ labelKey: 'addresses' as const, swatch: 'addresses' as const }] : []),
      ],
    },
    metadata: { description, custom: true, findingCount: selectedFindings.length },
  };
}

export function buildAllMaps(
  projections: ProjectionResult,
  result: MultiPackResult,
  translations?: EngineTranslations,
): MapDefinition[] {
  return [
    buildRevenueLeakageMap(projections, result, translations),
    buildChargebackRiskMap(projections, result, translations),
    buildRootCauseMap(projections, result, translations),
  ];
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function computeRCImpact(
  rc: RootCause,
  findings: FindingProjection[],
): { min: number; max: number; midpoint: number } | null {
  const linked = findings.filter(f => f.root_cause === rc.title);
  if (linked.length === 0) return null;

  let min = 0;
  let max = 0;
  for (const f of linked) {
    min += f.impact.monthly_range.min;
    max += f.impact.monthly_range.max;
  }

  return { min: Math.round(min), max: Math.round(max), midpoint: Math.round((min + max) / 2) };
}

// ──────────────────────────────────────────────
// Auto-layout — hierarchical column layout
//
// Assigns X by column and Y by evenly spacing
// nodes within each column (80px apart, centered).
// ──────────────────────────────────────────────

interface ColumnConfig {
  [columnName: string]: { x: number; nodeTypes: MapNodeType[] };
}

function applyHierarchicalLayout(nodes: MapNode[], columns: ColumnConfig): void {
  const NODE_SPACING_Y = 80;

  // Group nodes by their column
  const columnGroups: Record<string, MapNode[]> = {};
  for (const colName of Object.keys(columns)) {
    columnGroups[colName] = [];
  }

  for (const node of nodes) {
    for (const [colName, colDef] of Object.entries(columns)) {
      if (colDef.nodeTypes.includes(node.type)) {
        columnGroups[colName].push(node);
        break;
      }
    }
  }

  // Compute the tallest column to center shorter columns
  let maxColumnHeight = 0;
  for (const colName of Object.keys(columns)) {
    const count = columnGroups[colName].length;
    const height = count > 0 ? (count - 1) * NODE_SPACING_Y : 0;
    if (height > maxColumnHeight) maxColumnHeight = height;
  }

  // Assign positions
  for (const [colName, colDef] of Object.entries(columns)) {
    const group = columnGroups[colName];
    if (group.length === 0) continue;

    const totalHeight = (group.length - 1) * NODE_SPACING_Y;
    const startY = (maxColumnHeight - totalHeight) / 2;

    // Sort by severity priority, then by impact (descending)
    const sevOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    group.sort((a, b) => {
      const sa = sevOrder[a.severity || 'low'] ?? 4;
      const sb = sevOrder[b.severity || 'low'] ?? 4;
      if (sa !== sb) return sa - sb;
      const ia = a.impact?.midpoint ?? 0;
      const ib = b.impact?.midpoint ?? 0;
      return ib - ia;
    });

    for (let i = 0; i < group.length; i++) {
      group[i].position = { x: colDef.x, y: startY + i * NODE_SPACING_Y };
    }
  }
}
