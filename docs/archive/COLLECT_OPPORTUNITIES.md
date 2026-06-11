# COLLECT_OPPORTUNITIES.md — Collection Expansion Opportunities

> Last updated: 2026-04-05
> Grounded in: current codebase inspection
> Companion to: [COLLECT.md](COLLECT.md)

---

## A. Overview

### What counts as a "collection opportunity"

A collection opportunity is **additional information that an existing collection method could extract**, without requiring a fundamentally new collection family. This means:

- Additional fields from already-fetched responses
- Deeper extraction from already-parsed HTML
- Broader pattern matching using existing regex infrastructure
- Richer browser traces from already-launched Playwright sessions
- More observation from already-authenticated SaaS sessions
- Stronger metadata from current crawl sessions

This document does NOT cover:
- Entirely new external integrations (e.g. Stripe API, Google Analytics API)
- New runtime infrastructure (e.g. mobile testing, performance monitoring)
- Third-party data enrichment services

---

## B. Per-Method Opportunities

---

### 1. HTTP Fetch Client

**Currently collects:** HTTP response metadata, redirects, timing, headers, body

#### Opportunity 1.1: Security Header Analysis

| Field | Value |
|-------|-------|
| What else it could collect | Presence/absence/value of security headers: `Strict-Transport-Security`, `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Difficulty | Low |
| Why feasible | Headers are already captured in `HttpResponsePayload.headers`. Only need to parse specific keys. |
| New evidence/signal families | `security_header_present`, `csp_policy_strength`, `hsts_enabled` |
| Finding impact | scale_readiness (trust surface), chargeback_resilience (trust indicators) |
| Priority | Medium |
| Notes | Very low false-positive risk. Headers are deterministic. |

#### Opportunity 1.2: Cookie Analysis

| Field | Value |
|-------|-------|
| What else it could collect | Set-Cookie headers: cookie names, domains, secure flag, httpOnly flag, sameSite, expiry, third-party vs first-party |
| Difficulty | Low |
| Why feasible | `Set-Cookie` is in response headers. Parsing is straightforward. |
| New evidence/signal families | `tracking_cookie_detected`, `session_cookie_insecure`, `third_party_cookie_count` |
| Finding impact | scale_readiness (measurement/privacy), chargeback_resilience (session trust) |
| Priority | Medium |
| Notes | Could detect GDPR-relevant tracking without consent. |

#### Opportunity 1.3: TLS/Certificate Details

| Field | Value |
|-------|-------|
| What else it could collect | TLS version, certificate issuer, validity window, SANs, HSTS preload. Currently `CertificatePayload` exists in domain but is not populated by HTTP fetch. |
| Difficulty | Medium |
| Why feasible | Node.js `https` module exposes `socket.getPeerCertificate()` and `socket.getProtocol()` during connection. Requires hooking into socket events. |
| New evidence/signal families | `certificate_expiring_soon`, `weak_tls_version`, `certificate_mismatch` |
| Finding impact | scale_readiness (trust), chargeback_resilience (trust indicators) |
| Priority | Low |
| Notes | `CertificatePayload` and `DnsRecordPayload` types already defined in domain model — ready for population. |

#### Opportunity 1.4: Response Body Size & Compression

| Field | Value |
|-------|-------|
| What else it could collect | Uncompressed body size, compression ratio (gzip/brotli), content encoding. Currently only `content_length` from header. |
| Difficulty | Low |
| Why feasible | Body is already fully read. `Buffer.byteLength()` gives actual size. |
| New evidence/signal families | `page_weight_excessive`, `no_compression_enabled` |
| Finding impact | scale_readiness (performance under load) |
| Priority | Low |

---

### 2. HTML Parser

**Currently collects:** Title, meta, h1, canonical, lang, links, forms, scripts, iframes

#### ~~Opportunity 2.1: Structured Data Extraction (JSON-LD, Schema.org)~~ — IMPLEMENTED

| Field | Value |
|-------|-------|
| What else it could collect | `<script type="application/ld+json">` blocks: Product, Organization, BreadcrumbList, FAQ, Review, Offer schemas |
| Difficulty | Low |
| Status | **DONE** — `EvidenceType.StructuredDataItem` implemented. `extractStructuredData()` in parser. `trust_signals_thin_on_commercial` uses structured data count. |

#### ~~Opportunity 2.2: Open Graph & Social Meta Tags~~ — IMPLEMENTED

| Field | Value |
|-------|-------|
| What else it could collect | `og:type`, `og:image`, `og:title`, `og:description`, `twitter:card`, `twitter:site` |
| Difficulty | Low |
| Status | **DONE** — `MetaPayload.og_tags` captures OG tags. `social_previews_fail_commercial_value` signal checks OG tag completeness. OG title mismatch detection implemented in signals engine. |

#### ~~Opportunity 2.3: Inline Script Content Analysis~~ — IMPLEMENTED

| Field | Value |
|-------|-------|
| What else it could collect | Inline `<script>` content for: analytics initialization, error tracking, A/B testing, chat widgets |
| Difficulty | Medium |
| Status | **DONE** — `EvidenceType.InlineScriptContent` implemented. `extractInlineScripts()` in parser. Technology detection via `packages/technology-registry/` handles analytics, chat, consent, A/B testing classification. Feeds `extractTrackingStackSignals` and `extractSupportWidgetSignals`. |

#### Opportunity 2.4: Accessibility Signals

| Field | Value |
|-------|-------|
| What else it could collect | `lang` attribute presence, `alt` on images, `aria-label` on interactive elements, form `<label>` presence, viewport meta tag |
| Difficulty | Medium |
| Why feasible | Regex extraction from existing HTML body. |
| New evidence/signal families | `form_accessibility_weak`, `missing_viewport_meta` |
| Finding impact | scale_readiness (readiness for diverse traffic), revenue_integrity (form completion friction) |
| Priority | Low |

#### ~~Opportunity 2.5: Policy Page Content Depth~~ — IMPLEMENTED

| Field | Value |
|-------|-------|
| What else it could collect | Word count of policy pages, heading structure, section detection |
| Difficulty | Low |
| Status | **DONE** — `PolicyPagePayload.word_count` now populated. `analyzePolicyContent()` in parser extracts word count, section structure. `thin_refund_policy` signal fires for word_count < 200. Policy depth signals feed chargeback resilience pack. |

#### Opportunity 2.6: Pricing Page Analysis

| Field | Value |
|-------|-------|
| What else it could collect | Pricing page detection is done but content is not deeply analyzed. Could extract: price points, plan names, currency, comparison tables, free trial indicators, money-back guarantees |
| Difficulty | Medium |
| Why feasible | Pricing pages are already fetched and parsed. Pattern matching for currency symbols, plan names, "free trial", "money-back" is straightforward. |
| New evidence/signal families | `pricing_unclear`, `no_money_back_guarantee`, `free_trial_available`, `plan_comparison_present` |
| Finding impact | chargeback_resilience (expectation setting), saas_growth_readiness (upgrade clarity), revenue_integrity (pricing confidence) |
| Priority | Medium |

---

### 3. Crawl Discovery Engine

**Currently collects:** URL inventory via path probing + homepage link scanning

#### ~~Opportunity 3.1: Recursive Crawl from Discovered Pages~~ — IMPLEMENTED

| Field | Value |
|-------|-------|
| What else it could collect | Links from ALL fetched pages, not just homepage |
| Difficulty | Medium |
| Status | **DONE** — Phase 2B recursive crawl implemented in `workers/ingestion/staged-pipeline.ts`. Links from all fetched pages feed discovery queue. Constrained to `MAX_RECURSIVE_PAGES = 10`. All packs benefit from broader evidence base. |

#### Opportunity 3.2: Sitemap.xml Processing

| Field | Value |
|-------|-------|
| What else it could collect | Parse sitemap XML to discover pages by priority, changefreq, lastmod. Currently fetched but not parsed. |
| Difficulty | Low |
| Why feasible | Sitemap is already fetched in Stage B. XML parsing (regex or simple parser) is straightforward. |
| New evidence/signal families | `sitemap_page_inventory`, `sitemap_priority_distribution`, `page_freshness_from_sitemap` |
| Finding impact | scale_readiness (crawl coverage), revenue_integrity (discovering checkout paths not linked from homepage) |
| Priority | Medium |
| Notes | Many sites don't have sitemaps, so impact is variable. |

#### Opportunity 3.3: Robots.txt Processing

| Field | Value |
|-------|-------|
| What else it could collect | Parse robots.txt for disallow rules, crawl-delay, sitemap references. Currently fetched but not parsed. |
| Difficulty | Low |
| Why feasible | Already fetched. Text parsing is trivial. |
| New evidence/signal families | `checkout_blocked_by_robots`, `analytics_blocked_by_robots` |
| Finding impact | scale_readiness (SEO/crawlability), revenue_integrity (if checkout paths are blocked) |
| Priority | Low |

---

### 4. Indicator Extraction

**Currently collects:** Checkout, provider, platform, policy indicators

#### Opportunity 4.1: Expanded Provider Detection

| Field | Value |
|-------|-------|
| What else it could collect | Additional providers: Razorpay, Klarna, Afterpay, Apple Pay, Google Pay, Mollie, iugu, Pagar.me (Brazilian market). Also consent/privacy tools: OneTrust, CookieBot, Quantcast Choice |
| Difficulty | Low |
| Why feasible | Pattern matching infrastructure already exists. Just need to add regex patterns. |
| New evidence/signal families | `bnpl_provider_detected`, `consent_management_detected`, `regional_payment_detected` |
| Finding impact | scale_readiness (payment readiness), chargeback_resilience (BNPL has different dispute profiles) |
| Priority | Medium |

#### Opportunity 4.2: Analytics Provider Detection

| Field | Value |
|-------|-------|
| What else it could collect | Specific analytics tools beyond the current 4: Mixpanel, Amplitude, Heap, PostHog, Plausible, Matomo, Adobe Analytics. Also tag managers: GTM, Tealium, Segment |
| Difficulty | Low |
| Why feasible | Same script URL pattern matching. |
| New evidence/signal families | `analytics_tool_${name}`, `tag_manager_detected`, `analytics_depth` (basic vs advanced) |
| Finding impact | scale_readiness (measurement readiness) |
| Priority | Medium |

#### ~~Opportunity 4.3: Chat/Support Widget Detection~~ — IMPLEMENTED

| Field | Value |
|-------|-------|
| What else it could collect | Intercom, Drift, Zendesk, Freshdesk, Tidio, Crisp, LiveChat, Olark, tawk.to widget scripts |
| Difficulty | Low |
| Status | **DONE** — `TechnologyDetectedPayload` with `category === 'support_widget'` implemented. `support_widget_detected` signal fires. Technology registry handles support widget detection via script URL patterns. Feeds `support_unreachable` inference accuracy. |

---

### 5. Browser Verification (Playwright)

**Currently collects:** Navigation trace, checkout confirmation, failure events

#### Opportunity 5.1: Visual Regression / Screenshot Analysis

| Field | Value |
|-------|-------|
| What else it could collect | Screenshots are captured but never analyzed. Could detect: broken layouts, missing images, error messages, loading spinners, empty states |
| Difficulty | High |
| Why feasible | Screenshots are already captured. Would need image analysis (external service or ML model). |
| New evidence/signal families | `visual_breakage_detected`, `checkout_layout_broken`, `error_state_visible` |
| Finding impact | scale_readiness (visual trust), revenue_integrity (checkout UX) |
| Priority | Low (high difficulty) |

#### ~~Opportunity 5.2: JavaScript Error Analysis~~ — IMPLEMENTED

| Field | Value |
|-------|-------|
| What else it could collect | Console error classification by business impact |
| Difficulty | Medium |
| Status | **DONE** — `ClassifiedRuntimeErrorsPayload` implemented. 6 classification buckets: `purchase_interruption`, `payment_provider_error`, `tracking_failure`, `widget_failure`, `navigation_failure`, `general_runtime`. Each scored with confidence and `is_commercial_impact` flag. Runs for both desktop and mobile viewports. |

#### ~~Opportunity 5.3: Network Request Analysis~~ — IMPLEMENTED

| Field | Value |
|-------|-------|
| What else it could collect | Full network request capture with commercial role classification |
| Difficulty | Medium |
| Status | **DONE** — `NetworkAnalysisPayload` implemented. Every request captured via `page.on('request')` and `page.on('response')`. Requests classified by commercial role: `payment_critical`, `measurement_critical`, `trust_reassurance`, `commerce_content`, `third_party_dependency`, `first_party`, `non_essential`. Per-role health metrics (count, failures, avg duration, slowest). Classified problems: payment_failures, payment_slow, measurement_failures, trust_late_loads, third_party_failures. Runs for both desktop and mobile viewports. |

#### Opportunity 5.4: Form Interaction Testing

| Field | Value |
|-------|-------|
| What else it could collect | Currently browser verification doesn't interact with checkout forms. Could: test form submission flows, detect inline validation, measure form completion time, detect multi-step forms |
| Difficulty | High |
| Why feasible | Playwright supports form filling and submission. Step types `click` and `type` already exist. |
| New evidence/signal families | `form_validation_present`, `multi_step_checkout`, `form_completion_friction` |
| Finding impact | revenue_integrity (checkout UX), chargeback_resilience (information capture quality) |
| Priority | Medium |
| Notes | Risk of accidentally completing real transactions. Needs careful guardrails. |

#### ~~Opportunity 5.5: Mobile Viewport Testing~~ — IMPLEMENTED

| Field | Value |
|-------|-------|
| What else it could collect | Run verification at mobile viewport (375x812) to detect mobile-specific issues |
| Difficulty | Low |
| Status | **DONE** — `EvidenceType.MobileVerificationResult` with `MobileVerificationResultPayload` implemented. Browser verification runs mobile verification in parallel. `mobile_commercial_path_blocked` and `mobile_trust_weaker_than_desktop` signals fire for mobile-specific degradation. |

---

### 6. Authenticated Browser Journey

**Currently collects:** Auth session attempt, SaaS page views, activation steps, empty states, upgrade surfaces, navigation structure

#### Opportunity 6.1: Multi-Page Post-Login Exploration

| Field | Value |
|-------|-------|
| What else it could collect | Currently observes single page after login. Could follow navigation links, visit settings, billing, help sections, core feature pages |
| Difficulty | Medium |
| Why feasible | Playwright is already authenticated. Navigation is the same as pre-login. Would need a page discovery strategy for authenticated context. |
| New evidence/signal families | `settings_page_structure`, `billing_page_accessible`, `help_center_integrated`, `feature_page_depth` |
| Finding impact | saas_growth_readiness (feature discovery, upgrade path, support) |
| Priority | **High** |
| Notes | This is the single highest-leverage SaaS collection expansion. Currently a one-page snapshot limits SaaS findings. |

#### Opportunity 6.2: Activation Flow Walkthrough

| Field | Value |
|-------|-------|
| What else it could collect | Currently observes activation steps passively. Could actively walk through onboarding steps, clicking CTAs, measuring time-to-complete |
| Difficulty | High |
| Why feasible | Playwright has click/type/wait capabilities. Activation steps are already identified. |
| New evidence/signal families | `activation_step_completion_time`, `activation_step_failure`, `onboarding_abandonment_point` |
| Finding impact | saas_growth_readiness (activation friction quantification) |
| Priority | Medium |
| Notes | High variability across products. Risk of creating test data in customer apps. |

#### Opportunity 6.3: Trial Limitation Detection

| Field | Value |
|-------|-------|
| What else it could collect | Detect trial-specific limitations: feature locks, usage caps, countdown timers, upgrade prompts triggered by hitting limits |
| Difficulty | Medium |
| Why feasible | Already in authenticated context. Pattern matching on "upgrade", "trial ends", "limit reached" text patterns. |
| New evidence/signal families | `trial_limitation_visible`, `feature_lock_detected`, `trial_countdown_present` |
| Finding impact | saas_growth_readiness (upgrade urgency, trial-to-paid conversion) |
| Priority | Medium |

---

### 7. Light Probe Executor

**Currently collects:** HTTP response for a single URL

#### Opportunity 7.1: Multi-URL Batch Probe

| Field | Value |
|-------|-------|
| What else it could collect | Could probe multiple URLs in a single verification request (e.g. all checkout paths, all policy pages) for efficient freshness validation |
| Difficulty | Low |
| Why feasible | Same HTTP fetch client, loop over URLs. |
| New evidence/signal families | No new families, but batch freshness validation |
| Finding impact | All packs (faster confidence restoration) |
| Priority | Low |

---

## C. Opportunity Summary Tables

---

### NEW: LLM Content Enrichment Step

This is not a single opportunity but a new collection capability category. The pipeline currently collects structural data about pages but does not evaluate **content meaning, quality, or persuasiveness**. A cheap LLM like Haiku could be inserted after Phase 2B Content Enrichment to analyze already-collected text data.

#### Insertion point

After all pages are fetched, parsed, and enriched (post-Phase 2B, pre-Signal Engine). At this point, the following text data is available per page:

| Data Available | Source | Example |
|---------------|--------|---------|
| `title` | PageContentPayload | "Buy Premium Plan - Acme" |
| `meta_description` | PageContentPayload | "Start your free trial today..." |
| `h1` | PageContentPayload | "Pricing" |
| `body_text_snippet` (500 chars) | PageContentPayload | First 500 chars of visible text |
| Link texts (CTA labels) | LinkPayload.text | "Buy Now", "Start Free Trial", "Learn More" |
| Form field names | FormPayload.field_names | ["email", "card_number", "cvv"] |
| Policy page full text | Raw HTML (fetched, parseable) | Full refund policy content |
| Structured data claims | StructuredDataItemPayload | `{"@type": "Product", "name": "...", "offers": {"price": "29.99"}}` |
| Detected technology context | TechnologyDetectedPayload | Stripe detected, Intercom detected |

#### What LLM analysis could produce

| Analysis | Input | Output | Downstream Value |
|----------|-------|--------|-----------------|
| **CTA clarity scoring** | Link texts on commercial pages | clarity_score (0-100), is_ambiguous, suggested_improvement | Strengthens `unclear_conversion_intent` and `strong_cta_clarity` signals |
| **Trust language detection** | body_text_snippet on checkout pages | has_security_assurance, has_guarantee, has_urgency_tactics, trust_language_score | Strengthens `trust_break_in_checkout` — currently structural only |
| **Policy quality grading** | Policy page full text | clarity_score, ambiguity_flags[], missing_sections[], readability_grade | Strengthens `refund_policy_gap` beyond word count |
| **Pricing clarity assessment** | body_text_snippet on pricing pages | has_hidden_fees, plan_comparison_clear, currency_consistent, trial_terms_clear | Strengthens `expectation_misalignment` |
| **Page purpose validation** | title + h1 + body_text_snippet vs URL classification | classification_confidence_boost, misclassification_detected | Improves classification accuracy — currently URL-token only |
| **Structured data cross-validation** | StructuredDataItem vs body_text_snippet | schema_matches_content, mismatches[] | New signal for discoverability pack |
| **Form friction assessment** | field_names + form context | unnecessary_fields_detected, confusing_labels[], excessive_field_count | Strengthens `friction_on_critical_path` |

#### Cost model

| Approach | Pages Analyzed | Cost per Audit (est.) | Latency Added |
|----------|---------------|----------------------|---------------|
| Haiku on commercial pages only (checkout, pricing, policy, cart) | 3-8 pages | ~$0.003-0.008 | +2-4s |
| Haiku on all crawled pages | 10-30 pages | ~$0.01-0.03 | +5-15s |
| Haiku on policy pages only (highest ROI) | 1-3 pages | ~$0.001-0.003 | +1-2s |

#### Recommended approach

**Start with policy pages only.** Highest ROI because:
1. Policy text is already fully fetched (no body_text_snippet truncation issue)
2. Policy quality directly drives chargeback resilience decisions
3. Bounded, deterministic input (one policy page = one LLM call)
4. Output is structured and verifiable (missing sections, ambiguity flags)
5. Cost is negligible (~$0.002 per audit)

**Then expand to CTA + checkout trust language.** Second highest ROI because:
1. CTA labels are already extracted as link text
2. "Buy Now" vs "Submit" vs "Click Here" is a clear quality signal
3. Trust language on checkout pages is currently invisible to structural analysis

#### Limitation: body_text_snippet truncation

The parser currently stores only the first 500 characters of body text. For LLM analysis of checkout pages and pricing pages, this may be insufficient. Options:
1. **Expand body_text_snippet to 2000 chars** on commercial-classified pages (low effort)
2. **Store full body text for commercial pages only** (medium effort, storage cost)
3. **Re-fetch and parse at LLM analysis time** (wasteful but zero storage)

Recommended: Option 1 (expand snippet on commercial pages).

#### Evidence type proposed

```
ContentEnrichmentPayload {
  page_url: string;
  page_type: string; // checkout, pricing, policy, etc.
  enrichment_type: 'cta_clarity' | 'trust_language' | 'policy_quality' | 'pricing_clarity' | 'classification_validation' | 'form_friction';
  scores: Record<string, number>;
  flags: string[];
  missing_elements: string[];
  confidence: number;
  model_used: string; // 'haiku-4.5'
  cached: boolean;
}
```

---

### Highest Leverage Collection Expansions (Remaining)

9 of the original top-10 opportunities have been implemented. Remaining highest-leverage expansions:

| Rank | Opportunity | Method | Difficulty | Impact | Priority |
|------|------------|--------|------------|--------|----------|
| 1 | **LLM content enrichment (policy pages first)** | **New: LLM step** | **Low** | **Chargeback, Revenue, Scale** | **High** |
| 2 | Multi-page post-login exploration | Authenticated Journey | Medium | SaaS growth | **High** |
| 3 | Security header analysis | HTTP Fetch | Low | Scale, Chargeback, Cybersecurity | **High** (elevated for cybersecurity pack) |
| 4 | Cookie analysis | HTTP Fetch | Low | Privacy, Trust, Cybersecurity | **High** (elevated for cybersecurity pack) |
| 5 | body_text_snippet expansion (500→2000 chars on commercial) | Parser | Low | All content-based analysis | **High** (prerequisite for LLM) |
| 6 | Expanded provider detection (BNPL, regional) | Indicator Extraction | Low | Scale, Chargeback | Medium |
| 7 | TLS/Certificate details | HTTP Fetch | Medium | Trust, Cybersecurity | Medium |
| 8 | Pricing page analysis | HTML Parser | Medium | Revenue, Chargeback, SaaS | Medium |

### Completed Expansions

| Opportunity | Method | Phase |
|-------------|--------|-------|
| ~~Inline script content analysis~~ | HTML Parser | Technology registry + inline script extraction |
| ~~Policy page word count / content depth~~ | HTML Parser | Policy depth analysis (8 fields) |
| ~~Chat/support widget detection~~ | Technology Registry | 8+ support widgets detected |
| ~~Structured data extraction (JSON-LD)~~ | HTML Parser | StructuredDataItem evidence type |
| ~~Mobile viewport testing~~ | Browser Verification | MobileVerificationResult evidence type |
| ~~Recursive crawl from discovered pages~~ | Crawl Discovery | Phase 2B basic pipeline (max 10 pages) |
| ~~Open Graph & social meta tags~~ | HTML Parser | MetaPayload.og_tags + social preview signals |
| ~~JS console error classification~~ | Browser Verification | ClassifiedRuntimeErrors (6 business-impact categories) |
| ~~Network request analysis~~ | Browser Verification | NetworkAnalysis (commercial role classification) |

### Easiest Remaining Wins (Low Difficulty, Meaningful Impact)

| Opportunity | Method | Lines of Code (est.) | New Findings Enabled |
|-------------|--------|---------------------|---------------------|
| **LLM enrichment on policy pages** | New LLM step | ~100 | policy_quality_score, ambiguity_flags, missing_sections |
| **body_text_snippet expansion** | Parser | ~5 | Prerequisite for broader LLM analysis |
| Security headers | HTTP Fetch | ~20 | security_header_analysis (cybersecurity pack CS-1) |
| Cookie analysis | HTTP Fetch | ~15 | tracking_cookies, session_security (cybersecurity pack CS-2) |
| Sitemap.xml processing | Crawl Discovery | ~30 | sitemap_page_inventory, page_freshness |
| Robots.txt processing | Crawl Discovery | ~15 | checkout_blocked_by_robots |

### Opportunities That Unlock Multiple Packs (Remaining)

| Opportunity | Packs Benefited | Why |
|-------------|----------------|-----|
| **LLM content enrichment** | **Chargeback + Revenue + Scale + Discoverability** | Policy quality (Chargeback), CTA/pricing clarity (Revenue), trust language (Scale), structured data accuracy (Discoverability) |
| Security header analysis | Scale + Chargeback + Cybersecurity | Trust surface (Scale), compliance (Chargeback), security posture (Cybersecurity) |
| Cookie analysis | Scale + Cybersecurity + Privacy | Session security (Cybersecurity), consent compliance (Scale), tracking audit (Privacy) |
| Multi-page auth exploration | SaaS + Revenue | Feature discovery (SaaS), billing page analysis (Revenue) |
| TLS/Certificate details | Scale + Cybersecurity | Trust indicators (Scale), certificate health (Cybersecurity) |

### Opportunities That Improve Confidence Rather Than Breadth (Remaining)

| Opportunity | Confidence Improvement | Mechanism |
|-------------|----------------------|-----------|
| **LLM page purpose validation** | Improves page classification accuracy | Content-based classification > URL-token heuristic |
| **LLM structured data cross-validation** | Validates schema claims against page content | Detects schema/content mismatches that fool search engines |
| Multi-URL batch probe | Refreshes stale evidence faster | Bulk freshness restoration |
