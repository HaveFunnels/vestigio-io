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

export function computeInferences(
  signals: Signal[],
  scoping: Scoping,
  cycle_ref: string,
): Inference[] {
  const ids = new IdGenerator('inf');

  // Index signals by attribute (supports multiple signals per attribute).
  const byAttribute = new Map<string, Signal[]>();
  for (const s of signals) {
    const list = byAttribute.get(s.attribute) || [];
    list.push(s);
    byAttribute.set(s.attribute, list);
  }
  const first = (attr: string): Signal | undefined => {
    const list = byAttribute.get(attr);
    return list ? list[0] : undefined;
  };

  // Index by signal_key for direct lookups.
  const byKey = new Map<string, Signal>();
  for (const s of signals) {
    byKey.set(s.signal_key, s);
  }

  const packInput: PackInput = {
    signals, byAttribute, byKey, first, scoping, cycle_ref, ids,
  };

  const inferences: Inference[] = [];

  inferences.push(...computeScaleReadinessPack(packInput));
  inferences.push(...computeRevenueIntegrityPack(packInput));
  inferences.push(...computeChargebackResiliencePack(packInput));
  inferences.push(...computeEvidenceDerivedPack(packInput));
  inferences.push(...computeChannelIntegrityPack(packInput));
  inferences.push(...computeDeepDiscoveryPack(packInput));
  inferences.push(...computeNetworkAnalysisPack(packInput));
  inferences.push(...computeDiscoverabilityPack(packInput));
  inferences.push(...computeBrandIntegrityPack(packInput));
  inferences.push(...computeBehavioralPack(packInput));
  inferences.push(...computeFirstImpressionRevenuePack(packInput));
  inferences.push(...computeActionValueMapPack(packInput));
  inferences.push(...computeAcquisitionIntegrityPack(packInput));
  inferences.push(...computeMobileRevenuePack(packInput));
  inferences.push(...computeFrictionTaxPack(packInput));
  inferences.push(...computeTrustRevenueGapPack(packInput));
  inferences.push(...computePathEfficiencyPack(packInput));
  inferences.push(...computeSecurityPosturePack(packInput));
  inferences.push(...computeCopyAlignmentPack(packInput));
  inferences.push(...computeContentFreshnessPack(packInput));
  inferences.push(...computeCommerceContextPack(packInput));
  inferences.push(...computeMonetizationExtensionsPack(packInput));
  inferences.push(...computeWave4ExtensionsPack(packInput));

  return inferences;
}
