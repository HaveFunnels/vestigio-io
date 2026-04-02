export * from './types';
export { resolveTruth, resolveClaims, detectContradictions } from './resolver';
export { harmonizeSignals } from './signal-harmonizer';
export type { HarmonizationResult } from './signal-harmonizer';
export { guardTruthConsistency, assertTruthResolved, getContradictionContext } from './consistency-guard';
export type {
  TruthMetadata,
  SignalWithTruth,
  TruthConsistencyResult,
  UnresolvedContradiction,
  ConsistencySummary,
  ContradictionContext,
} from './consistency-guard';
