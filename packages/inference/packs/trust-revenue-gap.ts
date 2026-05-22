// ──────────────────────────────────────────────
// Pack: trust_revenue_gap (Trust Revenue Gap)
//
// Inferences about the conversion drag caused by trust deficits —
// reassurance-seeking, sensitive-input abandonment, policy-page
// hunting. The "gap" is the revenue between trust-confident and
// trust-deficit cohort conversion rates.
//
// Wave 20.6 — migrated from packages/inference/engine.ts:3203-3214.
// ──────────────────────────────────────────────

import { Inference, InferenceCategory } from "../../domain";
import { inferCohort } from "../shared/builders";
import type { PackInput } from "../shared/types";

export function computeTrustRevenueGapPack(input: PackInput): Inference[] {
  const { byKey, scoping, cycle_ref, ids } = input;
  const out: Inference[] = [];

  out.push(
    ...inferCohort(
      byKey.get("trust_deficit_conversion_drag"),
      "trust_deficit_conversion_drag",
      InferenceCategory.TrustDeficitConversionDrag,
      "Sessions with trust-deficit behaviors (policy views, hesitation pauses, sensitive input abandonment) have drastically lower conversion rates. The revenue gap between trust-confident sessions and trust-deficit sessions represents recoverable revenue — if trust barriers were addressed, a portion of these sessions would convert. The root cause is insufficient trust reinforcement throughout the commercial journey.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("reassurance_seeking_elevated"),
      "reassurance_seeking_elevated",
      InferenceCategory.ReassuranceSeekingElevated,
      "A high percentage of sessions actively seek reassurance — opening policy pages, contacting support, or searching for trust signals — before making purchase decisions. This behavior indicates that trust is not embedded in the commercial flow; users must leave the conversion path to find reassurance, and many do not return. Proactively placing trust signals (guarantees, badges, testimonials) on commercial surfaces would reduce the need for this detour.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  out.push(
    ...inferCohort(
      byKey.get("sensitive_input_trust_gap"),
      "sensitive_input_trust_gap",
      InferenceCategory.SensitiveInputTrustGap,
      "Sessions are abandoning at sensitive form fields at an elevated rate. Users reach the point of entering personal or payment data and decide the risk is not worth the value. The surrounding context (security indicators, trust badges, privacy reassurance) is not sufficient for the sensitivity of the data being requested.",
      scoping,
      cycle_ref,
      ids,
    ),
  );

  return out;
}
