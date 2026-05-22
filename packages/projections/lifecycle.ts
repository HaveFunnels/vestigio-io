// ──────────────────────────────────────────────
// Finding lifecycle — Wave 20.4 (Modelo B)
//
// Computes cross-cycle status transitions for FindingProjection.
// Replaces the dormant Decision-level lifecycle described in the
// original DECISION_ENGINE.md (April 2025) which never made it to
// the UI.
//
// ── Why this lives here ──────────────────────
//
// The projection engine produces a fresh `FindingProjection[]` per
// cycle. That tells us what's true RIGHT NOW. To answer "did this
// problem appear this cycle, or has it been there for weeks?" we
// need to match each current finding against the previous cycle's
// findings by stable identity, then compute the transition.
//
// Identity = (environmentId, inferenceKey, surface). Cycle ref is
// NOT part of identity — that's what changes between cycles.
//
// ── Status transitions ───────────────────────
//
//   (no prior)             present → created
//   created  (cycles_seen<3) present → created (cycles_seen + 1)
//   created  (cycles_seen>=3) present, confidence stable/rising → confirmed
//   confirmed              present, confidence drops >20% → stale
//   stale                  present, confidence recovers above prior → confirmed
//   any                    absent in current cycle  → resolved (phantom row)
//   resolved               present again → regressed
//   regressed              present (2 cycles in a row) → created (reset)
//
// ── Resolved findings as phantom rows ────────
//
// When a finding present in the prior cycle is ABSENT in the
// current cycle, applyLifecycle() emits a synthetic FindingProjection
// carrying the prior cycle's data with status='resolved'. The phantom
// is persisted to this cycle's Finding table so the value-caught
// report (Wave 21.5) is a simple SQL query on `status='resolved'`.
//
// The UI lists active findings by filtering `status !== 'resolved'`.
// ──────────────────────────────────────────────

import type { FindingProjection } from "./types";

const CONFIRMED_AFTER_CYCLES = 3;
const STALE_CONFIDENCE_DROP = 20;
const REGRESSED_RESET_AFTER_CYCLES = 2;

export interface PriorFindingState {
  inference_key: string;
  surface: string;
  status: FindingProjection['status'];
  cycles_seen: number;
  confidence: number;
  /** Full prior projection — used to materialize phantom 'resolved'
   *  rows when the finding is absent in the current cycle. */
  projection: FindingProjection;
}

export interface LifecycleResult {
  /** Current cycle's findings, each stamped with computed status +
   *  status_changed_at + cycles_seen. */
  findings: FindingProjection[];
  /** Phantom 'resolved' rows emitted for findings that were in the
   *  prior cycle but absent in the current one. These are persisted
   *  to this cycle alongside the active findings so the lifecycle
   *  index stays complete. */
  resolved: FindingProjection[];
}

/**
 * Apply lifecycle transitions. Pure function — no I/O. The caller
 * provides the prior cycle's finding state as a precomputed map; the
 * Prisma store handles the loading.
 *
 * @param current  this cycle's freshly-projected findings
 * @param prior    prior cycle's findings indexed by `${inferenceKey}::${surface}`
 * @param now      timestamp for status_changed_at when a transition fires
 */
export function applyLifecycle(
  current: FindingProjection[],
  prior: Map<string, PriorFindingState>,
  now: Date = new Date(),
): LifecycleResult {
  const nowIso = now.toISOString();
  const stamped: FindingProjection[] = [];

  // Track which prior findings we've matched — leftovers become
  // resolved phantoms.
  const seenPriorKeys = new Set<string>();

  for (const f of current) {
    const key = makeIdentityKey(f);
    const priorState = prior.get(key);

    if (priorState) {
      seenPriorKeys.add(key);
      stamped.push(transitionFromPrior(f, priorState, nowIso));
    } else {
      // First time seeing this finding instance.
      stamped.push({
        ...f,
        status: 'created',
        status_changed_at: nowIso,
        cycles_seen: 1,
      });
    }
  }

  // Phantom 'resolved' rows for prior findings absent in current.
  const resolved: FindingProjection[] = [];
  for (const [key, priorState] of prior.entries()) {
    if (seenPriorKeys.has(key)) continue;
    // Skip prior rows that were ALREADY resolved — we don't keep
    // re-emitting them every cycle. A resolved row from cycle N-1
    // doesn't need to live again in cycle N.
    if (priorState.status === 'resolved') continue;
    resolved.push({
      ...priorState.projection,
      status: 'resolved',
      status_changed_at: nowIso,
      // cycles_seen freezes at whatever the prior had — the finding
      // doesn't accumulate cycles after it resolves.
      cycles_seen: priorState.cycles_seen,
    });
  }

  return { findings: stamped, resolved };
}

/**
 * Stable identity key: `${inferenceKey}::${surface}`. Surface is
 * normalized lightly (trailing slash stripped) so /pricing and
 * /pricing/ match. environmentId scoping is handled by the loader,
 * not the key.
 */
export function makeIdentityKey(
  f: { inference_key: string; surface: string | null | undefined },
): string {
  const surface = (f.surface || '').replace(/\/$/, '') || '/';
  return `${f.inference_key}::${surface}`;
}

function transitionFromPrior(
  current: FindingProjection,
  prior: PriorFindingState,
  nowIso: string,
): FindingProjection {
  const priorStatus = prior.status;
  const cyclesSeenNext = prior.cycles_seen + 1;
  const confidenceDelta = current.confidence - prior.confidence;

  let nextStatus: FindingProjection['status'];
  let stamp = false;

  switch (priorStatus) {
    case 'created':
      if (cyclesSeenNext >= CONFIRMED_AFTER_CYCLES && confidenceDelta >= -STALE_CONFIDENCE_DROP) {
        nextStatus = 'confirmed';
        stamp = true;
      } else if (confidenceDelta < -STALE_CONFIDENCE_DROP) {
        nextStatus = 'stale';
        stamp = true;
      } else {
        nextStatus = 'created';
      }
      break;

    case 'confirmed':
      if (confidenceDelta < -STALE_CONFIDENCE_DROP) {
        nextStatus = 'stale';
        stamp = true;
      } else {
        nextStatus = 'confirmed';
      }
      break;

    case 'stale':
      // Recovery threshold: confidence is now within 10 points of where
      // it was when the finding was last confirmed. Conservative — we
      // don't flip back on a tiny bump.
      if (confidenceDelta >= -10) {
        nextStatus = 'confirmed';
        stamp = true;
      } else {
        nextStatus = 'stale';
      }
      break;

    case 'resolved':
      // Was resolved last cycle, present again this cycle → regression.
      nextStatus = 'regressed';
      stamp = true;
      break;

    case 'regressed':
      // After 2 consecutive presences post-regression, fall back to
      // created so the lifecycle can stabilize again.
      if (cyclesSeenNext >= REGRESSED_RESET_AFTER_CYCLES) {
        nextStatus = 'created';
        stamp = true;
      } else {
        nextStatus = 'regressed';
      }
      break;

    default:
      // Defensive: unknown prior status (shouldn't happen) → reset.
      nextStatus = 'created';
      stamp = true;
  }

  return {
    ...current,
    status: nextStatus,
    status_changed_at: stamp ? nowIso : (current.status_changed_at || nowIso),
    cycles_seen: cyclesSeenNext,
  };
}
