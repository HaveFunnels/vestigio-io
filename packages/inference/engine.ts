import {
  Signal,
  Inference,
  InferenceCategory,
  FreshnessState,
  Scoping,
  IdGenerator,
  makeRef,
} from '../domain';
// Wave 20.6 — shared inference builders extracted from this file.
import { createInference, inferCohort } from './shared/builders';
import type { PackInput } from './shared/types';
// Wave 20.6 — pack files migrated from inline definitions in this file.
import { computeFirstImpressionRevenuePack } from './packs/first-impression-revenue';
import { computeActionValueMapPack } from './packs/action-value-map';
import { computeAcquisitionIntegrityPack } from './packs/acquisition-integrity';
import { computeMobileRevenuePack } from './packs/mobile-revenue';
import { computeFrictionTaxPack } from './packs/friction-tax';
import { computeTrustRevenueGapPack } from './packs/trust-revenue-gap';
import { computePathEfficiencyPack } from './packs/path-efficiency';
import { computeSecurityPosturePack } from './packs/security-posture';
import { computeScaleReadinessPack } from './packs/scale-readiness';
import { computeRevenueIntegrityPack } from './packs/revenue-integrity';
import { computeChargebackResiliencePack } from './packs/chargeback-resilience';
import { computeBehavioralPack } from './packs/behavioral';
import { computeBrandIntegrityPack } from './packs/brand-integrity';
import { computeDiscoverabilityPack } from './packs/discoverability';
import { computeChannelIntegrityPack } from './packs/channel-integrity';
import { computeContentFreshnessPack } from './packs/content-freshness';
import { computeCopyAlignmentPack } from './packs/copy-alignment';
import { computeCommerceContextPack } from './packs/commerce-context';
import { computeWave4ExtensionsPack } from './packs/wave-4-extensions';
import { computeMonetizationExtensionsPack } from './packs/monetization-extensions';
import { computeDeepDiscoveryPack } from './packs/deep-discovery';
import { computeNetworkAnalysisPack } from './packs/network-analysis';
import { computeEvidenceDerivedPack } from './packs/evidence-derived';

// ──────────────────────────────────────────────
// Inference Engine — composite interpretations from signals
// Deterministic: scoped ID generator, no global state
// ──────────────────────────────────────────────

export function computeInferences(
  signals: Signal[],
  scoping: Scoping,
  cycle_ref: string,
): Inference[] {
  const inferences: Inference[] = [];
  const ids = new IdGenerator('inf');

  // Index signals by attribute — supports multiple signals per attribute
  const byAttribute = new Map<string, Signal[]>();
  for (const s of signals) {
    const list = byAttribute.get(s.attribute) || [];
    list.push(s);
    byAttribute.set(s.attribute, list);
  }

  // Helper: get first signal for an attribute (most common case)
  const first = (attr: string): Signal | undefined => {
    const list = byAttribute.get(attr);
    return list ? list[0] : undefined;
  };

  // Also index by signal_key for direct lookups
  const byKey = new Map<string, Signal>();
  for (const s of signals) {
    byKey.set(s.signal_key, s);
  }

  // Wave 20.6 — PackInput is the uniform per-pack input shape.
  // Constructed once, passed to every pack/<name>.ts module's
  // entry function. Old inline inference functions still take the
  // legacy (first, byKey, signals, scoping, cycle_ref, ids) tuple
  // until they're migrated into pack files.
  const packInput: PackInput = {
    signals, byAttribute, byKey, first, scoping, cycle_ref, ids,
  };

  // Scale readiness (Wave 20.6 — migrated to packs/scale-readiness.ts)
  inferences.push(...computeScaleReadinessPack(packInput));

  // Revenue inference rules (revenue_integrity)
  // Revenue integrity (Wave 20.6 — migrated to packs/revenue-integrity.ts)
  inferences.push(...computeRevenueIntegrityPack(packInput));

  // Chargeback inference rules (chargeback_resilience)
  // Chargeback resilience (Wave 20.6 — migrated to packs/chargeback-resilience.ts)
  inferences.push(...computeChargebackResiliencePack(packInput));

  // Phase 30 / 30B / 2 / 2B / 2C bundle (migrated to packs/evidence-derived.ts)
  inferences.push(...computeEvidenceDerivedPack(packInput));

  // Phase 3A: Channel integrity inferences
  // Channel integrity (Wave 20.6 — migrated to packs/channel-integrity.ts)
  inferences.push(...computeChannelIntegrityPack(packInput));

  // Phase 3B: Deep discovery inferences from Katana evidence (migrated to packs/deep-discovery.ts)
  inferences.push(...computeDeepDiscoveryPack(packInput));

  // Phase 2D: Network analysis inferences (migrated to packs/network-analysis.ts)
  inferences.push(...computeNetworkAnalysisPack(packInput));

  // Discoverability + Brand Integrity (Wave 20.6 — migrated to packs/)
  inferences.push(...computeDiscoverabilityPack(packInput));
  inferences.push(...computeBrandIntegrityPack(packInput));

  // Behavioral (Wave 20.6 — migrated to packs/behavioral.ts)
  inferences.push(...computeBehavioralPack(packInput));
  // Behavioral cohort inferences (pixel-dependent workspaces)
  // Wave 20.6 — first-impression-revenue migrated to packs/first-impression-revenue.ts
  inferences.push(...computeFirstImpressionRevenuePack(packInput));
  // Wave 20.6 — action-value-map migrated to packs/action-value-map.ts
  inferences.push(...computeActionValueMapPack(packInput));
  // Wave 20.6 — acquisition-integrity migrated to packs/acquisition-integrity.ts
  inferences.push(...computeAcquisitionIntegrityPack(packInput));
  // Wave 20.6 — mobile-revenue migrated to packs/mobile-revenue.ts
  inferences.push(...computeMobileRevenuePack(packInput));
  // Wave 20.6 — friction-tax migrated to packs/friction-tax.ts
  inferences.push(...computeFrictionTaxPack(packInput));
  // Wave 20.6 — trust-revenue-gap migrated to packs/trust-revenue-gap.ts
  inferences.push(...computeTrustRevenueGapPack(packInput));
  // Wave 20.6 — path-efficiency migrated to packs/path-efficiency.ts
  inferences.push(...computePathEfficiencyPack(packInput));

  // Wave 3.3: Security posture inferences (Wave 20.6 — migrated to packs/security-posture.ts)
  // open_redirect_indicator: inherited dead code inside the pack file (not called)
  inferences.push(...computeSecurityPosturePack(packInput));

  // Copy alignment (Wave 20.6 — migrated to packs/copy-alignment.ts)
  inferences.push(...computeCopyAlignmentPack(packInput));
  // Content freshness (Wave 20.6 — migrated to packs/content-freshness.ts)
  inferences.push(...computeContentFreshnessPack(packInput));

  // Commerce context (Wave 20.6 — migrated to packs/commerce-context.ts)
  inferences.push(...computeCommerceContextPack(packInput));
  // Monetization extensions (Wave 7.11 + 8.1 + 6.1 + 7.11M — migrated to packs/monetization-extensions.ts)
  inferences.push(...computeMonetizationExtensionsPack(packInput));

  // Wave 4.x extensions (4.1 cyb + 4.2 LLM + 4.6 neglected — migrated to packs/wave-4-extensions.ts)
  inferences.push(...computeWave4ExtensionsPack(packInput));

  return inferences;
}



// ──────────────────────────────────────────────
// Behavioral Cohort Inferences (Pixel-Dependent Workspaces)
// ──────────────────────────────────────────────

// Wave 20.6 — local inferCohort removed. Imported from ./shared/builders.

// Wave 20.6 — First Impression Revenue inferences migrated to
// packs/first-impression-revenue.ts

// Wave 20.6 — Action Value Map inferences migrated to packs/action-value-map.ts

// Wave 20.6 — Acquisition Integrity inferences migrated to packs/acquisition-integrity.ts

// Wave 20.6 — mobile-revenue, friction-tax, trust-revenue-gap,
// path-efficiency inferences migrated to packs/<name>.ts

