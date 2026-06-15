// ──────────────────────────────────────────────
// Pack: path_efficiency (Path to Purchase Efficiency)
//
// Inferences about session navigation efficiency on the way to
// conversion — too many surfaces visited, surfaces that absorb
// intent without advancing it, intent decay over time.
//
// Wave 20.6 — migrated from the pre-split inference monolith (see git log for engine.ts before commit f987895).
// ──────────────────────────────────────────────

import { Inference, InferenceCategory } from "../../domain";
import { inferCohort } from "../shared/builders";
import type { PackInput } from "../shared/types";

export function computePathEfficiencyPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];

  out.push(
    ...inferCohort(
      byKey.get("path_length_exceeds_efficient"),
      "path_length_exceeds_efficient",
      InferenceCategory.PathLengthExceedsEfficient,
      "The average session visits too many surfaces relative to the conversion rate. Visitors are wandering rather than progressing toward purchase. Every additional page between awareness and conversion is an opportunity for the user to lose interest, get distracted, or decide to leave. The site structure does not guide users toward conversion efficiently.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("intent_absorber_detected"),
      "intent_absorber_detected",
      InferenceCategory.IntentAbsorberDetected,
      'High backtrack rates combined with surface oscillation indicate that specific surfaces in the path are absorbing purchase intent rather than advancing it. Users visit these surfaces and lose momentum. Their intent to buy gets diluted by information overload, confusing options, or missing calls-to-action. These are "intent absorbers" that break the natural flow from consideration to purchase.',
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("intent_decay_time_excessive"),
      "intent_decay_time_excessive",
      InferenceCategory.IntentDecayTimeExcessive,
      "The average time from expressed intent to conversion start is excessively long. Purchase intent decays over time. The longer a user takes between deciding to buy and completing the purchase, the less likely they are to follow through. The path from pricing/cart to checkout needs to be shortened and streamlined to preserve intent momentum.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  return out;
}
