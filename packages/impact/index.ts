export { estimateImpact, summarizeImpact } from './engine';
export type { OperationalAmplifiers, FunnelStageMultipliers } from './engine';
export { IMPACT_BASELINES, getBaselineForKey } from './baselines';
export { currencyFromLocale } from './types';
export * from './types';
export {
	estimateMiniImpact,
	summarizeMiniImpact,
	formatBRL,
} from './mini-impact';
export type {
	MiniImpact,
	MiniBusinessInputs,
	MiniImpactSeverity,
} from './mini-impact';
