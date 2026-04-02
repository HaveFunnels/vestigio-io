# Vestigio North Star

## Purpose

Vestigio exists to answer business-critical questions about a digital surface with enough confidence that an operator can make better decisions immediately.

It does not exist to produce long lists of technical findings.
It does not exist to maximize scan breadth for its own sake.
It does not exist to impress with tooling complexity.

Vestigio exists to tell a business:

- is this environment functional enough to operate and scale?
- where am I losing money or creating avoidable waste?
- what is increasing chargeback, churn, trust loss, or attribution failure?
- what should I fix first?
- where is the most plausible upside?

---

## Product category

Vestigio should be built and understood as:

**a decision-first intelligence system for digital business assurance**

Not as:

- a vulnerability scanner
- a crawler with dashboards
- a session replay product
- a monitoring suite
- an SEO auditor
- an “AI agent” without explicit evidence contracts

It may use capabilities associated with those categories, but it must always remain centered on:

- evidence
- decision
- business impact
- explainability
- controlled execution

---

## Core promise

For any meaningful user question, Vestigio should aim to provide:

1. a direct answer
2. a confidence level
3. the evidence basis
4. the likely business impact
5. the next best action
6. an optional verification path when uncertainty is still material

If the system cannot defend the answer, it must not pretend certainty.

---

## Golden rule

**Decision-first. Dataset-first. Execution-second.**

This means:

- first: understand what business question is being answered
- then: reuse and interpret available evidence
- only then: decide if more execution is necessary

Vestigio must not default to “run more scans” when evidence already supports a useful answer.

---

## What the user actually wants

Users do not buy “findings.”
Users do not buy “observability.”
Users do not buy “heuristics.”

They buy confidence around questions like:

- “Can I safely scale traffic now?”
- “Is my funnel actually functional?”
- “Am I wasting paid traffic?”
- “Is my checkout causing avoidable distrust?”
- “What is making me vulnerable to chargebacks?”
- “Where am I leaving money on the table?”
- “What should I fix first?”
- “Is there upside I can capture right now?”

Everything in the product must ultimately improve the quality of answers to those questions.

---

## Source-of-truth hierarchy

Vestigio must preserve a strict semantic hierarchy:

1. **Evidence**  
   Observable data, versioned and scoped, without business conclusion.

2. **Signals**  
   Local derived facts from evidence.

3. **Inferences**  
   Multi-signal interpretations that still do not answer the full business question.

4. **Risk / Upside evaluations**  
   Canonical evaluation layers that normalize downside or upside.

5. **Decisions**  
   The primary unit of product meaning.

6. **Outputs / projections**  
   Findings, preflight rows, incidents, opportunities, dashboard cards, chat responses.

This hierarchy must never be collapsed.

---

## Unit of value

The primary unit of value in Vestigio is:

**a defensible decision attached to a meaningful business question**

A decision is valuable only if it is:

- scoped correctly
- evidence-backed
- freshness-aware
- confidence-aware
- operationally useful

Outputs such as findings, incidents, preflight summaries and chat answers exist to deliver those decisions, not replace them.

---

## Core architectural truths

### 1. MCP is not the brain

MCP is the cognitive interface.
It is not the owner of business semantics.

MCP may:
- retrieve decisions
- retrieve evidence
- explain paths
- request verification

MCP may not:
- invent business rules
- bypass engine contracts
- become a hidden second decision engine

### 2. UI is not the brain

The frontend may project meaning.
It may not compute product meaning.

No business-critical decision may exist only inside:
- client code
- dashboard serializers
- ad hoc table logic
- UI conditionals

### 3. Findings are not the brain

Findings are delivery objects.
They are not the canonical reasoning layer.

### 4. Collection is not the product

Collection matters, but collection is a means.
Vestigio must not regress into a collection-first product.

### 5. Verification is controlled, not ambient

Expensive or fresh verification should happen:
- only when justified
- only via policy
- only through orchestrated requests
- never because a UI surface or MCP decided to improvise

---

## Product principles

### Principle 1 — Fast first value

The user should get useful answers quickly.
Vestigio must prefer phased enrichment over “wait hours for full truth.”

### Principle 2 — Optional enrichment, not mandatory instrumentation

Pixel and external integrations are optional enrichers.
They must never become prerequisites for core product value.

### Principle 3 — Business impact is mandatory

A meaningful decision must map to business impact.
If impact cannot be quantified, it must at least be qualified explicitly.

### Principle 4 — Explainability by design

The system must always be able to answer:
- why am I saying this?
- what evidence supports this?
- what made confidence high or low?
- what would change this conclusion?

### Principle 5 — Environment-aware truth

No meaningful decision should mix:
- production with staging
- one environment with another
- one business unit with another
- one checkout path with another
without explicit scoping

### Principle 6 — Suppression is governance, not deletion

False positives, trusted handoffs, allowlists and overrides must reduce exposure and priority without erasing historical reasoning.

### Principle 7 — Shared semantics beat per-module semantics

Route classification, checkout inference, policy coverage, trust boundary, freshness and confidence must become shared services/contracts, not repeated module-local logic.

---

## What the system must optimize for

Vestigio should optimize for:

- correctness of decisions
- time-to-first-value
- explainability
- low default execution cost
- strong scoping discipline
- extensibility of evidence and decision layers
- operational usefulness

Vestigio should not optimize for:

- number of findings
- number of scans
- amount of raw collected data
- number of integrated tools
- amount of UI chrome
- number of MCP tools

---

## Canonical business surfaces

Every core product surface must be interpretable as a projection over decisions:

### Chat
Primary conversational interface for decision retrieval and guided verification.

### Dashboard
Summary of active state, deltas, and priorities across environments/workspaces.

### Findings table
Detailed supporting evidence and filters, never the top semantic layer.

### Incident board
Active downside states requiring action.

### Opportunity board
Plausible upside states worth prioritizing.

### Preflight
Readiness lens over a selected landing/commercial path.

### Use-case maps
Grouped decision packs answering coherent business questions.

### Workspace summary
Portfolio-level decision aggregation.

If a surface cannot be clearly expressed as a projection over decisions/evidence, it likely does not belong in the first releases.

---

## Success criteria

Vestigio is succeeding when a user can reliably get answers like:

- “Yes, you can scale traffic, but fix measurement continuity first.”
- “No, your checkout trust posture is weak enough to justify holding spend.”
- “You are probably leaking value at the conversion boundary, not at the landing.”
- “This looks like a trusted hosted checkout, not a harmful external leak.”
- “This path is functional, but there is clear upside in trust/conversion support.”
- “We are not confident enough yet; here is what needs verification.”

Vestigio is failing when it behaves like:

- a noisy scanner
- a dashboard without prioritization
- an LLM wrapper over weak data
- a product that confuses collection with certainty
- a system that overclaims impact without defensible evidence

---

## Non-negotiable invariants

These are hard rules.

### Invariant 1
No business decision without evidence references.

### Invariant 2
No evidence blob as the primary intelligence contract.

### Invariant 3
No product meaning reconstructed only in UI.

### Invariant 4
No uncontrolled execution from MCP or chat.

### Invariant 5
No silent mixing of environments or scopes.

### Invariant 6
No “single score” replacing explicit reasoning layers.

### Invariant 7
No upside estimation without assumptions and confidence band.

### Invariant 8
No critical decision presented as fresh if a critical input is stale.

### Invariant 9
No finding treated as the canonical owner of business meaning.

### Invariant 10
No phase of the build may violate the semantic hierarchy:
evidence -> signal -> inference -> evaluation -> decision -> projection

---

## Build discipline

The system must be built in vertical slices, not in disconnected layers of abstraction.

The first meaningful slice should prove:

- a domain can be ingested
- evidence can be stored
- graph can be built
- signals can be derived
- inferences can be made
- one decision pack can answer one real business question

Until that works end-to-end, no amount of extra tooling, UI, or automation counts as progress.

---

## Decision packs as product spine

Vestigio should organize value around business-question packs, not technical modules.

Initial packs should include:

- scale readiness
- launch readiness
- revenue integrity
- chargeback resilience
- trust and conversion
- measurement confidence

These are not mere UI groupings.
They are product promises.

---

## Relationship with the legacy system

The legacy system contains valuable product brain:

- hybrid discovery
- trust boundary reasoning
- journey heuristics
- chargeback buckets
- revenue leak concepts
- confidence gating
- preflight primitives
- behavioral overlays

These concepts should be preserved.

What should not be preserved:

- omni-blobs as source of truth
- duplicated ontologies
- per-radar isolated semantics
- UI fallback logic as meaning owner
- monolithic storage/payload patterns

Vestigio V2 is a rewrite of architecture, not a rewrite of product intelligence.

---

## Relationship with the control plane

The SaaS boilerplate is allowed to own:

- auth
- billing
- workspace CRUD
- environment registry
- onboarding flows
- admin/settings shell
- notifications shell

It is not allowed to own:

- evidence semantics
- graph semantics
- risk semantics
- decision semantics
- MCP semantics
- worker semantics

The control plane is the management shell and reusable for other projects.
The engine is the product brain and modular.

---

## Final statement

When in doubt, choose the path that makes Vestigio better at this sentence:

**“Give the user the most useful defensible business answer with the least unnecessary execution.”**