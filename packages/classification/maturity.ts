import type { Evidence } from '../domain';
import { EvidenceType } from '../domain/enums';
import type { PackEligibility } from './eligibility';

// ──────────────────────────────────────────────
// Maturity Stage Detection — Wave 3.11
//
// Classifies the workspace lifecycle stage based on
// evidence depth, behavioral data presence, and
// historical cycle activity.
//
// - launch:  First 1-2 audit cycles, no behavioral data, few resolved findings
// - growth:  Active traffic (behavioral sessions > 0), < 1000 sessions/month
// - scale:   High traffic, integrations connected, multiple cycles with resolved findings
// ──────────────────────────────────────────────

export type MaturityStage = 'launch' | 'growth' | 'scale';

export interface MaturityDetectionInput {
  evidence: Evidence[];
  pack_eligibility: PackEligibility;
  /** Number of completed audit cycles for this environment */
  cycle_count?: number;
  /** Number of resolved findings from change detection */
  resolved_count?: number;
  /** Whether any integrations (Shopify, Stripe, etc.) are connected */
  has_integrations?: boolean;
}

// NOTE: Currently unused — frontend derives equivalent data client-side from WorkspaceProjection[]
/**
 * Detect the maturity stage of a workspace based on evidence depth,
 * behavioral data, and historical activity signals.
 *
 * The stage drives which perspectives and lenses are most relevant
 * in the redesigned workspace UI.
 */
export function detectMaturityStage(input: MaturityDetectionInput): MaturityStage {
  const {
    evidence,
    pack_eligibility,
    cycle_count = 1,
    resolved_count = 0,
    has_integrations = false,
  } = input;

  // ── Behavioral session analysis ──
  let behavioralSessionCount = 0;
  let hasBehavioralEvidence = false;

  for (const e of evidence) {
    if (e.evidence_type !== EvidenceType.BehavioralSession) continue;
    const p = e.payload as { type?: string; session_count?: number; total_session_count?: number };
    if (p.type === 'behavioral_cohort' && typeof p.total_session_count === 'number') {
      behavioralSessionCount = Math.max(behavioralSessionCount, p.total_session_count);
      hasBehavioralEvidence = true;
    } else if (typeof p.session_count === 'number') {
      behavioralSessionCount = Math.max(behavioralSessionCount, p.session_count);
      hasBehavioralEvidence = true;
    }
  }

  // ── Integration detection (from evidence types) ──
  const hasIntegrationEvidence = has_integrations || evidence.some(
    e => e.evidence_type === EvidenceType.IntegrationSnapshot ||
         e.evidence_type === ('shopify_store_metrics' as any),
  );

  // ── Scale criteria ──
  // High traffic (>= 1000 sessions), integrations connected,
  // multiple cycles (>= 3) with resolved findings
  const highTraffic = behavioralSessionCount >= 1000;
  const multipleCycles = cycle_count >= 3;
  const hasResolvedFindings = resolved_count >= 1;

  if (highTraffic && hasIntegrationEvidence && multipleCycles && hasResolvedFindings) {
    return 'scale';
  }

  // ── Growth criteria ──
  // Active traffic (behavioral sessions > 0) but below scale thresholds
  if (hasBehavioralEvidence && behavioralSessionCount > 0) {
    return 'growth';
  }

  // ── Launch (default) ──
  // First 1-2 audit cycles, no behavioral data, few resolved findings
  return 'launch';
}
