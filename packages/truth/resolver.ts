import {
  TruthClaim,
  TruthResolution,
  TruthContradiction,
  TruthState,
  AuthorityLevel,
  ResolutionMethod,
} from './types';

// ──────────────────────────────────────────────
// Truth Resolver — deterministic conflict resolution
//
// Rules:
// 1. If authority gap >= 2 levels: higher authority wins outright
// 2. If authority gap == 1: blend confidence (70% higher, 30% lower)
// 3. If same authority: blend by confidence, recency breaks ties
// 4. Contradictions are always recorded regardless of resolution
// 5. Freshness weight decays claim influence over time
// ──────────────────────────────────────────────

const AUTHORITY_OVERRIDE_GAP = 2;
const HIGHER_AUTHORITY_BLEND_WEIGHT = 0.7;
const LOWER_AUTHORITY_BLEND_WEIGHT = 0.3;

/**
 * Resolve all claims for a subject into a coherent truth state.
 */
export function resolveTruth(
  subject_ref: string,
  claims: TruthClaim[],
): TruthState {
  // Group claims by claim_key
  const grouped = new Map<string, TruthClaim[]>();
  for (const claim of claims) {
    const existing = grouped.get(claim.claim_key) || [];
    existing.push(claim);
    grouped.set(claim.claim_key, existing);
  }

  const resolutions: TruthResolution[] = [];
  let totalContradictions = 0;
  let contestedClaims = 0;

  for (const [claimKey, claimGroup] of grouped) {
    const resolution = resolveClaims(claimKey, claimGroup);
    resolutions.push(resolution);
    totalContradictions += resolution.contradictions.length;
    if (resolution.is_contested) contestedClaims++;
  }

  // Overall confidence: average of resolved confidences, penalized by contradiction ratio
  const avgConfidence = resolutions.length > 0
    ? resolutions.reduce((sum, r) => sum + r.resolved_confidence, 0) / resolutions.length
    : 0;
  const contradictionPenalty = resolutions.length > 0
    ? 1 - (contestedClaims / resolutions.length) * 0.3
    : 1;
  const overallConfidence = Math.round(avgConfidence * contradictionPenalty);

  // Which authority levels contributed
  const authoritySet = new Set<AuthorityLevel>();
  for (const claim of claims) {
    authoritySet.add(claim.source_authority);
  }

  return {
    subject_ref,
    resolutions,
    total_contradictions: totalContradictions,
    contested_claims: contestedClaims,
    overall_truth_confidence: overallConfidence,
    authority_coverage: Array.from(authoritySet).sort((a, b) => a - b),
  };
}

/**
 * Resolve a set of claims about the same attribute.
 */
export function resolveClaims(
  claimKey: string,
  claims: TruthClaim[],
): TruthResolution {
  if (claims.length === 0) {
    throw new Error(`No claims to resolve for key: ${claimKey}`);
  }

  if (claims.length === 1) {
    const sole = claims[0];
    return {
      claim_key: claimKey,
      resolved_value: sole.value,
      resolved_confidence: Math.round(sole.confidence * sole.freshness_weight),
      resolution_method: 'single_source',
      winning_authority: sole.source_authority,
      contributing_claims: claims,
      contradictions: [],
      is_contested: false,
    };
  }

  // Detect contradictions first
  const contradictions = detectContradictions(claimKey, claims);
  const uniqueValues = new Set(claims.map(c => c.value));
  const isContested = uniqueValues.size > 1;

  // If all agree, unanimous resolution
  if (!isContested) {
    const bestClaim = claims.reduce((a, b) =>
      effectiveWeight(b) > effectiveWeight(a) ? b : a
    );
    const blendedConfidence = blendConfidenceUnanimous(claims);
    return {
      claim_key: claimKey,
      resolved_value: bestClaim.value,
      resolved_confidence: blendedConfidence,
      resolution_method: 'unanimous',
      winning_authority: bestClaim.source_authority,
      contributing_claims: claims,
      contradictions: [],
      is_contested: false,
    };
  }

  // Contested: resolve by authority hierarchy
  const sorted = [...claims].sort((a, b) => {
    // Primary: authority level (descending)
    if (b.source_authority !== a.source_authority) {
      return b.source_authority - a.source_authority;
    }
    // Secondary: effective weight (descending)
    return effectiveWeight(b) - effectiveWeight(a);
  });

  const highest = sorted[0];
  const secondHighest = sorted.find(c => c.value !== highest.value);

  if (!secondHighest) {
    // All highest-authority claims agree, disagreement is from lower sources
    return {
      claim_key: claimKey,
      resolved_value: highest.value,
      resolved_confidence: Math.round(highest.confidence * highest.freshness_weight),
      resolution_method: 'authority_override',
      winning_authority: highest.source_authority,
      contributing_claims: claims,
      contradictions,
      is_contested: true,
    };
  }

  const authorityGap = highest.source_authority - secondHighest.source_authority;

  if (authorityGap >= AUTHORITY_OVERRIDE_GAP) {
    // Large authority gap: higher authority wins outright
    return {
      claim_key: claimKey,
      resolved_value: highest.value,
      resolved_confidence: Math.round(highest.confidence * highest.freshness_weight),
      resolution_method: 'authority_override',
      winning_authority: highest.source_authority,
      contributing_claims: claims,
      contradictions,
      is_contested: true,
    };
  }

  if (authorityGap === 1) {
    // Close authority: blend confidence with bias toward higher authority
    const higherWeight = effectiveWeight(highest) * HIGHER_AUTHORITY_BLEND_WEIGHT;
    const lowerWeight = effectiveWeight(secondHighest) * LOWER_AUTHORITY_BLEND_WEIGHT;
    const totalWeight = higherWeight + lowerWeight;

    if (higherWeight >= lowerWeight) {
      const blendedConfidence = Math.round(
        (highest.confidence * higherWeight + secondHighest.confidence * lowerWeight) / totalWeight
      );
      return {
        claim_key: claimKey,
        resolved_value: highest.value,
        resolved_confidence: blendedConfidence,
        resolution_method: 'confidence_blend',
        winning_authority: highest.source_authority,
        contributing_claims: claims,
        contradictions,
        is_contested: true,
      };
    } else {
      // Lower authority has much higher confidence — still respect it but flag
      return {
        claim_key: claimKey,
        resolved_value: secondHighest.value,
        resolved_confidence: Math.round(secondHighest.confidence * secondHighest.freshness_weight * 0.9),
        resolution_method: 'confidence_blend',
        winning_authority: secondHighest.source_authority,
        contributing_claims: claims,
        contradictions,
        is_contested: true,
      };
    }
  }

  // Same authority level: recency tiebreak
  const moreRecent = highest.observed_at >= secondHighest.observed_at ? highest : secondHighest;
  return {
    claim_key: claimKey,
    resolved_value: moreRecent.value,
    resolved_confidence: Math.round(moreRecent.confidence * moreRecent.freshness_weight),
    resolution_method: 'recency_tiebreak',
    winning_authority: moreRecent.source_authority,
    contributing_claims: claims,
    contradictions,
    is_contested: true,
  };
}

/**
 * Detect contradictions between claims about the same attribute.
 */
export function detectContradictions(
  claimKey: string,
  claims: TruthClaim[],
): TruthContradiction[] {
  const contradictions: TruthContradiction[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i];
      const b = claims[j];
      if (a.value === b.value) continue;

      const pairKey = `${a.evidence_ref}|${b.evidence_ref}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const authorityGap = Math.abs(a.source_authority - b.source_authority);
      const severity = classifyContradictionSeverity(a, b, authorityGap);
      const higher = a.source_authority >= b.source_authority ? a : b;
      const lower = a.source_authority >= b.source_authority ? b : a;

      contradictions.push({
        claim_key: claimKey,
        claim_a: {
          value: a.value,
          authority: a.source_authority,
          confidence: a.confidence,
          evidence_ref: a.evidence_ref,
        },
        claim_b: {
          value: b.value,
          authority: b.source_authority,
          confidence: b.confidence,
          evidence_ref: b.evidence_ref,
        },
        severity,
        resolution_note: authorityGap >= AUTHORITY_OVERRIDE_GAP
          ? `${AuthorityLevel[higher.source_authority]} overrides ${AuthorityLevel[lower.source_authority]}`
          : authorityGap === 1
            ? `${AuthorityLevel[higher.source_authority]} blended with ${AuthorityLevel[lower.source_authority]}`
            : `Same authority (${AuthorityLevel[a.source_authority]}), resolved by recency`,
      });
    }
  }

  return contradictions;
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

function effectiveWeight(claim: TruthClaim): number {
  return claim.confidence * claim.freshness_weight;
}

function blendConfidenceUnanimous(claims: TruthClaim[]): number {
  // When all sources agree, boost confidence
  const baseConfidence = claims.reduce((sum, c) => sum + c.confidence * c.freshness_weight, 0) / claims.length;
  const agreementBoost = Math.min(claims.length * 5, 20); // up to +20 for multi-source agreement
  return Math.min(100, Math.round(baseConfidence + agreementBoost));
}

function classifyContradictionSeverity(
  a: TruthClaim,
  b: TruthClaim,
  authorityGap: number,
): 'minor' | 'material' | 'critical' {
  // Both high confidence + same or close authority = critical
  if (a.confidence >= 70 && b.confidence >= 70 && authorityGap <= 1) {
    return 'critical';
  }
  // Both medium+ confidence = material
  if (a.confidence >= 50 && b.confidence >= 50) {
    return 'material';
  }
  return 'minor';
}
