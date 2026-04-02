# Legacy Insights

## Purpose

This document captures the most important lessons extracted from the legacy Vestigio system so that the rewrite preserves product intelligence without inheriting architectural debt.

It is not a nostalgia document.
It is not a migration checklist.
It is not a defense of the old implementation.

Its role is to answer:

- what was genuinely valuable in the old system?
- what was accidentally valuable but poorly structured?
- what repeatedly created ambiguity, duplication or fragility?
- what should explicitly inform the V2 rewrite?

This document should be read together with:

- `00_northstar.md`
- `DOMAIN_MODEL.md`
- `ARCHITECTURE_V2.md`
- `HEURISTICS_REVIEW.md`
- `IMPLEMENTATION_GUIDE.md`

---

## Executive summary

The strongest part of the legacy system was never its monolithic architecture.

Its strongest parts were the product concepts already encoded in code, especially:

- hybrid discovery
- route criticality
- trust boundary analysis
- checkout/provider inference
- policy coverage as commercial trust signal
- journey bottlenecks
- confidence gating
- operational enrichment
- preflight as readiness lens
- chargeback and revenue leak as business constructs, not merely technical defects

The weakest part of the legacy system was not “PHP.”
The weakest part was semantic duplication and blurred ownership:

- evidence, signals, inferences and outputs were often mixed together
- `audits.data` acted like an omni-container
- multiple modules reconstructed overlapping topology and trust logic
- different risk/status/severity systems coexisted without one canonical model
- UI and payload formats still carried part of the product meaning

The rewrite should preserve the former and eliminate the latter.

---

## What the legacy system got right

## 1. Hybrid discovery was a product advantage

The old system did not depend on a single discovery source.

It combined:

- sitemap and robots-derived seeds
- observed URLs from behavioral/runtime signals
- HTML crawl within bounded scope
- taxonomy-based prioritization
- platform-specific route probes
- fallback commercial probes

This was valuable because it aligned with the actual problem:
discovering commercially relevant paths, not merely crawling pages.

### Preserve conceptually

- multi-source discovery
- prioritization of critical/commercial paths
- route selection with diversity of evidence
- explicit operator hints such as checkout patterns

### Do not preserve as-is

- ad hoc spread across helpers
- implicit confidence of discovered routes
- brittle reliance on successful HTML fetches for classification

### V2 insight

Discovery should become:
- typed
- confidence-tagged
- scoped by environment/workspace/path
- able to distinguish `discovered`, `validated`, `critical`, `measured`

---

## 2. The legacy system had an embryonic evidence graph

The old system already modeled relations such as:

- anchors
- redirects
- form actions
- iframe sources
- script sources
- intent targets
- runtime navigations
- runtime checkout handoffs

This was one of the most valuable assets in the entire codebase.

It meant the old system was already drifting toward a graph substrate, even if it did not formalize it fully.

### Preserve conceptually

- relation kinds
- path-based reasoning
- topology as shared substrate
- runtime overlays on structural context

### Do not preserve as-is

- per-module repeated summarization of the same relations
- graph meaning hidden in helper logic and JSON payloads
- lack of canonical query layer

### V2 insight

The graph must become a first-class shared substrate used by:
- discovery
- chargeback logic
- revenue logic
- preflight
- MCP explainability

---

## 3. Business constructs were already more advanced than the architecture

The legacy system had surprisingly mature product concepts:

### Revenue leak
Not merely “broken checkout,” but leakage through:
- trust boundary crossing
- redirect friction
- opaque handoffs
- policy trust gaps
- attribution breakdown
- assurance hygiene issues

### Chargeback risk
Not transactional chargeback measurement, but dispute-readiness posture via:
- support/refund clarity
- delivery access posture
- checkout integrity
- disclosure quality
- identity/trust posture

### Preflight
Not another scan, but a launch/readiness lens over evidence already collected.

### Operational enrichment
Not just telemetry, but confidence gating over runtime signals.

### Preserve conceptually

- business framing of technical evidence
- readiness as a product primitive
- risk families as explicit product concepts
- composite findings such as broken attribution
- confidence/gating before escalation

### Do not preserve as-is

- module-local payload semantics
- multiple separate mini-engines without shared contracts
- parallel truth between payloads, tables and projections

### V2 insight

The old product already wanted to become a decision engine.
The rewrite should complete that transition explicitly.

---

## 4. Confidence mattered — and that was a major strength

One of the best parts of the legacy system was that it did not always trust itself blindly.

Examples included:
- confidence floors before promoting high severity
- strong-signal requirements
- context-only downgrades
- suppression of known PSP handoffs in revenue leak logic
- ingestion trust controls in behavioral systems
- stale-cycle handling in preflight

This is a major product differentiator.

### Preserve conceptually

- confidence independent from severity
- convergence requirements
- source trust / ingestion trust
- allowlists and trusted handoffs
- stale-aware interpretation

### Do not preserve as-is

- confidence encoded differently across modules
- manual special cases scattered in multiple helpers
- lack of one false-positive governance model

### V2 insight

Confidence and freshness must become shared contracts, not local module conventions.

---

## 5. Pixel optionality was strategically correct

The legacy system did something very right:
it did not require pixel instrumentation for core value, but it could use runtime signals when available.

That is strategically strong because it supports:

- fast time-to-value
- low-friction onboarding
- value before integration
- stronger decisions after optional enrichment

### Preserve conceptually

- zero-install baseline
- enrichment when signals exist
- behavioral overlays as confidence boosters
- runtime data as optional, not mandatory

### Do not preserve as-is

- uneven scoping of behavioral vs structural truth
- overloading runtime aggregates into mixed payloads

### V2 insight

Keep the principle:
**optional enrichment, never mandatory instrumentation**

---

## 6. Preflight was already the clearest product-ready surface

Among all the legacy features, preflight was the closest to a clean business surface.

Why?

Because it answered a real operator question directly:
- is this route ready?
- what blocks launch?
- what makes scaling unsafe?
- what is merely a risk versus a blocker?

This should absolutely survive into V2.

### Preserve conceptually

- landing-scoped profile
- readiness lens over existing evidence
- blocker / risk distinction
- stale version handling

### Do not preserve as-is

- partial duplication of underlying logic
- own mini-semantic format where shared decision contracts should exist

### V2 insight

Preflight should become a projection over shared decisions, not a separate reasoning island.

---

## What the legacy system got wrong structurally

## 1. `audits.data` became an omni-blob

This was one of the biggest structural liabilities.

It ended up mixing:
- raw evidence
- signals
- inferences
- summaries
- module-local payloads
- UI-facing output fragments

This created ambiguity about:
- what is source of truth
- what is derived
- what is historical
- what is current
- what should be typed

### Rewrite rule

Never recreate an omni-blob as primary truth.

Blobs may exist as export artifacts or caches.
They must not become canonical intelligence storage.

---

## 2. Multiple ontologies coexisted without one canonical model

The legacy system had overlapping semantic systems:

- issue severities
- radar scores
- finding severities
- readiness statuses
- confidence policies
- fix-first logic

This was manageable in a monolith but becomes dangerous in a modular rewrite.

### Rewrite rule

All meaningful semantics must collapse into:
- evidence
- signal
- inference
- evaluation
- decision
- projection

---

## 3. Similar reasoning was repeated in different modules

Chargeback, Revenue Leak and Preflight all reasoned about:
- checkout posture
- policy coverage
- trust continuity
- commercial handoff
- support visibility
- off-domain behavior

That overlap was valuable product-wise, but wasteful architecturally.

### Rewrite rule

Shared reasoning must live in shared services/contracts:
- route classification
- provider inference
- trust boundary evaluation
- policy coverage
- operational confidence
- freshness policy

---

## 4. UI still owned part of the meaning

The legacy system required UI/workspace builders to reconstruct meaning from:
- payload shape
- mixed storage sources
- fallback JSON
- partially normalized findings

This is precisely what V2 must not do.

### Rewrite rule

The UI may select, filter and present.
It may not become a semantic reconciliation layer.

---

## 5. Freshness was meaningful, but fragmented

The old system clearly knew stale data mattered, especially in:
- preflight
- operational enrichment
- runtime ingestion confidence

But freshness was not one systemic contract across:
- evidence
- signals
- inferences
- decisions
- integrations

### Rewrite rule

Freshness must become universal metadata.

Every material object should know:
- when it was observed
- until when it is fresh enough
- why it is stale
- what refresh mode is appropriate

---

## 6. False-positive governance was incomplete

The old system had strong false-positive instincts, but governance was uneven:

- Brand Radar had more explicit suppression concepts
- Chargeback and Revenue Leak relied more on local gates/special cases
- known PSP suppression existed
- runtime ingestion trust existed
- allowlist-like thinking existed

But there was no unified false-positive governance model.

### Rewrite rule

Create shared governance primitives:
- suppression rules
- trusted external handoffs
- allowlists
- dispute/review state
- expiration/review policies

Suppressions should reduce visibility and priority without erasing history.

---

## 7. Some semantics were “half modernized”

Several parts of the legacy system showed evolution in progress:
- normalized finding storage existed
- cycle-based transitions existed
- but older payload semantics still coexisted
- some logic still referenced older simplified modes
- multiple tables represented related concepts with overlapping purpose

This means the legacy system already knew where it wanted to go, but stopped midway.

### Rewrite rule

Do not carry forward transitional semantics as permanent architecture.

---

## Specific legacy ideas worth explicitly preserving

## A. Cycle-scoped intelligence

The legacy cycle model was valuable.
It allowed:
- versioning
- transitions
- stale handling
- compare-over-time semantics

### Preserve
- cycle as analysis/version unit
- transitions over time
- full vs incremental semantics

### Improve
- typed cycle-bound evidence
- cycle-bound decisions
- freshness policy per cycle fragment

---

## B. Trust boundary as a first-class concept

This was one of the strongest product ideas in the legacy system.

Trust was not treated as abstract branding only.
It was operationalized through:
- off-domain commercial handoff
- provider recognition or ambiguity
- policy adjacency
- redirect friction
- support visibility
- domain/provider freshness

### Preserve
- trust boundary crossing
- trusted handoff exceptions
- suspicious/lookalike overrides
- commercial boundary reasoning

### Improve
- environment-aware trusted boundaries
- shared graph query semantics
- explicit decision usage

---

## C. Revenue leak as journey failure, not just page failure

A very strong idea.

The legacy system was right not to reduce revenue loss to:
- a missing button
- a broken page
- a single checkout error

It modeled leakage along paths, especially near conversion.

### Preserve
- path-based leak reasoning
- redirect friction
- handoff ambiguity
- policy trust gap
- broken attribution composite

### Improve
- canonical path subject model
- clearer confidence classes
- opportunity mirror model

---

## D. Chargeback as dispute-readiness posture

Another strong idea.

The legacy system correctly treated chargeback not as “actual payment data” but as defensibility/risk posture derived from:
- policies
- disclosure
- support
- delivery visibility
- checkout integrity
- trust posture

### Preserve
- the five risk buckets
- policy and checkout discovery split
- defense-pack explainability

### Improve
- canonical risk model
- decision-level promotion
- shared policy/provider services

---

## E. Operational enrichment as gate, not just telemetry

The old system understood that runtime signals should influence confidence, not just decorate dashboards.

### Preserve
- ingestion trust
- source coverage
- temporal consistency
- context-only downgrade

### Improve
- unify with general confidence/freshness system
- make it available to all major decisions

---

## F. Critical route orientation

The legacy system was not content-obsessed.
It was route- and decision-oriented, especially around:
- checkout
- cart
- pricing
- login/account
- contact/lead capture
- primary commercial surfaces

### Preserve
- critical route selection
- weighted path importance
- platform-aware route probing

### Improve
- environment-aware path scopes
- path confidence states
- explicit `discovered` / `validated` / `critical`

---

## What should be treated as legacy-only and not preserved structurally

These may have been necessary then, but should not shape V2 architecture.

- `audits.data` as semantic center
- duplicated truth between radar payloads and normalized stores
- output shapes defining meaning
- route semantics inferred too late in the pipeline
- business meaning reconstructed in UI
- local risk ontologies by module
- ad hoc graph/path rebuilding inside each radar
- tightly coupled mixed payload tables without one canonical owner

---

## Practical rewrite lessons

## Lesson 1
Preserve the **product brain**, not the code shape.

## Lesson 2
Prefer shared services over module-local cleverness.

## Lesson 3
Make all important semantics explicit:
- confidence
- freshness
- scoping
- suppression
- value estimation

## Lesson 4
Do not let “we already had this in the old system” justify poor storage or boundary choices.

## Lesson 5
Do not let the new architecture erase the commercial intelligence that the old heuristics already captured.

---

## Red flags to watch during the rewrite

If any of these happen, the rewrite is drifting the wrong way:

- a new omni-blob becomes source of truth
- MCP starts inventing decisions
- UI begins inferring business status from raw evidence
- one module reimplements trust boundary logic privately
- confidence is dropped “for simplicity”
- stale inputs do not degrade decisions
- incidents/opportunities are built directly from findings without decision contracts
- business profile is ignored in value estimation
- the system becomes scan-first again
- the first releases optimize breadth before decision usefulness

---

## Final rewrite lens

When deciding whether to preserve a legacy concept, ask:

1. Did this improve the quality of business answers?
2. Was it about product intelligence or just implementation convenience?
3. Can it be expressed cleanly as evidence, signal, inference, evaluation, decision or projection?
4. Does preserving it reduce ambiguity in V2?
5. Does it help the product answer:  
   “Is this environment functional, safe to scale, and where is the money/risk/upside?”

If yes, preserve the concept.
If not, let the implementation die with the monolith.