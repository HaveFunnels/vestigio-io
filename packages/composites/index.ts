// ──────────────────────────────────────────────
// Wave 3.4: Composite Findings
//
// Composite analyses that enrich existing decisions rather
// than creating new findings. They run AFTER the core pipeline
// and consume its results.
// ──────────────────────────────────────────────

export { computeTrustSurfaceScore } from './trust-surface-score';
export type { TrustSurfaceScore, TrustGrade } from './trust-surface-score';

export { detectBlastRadiusRegression } from './blast-radius-regression';
export type { BlastRadiusAlert, BlastRadiusSeverity } from './blast-radius-regression';

export { compressOpportunities } from './opportunity-compression';
export type { OpportunityCluster, OpportunityCompressionResult, CompressibleFinding } from './opportunity-compression';
