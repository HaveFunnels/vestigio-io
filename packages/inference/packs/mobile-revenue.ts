// ──────────────────────────────────────────────
// Pack: mobile_revenue (Mobile Revenue Exposure)
//
// Inferences comparing mobile-cohort conversion + friction against
// desktop. Fires when mobile-specific UX issues compound revenue
// loss in the mobile traffic share.
//
// Wave 20.6 — migrated from the pre-split inference monolith (see git log for engine.ts before commit f987895).
// ──────────────────────────────────────────────

import { Inference, InferenceCategory } from "../../domain";
import { inferCohort } from "../shared/builders";
import type { PackInput } from "../shared/types";

export function computeMobileRevenuePack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];

  out.push(
    ...inferCohort(
      byKey.get("mobile_conversion_gap"),
      "mobile_conversion_gap",
      InferenceCategory.MobileConversionGap,
      "Mobile sessions convert at a significantly lower rate than desktop sessions. Given that mobile typically represents the majority of traffic, this gap translates directly into trapped revenue. Visitors who would convert on desktop but cannot on mobile. The root causes are typically form friction, CTA timing, layout issues, or payment flow degradation on smaller screens.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("mobile_form_friction_elevated"),
      "mobile_form_friction_elevated",
      InferenceCategory.MobileFormFrictionElevated,
      "Mobile users retry form submissions at a significantly higher rate than desktop users. Forms that work on desktop are creating friction on mobile. Fields may be too small, autocomplete may not work, validation errors may be unclear, or the keyboard may obscure the input. Each retry is a moment where mobile users consider abandoning.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("mobile_cta_timing_degraded"),
      "mobile_cta_timing_degraded",
      InferenceCategory.MobileCtaTimingDegraded,
      "Primary CTAs render significantly later on mobile than on desktop. On mobile, where attention spans are shorter and scroll depth is shallower, a late-rendering CTA may never be seen or may appear after the user has already decided to leave. The render-order prioritization needs to favor mobile CTA availability.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  return out;
}
