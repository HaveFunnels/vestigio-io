import { Evidence, FreshnessState, SourceKind, CollectionMethod } from '../domain';

// ──────────────────────────────────────────────
// Evidence Quality — first-class structured quality assessment
//
// Separates quality into four orthogonal dimensions:
// - source_reliability: how trustworthy is the collection method
// - completeness: did we get a full observation or partial
// - recency: how fresh is the evidence
// - corroboration: does other evidence agree
//
// These feed confidence scoring and decision justification.
// ──────────────────────────────────────────────

export interface EvidenceQuality {
  evidence_ref: string;
  source_reliability: number;  // 0..100
  completeness: number;        // 0..100
  recency: number;             // 0..100
  corroboration: number;       // 0..100
  composite_score: number;     // 0..100 (weighted blend)
  dimensions: QualityDimension[];
}

export interface QualityDimension {
  name: 'source_reliability' | 'completeness' | 'recency' | 'corroboration';
  score: number;
  weight: number;
  reasoning: string;
}

// Weights for composite score
const QUALITY_WEIGHTS = {
  source_reliability: 0.35,
  completeness: 0.25,
  recency: 0.25,
  corroboration: 0.15,
};

// Source reliability baselines by collection method
const COLLECTION_METHOD_RELIABILITY: Record<string, number> = {
  [CollectionMethod.StaticFetch]: 50,
  [CollectionMethod.DynamicRender]: 75,
  [CollectionMethod.ApiCall]: 90,
  [CollectionMethod.PassiveCollection]: 40,
  [CollectionMethod.ManualInput]: 60,
};

const SOURCE_KIND_RELIABILITY: Record<string, number> = {
  [SourceKind.Crawl]: 55,
  [SourceKind.HttpFetch]: 50,
  [SourceKind.Pixel]: 45,
  [SourceKind.Heartbeat]: 40,
  [SourceKind.Integration]: 85,
  [SourceKind.BrowserVerification]: 80,
  [SourceKind.Manual]: 55,
};

/**
 * Compute structured quality for a single piece of evidence.
 */
export function assessEvidenceQuality(
  evidence: Evidence,
  allEvidence: Evidence[],
  now?: Date,
): EvidenceQuality {
  const currentTime = now || new Date();

  const sourceReliability = computeSourceReliability(evidence);
  const completeness = computeCompleteness(evidence);
  const recency = computeRecency(evidence, currentTime);
  const corroboration = computeCorroboration(evidence, allEvidence);

  const composite = Math.round(
    sourceReliability * QUALITY_WEIGHTS.source_reliability +
    completeness * QUALITY_WEIGHTS.completeness +
    recency * QUALITY_WEIGHTS.recency +
    corroboration * QUALITY_WEIGHTS.corroboration,
  );

  return {
    evidence_ref: `evidence:${evidence.id}`,
    source_reliability: sourceReliability,
    completeness,
    recency,
    corroboration,
    composite_score: composite,
    dimensions: [
      {
        name: 'source_reliability',
        score: sourceReliability,
        weight: QUALITY_WEIGHTS.source_reliability,
        reasoning: `${evidence.source_kind} via ${evidence.collection_method}`,
      },
      {
        name: 'completeness',
        score: completeness,
        weight: QUALITY_WEIGHTS.completeness,
        reasoning: completeness >= 80 ? 'Full observation' : completeness >= 50 ? 'Partial observation' : 'Minimal data',
      },
      {
        name: 'recency',
        score: recency,
        weight: QUALITY_WEIGHTS.recency,
        reasoning: evidence.freshness.freshness_state === FreshnessState.Fresh
          ? 'Fresh evidence'
          : evidence.freshness.freshness_state === FreshnessState.Stale
            ? 'Stale evidence'
            : 'Expired evidence',
      },
      {
        name: 'corroboration',
        score: corroboration,
        weight: QUALITY_WEIGHTS.corroboration,
        reasoning: corroboration >= 70 ? 'Multiple sources agree' : corroboration >= 40 ? 'Some corroboration' : 'Single source',
      },
    ],
  };
}

/**
 * Compute quality scores for all evidence in a cycle.
 */
export function assessAllEvidenceQuality(
  evidence: Evidence[],
  now?: Date,
): EvidenceQuality[] {
  return evidence.map(e => assessEvidenceQuality(e, evidence, now));
}

// ──────────────────────────────────────────────
// Dimension computations
// ──────────────────────────────────────────────

function computeSourceReliability(evidence: Evidence): number {
  const methodScore = COLLECTION_METHOD_RELIABILITY[evidence.collection_method] || 50;
  const sourceScore = SOURCE_KIND_RELIABILITY[evidence.source_kind] || 50;
  return Math.round((methodScore + sourceScore) / 2);
}

function computeCompleteness(evidence: Evidence): number {
  const payload = evidence.payload;

  switch (payload.type) {
    case 'http_response':
      // Complete if we have status, headers, and response time
      let httpScore = 40;
      if (payload.status_code > 0) httpScore += 20;
      if (payload.headers && Object.keys(payload.headers).length > 0) httpScore += 20;
      if (payload.response_time_ms > 0) httpScore += 20;
      return httpScore;

    case 'page_content':
      let pageScore = 30;
      if (payload.title) pageScore += 15;
      if (payload.meta_description) pageScore += 10;
      if (payload.h1) pageScore += 10;
      if (payload.form_count > 0) pageScore += 10;
      if (payload.script_count > 0) pageScore += 10;
      if (payload.internal_link_count > 0) pageScore += 15;
      return Math.min(100, pageScore);

    case 'policy_page':
      let policyScore = 30;
      if (payload.detected) policyScore += 30;
      if (payload.word_count && payload.word_count > 100) policyScore += 20;
      if (payload.confidence > 70) policyScore += 20;
      return policyScore;

    case 'checkout_indicator':
      return payload.confidence >= 70 ? 85 : payload.confidence >= 40 ? 60 : 40;

    case 'provider_indicator':
      return payload.confidence >= 70 ? 90 : payload.confidence >= 40 ? 65 : 45;

    case 'browser_navigation_trace':
      let browserScore = 50;
      if (payload.steps_executed > 0) browserScore += 20;
      if (payload.steps_succeeded === payload.steps_executed) browserScore += 20;
      if (payload.title) browserScore += 10;
      return browserScore;

    case 'authenticated_session_attempt':
      return payload.success ? 90 : 50;

    case 'authenticated_page_view':
      let authPageScore = 50;
      if (payload.title) authPageScore += 10;
      if (payload.page_type !== 'unknown') authPageScore += 15;
      if (payload.nav_items_count > 0) authPageScore += 15;
      authPageScore += 10; // always has base structured fields
      return Math.min(100, authPageScore);

    default:
      // For other types, use the existing quality_score or baseline
      return evidence.quality_score > 0 ? evidence.quality_score : 60;
  }
}

function computeRecency(evidence: Evidence, now: Date): number {
  const observedAt = evidence.freshness.observed_at.getTime();
  const freshUntil = evidence.freshness.fresh_until.getTime();
  const nowMs = now.getTime();

  if (nowMs <= freshUntil) {
    // Still fresh — score based on how much freshness window remains
    const totalWindow = freshUntil - observedAt;
    const remaining = freshUntil - nowMs;
    if (totalWindow <= 0) return 80;
    return Math.round(60 + 40 * (remaining / totalWindow));
  }

  // Past freshness window — degrade
  const overdueMs = nowMs - freshUntil;
  const overdueHours = overdueMs / (60 * 60 * 1000);

  if (overdueHours < 24) return 40;
  if (overdueHours < 72) return 20;
  return 5;
}

function computeCorroboration(evidence: Evidence, allEvidence: Evidence[]): number {
  if (allEvidence.length <= 1) return 30; // single source baseline

  // Find evidence that shares the same subject but from different sources
  const sameSubject = allEvidence.filter(e =>
    e.id !== evidence.id &&
    e.scoping.subject_ref === evidence.scoping.subject_ref,
  );

  if (sameSubject.length === 0) return 30;

  const differentSources = new Set(
    sameSubject
      .filter(e => e.source_kind !== evidence.source_kind)
      .map(e => e.source_kind),
  );

  // More diverse sources = higher corroboration
  if (differentSources.size >= 3) return 90;
  if (differentSources.size >= 2) return 70;
  if (differentSources.size >= 1) return 50;

  // Same source kind but multiple observations
  return 40;
}
