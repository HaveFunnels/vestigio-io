# Enrichment Passes

> Pluggable post-Stage-C "passes" that add evidence to an audit cycle.

## Why this exists

The staged pipeline runs Stages A → B → C (bootstrap → first value → crawl)
and produces evidence from static HTTP fetches. After Stage C there are
several optional, expensive ways to enrich that evidence further:

| Pass | Cost | When it fires | What it adds |
|---|---|---|---|
| **Stage D — Selective Headless** (Wave 1) | ~30-60s + Playwright memory | SPA detected in Stage C | Browser-rendered evidence: post-mount DOM, network analysis, console errors, redirect chains |
| **Wave 3 — LLM Semantic Enrichment** (planned) | ~$0.005/page (Haiku) | Policy pages found in Stage C evidence | `ContentEnrichmentPayload` with quality scores, missing sections, ambiguity flags |
| _Future passes_ | Varies | Various triggers | Various evidence types |

These all share the same shape:

1. Take the cycle's current evidence + scoping as input
2. Decide if applicable (the "selective" part — most cycles skip most passes)
3. Run something expensive
4. Return new evidence to append

## The contract

Every pass implements [`EnrichmentPass`](./types.ts):

```typescript
interface EnrichmentPass {
  name: string;
  label: string;
  shouldRun(ctx: EnrichmentContext): ShouldRunDecision;
  run(ctx: EnrichmentContext): Promise<EnrichmentResult>;
}
```

- `shouldRun()` is **cheap and synchronous-ish** — no I/O, just inspect the
  context and decide. Most calls return `{ run: false, reason: '...' }`.
- `run()` is the **expensive bit** — does the actual work. Failures should
  be caught inside and translated into `{ status: 'failed' }` rather than
  thrown. The runner has a defensive try/catch as a safety net.

## How to add a new pass

1. Create `your-pass.ts` in this folder implementing `EnrichmentPass`
2. Import it in [`runner.ts`](./runner.ts) and add it to `PASS_REGISTRY`
3. Done. The staged pipeline picks it up automatically via
   `runEnrichmentPasses()`

**Order matters**: passes earlier in the registry run first, and later
passes see their evidence in the context. For example, Wave 3 LLM
enrichment will sit AFTER Stage D so it can read the browser-rendered
evidence as input.

## Wave 3 LLM Enrichment (planned)

The Wave 3 plan in [docs/ROADMAP.md § 3.1](../../../docs/ROADMAP.md) calls
for a `runSemanticEnrichment()` step. With this framework in place, that
becomes a single new file `semantic-enrichment.ts` registered in
`runner.ts`. No staged-pipeline.ts changes needed.

Specifically, the Wave 3 pass will:

- `shouldRun`: return true when there's at least one `policy_page`
  evidence in the context
- `run`: iterate the policy pages, send each to Haiku with a structured
  output schema for `PolicyQualityAssessment`, wrap responses as
  `ContentEnrichmentPayload` evidence, return them
- `cost_units`: track per-page Haiku spend so the cycle has a budget gate

The framework is designed so this is a **drop-in addition**, not a
refactor. The `cost_units` field on `EnrichmentResult` already exists for
exactly this — Wave 3 can sum costs across passes for budget enforcement.

## Files

| File | Purpose |
|---|---|
| [`types.ts`](./types.ts) | The framework contract — `EnrichmentPass`, `EnrichmentContext`, `EnrichmentResult` |
| [`runner.ts`](./runner.ts) | Iterates `PASS_REGISTRY`, calls `shouldRun` then `run`, defensive try/catch |
| [`scenarios.ts`](./scenarios.ts) | Stage D's business-aware scenario builders (ecommerce / lead_gen / saas / hybrid) |
| [`selective-headless.ts`](./selective-headless.ts) | Stage D pass implementation — retry logic, cost gating, BrowserWorker invocation |
| [`index.ts`](./index.ts) | Public exports |
| `README.md` | This file |
