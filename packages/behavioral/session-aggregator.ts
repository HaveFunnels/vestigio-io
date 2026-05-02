import {
  RawBehavioralEvent,
  RawBehavioralBatch,
  SessionAggregate,
  SurfaceVitality,
  FunnelStep,
  FunnelAnalysis,
  MultiTouchAttribution,
  CanonicalMilestone,
  FieldInventory,
  FieldKind,
  SurfacePair,
  JourneyType,
  SurfacePageType,
  BehavioralCohortSlice,
  BehavioralCohortPayload,
} from './types';
import { normalizeSurface, classifyPageType } from './surface-normalizer';

// ──────────────────────────────────────────────
// Session Aggregator
//
// Transforms raw behavioral events into compact
// session-level and surface-level aggregates.
//
// This is the bridge between snippet data and
// the Vestigio evidence pipeline.
// ──────────────────────────────────────────────

const MILESTONE_ORDER: CanonicalMilestone[] = [
  'awareness_seen',
  'consideration_started',
  'intent_expressed',
  'conversion_started',
  'conversion_completed',
  'post_conversion_seen',
];

function milestoneIndex(m: CanonicalMilestone | null): number {
  return m ? MILESTONE_ORDER.indexOf(m) : -1;
}

function advanceMilestone(
  current: CanonicalMilestone | null,
  candidate: CanonicalMilestone,
): CanonicalMilestone {
  if (milestoneIndex(candidate) > milestoneIndex(current)) return candidate;
  return current || candidate;
}

function classifyMilestoneFromPageType(pageType: SurfacePageType): CanonicalMilestone | null {
  switch (pageType) {
    case 'checkout': return 'conversion_started';
    case 'cart':
    case 'pricing': return 'intent_expressed';
    case 'product':
    case 'category': return 'consideration_started';
    case 'landing':
    case 'homepage': return 'awareness_seen';
    case 'thank_you': return 'conversion_completed';
    default: return null;
  }
}

function classifyJourneyFromProgression(surfaceTypes: SurfacePageType[]): JourneyType | null {
  const hasCheckout = surfaceTypes.includes('checkout');
  const hasCart = surfaceTypes.includes('cart');
  const hasProduct = surfaceTypes.includes('product') || surfaceTypes.includes('category');
  const hasPricing = surfaceTypes.includes('pricing');
  const hasOnboarding = surfaceTypes.includes('onboarding');
  const hasSupport = surfaceTypes.includes('support') || surfaceTypes.includes('policy');

  if (hasCheckout || hasCart) return 'ecommerce';
  if (hasPricing && !hasProduct) return 'checkout_billing';
  if (hasOnboarding) return 'saas_onboarding';
  if (hasProduct && !hasCheckout) return 'lead_gen';
  if (hasSupport && surfaceTypes.length <= 3) return 'support_reassurance';
  return 'informational';
}

/**
 * Aggregate a batch of raw events into a session summary.
 */
export function aggregateSession(batch: RawBehavioralBatch): SessionAggregate {
  const events = batch.events.sort((a, b) => a.ts - b.ts);

  const surfaceProgression: string[] = [];
  const surfaceTypes: SurfacePageType[] = [];
  let checkoutReached = false;
  let formStarted = false;
  let formCompleted = false;
  let supportOpened = false;
  let policyOpened = false;
  let backtrackCount = 0;
  let deadClickCount = 0;
  let maxScrollDepth = 0;
  let reachedThankYou = false;

  // Phase 4B Hardening
  let highestMilestone: CanonicalMilestone | null = null;
  let confirmationSeen = false;
  let firstCommercialActionTs: number | null = null;
  let intentTs: number | null = null;
  let conversionStartTs: number | null = null;
  let confirmationTs: number | null = null;

  let ctaViewedCount = 0;
  let ctaClickedCount = 0;
  let ctaRenderedLateCount = 0;

  let hesitationPauseCount = 0;
  let rapidBacktrackCount = 0;
  let formRetryCount = 0;
  let inputFocusAbandonCount = 0;

  const fieldInventories: FieldInventory[] = [];
  const sensitiveInputAbandonKinds: FieldKind[] = [];

  let handoffStarted = false;
  let handoffReturned = false;
  let handoffConfirmed = false;
  let handoffTargetHost: string | null = null;

  const surfacePairCounts = new Map<string, { a: string; b: string; count: number; typeA: SurfacePageType; typeB: SurfacePageType }>();

  let policyBeforeConversion = false;
  let pricingThenBacktrack = false;
  let pricingSeen = false;
  let policyOpenedAfterIntent = false;

  let formErrorCount = 0;
  let lastExitPage: string | undefined;

  // The following event types are collected by vestigio.js but intentionally
  // not aggregated into SessionAggregate. They serve as raw evidence for
  // future analysis but don't currently feed into findings:
  //
  // - backtrack: navigation back (covered by rapid_backtrack which IS handled)
  // - heartbeat: keepalive pings (used for session timeout, not analysis)
  // - step_reached: funnel step progression (covered by milestone tracking)
  // - order_bump_seen / order_bump_accept: (future: upsell/cross-sell analysis)
  // - upsell_seen / upsell_accept: (future: post-purchase monetization analysis)

  for (const event of events) {
    const surface = normalizeSurface(event.url);

    switch (event.type) {
      case 'page_view':
      case 'route_change': {
        const lastSurface = surfaceProgression[surfaceProgression.length - 1];
        if (surface.surface_id !== lastSurface) {
          // Check for backtrack
          if (surfaceProgression.length >= 2 && surfaceProgression[surfaceProgression.length - 2] === surface.surface_id) {
            backtrackCount++;
          }
          surfaceProgression.push(surface.surface_id);
          surfaceTypes.push(surface.page_type);

          // Oscillation detection
          if (surfaceProgression.length >= 3) {
            const prev = surfaceProgression[surfaceProgression.length - 3];
            if (prev === surface.surface_id && prev !== lastSurface) {
              const pairKey = [prev, lastSurface].sort().join('::');
              const existing = surfacePairCounts.get(pairKey);
              if (existing) {
                existing.count++;
              } else {
                const prevType = surfaceTypes[surfaceTypes.length - 3] || 'unknown';
                const lastType = surfaceTypes[surfaceTypes.length - 2] || 'unknown';
                surfacePairCounts.set(pairKey, { a: prev, b: lastSurface!, count: 1, typeA: prevType, typeB: lastType });
              }
            }
          }
        }
        if (surface.page_type === 'checkout') {
          checkoutReached = true;
          if (!conversionStartTs) conversionStartTs = event.ts;
        }
        if (surface.page_type === 'thank_you') reachedThankYou = true;
        if (surface.page_type === 'pricing') pricingSeen = true;

        // Milestone progression
        const milestone = classifyMilestoneFromPageType(surface.page_type);
        if (milestone) highestMilestone = advanceMilestone(highestMilestone, milestone);
        if (milestone === 'intent_expressed' && !intentTs) intentTs = event.ts;
        if (milestone === 'conversion_started' && !conversionStartTs) conversionStartTs = event.ts;
        break;
      }
      case 'form_start': {
        formStarted = true;
        if (!firstCommercialActionTs) firstCommercialActionTs = event.ts;
        break;
      }
      case 'form_submit': formCompleted = true; break;
      case 'support_open': {
        supportOpened = true;
        if (milestoneIndex(highestMilestone) >= milestoneIndex('intent_expressed')) {
          // Support opened after intent — late discovery
        }
        break;
      }
      case 'policy_open': {
        policyOpened = true;
        if (milestoneIndex(highestMilestone) >= milestoneIndex('intent_expressed') && !conversionStartTs) {
          policyOpenedAfterIntent = true;
          policyBeforeConversion = true;
        }
        break;
      }
      case 'dead_click': deadClickCount += (event.data.count as number) || 1; break;
      case 'checkout_open': {
        checkoutReached = true;
        if (!firstCommercialActionTs) firstCommercialActionTs = event.ts;
        if (!conversionStartTs) conversionStartTs = event.ts;
        highestMilestone = advanceMilestone(highestMilestone, 'conversion_started');
        break;
      }
      case 'cta_click': {
        ctaClickedCount++;
        if (!firstCommercialActionTs) firstCommercialActionTs = event.ts;
        highestMilestone = advanceMilestone(highestMilestone, 'intent_expressed');
        if (!intentTs) intentTs = event.ts;
        break;
      }
      case 'scroll_depth': {
        const depth = (event.data.depth_pct as number) || 0;
        if (depth > maxScrollDepth) maxScrollDepth = depth;
        break;
      }
      // Phase 4B Hardening events
      case 'confirmation_seen': {
        confirmationSeen = true;
        confirmationTs = event.ts;
        reachedThankYou = true;
        highestMilestone = advanceMilestone(highestMilestone, 'conversion_completed');
        break;
      }
      case 'cta_viewed': {
        ctaViewedCount++;
        break;
      }
      case 'cta_rendered_late': {
        ctaRenderedLateCount++;
        break;
      }
      case 'hesitation_pause': {
        hesitationPauseCount++;
        break;
      }
      case 'rapid_backtrack': {
        rapidBacktrackCount++;
        // Check pricing then backtrack
        if (pricingSeen) pricingThenBacktrack = true;
        break;
      }
      case 'form_retry': {
        formRetryCount++;
        break;
      }
      case 'input_focus_abandon': {
        inputFocusAbandonCount++;
        const kind = event.data.field_kind as FieldKind;
        if (kind && sensitiveInputAbandonKinds.indexOf(kind) === -1) {
          sensitiveInputAbandonKinds.push(kind);
        }
        break;
      }
      case 'field_inventory': {
        fieldInventories.push({
          field_count: (event.data.field_count as number) || 0,
          field_kinds: (event.data.field_kinds as FieldKind[]) || [],
          has_sensitive_fields: (event.data.has_sensitive as boolean) || false,
          has_password: (event.data.has_password as boolean) || false,
          has_card_like: (event.data.has_card_like as boolean) || false,
          has_freeform_message: (event.data.has_freeform_message as boolean) || false,
        });
        break;
      }
      case 'trusted_handoff': {
        handoffStarted = true;
        handoffTargetHost = (event.data.target_host as string) || null;
        break;
      }
      case 'form_error': {
        // Track form error count — feeds into friction analysis
        formErrorCount++;
        break;
      }
      case 'page_leave': {
        // Track the last page before exit — useful for drop-off analysis
        if (event.url) lastExitPage = event.url;
        break;
      }
    }
  }

  // Handle handoff return detection — only count a true navigation event
  // (page_view or route_change) after the handoff as a "return". Heartbeats,
  // scroll_depth pings, and other background events do NOT indicate the user
  // actually came back from the payment provider.
  if (handoffStarted) {
    const handoffIdx = events.findIndex(e => e.type === 'trusted_handoff');
    if (handoffIdx >= 0) {
      const hasReturnNavigation = events.slice(handoffIdx + 1).some(
        e => e.type === 'page_view' || e.type === 'route_change'
      );
      handoffReturned = hasReturnNavigation;
      if (handoffReturned && confirmationSeen) handoffConfirmed = true;
    }
  }

  const startTs = events.length > 0 ? events[0].ts : Date.now();
  const endTs = events.length > 0 ? events[events.length - 1].ts : Date.now();

  // Build oscillation pairs
  const oscillationPairs: SurfacePair[] = [];
  for (const [, pair] of surfacePairCounts) {
    if (pair.count >= 2) {
      oscillationPairs.push({
        surface_a: pair.a,
        surface_b: pair.b,
        oscillation_count: pair.count,
        page_type_a: pair.typeA,
        page_type_b: pair.typeB,
      });
    }
  }

  return {
    session_id: batch.session_id,
    env_id: batch.env_id,
    surface_progression: surfaceProgression,
    attribution: {
      first_touch: batch.attribution,
      latest_touch: batch.attribution,
      touch_count: 1,
    },
    checkout_reached: checkoutReached,
    form_started: formStarted,
    form_completed: formCompleted,
    support_opened: supportOpened,
    policy_opened: policyOpened,
    backtrack_count: backtrackCount,
    dead_click_count: deadClickCount,
    max_scroll_depth: maxScrollDepth,
    session_duration_ms: endTs - startTs,
    reached_thank_you: reachedThankYou,
    started_at: new Date(startTs),
    ended_at: new Date(endTs),

    // Phase 4B Hardening
    highest_milestone: highestMilestone,
    confirmation_seen: confirmationSeen,
    time_to_first_commercial_action_ms: firstCommercialActionTs ? firstCommercialActionTs - startTs : null,
    time_intent_to_conversion_ms: intentTs && conversionStartTs ? conversionStartTs - intentTs : null,
    time_conversion_to_confirmation_ms: conversionStartTs && confirmationTs ? confirmationTs - conversionStartTs : null,

    cta_viewed_count: ctaViewedCount,
    cta_clicked_count: ctaClickedCount,
    cta_rendered_late_count: ctaRenderedLateCount,

    hesitation_pause_count: hesitationPauseCount,
    // rapid_backtrack_count is NEVER a standalone finding explanation.
    // It feeds compound signals only (e.g., pricing_then_backtrack → pricing_hesitation).
    rapid_backtrack_count: rapidBacktrackCount,
    form_retry_count: formRetryCount,
    input_focus_abandon_count: inputFocusAbandonCount,

    field_inventories: fieldInventories,
    sensitive_input_abandon_kinds: sensitiveInputAbandonKinds,

    handoff_started: handoffStarted,
    handoff_returned: handoffReturned,
    handoff_confirmed: handoffConfirmed,
    handoff_target_host: handoffTargetHost,

    oscillation_pairs: oscillationPairs,

    policy_before_conversion: policyBeforeConversion,
    pricing_then_backtrack: pricingThenBacktrack,

    journey_type: classifyJourneyFromProgression(surfaceTypes),

    form_errors: formErrorCount || undefined,
    last_exit_page: lastExitPage,
  };
}

/**
 * Extract surface vitality signals from heartbeat events.
 */
export function extractVitalityFromEvents(
  events: RawBehavioralEvent[],
): Map<string, SurfaceVitality> {
  const vitality = new Map<string, SurfaceVitality>();

  const heartbeats = events.filter(e => e.type === 'heartbeat');
  const pageViews = events.filter(e => e.type === 'page_view' || e.type === 'route_change');

  const sessionsBySurface = new Map<string, Set<string>>();
  for (const e of pageViews) {
    const s = normalizeSurface(e.url);
    const sessions = sessionsBySurface.get(s.surface_id) || new Set();
    sessions.add(e.session_id);
    sessionsBySurface.set(s.surface_id, sessions);
  }

  for (const hb of heartbeats) {
    const s = normalizeSurface(hb.url);
    const timing = (hb.data.timing as any) || {};
    const jsErrors = (hb.data.js_error_count as number) || 0;
    const resourceErrors = (hb.data.resource_error_count as number) || 0;
    const sessions = sessionsBySurface.get(s.surface_id)?.size || 0;

    vitality.set(s.surface_id, {
      surface_id: s.surface_id,
      is_live: true,
      last_heartbeat_at: new Date(hb.ts),
      avg_dom_ready_ms: timing.dom_ready_ms || null,
      avg_load_ms: timing.load_ms || null,
      js_error_rate: sessions > 0 ? jsErrors / sessions : 0,
      resource_error_rate: sessions > 0 ? resourceErrors / sessions : 0,
      session_count_24h: sessions,
    });
  }

  return vitality;
}

/**
 * Analyze funnel progression from aggregated sessions.
 */
export function analyzeFunnel(
  sessions: SessionAggregate[],
  funnelSteps: string[],
): FunnelAnalysis {
  if (funnelSteps.length === 0 || sessions.length === 0) {
    return { funnel_id: 'default', steps: [], total_sessions: 0, completion_rate: 0 };
  }

  const steps: FunnelStep[] = funnelSteps.map((surfaceId, index) => {
    const sessionsReachingStep = sessions.filter(s =>
      s.surface_progression.includes(surfaceId),
    );

    const nextStep = funnelSteps[index + 1];
    const sessionsReachingNext = nextStep
      ? sessions.filter(s => s.surface_progression.includes(nextStep))
      : sessionsReachingStep;

    const dropOff = sessionsReachingStep.length > 0
      ? 1 - (sessionsReachingNext.length / sessionsReachingStep.length)
      : 0;

    const backtracking = sessionsReachingStep.filter(s => s.backtrack_count > 0);
    const backtrackRate = sessionsReachingStep.length > 0
      ? backtracking.length / sessionsReachingStep.length
      : 0;

    return {
      surface_id: surfaceId,
      step_index: index,
      session_count: sessionsReachingStep.length,
      drop_off_rate: Math.round(dropOff * 10000) / 10000,
      backtrack_rate: Math.round(backtrackRate * 10000) / 10000,
      avg_time_on_step_ms: 0,
    };
  });

  const totalSessions = sessions.length;
  const lastStep = funnelSteps[funnelSteps.length - 1];
  const completions = sessions.filter(s => s.surface_progression.includes(lastStep));
  const completionRate = totalSessions > 0 ? completions.length / totalSessions : 0;

  return {
    funnel_id: 'default',
    steps,
    total_sessions: totalSessions,
    completion_rate: Math.round(completionRate * 10000) / 10000,
  };
}

// ──────────────────────────────────────────────
// Cohort Aggregation
//
// Segments SessionAggregate[] into audience cohorts
// and computes per-cohort behavioral metrics.
// Powers pixel-dependent workspaces.
// ──────────────────────────────────────────────

function isPaidSession(s: SessionAggregate): boolean {
  const ft = s.attribution.first_touch;
  return !!(ft.gclid || ft.fbclid || ft.campaign);
}

function isMobileSession(s: SessionAggregate): boolean {
  // Mobile detection heuristic for when no external deviceClassifier is provided.
  // The pixel stores viewport_width in heartbeat data and device_type if available.
  // Since SessionAggregate doesn't carry raw event data, this function uses
  // behavioral heuristics as a fallback. The primary mobile detection path is
  // the deviceClassifier passed to aggregateCohorts() (uses user-agent regex).
  //
  // Heuristic indicators of mobile sessions:
  // - Short surface progressions (mobile users navigate less)
  // - Higher dead click counts (fat-finger taps on mobile)
  // - Very short session durations with form abandonment
  //
  // This is intentionally conservative: false negatives are acceptable;
  // false positives would contaminate the desktop cohort.
  const shortProgression = s.surface_progression.length <= 2;
  const highDeadClicks = s.dead_click_count >= 3;
  const shortWithAbandon = s.session_duration_ms < 60_000 && s.form_started && !s.form_completed;

  return shortProgression && highDeadClicks && shortWithAbandon;
}

function computeCohortSlice(sessions: SessionAggregate[]): BehavioralCohortSlice {
  const count = sessions.length;
  if (count === 0) {
    return {
      session_count: 0,
      conversion_rate: 0,
      checkout_reached_rate: 0,
      avg_time_to_first_commercial_action_ms: null,
      avg_time_intent_to_conversion_ms: null,
      backtrack_rate: 0,
      dead_click_rate: 0,
      hesitation_pause_rate: 0,
      form_retry_rate: 0,
      input_focus_abandon_rate: 0,
      cta_viewed_count: 0,
      cta_clicked_count: 0,
      cta_engagement_rate: 0,
      cta_rendered_late_count: 0,
      policy_opened_rate: 0,
      policy_then_abandon_rate: 0,
      support_opened_rate: 0,
      sensitive_input_abandon_rate: 0,
      sensitive_input_abandon_top_kinds: [],
      surface_oscillation_rate: 0,
      avg_surface_progression_length: 0,
      milestone_awareness_count: 0,
      milestone_consideration_count: 0,
      milestone_intent_count: 0,
      milestone_conversion_start_count: 0,
      milestone_conversion_complete_count: 0,
      handoff_without_return_rate: 0,
      pricing_backtrack_rate: 0,
      policy_detour_before_conversion_rate: 0,
    };
  }

  const conversions = sessions.filter(s => s.reached_thank_you || s.confirmation_seen).length;
  const checkoutReached = sessions.filter(s => s.checkout_reached).length;
  const backtrackers = sessions.filter(s => s.backtrack_count > 0).length;
  const deadClickers = sessions.filter(s => s.dead_click_count > 0).length;
  const hesitators = sessions.filter(s => s.hesitation_pause_count > 0).length;
  const formRetriers = sessions.filter(s => s.form_retry_count > 0).length;
  const inputAbandon = sessions.filter(s => s.input_focus_abandon_count > 0).length;
  const policyOpened = sessions.filter(s => s.policy_opened).length;
  const policyThenAbandon = sessions.filter(s => s.policy_opened && !s.reached_thank_you && !s.confirmation_seen).length;
  const supportOpened = sessions.filter(s => s.support_opened).length;
  const sensitiveAbandon = sessions.filter(s => s.sensitive_input_abandon_kinds.length > 0).length;
  const oscillators = sessions.filter(s => s.oscillation_pairs.length > 0).length;
  const handoffWithout = sessions.filter(s => s.handoff_started && !s.handoff_returned).length;
  const pricingBacktrack = sessions.filter(s => s.pricing_then_backtrack).length;
  const policyDetour = sessions.filter(s => s.policy_before_conversion).length;

  let totalCtaViewed = 0;
  let totalCtaClicked = 0;
  let totalCtaLate = 0;
  let totalProgressionLen = 0;
  let timeToFirstCommercialSum = 0;
  let timeToFirstCommercialCount = 0;
  let timeIntentToConvSum = 0;
  let timeIntentToConvCount = 0;

  const kindCounts = new Map<FieldKind, number>();
  const milestoneCounts = { awareness: 0, consideration: 0, intent: 0, conversion_start: 0, conversion_complete: 0 };

  for (const s of sessions) {
    totalCtaViewed += s.cta_viewed_count;
    totalCtaClicked += s.cta_clicked_count;
    totalCtaLate += s.cta_rendered_late_count;
    totalProgressionLen += s.surface_progression.length;

    if (s.time_to_first_commercial_action_ms !== null) {
      timeToFirstCommercialSum += s.time_to_first_commercial_action_ms;
      timeToFirstCommercialCount++;
    }
    if (s.time_intent_to_conversion_ms !== null) {
      timeIntentToConvSum += s.time_intent_to_conversion_ms;
      timeIntentToConvCount++;
    }

    for (const kind of s.sensitive_input_abandon_kinds) {
      kindCounts.set(kind, (kindCounts.get(kind) || 0) + 1);
    }

    const mi = s.highest_milestone;
    if (mi) {
      if (milestoneIndex(mi) >= 0) milestoneCounts.awareness++;
      if (milestoneIndex(mi) >= 1) milestoneCounts.consideration++;
      if (milestoneIndex(mi) >= 2) milestoneCounts.intent++;
      if (milestoneIndex(mi) >= 3) milestoneCounts.conversion_start++;
      if (milestoneIndex(mi) >= 4) milestoneCounts.conversion_complete++;
    }
  }

  const topKinds = [...kindCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  return {
    session_count: count,
    conversion_rate: round4(conversions / count),
    checkout_reached_rate: round4(checkoutReached / count),
    avg_time_to_first_commercial_action_ms: timeToFirstCommercialCount > 0
      ? Math.round(timeToFirstCommercialSum / timeToFirstCommercialCount) : null,
    avg_time_intent_to_conversion_ms: timeIntentToConvCount > 0
      ? Math.round(timeIntentToConvSum / timeIntentToConvCount) : null,
    backtrack_rate: round4(backtrackers / count),
    dead_click_rate: round4(deadClickers / count),
    hesitation_pause_rate: round4(hesitators / count),
    form_retry_rate: round4(formRetriers / count),
    input_focus_abandon_rate: round4(inputAbandon / count),
    cta_viewed_count: totalCtaViewed,
    cta_clicked_count: totalCtaClicked,
    cta_engagement_rate: totalCtaViewed > 0 ? round4(totalCtaClicked / totalCtaViewed) : 0,
    cta_rendered_late_count: totalCtaLate,
    policy_opened_rate: round4(policyOpened / count),
    policy_then_abandon_rate: round4(policyThenAbandon / count),
    support_opened_rate: round4(supportOpened / count),
    sensitive_input_abandon_rate: round4(sensitiveAbandon / count),
    sensitive_input_abandon_top_kinds: topKinds,
    surface_oscillation_rate: round4(oscillators / count),
    avg_surface_progression_length: round4(totalProgressionLen / count),
    milestone_awareness_count: milestoneCounts.awareness,
    milestone_consideration_count: milestoneCounts.consideration,
    milestone_intent_count: milestoneCounts.intent,
    milestone_conversion_start_count: milestoneCounts.conversion_start,
    milestone_conversion_complete_count: milestoneCounts.conversion_complete,
    handoff_without_return_rate: sessions.filter(s => s.handoff_started).length > 0
      ? round4(handoffWithout / sessions.filter(s => s.handoff_started).length) : 0,
    pricing_backtrack_rate: round4(pricingBacktrack / count),
    policy_detour_before_conversion_rate: round4(policyDetour / count),
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/**
 * Aggregate sessions into cohort-level behavioral slices.
 *
 * @param sessions All session aggregates for the environment
 * @param deviceClassifier Optional function to classify session as mobile/desktop.
 *   Receives the session and returns 'mobile' | 'desktop' | null.
 *   If not provided, all sessions are classified as desktop.
 */
export function aggregateCohorts(
  sessions: SessionAggregate[],
  deviceClassifier?: (s: SessionAggregate) => 'mobile' | 'desktop' | null,
): BehavioralCohortPayload {
  const firstSessions: SessionAggregate[] = [];
  const returningSessions: SessionAggregate[] = [];
  const paidSessions: SessionAggregate[] = [];
  const organicSessions: SessionAggregate[] = [];
  const mobileSessions: SessionAggregate[] = [];
  const desktopSessions: SessionAggregate[] = [];

  for (const s of sessions) {
    // First vs returning
    if (s.attribution.touch_count <= 1) {
      firstSessions.push(s);
    } else {
      returningSessions.push(s);
    }

    // Paid vs organic
    if (isPaidSession(s)) {
      paidSessions.push(s);
    } else {
      organicSessions.push(s);
    }

    // Mobile vs desktop
    const device = deviceClassifier ? deviceClassifier(s) : 'desktop';
    if (device === 'mobile') {
      mobileSessions.push(s);
    } else {
      desktopSessions.push(s);
    }
  }

  return {
    type: 'behavioral_cohort',
    total_session_count: sessions.length,
    cohorts: {
      first_session: computeCohortSlice(firstSessions),
      returning: computeCohortSlice(returningSessions),
      paid_traffic: computeCohortSlice(paidSessions),
      organic_traffic: computeCohortSlice(organicSessions),
      mobile: computeCohortSlice(mobileSessions),
      desktop: computeCohortSlice(desktopSessions),
    },
  };
}
