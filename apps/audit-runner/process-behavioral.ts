import { prisma } from "@/libs/prismaDb";
import { aggregateSession, aggregateCohorts } from "../../packages/behavioral";
import type {
  RawBehavioralEvent as RawEventShape,
  RawBehavioralBatch,
  SessionAggregate,
  AttributionContext,
  MultiTouchAttribution,
  SurfacePair,
  FieldKind,
  BehavioralCohortPayload,
} from "../../packages/behavioral/types";
import {
  Evidence,
  EvidenceType,
  FreshnessState,
  SourceKind,
  CollectionMethod,
  Scoping,
  BehavioralSessionPayload,
} from "../../packages/domain";

// ──────────────────────────────────────────────
// Behavioral Event Processor — Wave 0.3
//
// Reads RawBehavioralEvent rows persisted by Wave 0.2's ingest endpoint,
// reconstructs per-session batches, runs aggregateSession() to produce
// SessionAggregate[], reduces those into a single BehavioralSessionPayload,
// and emits it as Evidence so the engine can pick it up on the next
// recomputeAll() call.
//
// Called inline from apps/audit-runner/run-cycle.ts BEFORE recomputeAll().
// This is the cleanest hookup point because:
//   - the cycle_ref is already known
//   - the new evidence flows straight into the same engine pass
//   - no race conditions with the snapshot/findings persistence
//   - works without an extra cron
//
// Time window: every cycle re-aggregates the LAST 30 DAYS of events for
// the env. processedAt is set on touched rows but is informational only
// (used by retention prune); it does not gate the read query. Old events
// are deleted by the receivedAt-based prune in instrumentation-node.
//
// Behavioral evidence is eligibility-gated by the engine itself via
// session_count >= 20 (see packages/classification/eligibility.ts), so
// emitting under that threshold is harmless — the engine simply skips
// behavioral inferences when there aren't enough sessions.
// ──────────────────────────────────────────────

// Wave 5 Fase 3 — cycle-mode-aware windowing. Hot cycles look at the
// last hour (short tail, fresh friction signal). Warm looks at the last
// day. Cold holds the legacy 30-day baseline for cohort statistics.
// Callers that don't pass a window fall back to the 30-day default so
// the legacy full-audit path is unchanged.
const DEFAULT_WINDOW_HOURS = 24 * 30;
const MAX_SESSIONS_PER_RUN = 10_000; // safety cap
const QUALITY_SCORE = 80; // first-party data, no inference — high trust

let evidenceCounter = 0;
function nextEvidenceId(): string {
  return `ev_pixel_${Date.now()}_${++evidenceCounter}`;
}

// ──────────────────────────────────────────────
// Public entry point
// ──────────────────────────────────────────────

export interface ProcessBehavioralResult {
  evidence: Evidence[];
  sessionCount: number;
  eventCount: number;
}

/**
 * Process behavioral pixel events for one environment and return Evidence
 * to be appended to the audit cycle's evidence pool.
 *
 * Returns an empty result (no evidence) when there are no events in the
 * window. The engine handles the empty case gracefully.
 */
export async function processBehavioralEventsForEnv(
  envId: string,
  scoping: Scoping,
  cycleRef: string,
  // Wave 5 Fase 3 — allow the runner to scope the behavioral window
  // per cycleType. Optional for backwards compat; defaults to 30d.
  windowHours?: number,
): Promise<ProcessBehavioralResult> {
  const hours = windowHours && windowHours > 0 ? windowHours : DEFAULT_WINDOW_HOURS;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  let rows;
  try {
    rows = await prisma.rawBehavioralEvent.findMany({
      where: { envId, occurredAt: { gte: since } },
      orderBy: [{ sessionId: "asc" }, { occurredAt: "asc" }],
      take: MAX_SESSIONS_PER_RUN * 100, // generous per-row cap; ~100 events/session
    });
  } catch (err) {
    console.warn(`[process-behavioral] read failed for env ${envId}:`, err);
    return { evidence: [], sessionCount: 0, eventCount: 0 };
  }

  if (rows.length === 0) {
    return { evidence: [], sessionCount: 0, eventCount: 0 };
  }

  // ── Group rows by sessionId ──
  // Rows are already sorted by (sessionId, occurredAt) so a single linear
  // pass produces ordered batches. We also collect the chronologically
  // first attribution row per session for first-touch semantics, and the
  // first non-null user-agent for the device classifier (Wave 0.3 cohorts).
  const sessionMap = new Map<string, { events: RawEventShape[]; attribution: AttributionContext | null }>();
  const sessionUserAgent = new Map<string, string>();
  const touchedRowIds: string[] = [];

  for (const row of rows) {
    touchedRowIds.push(row.id);
    if (sessionMap.size >= MAX_SESSIONS_PER_RUN && !sessionMap.has(row.sessionId)) {
      continue; // safety cap reached — skip new sessions
    }

    let bucket = sessionMap.get(row.sessionId);
    if (!bucket) {
      bucket = { events: [], attribution: null };
      sessionMap.set(row.sessionId, bucket);
    }

    // Capture user-agent once per session for the device classifier.
    // Mobile/desktop split powers acquisition_integrity + mobile_revenue
    // workspaces. Without this, every session would land in 'desktop'.
    if (!sessionUserAgent.has(row.sessionId) && row.userAgent) {
      sessionUserAgent.set(row.sessionId, row.userAgent);
    }

    // Decode the stored payload — Wave 0.2's sanitizer wrote it
    let parsed: RawEventShape | null = null;
    try {
      parsed = JSON.parse(row.payload) as RawEventShape;
    } catch {
      continue; // malformed row — skip silently
    }
    if (!parsed) continue;

    bucket.events.push({
      type: parsed.type,
      ts: parsed.ts,
      session_id: parsed.session_id || row.sessionId,
      env_id: parsed.env_id || row.envId,
      url: parsed.url || row.url,
      data: parsed.data || {},
    });

    // First non-null attribution wins (Wave 0.2 only stores it on the
    // first row of each batch, so this is usually a no-op past row 0).
    if (!bucket.attribution && row.attribution) {
      try {
        bucket.attribution = JSON.parse(row.attribution) as AttributionContext;
      } catch {
        // ignore — fall back to empty attribution below
      }
    }
  }

  // ── Run aggregateSession() per session ──
  const aggregates: SessionAggregate[] = [];
  for (const [sessionId, bucket] of sessionMap.entries()) {
    if (bucket.events.length === 0) continue;
    const batch: RawBehavioralBatch = {
      events: bucket.events,
      attribution: bucket.attribution || EMPTY_ATTRIBUTION,
      session_id: sessionId,
      env_id: envId,
    };
    try {
      aggregates.push(aggregateSession(batch));
    } catch (err) {
      console.warn(`[process-behavioral] aggregateSession failed for session ${sessionId}:`, err);
    }
  }

  if (aggregates.length === 0) {
    return { evidence: [], sessionCount: 0, eventCount: rows.length };
  }

  // ── Reduce to BehavioralSessionPayload (env-level metrics) ──
  // Pass the device classifier so mobile_session_count is populated.
  const deviceClassifier = (s: SessionAggregate): "mobile" | "desktop" | null => {
    const ua = sessionUserAgent.get(s.session_id);
    if (!ua) return "desktop"; // unknown UA → conservative default
    return MOBILE_UA_REGEX.test(ua) ? "mobile" : "desktop";
  };
  const sessionPayload = sessionsToBehavioralPayload(aggregates, deviceClassifier);

  // ── Reduce to BehavioralCohortPayload (cohort-level metrics) ──
  // Powers the 7 pixel-dependent workspaces (first_impression, action_value,
  // acquisition_integrity, mobile_revenue, friction_tax, trust_gap,
  // path_efficiency). The signal extractor in packages/signals/engine.ts
  // looks for `payload.type === 'behavioral_cohort'` and bails out if it
  // doesn't find one — without this second evidence entry the cohort
  // signals never fire and the 7 workspaces stay empty.
  const cohortPayload = aggregateCohorts(aggregates, deviceClassifier);

  // ── Mark rows as processed (informational; retention uses receivedAt) ──
  if (touchedRowIds.length > 0) {
    try {
      await prisma.rawBehavioralEvent.updateMany({
        where: { id: { in: touchedRowIds } },
        data: { processedAt: new Date() },
      });
    } catch (err) {
      console.warn(`[process-behavioral] processedAt update failed for env ${envId}:`, err);
      // Non-fatal — the next cycle re-aggregates the same window anyway.
    }
  }

  // ── Wrap both as Evidence ──
  // Both evidences share evidence_type=BehavioralSession but differ in
  // payload.type. The signal extractors discriminate on payload.type:
  // the env-level extractor reads 'behavioral_session', the cohort
  // extractor reads 'behavioral_cohort'.
  const sessionEvidence = wrapAsEvidence(sessionPayload, scoping, cycleRef, hours);
  const cohortEvidence = wrapAsEvidence(cohortPayload, scoping, cycleRef, hours);
  return {
    evidence: [sessionEvidence, cohortEvidence],
    sessionCount: aggregates.length,
    eventCount: rows.length,
  };
}

// Conservative mobile UA detection. Doesn't try to be exhaustive — covers
// the major mobile browsers and lets everything else fall through to
// desktop. The cohort signals only fire when both mobile and desktop
// cohorts have >= 10 sessions, so a few miss-classifications don't poison
// the inference.
const MOBILE_UA_REGEX = /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i;

const EMPTY_ATTRIBUTION: AttributionContext = {
  source: null,
  medium: null,
  campaign: null,
  referrer: null,
  landing_url: null,
  gclid: null,
  fbclid: null,
};

// ──────────────────────────────────────────────
// Pure reducer: SessionAggregate[] → BehavioralSessionPayload
// ──────────────────────────────────────────────

/**
 * Compress N session aggregates into the single env-level payload the
 * engine expects. All counts are absolute. Rates are count/session_count
 * in [0, 1]. Average durations skip null contributors.
 *
 * This is the only place that translates the SessionAggregate vocabulary
 * (per-session) into the BehavioralSessionPayload vocabulary (per-env).
 * Keep it pure — no DB, no clock, no globals — so it's trivially testable.
 */
export function sessionsToBehavioralPayload(
  sessions: SessionAggregate[],
  deviceClassifier?: (s: SessionAggregate) => "mobile" | "desktop" | null,
): BehavioralSessionPayload {
  const n = sessions.length;
  if (n === 0) return EMPTY_PAYLOAD;

  // Counters
  let checkoutReached = 0;
  let conversion = 0;
  let supportOpened = 0;
  let policyOpened = 0;
  let backtrack = 0;
  let deadClick = 0;
  let confirmation = 0;

  let supportAfterCheckout = 0;
  let policyThenAbandon = 0;
  let highIntentDetour = 0;
  let retryThenAbandon = 0;

  let mobile = 0;
  let mobileFirstActionFail = 0;
  let stalledStep = 0; // surfaces that appear in many sessions but no advancement

  // Phase 4B Hardening
  let mileAware = 0;
  let mileConsider = 0;
  let mileIntent = 0;
  let mileConvStart = 0;
  let mileConvComplete = 0;

  let firstActionTotal = 0;
  let firstActionContribs = 0;
  let intentToConvTotal = 0;
  let intentToConvContribs = 0;

  let hesitationBeforeCta = 0;
  let pricingThenHesitation = 0;
  let pricingBacktrack = 0;
  let policyDetourBeforeConv = 0;

  let ctaViewed = 0;
  let ctaClicked = 0;
  let ctaRenderedLate = 0;

  let formRetry = 0;
  let formExcessive = 0;

  let sensitiveAbandon = 0;
  const sensitiveAbandonKindCounts = new Map<FieldKind, number>();

  let oscillation = 0;
  const pairCounts = new Map<string, { a: string; b: string; count: number }>();

  let conversionRetry = 0;
  let checkoutImmediateAbandon = 0;

  let handoffNoReturn = 0;
  let handoffNoConfirm = 0;

  let sensitiveFieldDropoff = 0;
  const sensitiveFieldDropoffKindCounts = new Map<FieldKind, number>();

  let sessionDurationTotal = 0;

  // Stalled step detection: surface seen by many sessions, few advance.
  // Approximated as: surfaces that appear at the END of progression for
  // many sessions (i.e. last surface visited) but where the session did
  // not reach thank-you. We tally per-surface and count the surfaces
  // whose dead-end count >= 3.
  const surfaceDeadEnds = new Map<string, number>();

  for (const s of sessions) {
    if (s.checkout_reached) checkoutReached++;
    if (s.reached_thank_you) conversion++;
    if (s.support_opened) supportOpened++;
    if (s.policy_opened) policyOpened++;
    if (s.backtrack_count > 0) backtrack++;
    if (s.dead_click_count > 0) deadClick++;
    if (s.confirmation_seen) confirmation++;

    if (s.support_opened && s.checkout_reached) supportAfterCheckout++;
    if (s.policy_opened && !s.reached_thank_you) policyThenAbandon++;
    if (s.checkout_reached && s.policy_opened && !s.reached_thank_you) highIntentDetour++;
    if (s.form_retry_count > 0 && !s.reached_thank_you) retryThenAbandon++;

    sessionDurationTotal += s.session_duration_ms;

    // Mobile classification — uses the passed-in device classifier
    // (resolves Bug: mobile_session_count always 0)
    if (deviceClassifier) {
      const device = deviceClassifier(s);
      if (device === "mobile") {
        mobile++;
        // Mobile first-action failure: mobile session that started a form
        // or clicked a CTA but did not reach checkout/thank-you
        if (
          (s.form_started || s.cta_clicked_count > 0) &&
          !s.checkout_reached &&
          !s.reached_thank_you
        ) {
          mobileFirstActionFail++;
        }
      }
    }

    // Milestones
    switch (s.highest_milestone) {
      case "post_conversion_seen":
      case "conversion_completed":
        mileConvComplete++;
      // fallthrough
      case "conversion_started":
        mileConvStart++;
      // fallthrough
      case "intent_expressed":
        mileIntent++;
      // fallthrough
      case "consideration_started":
        mileConsider++;
      // fallthrough
      case "awareness_seen":
        mileAware++;
        break;
      default:
        break;
    }

    if (s.time_to_first_commercial_action_ms != null) {
      firstActionTotal += s.time_to_first_commercial_action_ms;
      firstActionContribs++;
    }
    if (s.time_intent_to_conversion_ms != null) {
      intentToConvTotal += s.time_intent_to_conversion_ms;
      intentToConvContribs++;
    }

    if (s.hesitation_pause_count > 0 && s.cta_viewed_count > 0) hesitationBeforeCta++;
    if (s.pricing_then_backtrack && s.hesitation_pause_count > 0) pricingThenHesitation++;
    if (s.pricing_then_backtrack) pricingBacktrack++;
    if (s.policy_before_conversion) policyDetourBeforeConv++;

    ctaViewed += s.cta_viewed_count;
    ctaClicked += s.cta_clicked_count;
    ctaRenderedLate += s.cta_rendered_late_count;

    if (s.form_retry_count > 0) formRetry++;
    for (const inv of s.field_inventories) {
      if (inv.field_count > 6 || inv.has_sensitive_fields) formExcessive++;
    }

    if (s.sensitive_input_abandon_kinds.length > 0) {
      sensitiveAbandon++;
      for (const kind of s.sensitive_input_abandon_kinds) {
        sensitiveAbandonKindCounts.set(kind, (sensitiveAbandonKindCounts.get(kind) || 0) + 1);
        // Sensitive field dropoff is a strict superset — same metric on
        // a different name in the schema. Mirror the counts so the engine
        // gets both views.
        sensitiveFieldDropoff++;
        sensitiveFieldDropoffKindCounts.set(
          kind,
          (sensitiveFieldDropoffKindCounts.get(kind) || 0) + 1,
        );
      }
    }

    for (const pair of s.oscillation_pairs) {
      oscillation += pair.oscillation_count;
      const key = canonicalPairKey(pair);
      const existing = pairCounts.get(key);
      if (existing) {
        existing.count += pair.oscillation_count;
      } else {
        pairCounts.set(key, {
          a: pair.surface_a,
          b: pair.surface_b,
          count: pair.oscillation_count,
        });
      }
    }

    // Conversion retry: if conversion started but session has form retries
    // and didn't complete, that's a final-step retry pattern.
    if (s.checkout_reached && s.form_retry_count > 0 && !s.reached_thank_you) {
      conversionRetry++;
    }

    // Checkout immediate abandon: reached checkout, very short duration
    // since checkout, no completion. Use 30s as a heuristic for "immediate".
    if (
      s.checkout_reached &&
      !s.reached_thank_you &&
      s.session_duration_ms < 30_000
    ) {
      checkoutImmediateAbandon++;
    }

    // Handoff continuity
    if (s.handoff_started && !s.handoff_returned) handoffNoReturn++;
    if (s.handoff_started && s.handoff_returned && !s.handoff_confirmed) handoffNoConfirm++;

    // Stalled step heuristic — last surface in progression for non-converters
    if (!s.reached_thank_you && s.surface_progression.length > 0) {
      const last = s.surface_progression[s.surface_progression.length - 1];
      surfaceDeadEnds.set(last, (surfaceDeadEnds.get(last) || 0) + 1);
    }
  }

  // Stalled step count: surfaces with >=3 sessions ending there without
  // converting. Acts as a count of distinct stalled surfaces, not sessions.
  for (const count of surfaceDeadEnds.values()) {
    if (count >= 3) stalledStep++;
  }

  // Top oscillation pairs (5 by count)
  const topOscillationPairs = [...pairCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((p) => ({ surface_a: p.a, surface_b: p.b, count: p.count }));

  // Top kinds for sensitive abandons (3 by count)
  const topSensitiveAbandonKinds = [...sensitiveAbandonKindCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  const topSensitiveFieldDropoffKinds = [...sensitiveFieldDropoffKindCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k]) => k);

  // Mobile placeholder — until the snippet ships device_type detection,
  // mobile metrics stay zero. The engine handles 0 gracefully.
  // (Documented in packages/behavioral/session-aggregator.ts isMobileSession.)

  // Dead CTA surface count: surfaces with high views but low click-through.
  // Approximate at the env level: if cta_engagement_rate is below 5% AND
  // viewed >= 50, count it as 1. Otherwise 0. The engine uses this as a
  // boolean signal rather than a precise per-surface metric.
  const ctaEngagementRate = ctaViewed > 0 ? ctaClicked / ctaViewed : 0;
  const deadCtaSurfaceCount = ctaViewed >= 50 && ctaEngagementRate < 0.05 ? 1 : 0;

  return {
    type: "behavioral_session",
    session_count: n,
    checkout_reached_count: checkoutReached,
    checkout_reached_rate: rate(checkoutReached, n),
    conversion_count: conversion,
    conversion_rate: rate(conversion, n),
    support_opened_count: supportOpened,
    support_opened_rate: rate(supportOpened, n),
    policy_opened_count: policyOpened,
    policy_opened_rate: rate(policyOpened, n),
    backtrack_session_count: backtrack,
    backtrack_rate: rate(backtrack, n),
    dead_click_session_count: deadClick,
    dead_click_rate: rate(deadClick, n),
    avg_session_duration_ms: Math.round(sessionDurationTotal / n),
    support_after_checkout_count: supportAfterCheckout,
    policy_then_abandon_count: policyThenAbandon,
    high_intent_detour_count: highIntentDetour,
    dead_cta_surface_count: deadCtaSurfaceCount,
    retry_then_abandon_count: retryThenAbandon,
    mobile_session_count: mobile,
    mobile_first_action_failure_rate: mobile > 0 ? mobileFirstActionFail / mobile : 0,
    stalled_step_count: stalledStep,

    // Phase 4B Hardening
    milestone_awareness_count: mileAware,
    milestone_consideration_count: mileConsider,
    milestone_intent_count: mileIntent,
    milestone_conversion_start_count: mileConvStart,
    milestone_conversion_complete_count: mileConvComplete,
    avg_time_to_first_commercial_action_ms:
      firstActionContribs > 0 ? Math.round(firstActionTotal / firstActionContribs) : null,
    avg_time_intent_to_conversion_ms:
      intentToConvContribs > 0 ? Math.round(intentToConvTotal / intentToConvContribs) : null,

    confirmation_seen_count: confirmation,
    confirmation_seen_rate: rate(confirmation, n),

    hesitation_before_cta_count: hesitationBeforeCta,
    pricing_then_hesitation_count: pricingThenHesitation,
    pricing_backtrack_count: pricingBacktrack,
    policy_detour_before_conversion_count: policyDetourBeforeConv,

    cta_viewed_count: ctaViewed,
    cta_clicked_count: ctaClicked,
    cta_engagement_rate: ctaEngagementRate,
    cta_rendered_late_count: ctaRenderedLate,

    form_retry_session_count: formRetry,
    form_retry_rate: rate(formRetry, n),
    form_excessive_field_count: formExcessive,

    sensitive_input_abandon_count: sensitiveAbandon,
    sensitive_input_abandon_top_kinds: topSensitiveAbandonKinds,

    surface_oscillation_count: oscillation,
    surface_oscillation_top_pairs: topOscillationPairs,

    conversion_retry_count: conversionRetry,
    checkout_immediate_abandon_count: checkoutImmediateAbandon,

    handoff_without_return_count: handoffNoReturn,
    handoff_without_confirmation_count: handoffNoConfirm,

    sensitive_field_dropoff_count: sensitiveFieldDropoff,
    sensitive_field_dropoff_top_kinds: topSensitiveFieldDropoffKinds,
  };
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function rate(num: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.round((num / denom) * 10000) / 10000;
}

function canonicalPairKey(pair: SurfacePair): string {
  // Order-independent so /a↔/b and /b↔/a aggregate together
  return [pair.surface_a, pair.surface_b].sort().join("||");
}

function wrapAsEvidence(
  payload: BehavioralSessionPayload | BehavioralCohortPayload,
  scoping: Scoping,
  cycleRef: string,
  windowHours: number,
): Evidence {
  const id = nextEvidenceId();
  const now = new Date();
  // Wave 5 Fase 3 fix (#1): use the parameterized window instead of the
  // dropped WINDOW_DAYS constant. Without this, `fresh_until` throws
  // ReferenceError and the cycle-level try/catch swallows ALL behavioral
  // evidence silently. Discovered by Fase 3 audit agent.
  const fresh: Evidence["freshness"] = {
    observed_at: now,
    fresh_until: new Date(now.getTime() + windowHours * 60 * 60 * 1000),
    freshness_state: FreshnessState.Fresh,
    staleness_reason: null,
  };
  // Both payloads ride on evidence_type=BehavioralSession; the cohort
  // payload is technically not in the EvidencePayload union, but the
  // signal extractor reads it via `payload as any`. Cast at the boundary.
  return {
    id,
    evidence_key: `${payload.type}_${id}`,
    evidence_type: EvidenceType.BehavioralSession,
    subject_ref: scoping.subject_ref || `environment:${scoping.environment_ref}`,
    scoping,
    cycle_ref: cycleRef,
    freshness: fresh,
    source_kind: SourceKind.BehavioralSnippet,
    collection_method: CollectionMethod.PassiveCollection,
    payload: payload as BehavioralSessionPayload,
    quality_score: QUALITY_SCORE,
    created_at: now,
    updated_at: now,
  };
}

const EMPTY_PAYLOAD: BehavioralSessionPayload = {
  type: "behavioral_session",
  session_count: 0,
  checkout_reached_count: 0,
  checkout_reached_rate: 0,
  conversion_count: 0,
  conversion_rate: 0,
  support_opened_count: 0,
  support_opened_rate: 0,
  policy_opened_count: 0,
  policy_opened_rate: 0,
  backtrack_session_count: 0,
  backtrack_rate: 0,
  dead_click_session_count: 0,
  dead_click_rate: 0,
  avg_session_duration_ms: 0,
  support_after_checkout_count: 0,
  policy_then_abandon_count: 0,
  high_intent_detour_count: 0,
  dead_cta_surface_count: 0,
  retry_then_abandon_count: 0,
  mobile_session_count: 0,
  mobile_first_action_failure_rate: 0,
  stalled_step_count: 0,
  milestone_awareness_count: 0,
  milestone_consideration_count: 0,
  milestone_intent_count: 0,
  milestone_conversion_start_count: 0,
  milestone_conversion_complete_count: 0,
  avg_time_to_first_commercial_action_ms: null,
  avg_time_intent_to_conversion_ms: null,
  confirmation_seen_count: 0,
  confirmation_seen_rate: 0,
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
};
