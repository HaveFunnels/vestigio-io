import type {
  EnrichmentContext,
  EnrichmentPass,
  EnrichmentResult,
} from "./types";
import { buildSkippedResult } from "./types";
import { selectiveHeadlessPass } from "./selective-headless";

// ──────────────────────────────────────────────
// Enrichment Runner
//
// Iterates the registered enrichment passes in order, calling shouldRun()
// then run() for each. Defensive try/catch around every pass so a single
// pass failure can never crash the whole staged pipeline.
//
// Order matters: earlier passes can produce evidence that later passes
// see in their context. For Wave 1 there's only one pass (Stage D), but
// Wave 3's LLM enrichment will sit AFTER Stage D so it can read the
// browser-rendered evidence as input.
// ──────────────────────────────────────────────

/**
 * Registry of enrichment passes, in execution order.
 *
 * To add a new pass:
 *   1. Implement the EnrichmentPass interface in a new file in this folder
 *   2. Import it here
 *   3. Add it to this array — placement matters (later passes see earlier
 *      passes' evidence in their context)
 */
const PASS_REGISTRY: EnrichmentPass[] = [
  selectiveHeadlessPass,
  // Wave 3 LLM Semantic Enrichment will be added here:
  //   semanticEnrichmentPass,
];

/**
 * Run all registered enrichment passes against the cycle context.
 * Returns one EnrichmentResult per pass — never throws.
 *
 * The caller (staged-pipeline.ts) is responsible for appending
 * `result.evidence_added` arrays to the cycle's evidence pool. The
 * runner does NOT mutate the context.
 */
export async function runEnrichmentPasses(
  ctx: EnrichmentContext,
): Promise<EnrichmentResult[]> {
  const results: EnrichmentResult[] = [];

  for (const pass of PASS_REGISTRY) {
    const decision = pass.shouldRun(ctx);
    if (!decision.run) {
      results.push(buildSkippedResult(pass.name, decision.reason));
      continue;
    }

    // Defensive try/catch — passes are expected to handle their own
    // errors and return a 'failed' result, but we wrap anyway so a
    // throwing pass can't break the cycle.
    try {
      const result = await pass.run(ctx);
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[enrichment-runner] pass '${pass.name}' threw uncaught:`, err);
      results.push({
        pass_name: pass.name,
        status: "failed",
        reason: `Uncaught error in pass: ${message}`,
        evidence_added: [],
        duration_ms: 0,
        attempts: 1,
      });
    }
  }

  return results;
}

/**
 * Test/debug helper: list registered passes without running them.
 * Used by tests to verify the registry contents.
 */
export function listRegisteredPasses(): { name: string; label: string }[] {
  return PASS_REGISTRY.map((p) => ({ name: p.name, label: p.label }));
}
