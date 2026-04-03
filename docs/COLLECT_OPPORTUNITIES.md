# COLLECT_OPPORTUNITIES.md — Collection Expansion Opportunities

> Last updated: 2026-04-02 (Documentation refresh — verified accuracy)
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

#### Opportunity 2.1: Structured Data Extraction (JSON-LD, Schema.org)

| Field | Value |
|-------|-------|
| What else it could collect | `<script type="application/ld+json">` blocks: Product, Organization, BreadcrumbList, FAQ, Review, Offer schemas |
| Difficulty | Low |
| Why feasible | Regex already extracts `<script>` tags. Filtering by `type="application/ld+json"` and JSON.parse is trivial. |
| New evidence/signal families | `structured_data_present`, `product_schema_quality`, `organization_verified`, `review_schema_present` |
| Finding impact | scale_readiness (SEO/trust surface), revenue_integrity (product clarity), chargeback_resilience (review/trust signals) |
| Priority | **High** |
| Notes | Rich source of trust and commerce signals with very low extraction cost. |

#### Opportunity 2.2: Open Graph & Social Meta Tags

| Field | Value |
|-------|-------|
| What else it could collect | `og:type`, `og:image`, `og:title`, `og:description`, `twitter:card`, `twitter:site`. Currently meta_tags captures name-based meta but not property-based OG tags. |
| Difficulty | Low |
| Why feasible | Similar regex to existing meta extraction. Just need `property` attribute in addition to `name`. |
| New evidence/signal families | `social_meta_complete`, `og_type_mismatch` (e.g. og:type=article on a product page) |
| Finding impact | scale_readiness (traffic quality when sharing), revenue_integrity (conversion from social) |
| Priority | Low |

#### Opportunity 2.3: Inline Script Content Analysis

| Field | Value |
|-------|-------|
| What else it could collect | Inline `<script>` content for: analytics initialization (gtag, fbq, analytics.js), error tracking (Sentry, Bugsnag), A/B testing (Optimizely, VWO), chat widgets (Intercom, Drift, Zendesk) |
| Difficulty | Medium |
| Why feasible | HTML body is already available. Regex patterns for common analytics/chat/error-tracking initialization patterns are well-known. Currently only external scripts are extracted. |
| New evidence/signal families | `analytics_initialized`, `error_tracking_present`, `ab_testing_active`, `chat_widget_present`, `consent_management_detected` |
| Finding impact | scale_readiness (measurement depth), chargeback_resilience (support channel via chat widget), revenue_integrity (optimization capability) |
| Priority | **High** |
| Notes | This is the single highest-leverage parser expansion. Many critical signals (analytics, chat, consent) live in inline scripts. |

#### Opportunity 2.4: Accessibility Signals

| Field | Value |
|-------|-------|
| What else it could collect | `lang` attribute presence, `alt` on images, `aria-label` on interactive elements, form `<label>` presence, viewport meta tag |
| Difficulty | Medium |
| Why feasible | Regex extraction from existing HTML body. |
| New evidence/signal families | `form_accessibility_weak`, `missing_viewport_meta` |
| Finding impact | scale_readiness (readiness for diverse traffic), revenue_integrity (form completion friction) |
| Priority | Low |

#### Opportunity 2.5: Policy Page Content Depth

| Field | Value |
|-------|-------|
| What else it could collect | Word count of policy pages (currently `word_count` is always null), heading structure, last-updated date extraction, section detection (returns, refunds, exchanges, cancellation, contact) |
| Difficulty | Low |
| Why feasible | Body text already available. Word count is `body.split(/\s+/).length`. Heading regex already exists for h1. |
| New evidence/signal families | `thin_policy_page` (< 200 words), `policy_missing_contact_info`, `policy_missing_return_window` |
| Finding impact | chargeback_resilience (refund policy quality), scale_readiness (compliance) |
| Priority | **High** |
| Notes | `PolicyPagePayload.word_count` field exists but is never populated. Trivial fix. |

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

#### Opportunity 3.1: Recursive Crawl from Discovered Pages

| Field | Value |
|-------|-------|
| What else it could collect | Links from ALL fetched pages, not just homepage. Would discover deeper pages (product pages, category pages, secondary checkout flows). |
| Difficulty | Medium |
| Why feasible | Parser already extracts links from every page. Currently only homepage links feed discovery. Adding discovered-page links to the candidate queue is a small change. |
| New evidence/signal families | Broader page inventory, deeper commerce path mapping, secondary conversion flow detection |
| Finding impact | All packs benefit from broader evidence base |
| Priority | **High** |
| Notes | Must respect crawl constraints (max 30 pages). Risk of crawling non-commercial pages. Need prioritization heuristic. |

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

#### Opportunity 4.3: Chat/Support Widget Detection

| Field | Value |
|-------|-------|
| What else it could collect | Intercom, Drift, Zendesk, Freshdesk, Tidio, Crisp, LiveChat, Olark, tawk.to widget scripts |
| Difficulty | Low |
| Why feasible | Same script URL pattern matching already used for providers. |
| New evidence/signal families | `live_chat_present`, `support_widget_type` |
| Finding impact | chargeback_resilience (support accessibility — currently only detects contact pages, not chat widgets) |
| Priority | **High** |
| Notes | Chat widgets are the most common modern support channel. Currently invisible to Vestigio. |

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

#### Opportunity 5.2: JavaScript Error Analysis

| Field | Value |
|-------|-------|
| What else it could collect | Console errors are captured but not semantically analyzed. Could classify: payment SDK errors, tracking failures, unhandled promise rejections, CORS issues |
| Difficulty | Medium |
| Why feasible | Console errors already in `BrowserFailureEventPayload.console_errors`. Pattern matching on common error messages. |
| New evidence/signal families | `payment_sdk_error`, `tracking_script_failure`, `cors_block_detected` |
| Finding impact | revenue_integrity (broken checkout), scale_readiness (JS stability) |
| Priority | Medium |

#### Opportunity 5.3: Network Request Analysis

| Field | Value |
|-------|-------|
| What else it could collect | Playwright can intercept all network requests. Currently only captures errors. Could capture: third-party request inventory, API call patterns, resource sizes, failed requests, slow requests |
| Difficulty | Medium |
| Why feasible | Playwright's `page.route()` or `page.on('request')` API. Already in runtime environment. |
| New evidence/signal families | `third_party_request_count`, `slow_api_calls`, `blocked_resources`, `payment_api_health` |
| Finding impact | scale_readiness (performance), revenue_integrity (checkout reliability) |
| Priority | Medium |

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

#### Opportunity 5.5: Mobile Viewport Testing

| Field | Value |
|-------|-------|
| What else it could collect | Current viewport is fixed at 1280x720 (desktop). Could run same verification at 375x812 (mobile) to detect mobile-specific issues |
| Difficulty | Low |
| Why feasible | Playwright supports viewport configuration. Same steps, different viewport. |
| New evidence/signal families | `mobile_layout_broken`, `mobile_checkout_unreachable`, `mobile_nav_missing` |
| Finding impact | scale_readiness (mobile traffic readiness), revenue_integrity (mobile conversion) |
| Priority | **High** |
| Notes | Most traffic is mobile. Desktop-only verification misses mobile-specific issues. |

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

### Highest Leverage Collection Expansions

| Rank | Opportunity | Method | Difficulty | Impact | Priority |
|------|------------|--------|------------|--------|----------|
| 1 | Inline script content analysis (analytics, chat, consent) | HTML Parser | Medium | All packs | **High** |
| 2 | Multi-page post-login exploration | Authenticated Journey | Medium | SaaS growth | **High** |
| 3 | Policy page word count / content depth | HTML Parser | Low | Chargeback | **High** |
| 4 | Chat/support widget detection | Indicator Extraction | Low | Chargeback | **High** |
| 5 | Structured data extraction (JSON-LD) | HTML Parser | Low | Scale, Revenue, Chargeback | **High** |
| 6 | Mobile viewport testing | Browser Verification | Low | Scale, Revenue | **High** |
| 7 | Recursive crawl from discovered pages | Crawl Discovery | Medium | All packs | **High** |
| 8 | Security header analysis | HTTP Fetch | Low | Scale, Chargeback | Medium |
| 9 | Expanded provider detection (BNPL, regional) | Indicator Extraction | Low | Scale, Chargeback | Medium |
| 10 | JS console error classification | Browser Verification | Medium | Revenue, Scale | Medium |

### Easiest Wins (Low Difficulty, Meaningful Impact)

| Opportunity | Method | Lines of Code (est.) | New Findings Enabled |
|-------------|--------|---------------------|---------------------|
| Policy page word count | HTML Parser | ~10 | thin_policy_page, policy_quality_score |
| Chat widget detection | Indicators | ~20 | live_chat_present (improves support_unreachable accuracy) |
| Structured data extraction | HTML Parser | ~30 | structured_data_present, product_schema |
| Security headers | HTTP Fetch | ~20 | security_header_analysis |
| Mobile viewport test | Browser | ~10 (config change) | mobile_specific_issues |
| Cookie analysis | HTTP Fetch | ~15 | tracking_cookies, session_security |

### Opportunities That Unlock Multiple Packs

| Opportunity | Packs Benefited | Why |
|-------------|----------------|-----|
| Inline script analysis | Scale + Revenue + Chargeback | Detects analytics (Scale), error tracking (Revenue), chat widgets (Chargeback) |
| Structured data (JSON-LD) | Scale + Revenue + Chargeback | Product schema (Revenue), Organization trust (Scale), Review signals (Chargeback) |
| Recursive crawl | All 4 | Broader evidence base for every pack |
| Multi-page auth exploration | SaaS + Revenue | Feature discovery (SaaS), billing page analysis (Revenue) |

### Opportunities That Improve Confidence Rather Than Breadth

| Opportunity | Confidence Improvement | Mechanism |
|-------------|----------------------|-----------|
| Mobile viewport testing | Validates desktop findings on mobile | Same checks, different viewport = corroboration |
| JS error classification | Confirms/denies runtime issues | Runtime evidence > static inference |
| Network request analysis | Validates provider detection | Confirms script presence translates to actual API calls |
| Multi-URL batch probe | Refreshes stale evidence faster | Bulk freshness restoration |
| Policy word count | Distinguishes stub policies from real ones | Content depth > mere presence detection |
