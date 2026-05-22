# ENGINE_TARGET_API.md — Target API contract for Wave 20

> **Status:** PROPOSED, awaiting product-owner review.
> **Date:** 2026-05-21.
> **Reviewer gate:** approve this contract before Wave 20.2 (delete dead code) starts.
> **Source-of-truth maps this works against:** [ENGINE_MAP.md](ENGINE_MAP.md).
> **Drives:** [ROADMAP.md Wave 20](ROADMAP.md#wave-20--engine-consolidation--always-on-layer) Steps 20.2 → 20.7.

This document captures the decisions, type signatures, and consolidation plan for the engine refactor. Everything here is opinionated — alternatives that were considered and rejected are listed inline so the rejection logic survives.

---

## 1. The single entry point

There is **one** public function consumers of the engine call:

```ts
// packages/workspace/engine.ts (NEW FILE — created in Wave 20.7)

export async function run(input: EngineRunInput): Promise<EngineRunOutput>;
```

All other engine modules (`signals/`, `inference/`, `decision/`, `impact/`, `projections/`, `intelligence/`, `composites/`, `change-detection/`) become internal collaborators. `run()` is the only thing the audit-runner, the always-on probe worker (Wave 21), and tests call.

### Why one entry point

- Wave 21 needs `engine.run({ scope: targeted, ... })` to re-analyze a single URL after a diff. Without a single entry point, Wave 21 either reimplements a parallel orchestrator (compound debt) or threads through the existing tangle.
- `apps/audit-runner/run-cycle.ts` becomes a thin shell: collect evidence → call `engine.run()` → persist. Currently it's 1800+ lines doing both orchestration AND policy.
- Tests stop having to mock 8 different recompute internals.

---

## 2. Input contract: `EngineRunInput`

```ts
export interface EngineRunInput {
  // ── Scope ──────────────────────────────────────────────────────
  scope: EngineScope;

  // ── Identity ───────────────────────────────────────────────────
  envId: string;
  cycleId: string;                  // existing cycle for full, new cycle for targeted
  cycleMode: 'hot' | 'warm' | 'cold' | 'targeted';
  organizationId: string;
  workspaceRef: string;             // 'workspace:<orgId>' for legacy callers
  environmentRef: string;           // 'environment:<envId>'

  // ── Domain context ─────────────────────────────────────────────
  domain: string;
  landingUrl: string;
  businessModel: string;            // from BusinessProfile or fallback
  conversionModel: string;
  locale: string;                   // 'en' | 'pt-BR' | 'es' | 'de'
  currency: string;                 // ISO 4217

  // ── Evidence + state ───────────────────────────────────────────
  evidence: Evidence[];             // collected upstream (staged-pipeline)
  classifiedPages: Map<string, string>;   // computed once in staged-pipeline
  scoredEdges: ScoredEdge[];        // for funnel-gap inference
  funnelMultipliers: FunnelStageMultipliers;
  previousSnapshot: CycleSnapshot | null;

  // ── Reference data ─────────────────────────────────────────────
  businessProfile: BusinessProfile | null;
  businessInputs: BusinessInputs | null;
  integrationSnapshots: IntegrationSnapshot[];
  suppressionRules: SuppressionRule[];
  translations: EngineTranslations | null;
}

export type EngineScope =
  | { kind: 'full_cycle' }
  | { kind: 'targeted'; url: string; purposes: EnricherPurpose[] };

export type EnricherPurpose =
  | 'micro_copy'
  | 'copy_seo_tension'
  | 'pricing_psychology'
  | 'ad_message_match'
  | 'copy_localization'
  | 'cross_page_copy'
  | 'semantic_enrichment.policy_quality'
  | 'semantic_enrichment.trust'
  | 'semantic_enrichment.value_prop'
  // etc — string-typed to match the LlmCallContext.purpose vocabulary
  ;
```

### Why these specific fields

- **`scope`** as a discriminated union is the single switch that distinguishes full-cycle from targeted. Targeted re-analysis is the Wave 21 hook; without it being first-class in the input type, the engine would have to infer from cycleMode.
- **`classifiedPages` + `scoredEdges`** are passed in pre-computed (not lazily computed inside) because they require DB reads. The engine itself stays pure-functional over its inputs. This is the "Option (a)" from [ENGINE_MAP.md §A](ENGINE_MAP.md#a-bypass-paths) — pre-compute inputs that need IO, never compute inside the engine.
- **`previousSnapshot`** is part of input, not loaded inside, for the same reason.
- **`organizationId` + `envId`** are separated from the `workspace:` / `environment:` ref strings because every downstream `LlmCallContext` needs the bare IDs. Passing both up-front prevents the prefix-stripping that happens scattered across enrichers today.

### Rejected alternatives

- **Lazy DB access via injected `prisma` client.** Rejected because: makes the engine impossible to test without a real DB; couples engine to Prisma; tempts contributors to scatter reads everywhere. Pre-computed inputs force the orchestrator to make all IO upfront and the engine to stay pure.
- **Separate `runFull()` and `runTargeted()` functions.** Rejected because: duplicates dispatch logic; tests have to cover both; the discriminated union is just a switch and the implementation can branch internally.
- **Auto-detect targeted vs full from cycleMode.** Rejected because: cycleMode is about cadence (hot/warm/cold), scope is about what work to do. They're orthogonal — a targeted re-analysis can run during any cadence.

---

## 3. Output contract: `EngineRunOutput`

```ts
export interface EngineRunOutput {
  // ── Internal computation outputs (kept for change detection + debugging) ──
  signals: Signal[];                // ALL signals, post-harmonize + quality-adjust
  inferences: Inference[];          // ALL inferences, including derived + cross-pack
  decisions: Decision[];            // transient — see §6
  valueCases: QuantifiedValueCase[];

  // ── The artifacts that reach UI + DB ──────────────────────────
  projections: ProjectionResult;    // findings, actions, workspaces, change_report, maps
  rootCauses: RootCause[];
  globalActions: GlobalAction[];
  compoundFindings: CompoundFinding[];

  // ── State for next cycle ──────────────────────────────────────
  newSnapshot: CycleSnapshot;

  // ── Telemetry ─────────────────────────────────────────────────
  llmCostCents: number;
  llmCallCount: number;
  llmCallsByPurpose: Record<string, { count: number; costCents: number }>;
  durationMs: number;

  // ── Scope-specific ─────────────────────────────────────────────
  scopeKind: 'full_cycle' | 'targeted';
  affectedUrls?: string[];          // for targeted: which URLs' findings are new/changed
}
```

### Why this shape

- **Both internal artifacts (signals/inferences/decisions) AND projections are returned.** The audit-runner needs internals for `CycleSnapshot` + observability. Always-on Wave 21 may want signals for anomaly rules. Tests need everything.
- **`decisions`** is still in the output for change detection (CycleSnapshot.decisions[]) and for the chat agent's pack-level verdict computation. But the array is computed-from-findings on read where possible — see §6.
- **`llmCostCents` + per-purpose breakdown** in the output enables Wave 21's cost monitoring per targeted re-analysis ("this diff cost $0.001 — fine; next one cost $0.05 — investigate").
- **`affectedUrls`** for targeted scope tells the persistence layer which prior findings the new ones supersede.

---

## 4. Bypass re-rooting plan (Wave 20.5)

Each of the 5 bypass paths from [ENGINE_MAP.md §A](ENGINE_MAP.md#a-bypass-paths) has a target home in the new structure.

### 4.1 Static-checks `additional_signals` → into `extractSignals()`

**Before:** `runStaticChecks()` in `workers/ingestion/stages/static-checks.ts:41` emits `Signal[]` directly, uses local copy of `createSignal`, merged AFTER harmonize + quality-adjust as `additional_signals`.

**After:** Move to `packages/signals/static-checks-signals.ts`. Becomes a normal sub-extractor that `extractSignals()` calls during its 30-step fan-out. Single `createSignal` import from `packages/signals/create.ts`. Signals flow through harmonize + quality-adjust like everything else.

**Concern addressed:** static-check signals currently bypass truth resolution. After consolidation, they participate, which means a Structural-authority static-check that contradicts a BrowserObserved finding correctly loses. Today the wrong one wins.

**Migration risk:** static-checks producing signals that get suppressed by harmonization. Mitigation: run side-by-side for 1 cycle, snapshot-diff outputs.

### 4.2 MRR contraction manual push → `packages/inference/derived/change.ts`

**Before:** `recompute.ts:379-406` pushes `mrr_contraction_detected` signal directly onto rawSignals after extractSignals returns.

**After:** New module `packages/inference/derived/change.ts` exports `computeChangeInferences({ changeReport, previousSnapshot, currentSignals }): Inference[]`. The MRR contraction becomes an **inference**, not a signal — it's a composite interpretation, not an atomic observation. Runs in §5's "derived" stage.

### 4.3 Funnel-gap + form-flow `additional_inferences` → also `derived/`

**Before:** `computeFunnelGapInferences` + `computeFormFlowInferences` called from `run-cycle.ts` (not recompute), results injected as `additional_inferences`.

**After:** `packages/inference/derived/funnel-gap.ts` + `derived/form-flow.ts`. Inputs (classified pages, scored edges, page inventory) come from `EngineRunInput` (§2). Called from the main inference orchestrator in the same fan-out as everything else.

### 4.4 Regression-inference manual construction → also `derived/change.ts`

**Before:** `recompute.ts:1162-1191` manually constructs `revenue_path_regressed` inference after change detection.

**After:** Folded into `computeChangeInferences()` alongside MRR contraction. Single home for change-derived inferences.

### 4.5 Triple-implementation `createSignal` → one

**Before:** `packages/signals/create.ts` + `packages/signals/engine.ts` (historical copy) + `workers/ingestion/stages/static-checks.ts:822` (local copy).

**After:** Only `packages/signals/create.ts`. Delete the historical copy in `engine.ts` (the import already exists, the copy is just unused). Delete the local copy in `static-checks.ts` as part of 4.1's migration.

---

## 5. Inference pack decomposition (Wave 20.6)

The 11k-line `inference/engine.ts` monolith → tree structure:

```
packages/inference/
├── engine.ts                    # orchestrator (~200 lines, just fan-out)
├── index.ts                     # public API — EVERY module re-exported here
├── shared/
│   ├── builders.ts              # helpers like inferenceFromSignals(...)
│   ├── types.ts                 # local-only types
│   └── id-gen.ts                # pack-scoped IdGenerators
├── packs/
│   ├── revenue-integrity.ts
│   ├── scale-readiness.ts
│   ├── chargeback-resilience.ts
│   ├── security-posture.ts
│   ├── copy-alignment.ts
│   ├── brand-integrity.ts
│   ├── channel-integrity.ts
│   ├── discoverability.ts
│   ├── friction-tax.ts
│   ├── trust-gap.ts
│   ├── first-impression.ts
│   ├── content-freshness.ts
│   ├── mobile-revenue.ts
│   ├── payment-health.ts
│   ├── path-efficiency.ts
│   └── action-value-map.ts
├── vertical/                    # business-model-gated
│   ├── ecommerce.ts
│   ├── saas.ts
│   ├── marketplace.ts
│   └── lead-gen.ts
├── cross/                       # operates on outputs of other inferences
│   ├── synthesis.ts             # was cross-pack-synthesis.ts
│   ├── domain.ts                # was cross-domain-inference.ts
│   └── external-recon.ts        # was external-recon-inference.ts
└── derived/                     # need extra inputs beyond signals
    ├── funnel-gap.ts
    ├── funnel-moment.ts
    ├── form-flow.ts
    └── change.ts                # MRR contraction + regression + future change-driven
```

### Per-pack contract

Every pack file exports:

```ts
export const packKey: PackKey;     // 'revenue_integrity' | ...
export function computePack(input: PackInput): Inference[];

interface PackInput {
  signals: Signal[];               // already filtered to pack-relevant signal_keys
  evidence: Evidence[];            // for inferences that read evidence directly
  scoping: Scoping;
  cycle_ref: string;
  businessModel: string;
  locale: string;
}
```

### Why split this way

- **One file per pack** = clear ownership when adding a finding ("which file does `pricing_psychology_weak` live in? → packs/revenue-integrity.ts").
- **Each pack <800 lines** (target). Today the monolith averages ~55 lines per inference; pack files would have 10-20 inferences = 200-1100 lines. The biggest (revenue-integrity has ~30 inferences) might push 1500, still tractable.
- **`vertical/`** separation acknowledges that ecommerce/saas/marketplace rules belong together by vertical, not by pack. Today `computeVerticalInferences` and `computeSaasInferences` are peers; this co-locates them.
- **`cross/`** for inferences that read OTHER inferences (synthesis), not signals.
- **`derived/`** for inferences that need extra inputs (DB reads pre-computed, or change snapshots).
- **`shared/id-gen.ts`** gives each pack its own `IdGenerator` scope (current code has one global `IdGenerator('inf')`, which means IDs collide across packs in pathological cases).

### Orchestrator (`engine.ts`)

```ts
export async function computeInferences(input: InferenceInput): Promise<Inference[]> {
  const out: Inference[] = [];

  // 1. Pack inferences (parallel-safe, each pack reads only its own signal subset)
  for (const pack of ALL_PACKS) {
    out.push(...pack.computePack(packInputFor(pack, input)));
  }

  // 2. Vertical inferences (gated by businessModel)
  out.push(...computeVerticalForBusiness(input.businessModel, input));

  // 3. Derived inferences (need extra inputs)
  out.push(...computeFunnelGapInferences(input));
  out.push(...computeFunnelMomentInferences(input));
  out.push(...computeFormFlowInferences(input));
  out.push(...computeChangeInferences(input));

  // 4. Cross inferences (read all prior outputs)
  out.push(...computeCrossDomainInferences(input.signals, out, input));
  out.push(...computeCrossPackSynthesis(out, input));
  out.push(...computeExternalReconInferences(input));

  return out;
}
```

200 lines max. The pack-internal complexity stays inside `packs/`, the cross/derived complexity stays inside `cross/` and `derived/`.

### Migration approach

One pack at a time. For each pack:
1. Extract the relevant inference functions from the monolith into the new pack file.
2. Wire it into the orchestrator's `ALL_PACKS` array.
3. Run a parallel-compare for one cycle (old monolith + new pack), assert outputs are byte-identical.
4. Delete the migrated functions from the monolith.

12-16 packs × ~0.5 days each = 6-8 days for the full split.

---

## 6. Finding lifecycle (Modelo B — Wave 20.4)

### Decision

Per [ENGINE_MAP.md "Modelo B decision"](ENGINE_MAP.md#modelo-b-decision-2026-05-21--decision-collapses-into-finding):

- **Lifecycle lives on Finding**, not on Decision.
- **Decision becomes a transient internal computation** during inference — still computed for correlated-max scoring, never persisted as a separate entity.
- Decision attributes (`category`, `decision_impact`) migrate onto Finding.
- `Decision.projections.findings[]` field is deleted (always empty today).
- Pack-level verdicts become computed views (`packVerdict(packKey, findings) → PackVerdict`), not stored.

### Finding shape (after Wave 20.4)

```ts
// packages/projections/types.ts (extended)
export interface FindingProjection {
  // ── Existing fields (unchanged) ──
  id, title, severity, confidence, impact, pack, surface, polarity,
  truth_context, suppression_context, inference_key, reasoning, cause,
  effect, basis_type, eligibility, verification_maturity,
  verification_method, change_class, evidence_quality, ...

  // ── NEW from Modelo B (Wave 20.4) ──
  status: 'created' | 'confirmed' | 'stale' | 'resolved' | 'regressed';
  status_changed_at: string;        // ISO timestamp of last transition
  cycles_seen: number;              // how many cycles this finding has appeared in
  category: 'risk' | 'gate' | 'opportunity' | 'state';      // moved from Decision
  decision_impact: DecisionImpact;  // moved from Decision
}
```

### Status transition rules

Computed at projection time, after `detectChanges` runs and the prior cycle's findings are loaded.

**Matching across cycles:** `(envId, inference_key, surface)` is the finding identity.

| Prior state | Current cycle says | New state | When |
|---|---|---|---|
| (no prior) | finding present | `Created` | first time the finding instance is seen |
| `Created` | finding present | `Created` or `Confirmed` | `Confirmed` after `cycles_seen >= 3` AND confidence stable/rising |
| `Confirmed` | finding present, confidence stable | `Confirmed` | stays |
| `Confirmed`/`Created` | finding present, confidence drops >20% | `Stale` | confidence degraded |
| `Stale` | finding present, confidence recovers | `Confirmed` | promotion |
| any | finding absent in current cycle | `Resolved` | one-cycle absence = resolved |
| `Resolved` | finding present again | `Regressed` | reappearance |
| `Regressed` | finding present | stays `Regressed` until 2 consecutive presences → `Created` | reset cycle |

### Schema migration

```sql
-- prisma/migrations/<wave-20-4>/migration.sql
ALTER TABLE "Finding" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'created';
ALTER TABLE "Finding" ADD COLUMN "status_changed_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Finding" ADD COLUMN "cycles_seen" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Finding" ADD COLUMN "category" TEXT;
ALTER TABLE "Finding" ADD COLUMN "decision_impact" TEXT;

CREATE INDEX "Finding_status_idx" ON "Finding"("status");
CREATE INDEX "Finding_env_inference_surface_status_idx"
  ON "Finding"("environmentId", "inferenceKey", "surface", "status");
```

The cross-cycle matching index supports the "find prior state of this finding" lookup during lifecycle transitions.

### Where the new code lives

```
packages/projections/
├── lifecycle.ts                  # NEW — applyLifecycle(currentFindings, priorFindings) → findings with status
├── engine.ts                     # existing projectAll, now calls lifecycle after change_class
├── prisma-finding-store.ts       # existing, writes the new columns
```

### Pack-verdict view (replaces Decision.category at the UI level)

```ts
// packages/projections/pack-verdict.ts (NEW)
export function packVerdict(
  packKey: PackKey,
  findings: FindingProjection[]
): PackVerdict {
  const packFindings = findings.filter(f => f.pack === packKey);
  return {
    pack: packKey,
    status: aggregateSeverity(packFindings),   // 'safe' | 'monitor' | 'at_risk' | 'incident'
    critical_count: packFindings.filter(f => f.severity === 'critical').length,
    open_count: packFindings.filter(f => f.status !== 'resolved').length,
    resolved_this_period: packFindings.filter(f => f.status === 'resolved' && /* recent */).length,
    captured_value_cents: /* sum of value_case.range_mid for newly-resolved */,
  };
}
```

This is **render-only** — never persisted. The chat agent, the dashboard pack cards, and the value-caught report all use this same function.

---

## 7. Decision-as-transient (what stays, what dies)

### Stays
- `packages/decision/engine.ts:produceDecision()` — still runs per pack for correlated-max scoring. Its output (Decision objects) feeds:
  - `FindingProjection.category` (via inference→decision lookup at projection time)
  - `FindingProjection.decision_impact` (same)
  - `CycleSnapshot.decisions[]` for change detection backward compat
- `packages/risk/evaluator.ts:evaluateRisk()` — unchanged, still drives `Decision.raw_risk_score`
- `packages/decision/conflict-resolver.ts` — kept for the correlated-max scoring it implements

### Dies
- `Decision.projections.findings[]` field (`packages/decision/engine.ts:158-163`) — deleted
- `Decision.status` field — moves to `FindingProjection.status`
- `DecisionStatus.{Confirmed, Stale, Resolved, Regressed}` enum states — keep or delete (Wave 20.2 decides). If `DecisionStatus` is only ever `Created` after this, the enum becomes pointless. **Recommendation: delete the enum entirely**, leave the Decision type without a status field.

### What about chat agent's `is_it_safe_to_scale_traffic?` answers?
The chat tool that answers business questions reads `packVerdict('scale_readiness', findings)` instead of looking up a Decision row. Same answer, computed at read time. The chat agent does not need to change its prompt — it just gets the verdict from a different source.

---

## 8. CycleSnapshot — schema unchanged, semantics evolved

```ts
// packages/change-detection/engine.ts (unchanged)
export interface CycleSnapshot {
  cycle_ref: string;
  decisions: Decision[];          // still here for backward compat with change detection
  signals: Signal[];
  source_kinds?: string[];
}
```

`CycleSnapshot.decisions[]` keeps its current shape. The transient decisions computed during inference are serialized here for the next cycle's `detectChanges` call. The READ side of change detection becomes the only consumer of stored decisions — UI never reads them.

This means change-detection's decision-level delta computation works unchanged. Wave 20 doesn't touch `packages/change-detection`.

---

## 9. Targeted re-analysis (Wave 21 prerequisite)

`engine.run({ scope: { kind: 'targeted', url, purposes } })` semantics:

1. **Evidence collection narrowed:** only the specified URL is re-fetched + re-enriched (only the purposes listed). All other evidence is read from the prior full cycle's persisted state.
2. **Signal extraction narrowed:** only signals whose evidence_refs are in the new evidence set are recomputed. All other signals are read from `CycleSnapshot.signals` of the prior cycle.
3. **Inference narrowed:** only inferences whose signal_refs include a recomputed signal are recomputed. All others are read from prior.
4. **Decision + impact + projections narrowed:** only decisions whose inferences changed are recomputed. Only findings derived from changed value cases are rebuilt.
5. **Change detection skipped:** the cycle is the same; the delta is intra-cycle.
6. **Persistence:** new findings carry the same `inference_key` + `surface` as their prior versions. The DB write either updates in-place or inserts and supersedes (depending on whether targeted cycles get their own cycleId — see open question §11).

### Output shape for targeted

```ts
// Same EngineRunOutput type, but:
{
  scopeKind: 'targeted',
  affectedUrls: ['/pricing'],
  // signals + inferences + projections contain ONLY the recomputed subset
  // newSnapshot is the prior snapshot with the recomputed deltas merged in
}
```

The orchestrator (probe-runner from Wave 21) calls `engine.run(targeted)` then asks the persistence layer to "update findings for these URLs in this cycle." The detail of HOW persistence is wired (in-place update vs supersede-by-cycle) is decided in Wave 21 design, not Wave 20.

---

## 10. Acceptance criteria for Wave 20 (recap with target API in scope)

A cycle run on havefunnels.com produces byte-identical `FindingProjection[]` + `ActionProjection[]` as before, AND:

- [ ] `grep -r "additional_signals\|additional_inferences" packages/ apps/` returns zero matches.
- [ ] `grep -rn "createSignal" packages/ workers/` matches only files in `packages/signals/`.
- [ ] `packages/inference/triple-source-inference.ts` no longer exists.
- [ ] `packages/inference/engine.ts` is <500 lines (orchestrator-only).
- [ ] Every pack file in `packages/inference/packs/` is <1500 lines.
- [ ] `apps/audit-runner/run-cycle.ts` is <800 lines (today it's 1800+).
- [ ] `engine.run({ scope: { kind: 'targeted', url, purposes } })` runs end-to-end and returns a partial `EngineRunOutput`.
- [ ] Every `FindingProjection.status` reflects its actual cross-cycle state (not all `'created'`).
- [ ] `packages/decision/engine.ts:Decision.projections.findings[]` field no longer exists.
- [ ] Snapshot regression suite passes (compare projections JSON before/after Wave 20 on havefunnels.com cycle).

---

## 11. Open questions (need product owner answer before Wave 20.5)

### Q1. Targeted cycles — same cycleId or new cycleId?

**Option A: same cycleId.** Targeted re-analysis updates findings in-place on the existing latest cycle. Pros: simpler readback; "current state" is always "latest cycle." Cons: loses history of what triggered each refresh.

**Option B: new cycleId.** Each targeted re-analysis is its own AuditCycle row (with `cycleType: 'targeted'`). Readback picks "latest finding per (envId, inferenceKey, surface) across all recent cycles." Pros: full audit trail; can show "this finding's value was updated by a probe at 14:32." Cons: more complex readback queries.

**Recommendation: Option B.** The probe history is valuable for the monthly "value caught" narrative ("we caught this change 3 hours after you deployed it"), and the readback query is a simple subquery added to existing finding loads.

### Q2. Keep `DecisionStatus` enum or delete?

If lifecycle moves entirely to `FindingProjection.status`, the `DecisionStatus` enum becomes single-valued (`Created`). **Recommendation: delete entirely.** Removes confusion when reading code; nothing is lost.

### Q3. `domain/Finding` interface — extend `FindingProjection` or delete?

**Recommendation: delete `domain/Finding`**, migrate its JSDoc docblocks onto `FindingProjection`. Having two types for the same conceptual thing is the root cause of the "where do I look?" confusion this whole document tries to fix.

### Q4. Static-checks signals — keep authority=`Heuristic` or upgrade to `Structural`?

Current `pixel` and `heartbeat` source kinds map to `Heuristic=2`. After consolidation, static-checks signals will participate in harmonization. They should be classified — **recommendation: `Structural=1`** (they read raw HTML, no interpretation). This means a browser-verified contradiction always wins, which is correct.

### Q5. Composite findings — keep computed-and-dropped if Wave 21 doesn't consume?

Wave 19d already wired CompoundFindings into Cross Signal Insights. **Recommendation: keep, the consumption is now real.** This question is resolved by Wave 19d shipping.

---

## 12. What this document does NOT decide

- **UI changes.** Wave 20 is engine-only. The UI continues to read `FindingProjection[]` + `ActionProjection[]` from the existing API. Pack-verdict view + lifecycle badges are UI follow-ups.
- **New finding packs.** No new packs in Wave 20.
- **LLM provider/model changes.** Unchanged.
- **Persistence storage decisions** for targeted cycles (Q1 above lists the options but the binding decision happens in Wave 21).
- **Performance optimization** beyond what falls out of consolidation. Goal is coherence, not speed.

---

## 13. Sign-off checklist

Before Wave 20.2 begins (delete dead code):

- [ ] Product owner reads §1-9, confirms the API surface
- [ ] Product owner answers Q1-Q4 in §11
- [ ] This document is updated with the answers
- [ ] ROADMAP.md Wave 20 sequence is updated if any step's scope shifts based on the answers

After this is signed off, Wave 20.2 through 20.7 can be executed in order with clear targets.
