export { computeInferences } from './engine';
export { computeSaasInferences } from './saas-inference';
export { computeVerticalInferences } from './vertical-inference';
export { computeFunnelMomentInferences } from './funnel-moment-inference';
export { computeFunnelGapInferences, type FunnelGapInput } from './funnel-gap-inference';
export { computeFormFlowInferences, type FormFlowInput } from './form-flow-inference';
export { computeCrossDomainInferences, computeSubdomainCrossDomainInferences } from './cross-domain-inference';
export { computeTripleSourceInferences } from './triple-source-inference';
// Wave 20.3 — added to inference/index.ts so all inference modules
// route through the same public surface. Previously bypassed by
// packages/workspace/recompute.ts which imported them directly.
export { computeCrossPackSynthesis } from './cross-pack-synthesis';
export { computeExternalReconInferences } from './external-recon-inference';
// Wave 22.5 — surface_kind stamping for the inference layer. Mirrors
// the signal-side stamper: each inference gets surface_kind derived
// from the aggregate of its cited signals.
export { stampInferenceSurfaceKinds } from './surface-stamp';
// Wave 22.5 Tier 2 — surface gate. Drops or flags inferences whose
// stamped surface_kind doesn't match the declared accepted_surfaces
// for that inference_key.
export { applySurfaceGate, type SurfaceGateMode, type SurfaceGateResult } from './surface-gate';
export { INFERENCE_ACCEPTED_SURFACES, isSurfaceAccepted } from './accepted-surfaces';
