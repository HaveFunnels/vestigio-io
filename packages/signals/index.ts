export { extractSignals } from './engine';
export { extractSaasSignals } from './saas-signals';
// Wave 20.3 — canonical createSignal factory. Was previously
// triple-implemented (this file's create.ts, a local copy in
// engine.ts:5710, a local copy in workers/.../static-checks.ts:822).
// All three were behaviorally identical. The two copies are removed
// in this wave; this is the single source.
export { createSignal } from './create';
export {
	extractCommerceHeuristicSignals,
	type CommerceHeuristicSignals,
	type CheckoutAbandonmentHeuristic,
	type RefundRateHeuristic,
	type PaymentGatewayHeuristic,
	type DiscountAbuseHeuristic,
	type RepeatPurchaseHeuristic,
	type HeuristicBasis,
} from './commerce-heuristic';
