import { EngineContext, getFindingProjections, getActionProjections, getRootCauses } from './context';
import type { FindingProjection, ActionProjection } from '../../packages/projections';
import type { RootCause } from '../../packages/intelligence';

// ──────────────────────────────────────────────
// MCP Context Chaining — Deterministic Chains
//
// After any response, MCP can chain:
//   finding → root cause
//   root cause → action
//   action → verification
//   SaaS issue → landing mismatch
//   revenue issue → trust / onboarding
//
// All chaining is deterministic, based on:
//   projections, findings, classification,
//   eligibility, and impact.
//
// No freeform hallucinated chaining.
// ──────────────────────────────────────────────

export type ChainNodeType =
  | 'finding'
  | 'root_cause'
  | 'action'
  | 'verification'
  | 'landing_mismatch'
  | 'trust_onboarding'
  | 'saas_issue'
  | 'revenue_issue';

export interface ChainLink {
  from: { type: ChainNodeType; id: string; label: string };
  to: { type: ChainNodeType; id: string; label: string };
  relationship: string;
  prompt: string;
  confidence: number;
  estimated_value: number; // impact in $/mo that this chain addresses
}

export interface ChainPath {
  links: ChainLink[];
  total_estimated_value: number;
  depth: number;
}

// ──────────────────────────────────────────────
// Build all available chains from current context
// ──────────────────────────────────────────────

export function buildAvailableChains(ctx: EngineContext): ChainLink[] {
  const findings = getFindingProjections(ctx);
  const actions = getActionProjections(ctx);
  const rootCauses = getRootCauses(ctx);

  const chains: ChainLink[] = [];

  // Finding → Root Cause chains
  for (const f of findings) {
    if (!f.root_cause) continue;
    const rc = rootCauses.find(r => r.title === f.root_cause);
    if (!rc) continue;

    chains.push({
      from: { type: 'finding', id: f.id, label: f.title },
      to: { type: 'root_cause', id: rc.root_cause_key, label: rc.title },
      relationship: 'caused_by',
      prompt: `What is the root cause behind "${f.title}"?`,
      confidence: Math.min(f.confidence, rc.confidence),
      estimated_value: f.impact.midpoint,
    });
  }

  // Root Cause → Action chains
  for (const rc of rootCauses) {
    const relatedActions = actions.filter(a => a.root_cause === rc.title);
    for (const a of relatedActions) {
      chains.push({
        from: { type: 'root_cause', id: rc.root_cause_key, label: rc.title },
        to: { type: 'action', id: a.id, label: a.title },
        relationship: 'fixed_by',
        prompt: `How do I fix "${rc.title}" by implementing "${a.title}"?`,
        confidence: Math.min(rc.confidence, a.confidence),
        estimated_value: a.impact?.midpoint || 0,
      });
    }
  }

  // Action → Verification chains
  for (const a of actions.slice(0, 10)) {
    chains.push({
      from: { type: 'action', id: a.id, label: a.title },
      to: { type: 'verification', id: `verify_${a.id}`, label: `Verify ${a.title}` },
      relationship: 'verified_by',
      prompt: `Can we verify "${a.title}" with a browser check?`,
      confidence: a.confidence,
      estimated_value: a.impact?.midpoint || 0,
    });
  }

  // Revenue → Trust/Onboarding chains
  const revenueFindings = findings.filter(f => f.pack === 'revenue_integrity');
  const trustFindings = findings.filter(f =>
    f.inference_key.includes('trust') ||
    f.inference_key.includes('onboarding') ||
    f.inference_key.includes('policy'),
  );
  if (revenueFindings.length > 0 && trustFindings.length > 0) {
    const revImpact = revenueFindings.reduce((s, f) => s + f.impact.midpoint, 0);
    chains.push({
      from: { type: 'revenue_issue', id: 'revenue_group', label: `${revenueFindings.length} revenue issues` },
      to: { type: 'trust_onboarding', id: 'trust_group', label: `${trustFindings.length} trust/onboarding issues` },
      relationship: 'trust_impact',
      prompt: 'How are trust and onboarding issues affecting revenue?',
      confidence: Math.round(
        revenueFindings.reduce((s, f) => s + f.confidence, 0) / revenueFindings.length,
      ),
      estimated_value: revImpact,
    });
  }

  // SaaS → Landing Mismatch chains
  const saasFindings = findings.filter(f => f.pack === 'saas_growth_readiness');
  const mismatchFindings = findings.filter(f => f.inference_key === 'landing_app_mismatch');
  if (saasFindings.length > 0 && mismatchFindings.length > 0) {
    chains.push({
      from: { type: 'saas_issue', id: 'saas_group', label: `${saasFindings.length} SaaS issues` },
      to: { type: 'landing_mismatch', id: 'mismatch_group', label: 'Landing/app mismatch' },
      relationship: 'mismatch_detected',
      prompt: 'Does my landing page align with what the app actually delivers?',
      confidence: mismatchFindings[0].confidence,
      estimated_value: mismatchFindings.reduce((s, f) => s + f.impact.midpoint, 0),
    });
  }

  // Sort by estimated value desc
  chains.sort((a, b) => b.estimated_value - a.estimated_value);

  return chains;
}

// ──────────────────────────────────────────────
// Get chain path from a starting node
// ──────────────────────────────────────────────

export function getChainFrom(
  ctx: EngineContext,
  fromType: ChainNodeType,
  fromId: string,
  maxDepth: number = 3,
): ChainPath {
  const allChains = buildAvailableChains(ctx);
  const links: ChainLink[] = [];
  let currentType = fromType;
  let currentId = fromId;
  let totalValue = 0;

  for (let depth = 0; depth < maxDepth; depth++) {
    const next = allChains.find(
      c => c.from.type === currentType && c.from.id === currentId,
    );
    if (!next) break;

    // Prevent loops
    if (links.some(l => l.to.type === next.to.type && l.to.id === next.to.id)) break;

    links.push(next);
    totalValue += next.estimated_value;
    currentType = next.to.type;
    currentId = next.to.id;
  }

  return { links, total_estimated_value: totalValue, depth: links.length };
}

// ──────────────────────────────────────────────
// Get the single best chain for a given answer domain
// ──────────────────────────────────────────────

export function getBestChainForDomain(
  ctx: EngineContext,
  domain: string,
): ChainLink | null {
  const chains = buildAvailableChains(ctx);
  if (chains.length === 0) return null;

  switch (domain) {
    case 'scale':
    case 'revenue':
      // Prefer finding → root_cause
      return chains.find(c => c.from.type === 'finding' && c.to.type === 'root_cause') || chains[0];

    case 'root_cause':
      // Prefer root_cause → action
      return chains.find(c => c.from.type === 'root_cause' && c.to.type === 'action') || chains[0];

    case 'fix_first':
      // Prefer action → verification
      return chains.find(c => c.from.type === 'action' && c.to.type === 'verification') || chains[0];

    case 'finding':
      // Prefer finding → root_cause for the specific finding
      return chains.find(c => c.from.type === 'finding') || chains[0];

    default:
      return chains[0];
  }
}

// ──────────────────────────────────────────────
// Get highest-value chain paths (for playbooks)
// ──────────────────────────────────────────────

export function getHighValueChains(
  ctx: EngineContext,
  limit: number = 3,
): ChainPath[] {
  const findings = getFindingProjections(ctx);
  const paths: ChainPath[] = [];

  // Build full chain paths starting from top findings
  for (const f of findings.slice(0, limit * 2)) {
    const path = getChainFrom(ctx, 'finding', f.id, 3);
    if (path.links.length > 0) {
      paths.push(path);
    }
  }

  // Sort by total value and return top N
  paths.sort((a, b) => b.total_estimated_value - a.total_estimated_value);
  return paths.slice(0, limit);
}
