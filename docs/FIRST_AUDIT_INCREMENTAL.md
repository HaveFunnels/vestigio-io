# FIRST_AUDIT_INCREMENTAL.md — design + implementation plan

> Status: PROPOSED, written 2026-05-22 after recon. Pre-implementation gate.
> Goal: kill the "20 min silent wait" activation killer flagged in [engineering-debt-categorized](../.claude/projects/-Users-luisgall-Downloads-Vestigio-io-vestigio-io/memory/project_engineering_debt_categorized.md).

---

## Problem

Customer flag: *"primeira audit, um usuario novo pode ficar até 20 minutos aguardando sua audit sem qualquer informação de progresso ou dados populados em tempo real."*

This is the biggest activation hemorrhage. The user pays for paid acquisition that lands the prospect on the dashboard, and the prospect stares at an empty page for 20 minutes before any finding appears.

---

## Recon — current state

### The two SSE paths

| Endpoint | Role | Runs pipeline? | Persists findings? |
|---|---|---|---|
| `/api/analysis/stream` | Legacy "Run analysis" button | Yes (inline) | NO (synthetic `live_${ts}` cycle_ref, no AuditCycle row) |
| `/api/cycles/[id]/stream` | **Observer over running production cycle** | No | Just polls AuditCycle + Finding.count every 2s |

The production audit path (`apps/audit-runner/run-cycle.ts`) is observed by the second endpoint. Components `FirstAuditProgress.tsx` and `CycleProgressBanner.tsx` consume that stream.

### The staging fiction

`FirstAuditProgress.deriveActiveStage(snap)` advances the visual progress bar based on `pagesDiscovered + findingsCount`:

```
findingsCount > 5  →  stage 4 (compute)
findingsCount > 0  →  stage 3 (enrich)
pagesDiscovered > 5  →  stage 2 (analyze)
pagesDiscovered > 0  →  stage 1 (classify)
else                  →  stage 0 (discover)
```

`pagesDiscovered` climbs naturally during the crawl (PageInventoryItem rows persisted incrementally). But `findingsCount` is **0 for the entire cycle** because findings are only persisted in the final atomic `$transaction` at `run-cycle.ts:1722` — which lands at the very end of the ~20 minute run.

So the user sees:
- 0-3 min: stage 0 → 1 → 2 (works, pages are climbing)
- 3-18 min: **stuck on stage 2 ("Running deep analysis…")** for 15 minutes
- 18 min: snap to stage 4, status='complete', findings appear

### The atomic transaction

`apps/audit-runner/run-cycle.ts:1722` wraps three writes in `prisma.$transaction`:
1. Snapshot save (`packages/change-detection/PrismaSnapshotStore.asyncSave`)
2. Finding save (`packages/projections/PrismaFindingStore.saveForCycle`)
3. Cycle status flip to `complete` + `projectionsCache` write

This is intentional defense-in-depth — a half-written cycle showed wrong data on the dashboard pre-Wave-7. Don't break this property.

### The emit infrastructure that already exists

`runStagedPipeline(input, emit)` accepts an emit callback. The production runner passes `noopEmit` — events are thrown away. The PipelineEvent type already has `stage_complete` events for `bootstrap → first_value → crawl → headless → enrichment → complete`.

So 90% of the wiring exists. We just don't use it.

---

## Decision — early projection at Stage C completion

The simplest viable fix is to run a **single early projection pass** when Stage C (crawl) completes — around the 4-6 minute mark. Findings appear in DB; UI's `findingsCount` climbs; `deriveActiveStage` advances through stage 3 (enrich) and stage 4 (compute) **before** the cycle ends.

### Why this and not alternatives

- **Path A — currentStage column + run-cycle updates.** Adds visible stage progression but doesn't deliver "dados populados em tempo real." Half-fix.
- **Path B — full streaming with finding previews.** UI changes to render finding cards mid-cycle. Bigger blast radius (UI design, stale-data UX, finding card flicker). Defer.
- **Path C — chosen: single early projection at Stage C.** Reuses 100% of existing pipeline code. No schema changes. No UI changes. The existing `deriveActiveStage` heuristic does the right thing automatically once `findingsCount > 0`.

### What the user sees post-fix

```
0-30s    stage 0 (discover)
30s-2min stage 1 (classify)   ← pagesDiscovered crosses 5
2-5min   stage 2 (analyze)
~5min    EARLY PROJECTION RUNS — findingsCount jumps to ~20-30
5-7min   stage 3 (enrich)     ← findingsCount > 0
7-15min  stage 4 (compute)    ← findingsCount > 5
15-20min FINAL PROJECTION at end — findings refine + enrichment-derived findings appear
20min    status='complete'
```

The 15-min silent stretch becomes a continuous progression with findings appearing around minute 5.

---

## Implementation

### 1. Expose evidence on `stage_complete:crawl`

`workers/ingestion/staged-pipeline.ts:1004` — extend the emit event to include a snapshot of the evidence array so the caller can run an early projection without reaching into pipeline internals:

```ts
emit({ type: 'stage_complete', stage: 'crawl', data: {
  pages_fetched: fetchCount + 1,
  evidence_count: evidence.length,
  coverage: buildCoverageSummary(coverage),
  evidence: [...evidence],   // ← new: shallow clone, snapshot at crawl-end
}, timestamp: new Date() });
```

Shallow clone is sufficient because Evidence rows are not mutated after creation — only new ones are pushed.

### 2. Wire emit handler in `run-cycle.ts`

Replace `noopEmit` with a handler that fires off the early projection as a tracked promise:

```ts
let earlyProjectionPromise: Promise<void> | null = null;

const emitForCycle = (event: PipelineEvent) => {
  // Mid-cycle early projection on crawl completion. Runs once.
  if (
    event.type === 'stage_complete' &&
    event.stage === 'crawl' &&
    !earlyProjectionPromise &&
    Array.isArray(event.data?.evidence)
  ) {
    earlyProjectionPromise = runEarlyProjection({
      evidence: event.data.evidence as Evidence[],
      // ... same scoping / cycle_ref / etc. as the final pass
    }).catch((err) => {
      console.warn(`[audit-runner ${cycleId}] early projection failed:`, err);
    });
  }
};

const result = await runStagedPipeline(pipelineInput, emitForCycle);

// Before the final atomic $transaction, await the early projection
// to ensure its writes land before the final ones (no overlap race).
if (earlyProjectionPromise) {
  await earlyProjectionPromise;
}
```

### 3. The `runEarlyProjection` function

New file: `apps/audit-runner/early-projection.ts`. Runs the same pipeline as the final pass but with partial evidence. Persists findings via `PrismaFindingStore.saveForCycle` — idempotent upsert by `(cycleId, inferenceKey)`. NO snapshot save, NO status flip, NO projectionsCache write — those stay atomic at the end.

```ts
export async function runEarlyProjection(input: {
  evidence: Evidence[];
  scoping: Scoping;
  cycleId: string;
  cycleRef: string;
  // ... other MultiPackInput essentials
}): Promise<void> {
  const startMs = Date.now();
  try {
    const multiPackResult = await recomputeAllAsync({ ... });
    const projections = projectAll(multiPackResult, translations, { ... });
    // Apply lifecycle (Wave 20.4) on partial findings too — so the
    // climbing findingsCount shows real status, not all 'created'.
    // Prior states load happens inside saveForCycle's caller path.
    const findingStore = new PrismaFindingStore(prisma);
    await findingStore.saveForCycle({
      cycleId,
      environmentId: env.id,
      cycleRef,
      findings: projections.findings,
    });
    console.log(
      `[audit-runner ${cycleId}] early projection: ` +
      `${projections.findings.length} findings in ${Date.now() - startMs}ms`,
    );
  } catch (err) {
    console.warn(`[audit-runner ${cycleId}] early projection threw:`, err);
    // Don't re-throw — the final projection at end of cycle is the
    // canonical write. Early projection is opportunistic.
  }
}
```

### 4. Final projection upserts naturally

`PrismaFindingStore.saveForCycle` already uses `ON CONFLICT (cycleId, inferenceKey) DO UPDATE` (see `packages/projections/prisma-finding-store.ts:230`). The final pass will:
- Overwrite the early findings with refined data (any field that changed between partial and full evidence)
- Insert NEW findings that only emerge after enrichment (LLM-derived from `copy_micro_copy`, `pricing_psychology`, etc.)

No deduplication or migration logic needed.

---

## Risk + mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Early projection produces findings later contradicted by enrichment | Medium | Final pass overwrites via upsert. User sees finding "refine" — typically severity stays same, confidence adjusts. Acceptable. |
| Early projection runs too long (LLM enrichments inside?) | Low | Early pass runs BEFORE enrichment phase. By construction it doesn't hit LLM. Should be <2s. |
| Race between early upsert and final upsert | Low | `await earlyProjectionPromise` before final `$transaction` ensures ordering. |
| Early projection throws and corrupts state | Low | Try/catch swallows. Final pass is unaffected. |
| Findings table fills with provisional rows on cycle failure | Medium | `loadLatestForEnvironment` filters `cycle.status='complete'` — failed cycles' findings stay invisible. Next cycle overwrites by `(cycleId, inferenceKey)` unique. |
| Early projection runs in cycles where it's not useful (hot/warm) | Low | Gate the emit handler to `cycleMode === 'cold'` since hot/warm are short anyway. |

### What can break that I haven't thought of

- Currency/translation context: early projection needs the same translations/locale resolution as the final pass. Easy to wire if I'm careful.
- Behavioral evidence: behavioral processing happens between staged-pipeline and recompute today. If early projection runs without behavioral data, findings will lack behavioral inferences — that's fine, they'll be added by the final pass.
- Compound findings: `composites/compound-findings.ts` runs inside `recomputeAllGen`. Early projection will produce a partial compound set; final overwrites.

---

## Acceptance criteria

1. `findingsCount` climbs from 0 to ~20-30 around the 5-7 min mark on a havefunnels.com cold cycle.
2. UI's `FirstAuditProgress` advances through all 5 stages naturally (no 15-min stall on stage 2).
3. Final `findingsCount` at cycle end matches what it was pre-Wave-20.5b (snapshot diff).
4. If early projection throws, the cycle still completes successfully — same final state as today.
5. No regression in cycle duration (early projection adds ~1-3s overhead, not 10+).

---

## Out of scope (deferred follow-ups)

- Streaming actual finding cards/titles to the UI mid-cycle. The current scope ships visible PROGRESS but the user only sees the count, not the findings themselves. The UI shows finding cards on the dashboard AFTER complete. Adding mid-cycle finding cards is a UI-design pass — bigger work.
- Stage-level progress emit on the SSE observer. Already redundant once findingsCount climbs.
- Currency / refining the finding cards' "provisional" state. The cards on the dashboard only appear after status='complete' so they're never provisional from the user's POV.

---

## Implementation order

1. Read this doc. Approve.
2. Code:
   - `workers/ingestion/staged-pipeline.ts:1004` — add evidence to event data
   - `apps/audit-runner/early-projection.ts` — new file
   - `apps/audit-runner/run-cycle.ts` — replace noopEmit, await earlyProjectionPromise
3. Typecheck.
4. Manual smoke test (run a cycle, watch logs for early projection line + findingsCount climb).
5. Commit + push.
