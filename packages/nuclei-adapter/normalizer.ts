import { CURATED_CHECKS } from './curated-checks';
import { NucleiRawMatch, NucleiNormalizedMatch, CommercialDownsideFamily } from './types';

// ──────────────────────────────────────────────
// Nuclei Evidence Normalizer
//
// Transforms raw Nuclei matches into commercially
// meaningful evidence. Only curated matches pass through.
// Unrecognized templates are silently dropped.
// ──────────────────────────────────────────────

const COMMERCIAL_SURFACE_PATTERNS = /checkout|cart|pay|payment|billing|order|purchase|pricing|login|comprar|pedido/i;

const CHECK_INDEX = new Map(CURATED_CHECKS.map(c => [c.nuclei_template, c]));

/**
 * Normalize raw Nuclei matches into commercially meaningful evidence.
 * Only matches that map to curated checks are returned.
 * Everything else is silently dropped — it has no commercial interpretation.
 */
export function normalizeNucleiMatches(
  rawMatches: NucleiRawMatch[],
): NucleiNormalizedMatch[] {
  const normalized: NucleiNormalizedMatch[] = [];

  for (const raw of rawMatches) {
    const check = CHECK_INDEX.get(raw.template_id);
    if (!check) continue; // not in curated suite — drop silently

    const isCommercialSurface = COMMERCIAL_SURFACE_PATTERNS.test(raw.matched_at);

    // Boost confidence when match is on a commercial surface
    const confidence = isCommercialSurface && check.commercial_surface_relevant
      ? Math.min(95, check.commercial_confidence + 15)
      : check.commercial_confidence;

    normalized.push({
      check_id: check.check_id,
      downside_family: check.downside_family,
      matched_at: raw.matched_at,
      is_commercial_surface: isCommercialSurface,
      commercial_interpretation: check.commercial_interpretation,
      confidence,
      severity_weight: check.severity_weight,
      technical_detail: `${raw.name}: ${raw.description}`.slice(0, 500),
    });
  }

  return normalized;
}

/**
 * Group normalized matches by downside family for signal extraction.
 */
export function groupByDownsideFamily(
  matches: NucleiNormalizedMatch[],
): Map<CommercialDownsideFamily, NucleiNormalizedMatch[]> {
  const groups = new Map<CommercialDownsideFamily, NucleiNormalizedMatch[]>();

  for (const m of matches) {
    const existing = groups.get(m.downside_family) || [];
    existing.push(m);
    groups.set(m.downside_family, existing);
  }

  return groups;
}

/**
 * Get the highest severity weight from a group of matches.
 */
export function highestSeverity(
  matches: NucleiNormalizedMatch[],
): 'low' | 'medium' | 'high' {
  const weights = { low: 1, medium: 2, high: 3 };
  let max = 0;
  for (const m of matches) {
    max = Math.max(max, weights[m.severity_weight]);
  }
  return max >= 3 ? 'high' : max >= 2 ? 'medium' : 'low';
}
