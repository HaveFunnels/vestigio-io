import type { FindingProjection } from '../../packages/projections';

// ──────────────────────────────────────────────
// Data Consistency — dedup + deterministic scoring
//
// Ensures:
//   - No duplicate findings (same inference_key)
//   - Stable projections (same input → same output)
//   - Deterministic scoring (sort-stable)
// ──────────────────────────────────────────────

export function deduplicateFindings(findings: FindingProjection[]): FindingProjection[] {
  const seen = new Map<string, FindingProjection>();

  for (const finding of findings) {
    const key = finding.inference_key;
    const existing = seen.get(key);

    if (!existing) {
      seen.set(key, finding);
      continue;
    }

    // Keep the one with higher confidence
    if (finding.confidence > existing.confidence) {
      seen.set(key, finding);
    } else if (finding.confidence === existing.confidence) {
      // Tie-break: higher impact midpoint
      if (finding.impact.midpoint > existing.impact.midpoint) {
        seen.set(key, finding);
      }
    }
  }

  return Array.from(seen.values());
}

export function deterministicSort(findings: FindingProjection[]): FindingProjection[] {
  return [...findings].sort((a, b) => {
    // Primary: polarity order (negative first)
    const polarityOrder: Record<string, number> = { negative: 0, neutral: 1, positive: 2 };
    const pd = (polarityOrder[a.polarity] || 1) - (polarityOrder[b.polarity] || 1);
    if (pd !== 0) return pd;

    // Secondary: impact midpoint descending
    const impactDiff = b.impact.midpoint - a.impact.midpoint;
    if (impactDiff !== 0) return impactDiff;

    // Tertiary: confidence descending
    const confDiff = b.confidence - a.confidence;
    if (confDiff !== 0) return confDiff;

    // Quaternary: stable sort by inference_key (alphabetical)
    return a.inference_key.localeCompare(b.inference_key);
  });
}

export function stabilizeFindings(findings: FindingProjection[]): FindingProjection[] {
  const deduped = deduplicateFindings(findings);
  return deterministicSort(deduped);
}

// ──────────────────────────────────────────────
// Scoring Determinism
// ──────────────────────────────────────────────

export interface ScoreSummary {
  total_findings: number;
  negative_count: number;
  positive_count: number;
  neutral_count: number;
  total_impact_mid: number;
  hash: string;
}

export function computeStableScore(findings: FindingProjection[]): ScoreSummary {
  const stable = stabilizeFindings(findings);
  const negative = stable.filter(f => f.polarity === 'negative');
  const positive = stable.filter(f => f.polarity === 'positive');
  const neutral = stable.filter(f => f.polarity === 'neutral');
  const totalImpact = stable.reduce((s, f) => s + f.impact.midpoint, 0);

  // Deterministic hash from finding keys + impacts
  const hashInput = stable.map(f => `${f.inference_key}:${f.impact.midpoint}:${f.confidence}`).join('|');
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    hash = ((hash << 5) - hash) + hashInput.charCodeAt(i);
    hash |= 0;
  }

  return {
    total_findings: stable.length,
    negative_count: negative.length,
    positive_count: positive.length,
    neutral_count: neutral.length,
    total_impact_mid: totalImpact,
    hash: Math.abs(hash).toString(36),
  };
}
