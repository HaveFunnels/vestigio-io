import { Inference } from '../domain';
import {
  QuantifiedValueCase,
  EstimatedImpact,
  BusinessInputs,
  ImpactSummary,
} from './types';
import { IMPACT_BASELINES, POSITIVE_IMPACT_BASELINES, getBaselineForKey, BaselineEntry } from './baselines';

// ──────────────────────────────────────────────
// Impact Estimation Engine
//
// Translates inferences → quantified financial estimates.
// ALWAYS returns something quantifiable.
// NEVER returns null impact.
// If low certainty → wider range + lower confidence.
// ──────────────────────────────────────────────

// Default business inputs when no onboarding data is available
const FALLBACK_INPUTS: BusinessInputs = {
  monthly_revenue: 50000,      // conservative SMB assumption
  average_order_value: 80,
  monthly_transactions: 625,
  conversion_rate: 0.02,
  chargeback_rate: 0.01,       // 1% baseline
  churn_rate: 0.05,
};

/**
 * Determine data quality tier from BusinessInputs.
 * 'data_driven' = real integration data (e.g. Shopify),
 * 'mixed' = partial real data or manual onboarding,
 * 'heuristic' = fallback estimates only.
 */
function classifyInputQuality(inputs: BusinessInputs | null): {
  basis_type: 'data_driven' | 'mixed' | 'heuristic';
  confidenceMultiplier: number;
} {
  if (!inputs) return { basis_type: 'heuristic', confidenceMultiplier: 0.6 };

  const coreFields = [inputs.monthly_revenue, inputs.average_order_value, inputs.monthly_transactions];
  const realFieldCount = coreFields.filter(v => v !== null).length;

  if (realFieldCount >= 3) {
    return { basis_type: 'data_driven', confidenceMultiplier: 1.2 };
  }
  if (realFieldCount >= 1) {
    return { basis_type: 'mixed', confidenceMultiplier: 1.0 };
  }
  return { basis_type: 'heuristic', confidenceMultiplier: 0.6 };
}

/**
 * Phase 4A.1: Operational amplifiers from integration data.
 * These amplify or dampen impact for specific finding categories
 * based on real operational signals (cancellations, discounts, etc.)
 */
export interface OperationalAmplifiers {
  /** Amplifies checkout-related findings (high cancellation) */
  cancellation_amplifier?: number;
  /** Amplifies pricing/abuse findings (high discount usage) */
  discount_abuse_amplifier?: number;
  /** Amplifies economic leakage findings (refund + discount compound) */
  economic_leakage_amplifier?: number;
  /** Amplifies payment dependency findings (payment method concentration) */
  payment_concentration_amplifier?: number;
  /** Amplifies checkout reliability findings (transaction failure) */
  transaction_failure_amplifier?: number;
}

// Mapping: which inference categories are amplified by which operational signal
const AMPLIFIER_MAPPING: Record<string, keyof OperationalAmplifiers> = {
  // Checkout-related → cancellation amplifier
  checkout_api_latency_degraded: 'cancellation_amplifier',
  checkout_integrity: 'cancellation_amplifier',
  checkout_brittle_third_party: 'cancellation_amplifier',
  purchase_blocked_failing_requests: 'cancellation_amplifier',
  purchase_before_deps_ready: 'cancellation_amplifier',
  // Pricing/abuse → discount amplifier
  promotion_logic_exposed: 'discount_abuse_amplifier',
  cart_variant_weak_control: 'discount_abuse_amplifier',
  hidden_discount_refund_route: 'discount_abuse_amplifier',
  economic_exploitation_active: 'discount_abuse_amplifier',
  // Economic leakage → compound amplifier
  revenue_leakage: 'economic_leakage_amplifier',
  commercial_path_abuse_friendly: 'economic_leakage_amplifier',
  alternate_pricing_safeguard_bypass: 'economic_leakage_amplifier',
  // Payment dependency → concentration amplifier
  checkout_provider_fragmented: 'payment_concentration_amplifier',
  checkout_provider_path_weak: 'payment_concentration_amplifier',
  // Transaction reliability → failure amplifier
  runtime_errors_interrupt_purchase: 'transaction_failure_amplifier',
  payment_surface_compromised: 'transaction_failure_amplifier',
};

/**
 * Funnel stage multipliers — findings deeper in the funnel have exponentially
 * higher revenue impact because they affect buyers closer to conversion.
 * A checkout friction issue is worth 2.5x a homepage copy issue.
 */
export interface FunnelStageMultipliers {
  /** Maps surface path → multiplier (e.g., "/pricing" → 2.0) */
  byPath: Map<string, number>;
  /** Default multiplier when path not in map */
  default: number;
}

/**
 * @param profileConfidencePenalty - multiplier (0..1) from business profile freshness.
 * @param amplifiers - optional operational amplifiers from integration data.
 * @param currency - ISO 4217 currency code (default: 'USD'). Passed through to EstimatedImpact.
 * @param funnelMultipliers - optional funnel stage multipliers by surface path.
 */
export function estimateImpact(
  inferences: Inference[],
  inputs: BusinessInputs | null,
  profileConfidencePenalty: number = 1.0,
  amplifiers?: OperationalAmplifiers,
  currency: string = 'USD',
  funnelMultipliers?: FunnelStageMultipliers,
): QuantifiedValueCase[] {
  const business = inputs || FALLBACK_INPUTS;
  const inputQuality = classifyInputQuality(inputs);
  const valueCases: QuantifiedValueCase[] = [];

  for (const inf of inferences) {
    // Skip inferences that yielded no conclusion — nothing to quantify.
    if (inf.conclusion_value === 'none') continue;

    const isPositive =
      inf.conclusion_value === 'false' || inf.conclusion_value === 'absent';

    // Phase 1.2: positive findings can emit a retention case when we
    // have a counterfactual baseline for this inference_key. Without
    // a baseline, fall through without emitting (the projection layer
    // still renders the positive check qualitatively).
    const baseline = isPositive
      ? POSITIVE_IMPACT_BASELINES[inf.inference_key]
      : (IMPACT_BASELINES[inf.inference_key] || getBaselineForKey(inf.inference_key));
    if (!baseline) continue;

    // Loss path keeps the existing low-confidence filter; retention
    // findings bypass it because the original filter was specifically
    // about noise in weak-positive loss signals, which doesn't apply
    // when we're quantifying a control that's reported as working.
    if (
      !isPositive &&
      inf.conclusion_value === 'true' &&
      inf.severity_hint === null &&
      inf.confidence < 40
    ) {
      continue;
    }

    const severity = mapSeverity(inf);
    const pctRange = baseline[severity];

    const isFallback = inputQuality.basis_type === 'heuristic';
    const estimated = computeEstimate(pctRange, baseline.base_metric, business, isFallback, currency);

    // Phase 4A.1: Apply operational amplifier if available for this
    // inference — only on loss-modeled findings. A working control
    // isn't amplified by an operational signal like "high cancellation
    // rate" — that signal makes the problem you still have worse, not
    // the problem you solved worth more.
    if (!isPositive) {
      const ampKey = AMPLIFIER_MAPPING[inf.inference_key];
      const ampValue = ampKey && amplifiers ? (amplifiers[ampKey] ?? 1.0) : 1.0;
      if (ampValue !== 1.0) {
        estimated.range.min = Math.round(estimated.range.min * ampValue);
        estimated.range.max = Math.round(estimated.range.max * ampValue);
        estimated.monthly_revenue_delta = Math.round((estimated.range.min + estimated.range.max) / 2);
      }
    }

    // Funnel stage multiplier: findings deeper in the funnel (checkout, pricing)
    // have proportionally higher impact than awareness-stage findings.
    // Lookup chain: path_scope → first signal_ref path → default
    if (funnelMultipliers && !isPositive) {
      let funnelMult = funnelMultipliers.default;
      const surfacePath = inf.scoping?.path_scope;
      if (surfacePath && funnelMultipliers.byPath.has(surfacePath)) {
        funnelMult = funnelMultipliers.byPath.get(surfacePath)!;
      } else {
        // Try matching via signal_refs (evidence URLs/paths stored as "type:value" strings)
        for (const ref of inf.signal_refs ?? []) {
          // signal_refs format: "evidence:url" or just a URL/path
          const refValue = ref.includes(':') ? ref.split(':').slice(1).join(':') : ref;
          if (refValue && funnelMultipliers.byPath.has(refValue)) {
            funnelMult = funnelMultipliers.byPath.get(refValue)!;
            break;
          }
          // Try just the pathname portion
          try {
            const pathname = new URL(refValue).pathname;
            if (funnelMultipliers.byPath.has(pathname)) {
              funnelMult = funnelMultipliers.byPath.get(pathname)!;
              break;
            }
          } catch { /* not a URL */ }
        }
      }
      if (funnelMult !== 1.0) {
        estimated.range.min = Math.round(estimated.range.min * funnelMult);
        estimated.range.max = Math.round(estimated.range.max * funnelMult);
        estimated.monthly_revenue_delta = Math.round((estimated.range.min + estimated.range.max) / 2);
      }
    }

    // Adjust confidence based on data quality + profile freshness
    const finalConfidence = Math.min(100, Math.round(
      inf.confidence * inputQuality.confidenceMultiplier * profileConfidencePenalty,
    ));

    valueCases.push({
      cause: baseline.cause,
      effect: baseline.effect,
      impact_type: baseline.impact_category,
      estimated_impact: estimated,
      reasoning: inf.reasoning,
      basis_type: inputQuality.basis_type,
      confidence: finalConfidence,
      inference_key: inf.inference_key,
      impact_role: isPositive ? 'retention' : 'loss',
    });
  }

  return valueCases;
}

export function summarizeImpact(valueCases: QuantifiedValueCase[], currency: string = 'USD'): ImpactSummary {
  if (valueCases.length === 0) {
    return {
      total_monthly_loss_range: { min: 0, max: 0 },
      total_monthly_loss_mid: 0,
      highest_impact_issue: null,
      highest_impact_value: 0,
      issue_count: 0,
      average_confidence: 0,
      currency,
      total_monthly_retention_range: { min: 0, max: 0 },
      total_monthly_retention_mid: 0,
      retention_issue_count: 0,
      loss_issue_count: 0,
    };
  }

  let totalLossMin = 0;
  let totalLossMax = 0;
  let totalRetentionMin = 0;
  let totalRetentionMax = 0;
  let highestValue = 0;
  let highestIssue: string | null = null;
  let totalConfidence = 0;
  let lossCount = 0;
  let retentionCount = 0;

  for (const vc of valueCases) {
    totalConfidence += vc.confidence;
    const role = vc.impact_role || 'loss'; // legacy entries with no role default to loss

    if (role === 'retention') {
      totalRetentionMin += vc.estimated_impact.range.min;
      totalRetentionMax += vc.estimated_impact.range.max;
      retentionCount++;
    } else {
      totalLossMin += vc.estimated_impact.range.min;
      totalLossMax += vc.estimated_impact.range.max;
      lossCount++;

      const mid = (vc.estimated_impact.range.min + vc.estimated_impact.range.max) / 2;
      if (mid > highestValue) {
        highestValue = mid;
        highestIssue = vc.cause;
      }
    }
  }

  return {
    total_monthly_loss_range: { min: Math.round(totalLossMin), max: Math.round(totalLossMax) },
    total_monthly_loss_mid: Math.round((totalLossMin + totalLossMax) / 2),
    highest_impact_issue: highestIssue,
    highest_impact_value: Math.round(highestValue),
    issue_count: valueCases.length,
    average_confidence: Math.round(totalConfidence / valueCases.length),
    currency: valueCases[0]?.estimated_impact.currency || 'USD',
    total_monthly_retention_range: { min: Math.round(totalRetentionMin), max: Math.round(totalRetentionMax) },
    total_monthly_retention_mid: Math.round((totalRetentionMin + totalRetentionMax) / 2),
    retention_issue_count: retentionCount,
    loss_issue_count: lossCount,
  };
}

// ──────────────────────────────────────────────
// Internal computation
// ──────────────────────────────────────────────

function computeEstimate(
  pctRange: { min: number; max: number },
  baseMetric: string,
  business: BusinessInputs,
  isFallback: boolean,
  currency: string = 'USD',
): EstimatedImpact {
  const revenue = business.monthly_revenue ?? FALLBACK_INPUTS.monthly_revenue!;
  const transactions = business.monthly_transactions ?? FALLBACK_INPUTS.monthly_transactions!;
  const chargebackRate = business.chargeback_rate ?? FALLBACK_INPUTS.chargeback_rate!;

  let baseValue: number;
  switch (baseMetric) {
    case 'revenue':
      baseValue = revenue;
      break;
    case 'transactions':
      baseValue = transactions * (business.average_order_value ?? FALLBACK_INPUTS.average_order_value!);
      break;
    case 'chargeback_rate':
      // Chargeback impact = incremental chargeback rate × revenue
      // e.g., 5% increase in chargeback rate on $50k = $50k × 0.05 = $2,500/mo
      baseValue = revenue;
      break;
    case 'conversion_rate':
      baseValue = revenue;
      break;
    default:
      baseValue = revenue;
  }

  const minDelta = baseValue * pctRange.min;
  const maxDelta = baseValue * pctRange.max;

  // If using fallback inputs, widen the range symmetrically around the midpoint
  // to reflect uncertainty without shifting the center estimate.
  const uncertainty = isFallback ? 1.5 : 1.0;
  const midDelta = (minDelta + maxDelta) / 2;
  const halfRange = (maxDelta - minDelta) / 2;
  const adjustedHalfRange = halfRange * uncertainty;
  const adjustedMin = Math.round(midDelta - adjustedHalfRange);
  const adjustedMax = Math.round(midDelta + adjustedHalfRange);

  const midPct = (pctRange.min + pctRange.max) / 2;

  return {
    monthly_revenue_delta: Math.round((adjustedMin + adjustedMax) / 2),
    percentage_delta: midPct,
    range: { min: adjustedMin, max: adjustedMax },
    currency,
  };
}

function mapSeverity(inf: Inference): 'high' | 'medium' | 'low' {
  const hint = inf.severity_hint;
  if (hint === 'high' || inf.conclusion_value === 'high' || inf.conclusion_value === 'weak') return 'high';
  if (hint === 'medium' || inf.conclusion_value === 'medium' || inf.conclusion_value === 'fragile') return 'medium';
  return 'low';
}
