/**
 * Wave 0.3: Pixel event processor — reducer tests
 *
 * Validates the pure SessionAggregate[] → BehavioralSessionPayload
 * reduction. The DB-touching path (processBehavioralEventsForEnv) is
 * not exercised here — it depends on Prisma and is covered manually.
 *
 * What we DO assert:
 *   - counts and rates compute correctly
 *   - milestone propagation cascades through the funnel taxonomy
 *   - oscillation pair aggregation collapses order-independent pairs
 *   - top-N selection picks the right buckets
 *   - empty input returns the zero-shaped payload (no NaN, no nulls in the
 *     wrong places)
 */

import { test, assert, assertEqual, printResults } from "./helpers";
import { sessionsToBehavioralPayload } from "../apps/audit-runner/process-behavioral";
import type {
  SessionAggregate,
  CanonicalMilestone,
  AttributionContext,
} from "../packages/behavioral";

const NULL_ATTR: AttributionContext = {
  source: null,
  medium: null,
  campaign: null,
  referrer: null,
  landing_url: null,
  gclid: null,
  fbclid: null,
};

function makeSession(overrides: Partial<SessionAggregate> = {}): SessionAggregate {
  const now = new Date();
  return {
    session_id: "vgs_test",
    env_id: "ENV_test",
    surface_progression: [],
    attribution: { first_touch: NULL_ATTR, latest_touch: NULL_ATTR, touch_count: 1 },
    checkout_reached: false,
    form_started: false,
    form_completed: false,
    support_opened: false,
    policy_opened: false,
    backtrack_count: 0,
    dead_click_count: 0,
    max_scroll_depth: 0,
    session_duration_ms: 60_000,
    reached_thank_you: false,
    started_at: now,
    ended_at: new Date(now.getTime() + 60_000),
    highest_milestone: null,
    confirmation_seen: false,
    time_to_first_commercial_action_ms: null,
    time_intent_to_conversion_ms: null,
    time_conversion_to_confirmation_ms: null,
    cta_viewed_count: 0,
    cta_clicked_count: 0,
    cta_rendered_late_count: 0,
    hesitation_pause_count: 0,
    rapid_backtrack_count: 0,
    form_retry_count: 0,
    input_focus_abandon_count: 0,
    field_inventories: [],
    sensitive_input_abandon_kinds: [],
    handoff_started: false,
    handoff_returned: false,
    handoff_confirmed: false,
    handoff_target_host: null,
    oscillation_pairs: [],
    policy_before_conversion: false,
    pricing_then_backtrack: false,
    journey_type: null,
    ...overrides,
  };
}

// ──────────────────────────────────────────────

test("reducer — empty input returns zero payload, not NaN", () => {
  const p = sessionsToBehavioralPayload([]);
  assertEqual(p.session_count, 0, "session_count");
  assertEqual(p.checkout_reached_rate, 0, "checkout_reached_rate");
  assertEqual(p.avg_session_duration_ms, 0, "avg_session_duration_ms");
  assert(p.avg_time_to_first_commercial_action_ms === null, "avg_first_action null on empty");
  assert(Array.isArray(p.surface_oscillation_top_pairs), "top_pairs is array");
  assertEqual(p.surface_oscillation_top_pairs.length, 0, "top_pairs empty");
});

// ──────────────────────────────────────────────

test("reducer — counts and rates correct on simple mix", () => {
  const sessions = [
    makeSession({ checkout_reached: true, reached_thank_you: true }),
    makeSession({ checkout_reached: true }),
    makeSession({ checkout_reached: true }),
    makeSession({}),
    makeSession({}),
  ];
  const p = sessionsToBehavioralPayload(sessions);
  assertEqual(p.session_count, 5, "session_count");
  assertEqual(p.checkout_reached_count, 3, "checkout_reached_count");
  assertEqual(p.checkout_reached_rate, 0.6, "checkout_reached_rate 3/5");
  assertEqual(p.conversion_count, 1, "conversion_count");
  assertEqual(p.conversion_rate, 0.2, "conversion_rate 1/5");
});

// ──────────────────────────────────────────────

test("reducer — milestone cascade", () => {
  // A session at "conversion_completed" should also count as having
  // reached every prior milestone (awareness → consideration → intent →
  // conv_start → conv_complete). The reducer's switch fallthrough
  // implements this.
  const milestones: CanonicalMilestone[] = [
    "awareness_seen",
    "consideration_started",
    "intent_expressed",
    "conversion_started",
    "conversion_completed",
  ];
  const sessions = milestones.map((m) => makeSession({ highest_milestone: m }));
  const p = sessionsToBehavioralPayload(sessions);
  // 5 sessions reached awareness (the lowest)
  assertEqual(p.milestone_awareness_count, 5, "5 reached awareness");
  // 4 reached consideration (excluding awareness-only)
  assertEqual(p.milestone_consideration_count, 4, "4 reached consideration");
  assertEqual(p.milestone_intent_count, 3, "3 reached intent");
  assertEqual(p.milestone_conversion_start_count, 2, "2 reached conv_start");
  assertEqual(p.milestone_conversion_complete_count, 1, "1 reached conv_complete");
});

// ──────────────────────────────────────────────

test("reducer — avg time skips null contributors", () => {
  const sessions = [
    makeSession({ time_to_first_commercial_action_ms: 1000 }),
    makeSession({ time_to_first_commercial_action_ms: 3000 }),
    makeSession({ time_to_first_commercial_action_ms: null }), // skipped
  ];
  const p = sessionsToBehavioralPayload(sessions);
  // avg of 1000 and 3000 = 2000
  assertEqual(p.avg_time_to_first_commercial_action_ms, 2000, "avg skips null");
});

// ──────────────────────────────────────────────

test("reducer — oscillation pairs are order-independent and aggregated", () => {
  // Two sessions with the same pair in opposite orders should collapse
  // into one entry with summed counts.
  const sessions = [
    makeSession({
      oscillation_pairs: [
        { surface_a: "/cart", surface_b: "/checkout", oscillation_count: 3, page_type_a: "cart" as const, page_type_b: "checkout" as const },
      ],
    }),
    makeSession({
      oscillation_pairs: [
        { surface_a: "/checkout", surface_b: "/cart", oscillation_count: 2, page_type_a: "checkout" as const, page_type_b: "cart" as const },
      ],
    }),
  ];
  const p = sessionsToBehavioralPayload(sessions);
  assertEqual(p.surface_oscillation_count, 5, "total oscillation count summed");
  assertEqual(p.surface_oscillation_top_pairs.length, 1, "pairs collapsed to one entry");
  assertEqual(p.surface_oscillation_top_pairs[0].count, 5, "pair count is 3+2");
});

// ──────────────────────────────────────────────

test("reducer — top-N kinds for sensitive abandon", () => {
  // 3 sessions with email, 2 with phone, 1 with cpf — top 3 should
  // include all three but in count-descending order.
  const sessions = [
    makeSession({ sensitive_input_abandon_kinds: ["email"] }),
    makeSession({ sensitive_input_abandon_kinds: ["email"] }),
    makeSession({ sensitive_input_abandon_kinds: ["email"] }),
    makeSession({ sensitive_input_abandon_kinds: ["phone"] }),
    makeSession({ sensitive_input_abandon_kinds: ["phone"] }),
    makeSession({ sensitive_input_abandon_kinds: ["cpf_cnpj_like"] }),
  ];
  const p = sessionsToBehavioralPayload(sessions);
  assertEqual(p.sensitive_input_abandon_count, 6, "all 6 sessions counted");
  assertEqual(p.sensitive_input_abandon_top_kinds.length, 3, "top 3 kinds");
  assertEqual(p.sensitive_input_abandon_top_kinds[0], "email", "email is most common");
  assertEqual(p.sensitive_input_abandon_top_kinds[1], "phone", "phone second");
});

// ──────────────────────────────────────────────

test("reducer — checkout immediate abandon heuristic", () => {
  const sessions = [
    // checkout reached, short duration, no conversion → counts
    makeSession({ checkout_reached: true, session_duration_ms: 15_000, reached_thank_you: false }),
    // checkout reached, long duration, no conversion → does NOT count (not "immediate")
    makeSession({ checkout_reached: true, session_duration_ms: 600_000, reached_thank_you: false }),
    // checkout reached, short duration, BUT converted → does NOT count
    makeSession({ checkout_reached: true, session_duration_ms: 15_000, reached_thank_you: true }),
    // no checkout reached → does NOT count
    makeSession({ checkout_reached: false, session_duration_ms: 15_000 }),
  ];
  const p = sessionsToBehavioralPayload(sessions);
  assertEqual(p.checkout_immediate_abandon_count, 1, "only one short-checkout-no-conversion");
});

// ──────────────────────────────────────────────

test("reducer — stalled step heuristic counts surfaces with >=3 dead-end sessions", () => {
  // /pricing is the dead-end of 4 non-converting sessions → 1 stalled
  // /support is dead-end of 2 → not stalled
  // /checkout is dead-end of 1 → not stalled
  const sessions = [
    makeSession({ surface_progression: ["/", "/pricing"], reached_thank_you: false }),
    makeSession({ surface_progression: ["/", "/pricing"], reached_thank_you: false }),
    makeSession({ surface_progression: ["/", "/pricing"], reached_thank_you: false }),
    makeSession({ surface_progression: ["/", "/pricing"], reached_thank_you: false }),
    makeSession({ surface_progression: ["/", "/support"], reached_thank_you: false }),
    makeSession({ surface_progression: ["/", "/support"], reached_thank_you: false }),
    makeSession({ surface_progression: ["/", "/checkout"], reached_thank_you: false }),
    // Converting sessions don't contribute to dead-end count, regardless of last surface
    makeSession({ surface_progression: ["/", "/pricing"], reached_thank_you: true }),
  ];
  const p = sessionsToBehavioralPayload(sessions);
  assertEqual(p.stalled_step_count, 1, "only /pricing exceeds threshold");
});

// ──────────────────────────────────────────────

test("reducer — CTA engagement rate and dead CTA detection", () => {
  // 60 viewed total, 2 clicked → engagement 0.033 < 0.05, viewed >= 50 → dead CTA = 1
  const sessions = [
    makeSession({ cta_viewed_count: 30, cta_clicked_count: 1 }),
    makeSession({ cta_viewed_count: 30, cta_clicked_count: 1 }),
  ];
  const p = sessionsToBehavioralPayload(sessions);
  assertEqual(p.cta_viewed_count, 60, "viewed summed");
  assertEqual(p.cta_clicked_count, 2, "clicked summed");
  assert(Math.abs(p.cta_engagement_rate - 2 / 60) < 0.0001, "engagement rate");
  assertEqual(p.dead_cta_surface_count, 1, "dead CTA detected");
});

// ──────────────────────────────────────────────

test("reducer — handoff continuity counters", () => {
  const sessions = [
    // started, never returned → handoff_without_return
    makeSession({ handoff_started: true, handoff_returned: false, handoff_confirmed: false }),
    // started, returned, no confirmation → handoff_without_confirmation
    makeSession({ handoff_started: true, handoff_returned: true, handoff_confirmed: false }),
    // started, returned, confirmed → neither counter
    makeSession({ handoff_started: true, handoff_returned: true, handoff_confirmed: true }),
    // never started → neither counter
    makeSession({}),
  ];
  const p = sessionsToBehavioralPayload(sessions);
  assertEqual(p.handoff_without_return_count, 1, "one without return");
  assertEqual(p.handoff_without_confirmation_count, 1, "one returned-but-unconfirmed");
});

// ──────────────────────────────────────────────

printResults("Behavioral Pixel Reducer");
