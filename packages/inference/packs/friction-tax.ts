// ──────────────────────────────────────────────
// Pack: friction_tax
//
// Inferences quantifying the "tax" paid in the conversion funnel —
// hesitation pauses, oscillation between surfaces, checkout entry
// barriers. Fires when behavioral signals point to abandonment from
// UX friction (not lack of interest).
//
// Wave 20.6 — migrated from the pre-split inference monolith (see git log for engine.ts before commit f987895).
// ──────────────────────────────────────────────

import { Inference, InferenceCategory } from "../../domain";
import { inferCohort } from "../shared/builders";
import type { PackInput } from "../shared/types";

export function computeFrictionTaxPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];

  out.push(
    ...inferCohort(
      byKey.get("funnel_step_friction_cost"),
      "funnel_step_friction_cost",
      InferenceCategory.FunnelStepFrictionCost,
      "The conversion funnel carries a measurable friction tax — the combined cost of hesitation pauses, form retries, and surface oscillation across funnel steps. Each type of friction represents a moment where users want to proceed but encounter obstacles. This is not abandonment from lack of interest — it is abandonment from UX friction at the decision moments.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("oscillation_decision_cost"),
      "oscillation_decision_cost",
      InferenceCategory.OscillationDecisionCost,
      "A significant portion of sessions exhibit back-and-forth navigation between surfaces — typically between pricing and product pages, or between cart and product details. This oscillation pattern indicates unresolved decision uncertainty: one surface raises a question that the other cannot fully answer. Each oscillation loop increases the probability of abandonment.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("checkout_entry_friction"),
      "checkout_entry_friction",
      InferenceCategory.CheckoutEntryFriction,
      "A large share of sessions that express purchase intent never reach the checkout step. The gap between intent-expressed and checkout-reached represents the conversion gate friction — users want to buy but something between intent and checkout blocks them. The barrier is often unclear next steps, hidden checkout buttons, forced account creation, or unexpected cart requirements.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  return out;
}
