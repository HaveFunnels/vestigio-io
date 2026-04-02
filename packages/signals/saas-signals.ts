import {
  Evidence,
  Signal,
  EvidenceType,
  SignalCategory,
  Scoping,
  FreshnessState,
  IdGenerator,
  makeRef,
} from '../domain';

// ──────────────────────────────────────────────
// SaaS Signal Extraction
//
// Extracts signals from authenticated SaaS evidence.
// Consumed by the SaaS inference engine.
//
// Signal categories: activation, onboarding, upgrade, product_ux
// ──────────────────────────────────────────────

const ids = new IdGenerator('saas_sig');

export function extractSaasSignals(
  evidence: Evidence[],
  scoping: Scoping,
  cycleRef: string,
): Signal[] {
  const signals: Signal[] = [];

  // Filter to SaaS-relevant evidence types
  const saasEvidence = evidence.filter(e =>
    e.evidence_type === EvidenceType.AuthenticatedPageView ||
    e.evidence_type === EvidenceType.ActivationStepObserved ||
    e.evidence_type === EvidenceType.EmptyStateObserved ||
    e.evidence_type === EvidenceType.UpgradeSurfaceObserved ||
    e.evidence_type === EvidenceType.NavigationStructureObserved
  );

  if (saasEvidence.length === 0) return signals;

  // ── Activation signals ──────────────────────
  const activationSteps = saasEvidence.filter(e => e.evidence_type === EvidenceType.ActivationStepObserved);
  if (activationSteps.length > 0) {
    signals.push(makeSignal('activation_flow_detected', SignalCategory.Activation, scoping, cycleRef, 'true', activationSteps.length, activationSteps, `${activationSteps.length} activation step(s) detected`));
    signals.push(makeSignal('onboarding_steps_count', SignalCategory.Onboarding, scoping, cycleRef, String(activationSteps.length), activationSteps.length, activationSteps, `Onboarding has ${activationSteps.length} steps`));

    const complexSteps = activationSteps.filter(e => (e.payload as any).estimated_complexity === 'high');
    if (complexSteps.length > 0) {
      signals.push(makeSignal('activation_complexity_high', SignalCategory.Activation, scoping, cycleRef, 'true', complexSteps.length, complexSteps, `${complexSteps.length} high-complexity activation step(s)`));
    }

    const withoutCta = activationSteps.filter(e => !(e.payload as any).has_clear_cta);
    if (withoutCta.length > 0) {
      signals.push(makeSignal('activation_unclear_next_step', SignalCategory.Activation, scoping, cycleRef, 'true', withoutCta.length, withoutCta, `${withoutCta.length} step(s) without clear CTA`));
    }

    const withoutProgress = activationSteps.filter(e => !(e.payload as any).has_progress_indicator);
    if (withoutProgress.length > 0) {
      signals.push(makeSignal('activation_no_progress', SignalCategory.Onboarding, scoping, cycleRef, 'true', withoutProgress.length, withoutProgress, `${withoutProgress.length} step(s) without progress indicator`));
    }
  }

  // ── Empty state signals ─────────────────────
  const emptyStates = saasEvidence.filter(e => e.evidence_type === EvidenceType.EmptyStateObserved);
  if (emptyStates.length > 0) {
    signals.push(makeSignal('empty_state_detected', SignalCategory.ProductUx, scoping, cycleRef, 'true', emptyStates.length, emptyStates, `${emptyStates.length} empty state(s) detected`));

    const withoutGuidance = emptyStates.filter(e => !(e.payload as any).has_guidance);
    if (withoutGuidance.length > 0) {
      signals.push(makeSignal('empty_state_no_guidance', SignalCategory.ProductUx, scoping, cycleRef, 'true', withoutGuidance.length, withoutGuidance, `${withoutGuidance.length} empty state(s) without guidance`));
    }
  }

  // ── Upgrade surface signals ─────────────────
  const upgradeSurfaces = saasEvidence.filter(e => e.evidence_type === EvidenceType.UpgradeSurfaceObserved);
  if (upgradeSurfaces.length > 0) {
    signals.push(makeSignal('upgrade_surface_present', SignalCategory.Upgrade, scoping, cycleRef, 'true', upgradeSurfaces.length, upgradeSurfaces, `${upgradeSurfaces.length} upgrade surface(s) detected`));

    const prominent = upgradeSurfaces.filter(e => (e.payload as any).visibility === 'prominent');
    const hidden = upgradeSurfaces.filter(e => (e.payload as any).visibility === 'hidden');

    signals.push(makeSignal('upgrade_surface_visibility', SignalCategory.Upgrade, scoping, cycleRef, hidden.length > prominent.length ? 'low' : prominent.length > 0 ? 'high' : 'medium', null, upgradeSurfaces, `Upgrade visibility: ${prominent.length} prominent, ${hidden.length} hidden`));

    const withValue = upgradeSurfaces.filter(e => (e.payload as any).has_value_proposition);
    if (withValue.length === 0) {
      signals.push(makeSignal('upgrade_no_value_prop', SignalCategory.Upgrade, scoping, cycleRef, 'true', null, upgradeSurfaces, 'Upgrade surfaces lack value proposition'));
    }
  } else {
    // No upgrade surface found at all
    signals.push(makeSignal('upgrade_surface_present', SignalCategory.Upgrade, scoping, cycleRef, 'false', 0, [], 'No upgrade surface detected'));
  }

  // ── Navigation signals ──────────────────────
  const navStructures = saasEvidence.filter(e => e.evidence_type === EvidenceType.NavigationStructureObserved);
  for (const nav of navStructures) {
    const p = nav.payload as any;
    signals.push(makeSignal('navigation_complexity', SignalCategory.ProductUx, scoping, cycleRef, p.total_nav_items > 15 ? 'high' : p.total_nav_items > 8 ? 'medium' : 'low', p.total_nav_items, [nav], `Navigation has ${p.total_nav_items} items, ${p.depth_levels} depth levels`));

    if (p.depth_levels > 3) {
      signals.push(makeSignal('navigation_deep', SignalCategory.ProductUx, scoping, cycleRef, 'true', p.depth_levels, [nav], `Navigation has ${p.depth_levels} depth levels`));
    }

    if (!p.has_search && p.total_nav_items > 10) {
      signals.push(makeSignal('navigation_no_search', SignalCategory.ProductUx, scoping, cycleRef, 'true', null, [nav], 'No search in complex navigation'));
    }
  }

  // ── Cross-surface signals ───────────────────
  // Detect landing vs app mismatch by comparing page content evidence (structural)
  // with authenticated page views
  const landingPages = evidence.filter(e =>
    e.evidence_type === EvidenceType.PageContent &&
    (e.payload as any).url?.match(/\/$/) // homepage
  );
  const authenticatedPages = saasEvidence.filter(e => e.evidence_type === EvidenceType.AuthenticatedPageView);

  if (landingPages.length > 0 && authenticatedPages.length > 0) {
    const hasOnboardingPrompt = authenticatedPages.some(e => (e.payload as any).has_onboarding_prompt);
    // If many activation steps but no onboarding prompt in app, that's a mismatch signal
    if (activationSteps.length > 3 && !hasOnboardingPrompt) {
      signals.push(makeSignal('landing_app_complexity_gap', SignalCategory.Expectation, scoping, cycleRef, 'true', activationSteps.length, [...landingPages, ...activationSteps], 'Landing suggests simplicity but app requires complex onboarding'));
    }
  }

  // Time-to-value estimate
  if (activationSteps.length > 0) {
    const complexity = activationSteps.reduce((sum, e) => {
      const c = (e.payload as any).estimated_complexity;
      return sum + (c === 'high' ? 3 : c === 'medium' ? 2 : 1);
    }, 0);
    const estimate = complexity <= 3 ? 'fast' : complexity <= 6 ? 'moderate' : 'slow';
    signals.push(makeSignal('time_to_value_estimate', SignalCategory.Activation, scoping, cycleRef, estimate, complexity, activationSteps, `Estimated time-to-value: ${estimate} (complexity score: ${complexity})`));
  }

  return signals;
}

function makeSignal(
  key: string, category: SignalCategory, scoping: Scoping,
  cycleRef: string, value: string, numericValue: number | null,
  evidence: Evidence[], description: string,
): Signal {
  const now = new Date();
  return {
    id: ids.next(),
    signal_key: key,
    category,
    scoping,
    cycle_ref: cycleRef,
    freshness: { observed_at: now, fresh_until: new Date(now.getTime() + 86400000), freshness_state: FreshnessState.Fresh, staleness_reason: null },
    attribute: `saas.${key}`,
    value,
    numeric_value: numericValue,
    confidence: 70,
    evidence_refs: evidence.map(e => makeRef('evidence', e.id)),
    subject_label: null,
    description,
    created_at: now,
    updated_at: now,
  };
}
