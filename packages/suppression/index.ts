export {
  evaluateSuppression,
  evaluateSuppressionInventory,
  computeSuppressionEffects,
} from './lifecycle';
export type {
  SuppressionEvaluation,
  SuppressionConfidenceEffect,
  SuppressionInventory,
  VisibilityImpact,
  SuppressionRecommendation,
} from './lifecycle';
export { applySuppressionEffects } from './confidence-applicator';
export type { SuppressionApplicationResult } from './confidence-applicator';
export { computeSuppressionGovernance } from './governance';
export type {
  SuppressionGovernanceResult,
  SuppressionBlindSpot,
  SuppressionPriorityAdjustment,
  SuppressionEscalation,
  SuppressionExplanation,
} from './governance';
