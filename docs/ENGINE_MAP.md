# ENGINE_MAP.md — Vestigio Engine Architecture (Current State)

> **Last updated: 2026-05-21**
> **Source of truth: the code in `packages/` and `apps/audit-runner/`. This document supersedes the architectural claims in [DECISION_ENGINE.md](DECISION_ENGINE.md), [DOMAIN_MODEL.md](DOMAIN_MODEL.md), [RISK_ENGINE.md](RISK_ENGINE.md), [HEURISTICS_REVIEW.md](HEURISTICS_REVIEW.md) and [FINDINGS.md](FINDINGS.md) — those documents describe an aspirational state from April 2025 and are partially or wholly out of sync with the running engine.**

---

## Why this document exists

User (havefunnels.com, plan Max) flagged on 2026-05-21:

> "motor de análise de signals, inferências, findings e actions é all over the place, não otimizado e sem um pipeline claro de cross uso"

This document validates that claim by mapping the engine end-to-end **from the code**, not the docs. It enumerates the concrete coherence gaps so the next refactor can target them with surgical precision instead of speculative cleanup.

---

## The actual pipeline (verified)

```text
[1] staged-pipeline.ts (workers/ingestion/)
    ├── Stage A: bootstrap fetch (homepage)
    ├── Stage B: first-value synthesis    → computeClassification (#1)
    ├── Stage C: full crawl + enrichers   → emits Evidence
    └── Stage D: headless verification

[2] processBehavioralEventsForEnv (apps/audit-runner/process-behavioral.ts:187)
    └── aggregateSession → BehavioralSession/Cohort Evidence

[3] runStaticChecks (workers/ingestion/stages/static-checks.ts:41)
    └── emits Signal[] DIRECTLY (bypasses signals/engine.ts)  ⚠️

[4] recomputeAllAsync (packages/workspace/recompute.ts) — the ONE function that ties everything
    ├── assessAllEvidenceQuality              (packages/evidence/quality.ts)
    ├── reconcileIntegrations                 → commerceContext
    ├── buildGraph                            (packages/graph)
    ├── extractSignals                        (packages/signals/engine.ts) → rawSignals
    │   └── MRR contraction signal pushed manually on top  ⚠️
    ├── harmonizeSignals                      (packages/truth/signal-harmonizer.ts)
    ├── guardTruthConsistency                 (packages/truth/consistency-guard.ts)
    ├── adjustConfidenceByQuality             (packages/evidence/confidence-adjuster.ts)
    ├── computeInferences                     (packages/inference/engine.ts) — 260KB monolith ⚠️
    ├── computeSaasInferences                 (if pack eligible)
    ├── 8× produceDecision                    (packages/decision/engine.ts) per pack
    ├── computeVerticalInferences
    ├── computeFunnelMomentInferences
    ├── computeExternalReconInferences
    ├── computeSubdomainCrossDomainInferences
    ├── computeCrossDomainInferences
    ├── computeCrossPackSynthesis             (NOT exported from inference/index.ts) ⚠️
    ├── MERGE additional_inferences           (funnelGap + formFlow injected from run-cycle.ts) ⚠️
    ├── MERGE additional_signals              (static-checks, unharmonized + unadjusted) ⚠️
    ├── applySuppressionEffects               (packages/suppression — confidence-only, never filters)
    ├── produceIntelligence                   (packages/intelligence — root causes + global actions)
    ├── detectChanges                         (packages/change-detection)
    ├── regression-inference injection        (manual push of revenue_path_regressed) ⚠️
    └── composites: trust-surface-score / blast-radius-regression / opportunity-compression /
                    compound-findings         (packages/composites — none ever reach decisions)

[5] estimateImpact (packages/impact/engine.ts:114)
    └── per-inference $ ranges → QuantifiedValueCase[]

[6] projectAll (packages/projections/engine.ts:841)
    ├── projectFindings — iterates QuantifiedValueCase[] (NOT Decision.projections)  ⚠️
    ├── projectActions  — iterates GlobalAction[] (NOT Action[] from deriver)        ⚠️
    └── projectWorkspaces

[7] persistence (apps/audit-runner/run-cycle.ts:1686-1793, single $transaction)
    ├── PrismaFindingStore.saveForCycle(FindingProjection[])
    ├── PrismaActionStore.saveForCycle(ActionProjection[])
    ├── AuditCycle.projectionsCache (full ProjectionResult as JSON)
    └── snapshotStore.asyncSave(CycleSnapshot {decisions, signals})
```

`⚠️` marks each place where the canonical pipeline is bypassed or short-circuited.

---

## What each layer IS (in code, not in spec)

### Signal — `packages/domain/signal.ts:8`

In-memory typed fact:
```ts
interface Signal {
  signal_key: string;       // 'checkout_mode', 'checkout_off_domain', ...
  category: SignalCategory;
  attribute: string;        // 'checkout.mode'
  value: string;            // 'hosted', 'redirect', 'true'
  numeric_value: number | null;
  confidence: number;       // 0..100, mutated twice (harmonize + quality-adjust)
  evidence_refs: Ref[];
  freshness: Freshness;
  scoping: Scoping;
  cycle_ref: string;
}
```
- **Storage: none.** Signals never get their own DB table. They live as `Signal[]` arrays in-flight.
- **Snapshot:** `CycleSnapshot.signals[]` saved as JSON inside `AuditCycle` for cycle-to-cycle delta + MRR contraction baseline only.

### Inference — `packages/domain/inference.ts:8`

In-memory composite interpretation:
```ts
interface Inference {
  inference_key: string;       // 'trust_boundary_crossed', 'measurement_blindspot', ...
  category: InferenceCategory;
  conclusion: string;
  conclusion_value: string;    // 'true', 'high'
  severity_hint: string | null;
  confidence: number;
  signal_refs: Ref[];
  evidence_refs: Ref[];
  reasoning: string;
}
```
- **Storage: none directly.** Inferences appear in `CycleSnapshot` JSON only.

### Decision — `packages/domain/decision.ts:15`

In-memory composite. **Always born `Created` and stays `Created` forever** — the rest of the `DecisionStatus` enum is dead.
- `decision_key`, `question_key`, `status`, `effective_severity`, `decision_impact`, `confidence_score`, etc.
- `projections.findings[]` is **always an empty array** (`engine.ts:158-163`). Decisions do not actually project findings, despite what DECISION_ENGINE.md claims.
- Persistence: only in `CycleSnapshot.decisions[]` for change detection.

### Finding — TWO things, depending where you look

1. `packages/domain/finding.ts:10` — **vestigial type, never instantiated in production.**
2. `packages/projections/types.ts:104` — `FindingProjection`, **the real runtime type.** 40+ fields. Produced by `projectFindings()` iterating `QuantifiedValueCase[]` from the impact engine. Persisted to Prisma `Finding` table with full JSON blob in `projection` column.

### Action — TWO things, depending where you look

1. `packages/domain/actions.ts:8` — `Action` domain type, sole factory is `deriveActions()` (`packages/actions/deriver.ts:40`). 181 lines total.
2. `packages/projections/types.ts:~290` — `ActionProjection`, the UI-shape type. **Built from `MultiPackResult.intelligence.global_actions`, NOT from the `Action[]` that `deriveActions` produces.** Persisted via `PrismaActionStore`.

---

## "All-over-the-place" — the concrete catalog

The user's claim is verifiable. Here are the actual bypasses, dead paths, and divergences, in order of severity.

### A. Bypass paths (signals/inferences entering the pipeline outside the canonical flow)

| # | Bypass | Location | Consequence |
|---|--------|----------|-------------|
| 1 | **Static-checks emits Signal[] directly**, merged AFTER harmonization + quality adjustment | `workers/ingestion/stages/static-checks.ts:41` → injected as `additional_signals` in `recompute.ts:824` | ~21 static-check signals reach inference with raw confidence, no truth resolution, no evidence-quality scaling. Half the truth pipeline doesn't apply to them. |
| 2 | **MRR contraction signal pushed manually** after extractSignals returns | `recompute.ts:379-406` | Pragmatic (it needs snapshot history) but establishes a pattern of mid-pipeline injection. |
| 3 | **`computeFunnelGapInferences` + `computeFormFlowInferences`** called from `run-cycle.ts` directly, results injected as `additional_inferences` | `run-cycle.ts` → `recompute.ts` merge point | Two inference producers live OUTSIDE the inference engine's call graph. Tests that call `recomputeAll()` directly miss these. No `forPack()` filtering applied. |
| 4 | **Regression inference manually constructed** after change detection | `recompute.ts:1162-1191` | One inference (`revenue_path_regressed`) is created by the recompute orchestrator instead of by an inference module. |

### B. Dead code (defined, exported, never imported)

| # | Module | Location | Status |
|---|--------|----------|--------|
| 1 | `computeTripleSourceInferences` — 7 inference types | `packages/inference/triple-source-inference.ts:100` | **Verdict flipped 2026-05-21: RESGATAR via wire, not delete.** Recon during Wave 20.2 found all 7 inference keys have COMPLETE downstream pipeline support: `intelligence/root-causes.ts:321-327` maps them to root causes; `projections/inference-to-pack.ts:314-320` maps them to packs; `projections/engine.ts:269-275` carries surface descriptions; `projections/engine.ts:564-570` carries titles; `projections/remediation-catalog.ts:3531+` carries remediation steps; `decision/engine.ts:701,837` checks if some fired; `composites/compound-findings.ts:183` includes them in compound detection. The cross-domain comment at line 26-29 about "absorbing into heuristic fallback" was aspirational — only the comment was added, the migration never happened. **The 7 functions are well-built dormant features. Wiring is 1 line in `recompute.ts`.** |
| 2 | `assertTruthResolved` — supposed enforcement gate | `packages/truth/consistency-guard.ts:195-203` | **Only called from tests** (`tests/behavioral-audit.test.ts:350`). Production code never enforces that signals entering inference carry truth_metadata. The contract is documented but unenforced. |
| 3 | `domain/Finding` type | `packages/domain/finding.ts:10` | **Verdict revised 2026-05-21: NOT orphan — used internally as preflight workspace transient shape.** Recon during Wave 20.2 found that `packages/workspace/workspace.ts:154` actively constructs `Finding[]` as part of `WorkspaceResult.findings`, consumed by `src/app/app/workspaces/[id]/page.tsx`. Two parallel types is still a real design smell (UI reads `f.polarity` which is on FindingProjection, not Finding — type system lying somewhere), but deleting the domain type would break the preflight workspace. **Deferred to Wave 20.4** where lifecycle work touches the same code and a clean merge of the two types becomes natural. |
| 4 | `DecisionStatus.{Confirmed,Stale,Resolved,Regressed}` | `packages/domain/enums.ts:21-27` | Enum has 5 states; only `Created` is ever assigned. The other 4 exist only in tests. |
| 5 | `Decision.projections.findings[]` | `packages/decision/engine.ts:158-163` | Always initialized empty. **Verdict (2026-05-21): DELETE the field — Modelo B confirmed.** The whole Decision-as-separate-entity concept collapses: Decision becomes transient during inference (still computed for correlated-max scoring), but lifecycle/severity/category attributes move onto Finding. See "Modelo B decision" below. |
| 6 | `packages/composites/compound-findings.ts` output (`CompoundFinding[]`) | `recompute.ts:1340-1357` | Computed and stored on `MultiPackResult.composites`. **Verdict (2026-05-21): RESGATAR — quick-win wire.** The bridge function `compoundFindingsToChains()` exists at `src/lib/dashboard/cross-signal-narrative.ts:101` but has zero call sites. The `/cross-signals` page is supposed to surface these as the primary cross-signal layer — instead it falls back to a weak "findings grouped by URL" heuristic in `buildCrossSignalChains()` at `aggregator.ts:1020`. **Fix is ~1h of code, see [ROADMAP.md Wave 19d](ROADMAP.md).** |

### C. Triple-implementation / overlapping responsibilities

| # | Concept | Implementations | Note |
|---|---------|-----------------|------|
| 1 | `createSignal` factory | `packages/signals/create.ts` + `packages/signals/engine.ts` (historical copy) + `workers/ingestion/stages/static-checks.ts:822-856` (local copy) | ✅ **RESOLVED Wave 20.3** — both copies removed, all callers now use `packages/signals/create.ts` via `packages/signals/index.ts` re-export. |
| 2 | `computeClassification` | Called from `staged-pipeline.ts` (Stage B emit + buildResult) + `recompute.ts:609` | ✅ **RESOLVED Wave 20.3** — added optional `classification` to `MultiPackInput`; `run-cycle.ts` passes the staged-pipeline result through; `recompute.ts` uses it when provided. Net: one redundant computation removed per cycle. Stage B emit-time classification is preserved (different inputs, different purpose). |
| 3 | Cross-pack / cross-domain semantics | `cross-domain-inference.ts` (evidence-level), `cross-pack-synthesis.ts` (inference-level), `triple-source-inference.ts` (was orphan, now WIRED in Wave 20.2) | Layered semantics now correctly reflected in execution order (cross-domain → triple-source → synthesis). Naming still mildly confusing but no longer a coherence issue. |
| 4 | Public API consistency | All inference modules now exported from `inference/index.ts` | ✅ **RESOLVED Wave 20.3** — `computeCrossPackSynthesis` + `computeExternalReconInferences` added to `inference/index.ts`. `recompute.ts` uses a single barrel import for all 10 inference modules. |

### D. The 260KB monolith

`packages/inference/engine.ts` — `computeInferences()`:
- 11,234 lines across all `inference/` files; `engine.ts` itself is the majority
- 200+ distinct inference functions in a single push-loop
- Mixes Wave 3, Wave 4, Wave 5, Wave 6, Wave 7, Wave 8.3, security, behavioral, SaaS, copy, brand, commerce
- One flat `IdGenerator('inf')` scope
- Navigation aid: comments labeling phases. No structural boundary preventing a Phase 4B rule from referencing a signal that only exists in Phase 3E.
- No pack-internal early-return. Every cycle, every customer pays for every rule's evaluation cost.

### E. Documentation vs reality divergences

| Doc claim | Code reality |
|-----------|--------------|
| `DECISION_ENGINE.md`: "decision is the central concept; lifecycle = created/confirmed/stale/resolved/regressed" | Only `Created` is ever assigned. The lifecycle is dormant. |
| `DECISION_ENGINE.md`: "decision projects findings" | `Decision.projections.findings[]` is always empty. `FindingProjection` is built from `QuantifiedValueCase[]` (impact engine output), not from decisions. |
| `DECISION_ENGINE.md`: "incident and opportunity are first-class operational states" | No `Incident` or `Opportunity` model in Prisma; `Decision.category` carries the flag but no separate lifecycle entity exists. |
| `DOMAIN_MODEL.md`: "finding passa a ser projeção" | ✓ Implemented (`FindingProjection`). But the `domain/finding.ts` type that the doc references is the wrong one — the real type is `projections/types.ts:FindingProjection`. |
| `RISK_ENGINE.md`: "Verified 2026-04-02: spec remains accurate" | Partial. Risk evaluation IS implemented (`packages/risk/evaluator.ts:63`). But the surrounding decision lifecycle the doc assumes is dormant. |
| `HEURISTICS_REVIEW.md`: "Verified 2026-04-02" | Outdated. The signal/inference modularization the doc recommended is partially implemented but the `createSignal` triple + monolith engine.ts undermine it. |

---

## What the engine does well

This document focuses on coherence gaps, but the engine has real strengths worth preserving:

- **`truth/` package** — authority hierarchy + harmonization is a clean, well-designed solution to multi-source contradictions. The 6-level authority ladder is the right abstraction.
- **Cycle-to-cycle change detection** — `packages/change-detection` correctly computes deltas at the decision level and feeds back into projections as `change_class`.
- **Evidence quality scoring** — `packages/evidence/quality.ts` provides honest confidence modulation based on source/recency/corroboration.
- **Composability of per-pack `produceDecision()`** — clean separation between question packs (scale, revenue, chargeback, security, copy, channel, discoverability, brand).
- **ContentEnrichmentCache (Wave 19c)** — cross-cycle caching of LLM enrichment outputs.
- **Suppression governance** — well-modeled at the data layer, even if currently underused at the filtering layer.

The architecture is **not bad**, it is **incomplete and undisciplined at the seams**. The fix is consolidation, not rewrite.

---

## Modelo B decision (2026-05-21) — Decision collapses into Finding

The original DECISION_ENGINE.md framing (Workspace > Decision > Findings > Actions) was elegant but never made it to the UI. After review with the product owner, we're consolidating to **Modelo B**:

```
Workspace
   └── Finding (carries severity, impact, status, decision_impact, category)
          └── Action (prescription that addresses N findings)
```

Decision is **not deleted** — it becomes a **transient internal computation** during inference that drives correlated-max scoring (`packages/decision/engine.ts:produceDecision`). What changes:

- **`DecisionStatus` lifecycle moves to Finding** (Wave 20.4). `Finding.status: 'created' | 'confirmed' | 'stale' | 'resolved' | 'regressed'`. This is what makes "value caught" reports possible — see Wave 21.5.
- **`Decision.category` (`risk | gate | opportunity | state`) moves to Finding** as `Finding.category`.
- **`Decision.decision_impact` moves to Finding** as `Finding.decision_impact`.
- **`Decision.projections.findings[]` is deleted entirely** — no longer needed since the relationship inverts (findings carry their own decision-attributes, not the reverse).
- **Pack-level verdicts become computed views**, not persisted entities. "Scale Readiness: at_risk" is `packVerdict('scale_readiness', findings)` — a function over findings, not a row in the DB.
- **The chat agent still answers `is_it_safe_to_scale_traffic?`**, just by aggregating findings in the scale_readiness pack instead of looking up a pre-computed Decision row.

### Why Modelo B vs the original A

1. **The UI already treats findings as primary.** Trying to surface Decision now means redesigning UX for a layer users never asked for.
2. **"Value caught" maps naturally to findings.** "You had 5 findings open last month, 3 are now resolved, $X recaptured" is direct. "Your scale_readiness Decision transitioned from unsafe to safe" requires teaching what a decision is first.
3. **Simpler mental model** = onboarding cheaper, docs shorter, fewer places to introduce bugs.
4. **The pack-level rollup that Decision provided is trivially a computed view** — no entity needed.

### What's preserved

- Correlated-max severity scoring (`packages/risk/evaluator.ts`)
- Per-pack rule grouping (each pack still has its own inference module → finding generators)
- The 8 question-keys (`is_it_safe_to_scale_traffic`, etc.) — they're computed views now, not pre-stored answers

---

## Recommended consolidation target (the "clean engine")

What a coherent engine should look like — the API surface to refactor toward:

```text
EngineRunInput {
  scope:        "full_cycle" | { url: string, enrichers: string[] }   ← always-on enabler
  envId, cycleId, cycleMode, businessModel, locale
  previousSnapshot?
}

EngineRunOutput {
  signals: Signal[]            ← single source, all harmonized + quality-adjusted
  inferences: Inference[]      ← all inferences, all filtered through forPack
  decisions: Decision[]        ← with real lifecycle (Created → Confirmed → Stale → Resolved → Regressed)
  valueCases: QuantifiedValueCase[]
  rootCauses, globalActions, changeReport
  ProjectionResult             ← FindingProjection[] + ActionProjection[] + WorkspaceProjection[]
}

engine.run(input): EngineRunOutput  ← THE single entry point
```

Specifically:

1. **One `createSignal` factory.** Delete the two duplicates.
2. **No `additional_signals` / `additional_inferences` injection points.** Static-checks moves into the signals package. Funnel-gap + form-flow inferences move into the inference package with the ability to read DB inside their own scope, or expose them as evidence-producing workers that feed `extractSignals` normally.
3. **Delete `triple-source-inference.ts`** (or move its 7 unique findings into `cross-domain-inference.ts` where they belong).
4. **Implement the `DecisionStatus` transitions** (Confirmed/Stale/Resolved/Regressed) or remove the unused enum states.
5. **Either populate `Decision.projections.findings[]` or remove the field.** Today it lies to consumers.
6. **Break up `inference/engine.ts`** into pack-scoped sub-modules (e.g. `inference/packs/revenue/`, `inference/packs/security/`). One file per pack, each <500 lines. Keep `engine.ts` as the orchestrator that fans in/out.
7. **Make `cross-pack-synthesis` reachable via `inference/index.ts`** for API consistency, OR move it to a separate package that explicitly consumes inferences (e.g. `packages/synthesis/`).
8. **Delete `domain/finding.ts`** OR make `projection/FindingProjection` extend it. Today they're parallel and the "real" one is the wrong one.
9. **Either use `CompoundFinding` outputs in the UI or delete the composites module's output.** Today they're computed and dropped.

After consolidation, the always-on layer ([thesis A](../memory/project_inevitability_thesis.md)) plugs in cleanly as:
```text
DiffTriggeredRun → engine.run({ scope: { url, enrichers: ['copy_micro_copy', ...] } })
```
Without the consolidation, the always-on layer either reimplements a parallel orchestrator (compound debt) or has to thread through the existing tangle (engineering pain).

---

## File reference index (where to look when modifying each layer)

### Input / signals
- `packages/domain/signal.ts:8` — Signal type
- `packages/signals/engine.ts:48` — extractSignals (30+ sub-extractors)
- `packages/signals/create.ts` — canonical createSignal
- `packages/signals/saas-signals.ts:22` — extractSaasSignals
- `packages/signals/off-site-recon-signals.ts` — off-site recon signals
- `packages/signals/commerce-heuristic.ts` — commerce heuristic types
- `workers/ingestion/stages/static-checks.ts:41` — bypass static-check signals
- `apps/audit-runner/process-behavioral.ts:187` — behavioral evidence pipeline
- `packages/behavioral/session-aggregator.ts:84` — aggregateSession
- `packages/evidence/quality.ts` — assessAllEvidenceQuality
- `packages/evidence/confidence-adjuster.ts` — adjustConfidenceByQuality

### Truth
- `packages/truth/types.ts:15` — AuthorityLevel ladder
- `packages/truth/signal-harmonizer.ts:30` — harmonizeSignals
- `packages/truth/consistency-guard.ts:88` — guardTruthConsistency
- `packages/truth/consistency-guard.ts:195` — assertTruthResolved (tests-only)
- `packages/truth/resolver.ts:20` — resolveTruth

### Inference / composition
- `packages/domain/inference.ts:8` — Inference type
- `packages/inference/engine.ts:16` — computeInferences (monolith)
- `packages/inference/cross-pack-synthesis.ts:338` — computeCrossPackSynthesis (not in index.ts)
- `packages/inference/cross-domain-inference.ts:115` — computeCrossDomainInferences
- `packages/inference/external-recon-inference.ts:1124` — computeExternalReconInferences (not in index.ts)
- `packages/inference/triple-source-inference.ts:100` — DEAD CODE
- `packages/inference/funnel-gap-inference.ts:45` — computeFunnelGapInferences (called from run-cycle, not recompute)
- `packages/inference/funnel-moment-inference.ts:175` — computeFunnelMomentInferences (25 funnel-moment findings)
- `packages/inference/vertical-inference.ts:92` — computeVerticalInferences
- `packages/inference/saas-inference.ts:23` — computeSaasInferences
- `packages/composites/index.ts` — composites (compound-findings output is dropped)
- `packages/intelligence/engine.ts:28` — produceIntelligence
- `packages/intelligence/root-causes.ts:25` — INFERENCE_TO_ROOT_CAUSE (100+ key map)
- `packages/classification/engine.ts:32` — computeClassification (called 3×)
- `packages/change-detection/engine.ts:39` — detectChanges
- `packages/change-detection/prisma-snapshot-store.ts` — snapshot persistence

### Decision / output
- `packages/domain/decision.ts:15` — Decision type
- `packages/domain/enums.ts:21` — DecisionStatus (only Created live)
- `packages/decision/engine.ts:101` — produceDecision
- `packages/decision/conflict-resolver.ts` — ConflictReport
- `packages/risk/evaluator.ts:63` — evaluateRisk
- `packages/actions/deriver.ts:40` — deriveActions (only Action factory, 181 LOC)
- `packages/impact/engine.ts:114` — estimateImpact → QuantifiedValueCase[]
- `packages/suppression/lifecycle.ts` — evaluateSuppression
- `packages/suppression/confidence-applicator.ts:32` — applySuppressionEffects
- `packages/projections/engine.ts:841` — projectAll
- `packages/projections/engine.ts:1026` — projectFindings (from QuantifiedValueCase)
- `packages/projections/engine.ts:~1380` — projectActions (from GlobalAction, not Action)
- `packages/projections/types.ts:104` — FindingProjection (real Finding type)
- `packages/projections/prisma-finding-store.ts` — DB persistence
- `packages/projections/prisma-action-store.ts` — DB persistence

### Orchestration
- `apps/audit-runner/scheduler.ts` — hourly cron + cadence-by-plan dispatch
- `apps/audit-runner/run-cycle.ts:1093` — snapshot load
- `apps/audit-runner/run-cycle.ts:1624` — recomputeAllAsync call
- `apps/audit-runner/run-cycle.ts:1658` — projectAll call
- `apps/audit-runner/run-cycle.ts:1686-1793` — single $transaction persistence
- `packages/workspace/recompute.ts` — recomputeAllGen (lines 337-1367)
- `workers/ingestion/staged-pipeline.ts` — evidence collection
- `src/libs/plan-config.ts:74` — PLAN_CADENCE (cycle frequencies per plan)
- `src/libs/alert-evaluator.ts:18` — evaluateAlerts (event-driven, extensible)

---

## Honest assessment

The engine is **modular but not coherent**. It has 25+ packages, ~40k lines of TypeScript, and a real spine that works in production. But the spine has been short-circuited five distinct times (the bypass paths in section A), accumulated six pieces of dead code that pretend to be live (section B), and grown one true monolith (the 11k-line `inference/engine.ts`).

The user's "all-over-the-place" intuition is **correct and specific**. The fix is not "rewrite the engine" — it is "consolidate the bypasses, delete the dead, split the monolith." Estimated 5-7 days of focused work, ideally driven by the always-on layer as the forcing function (see [ROADMAP.md Wave 20](ROADMAP.md)).

---

## Related strategic context

- [DECISION_ENGINE.md](DECISION_ENGINE.md) — original vision (April 2025), partially out of sync
- [LLM_COST_AUDIT.md](LLM_COST_AUDIT.md) — cost baseline + Wave 19a/b/c context
- Memory: `project_inevitability_thesis.md` — the strategic question this engine cleanup serves
- Memory: `project_always_on_cost_analysis.md` — the always-on layer that plugs into the consolidated engine
