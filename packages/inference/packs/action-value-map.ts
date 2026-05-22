// ──────────────────────────────────────────────
// Pack: action_value_map
//
// Inferences about CTA placement and engagement quality — fires
// when the most visible actions correlate poorly with conversion
// or revenue-positive actions are buried.
//
// Wave 20.6 — migrated from packages/inference/engine.ts:3152-3162.
// ──────────────────────────────────────────────

import { Inference, InferenceCategory } from "../../domain";
import { inferCohort } from "../shared/builders";
import type { PackInput } from "../shared/types";

export function computeActionValueMapPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];

  out.push(
    ...inferCohort(
      byKey.get("low_value_action_dominates"),
      "low_value_action_dominates",
      InferenceCategory.LowValueActionDominates,
      "The most visible user actions (CTAs, interactive elements) have very low engagement rates and poor correlation with conversion. Users see these actions but do not interact — the actions are occupying attention without driving revenue. The root cause is typically misplaced CTAs, weak copy, or actions that do not match user intent at that stage of the journey.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("high_value_action_underexposed"),
      "high_value_action_underexposed",
      InferenceCategory.HighValueActionUnderexposed,
      "Conversions are happening but CTA engagement across all cohorts is very low, suggesting the conversion path exists but is not easy to find. Revenue-positive actions are underexposed — users who do convert find their way despite the UX, not because of it. Increasing visibility of the proven conversion path would amplify revenue.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("dead_weight_surface_traffic"),
      "dead_weight_surface_traffic",
      InferenceCategory.DeadWeightSurfaceTraffic,
      "The vast majority of sessions that reach the site never progress beyond awareness toward conversion. Surfaces are receiving traffic but not converting it into commercial progression. This represents dead-weight traffic — pageviews that consume server resources and ad spend without contributing to revenue.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  return out;
}
