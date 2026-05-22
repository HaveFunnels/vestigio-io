// ──────────────────────────────────────────────
// Inference Engine — composite interpretations from signals
//
// Deterministic: scoped ID generator, no global state. This file is
// orchestrator-only. Each computeXPack(input) lives in its own
// packs/<name>.ts module; see packages/inference/packs/.
// ──────────────────────────────────────────────

import { Signal, Inference, Scoping, IdGenerator } from '../domain';
import type { PackInput } from './shared/types';

import { computeScaleReadinessPack } from './packs/scale-readiness';
import { computeRevenueIntegrityPack } from './packs/revenue-integrity';
import { computeChargebackResiliencePack } from './packs/chargeback-resilience';
import { computeEvidenceDerivedPack } from './packs/evidence-derived';
import { computeChannelIntegrityPack } from './packs/channel-integrity';
import { computeDeepDiscoveryPack } from './packs/deep-discovery';
import { computeNetworkAnalysisPack } from './packs/network-analysis';
import { computeDiscoverabilityPack } from './packs/discoverability';
import { computeBrandIntegrityPack } from './packs/brand-integrity';
import { computeBehavioralPack } from './packs/behavioral';
import { computeFirstImpressionRevenuePack } from './packs/first-impression-revenue';
import { computeActionValueMapPack } from './packs/action-value-map';
import { computeAcquisitionIntegrityPack } from './packs/acquisition-integrity';
import { computeMobileRevenuePack } from './packs/mobile-revenue';
import { computeFrictionTaxPack } from './packs/friction-tax';
import { computeTrustRevenueGapPack } from './packs/trust-revenue-gap';
import { computePathEfficiencyPack } from './packs/path-efficiency';
import { computeSecurityPosturePack } from './packs/security-posture';
import { computeCopyAlignmentPack } from './packs/copy-alignment';
import { computeContentFreshnessPack } from './packs/content-freshness';
import { computeCommerceContextPack } from './packs/commerce-context';
import { computeMonetizationExtensionsPack } from './packs/monetization-extensions';
import { computeWave4ExtensionsPack } from './packs/wave-4-extensions';

/**
 * Pack-level execution gate. When `skipPacks` is provided, the engine
 * skips the named compute*Pack(input) calls entirely — this is the
 * hook that lets `recomputeAll` (Wave 20.7) gate inference execution
 * by `pack_eligibility`. Today the parameter is optional and unused
 * by recompute, so behavior is unchanged. Wave 20.7's `engine.run`
 * API will compute pack_eligibility upfront and pass the skip set in.
 *
 * Pack ids match the camelCase suffix of the compute function name
 * (e.g. `'scaleReadiness'` for computeScaleReadinessPack). The full
 * registry below documents every gate-able pack so a typo is obvious
 * at the call site.
 */
export const INFERENCE_PACK_IDS = [
  'scaleReadiness',
  'revenueIntegrity',
  'chargebackResilience',
  'evidenceDerived',
  'channelIntegrity',
  'deepDiscovery',
  'networkAnalysis',
  'discoverability',
  'brandIntegrity',
  'behavioral',
  'firstImpressionRevenue',
  'actionValueMap',
  'acquisitionIntegrity',
  'mobileRevenue',
  'frictionTax',
  'trustRevenueGap',
  'pathEfficiency',
  'securityPosture',
  'copyAlignment',
  'contentFreshness',
  'commerceContext',
  'monetizationExtensions',
  'wave4Extensions',
] as const;
export type InferencePackId = (typeof INFERENCE_PACK_IDS)[number];

export function computeInferences(
  signals: Signal[],
  scoping: Scoping,
  cycle_ref: string,
  skipPacks?: ReadonlySet<InferencePackId>,
): Inference[] {
  const ids = new IdGenerator('inf');

  // Single-pass index build. Previous version iterated `signals` twice
  // (byAttribute + byKey). At ~10k signals per audit cycle this saved
  // one full O(N) walk in the hottest pre-pack path.
  const byAttribute = new Map<string, Signal[]>();
  const byKey = new Map<string, Signal>();
  for (const s of signals) {
    const list = byAttribute.get(s.attribute);
    if (list) list.push(s);
    else byAttribute.set(s.attribute, [s]);
    byKey.set(s.signal_key, s);
  }
  const first = (attr: string): Signal | undefined => {
    const list = byAttribute.get(attr);
    return list ? list[0] : undefined;
  };

  const packInput: PackInput = {
    signals, byAttribute, byKey, first, scoping, cycle_ref, ids,
  };

  const inferences: Inference[] = [];
  const run = (id: InferencePackId, fn: (i: PackInput) => Inference[]): void => {
    if (skipPacks?.has(id)) return;
    inferences.push(...fn(packInput));
  };

  run('scaleReadiness', computeScaleReadinessPack);
  run('revenueIntegrity', computeRevenueIntegrityPack);
  run('chargebackResilience', computeChargebackResiliencePack);
  run('evidenceDerived', computeEvidenceDerivedPack);
  run('channelIntegrity', computeChannelIntegrityPack);
  run('deepDiscovery', computeDeepDiscoveryPack);
  run('networkAnalysis', computeNetworkAnalysisPack);
  run('discoverability', computeDiscoverabilityPack);
  run('brandIntegrity', computeBrandIntegrityPack);
  run('behavioral', computeBehavioralPack);
  run('firstImpressionRevenue', computeFirstImpressionRevenuePack);
  run('actionValueMap', computeActionValueMapPack);
  run('acquisitionIntegrity', computeAcquisitionIntegrityPack);
  run('mobileRevenue', computeMobileRevenuePack);
  run('frictionTax', computeFrictionTaxPack);
  run('trustRevenueGap', computeTrustRevenueGapPack);
  run('pathEfficiency', computePathEfficiencyPack);
  run('securityPosture', computeSecurityPosturePack);
  run('copyAlignment', computeCopyAlignmentPack);
  run('contentFreshness', computeContentFreshnessPack);
  run('commerceContext', computeCommerceContextPack);
  run('monetizationExtensions', computeMonetizationExtensionsPack);
  run('wave4Extensions', computeWave4ExtensionsPack);

  return inferences;
}
