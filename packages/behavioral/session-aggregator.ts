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
    }
  }

  // Handle handoff return detection (if we have events after handoff)
  if (handoffStarted) {
    const handoffIdx = events.findIndex(e => e.type === 'trusted_handoff');
    if (handoffIdx >= 0 && handoffIdx < events.length - 1) {
      handoffReturned = true;
      if (confirmationSeen) handoffConfirmed = true;
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
