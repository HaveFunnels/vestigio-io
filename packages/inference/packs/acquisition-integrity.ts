// ──────────────────────────────────────────────
// Pack: acquisition_integrity
//
// Inferences comparing paid-traffic cohort behavior against organic
// baselines. Fires when ad-driven visitors carry materially worse
// friction/trust profiles than organic — signals ad-spend waste.
//
// Wave 20.6 — migrated from the pre-split inference monolith (see git log for engine.ts before commit f987895).
// ──────────────────────────────────────────────

import { Inference, InferenceCategory } from "../../domain";
import { inferCohort } from "../shared/builders";
import type { PackInput } from "../shared/types";

export function computeAcquisitionIntegrityPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];

  out.push(
    ...inferCohort(
      byKey.get("paid_traffic_friction_elevated"),
      "paid_traffic_friction_elevated",
      InferenceCategory.PaidTrafficFrictionElevated,
      "Paid traffic encounters significantly more behavioral friction than organic traffic. Visitors arriving from ads face more backtracks, hesitation, and obstacles. The landing experience for paid visitors is not aligned with the ad promise — the gap between expectation and experience creates friction that burns ad spend.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("paid_traffic_trust_gap"),
      "paid_traffic_trust_gap",
      InferenceCategory.PaidTrafficTrustGap,
      "Paid visitors show significantly more trust-seeking behavior (policy views, hesitation pauses) than organic visitors. Users arriving from ads lack the brand familiarity that organic visitors build through repeated exposure. The site does not compensate for this trust deficit with upfront reassurance on landing pages.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("paid_mobile_compounding_waste"),
      "paid_mobile_compounding_waste",
      InferenceCategory.PaidMobileCompoundingWaste,
      "Both paid traffic and mobile traffic independently convert at significantly lower rates than the overall average. When a visitor is both paid AND mobile, the friction compounds — the visitor faces both the trust gap of being a new paid visitor and the UX friction of the mobile experience. This is the highest-waste segment of your traffic.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  return out;
}
