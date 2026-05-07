export * from './types';
export { computeClassification, extractClassificationInput } from './engine';
export {
  isSaasPackEligible,
  isAuthenticatedVerificationEligible,
  isCheckoutAnalysisEligible,
  isChargebackRelevant,
  isPaymentHealthEligible,
  computePackEligibility,
  type EligibilityResult,
  type PackEligibility,
} from './eligibility';
export { detectMaturityStage, type MaturityStage, type MaturityDetectionInput } from './maturity';
export {
  classifyPage,
  classifyPages,
  type SurfacePageType,
  type ClassificationVote,
  type PageClassificationResult,
  type PageForClassification,
} from './page-classifier';
export {
  resolveFunnelModel,
  getStageForPageType,
  buildStageOrderMap,
  serializeStageDefinitions,
  deserializeStageDefinitions,
  type FunnelStageDefinition,
  type ResolvedFunnelModel,
} from './funnel-resolver';
export {
  scoreEdge,
  scoreEdges,
  type LinkIntent,
  type LinkPosition,
  type EdgeScore,
  type SurfaceRelationForScoring,
} from './edge-scorer';
