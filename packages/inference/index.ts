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
