# Heuristics Review

> **Verified 2026-04-02:** This document remains accurate as a reference for legacy heuristic patterns and rewrite guidance. The rewrite has refactored overlapping responsibilities into shared services as recommended (route classification, checkout/provider inference, trust boundary evaluation, policy coverage, confidence/gate evaluation). Duplicated concepts (checkout_mode in multiple modules, off-domain logic in multiple modules) have been consolidated into the canonical pipeline.

## Scope

This document validates the current heuristics in four major areas:

- discovery
- checkout detection
- journey inference
- platform detection

It also lists redundancies, conflicts and safe improvements.

## 1. Discovery

### Valuable heuristics

- combine sitemap, visit, pixel and crawl
- prioritize routes with taxonomy weight
- use traffic hints from behavioral data
- use platform-specific route probes
- keep fallback probes for commercial pages

### Weak heuristics

- taxonomy/path probing depends on regex and sample slugs
- inventory coverage still depends on successful HTML fetches
- same root-domain scoping can miss sanctioned subdomain ecosystems if not represented correctly

### False positive risks

- fallback probes may validate generic pages that are not actually commercial
- traffic-heavy pages can be selected as critical even if they are not decision-relevant

### Missing signals

- canonical mapping of subdomain roles
- stronger support for headless apps / client-side routing
- explicit sitemaps from JS/JSON bootstraps

### Safe improvements

- keep current sources, but add a confidence tag per discovered URL
- separate `discovered` from `validated` from `critical`
- add first-class subdomain trust policy instead of only root-domain comparison

## 2. Checkout detection

### Valuable heuristics

- multi-signal extraction across links/forms/iframes/scripts/data attributes
- final redirect host as strong provider signal
- provider scoring instead of simple regex-only classification
- `checkout_mode` classification

### Weak heuristics

- `looks_like_checkout()` is token-based and language-limited
- SPA checkout flows may not expose explicit action URLs
- “lead capture only” can be over-triggered by generic form actions

### False positive risks

- pages with `buy`, `pay`, `pedido` in copy or JS but not real checkout
- embedded widgets that are unrelated to payment but still load iframes/scripts

### Missing signals

- thank-you / success confirmation evidence
- form intent classification from field inventory
- payment button SDK semantics beyond domain-based provider guess

### Safe improvements

- keep current token detector, but add confidence classes:
  - lexical
  - structural
  - runtime-confirmed
- treat provider guess as probabilistic output, not categorical truth
- add explicit “checkout not confirmed” state

## 3. Journey inference

### Valuable heuristics

- separate page views, transitions, leaves and errors
- aggregate loops, dropoffs and errors into bottleneck score
- derive funnel stage from page type and intent type
- connect journey impact to trust boundary and redirect hops

### Weak heuristics

- session outcome is approximated via `cta_click` and `form_submit_success`
- no strong canonical conversion event model found
- graph roots sometimes fall back to “node with highest visits”

### False positive risks

- CTA click may not equal meaningful intent
- exit reason heuristics can be noisy
- deduped session events can still under/over-count SPA navigation edge cases

### Missing signals

- explicit conversion milestone taxonomy
- attribution path stitching across off-domain approved checkout
- stronger journey typing for SaaS onboarding vs ecommerce vs lead gen

### Safe improvements

- preserve current graph, but add canonical event classes:
  - awareness
  - consideration
  - intent
  - conversion
  - post-conversion
- keep current fallbacks, but tag graph sections by confidence and observation depth

## 4. Platform detection

### Valuable heuristics

- simple regex-based detection is cheap and effective for mainstream platforms
- platform detection feeds discovery and checkout probing

### Weak heuristics

- no explicit Wix/Framer/Webflow/Squarespace support
- WordPress and WooCommerce can be conflated
- headless storefronts can evade regexes

### False positive risks

- third-party scripts referencing a platform can trip detection
- migrated sites may retain old asset paths

### Missing signals

- CMS vs commerce engine separation
- storefront vs hosted checkout provider distinction
- platform app/router signatures for SPA/headless modes

### Safe improvements

- preserve existing regexes as low-cost hints
- add confidence buckets:
  - weak html hint
  - strong asset signature
  - confirmed commercial path behavior

## Duplicated concepts across current files

- `checkout_mode` semantics appear in Chargeback, Revenue Leak and Preflight
- off-domain/trust boundary logic appears in multiple modules
- policy coverage exists in Chargeback and Preflight
- operational readiness appears in Operational Enrichment and Preflight
- critical surface context is reconstructed in multiple helpers

## Conflicting or ambiguous logic

- `checkout_mode` values are richer in `ChargebackCheckoutDiscovery`, but some scoring logic still checks `external`
- score/severity/status are overloaded across radars and preflight
- `audits.data` acts as evidence store, signal store and output store simultaneously
- preflight is a decision lens but currently persists as its own payload format

## Overlapping responsibilities

| Responsibility | Current overlap |
|---|---|
| commercial handoff analysis | Chargeback, Revenue Leak, Preflight |
| route relevance | CriticalUrlSelector, RevenueLeak surface extraction, Preflight landing logic |
| trust continuity | Chargeback, Revenue Leak, Preflight |
| operational confidence | OperationalEnrichment, Cybersecurity payloads, Preflight |

## Rewrite guidance

### Preserve

- current heuristics as seed logic
- current false-positive mitigations
- multi-source evidence approach

### Refactor into shared services

- route classification
- checkout/provider inference
- trust boundary evaluation
- policy coverage evaluation
- confidence and gate evaluation

