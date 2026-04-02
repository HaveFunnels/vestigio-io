# COLLECT.md — Vestigio Collection Method Inventory

> Last updated: 2026-03-29
> Grounded in: current codebase inspection (workers/, packages/, apps/)

---

## A. Overview

Vestigio collects evidence about websites and SaaS applications through multiple collection methods organized in two main worker pipelines:

1. **Ingestion Pipeline** (`workers/ingestion/`) — Static HTTP fetching, HTML parsing, indicator extraction, crawl discovery
2. **Verification Pipeline** (`workers/verification/`) — Browser automation, authenticated journeys, light probes, evidence reuse

Collection methods produce **Evidence** objects (`packages/domain/evidence.ts`) with strongly-typed payloads. Each evidence item records its `source_kind` (crawl, http_fetch, browser_verification, etc.) and `collection_method` (static_fetch, dynamic_render, api_call, etc.).

### Collection families in the current system

| Family | Status | Worker |
|--------|--------|--------|
| Static HTTP fetch | Implemented | Ingestion |
| HTML/DOM parsing (regex-based) | Implemented | Ingestion |
| Crawl/discovery (URL probing + link following) | Implemented | Ingestion |
| Indicator extraction (checkout, provider, platform, policy) | Implemented | Ingestion |
| Browser verification (Playwright) | Implemented | Verification |
| Authenticated browser journey (SaaS login + exploration) | Implemented | Verification |
| Light HTTP probe | Implemented | Verification |
| Evidence reuse (re-evaluation) | Implemented | Verification |
| Integration pull (external API) | Scaffolded only | Verification |
| Pixel/behavioral event ingestion | Scaffolded (pixel management exists, no ingestion) | Platform |

---

## B. Collection Methods Inventory

---

### 1. HTTP Fetch Client

**Status:** Implemented
**Where in code:** `workers/ingestion/http-client.ts`
**Collection type:** HTTP client

**How it works:**
Uses Node.js built-in `https`/`http` modules (zero external HTTP dependencies). Sends GET requests with a custom User-Agent (`VestigioBot/1.0`). Follows redirects automatically (up to 10 hops), recording the full redirect chain with status codes and host information.

**What it collects today:**
- HTTP response: URL, final URL, status code, headers, response body, response time (ms), content-type, content-length
- Redirect chain: Each hop with URL, status code, host
- Cross-domain detection during redirects

**Output / evidence produced:**
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

**Dependencies:**
- Node.js `https`, `http`, `url` modules only
- No external libraries

**Used by:**
- Ingestion pipeline (homepage fetch, candidate fetching)
- Staged pipeline (all stages)
- Light probe executor (verification)

**Confidence / freshness:**
- Evidence freshness: 24-hour TTL
- Quality score: 50-75 (based on response time and status code)

---

### 2. HTML Parser

**Status:** Implemented
**Where in code:** `workers/ingestion/parser.ts`
**Collection type:** Parser (regex-based, no DOM library)

**How it works:**
Lightweight regex-based HTML parser. Extracts structural elements from raw HTML without building a full DOM tree. Resolves relative URLs to absolute using root domain.

**What it collects today:**
- **Page metadata:** title, meta_description, h1, canonical_url, lang, all meta tags
- **Links:** All `<a href>` with text, rel attribute, external/internal classification, target host
- **Forms:** All `<form>` with action, method, field names, payment field detection, external posting detection
- **Scripts:** All external `<script src>` with hostname, external classification
- **Iframes:** All `<iframe src>` with hostname, external classification

**Payment field detection patterns:**
`card`, `cc-`, `credit`, `cvv`, `cvc`, `expir`, `billing`, `payment`, `stripe`, `braintree`

**Domain logic:**
Root domain = last 2 parts of hostname. Same-domain = host matches or is subdomain of root domain.

**Output / evidence produced:**
- `PageContentPayload`: url, title, meta_description, h1, canonical_url, lang, form/script/link counts
- `FormPayload`: page_url, action, method, target_host, is_external, field_names, has_payment_fields
- `ScriptPayload`: page_url, src, host, is_external, known_provider
- `LinkPayload`: page_url, href, text, is_external, target_host, rel
- `IframePayload`: page_url, src, host, is_external, known_provider

**Scope / limitations:**
- Regex-based: may miss malformed HTML, dynamic content, shadow DOM
- No JavaScript execution: SPA content invisible
- Filters out javascript:, mailto:, tel: protocols from links
- External script detection only (inline scripts ignored)
- No CSS parsing
- No structured data (JSON-LD, microdata) extraction beyond meta tags

**Dependencies:** None (pure regex)

**Used by:**
- Ingestion pipeline (all fetched pages)
- Staged pipeline (all stages)

---

### 3. Crawl Discovery Engine

**Status:** Implemented
**Where in code:** `workers/ingestion/pipeline.ts` (discoverCandidates), `workers/ingestion/crawl-constraints.ts`
**Collection type:** Crawler

**How it works:**
Two-phase discovery:
1. **Path probing:** Directly probes 11 common high-value paths: `/checkout`, `/cart`, `/login`, `/contact`, `/pricing`, `/privacy`, `/terms`, `/refund-policy`, `/return-policy`, `/shipping`, `/about`
2. **Link scanning:** Scans homepage links for pages matching checkout, login, contact, policy, pricing patterns using multilingual token sets

Crawl constraints enforced via `CrawlSession` class with URL deduplication, content hash loop detection, and global timeout.

**Token sets for URL classification:**
- Checkout: `checkout`, `cart`, `pay`, `payment`, `comprar`, `pedido`, `order`, `billing`, `purchase`, `buy`, `carrinho`
- Login: regex `/login|signin|sign-in|account|register|signup/i`
- Contact: regex `/contact|contato|fale-conosco|support|suporte/i`
- Policy: `privacy`, `privacidade`, `terms`, `termos`, `refund`, `reembolso`, `devolucao`, `return`, `shipping`, `entrega`, `frete`, `cookie`, `security`, `seguranca`
- Pricing: regex `/pricing|preco|planos|plans/i`

**What it collects today:**
- Discovered URL inventory (up to 20 candidate URLs + homepage)
- URL classification (checkout, login, contact, policy, pricing)
- Same-domain vs cross-domain link relationships

**Crawl constraints (defaults):**
- `max_pages_per_domain`: 30
- `max_depth`: 3
- `per_request_timeout_ms`: 10,000
- `global_timeout_ms`: 60,000
- `max_body_size_bytes`: 2,000,000 (2MB)
- `enable_loop_detection`: true (content hash of first 5KB)
- `spa_detection_enabled`: true

**URL normalization:** Lowercase hostname, remove hash, remove tracking params (utm_*, ref, fbclid, gclid)

**Output / evidence produced:**
Discovery feeds the HTTP fetch client which produces all evidence types. Discovery itself doesn't create evidence — it creates the URL list.

**Scope / limitations:**
- Max 20 candidate URLs per ingestion
- Depth limited to 3 hops from homepage
- Only follows links from homepage (no recursive crawling from discovered pages in basic pipeline)
- SPA detection flags but doesn't resolve (Stage D reserved for headless)

**Dependencies:**
- HTTP fetch client (internal)

**Used by:**
- Basic ingestion pipeline
- Staged pipeline (Stage C: prioritized crawl)

---

### 4. Indicator Extraction

**Status:** Implemented
**Where in code:** `workers/ingestion/pipeline.ts` (extractCheckoutIndicators, extractProviderIndicators, extractPlatformIndicators, extractPolicyIndicators)
**Collection type:** Pattern matching / extraction

**How it works:**
Scans parsed HTML content, script URLs, and iframe sources against known provider/platform/checkout patterns.

#### 4a. Checkout Indicator Extraction

**Patterns:** Matches links against CHECKOUT_TOKENS, detects payment field patterns in forms
**Confidence:** 40% (internal link match) to 75% (payment fields detected)
**Output:** `CheckoutIndicatorPayload`: page_url, indicator_source, target_url, target_host, is_external, checkout_mode (redirect/embedded), confidence, tokens_matched

#### 4b. Provider Indicator Extraction

**Patterns:**
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

**Patterns:**
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
**Output:** `PolicyPagePayload`: url, policy_type, detected (boolean), confidence, word_count (currently null)

---

### 5. Staged Pipeline

**Status:** Implemented
**Where in code:** `workers/ingestion/staged-pipeline.ts`
**Collection type:** Orchestrator (progressive multi-stage)

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

**SPA detection triggers Playwright flag if:**
- scriptCount > 15, OR
- bodyLength < 2000 AND scriptCount > 5, OR
- textContent < 500 AND scriptCount > 8
- Framework patterns: `__NEXT_DATA__`, `__NUXT__`, `ng-version`, `__gatsby`, `data-v-`, `react-root`, `id="root"`

**Output:** Same evidence types as basic pipeline, with coverage metadata and challenge flags.

---

### 6. Browser Verification (Playwright)

**Status:** Implemented
**Where in code:** `workers/verification/browser-worker.ts`, `workers/verification/playwright-runtime.ts`
**Collection type:** Browser automation

**How it works:**
Launches headless Chromium via Playwright. Executes a sequence of verification steps (navigate, click, type, wait_for, assert_visible, screenshot, wait_ms) against target URLs. Captures artifacts: screenshots, console errors, network errors, redirect chains.

**Step types:**
- `navigate`: Go to URL
- `click`: Click CSS selector
- `type`: Type text into CSS selector
- `wait_for`: Wait for CSS selector to appear
- `assert_visible`: Assert CSS selector is visible
- `screenshot`: Capture full-page screenshot
- `wait_ms`: Static wait

**Safety limits:**
- Max steps per run: 20
- Max duration: 60,000ms (60s)
- Max screenshots: 10
- Max scenarios: 5
- Max retries: 2
- Per-step timeout: 15s
- Viewport: 1280x720
- User-Agent: `Vestigio-Verification/1.0`

**What it collects today:**
- Navigation trace: redirect chain, final URL, steps executed/succeeded, duration, page title
- Checkout confirmation: whether checkout page was confirmed reachable, by which method
- Failure events: which steps failed, console errors, network errors

**Output / evidence produced:**
- `BrowserNavigationTracePayload`: start_url, final_url, redirect_chain, steps_executed, steps_succeeded, duration_ms, title
- `BrowserCheckoutConfirmationPayload`: checkout_url, confirmed, method
- `BrowserFailureEventPayload`: url, failed_steps, console_errors, network_errors

**Scope / limitations:**
- Requires Playwright installation (dynamic import, graceful fallback to simulated mode)
- No persistent sessions (new context per request)
- No cookie/state carry between verifications
- Screenshot capture but no OCR/visual analysis
- Console/network errors captured but not semantically analyzed
- Simulated mode for CI/tests returns deterministic results

**Dependencies:**
- `playwright` (dynamic import, optional)
- Chromium browser binary

**Used by:**
- Verification orchestrator (browser_verification type)
- Scale readiness (checkout confirmation)
- Revenue integrity (navigation trace)

**Cost:** Gated by plan (vestigio=blocked, pro=5/day, max=20/day). Each run costs credits.

---

### 7. Authenticated Browser Journey

**Status:** Implemented
**Where in code:** `workers/verification/authenticated-runtime.ts`
**Collection type:** Authenticated browser automation

**How it works:**
Loads SaaS access credentials from encrypted storage. Navigates to login URL. Detects login form fields using multiple selector strategies. Fills email/password. Submits form. Waits for post-login navigation. Detects MFA challenges. On success, captures authenticated page views.

**Login field selectors (tried in order):**
- Email: `input[type="email"]`, `input[name="email"]`, `input[name="username"]`, `input[id="email"]`, `input[id="username"]`, `input[autocomplete="email"]`, `input[autocomplete="username"]`
- Password: `input[type="password"]`, `input[name="password"]`, `input[id="password"]`, `input[autocomplete="current-password"]`
- Submit: `button[type="submit"]`, `input[type="submit"]`, `button:has-text("Log in")`, `button:has-text("Sign in")`, `button:has-text("Login")`, `button:has-text("Continue")`

**MFA detection:**
Input patterns: `otp`, `mfa`, `totp`, `2fa`, `code`, `verification`
Data-testid patterns: `mfa`, `2fa`, `otp`
Text patterns: "Enter verification code", "Two-factor authentication", etc.

**Outcome states:**
- `authenticated_success`: Login successful, navigated away from login page
- `authentication_failed`: Login form still present after submission
- `awaiting_manual_mfa`: MFA challenge detected
- `blocked_by_prerequisite`: Missing config items
- `blocked_by_seed_data`: Test account needs seed data
- `runtime_error`: Browser/execution error

**What it collects today:**
- Auth session attempt result (success/failure, duration, method)
- Authentication blockers (MFA type, failure reason)
- Navigation trace post-login
- Prerequisite evaluation results

**Output / evidence produced:**
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

**Dependencies:**
- `playwright` (dynamic import)
- `SecretService` (AES-256-GCM decryption)
- `SaasAccessStore`
- `SaasPrerequisites` evaluator
- Credit system (10 credits per run)

**Used by:**
- SaaS growth readiness pack (activation, onboarding, upgrade analysis)
- SaaS-specific signal extraction

---

### 8. Light Probe Executor

**Status:** Implemented
**Where in code:** `workers/verification/executors.ts`
**Collection type:** HTTP probe

**How it works:**
Minimal HTTP verification. Validates status code, redirects, headers, basic HTML presence for a specific subject URL.

**What it collects today:**
- HTTP response (status, headers, timing)
- Redirect chain (if any)
- Basic page content (if HTML)

**Output / evidence produced:**
- `HttpResponsePayload`
- `RedirectPayload` (if redirects)
- `PageContentPayload` (if HTML response)

**Scope / limitations:**
- Single URL only
- No JavaScript execution
- No deep parsing
- Useful for freshness validation, not deep analysis

**Dependencies:** HTTP fetch client (internal)

**Used by:** Verification orchestrator (light_probe type). Suggested when evidence is stale.

---

### 9. Reuse-Only Executor

**Status:** Implemented
**Where in code:** `workers/verification/executors.ts`
**Collection type:** Evidence re-evaluation

**How it works:**
Filters existing evidence by subject_ref. Refreshes freshness timestamps. Returns existing evidence for recomputation without making any network requests.

**What it collects today:** Nothing new. Re-evaluates existing evidence.

**Output:** Existing evidence with refreshed freshness.

**Used by:** Verification orchestrator (reuse_only type). Zero-cost re-evaluation.

---

### 10. Integration Pull Executor

**Status:** Scaffolded only (NOT implemented)
**Where in code:** `workers/verification/executors.ts`
**Collection type:** External API integration

**How it works:** Registered as executor type but has no implementation.

**What it would collect:** External API data (analytics platforms, payment processors, CRM data, etc.)

**Output:** Would produce `IntegrationSnapshotPayload` evidence.

**Used by:** Nothing currently.

---

### 11. Pixel Management (Event Ingestion Scaffold)

**Status:** Partially implemented (management only, no ingestion)
**Where in code:** `apps/platform/pixel-management.ts`
**Collection type:** Event ingestion scaffold

**How it works:**
Generates deterministic pixel IDs and JavaScript snippet per org/environment. The snippet would be embedded in customer websites to send behavioral events back to Vestigio.

**What it collects today:** Nothing. The pixel ID and snippet are generated, but there is no event ingestion pipeline to receive and process pixel events.

**Output:** Would produce `BehavioralEventPayload` evidence (evidence type exists in domain model).

---

## C. Collection Capability Matrix

| Method | Data Families | Depth | Trust Level | Cost/Intensity | Runtime Req | Current Downstream |
|--------|--------------|-------|-------------|----------------|-------------|-------------------|
| HTTP Fetch | Response metadata, redirects, timing | Surface | Structural (1) | Low | Node.js | All packs |
| HTML Parser | DOM structure, links, forms, scripts, iframes, meta | Surface | Structural (1) | Low | Node.js | All packs |
| Crawl Discovery | URL inventory, page classification | Breadth | Structural (1) | Low-Medium | Node.js | All packs |
| Indicator Extraction | Checkout, provider, platform, policy indicators | Medium | Heuristic (2) | Low | Node.js | Classification, signals |
| Staged Pipeline | Progressive multi-stage with coverage tracking | Orchestration | Structural (1) | Medium | Node.js | All packs |
| Browser Verification | Navigation traces, checkout confirmation, errors | Deep | BrowserObserved (4) | High | Chromium | Scale, revenue |
| Authenticated Journey | Auth session, SaaS page views, activation steps | Deep | Authenticated (6) | Very High | Chromium + credentials | SaaS growth |
| Light Probe | HTTP spot-check | Surface | Structural (1) | Low | Node.js | Freshness |
| Reuse-Only | Re-evaluation of existing evidence | None (reuse) | Varies | Zero | None | All packs |
| Integration Pull | (Not implemented) | — | IntegrationPull (5) | — | — | — |
| Pixel Events | (Not implemented) | — | Heuristic (2) | — | Browser pixel | — |

Trust levels reference `AuthorityLevel` enum: Structural(1) < Heuristic(2) < RuntimeProbe(3) < BrowserObserved(4) < IntegrationPull(5) < Authenticated(6).

---

## D. Notes on Overlap / Duplication

### 1. HTTP Fetch duplication

The HTTP fetch client (`http-client.ts`) is used by both the ingestion pipeline AND the light probe executor. These are independent code paths that produce the same evidence types. No shared caching exists — the same URL could be fetched by both pipelines independently.

### 2. Redirect evidence duplication

Redirect chains are captured by both the HTTP fetch client (during ingestion) and the browser verification runtime (during navigation). Both produce `RedirectPayload` evidence, but from different authority levels (Structural vs BrowserObserved). The truth resolution system handles this by authority-based conflict resolution.

### 3. Underutilized browser evidence

Browser verification captures screenshots, console errors, and network errors, but:
- Screenshots are stored but never analyzed (no OCR, no visual comparison)
- Console errors are captured in `BrowserFailureEventPayload` but the signal engine does not extract signals from them
- Network errors are captured but not processed into signals

### 4. Pixel management without ingestion

The platform layer generates pixel IDs and snippets (`pixel-management.ts`) but there is no corresponding ingestion worker to receive and process behavioral events. The `BehavioralEventPayload` evidence type exists in the domain model but is never populated.

### 5. SPA detection without resolution

The staged pipeline detects SPA frameworks (Next.js, Nuxt, Angular, Gatsby, Vue, React) and flags `spa_detected`, but Stage D (selective headless rendering for SPA resolution) is not implemented. SPA-heavy sites may produce incomplete evidence.

### 6. Integration pull is a dead path

The `IntegrationPullExecutor` is registered in the verification orchestrator's executor map but has no implementation. The `IntegrationSnapshotPayload` evidence type exists but is never populated. The verification economics system assigns a cost profile to it (3 credits, 0.8 reusability) but it cannot be executed.

### 7. No robots.txt/sitemap processing

The staged pipeline attempts to fetch `/robots.txt` and `/sitemap.xml` in Stage B, but the responses are not processed or used for crawl constraint enforcement. This fetch produces HTTP response evidence only.
