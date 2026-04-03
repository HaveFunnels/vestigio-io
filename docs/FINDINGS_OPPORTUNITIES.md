# FINDINGS_OPPORTUNITIES.md — Untapped Findings From Existing Evidence

> Last updated: 2026-04-02 (Documentation refresh)
> Grounded in: current codebase inspection
> Companion to: [FINDINGS.md](FINDINGS.md), [COLLECT.md](COLLECT.md), [COLLECT_OPPORTUNITIES.md](COLLECT_OPPORTUNITIES.md)

---

## A. Overview

### Distinction from COLLECT_OPPORTUNITIES.md

- **COLLECT_OPPORTUNITIES.md** = What **additional data** could existing collectors gather?
- **FINDINGS_OPPORTUNITIES.md** = What **additional findings** could be derived from data **already collected**?

This document inventories intelligence potential that is currently unused — evidence that is collected and stored but not fully exploited by the signal, inference, decision, or projection engines.

### Why this matters

Every evidence type listed in [COLLECT.md](COLLECT.md) flows through the pipeline. But the signal engine (`packages/signals/engine.ts`) and inference engine (`packages/inference/engine.ts`) only extract a subset of possible insights. The projection engine (`packages/projections/engine.ts`) only maps findings for existing inference keys.

The opportunities below require **no new collection** — only new rules, signals, inferences, projections, or composite heuristics applied to existing evidence.

---

## B. Findings Opportunity Inventory

---

### FO-1: Redirect Chain Trust Degradation -- IMPLEMENTED

| Field | Value |
|-------|-------|
| **Finding title** | Checkout trust eroded by redirect chain |
| **Description** | Each redirect hop in the checkout path loses a percentage of users and reduces trust. A 3+ hop chain to checkout indicates poor UX architecture. |
| **Status** | **Implemented** (Phase 30B — `redirect_chain_erodes_checkout_trust` finding in Revenue Integrity pack) |
| **Existing data** | `RedirectPayload` already captures full chain with per-hop URL, status_code, host. `external_redirect_chain` signal counts hops. |
| **What is missing** | Per-hop trust scoring. New signal: `redirect_trust_score` that assigns diminishing trust per hop, with extra penalty for cross-domain hops. Projection with per-hop visualization. |
| **Likely pack(s)** | revenue_integrity, scale_readiness |
| **Potential value** | Conversion improvement — each unnecessary redirect hop loses 5-15% of users |
| **Confidence risk** | Low — redirect chains are deterministic |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | `external_redirect_chain` signal exists but only produces binary high/medium severity. No granular trust-per-hop analysis. |

---

### FO-2: Cross-Domain Form Posting Risk -- IMPLEMENTED

| Field | Value |
|-------|-------|
| **Finding title** | User data submitted to unrecognized external endpoints |
| **Description** | Forms with `is_external=true` in `FormPayload` send user data to third-party domains. Payment fields escalate severity. |
| **Status** | **Implemented** (Phase 30 — `form_data_leaves_domain` finding in Scale Readiness pack) |
| **Existing data** | `FormPayload` with `is_external`, `target_host`, `field_names`, `has_payment_fields` |
| **What is missing** | Signal: `external_form_data_leak`. Inference: `user_data_leaving_domain`. Finding: user-facing privacy/trust risk. |
| **Likely pack(s)** | scale_readiness, chargeback_resilience |
| **Potential value** | Trust — users increasingly expect data to stay on-domain |
| **Confidence risk** | Low — form action is deterministic |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | External form detection exists but only feeds checkout-related signals, not general trust analysis. |

---

### FO-3: Iframe Trust Boundary Analysis -- IMPLEMENTED

| Field | Value |
|-------|-------|
| **Finding title** | Unknown external embeds weakening purchase trust |
| **Description** | External iframes on commercial pages that are NOT known providers (Stripe, PayPal). |
| **Status** | **Implemented** (Phase 30B — `untrusted_embeds_near_purchase` finding in Scale Readiness pack) |
| **Existing data** | `IframePayload` with `src`, `host`, `is_external`, `known_provider` |
| **What is missing** | Signal: `untrusted_iframe_on_critical_page`. Distinguish known-provider iframes (Stripe, PayPal) from unknown external iframes. |
| **Likely pack(s)** | scale_readiness, revenue_integrity |
| **Potential value** | Trust and conversion — unknown iframes reduce buyer confidence |
| **Confidence risk** | Medium — some legitimate iframes (YouTube embeds, etc.) may trigger false positives |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | Provider indicators use iframes for detection, but non-provider iframes on critical pages aren't flagged. |

---

### FO-4: HTTP Error Page Classification -- IMPLEMENTED

| Field | Value |
|-------|-------|
| **Finding title** | Revenue-critical pages unreachable |
| **Description** | HTTP errors (4xx/5xx) specifically on checkout, cart, pricing, login, order pages. |
| **Status** | **Implemented** (Phase 30 — `critical_path_broken` finding in Revenue Integrity pack) |
| **Existing data** | `HttpResponsePayload.status_code` for every page, `PageType` classification from crawl discovery |
| **What is missing** | Correlation: map status_code to page_type/criticality. Signal: `critical_page_error` (4xx/5xx on checkout, cart, login, pricing pages). |
| **Likely pack(s)** | scale_readiness, revenue_integrity |
| **Potential value** | Revenue — 404/500 on checkout is immediate revenue loss |
| **Confidence risk** | Low — HTTP status codes are deterministic |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | `http_errors` signal exists but doesn't distinguish page criticality. |

---

### FO-5: Response Time by Page Criticality

| Field | Value |
|-------|-------|
| **Finding title** | Checkout/payment pages are significantly slower than average |
| **Description** | `HttpResponsePayload.response_time_ms` is captured for every page. `slow_response` signal fires for pages > 3000ms. But there's no comparison between critical pages (checkout, cart) and average. A checkout page at 2500ms may not trigger `slow_response` but may be notably slower than the site average. |
| **Status** | Possible with minor rule additions |
| **Existing data** | `response_time_ms` for all fetched pages, page classification from URL tokens |
| **What is missing** | Comparative analysis: compute average response time, flag critical pages significantly above average. |
| **Likely pack(s)** | revenue_integrity, scale_readiness |
| **Potential value** | Conversion — checkout speed directly impacts completion rate |
| **Confidence risk** | Low |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | `slow_response` uses absolute threshold (3000ms), not relative comparison. |

---

### FO-6: Canonical URL Mismatch

| Field | Value |
|-------|-------|
| **Finding title** | Canonical URL inconsistencies may cause duplicate content or lost traffic |
| **Description** | `PageContentPayload.canonical_url` is collected for every page. Currently not analyzed. Mismatches (canonical pointing to wrong domain, canonical different from actual URL on critical pages) indicate SEO or traffic routing issues. |
| **Status** | Possible now from current evidence |
| **Existing data** | `canonical_url` in `PageContentPayload` |
| **What is missing** | Signal: `canonical_mismatch` (canonical != actual URL). Inference: `canonical_points_external` (canonical on different domain). |
| **Likely pack(s)** | scale_readiness |
| **Potential value** | Traffic — canonical issues cause search engine confusion and lost organic traffic |
| **Confidence risk** | Low — canonical URL is deterministic |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | `canonical_url` is collected but never inspected by any signal. |

---

### FO-7: Meta Tag Quality Assessment

| Field | Value |
|-------|-------|
| **Finding title** | Critical pages lack proper meta descriptions or titles |
| **Description** | `PageContentPayload` captures `title`, `meta_description`, `h1` for every page. Currently not analyzed for quality. Missing or duplicate titles on checkout/pricing pages hurt SEO and user confidence. |
| **Status** | Possible now from current evidence |
| **Existing data** | `title`, `meta_description`, `h1` per page |
| **What is missing** | Signal: `missing_meta_on_critical_page`. Cross-page duplicate detection: `duplicate_title_detected`. |
| **Likely pack(s)** | scale_readiness |
| **Potential value** | Traffic — meta quality affects CTR from search and social sharing |
| **Confidence risk** | Low |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | Page content is collected for graph building, not analyzed for content quality. |

---

### FO-8: Platform-Specific Risk Profiling -- IMPLEMENTED

| Field | Value |
|-------|-------|
| **Finding title** | Platform-specific checkout risk left unaddressed |
| **Description** | Platform-aware checkout anti-patterns (WooCommerce off-domain, Shopify without refund policy, etc.). |
| **Status** | **Implemented** (Phase 30B — `platform_checkout_risk_unaddressed` finding in Scale Readiness pack) |
| **Existing data** | Platform detection with confidence score |
| **What is missing** | Platform-specific inference rules. E.g.: Shopify stores use hosted checkout by default (expected trust boundary crossing), WooCommerce stores often lack CDN (expected slow responses). |
| **Likely pack(s)** | All packs (platform-conditional rules) |
| **Potential value** | Confidence — platform context reduces false positives and enables targeted recommendations |
| **Confidence risk** | Medium — platform-specific heuristics need careful validation |
| **Implementation leverage** | Medium effort |
| **Why not surfaced** | Platform detection feeds classification but not inference rules. |

---

### FO-9: Provider-Based Checkout Mode Inference

| Field | Value |
|-------|-------|
| **Finding title** | Checkout mode can be reliably inferred from detected payment provider |
| **Description** | `ProviderIndicatorPayload` detects Stripe, PayPal, Shopify, etc. Each provider has typical checkout modes (Stripe Checkout = redirect, Stripe Elements = embedded). Currently checkout_mode is detected from link/form patterns, not provider knowledge. |
| **Status** | Possible with minor rule additions |
| **Existing data** | Provider name + detection source (script vs iframe) |
| **What is missing** | Provider → checkout_mode mapping table. E.g.: `checkout.shopify.com` script → redirect mode; `js.stripe.com` + no iframe → embedded mode. |
| **Likely pack(s)** | scale_readiness, revenue_integrity |
| **Potential value** | Confidence — provider-based checkout mode is more reliable than link pattern matching |
| **Confidence risk** | Low — provider checkout patterns are well-documented |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | Provider indicators feed `provider_*` signals but don't contribute to checkout mode inference. |

---

### FO-10: Graph-Based Orphan Page Detection -- IMPLEMENTED

| Field | Value |
|-------|-------|
| **Finding title** | Commercial pages disconnected from main journey |
| **Description** | Commercial pages with zero inbound navigation links from graph. |
| **Status** | **Implemented** (Phase 30B — `commercial_pages_disconnected` finding in Revenue Integrity pack) |
| **Existing data** | Full evidence graph with nodes and edges. Page classification by type. |
| **What is missing** | Query: `findOrphanCriticalPages()` — pages classified as checkout, pricing, or contact that have zero incoming edges from other internal pages. |
| **Likely pack(s)** | revenue_integrity, scale_readiness |
| **Potential value** | Conversion — unreachable checkout pages are direct revenue loss |
| **Confidence risk** | Medium — SPA navigation may not create link edges |
| **Implementation leverage** | Low effort (graph query addition) |
| **Why not surfaced** | Graph is used for trust boundary analysis and commercial paths, but not for orphan detection. |

---

### FO-11: Evidence Corroboration Scoring for Findings -- IMPLEMENTED

| Field | Value |
|-------|-------|
| **Finding title** | Evidence quality scoring surfaced per finding |
| **Description** | `FindingProjection.evidence_quality` now surfaces source_reliability, completeness, recency, corroboration, and composite scores. |
| **Status** | **Implemented** (Phase 0 UX — `evidence_quality` field in `FindingProjection`) |
| **Existing data** | Corroboration score per evidence group, truth resolution metadata, contradiction counts |
| **What is missing** | Finding-level corroboration indicator: "This finding is backed by X evidence sources with Y% corroboration." Would help users prioritize high-confidence findings. |
| **Likely pack(s)** | All packs |
| **Potential value** | Decision quality — users trust findings backed by multiple evidence sources |
| **Confidence risk** | Low |
| **Implementation leverage** | Low effort (projection enhancement) |
| **Why not surfaced** | Corroboration is computed for internal confidence adjustment but not exposed to users. |

---

### FO-12: Surface Relation Anomalies

| Field | Value |
|-------|-------|
| **Finding title** | Unexpected structural relationships between pages |
| **Description** | `SurfaceRelation` tracks 11 relation types (anchor, form_action, iframe_src, script_src, redirect, canonical_external, etc.) between pages. The graph builder uses this for commercial path analysis. But relation ANOMALIES (e.g. login page redirecting to external domain, form action pointing to 404) are not detected. |
| **Status** | Possible now from current evidence |
| **Existing data** | All surface relations with source_host, target_host, is_same_domain, relation_type |
| **What is missing** | Anomaly detection rules: cross-domain login redirects, form actions to error URLs, canonical pointing off-domain. |
| **Likely pack(s)** | scale_readiness, chargeback_resilience |
| **Potential value** | Security and trust — structural anomalies may indicate hijacking, misconfiguration, or phishing |
| **Confidence risk** | Medium — some cross-domain patterns are intentional |
| **Implementation leverage** | Medium effort |
| **Why not surfaced** | Surface relations are used for graph building but not anomaly detection. |

---

### FO-13: Language Consistency Across Journey -- IMPLEMENTED

| Field | Value |
|-------|-------|
| **Finding title** | Commercial journey switches language before conversion |
| **Description** | Homepage language differs from checkout/pricing page language. |
| **Status** | **Implemented** (Phase 30B — `commercial_journey_language_break` finding in Revenue Integrity pack) |
| **Existing data** | `lang` attribute per page, page classification by URL tokens |
| **What is missing** | Cross-page comparison: detect language changes between classified journey stages (homepage → product → checkout). |
| **Likely pack(s)** | revenue_integrity, chargeback_resilience |
| **Potential value** | Conversion and trust — language switches cause confusion, especially in non-English markets |
| **Confidence risk** | Low — language attribute is deterministic |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | `lang` is collected but never compared across pages. |

---

### FO-14: Multiple Payment Provider Fragmentation -- IMPLEMENTED

| Field | Value |
|-------|-------|
| **Finding title** | Checkout fragmented across competing providers |
| **Description** | 3+ distinct payment providers detected. Inconsistent checkout UX. |
| **Status** | **Implemented** (Phase 30 — `checkout_provider_fragmented` finding in Revenue Integrity pack) |
| **Existing data** | All `ProviderIndicatorPayload` entries per site |
| **What is missing** | Composite signal: `multiple_payment_providers` with count. Inference: `checkout_provider_fragmentation` when > 2 providers detected. |
| **Likely pack(s)** | revenue_integrity, scale_readiness |
| **Potential value** | Conversion — fragmented checkout creates confusion |
| **Confidence risk** | Medium — multiple providers may be intentional |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | Providers are individually detected but never aggregated. |

---

### FO-15: Change Detection Regression Findings -- IMPLEMENTED

| Field | Value |
|-------|-------|
| **Finding title** | Revenue path degraded since last audit |
| **Description** | Material regressions detected in change detection between audit cycles. `ChangeReportProjection` provides full aggregate. |
| **Status** | **Implemented** (Phase 30B — `revenue_path_regressed` finding + `ChangeReportProjection` in projection types) |
| **Existing data** | `CycleChangeReport` with regressions[], improvements[], `overall_trend` |
| **What is missing** | Projection: convert regressions into finding-level alerts. E.g. "Checkout integrity degraded from 'adequate' to 'fragile' since last audit." |
| **Likely pack(s)** | All packs |
| **Potential value** | Operational — trend awareness helps users respond to degradation |
| **Confidence risk** | Low — regression is measured against previous state |
| **Implementation leverage** | Medium effort (need to integrate change detection into projection engine) |
| **Why not surfaced** | Change detection exists but feeds `CycleChangeSummary` metadata only, not findings. |

---

### FO-16: Verification Maturity as Finding Context -- IMPLEMENTED

| Field | Value |
|-------|-------|
| **Finding title** | Verification maturity surfaced per finding |
| **Description** | `FindingProjection.verification_maturity` and `FindingProjection.verification_method` now surface the verification lifecycle state alongside each finding. |
| **Status** | **Implemented** (Phase 0 UX — `verification_maturity` and `verification_method` fields in `FindingProjection`) |
| **Existing data** | `VerificationState` with maturity, confidence_at_verification, verification_count |
| **What is missing** | Finding-level annotation: "Verified by browser" or "Unverified — static analysis only." |
| **Likely pack(s)** | All packs |
| **Potential value** | Trust — users can prioritize verified findings over unverified ones |
| **Confidence risk** | Low |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | Verification maturity tracks internal confidence but isn't shown to users. |

---

### FO-17: Positive Trust Signal Aggregation

| Field | Value |
|-------|-------|
| **Finding title** | Trust surface strength score |
| **Description** | Currently 6 positive findings are generated (CTA clarity, trust continuity, policy coverage, low friction, measurement, support). But these are independent booleans. A composite "trust strength score" that aggregates all positive indicators would be more useful. |
| **Status** | Possible with minor rule additions |
| **Existing data** | All 6 positive finding conditions |
| **What is missing** | Composite score: count of positive indicators / total possible. Surface as "Trust Surface: 4/6 factors positive." |
| **Likely pack(s)** | scale_readiness, chargeback_resilience |
| **Potential value** | Decision quality — holistic trust assessment vs individual signals |
| **Confidence risk** | Low |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | Positive findings are generated individually, not aggregated. |

---

### FO-18: Suppressed Finding Transparency

| Field | Value |
|-------|-------|
| **Finding title** | X findings are currently suppressed by governance rules |
| **Description** | The suppression system can hide, dim, or annotate findings. The governance layer tracks blind spots and escalations. But the user doesn't see a meta-finding about suppression state. |
| **Status** | Possible now from current evidence |
| **Existing data** | `SuppressionInventory`, `SuppressionBlindSpot[]`, `SuppressionEscalation[]` |
| **What is missing** | Meta-finding: "X findings are suppressed, Y warrant review, Z may be hiding real issues (blind spots)." |
| **Likely pack(s)** | All packs |
| **Potential value** | Governance transparency — prevents suppression from silently degrading coverage |
| **Confidence risk** | Low |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | Suppression governance metadata exists but isn't projected as a finding. |

---

### FO-19: SaaS Positive Findings -- IMPLEMENTED

| Field | Value |
|-------|-------|
| **Finding title** | Smooth activation flow / Clear upgrade path / Clean navigation / Guided empty states |
| **Description** | SaaS growth readiness now has 4 positive findings. |
| **Status** | **Implemented** (Phase 30 — `smooth_activation`, `navigation_clean`, `upgrade_path_visible`, `empty_states_guided`) |
| **Existing data** | All SaaS evidence (activation steps, empty states, upgrade surfaces, navigation structure) |
| **What is missing** | Positive finding rules: activation_step_count <= 3 + has_clear_cta → "Smooth activation flow"; navigation_complexity = low → "Clean navigation"; upgrade_surface_visibility = high + has_value_proposition → "Clear upgrade path" |
| **Likely pack(s)** | saas_growth_readiness |
| **Potential value** | Balance — users need to see what's working, not just what's broken |
| **Confidence risk** | Low |
| **Implementation leverage** | Low effort (mirror pattern from commerce positive findings) |
| **Why not surfaced** | Positive finding generation was only implemented for commerce packs. |

---

### FO-20: Behavioral Event Readiness Assessment

| Field | Value |
|-------|-------|
| **Finding title** | Site has no behavioral tracking capability |
| **Description** | `PixelManagement` tracks whether a pixel is configured. The signal engine detects `measurement_coverage`. But combining these: "You have a Vestigio pixel configured but it's not deployed" or "You have analytics but no Vestigio pixel" would be actionable. |
| **Status** | Possible now from current evidence |
| **Existing data** | Pixel configuration status, analytics detection from script patterns |
| **What is missing** | Composite finding: pixel deployment status × analytics presence. |
| **Likely pack(s)** | scale_readiness |
| **Potential value** | Measurement — closes the loop between what Vestigio can observe and what the user has deployed |
| **Confidence risk** | Low |
| **Implementation leverage** | Low effort |
| **Why not surfaced** | Pixel management and analytics detection are in separate subsystems with no cross-referencing. |

---

## C. Opportunity Summary

### Quick Wins (Low effort, high value, low false-positive risk)

**Many quick wins have been implemented since the original assessment.** Remaining:

| # | Opportunity | Effort | Value | Status |
|---|------------|--------|-------|--------|
| FO-4 | HTTP error page classification by criticality | Low | Revenue, Scale | **DONE** |
| FO-6 | Canonical URL mismatch detection | Low | Scale | Still pending |
| FO-9 | Provider-based checkout mode inference | Low | Confidence improvement | Still pending |
| FO-13 | Language consistency across journey | Low | Revenue, Chargeback | **DONE** |
| FO-16 | Verification maturity as finding context | Low | Trust, all packs | **DONE** |
| FO-19 | SaaS positive findings | Low | SaaS balance | **DONE** |
| FO-2 | Cross-domain form posting risk | Low | Trust | **DONE** |
| FO-11 | Evidence corroboration scoring for findings | Low | Decision quality | **DONE** |

### High-Value but Higher Implementation Effort

| # | Opportunity | Effort | Value | Risk | Status |
|---|------------|--------|-------|------|--------|
| FO-8 | Platform-specific risk profiling | Medium | All packs | Heuristic validation needed | **DONE** |
| FO-10 | Graph-based orphan page detection | Low-Medium | Revenue | SPA false positives | **DONE** |
| FO-12 | Surface relation anomalies | Medium | Security, trust | Intentional patterns | Still pending |
| FO-15 | Change detection regression findings | Medium | Operational awareness | Noise in early cycles | **DONE** |

### Findings That Need Only Better Projections

These require no new signals or inferences — only projection engine changes:

| # | Opportunity | Change Needed |
|---|------------|---------------|
| FO-11 | Corroboration scoring | Add corroboration data to `FindingProjection` |
| FO-15 | Regression findings | Map `CycleChangeReport.regressions` to findings |
| FO-16 | Verification maturity labels | Add maturity to `FindingProjection` |
| FO-17 | Trust strength score | Aggregate positive findings into composite |
| FO-18 | Suppression transparency | Project `SuppressionInventory` as meta-finding |
| FO-19 | SaaS positive findings | Mirror commerce positive finding pattern |

### Findings That Need Only Better Composite Rules

These require new signal or inference rules but use existing evidence:

| # | Opportunity | New Rule Type |
|---|------------|--------------|
| FO-1 | Redirect trust degradation | Signal: per-hop trust scoring |
| FO-3 | Iframe trust boundary | Signal: untrusted iframe classification |
| FO-4 | Critical page errors | Signal: status_code × page_type correlation |
| FO-5 | Response time by criticality | Signal: comparative timing analysis |
| FO-8 | Platform-specific risks | Inference: platform-conditional rules |
| FO-14 | Provider fragmentation | Signal: multi-provider aggregation |

### Findings That Could Be AI-Assisted But Should Remain Evidence-Grounded

| # | Opportunity | AI Role | Evidence Anchor |
|---|------------|---------|-----------------|
| FO-7 | Meta tag quality | NLP analysis of title/description quality | PageContentPayload |
| FO-8 | Platform risk profiling | Knowledge base of platform-specific patterns | PlatformIndicatorPayload |
| FO-12 | Surface relation anomalies | Anomaly detection on relation patterns | SurfaceRelation graph |
| FO-20 | Behavioral readiness | Cross-system gap analysis | Pixel config × analytics signals |
