// ──────────────────────────────────────────────
// Pack: first_impression_revenue
//
// Inferences about first-time visitor behavior — these compare new-
// visitor cohort metrics against returning-visitor baselines and fire
// when the gap indicates first-impression friction is bleeding
// revenue from the awareness → consideration transition.
//
// All three inferences are delegators to inferCohort: lookup a single
// behavioral-aggregate signal by key, emit a single inference with
// severity from sig.value. Trigger is signal presence — no signal,
// no inference.
//
// Wave 20.6 — migrated from packages/inference/engine.ts:3139-3150.
// ──────────────────────────────────────────────

import { Inference, InferenceCategory } from "../../domain";
import { inferCohort } from "../shared/builders";
import type { PackInput } from "../shared/types";

const REASONING_MILESTONE_STALL =
  "First-time visitors stall at early funnel stages at a significantly higher rate than returning visitors. New users are not finding enough reason to express purchase intent during their first visit. The root cause is typically insufficient value proposition, unclear navigation to commercial surfaces, or landing pages that fail to orient newcomers toward the conversion path.";

const REASONING_TRUST_BARRIER =
  "First-time visitors exhibit significantly more hesitation behavior than returning visitors. New users lack the brand familiarity that returning visitors have already built through prior sessions. Trust signals (reviews, guarantees, security badges, brand recognition) are not compensating for the trust deficit that new visitors inherently carry.";

const REASONING_CTA_TIMING_GAP =
  "First-time visitors take significantly longer to reach their first commercial action compared to returning visitors. The commercial entry point is optimized for users who already know the site, not for newcomers. CTAs, pricing links, or product browsing paths are not immediately discoverable for first-time visitors.";

export function computeFirstImpressionRevenuePack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];

  out.push(
    ...inferCohort(
      byKey.get("first_session_milestone_stall"),
      "first_session_milestone_stall",
      InferenceCategory.FirstSessionMilestoneStall,
      REASONING_MILESTONE_STALL,
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("first_session_trust_barrier"),
      "first_session_trust_barrier",
      InferenceCategory.FirstSessionTrustBarrier,
      REASONING_TRUST_BARRIER,
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("first_session_cta_timing_gap"),
      "first_session_cta_timing_gap",
      InferenceCategory.FirstSessionCtaTimingGap,
      REASONING_CTA_TIMING_GAP,
      scoping,
      cycle_ref,
      ids,
    ),
  );

  return out;
}
