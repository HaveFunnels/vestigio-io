import {
  KatanaClassifiedRoute,
  KatanaDiscoveryResult,
  KatanaRawResult,
  CommercialDiscoveryFamily,
  KatanaExecutionConditions,
} from './types';
import { classifyKatanaResults } from './commercial-classifier';

// ──────────────────────────────────────────────
// Katana Discovery Normalizer
//
// Aggregates classified Katana results into
// discovery families for signal extraction.
// Provides the conditional execution gate.
// ──────────────────────────────────────────────

/**
 * Normalize raw Katana results into commercially classified discoveries.
 * Only commercially relevant routes pass through.
 */
export function normalizeKatanaResults(
  rawResults: KatanaRawResult[],
  knownUrls: Set<string>,
): KatanaDiscoveryResult {
  const classified = classifyKatanaResults(rawResults, knownUrls);

  const familiesFound = new Set<CommercialDiscoveryFamily>();
  for (const route of classified) {
    familiesFound.add(route.discovery_family);
  }

  return {
    classified_routes: classified,
    total_discovered: rawResults.length,
    total_relevant: classified.length,
    families_found: Array.from(familiesFound),
    duration_ms: 0, // set by runner
    errors: [],
  };
}

/**
 * Group classified routes by discovery family for signal extraction.
 */
export function groupByDiscoveryFamily(
  routes: KatanaClassifiedRoute[],
): Map<CommercialDiscoveryFamily, KatanaClassifiedRoute[]> {
  const groups = new Map<CommercialDiscoveryFamily, KatanaClassifiedRoute[]>();

  for (const route of routes) {
    const existing = groups.get(route.discovery_family) || [];
    existing.push(route);
    groups.set(route.discovery_family, existing);
  }

  return groups;
}

/**
 * Evaluate whether Katana should run based on current evidence state.
 * Katana is CONDITIONAL — not every audit needs it.
 */
export function evaluateKatanaConditions(
  scriptCount: number,
  bodyWordCount: number,
  commercialPagesFound: number,
  hasInlineRouterPatterns: boolean,
  hasApiEndpointSignals: boolean,
): KatanaExecutionConditions {
  // SPA-heavy: lots of scripts, little static content
  const isSpaHeavy = scriptCount > 15 || (bodyWordCount < 2000 && scriptCount > 5);

  // Static discovery found few commercial pages
  const lowCommercialDiscovery = commercialPagesFound < 5;

  // Evidence of JS-rendered commerce routes
  const hasJsCommerceSignals = hasInlineRouterPatterns || hasApiEndpointSignals;

  // Insufficient for abuse analysis — too little surface to analyze
  const insufficientForAbuseAnalysis = commercialPagesFound < 3 && scriptCount > 8;

  const shouldRun = isSpaHeavy || (lowCommercialDiscovery && hasJsCommerceSignals) || insufficientForAbuseAnalysis;

  return {
    is_spa_heavy: isSpaHeavy,
    low_commercial_discovery: lowCommercialDiscovery,
    has_js_commerce_signals: hasJsCommerceSignals,
    insufficient_for_abuse_analysis: insufficientForAbuseAnalysis,
    should_run: shouldRun,
  };
}

/**
 * Get net-new routes only (not already discovered by static crawl).
 */
export function filterNetNewRoutes(
  routes: KatanaClassifiedRoute[],
): KatanaClassifiedRoute[] {
  return routes.filter(r => r.is_net_new);
}

/**
 * Get routes that appear guessable and lack visible safeguards.
 * These are the highest-risk discoveries for business-logic abuse.
 */
export function filterWeaklyGovernedRoutes(
  routes: KatanaClassifiedRoute[],
): KatanaClassifiedRoute[] {
  return routes.filter(r => r.appears_guessable && !r.has_visible_safeguards);
}

/**
 * Compute aggregate confidence for a group of routes.
 */
export function aggregateConfidence(routes: KatanaClassifiedRoute[]): number {
  if (routes.length === 0) return 0;
  const total = routes.reduce((sum, r) => sum + r.confidence, 0);
  // Convergence bonus: multiple discoveries reinforce confidence
  const base = Math.round(total / routes.length);
  const convergenceBonus = Math.min(15, (routes.length - 1) * 5);
  return Math.min(95, base + convergenceBonus);
}
