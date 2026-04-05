# COLLECT.md — Vestigio Collection Method Inventory

> Last updated: 2026-04-05
> Grounded in: current codebase inspection (workers/, packages/, apps/)

---

## A. Overview

Vestigio collects evidence about websites and SaaS applications through multiple collection methods organized in two main worker pipelines:

1. **Ingestion Pipeline** (`workers/ingestion/`) — Static HTTP fetching, HTML parsing, indicator extraction, technology detection, crawl discovery
2. **Verification Pipeline** (`workers/verification/`) — Browser automation (desktop + mobile), authenticated journeys, network analysis, light probes, evidence reuse

Collection methods produce **Evidence** objects (`packages/domain/evidence.ts`) with strongly-typed payloads. Each evidence item records its `source_kind` (crawl, http_fetch, browser_verification, etc.) and `collection_method` (static_fetch, dynamic_render, api_call, etc.).

### Collection families in the current system

| Family | Status | Worker |
|--------|--------|--------|
| Static HTTP fetch | Implemented | Ingestion |
| HTML/DOM parsing (regex-based) | Implemented | Ingestion |
| Crawl/discovery (URL probing + link following + recursive) | Implemented | Ingestion |
| Indicator extraction (checkout, provider, platform, policy) | Implemented | Ingestion |
| Technology detection (analytics, chat, consent, A/B, CDN, etc.) | Implemented | Ingestion |
| Inline script extraction | Implemented | Ingestion |
| Structured data extraction (JSON-LD) | Implemented | Ingestion |
| Policy content analysis (word count, section detection, depth) | Implemented | Ingestion |
| Browser verification — desktop (Playwright) | Implemented | Verification |
| Browser verification — mobile viewport | Implemented | Verification |
| Network request capture & commercial classification | Implemented | Verification |
| Console error classification (by business impact) | Implemented | Verification |
| Authenticated browser journey (SaaS login + exploration) | Implemented | Verification |
| Light HTTP probe | Implemented | Verification |
| Evidence reuse (re-evaluation) | Implemented | Verification |
| Integration pull (external API) | Scaffolded only | Verification |
| Pixel/behavioral event ingestion | Scaffolded (pixel management exists, no ingestion) | Platform |

---

## B. Pipeline Execution Order

This section documents the exact order in which collection runs, from trigger to evidence completion. Understanding this order is critical for evaluating where enrichment steps (e.g., LLM analysis) could be inserted.

### Ingestion Pipeline — Staged

```
Trigger (new audit or re-audit)
│
├─ Stage A: Bootstrap (0-3s)
│  ├─ Fetch homepage (HTTP client)
│  ├─ Parse HTML (parser → title, meta, h1, canonical, lang, links, forms, scripts, iframes)
│  ├─ Detect challenges (Cloudflare, reCAPTCHA, hCaptcha, DataDome, Akamai, rate limits)
│  └─ Emit: HttpResponsePayload, PageContentPayload, RedirectPayload
│
���─ Stage B: First Value (<10s)
│  ├─ Extract indicators from homepage (checkout, provider, platform, policy)
│  ├─ Try fetch /robots.txt and /sitemap.xml (HTTP only, not parsed)
│  ├─ Compute initial classification (commerce confidence, SaaS confidence)
│  └─ Emit: CheckoutIndicatorPayload, ProviderIndicatorPayload, PlatformIndicatorPayload, PolicyPagePayload
│
├─ Stage C: Prioritized Crawl (variable)
│  ├─ Discover candidate URLs (path probing + homepage link scanning)
│  ├─ For each candidate:
│  │   ├─ Fetch (HTTP client)
│  │   ├─ Parse HTML (same parser as Stage A)
│  │   ├─ Extract indicators
│  │   └─ Emit evidence per page
│  ├─ SPA detection (framework patterns, script/body ratio)
│  ├─ Progressive evidence emission (every 4 fetches)
│  └─ Coverage tracking (score, total routes, critical routes, gaps)
│
├─ Phase 2B: Recursive Crawl (basic pipeline only)
│  ├─ Discover links from ALL fetched pages (not just homepage)
│  ├─ Filter to commercially relevant URLs (checkout, pricing, contact, policy, help, FAQ, confirm, success)
│  ├─ Fetch up to 10 additional pages
│  └─ Parse and extract indicators for each
│
├─ Phase 2B: Technology Detection (basic pipeline only)
│  ├─ Collect all script URLs, iframe URLs, inline scripts, HTML body from ALL parsed pages
│  ├─ Run Technology Registry detection (packages/technology-registry/)
│  └─ Emit: TechnologyDetectedPayload for each detected technology
│
├─ Phase 2B: Content Enrichment (basic pipeline only)
│  ├─ Analyze policy pages (word count, sections, contact info, return window, refund process, etc.)
│  ├─ Extract structured data (JSON-LD) from all pages
│  ├─ Extract inline scripts from all pages
│  └─ Emit: StructuredDataItemPayload, InlineScriptContentPayload, enriched PolicyPagePayload
│                                                     
│  ══════════════════════════════════════════════════
│  ║  POTENTIAL LLM ENRICHMENT INSERTION POINT      ║
│  ║  (see COLLECT_OPPORTUNITIES.md § LLM Analysis) ��
│  ═════════════���════════════════════════════════════
│
└─ Evidence complete → Signal Engine → Inference Engine → Decision Engine → Projections
```

### Verification Pipeline — On Trigger

```
Verification request (manual, preflight, or freshness-driven)
│
├─ Light Probe
│  ├─ Single-URL HTTP fetch
│  └─ Emit: HttpResponsePayload, RedirectPayload, PageContentPayload
│
├─ Browser Verification
│  ├─ Launch headless Chromium
│  ├─ Desktop viewport (1280×720)
│  │   ├─ Execute step sequence (navigate, click, type, wait, assert, screenshot)
│  │   ├─ Capture network requests (classified by commercial role)
│  │   ├─ Capture console errors (classified by business impact)
│  │   ├─ Capture redirect chain
│  │   └─ Emit: BrowserNavigationTracePayload, BrowserCheckoutConfirmationPayload,
│  │           BrowserFailureEventPayload, NetworkAnalysisPayload, ClassifiedRuntimeErrorsPayload
│  │
│  ├─ Mobile viewport (375×812, iPhone UA, touch support) — in parallel
│  │   ├─ Same step sequence as desktop
│  │   ├─ Same network/error capture
│  │   └─ Emit: MobileVerificationResultPayload
│  │
│  └─ Screenshots stored (not analyzed)
│
├─ Authenticated Journey (SaaS only)
│  ├─ Load encrypted credentials
��  ├─ Navigate to login URL
│  ├��� Detect and fill login form (email + password)
│  ├─ Submit and wait for post-login navigation
│  ├─ Detect MFA challenges
│  ├─ On success: observe authenticated pages
│  └─ Emit: AuthenticatedSessionAttemptPayload, SaaS evidence types
│
├─ Reuse-Only
│  ├─ Filter existing evidence by subject
│  └─ Refresh freshness timestamps (zero network)
│
└─ Evidence update → Re-compute signals → Re-compute decisions → Updated projections
```

### Data available at each stage (for LLM analysis evaluation)

| After Stage | Available for analysis |
|-------------|----------------------|
| Stage A (Bootstrap) | Homepage: title, meta_description, h1, canonical, lang, body_text_snippet (500 chars), link texts, form labels, script URLs, meta_tags (including OG) |
| Stage B (First Value) | + Checkout/provider/platform/policy indicators with confidence scores |
| Stage C (Crawl) | + All candidate pages with same content as Stage A, page classification by URL type |
| Phase 2B (Recursive) | + Additional pages discovered from internal links |
| Phase 2B (Tech Detection) | + Technology stack: analytics, chat, consent, A/B, CDN, error tracking, email marketing |
| Phase 2B (Content Enrichment) | + Structured data (JSON-LD), inline script patterns, policy depth analysis (word count, sections, terms) |
| Browser Verification | + Navigation traces, network request health (payment/measurement/trust latency & failures), console error classification, mobile-specific results |

---

## C. Collection Methods Inventory

---

### 1. HTTP Fetch Client

**Status:** Implemented
**Where in code:** `workers/ingestion/http-client.ts`

**How it works:**
Uses Node.js built-in `https`/`http` modules (zero external HTTP dependencies). Sends GET requests with a custom User-Agent (`VestigioBot/1.0`). Follows redirects automatically (up to 10 hops), recording the full redirect chain with status codes and host information.

**What it collects:**
- HTTP response: URL, final URL, status code, headers, response body, response time (ms), content-type, content-length
- Redirect chain: each hop with URL, status code, host
- Cross-domain detection during redirects

**Evidence produced:**
- `HttpResponsePayload`: url, status_code, headers, response_time_ms, content_type, content_length
- `RedirectPayload`: source_url, target_url, status_code, hop_count, redirect_chain

**Scope / limitations:**
- Timeout: 15 seconds per request
- Max redirects: 10
- No cookie persistence across requests
- No JavaScript execution
- No POST/form submission
- Body not consumed during redirect chains (bandwidth optimization)
- User-Agent may trigger bot detection on some sites

**Dependencies:** Node.js `https`, `http`, `url` modules only

**Used by:** Ingestion pipeline (all stages), Staged pipeline, Light probe executor

**Confidence / freshness:** Evidence freshness: 24-hour TTL. Quality score: 50-75.

---

### 2. HTML Parser

**Status:** Implemented
**Where in code:** `workers/ingestion/parser.ts`

**How it works:**
Lightweight regex-based HTML parser. Extracts structural elements from raw HTML without building a full DOM tree. Resolves relative URLs to absolute using root domain.

**What it collects:**

**Core page metadata:**
- `title`, `meta_description`, `h1`, `canonical_url`, `lang`
- `body_word_count`: total word count of extracted body text
- `body_text_snippet`: first 500 characters of visible body text
- `meta_tags`: all meta tags (name + property attributes), including Open Graph (`og:title`, `og:description`, `og:image`, etc.)

**Links:**
- All `<a href>` with text, rel attribute, external/internal classification, target host

**Forms:**
- All `<form>` with action, method, field names, payment field detection, external posting detection
- Payment field patterns: `card`, `cc-`, `credit`, `cvv`, `cvc`, `expir`, `billing`, `payment`, `stripe`, `braintree`

**External scripts:**
- All external `<script src>` with hostname, external classification

**Inline scripts:**
- All `<script>` tags WITHOUT `src` attribute (inline scripts)
- Full script content extracted (capped at 2KB per script to prevent memory issues)
- Used downstream for technology detection (analytics init, chat widget boot, consent management, etc.)

**Iframes:**
- All `<iframe src>` with hostname, external classification

**Structured data (JSON-LD):**
- All `<script type="application/ld+json">` blocks parsed
- Supports: single objects, arrays, `@graph` patterns
- Classified by schema type: trust signals (Organization, LocalBusiness, Store, Brand) vs. commerce signals (Product, Offer)
- Output: `ParsedStructuredData { type, name, data }`

**Policy page content analysis** (via `analyzePolicyContent()`):
- `word_count`: actual word count (NOT null)
- `has_contact_info`: email/phone patterns detected
- `has_return_window`: day/hour/week patterns for return timeframes
- `has_refund_process`: multilingual refund process terms (refund, reembolso, devolucao, return, devolu)
- `has_shipping_info`: shipping terms (shipping, entrega, frete, delivery, envio, prazo)
- `has_cancellation_terms`: cancellation terms (cancel, cancela, rescis, revoga)
- `section_count`: heading count as structure proxy
- `is_thin`: boolean (word_count < 200)

**Domain logic:**
Root domain = last 2 parts of hostname. Same-domain = host matches or is subdomain of root domain.

**Evidence produced:**
- `PageContentPayload`: url, title, meta_description, h1, canonical_url, lang, body_word_count, body_text_snippet, form/script/link counts
- `FormPayload`: page_url, action, method, target_host, is_external, field_names, has_payment_fields
- `ScriptPayload`: page_url, src, host, is_external, known_provider
- `LinkPayload`: page_url, href, text, is_external, target_host, rel
- `IframePayload`: page_url, src, host, is_external, known_provider
- `InlineScriptContentPayload`: page_url, detected_patterns[], total_inline_scripts
- `StructuredDataItemPayload`: page_url, schema_type, name, is_trust_signal, is_commerce_signal, data

**Scope / limitations:**
- Regex-based: may miss malformed HTML, dynamic content, shadow DOM
- No JavaScript execution: SPA content invisible
- Filters out javascript:, mailto:, tel: protocols from links
- Inline scripts capped at 2KB per script
- No CSS parsing
- No semantic content analysis (titles/descriptions are extracted but not evaluated for quality, clarity, or persuasiveness)
- body_text_snippet is first 500 chars only — full body text not stored as evidence

**Dependencies:** None (pure regex)

**Used by:** Ingestion pipeline (all fetched pages), Staged pipeline (all stages)

---

### 3. Crawl Discovery Engine

**Status:** Implemented
**Where in code:** `workers/ingestion/pipeline.ts` (discoverCandidates), `workers/ingestion/crawl-constraints.ts`, `workers/ingestion/staged-pipeline.ts`

**How it works:**
Three-phase discovery:

1. **Path probing:** Directly probes 11 common high-value paths: `/checkout`, `/cart`, `/login`, `/contact`, `/pricing`, `/privacy`, `/terms`, `/refund-policy`, `/return-policy`, `/shipping`, `/about`

2. **Link scanning:** Scans homepage links for pages matching checkout, login, contact, policy, pricing patterns using multilingual token sets

3. **Recursive crawl (Phase 2B, basic pipeline only):** Scans links from ALL fetched pages (not just homepage) for commercially relevant URLs. Fetches up to 10 additional pages. Filters for patterns: checkout, pricing, contact, policy, help, FAQ, confirm, success, thank-you.

**Token sets for URL classification:**
- Checkout: `checkout`, `cart`, `pay`, `payment`, `comprar`, `pedido`, `order`, `billing`, `purchase`, `buy`, `carrinho`
- Login: regex `/login|signin|sign-in|account|register|signup/i`
- Contact: regex `/contact|contato|fale-conosco|support|suporte/i`
- Policy: `privacy`, `privacidade`, `terms`, `termos`, `refund`, `reembolso`, `devolucao`, `return`, `shipping`, `entrega`, `frete`, `cookie`, `security`, `seguranca`
- Pricing: regex `/pricing|preco|planos|plans/i`

**Crawl constraints (defaults):**
- `max_pages_per_domain`: 30
- `max_depth`: 3
- `per_request_timeout_ms`: 10,000
- `global_timeout_ms`: 60,000
- `max_body_size_bytes`: 2,000,000 (2MB)
- `enable_loop_detection`: true (content hash of first 5KB)
- `spa_detection_enabled`: true
- `MAX_RECURSIVE_PAGES`: 10 (Phase 2B recursive only)

**URL normalization:** Lowercase hostname, remove hash, remove tracking params (utm_*, ref, fbclid, gclid)

**SPA detection triggers Playwright flag if:**
- scriptCount > 15, OR
- bodyLength < 2000 AND scriptCount > 5, OR
- textContent < 500 AND scriptCount > 8
- Framework patterns: `__NEXT_DATA__`, `__NUXT__`, `ng-version`, `__gatsby`, `data-v-`, `react-root`, `id="root"`

**Output:** Discovery feeds the HTTP fetch client + parser. Discovery itself doesn't create evidence — it creates the URL list.

**Scope / limitations:**
- Max 20 candidate URLs per staged ingestion + 10 recursive
- Depth limited to 3 hops from homepage
- Recursive crawl only in basic pipeline (staged pipeline does not recurse)
- SPA detection flags but doesn't resolve (Stage D reserved for headless)
- Robots.txt and sitemap.xml fetched but NOT parsed for crawl decisions

---

### 4. Indicator Extraction

**Status:** Implemented
**Where in code:** `workers/ingestion/pipeline.ts` (extractCheckoutIndicators, extractProviderIndicators, extractPlatformIndicators, extractPolicyIndicators)

Scans parsed HTML content, script URLs, and iframe sources against known provider/platform/checkout patterns.

#### 4a. Checkout Indicator Extraction

**Patterns:** Matches links against CHECKOUT_TOKENS, detects payment field patterns in forms
**Confidence:** 40% (internal link match) to 75% (payment fields detected)
**Output:** `CheckoutIndicatorPayload`: page_url, indicator_source, target_url, target_host, is_external, checkout_mode (redirect/embedded), confidence, tokens_matched

#### 4b. Provider Indicator Extraction

| Provider | Script/Iframe Patterns |
|----------|----------------------|
| Stripe | `js.stripe.com`, `stripe.com` |
| PayPal | `paypal.com`, `paypalobjects.com` |
| Shopify | `cdn.shopify.com`, `checkout.shopify.com` |
| Mercado Pago | `mercadopago.com`, `mercadolibre.com` |
| PagSeguro | `pagseguro.uol.com.br` |
| Braintree | `braintreegateway.com`, `braintree-api.com` |
| Square | `squareup.com`, `square.com` |
| Adyen | `adyen.com` |
| WooCommerce | `woocommerce` |

**Confidence:** 70% (script), 75% (iframe)
**Output:** `ProviderIndicatorPayload`: page_url, provider_name, detection_source, confidence, domain_match

#### 4c. Platform Indicator Extraction

| Platform | Detection |
|----------|-----------|
| Shopify | `cdn.shopify.com` (script), `Shopify.theme` (html) |
| WordPress | `wp-content`, `wp-includes` (html) |
| WooCommerce | `woocommerce`, `wc-` (html) |
| Magento | `mage/cookies`, `Magento` (html) |
| Wix | `wix.com` (script), `parastorage.com` (script) |
| Squarespace | `squarespace.com` (script), `sqsp` (html) |

**Confidence:** 60%
**Output:** `PlatformIndicatorPayload`: platform_name, detection_source, confidence, matched_pattern

#### 4d. Policy Page Indicator Extraction

**Multilingual tokens:** English + Portuguese (privacidade, termos, reembolso, devolucao, entrega, frete, seguranca)
**Policy types detected:** privacy, terms, refund, shipping, cookie, security
**Deep content analysis:** When a policy page is detected, `analyzePolicyContent()` runs to produce word_count, section detection, and term detection (see Parser § policy content analysis).
**Output:** `PolicyPagePayload`: url, policy_type, detected (boolean), confidence, word_count, has_contact_info, has_return_window, has_refund_process, has_shipping_info, has_cancellation_terms, section_count, is_thin

---

### 5. Technology Registry

**Status:** Implemented
**Where in code:** `packages/technology-registry/registry.ts`, `packages/technology-registry/detector.ts`, `packages/technology-registry/types.ts`

**How it works:**
Registry of 50+ known technologies across 11 categories. Each technology has detection patterns matched against script URLs, iframe URLs, inline script content, HTML body patterns, meta tags, and HTTP headers. Runs after all pages are fetched and parsed (Phase 2B), collecting evidence from ALL parsed pages into a single detection input.

**Detection pattern types:**
- `script_src`: Match external script URLs
- `iframe_src`: Match iframe URLs
- `html_content`: Match HTML body patterns
- `inline_script`: Match inline script content (Phase 2 addition)
- `meta_tag`: Match meta tag values
- `header`: Match HTTP response headers

**Categories and key technologies detected:**

| Category | Technologies |
|----------|-------------|
| `platform` | Shopify, WordPress, WooCommerce, Magento, Wix, Squarespace, VTEX, Nuvemshop |
| `payment_provider` | Stripe, PayPal, Mercado Pago, Adyen, Square, Braintree, PagSeguro |
| `analytics` | Google Analytics, PostHog, Mixpanel, Amplitude, Heap, Segment |
| `tag_manager` | Google Tag Manager, Tealium, Segment |
| `support_widget` | Intercom, Drift, Zendesk, Crisp, Tidio, LiveChat, Freshdesk, tawk.to |
| `consent_manager` | OneTrust, Cookiebot, Quantcast Choice, Didomi |
| `error_tracking` | Sentry, Bugsnag, Datadog RUM, LogRocket |
| `ab_testing` | Optimizely, VWO, LaunchDarkly, Google Optimize |
| `cdn` | Cloudflare, Fastly, Akamai, CloudFront |
| `email_marketing` | Mailchimp, Klaviyo, HubSpot |
| `other` | Expanding ecosystem |

**Detection logic:**
- Tests all registered patterns against collected evidence
- Highest confidence match wins per technology
- Deduplicates by key; merges `detected_on` pages across multiple detections

**Evidence produced:**
- `TechnologyDetectedPayload`: technology_key, display_name, category, confidence (0-100), detection_source, detected_on (URLs), logo_key

**Used by:** Signal engine (`extractTrackingStackSignals`, `extractSupportWidgetSignals`), classification engine, all packs via technology-aware signals

---

### 6. Staged Pipeline Orchestrator

**Status:** Implemented
**Where in code:** `workers/ingestion/staged-pipeline.ts`

**How it works:**
4-stage progressive analysis with incremental evidence emission:

| Stage | Name | Target Time | What Happens |
|-------|------|-------------|--------------|
| A | Bootstrap | 0-3s | Fetch homepage only, detect challenges (Cloudflare, reCAPTCHA, hCaptcha, DataDome, Akamai, rate limits) |
| B | First Value | <10s | Extract indicators from homepage, try `/robots.txt` + `/sitemap.xml`, compute initial classification |
| C | Prioritized Crawl | Variable | Fetch high-value candidates with crawl constraints, progressive evidence emission every 4 fetches, SPA detection |
| D | Selective Headless | Reserved | **Not yet implemented.** For SPA resolution, CTA ambiguity, thin content |

**Challenge detection patterns:**
`cloudflare|cf-ray|__cf_bm`, `recaptcha|g-recaptcha`, `hcaptcha`, `datadome`, `akamai|_abck`, `429|rate.?limit`

**Coverage tracking:** Per-URL tracking of discovered, validated, critical, confidence. Coverage summary includes score, total routes, critical routes, gaps, challenge flags.

**Pipeline messages:** 44 human-friendly status messages for UI progress indication.

**Note:** The staged pipeline does NOT include Phase 2B enhancements (recursive crawl, technology detection, content enrichment). These run in the basic pipeline (`pipeline.ts`). The staged pipeline is the incremental-progress version for UI-facing execution.

---

### 7. Browser Verification (Playwright)

**Status:** Implemented
**Where in code:** `workers/verification/browser-worker.ts`, `workers/verification/playwright-runtime.ts`, `workers/verification/browser-types.ts`

**How it works:**
Launches headless Chromium via Playwright. Executes verification in two viewports simultaneously:

**Desktop verification (1280×720):**
- Executes a sequence of verification steps (navigate, click, type, wait_for, assert_visible, screenshot, wait_ms)
- Captures network requests with commercial role classification
- Captures console errors with business impact classification
- Captures redirect chains and screenshots

**Mobile verification (375×812, iPhone UA, touch support):**
- Same step sequence as desktop
- iPhone user agent string (iPhone OS 16.0 Apple WebKit)
- Touch support enabled, `isMobile: true`
- Compares results against desktop for trust degradation detection

**Step types:**
- `navigate`: Go to URL
- `click`: Click CSS selector
- `type`: Type text into CSS selector
- `wait_for`: Wait for CSS selector to appear
- `assert_visible`: Assert CSS selector is visible
- `screenshot`: Capture full-page screenshot
- `wait_ms`: Static wait

**Network request capture and classification:**
Every network request during browser execution is captured and classified by commercial role:

| Role | Examples | Significance |
|------|----------|-------------|
| `payment_critical` | Stripe API, PayPal SDK, checkout endpoints | Failure = conversion blocked |
| `measurement_critical` | GA, GTM, pixel endpoints | Failure = measurement blind |
| `trust_reassurance` | Support widgets, review services | Failure = trust signal missing |
| `commerce_content` | Product images, cart API | Failure = UX degradation |
| `third_party_dependency` | CDN, fonts, external CSS | Failure = performance/visual |
| `first_party` | Same-domain requests | Failure = site issue |
| `non_essential` | Everything else | Low impact |

For each request: url, host, resource_type (script/xhr/fetch/document/stylesheet/image/font), method, status, failed, failure_reason, duration_ms, is_first_party, is_commercial_surface.

**Network analysis summary:**
Aggregated per-page: total requests, total_failed, total_third_party. Per-role health: request count, failure count, average duration, slowest request. Classified problems: payment_failures, payment_slow, measurement_failures, trust_late_loads, third_party_failures.

**Console error classification:**
Console errors are classified by business impact:

| Classification | Pattern Examples | Commercial Impact |
|---------------|-----------------|-------------------|
| `purchase_interruption` | Payment SDK, checkout, transaction fails | Yes |
| `payment_provider_error` | Stripe, PayPal, Braintree errors | Yes |
| `tracking_failure` | GA, FB pixel, analytics errors | Yes |
| `widget_failure` | Chat, consent widget errors | No |
| `navigation_failure` | TypeError, failed to fetch, chunk errors | Yes |
| `general_runtime` | Other JS errors | No |

Each error scored with confidence (0-100) and `is_commercial_impact` boolean.

**Safety limits:**
- Max steps per run: 20
- Max duration: 60,000ms (60s)
- Max screenshots: 10
- Max scenarios: 5
- Max retries: 2
- Per-step timeout: 15s

**Evidence produced:**
- `BrowserNavigationTracePayload`: start_url, final_url, redirect_chain, steps_executed, steps_succeeded, duration_ms, title
- `BrowserCheckoutConfirmationPayload`: checkout_url, confirmed, method
- `BrowserFailureEventPayload`: url, failed_steps, console_errors, network_errors
- `NetworkAnalysisPayload`: page_url, viewport, is_commercial_surface, request health by role (payment/measurement/trust/commerce/third_party), classified problems
- `ClassifiedRuntimeErrorsPayload`: errors by bucket, is_commercial_impact per bucket, total_commercial_errors, total_errors, viewport
- `MobileVerificationResultPayload`: commercial_path_reachable, checkout_reachable, steps_succeeded/failed, commercial_errors_count, trust_degraded_vs_desktop, final_url, duration_ms

**Scope / limitations:**
- Requires Playwright installation (dynamic import, graceful fallback to simulated mode)
- No persistent sessions (new context per request)
- No cookie/state carry between verifications
- Screenshot capture but no OCR/visual analysis
- Network requests captured and classified but individual request payloads not stored
- Simulated mode for CI/tests returns deterministic results

**Dependencies:** `playwright` (dynamic import), Chromium browser binary

**Cost:** Gated by plan (vestigio=blocked, pro=5/day, max=20/day). Each run costs credits.

---

### 8. Authenticated Browser Journey

**Status:** Implemented
**Where in code:** `workers/verification/authenticated-runtime.ts`

**How it works:**
Loads SaaS access credentials from encrypted storage. Navigates to login URL. Detects login form fields using multiple selector strategies. Fills email/password. Submits form. Waits for post-login navigation. Detects MFA challenges. On success, captures authenticated page views.

**Login field selectors (tried in order):**
- Email: `input[type="email"]`, `input[name="email"]`, `input[name="username"]`, `input[id="email"]`, `input[id="username"]`, `input[autocomplete="email"]`, `input[autocomplete="username"]`
- Password: `input[type="password"]`, `input[name="password"]`, `input[id="password"]`, `input[autocomplete="current-password"]`
- Submit: `button[type="submit"]`, `input[type="submit"]`, `button:has-text("Log in")`, `button:has-text("Sign in")`, `button:has-text("Login")`, `button:has-text("Continue")`

**MFA detection:**
Input patterns: `otp`, `mfa`, `totp`, `2fa`, `code`, `verification`
Text patterns: "Enter verification code", "Two-factor authentication", etc.

**Outcome states:**
- `authenticated_success`: Login successful, navigated away from login page
- `authentication_failed`: Login form still present after submission
- `awaiting_manual_mfa`: MFA challenge detected
- `blocked_by_prerequisite`: Missing config items
- `blocked_by_seed_data`: Test account needs seed data
- `runtime_error`: Browser/execution error

**Evidence produced:**
- `AuthenticatedSessionAttemptPayload`: login_url, auth_method, success, failure_reason, duration_ms
- `AuthenticationBlockedEventPayload`: login_url, blocked_reason, blocker_type (mfa|captcha|ip_block|rate_limit|unknown)
- `PrerequisiteMissingEventPayload`: missing_items, environment_id, evaluated_at
- `BrowserNavigationTracePayload` (post-login)
- SaaS-specific evidence (when successful): `AuthenticatedPageViewPayload`, `ActivationStepObservedPayload`, `EmptyStateObservedPayload`, `UpgradeSurfaceObservedPayload`, `NavigationStructureObservedPayload`

**Scope / limitations:**
- Only email+password login forms supported
- MFA blocks execution (awaits manual intervention)
- CAPTCHA blocks not bypassed
- OAuth/SSO flows not implemented
- No multi-page post-login exploration (currently single-page observation after login)
- Requires encrypted credentials in SaaS access store

**Dependencies:** `playwright`, `SecretService` (AES-256-GCM), `SaasAccessStore`, `SaasPrerequisites`, credit system (10 credits per run)

---

### 9. Light Probe Executor

**Status:** Implemented
**Where in code:** `workers/verification/executors.ts`

Minimal HTTP verification. Validates status code, redirects, headers, basic HTML presence for a specific subject URL.

**Evidence produced:** `HttpResponsePayload`, `RedirectPayload`, `PageContentPayload` (if HTML)

**Used by:** Verification orchestrator (light_probe type). Suggested when evidence is stale.

---

### 10. Reuse-Only Executor

**Status:** Implemented
**Where in code:** `workers/verification/executors.ts`

Filters existing evidence by subject_ref. Refreshes freshness timestamps. Returns existing evidence for recomputation without making any network requests.

**Used by:** Verification orchestrator (reuse_only type). Zero-cost re-evaluation.

---

### 11. Integration Pull Executor

**Status:** Scaffolded only (NOT implemented)
**Where in code:** `workers/verification/executors.ts`

Registered as executor type but has no implementation. Would produce `IntegrationSnapshotPayload` evidence from external APIs (analytics platforms, payment processors, CRM data, etc.).

---

### 12. Pixel Management (Event Ingestion Scaffold)

**Status:** Partially implemented (management only, no ingestion)
**Where in code:** `apps/platform/pixel-management.ts`

Generates deterministic pixel IDs and JavaScript snippet per org/environment. The snippet would be embedded in customer websites to send behavioral events. No ingestion pipeline exists to receive events. `BehavioralEventPayload` and `BehavioralSessionPayload` evidence types exist in domain model but are never populated.

---

## D. Evidence Type Inventory

### Actively produced evidence types (ingestion + verification)

| Evidence Type | Payload | Producer | Authority Level |
|---------------|---------|----------|----------------|
| HttpResponse | `HttpResponsePayload` | HTTP fetch, Light probe | Structural (1) |
| PageContent | `PageContentPayload` | Parser | Structural (1) |
| Redirect | `RedirectPayload` | HTTP fetch, Browser | Structural (1) / BrowserObserved (4) |
| Script | `ScriptPayload` | Parser | Structural (1) |
| Form | `FormPayload` | Parser | Structural (1) |
| Link | `LinkPayload` | Parser | Structural (1) |
| Iframe | `IframePayload` | Parser | Structural (1) |
| Meta | `MetaPayload` | Parser | Structural (1) |
| PolicyPage | `PolicyPagePayload` | Indicator extraction + content analysis | Heuristic (2) |
| CheckoutIndicator | `CheckoutIndicatorPayload` | Indicator extraction | Heuristic (2) |
| ProviderIndicator | `ProviderIndicatorPayload` | Indicator extraction | Heuristic (2) |
| PlatformIndicator | `PlatformIndicatorPayload` | Indicator extraction | Heuristic (2) |
| InlineScriptContent | `InlineScriptContentPayload` | Parser (Phase 2B) | Structural (1) |
| StructuredDataItem | `StructuredDataItemPayload` | Parser (Phase 2B) | Structural (1) |
| TechnologyDetected | `TechnologyDetectedPayload` | Technology Registry (Phase 2B) | Heuristic (2) |
| BrowserNavigationTrace | `BrowserNavigationTracePayload` | Browser verification | BrowserObserved (4) |
| BrowserCheckoutConfirmation | `BrowserCheckoutConfirmationPayload` | Browser verification | BrowserObserved (4) |
| BrowserFailureEvent | `BrowserFailureEventPayload` | Browser verification | BrowserObserved (4) |
| NetworkAnalysis | `NetworkAnalysisPayload` | Browser verification | BrowserObserved (4) |
| ClassifiedRuntimeErrors | `ClassifiedRuntimeErrorsPayload` | Browser verification | BrowserObserved (4) |
| MobileVerificationResult | `MobileVerificationResultPayload` | Browser verification (mobile) | BrowserObserved (4) |
| AuthenticatedSessionAttempt | `AuthenticatedSessionAttemptPayload` | Authenticated journey | Authenticated (6) |
| AuthenticationBlockedEvent | `AuthenticationBlockedEventPayload` | Authenticated journey | Authenticated (6) |
| PrerequisiteMissingEvent | `PrerequisiteMissingEventPayload` | Authenticated journey | Authenticated (6) |
| AuthenticatedPageView | `AuthenticatedPageViewPayload` | Authenticated journey | Authenticated (6) |
| ActivationStepObserved | `ActivationStepObservedPayload` | Authenticated journey | Authenticated (6) |
| EmptyStateObserved | `EmptyStateObservedPayload` | Authenticated journey | Authenticated (6) |
| UpgradeSurfaceObserved | `UpgradeSurfaceObservedPayload` | Authenticated journey | Authenticated (6) |
| NavigationStructureObserved | `NavigationStructureObservedPayload` | Authenticated journey | Authenticated (6) |

### Defined but not actively produced

| Evidence Type | Payload | Intended Producer | Status |
|---------------|---------|-------------------|--------|
| Certificate | `CertificatePayload` | HTTP fetch (socket) | Type defined, not populated |
| DnsRecord | `DnsRecordPayload` | DNS resolver | Type defined, not populated |
| BehavioralEvent | `BehavioralEventPayload` | Pixel ingestion | Type defined, no ingestion pipeline |
| BehavioralSession | `BehavioralSessionPayload` | Pixel aggregation | Type defined, no ingestion pipeline |
| IntegrationSnapshot | `IntegrationSnapshotPayload` | Integration pull | Type defined, no implementation |
| NucleiMatch | `NucleiMatchPayload` | External security scanner | Type defined, not integrated |
| KatanaDiscovery | `KatanaDiscoveryPayload` | External deep crawler | Type defined, not integrated |
| BrandImpersonationMatch | `BrandImpersonationMatchPayload` | Brand intelligence scan | Type defined, not integrated |
| ShopifyStoreMetrics | `ShopifyStoreMetricsPayload` | Shopify API | Type defined, not integrated |
| SurfaceVitality | `SurfaceVitalityPayload` | Passive site measurement | Type defined, not produced |

Trust levels reference `AuthorityLevel` enum: Structural(1) < Heuristic(2) < RuntimeProbe(3) < BrowserObserved(4) < IntegrationPull(5) < Authenticated(6).

---

## E. Notes on Overlap, Gaps & Architectural Observations

### 1. HTTP Fetch duplication
The HTTP fetch client is used by both the ingestion pipeline AND the light probe executor. Independent code paths producing the same evidence types. No shared caching — the same URL could be fetched by both pipelines independently.

### 2. Redirect evidence duplication
Redirect chains are captured by both HTTP fetch (Structural authority) and browser verification (BrowserObserved authority). Truth resolution handles this by authority hierarchy.

### 3. Staged vs basic pipeline divergence
The staged pipeline (`staged-pipeline.ts`) does NOT include Phase 2B enhancements (recursive crawl, technology detection, content enrichment). The basic pipeline (`pipeline.ts`) does. This means UI-facing staged execution produces a narrower evidence set than the basic pipeline.

### 4. Screenshots captured but never analyzed
Browser verification captures screenshots but there is no OCR, visual regression, or layout analysis. Screenshots are stored but unused by the signal engine.

### 5. Pixel management without ingestion
Pixel IDs and snippets are generated but there is no event ingestion worker. `BehavioralEventPayload` and `BehavioralSessionPayload` types exist but are never populated.

### 6. SPA detection without resolution
SPA frameworks are detected and flagged, but Stage D (selective headless rendering) is not implemented. SPA-heavy sites may produce incomplete evidence.

### 7. Integration pull is a dead path
`IntegrationPullExecutor` is registered but has no implementation.

### 8. Robots.txt/sitemap.xml fetched but not processed
Staged pipeline fetches these in Stage B, producing HTTP response evidence only. Content is not parsed for crawl decisions or sitemap URLs.

### 9. body_text_snippet truncation
Parser extracts only the first 500 characters of body text. Full body text is not stored as evidence. This limits content analysis capabilities — LLM analysis would need either the full body (new collection) or access to the raw HTML (already fetched but not stored as evidence).

### 10. MetaPayload defined but not explicitly produced
`MetaPayload` interface exists in evidence types with `og_tags` and `structured_data` fields. OG tags ARE extracted by the parser into `meta_tags` dict and used by signal engine. But `MetaPayload` is not produced as a standalone evidence type — the data lives in `PageContentPayload` and individual `StructuredDataItemPayload` items.

### 11. Future evidence types pre-defined
Multiple evidence types are defined for future integration: `NucleiMatch` (security scanning), `KatanaDiscovery` (deep crawling), `BrandImpersonationMatch` (brand protection), `ShopifyStoreMetrics` (Shopify API), `SurfaceVitality` (passive measurement). None are currently integrated into the pipeline.
