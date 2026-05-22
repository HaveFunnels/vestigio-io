// ──────────────────────────────────────────────
// Shared inference builders for pack files.
//
// Wave 20.6 — extracted from packages/inference/engine.ts where they
// lived inline alongside the 199 inference functions. Now exported
// from a dedicated module so each pack file (packs/<name>.ts) can
// import what it needs without depending on engine.ts internals.
//
// `createInference` is the canonical factory. Every pack uses it.
// `inferCohort` is a thin wrapper for the 30+ behavioral-cohort
// inferences that follow an identical shape (single signal lookup,
// severity from sig.value, signal_refs from sig.id).
// ──────────────────────────────────────────────

import {
  FreshnessState,
  IdGenerator,
  Inference,
  InferenceCategory,
  Scoping,
  Signal,
  makeRef,
} from "../../domain";

export function createInference(params: {
  inference_key: string;
  category: InferenceCategory;
  conclusion: string;
  conclusion_value: string;
  severity_hint?: string;
  confidence: number;
  scoping: Scoping;
  cycle_ref: string;
  ids: IdGenerator;
  signal_refs: string[];
  evidence_refs: string[];
  reasoning: string;
  reasoning_slots?: Record<string, string | number>;
}): Inference {
  const now = new Date();
  return {
    id: params.ids.next(),
    inference_key: params.inference_key,
    category: params.category,
    scoping: params.scoping,
    cycle_ref: params.cycle_ref,
    freshness: {
      observed_at: now,
      fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      freshness_state: FreshnessState.Fresh,
      staleness_reason: null,
    },
    conclusion: params.conclusion,
    conclusion_value: params.conclusion_value,
    severity_hint: params.severity_hint || null,
    confidence: params.confidence,
    signal_refs: params.signal_refs,
    evidence_refs: params.evidence_refs,
    reasoning: params.reasoning,
    reasoning_slots: params.reasoning_slots,
    description: null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Thin wrapper used by the behavioral-cohort family of inferences
 * (first-session, mobile-revenue, friction-tax, trust-revenue-gap,
 * path-efficiency, etc.). Each cohort inference:
 *   - looks up ONE signal by stable key
 *   - reads severity from sig.value ('high' | 'medium' | 'low')
 *   - emits ONE inference with signal_refs = [sig.id]
 *
 * If the signal is absent, returns []. Cohort inferences are gated by
 * signal presence — no signal = no inference.
 */
export function inferCohort(
  sig: Signal | undefined,
  key: string,
  cat: InferenceCategory,
  reasoning: string,
  scoping: Scoping,
  cycle_ref: string,
  ids: IdGenerator,
): Inference[] {
  if (!sig) return [];
  const severity =
    sig.value === "high" ? "high" : sig.value === "medium" ? "medium" : "low";
  return [
    createInference({
      inference_key: key,
      category: cat,
      conclusion: key,
      conclusion_value: severity,
      severity_hint: severity,
      confidence: sig.confidence,
      scoping,
      cycle_ref,
      ids,
      signal_refs: [makeRef("signal", sig.id)],
      evidence_refs: sig.evidence_refs,
      reasoning,
      reasoning_slots: { severity },
    }),
  ];
}
