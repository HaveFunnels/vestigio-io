import {
  Signal,
  Inference,
  InferenceCategory,
  FreshnessState,
  Scoping,
  IdGenerator,
  makeRef,
} from '../domain';

// ──────────────────────────────────────────────
// SaaS Inference Engine
//
// Derives SaaS-specific interpretations from signals.
// Grouped by: Activation, UX/Product, Monetization,
// and Cross-Surface (landing ↔ app mismatch).
//
// Each inference maps to the saas_growth_readiness pack.
// ──────────────────────────────────────────────

const ids = new IdGenerator('saas_inf');

export function computeSaasInferences(
  signals: Signal[],
  scoping: Scoping,
  cycleRef: string,
): Inference[] {
  const inferences: Inference[] = [];
  const sigMap = new Map<string, Signal>();
  for (const s of signals) sigMap.set(s.signal_key, s);

  // ── Activation inferences ───────────────────
  inferences.push(...inferActivationBlocked(sigMap, scoping, cycleRef));
  inferences.push(...inferActivationFriction(sigMap, scoping, cycleRef));
  inferences.push(...inferUnclearNextStep(sigMap, scoping, cycleRef));

  // ── UX / Product inferences ─────────────────
  inferences.push(...inferEmptyStateNoGuidance(sigMap, scoping, cycleRef));
  inferences.push(...inferNavigationOvercomplex(sigMap, scoping, cycleRef));
  inferences.push(...inferFeatureDiscoveryPoor(sigMap, scoping, cycleRef));

  // ── Monetization inferences ─────────────────
  inferences.push(...inferUpgradeInvisible(sigMap, scoping, cycleRef));
  inferences.push(...inferUpgradeTimingWrong(sigMap, scoping, cycleRef));
  inferences.push(...inferNoExpansionPath(sigMap, scoping, cycleRef));

  // ── Cross-surface: landing ↔ app ────────────
  inferences.push(...inferLandingAppMismatch(sigMap, scoping, cycleRef));

  return inferences;
}

// ── Activation ────────────────────────────────

function inferActivationBlocked(sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string): Inference[] {
  const flow = sigs.get('activation_flow_detected');
  const complex = sigs.get('activation_complexity_high');
  const ttv = sigs.get('time_to_value_estimate');

  if (!flow) return [];
  if (ttv?.value === 'slow' || (complex && (complex.numeric_value || 0) >= 2)) {
    return [makeInference('activation_blocked', InferenceCategory.ActivationBlocked, scoping, cycleRef,
      'Activation path is blocked by complexity', 'high', 'high', 65,
      [flow, complex, ttv].filter(Boolean) as Signal[],
      'Multiple high-complexity steps detected in activation flow. Users likely drop off before reaching value.')];
  }
  return [];
}

function inferActivationFriction(sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string): Inference[] {
  const steps = sigs.get('onboarding_steps_count');
  const noProgress = sigs.get('activation_no_progress');

  if (!steps) return [];
  const stepCount = steps.numeric_value || 0;
  if (stepCount > 5 || noProgress) {
    const severity = stepCount > 8 ? 'high' : stepCount > 5 ? 'medium' : 'low';
    return [makeInference('activation_friction_high', InferenceCategory.ActivationFriction, scoping, cycleRef,
      `Activation has ${stepCount} steps with friction`, severity, severity, 60,
      [steps, noProgress].filter(Boolean) as Signal[],
      `Onboarding requires ${stepCount} steps. ${noProgress ? 'No progress indicators found.' : 'Excessive steps increase drop-off.'}`)];
  }
  return [];
}

function inferUnclearNextStep(sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string): Inference[] {
  const unclear = sigs.get('activation_unclear_next_step');
  if (!unclear) return [];
  return [makeInference('unclear_next_step', InferenceCategory.UnclearNextStep, scoping, cycleRef,
    'Activation steps lack clear next actions', 'medium', 'medium', 55,
    [unclear],
    `${unclear.numeric_value || 0} onboarding step(s) found without a clear call-to-action. Users may get stuck.`)];
}

// ── UX / Product ──────────────────────────────

function inferEmptyStateNoGuidance(sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string): Inference[] {
  const noGuidance = sigs.get('empty_state_no_guidance');
  if (!noGuidance) return [];
  const count = noGuidance.numeric_value || 0;
  return [makeInference('empty_state_without_guidance', InferenceCategory.EmptyStateNoGuidance, scoping, cycleRef,
    `${count} empty state(s) without user guidance`, count > 2 ? 'high' : 'medium', count > 2 ? 'high' : 'medium', 60,
    [noGuidance],
    'Empty states without guidance leave users confused about what to do next, increasing churn risk.')];
}

function inferNavigationOvercomplex(sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string): Inference[] {
  const complexity = sigs.get('navigation_complexity');
  const deep = sigs.get('navigation_deep');
  const noSearch = sigs.get('navigation_no_search');

  if (!complexity || complexity.value !== 'high') return [];
  return [makeInference('navigation_overcomplex', InferenceCategory.NavigationOvercomplex, scoping, cycleRef,
    'App navigation is overcomplex', deep ? 'high' : 'medium', deep ? 'high' : 'medium', 55,
    [complexity, deep, noSearch].filter(Boolean) as Signal[],
    `Navigation has ${complexity.numeric_value} items. ${deep ? `${deep.numeric_value} depth levels. ` : ''}${noSearch ? 'No search function. ' : ''}Users may struggle to find features.`)];
}

function inferFeatureDiscoveryPoor(sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string): Inference[] {
  const navComplex = sigs.get('navigation_complexity');
  const emptyStates = sigs.get('empty_state_detected');

  if (!navComplex || navComplex.value !== 'high') return [];
  if (!emptyStates) return [];

  return [makeInference('feature_discovery_poor', InferenceCategory.FeatureDiscoveryPoor, scoping, cycleRef,
    'Feature discovery is poor', 'medium', 'medium', 50,
    [navComplex, emptyStates],
    'Complex navigation combined with empty states suggests users cannot discover or activate key features.')];
}

// ── Monetization ──────────────────────────────

function inferUpgradeInvisible(sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string): Inference[] {
  const present = sigs.get('upgrade_surface_present');
  if (!present) return [];
  if (present.value === 'false') {
    return [makeInference('upgrade_invisible', InferenceCategory.UpgradeInvisible, scoping, cycleRef,
      'No upgrade surface detected in app', 'high', 'high', 65,
      [present],
      'No visible upgrade path found. Users cannot discover paid plans, directly reducing expansion revenue.')];
  }
  const visibility = sigs.get('upgrade_surface_visibility');
  if (visibility?.value === 'low') {
    return [makeInference('upgrade_invisible', InferenceCategory.UpgradeInvisible, scoping, cycleRef,
      'Upgrade surfaces are hidden', 'medium', 'medium', 55,
      [present, visibility],
      'Upgrade surfaces exist but are hidden. Users are unlikely to discover upgrade opportunities.')];
  }
  return [];
}

function inferUpgradeTimingWrong(sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string): Inference[] {
  const noValueProp = sigs.get('upgrade_no_value_prop');
  if (!noValueProp) return [];
  return [makeInference('upgrade_timing_wrong', InferenceCategory.UpgradeTimingWrong, scoping, cycleRef,
    'Upgrade surfaces lack value proposition', 'medium', 'medium', 50,
    [noValueProp],
    'Upgrade CTAs shown without explaining what the user gains. This reduces upgrade conversion.')];
}

function inferNoExpansionPath(sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string): Inference[] {
  const present = sigs.get('upgrade_surface_present');
  const noValueProp = sigs.get('upgrade_no_value_prop');
  if (present?.value === 'false' && !noValueProp) {
    return [makeInference('no_expansion_path', InferenceCategory.NoExpansionPath, scoping, cycleRef,
      'No expansion revenue path exists', 'high', 'high', 60,
      [present].filter(Boolean) as Signal[],
      'No upgrade surfaces or expansion CTAs found. The product has no visible path from free to paid.')];
  }
  return [];
}

// ── Cross-Surface ─────────────────────────────

function inferLandingAppMismatch(sigs: Map<string, Signal>, scoping: Scoping, cycleRef: string): Inference[] {
  const gap = sigs.get('landing_app_complexity_gap');
  if (!gap) return [];
  return [makeInference('landing_app_mismatch', InferenceCategory.LandingAppMismatch, scoping, cycleRef,
    'Landing page promises vs app reality mismatch', 'high', 'high', 55,
    [gap],
    'Landing page suggests simplicity but the app requires complex onboarding. This expectation mismatch increases churn in the first session.')];
}

// ── Helper ────────────────────────────────────

function makeInference(
  key: string, category: InferenceCategory, scoping: Scoping,
  cycleRef: string, conclusion: string, conclusionValue: string,
  severityHint: string | null, confidence: number,
  signals: Signal[], reasoning: string,
): Inference {
  const now = new Date();
  return {
    id: ids.next(),
    inference_key: key,
    category,
    scoping,
    cycle_ref: cycleRef,
    freshness: { observed_at: now, fresh_until: new Date(now.getTime() + 86400000), freshness_state: FreshnessState.Fresh, staleness_reason: null },
    conclusion,
    conclusion_value: conclusionValue,
    severity_hint: severityHint,
    confidence,
    signal_refs: signals.map(s => makeRef('signal', s.id)),
    evidence_refs: signals.flatMap(s => s.evidence_refs),
    reasoning,
    description: null,
    created_at: now,
    updated_at: now,
  };
}
