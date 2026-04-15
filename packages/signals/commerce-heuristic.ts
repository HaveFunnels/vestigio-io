import type { Evidence } from '../domain';

// ──────────────────────────────────────────────
// Commerce Heuristic Signals
//
// Shape-only module (Phase 1.3). Phase 2.4 ships the extractors.
//
// Why this exists: seven Shopify-driven inferences (cart abandonment
// revenue leak, high refund rate, single payment gateway risk, discount
// abuse, low repeat purchase, promoted-product out-of-stock, dead-
// weight products) only fire today when IntegrationConnection(shopify)
// is connected. Stores on Nuvemshop, WooCommerce, custom stacks, or
// stores that simply haven't integrated yet get a silent dark zone.
//
// The heuristic path uses cheaper signals — form submission failure
// ratios, checkout-step pixel dropoff, support ticket volume, policy
// mentions — to produce a LOW-CONFIDENCE version of the same finding.
// It is NOT a replacement for connected Shopify data (which is
// data_driven with higher confidence multiplier). It's a fallback so
// non-integrated stores see the findings at all with a visible
// confidence penalty and a banner encouraging integration.
//
// Phase 1.3 locks in the shape so Phase 2.4 can wire extractors
// without refactoring consumers. Inference engine consumers should
// import the types from here and treat extractor outputs as optional
// — the field being absent means "we could not heuristically
// determine this" and the consumer should not emit the finding.
// ──────────────────────────────────────────────

export type HeuristicBasis =
	| 'form_submit_failure_ratio'
	| 'checkout_pixel_dropoff'
	| 'support_ticket_ratio'
	| 'policy_mention_density'
	| 'payment_method_probe'
	| 'price_structure_probe'
	| 'sitemap_product_coverage'
	| 'unknown';

export interface CheckoutAbandonmentHeuristic {
	/** Estimated abandonment rate, 0..1. Example: 0.72 = 72%. */
	rate: number;
	/** Which underlying signal produced the estimate. */
	basis: HeuristicBasis;
	/**
	 * How many sessions / form attempts / requests the estimate is
	 * based on. Consumers should suppress the finding when this falls
	 * below a minimum sample floor (Phase 2.4 sets the constant).
	 */
	sample_size: number;
}

export interface RefundRateHeuristic {
	/** Estimated chargeback/refund rate baseline, 0..1. */
	rate: number;
	basis: HeuristicBasis;
	/** Number of policy mentions or ticket rows the estimate saw. */
	sample_size: number;
}

export interface PaymentGatewayHeuristic {
	/**
	 * How many distinct payment gateways were detected on the checkout
	 * surface. Single-gateway risk fires when this === 1 AND confidence
	 * is above a floor.
	 */
	gateway_count: number;
	basis: HeuristicBasis;
	/** The gateway names we detected. Helpful for cause text. */
	detected_gateways: string[];
}

export interface DiscountAbuseHeuristic {
	/**
	 * Ratio of cart/pricing endpoints that accepted arbitrary discount
	 * parameters without validation. 0..1. High = probable abuse
	 * surface.
	 */
	exposure: number;
	basis: HeuristicBasis;
	/** Number of endpoints probed to produce the ratio. */
	sample_size: number;
}

export interface RepeatPurchaseHeuristic {
	/** Estimated repeat purchase rate, 0..1. */
	rate: number;
	basis: HeuristicBasis;
	sample_size: number;
}

/**
 * Aggregate bag of all commerce heuristics an extractor run can
 * produce. Every field is optional — consumers must null-check
 * before using. A field being absent means "we could not determine
 * this from the available signals", NOT "the signal is zero".
 */
export interface CommerceHeuristicSignals {
	checkout_abandonment?: CheckoutAbandonmentHeuristic;
	refund_rate?: RefundRateHeuristic;
	payment_gateway?: PaymentGatewayHeuristic;
	discount_abuse?: DiscountAbuseHeuristic;
	repeat_purchase?: RepeatPurchaseHeuristic;
	/**
	 * Whether a connected commerce integration (Shopify, Nuvemshop)
	 * was available and fresh enough that the heuristic path should
	 * SUPPRESS its own emissions to avoid duplicate / conflicting
	 * findings. Phase 2.4 sets this true when any IntegrationConnection
	 * of provider in {shopify, nuvemshop} has status=connected and
	 * lastSyncedAt within the cycle's freshness window.
	 */
	suppressed_by_integration?: boolean;
}

/**
 * Phase 1.3 stub. Returns an empty bag so consumers can wire the
 * extractor call site now without gating on Phase 2.4 implementation.
 * Phase 2.4 replaces this with the real extractor.
 */
export function extractCommerceHeuristicSignals(
	_evidence: Evidence[],
): CommerceHeuristicSignals {
	return {};
}
