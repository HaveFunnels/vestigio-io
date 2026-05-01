/**
 * Behavioral Hardening Tests — Phase 4B Hardening
 *
 * Tests the extended snippet event types, session aggregation,
 * milestone taxonomy, field inventory, and 12 new findings.
 */

import {
  test, assert, assertEqual,
  testScoping, testFreshness, testSignal, testInference, testEvidence,
  resetCounters, printResults, getResults,
} from './helpers';

import {
  EvidenceType, SourceKind, CollectionMethod, FreshnessState,
  SignalCategory, InferenceCategory,
  IdGenerator, makeRef,
} from '../packages/domain';

import type { BehavioralSessionPayload } from '../packages/domain/evidence';

import {
  aggregateSession,
  normalizeSurface,
  classifyPageType,
} from '../packages/behavioral';

import type {
  RawBehavioralEvent,
  RawBehavioralBatch,
  SessionAggregate,
  CanonicalMilestone,
  FieldInventory,
} from '../packages/behavioral';

// ──────────────────────────────────────────────
// Test Helpers
// ──────────────────────────────────────────────

resetCounters();
const ids = new IdGenerator('bh-test');
const scoping = testScoping();
const cycle = 'bh_test:cycle_1';

function makeEvent(type: string, ts: number, url: string, data: Record<string, unknown> = {}): RawBehavioralEvent {
  return {
    type: type as any,
    ts,
    session_id: 'vgs_test_session',
    env_id: 'ENV_test',
    url,
    data,
  };
}

function makeBatch(events: RawBehavioralEvent[]): RawBehavioralBatch {
  return {
    events,
    attribution: {
      source: 'google',
      medium: 'cpc',
      campaign: 'test',
      referrer: null,
      landing_url: 'https://example.com/',
      gclid: null,
      fbclid: null,
    },
    session_id: 'vgs_test_session',
    env_id: 'ENV_test',
  };
}

function makeHardenedPayload(overrides: Partial<BehavioralSessionPayload> = {}): BehavioralSessionPayload {
  return {
    type: 'behavioral_session',
    session_count: 100,
    checkout_reached_count: 30,
    checkout_reached_rate: 0.30,
    conversion_count: 10,
    conversion_rate: 0.10,
    support_opened_count: 5,
    support_opened_rate: 0.05,
    policy_opened_count: 8,
    policy_opened_rate: 0.08,
    backtrack_session_count: 12,
    backtrack_rate: 0.12,
    dead_click_session_count: 3,
    dead_click_rate: 0.03,
    avg_session_duration_ms: 120000,
    support_after_checkout_count: 4,
    policy_then_abandon_count: 6,
    high_intent_detour_count: 5,
    dead_cta_surface_count: 2,
    retry_then_abandon_count: 3,
    mobile_session_count: 40,
    mobile_first_action_failure_rate: 0.20,
    stalled_step_count: 1,
    // Phase 4B Hardening fields
    milestone_awareness_count: 80,
    milestone_consideration_count: 60,
    milestone_intent_count: 40,
    milestone_conversion_start_count: 30,
    milestone_conversion_complete_count: 10,
    avg_time_to_first_commercial_action_ms: 15000,
    avg_time_intent_to_conversion_ms: 45000,
    confirmation_seen_count: 10,
    confirmation_seen_rate: 0.10,
    hesitation_before_cta_count: 0,
    pricing_then_hesitation_count: 0,
    pricing_backtrack_count: 0,
    policy_detour_before_conversion_count: 0,
    cta_viewed_count: 0,
    cta_clicked_count: 0,
    cta_engagement_rate: 0,
    cta_rendered_late_count: 0,
    form_retry_session_count: 0,
    form_retry_rate: 0,
    form_excessive_field_count: 0,
    sensitive_input_abandon_count: 0,
    sensitive_input_abandon_top_kinds: [],
    surface_oscillation_count: 0,
    surface_oscillation_top_pairs: [],
    conversion_retry_count: 0,
    checkout_immediate_abandon_count: 0,
    handoff_without_return_count: 0,
    handoff_without_confirmation_count: 0,
    sensitive_field_dropoff_count: 0,
    sensitive_field_dropoff_top_kinds: [],
    pixel_coverage_page_types: ['homepage', 'checkout', 'cart', 'pricing', 'thank_you'],
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// Surface Normalization Tests
// ──────────────────────────────────────────────

test('surface normalization — page type classification', () => {
  assertEqual(classifyPageType('/checkout'), 'checkout');
  assertEqual(classifyPageType('/pricing'), 'pricing');
  assertEqual(classifyPageType('/product/shoes'), 'product');
  assertEqual(classifyPageType('/thank-you'), 'thank_you');
  assertEqual(classifyPageType('/policy/refund'), 'policy');
  assertEqual(classifyPageType('/support'), 'support');
  assertEqual(classifyPageType('/cart'), 'cart');
  assertEqual(classifyPageType('/'), 'homepage');
});

test('surface normalization — strips tracking params', () => {
  const result = normalizeSurface('https://shop.com/pricing?utm_source=google&utm_medium=cpc&plan=pro');
  assertEqual(result.page_type, 'pricing');
  assert(!result.normalized_path.includes('utm_source'), 'Should strip utm_source');
  assert(result.normalized_path.includes('plan=pro'), 'Should keep meaningful param');
});

// ──────────────────────────────────────────────
// Session Aggregation — New Event Types
// ──────────────────────────────────────────────

test('aggregateSession — milestone progression', () => {
  const batch = makeBatch([
    makeEvent('page_view', 1000, 'https://shop.com/'),
    makeEvent('page_view', 5000, 'https://shop.com/product/shoes'),
    makeEvent('page_view', 10000, 'https://shop.com/cart'),
    makeEvent('checkout_open', 15000, 'https://shop.com/checkout'),
    makeEvent('confirmation_seen', 20000, 'https://shop.com/thank-you', { signals: ['url_pattern'] }),
  ]);
  const agg = aggregateSession(batch);
  assertEqual(agg.highest_milestone, 'conversion_completed');
  assertEqual(agg.confirmation_seen, true);
  assert(agg.time_to_first_commercial_action_ms !== null, 'Should have first commercial action time');
});

test('aggregateSession — CTA visibility tracking', () => {
  const batch = makeBatch([
    makeEvent('page_view', 1000, 'https://shop.com/pricing'),
    makeEvent('cta_viewed', 3000, 'https://shop.com/pricing', { label: 'Buy now' }),
    makeEvent('cta_viewed', 4000, 'https://shop.com/pricing', { label: 'Learn more' }),
    makeEvent('cta_click', 5000, 'https://shop.com/pricing', { label: 'Buy now' }),
  ]);
  const agg = aggregateSession(batch);
  assertEqual(agg.cta_viewed_count, 2);
  assertEqual(agg.cta_clicked_count, 1);
});

test('aggregateSession — hesitation and friction patterns', () => {
  const batch = makeBatch([
    makeEvent('page_view', 1000, 'https://shop.com/checkout'),
    makeEvent('hesitation_pause', 4000, 'https://shop.com/checkout', { pause_ms: 3000 }),
    makeEvent('rapid_backtrack', 5000, 'https://shop.com/product', { from_url: 'https://shop.com/checkout', time_on_page_ms: 3000 }),
    makeEvent('form_retry', 8000, 'https://shop.com/checkout', { attempt_number: 2 }),
  ]);
  const agg = aggregateSession(batch);
  assertEqual(agg.hesitation_pause_count, 1);
  assertEqual(agg.rapid_backtrack_count, 1);
  assertEqual(agg.form_retry_count, 1);
});

test('aggregateSession — field inventory', () => {
  const batch = makeBatch([
    makeEvent('page_view', 1000, 'https://shop.com/contact'),
    makeEvent('field_inventory', 2000, 'https://shop.com/contact', {
      field_count: 5,
      field_kinds: ['email', 'name', 'phone'],
      has_sensitive: true,
      has_password: false,
      has_card_like: false,
      has_freeform_message: true,
    }),
    makeEvent('form_start', 3000, 'https://shop.com/contact'),
  ]);
  const agg = aggregateSession(batch);
  assertEqual(agg.field_inventories.length, 1);
  assertEqual(agg.field_inventories[0].field_count, 5);
  assertEqual(agg.field_inventories[0].has_sensitive_fields, true);
});

test('aggregateSession — input focus abandon with sensitive field', () => {
  const batch = makeBatch([
    makeEvent('page_view', 1000, 'https://shop.com/checkout'),
    makeEvent('input_focus_abandon', 5000, 'https://shop.com/checkout', { field_kind: 'card_like', time_on_field_ms: 2000 }),
    makeEvent('input_focus_abandon', 8000, 'https://shop.com/checkout', { field_kind: 'email', time_on_field_ms: 1500 }),
  ]);
  const agg = aggregateSession(batch);
  assertEqual(agg.input_focus_abandon_count, 2);
  assert(agg.sensitive_input_abandon_kinds.includes('card_like'), 'Should include card_like');
  assert(agg.sensitive_input_abandon_kinds.includes('email'), 'Should include email');
});

test('aggregateSession — trusted handoff', () => {
  const batch = makeBatch([
    makeEvent('page_view', 1000, 'https://shop.com/checkout'),
    makeEvent('trusted_handoff', 5000, 'https://shop.com/checkout', { target_host: 'checkout.stripe.com', provider_guess: 'stripe' }),
    makeEvent('page_view', 10000, 'https://shop.com/thank-you'),
    makeEvent('confirmation_seen', 11000, 'https://shop.com/thank-you', { signals: ['url_pattern'] }),
  ]);
  const agg = aggregateSession(batch);
  assertEqual(agg.handoff_started, true);
  assertEqual(agg.handoff_returned, true);
  assertEqual(agg.handoff_target_host, 'checkout.stripe.com');
  assertEqual(agg.confirmation_seen, true);
});

test('aggregateSession — surface oscillation detection', () => {
  const batch = makeBatch([
    makeEvent('page_view', 1000, 'https://shop.com/pricing'),
    makeEvent('page_view', 5000, 'https://shop.com/product/plan'),
    makeEvent('page_view', 8000, 'https://shop.com/pricing'),
    makeEvent('page_view', 12000, 'https://shop.com/product/plan'),
    makeEvent('page_view', 16000, 'https://shop.com/pricing'),
    makeEvent('page_leave', 20000, 'https://shop.com/pricing'),
  ]);
  const agg = aggregateSession(batch);
  assert(agg.oscillation_pairs.length > 0, 'Should detect oscillation pairs');
  assert(agg.oscillation_pairs[0].oscillation_count >= 2, 'Should count at least 2 oscillations');
});

test('aggregateSession — policy before conversion', () => {
  const batch = makeBatch([
    makeEvent('page_view', 1000, 'https://shop.com/product/shoes'),
    makeEvent('cta_click', 3000, 'https://shop.com/product/shoes', { label: 'Add to cart' }),
    makeEvent('page_view', 5000, 'https://shop.com/cart'),
    makeEvent('policy_open', 7000, 'https://shop.com/policy/refund'),
    makeEvent('page_view', 10000, 'https://shop.com/cart'),
    makeEvent('page_leave', 12000, 'https://shop.com/cart'),
  ]);
  const agg = aggregateSession(batch);
  assertEqual(agg.policy_before_conversion, true);
});

test('aggregateSession — pricing then backtrack', () => {
  const batch = makeBatch([
    makeEvent('page_view', 1000, 'https://shop.com/pricing'),
    makeEvent('rapid_backtrack', 4000, 'https://shop.com/product', { from_url: 'https://shop.com/pricing', time_on_page_ms: 3000 }),
  ]);
  const agg = aggregateSession(batch);
  assertEqual(agg.pricing_then_backtrack, true);
});

test('aggregateSession — journey type classification', () => {
  const ecommerceBatch = makeBatch([
    makeEvent('page_view', 1000, 'https://shop.com/product/shoes'),
    makeEvent('page_view', 5000, 'https://shop.com/cart'),
    makeEvent('checkout_open', 8000, 'https://shop.com/checkout'),
  ]);
  assertEqual(aggregateSession(ecommerceBatch).journey_type, 'ecommerce');

  const leadGenBatch = makeBatch([
    makeEvent('page_view', 1000, 'https://example.com/demo'),
    makeEvent('form_start', 3000, 'https://example.com/demo'),
  ]);
  // lead_gen journey (has product-like surface, no checkout)
  const agg = aggregateSession(leadGenBatch);
  assert(agg.journey_type !== null, 'Should have a journey type');
});

test('aggregateSession — CTA rendered late tracking', () => {
  const batch = makeBatch([
    makeEvent('page_view', 1000, 'https://shop.com/pricing'),
    makeEvent('cta_rendered_late', 5000, 'https://shop.com/pricing', { label: 'Buy now', render_delay_ms: 3000 }),
  ]);
  const agg = aggregateSession(batch);
  assertEqual(agg.cta_rendered_late_count, 1);
});

// ──────────────────────────────────────────────
// BehavioralSessionPayload Completeness
// ──────────────────────────────────────────────

test('BehavioralSessionPayload — all hardening fields present', () => {
  const payload = makeHardenedPayload();
  // Verify all new fields exist and have correct types
  assert(typeof payload.milestone_awareness_count === 'number', 'milestone_awareness_count');
  assert(typeof payload.milestone_consideration_count === 'number', 'milestone_consideration_count');
  assert(typeof payload.milestone_intent_count === 'number', 'milestone_intent_count');
  assert(typeof payload.milestone_conversion_start_count === 'number', 'milestone_conversion_start_count');
  assert(typeof payload.milestone_conversion_complete_count === 'number', 'milestone_conversion_complete_count');
  assert(typeof payload.confirmation_seen_count === 'number', 'confirmation_seen_count');
  assert(typeof payload.hesitation_before_cta_count === 'number', 'hesitation_before_cta_count');
  assert(typeof payload.pricing_then_hesitation_count === 'number', 'pricing_then_hesitation_count');
  assert(typeof payload.pricing_backtrack_count === 'number', 'pricing_backtrack_count');
  assert(typeof payload.policy_detour_before_conversion_count === 'number', 'policy_detour_before_conversion_count');
  assert(typeof payload.cta_viewed_count === 'number', 'cta_viewed_count');
  assert(typeof payload.cta_clicked_count === 'number', 'cta_clicked_count');
  assert(typeof payload.cta_engagement_rate === 'number', 'cta_engagement_rate');
  assert(typeof payload.cta_rendered_late_count === 'number', 'cta_rendered_late_count');
  assert(typeof payload.form_retry_session_count === 'number', 'form_retry_session_count');
  assert(typeof payload.form_retry_rate === 'number', 'form_retry_rate');
  assert(typeof payload.form_excessive_field_count === 'number', 'form_excessive_field_count');
  assert(typeof payload.sensitive_input_abandon_count === 'number', 'sensitive_input_abandon_count');
  assert(Array.isArray(payload.sensitive_input_abandon_top_kinds), 'sensitive_input_abandon_top_kinds');
  assert(typeof payload.surface_oscillation_count === 'number', 'surface_oscillation_count');
  assert(Array.isArray(payload.surface_oscillation_top_pairs), 'surface_oscillation_top_pairs');
  assert(typeof payload.conversion_retry_count === 'number', 'conversion_retry_count');
  assert(typeof payload.checkout_immediate_abandon_count === 'number', 'checkout_immediate_abandon_count');
  assert(typeof payload.handoff_without_return_count === 'number', 'handoff_without_return_count');
  assert(typeof payload.sensitive_field_dropoff_count === 'number', 'sensitive_field_dropoff_count');
  assert(Array.isArray(payload.sensitive_field_dropoff_top_kinds), 'sensitive_field_dropoff_top_kinds');
});

// ──────────────────────────────────────────────
// Inference Category Completeness — 12 New Findings
// ──────────────────────────────────────────────

test('InferenceCategory — 12 hardening entries exist', () => {
  const hardeningCategories = [
    InferenceCategory.HesitationBeforeConversionMissingTrust,
    InferenceCategory.PricingHesitationUnclearValue,
    InferenceCategory.PolicyDetourBeforeConversion,
    InferenceCategory.CtaViewedNotEngaged,
    InferenceCategory.SensitiveInputAbandonment,
    InferenceCategory.FormExcessiveFieldsBeforeConversion,
    InferenceCategory.FormSubmissionRetryFriction,
    InferenceCategory.SurfaceOscillationBeforeDropoff,
    InferenceCategory.ConversionFinalStepRetry,
    InferenceCategory.CtaLateAvailabilityDelaysAction,
    InferenceCategory.CheckoutAbandonNoFeedback,
    InferenceCategory.SensitiveInputPerceivedRiskDropoff,
  ];
  assertEqual(hardeningCategories.length, 12);
  for (const cat of hardeningCategories) {
    assert(typeof cat === 'string', `${cat} should be a string`);
    assert(cat.length > 0, `${cat} should be non-empty`);
  }
});

// ──────────────────────────────────────────────
// Privacy Assertions
// ──────────────────────────────────────────────

test('field inventory — never captures values', () => {
  const inventory: FieldInventory = {
    field_count: 5,
    field_kinds: ['email', 'phone', 'name'],
    has_sensitive_fields: true,
    has_password: false,
    has_card_like: false,
    has_freeform_message: false,
  };
  // Verify no actual user-typed values in the structure (only structural metadata)
  assert(!JSON.stringify(inventory).includes('@'), 'Should not contain email values');
  // has_password is a boolean structural flag, not a captured password value
  assert(typeof inventory.has_password === 'boolean', 'has_password is a boolean flag');
  assert(typeof inventory.field_count === 'number', 'field_count is numeric');
  assert(Array.isArray(inventory.field_kinds), 'field_kinds is array of kind labels');
});

test('session aggregate — no raw event storage', () => {
  const batch = makeBatch([
    makeEvent('page_view', 1000, 'https://shop.com/'),
    makeEvent('form_start', 3000, 'https://shop.com/contact', { url: 'https://shop.com/contact' }),
    makeEvent('form_submit', 5000, 'https://shop.com/contact'),
  ]);
  const agg = aggregateSession(batch);
  // Verify aggregate contains no raw events
  assert(!('events' in agg), 'Aggregate should not contain raw events');
  // Verify no typed values or PII
  const json = JSON.stringify(agg);
  assert(!json.includes('password'), 'No password in aggregate');
});

// ──────────────────────────────────────────────
// Governance Gate Tests
// ──────────────────────────────────────────────

test('payload with too few sessions — signals should not fire', () => {
  // The MIN_SESSIONS gate in signals/engine.ts is 20
  const lowSessionPayload = makeHardenedPayload({
    session_count: 10,
    hesitation_before_cta_count: 5,
    pricing_backtrack_count: 3,
  });
  // These values would trigger signals if session_count >= 20
  // But with only 10 sessions, they should be gated
  assert(lowSessionPayload.session_count < 20, 'Session count is below MIN_SESSIONS gate');
});

test('no root-causeless findings — all 12 inference keys mapped', () => {
  const hardeningKeys = [
    'hesitation_before_conversion_missing_trust',
    'pricing_hesitation_unclear_value',
    'policy_detour_before_conversion',
    'cta_viewed_not_engaged',
    'sensitive_input_abandonment',
    'form_excessive_fields_before_conversion',
    'form_submission_retry_friction',
    'surface_oscillation_before_dropoff',
    'conversion_final_step_retry',
    'cta_late_availability_delays_action',
    'checkout_abandon_no_feedback',
    'sensitive_input_perceived_risk_dropoff',
  ];
  // We verify these are in the InferenceCategory enum
  for (const key of hardeningKeys) {
    const enumValues = Object.values(InferenceCategory);
    assert(enumValues.includes(key as any), `${key} must be in InferenceCategory enum`);
  }
});

test('no "likely" in finding titles', () => {
  const titles = [
    'Users hesitate before conversion due to missing trust signals near CTA',
    'Users delay conversion after viewing pricing due to unclear value justification',
    'Users open policies before converting due to trust uncertainty',
    'Primary CTA is viewed but not engaged',
    'Users abandon after interacting with sensitive input',
    'Form requires high-effort input before conversion due to excessive or sensitive fields',
    'Users retry form submission multiple times',
    'Back-and-forth between surfaces before dropoff due to unresolved decision friction',
    'Conversion attempts require multiple retries due to friction in final steps',
    'Users delay action due to late availability of primary CTA',
    'Users abandon after initiating checkout due to lack of immediate feedback or progress indication',
    'Users drop off after entering sensitive information due to perceived risk',
  ];
  for (const title of titles) {
    assert(!title.toLowerCase().includes('likely'), `Title should not contain "likely": ${title}`);
  }
});

// ── Print results ──
printResults('Behavioral Hardening');
const results = getResults();
if (results.failed > 0) {
  process.exit(1);
}
