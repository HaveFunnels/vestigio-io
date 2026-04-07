import type { Evidence, Scoping } from "../../../packages/domain";
import type { CoverageEntry, PipelineEvent } from "../staged-pipeline";

// ──────────────────────────────────────────────
// Enrichment Pass Framework
//
// Selective post-Stage-C "passes" that add evidence to the cycle.
// First implementation: Stage D Selective Headless (Wave 1).
// Future implementations: Wave 3 LLM Semantic Enrichment, etc.
//
// The contract is intentionally narrow:
//   - shouldRun() is cheap and synchronous-ish — quick budget/eligibility check
//   - run() is the expensive bit — does the actual work, returns Evidence[]
//   - all I/O failures are non-fatal to the cycle — failures get logged
//     into the result with a reason, the cycle still completes
//
// Why this exists instead of inlining each pass:
//   - keeps staged-pipeline.ts simple (just iterates passes)
//   - lets us add new passes (LLM enrichment, deeper crawls, etc.) by
//     dropping a file in this folder, no plumbing to redo
//   - centralized cost tracking and observability
//   - the same retry/timeout/budget machinery is reused across passes
// ──────────────────────────────────────────────

/**
 * Pipeline modes — duplicated from staged-pipeline.ts to avoid circular
 * import. Must stay in sync. The runner only uses this for type
 * tagging on the context.
 */
export type EnrichmentPipelineMode = "full" | "shallow_plus" | "shallow";

/**
 * Read-only snapshot of the cycle state passed to each enrichment pass.
 *
 * Passes MUST treat all fields as read-only — they receive a reference
 * to the live evidence array but should never mutate it. New evidence
 * goes in EnrichmentResult.evidence_added so the runner can append it
 * after the pass completes (and after error handling).
 */
export interface EnrichmentContext {
  /** All evidence collected by Stages A-C, in insertion order */
  evidence: readonly Evidence[];
  /** Coverage map from Stage C — URLs the crawler discovered */
  coverage: ReadonlyMap<string, CoverageEntry>;
  /** Cycle scoping (workspace, env, subject) */
  scoping: Scoping;
  /** Cycle reference for evidence attribution */
  cycle_ref: string;
  /** Root domain (host part) — used for browser allowed_domains */
  root_domain: string;
  /** Full landing URL (includes scheme) — used as Stage D entry point */
  landing_url: string;
  /** Pipeline mode — passes use this to gate themselves */
  mode: EnrichmentPipelineMode;
  /** True if Stage C's shouldTriggerPlaywright() flagged a JS-heavy page */
  spa_detected: boolean;
  /** Onboarding business model (ecommerce / lead_gen / saas / hybrid) */
  business_model: string | null;
  /** Onboarding conversion model (checkout / whatsapp / form / external) */
  conversion_model: string | null;
  /** Pipeline emit callback — passes can stream their progress via SSE */
  emit: (event: PipelineEvent) => void;
}

/**
 * Result of running shouldRun() — explicit reason so the runner can log
 * "skipped because mode=shallow" rather than swallowing the decision.
 */
export interface ShouldRunDecision {
  run: boolean;
  /** Human-readable reason; logged + included in EnrichmentResult */
  reason: string;
}

/**
 * Outcome of a single pass execution.
 *
 * status:
 *   - 'completed': pass ran and produced evidence (possibly empty array)
 *   - 'skipped':   shouldRun() returned false; nothing was attempted
 *   - 'failed':    pass attempted but errored out; evidence_added is empty
 *                  (any partial evidence is discarded — atomicity)
 *   - 'retried_failed': all retries exhausted; final attempt failed
 */
export interface EnrichmentResult {
  pass_name: string;
  status: "completed" | "skipped" | "failed" | "retried_failed";
  reason: string;
  evidence_added: Evidence[];
  duration_ms: number;
  /** Number of attempts (1 for no-retry success, >1 if retries fired) */
  attempts: number;
  /** Optional cost estimate — Wave 3 (LLM) will use this for budget tracking */
  cost_units?: number;
}

/**
 * The pluggable contract every enrichment pass implements.
 *
 * Implementations live in their own file in workers/ingestion/enrichment/
 * and are registered in the runner. To add a new pass:
 *   1. Create your-pass.ts here implementing this interface
 *   2. Add it to the registry in runner.ts
 *   3. Done — staged-pipeline.ts picks it up automatically
 */
export interface EnrichmentPass {
  /** Stable identifier — used in logs, metrics, and stagesCompleted */
  name: string;
  /** Short human label for SSE progress events */
  label: string;

  /**
   * Cheap synchronous gate. Should NOT do I/O. Just inspects the
   * EnrichmentContext to decide if the pass is applicable to this cycle.
   *
   * Returning { run: false } is the most common path (passes are
   * selective by design — Stage D only fires on SPAs, LLM enrichment
   * only fires when there's policy page evidence, etc.).
   */
  shouldRun(ctx: EnrichmentContext): ShouldRunDecision;

  /**
   * Execute the pass. May be slow (Stage D = 30-60s real browser).
   *
   * Failures should be CAUGHT INSIDE this method and translated into
   * a 'failed' EnrichmentResult — never thrown. Throwing would crash
   * the whole cycle. The runner does have a defensive try/catch but
   * passes should not rely on it.
   *
   * The pass owns its own retry logic if it wants any (Stage D has
   * retry-on-turnstile, for example). The runner does not retry passes.
   */
  run(ctx: EnrichmentContext): Promise<EnrichmentResult>;
}

/**
 * Build the empty result returned when shouldRun() says skip.
 * Centralized so runners and passes share the same shape.
 */
export function buildSkippedResult(passName: string, reason: string): EnrichmentResult {
  return {
    pass_name: passName,
    status: "skipped",
    reason,
    evidence_added: [],
    duration_ms: 0,
    attempts: 0,
  };
}

/**
 * Build the result returned when run() catches an error inside itself.
 */
export function buildFailedResult(
  passName: string,
  reason: string,
  durationMs: number,
  attempts: number,
): EnrichmentResult {
  return {
    pass_name: passName,
    status: attempts > 1 ? "retried_failed" : "failed",
    reason,
    evidence_added: [],
    duration_ms: durationMs,
    attempts,
  };
}
