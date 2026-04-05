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
- an "AI agent" without explicit evidence contracts
- an AI-first product that wraps LLMs around thin data

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
If the evidence is thin, the confidence must say so — not the finding count.

---

## Golden rule

**Decision-first. Dataset-first. Execution-second.**

This means:

- first: understand what business question is being answered
- then: reuse and interpret available evidence
- only then: decide if more execution is necessary

Vestigio must not default to "run more scans" when evidence already supports a useful answer.

---

## What the user actually wants

Users do not buy "findings."
Users do not buy "observability."
Users do not buy "heuristics."

They buy confidence around questions like:

- "Can I safely scale traffic now?"
- "Is my funnel actually functional?"
- "Am I wasting paid traffic?"
- "Is my checkout causing avoidable distrust?"
- "What is making me vulnerable to chargebacks?"
- "Where am I leaving money on the table?"
- "What should I fix first?"
- "Is there upside I can capture right now?"

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

**Semantic enrichment** (LLM-derived content quality assessments, classification confidence boosts, etc.) operates between evidence and signals. It enriches the interpretation of already-collected evidence. It does not create evidence, does not bypass signals, and does not directly produce decisions. It is a controlled enhancement to steps 1→2, never a shortcut from 1→5.

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

The **value delivery loop** for the operator is:

```
finding → chat discussion / verification → action → resolved
```

Every feature should strengthen this loop. If it doesn't create a better finding, a better discussion, a better verification, or a better action, it likely doesn't belong.

---

## Core architectural truths

### 1. MCP / Chat is not the brain

MCP is the cognitive interface, implemented as a 3-layer LLM pipeline (input guard, core chat, output classifier) with playbooks, context chaining, and conversation memory.
It is not the owner of business semantics.

MCP may:
- retrieve decisions
- retrieve evidence
- explain paths
- request verification
- chain context across conversations
- suggest next actions via playbooks

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

### 6. Semantic enrichment is not a second brain

LLM enrichment may improve signal quality, classification confidence, and content interpretation. It is a **controlled enhancer** inside the evidence→signal path, not a parallel reasoning system.

Semantic enrichment must be:
- **evidence-grounded** — analyzes already-collected content, never invents observations
- **cacheable** — results keyed by evidence hash, re-computed only on evidence change
- **degradation-safe** — if enrichment fails or is unavailable, rule-based signals continue to work
- **bounded** — operates on specific, scoped inputs (a policy page, a CTA label, a pricing section), not on open-ended prompts
- **transparent** — enrichment-derived signals carry an `enrichment_source` marker so confidence scoring can weight them appropriately

Semantic enrichment may not:
- produce decisions directly
- override rule-based signals without explicit confidence arbitration
- become mandatory for core product value
- be used to inflate finding count or create the appearance of depth without substance

---

## Product principles

### Principle 1 — Actions first, not findings first

The user's primary surface is the Actions page. Vestigio is a decision-first operating layer, not a findings-first audit tool. Every projection exists to answer "what should I do next?" with prioritized, categorized, evidence-backed actions.

### Principle 2 — Fast first value

The user should get useful answers quickly.
Vestigio must prefer phased enrichment over "wait hours for full truth."

### Principle 3 — Optional enrichment, not mandatory instrumentation

Pixel, external integrations, and LLM enrichment are optional enrichers.
They must never become prerequisites for core product value.

The system must work well with zero enrichment.
It should work better with it.

### Principle 4 — Business impact is mandatory

A meaningful decision must map to business impact.
If impact cannot be quantified, it must at least be qualified explicitly.

### Principle 5 — Explainability by design

The system must always be able to answer:
- why am I saying this?
- what evidence supports this?
- what made confidence high or low?
- what would change this conclusion?

### Principle 6 — Environment-aware truth

No meaningful decision should mix:
- production with staging
- one environment with another
- one business unit with another
- one checkout path with another
without explicit scoping

### Principle 7 — Suppression is governance, not deletion

False positives, trusted handoffs, allowlists and overrides must reduce exposure and priority without erasing historical reasoning.

### Principle 8 — Shared semantics beat per-module semantics

Route classification, checkout inference, policy coverage, trust boundary, freshness and confidence must be shared services/contracts, not repeated module-local logic.

### Principle 9 — Change awareness is continuous

The system tracks cycle-to-cycle changes (regressions, improvements, new issues, resolutions) and surfaces change class on every action and finding. The operator should always know: "what changed?"

### Principle 10 — Root causes must sound like operator-facing failure modes

Root causes are the connective tissue between findings and actions. They appear in maps, MCP answers, workspace summaries, and action descriptions. They must be written for the operator, not for the engine.

A good root cause:
- **explains a mechanism**, not restates a symptom ("Trust fails at checkout because checkout crosses an untrusted domain" not "Trust is low")
- **collapses multiple findings** into one understandable problem a person can reason about
- **points to an actionable lever** — reading the root cause should make the fix direction obvious
- **uses business language**, not engine internals ("Purchase path depends on a single fragile point" not "SPOF detected on commercial graph node")
- **avoids circular naming** — if the root cause title is just the inference key in human words, it's not explaining anything

A bad root cause:
- restates the problem it groups ("Elevated dispute risk" ← groups dispute_risk_elevated — circular)
- fragments when remediation is the same (3 "abuse" root causes when one fix covers all 3)
- uses jargon the operator wouldn't speak ("Uncontrolled commerce variants escaping the safeguard model")

Root cause vocabulary should be periodically reviewed for:
- consolidation where fragmentation adds map clutter without adding insight
- rename where titles are circular or jargon-heavy
- category separation where two root causes in the same category have different remediations

Fewer, stronger root causes produce better maps, better MCP narratives, and better actions.

### Principle 11 — Verification closes confidence gaps, not coverage gaps

Browser verification, light probes, and re-verification exist to close **material uncertainty** about a decision that already matters. They do not exist to "run more things" or expand coverage for its own sake.

The system must distinguish between:

- **structural truth** — what the crawl observed (page exists, form posts to external domain, redirect chain has 4 hops). This is the default. It is cheap and fast.
- **semantic enrichment** — what the content means (policy language is vague, CTA is ambiguous, pricing has hidden fees). This adds interpretation. It costs more but is still static.
- **verified runtime confidence** — what actually happens when a browser loads the page (checkout loads, payment SDK initializes, mobile layout works). This is expensive and proves behavior.

Important decisions should not appear confident when the evidence supporting them is:
- single-source only (no corroboration)
- structurally inferred but never browser-verified
- stale beyond its freshness window

When confidence exceeds evidence quality, the system should flag this as a **confidence gap**, not hide it. The preflight, MCP answers, and workspace summaries must reflect honest uncertainty.

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
- perceived AI sophistication disconnected from evidence quality
- pack count for its own sake

---

## Canonical business surfaces

Every core product surface must be interpretable as a projection over decisions.
The UX hierarchy is strictly ordered: Actions first, Workspaces second, Chat third, Analysis fourth.

### Actions (primary surface)
Decision-derived, prioritized actions with categories (incident, opportunity, verification, observation), operational status, change class, verification maturity, and suggested resolve paths. This is where the operator lives. Actions answer: "what should I do next?"

### Workspaces
Pack-level decision aggregation with coherence scoring, confidence narratives, and change summaries. Workspace detail views show findings scoped to a specific decision pack.

### Chat
Conversational intelligence interface for decision retrieval, guided verification, and exploration. Backed by 3-layer LLM pipeline with playbooks and context chaining. Chat is also where the operator can **discuss findings, request verification, and resolve uncertainty** before acting — making it a critical part of the value delivery loop.

### Analysis
Deep analysis with evidence exploration, signal and inference details, and system health indicators.

### Findings table
Detailed supporting evidence with truth context, suppression context, verification maturity, change class, and evidence quality. Never the top semantic layer.

### Inventory
Site inventory (pages, surface relations) managed via Prisma models.

### Use-case maps
Causal maps showing the flow from findings through root causes to actions. Three map types: revenue leakage, chargeback risk, and root cause. Maps make the "why" behind decisions visual and navigable.

If a surface cannot be clearly expressed as a projection over decisions/evidence, it likely does not belong in the product.

---

## Success criteria

Vestigio is succeeding when a user can reliably get answers like:

- "Yes, you can scale traffic, but fix measurement continuity first."
- "No, your checkout trust posture is weak enough to justify holding spend."
- "You are probably leaking value at the conversion boundary, not at the landing."
- "This looks like a trusted hosted checkout, not a harmful external leak."
- "This path is functional, but there is clear upside in trust/conversion support."
- "We are not confident enough yet; here is what needs verification."
- "Your refund policy exists but the language is too vague to prevent disputes — here's what's missing."
- "Fixing your checkout domain configuration would resolve 4 issues across 3 packs."

Vestigio is failing when it behaves like:

- a noisy scanner
- a dashboard without prioritization
- an LLM wrapper over weak data
- a product that confuses collection with certainty
- a system that overclaims impact without defensible evidence
- a system that inflates finding count to look thorough
- a system where AI enrichment produces confident-sounding findings without evidence anchor

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
No "single score" replacing explicit reasoning layers.

### Invariant 7
No upside estimation without assumptions and confidence band.

### Invariant 8
No critical decision presented as fresh if a critical input is stale.

### Invariant 9
No finding treated as the canonical owner of business meaning.

### Invariant 10
No phase of the build may violate the semantic hierarchy:
evidence -> signal -> inference -> evaluation -> decision -> projection

### Invariant 11
No LLM enrichment may produce a decision or override a rule-based signal without explicit confidence arbitration in the signal/inference layer.

### Invariant 12
No root cause may exist in the vocabulary if it cannot be explained to an operator in one sentence without using engine terminology.

---

## Build discipline

The system is built in vertical slices, not in disconnected layers of abstraction.

The core vertical slice is proven and operational:

- a domain can be ingested (via `workers/ingestion/` — staged pipeline with recursive crawl, technology detection, structured data extraction, policy content analysis)
- evidence is stored (in-memory + PostgreSQL via `PrismaEvidenceStore`)
- graph is built (`packages/graph/`)
- signals are derived (`packages/signals/` — commerce, trust, measurement, support, mobile, network analysis, tracking stack, discoverability, brand, behavioral)
- inferences are made (`packages/inference/` — per-pack inference engines)
- root causes are grouped and linked to decisions (`packages/intelligence/`)
- multiple decision packs answer real business questions (`packages/workspace/`)
- projections produce Actions, Findings, and Workspace summaries (`packages/projections/`)
- causal maps connect findings → root causes → actions (`packages/maps/`)
- MCP provides conversational intelligence with playbooks (`apps/mcp/`)

The vertical slice extends through browser verification (desktop + mobile, network capture, error classification), authenticated SaaS analysis, and change detection across audit cycles.

---

## Decision packs as product spine

Vestigio organizes value around business-question packs, not technical modules.

### Implemented packs

- **Scale Readiness** — "Can I safely scale traffic?" (`packages/workspace/`)
- **Revenue Integrity** — "Where am I leaking revenue?" (`packages/workspace/revenue-workspace.ts`)
- **Chargeback Resilience** — "What is making me vulnerable to chargebacks?" (`packages/workspace/chargeback-workspace.ts`)
- **SaaS Growth Readiness** — "Is my SaaS product ready for growth?" (via classification + inference)

Extended packs (Phase 3+):
- **Channel Integrity** — "Is the payment/commerce channel secure and resilient?"
- **Discoverability** — "Can search engines and social platforms find and represent my commercial pages?"
- **Brand Integrity** — "Is anyone intercepting or impersonating my brand?"
- **Behavioral Workspaces** (7 pixel-dependent contexts) — "What does user behavior reveal about friction, trust, and conversion?"

These are not mere UI groupings.
They are product promises.

---

## Strategic expansion directions

Beyond the implemented packs, Vestigio's thesis naturally extends into transversal lenses that cut across existing packs. These are not implemented packs — they are likely next directions that follow from the product's existing evidence base and decision architecture.

### Trust & Conversion Lens

**Core question:** "Is trust continuous through the commercial journey, or does it break at the moments that matter most?"

Existing packs already detect trust signals (`trust_boundary_crossed`, `trust_break_in_checkout`, `trust_signals_thin_on_commercial`). But trust is evaluated per-page or per-checkpoint, not as a **journey-level arc**. The operator doesn't see the delta — trust strong on landing, weak at checkout.

This lens would surface:
- trust continuity across the commercial journey (not just at checkout)
- trust asymmetry at the money moment — the gap between pre-checkout trust and at-checkout trust
- reassurance gaps — moments where the buyer needs confidence but the surface provides none
- expectation vs. purchase moment — does the journey ask for more commitment than the offer has justified?

**Why it matters:** Trust erosion close to conversion is the single most impactful pattern Vestigio can detect. It crosses scale readiness, revenue integrity, and chargeback resilience simultaneously. Making it a first-class lens means the operator sees it as one connected problem, not scattered findings across 3 packs.

**What it is not:** A new pack. It is a transversal analysis that enriches existing decisions and produces composite findings/actions that reference multiple packs.

### Money-Moment Exposure

**Core question:** "Is the visible security posture of my environment creating financial risk, trust risk, or operational risk?"

This is a security-through-business-impact lens. It translates surface-visible security signals into the same language Vestigio already speaks: trust, revenue, conversion, compliance, operational readiness.

**What it is:**
- Business security assurance — not penetration testing, not CVE scanning
- Assessment of security posture visible from the same evidence used for trust/revenue analysis
- Financial impact quantification of security gaps (trust erosion, compliance risk, processor sanctions, conversion loss)

**Evidence base (no new infrastructure required):**
- Security headers (HSTS, CSP, X-Frame-Options — already in `HttpResponsePayload.headers`)
- Mixed content (HTTP resources on HTTPS pages — already in script/form/iframe payloads)
- Open redirects (redirect chains with user-controllable parameters — already in `RedirectPayload`)
- Exposed sensitive endpoints (admin panels, debug endpoints, config files — probe during crawl)
- Cookie and auth surface security (Set-Cookie parsing, login form transport)
- Third-party script supply chain / SRI absence (script payloads)
- TLS / certificate / DNS deliverability (when collection is extended)

**Future evidence expansion (Nuclei):**
`NucleiMatchPayload` is already defined in the domain model. When integrated, it would add evidence for: checkout/cart hijack exposure, site cloning and impersonation, known misconfigurations, exposed admin/debug/docs endpoints, sensitive file access, insecurity patterns mapped by community templates. Nuclei evidence would feed the same signal→inference→decision pipeline, not bypass it.

**How it impacts the business:**
- Conversion and trust loss: mixed content, weak headers, insecure login/checkout
- Chargeback and disputes: perceived insecurity, failed confirmations, weak email deliverability
- Acquirer sanctions / compliance: PCI surface indicators, consent posture, checkout security
- Operational loss: exposed admin/debug/docs, interruption or abuse risk
- Indirect revenue loss: browser warnings, reputation damage, wasted traffic on insecure surfaces

**Finding families:**
- Checkout Security Weakness
- Trust-Surface Security Gap
- Exposed Sensitive Surface
- Transport Integrity Failure
- Abuse-Friendly Commerce Surface
- Security Misconfiguration with Business Impact

**The rule:** This lens is only worth building if every finding continues to answer: "is this costing me money, trust, or operational readiness?" If it drifts into a vulnerability list disconnected from business impact, it loses alignment with the Vestigio thesis.

---

## Semantic enrichment as evolution direction

### The opportunity

Vestigio's collection pipeline already captures text content that the system understands structurally but not semantically:

- policy page text (word count, term presence — but not clarity, completeness, or ambiguity)
- CTA labels (link text extracted — but not evaluated for clarity or persuasiveness)
- checkout page content (structural signals — but not trust language, security assurances, or hidden fees)
- pricing page content (page classified — but not assessed for plan comparison clarity or fee transparency)
- page titles and descriptions (extracted — but not evaluated for quality or classification accuracy)
- structured data claims (schema parsed — but not cross-validated against visible content)

A lightweight, cheap, bounded LLM call (Haiku-class) can turn structural extraction into semantic understanding at negligible cost (~$0.002-0.01 per audit).

### The principle

Semantic enrichment is not a product pivot. It is a **controlled enhancement** to the existing evidence→signal path.

The direction is:
- start with **policy pages** (highest ROI: bounded text, highest chargeback-prevention value, ~$0.002/audit)
- then **CTA labels + trust language on checkout** (link texts already extracted, clear quality signal)
- then **pricing/offer clarity** (directly impacts expectation misalignment decisions)
- then **page purpose validation** (content-based classification improves commercial path accuracy)
- then **structured data cross-validation** (detects schema/content mismatches)

The direction is NOT:
- AI analysis on every crawled page
- LLM-generated findings without evidence anchor
- replacing the heuristic/rule-based signal layer
- making LLM enrichment a prerequisite for core value
- using enrichment to inflate finding count or severity

### How it fits the hierarchy

```
Evidence (body text, CTA labels, policy content)
    ↓
Semantic enrichment (LLM: "is this policy ambiguous?", "is this CTA clear?")
    ↓
Enriched signals (policy_quality_score, cta_clarity_score, trust_language_present)
    ↓
Inferences (same rule-based inference engine, now with richer signal inputs)
    ↓
Decisions (same decision engine — enrichment improves input quality, not decision logic)
```

Enrichment results are cached by evidence hash. If enrichment is unavailable, the system degrades to structural-only signals — which already work.

---

## Anti-drift commitments

As Vestigio evolves — adding semantic enrichment, new lenses, richer root causes, and deeper verification — the following commitments prevent the product from losing its identity.

### The product must not become collection-first

More evidence is only valuable if it improves a decision. Adding collection capabilities without connecting them to signals, inferences, and decisions is engineering waste. Every new evidence type must have a clear path to at least one decision pack.

### The product must not maximize finding count

More findings is not more value. A finding that doesn't change a decision, create an incident, inform an action, or anchor a workspace is noise. Composite findings that collapse multiple symptoms into one insight are better than many micro-findings.

### The product must not use AI to appear intelligent without substance

LLM enrichment must be evidence-grounded, bounded, and cacheable. If the enrichment can't cite the evidence payload it analyzed, it doesn't belong. "AI-powered" is not a product feature — it is an implementation detail that must produce measurable signal quality improvement.

### The product must not become a vulnerability scanner

The Money-Moment Exposure lens exists to translate security posture into business impact. If it starts producing findings that can't answer "how does this cost the business money or trust?", it has drifted. Every security finding must pass the Vestigio test: decision-relevant, impact-quantified, action-oriented.

### The product must not inflate packs for growth optics

A new pack is a product promise. It means: "we answer this business question with enough rigor to be trusted." Adding packs without the evidence base, signal coverage, and inference depth to back the promise erodes credibility. Better to have 4 strong packs than 8 shallow ones.

### The confidence and verification loop must remain honest

The value loop is:

```
finding → discussion/verification → action → resolved
```

Each step must be honest:
- findings that look confident but rest on thin evidence should say so
- MCP discussion should surface uncertainty, not paper over it
- verification should be recommended when the confidence gap is material
- actions should reflect actual achievable remediation, not aspirational rewrites

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

The control plane (`apps/platform/` and `src/app/`) owns:

- auth and session management
- billing (Paddle primary, Stripe fallback)
- organization/membership CRUD
- environment registry
- SaaS access configuration
- onboarding flows (business profile, environment setup)
- admin panel (organizations, environments, pricing, errors, usage, system health)
- settings (data sources, SaaS access)
- job queue (Redis-backed with in-memory fallback)
- rate limiting (Redis-backed)
- token cost tracking and usage metering
- conversation persistence
- platform error tracking
- notifications shell

It is not allowed to own:

- evidence semantics
- graph semantics
- risk semantics
- decision semantics
- MCP semantics
- worker semantics

The control plane is the management shell.
The engine packages (`packages/`) are the product brain.
The dual domain model separates marketing (`vestigio.io`) from the app (`app.vestigio.io`).

---

## Final statement

When in doubt, choose the path that makes Vestigio better at this sentence:

**"Give the user the most useful defensible business answer with the least unnecessary execution."**

And when the answer could be more useful with a small, bounded, evidence-grounded enrichment — take it. But never at the cost of the answer being less defensible.
