# ROADMAP.md — Vestigio Development Roadmap

> Last updated: 2026-04-27 (3.13, 3.18, 3.19 shipped; earlier: 3.12, 3.15, 3.17, 3.9 C-E, Shopify bug)
> Companion to: [NORTHSTAR.md](NORTHSTAR.md), [DEV_PROGRESS.md](../DEV_PROGRESS.md), [FINDINGS_OPPORTUNITIES.md](FINDINGS_OPPORTUNITIES.md), [COLLECT_OPPORTUNITIES.md](COLLECT_OPPORTUNITIES.md)
>
> **For completed work** (Waves 0, 1, 2.1–2.4, 3.1–3.4, 3.7 (F-H, I, L-R), 3.7B, 3.9, 3.11B, 3.12, 3.13, 3.14, 3.15, 3.16, 3.17, 3.18, 3.19, 3.20 Fase 1, 5 Fases 1–3, Marketing/SEO polish), see [COMPLETED_ROADMAP.md](COMPLETED_ROADMAP.md).

---

## How to read this document

This roadmap organizes work into **waves**, not sprints. Each wave groups items by strategic leverage, not by technical similarity.

Each item is tagged:

| Tag | Meaning |
|-----|---------|
| `engine` | Packages (signals, inference, intelligence, projections, decision) |
| `collection` | Workers (ingestion, verification, technology detection) |
| `frontend` | UI/UX (console pages, components, styling) |
| `platform` | Control plane (billing, members, auth, jobs) |
| `mcp` | Chat, playbooks, MCP tools, conversation |
| `docs` | Documentation, knowledge base, Sanity CMS |
| `infra` | Deploy, migrations, CI/CD |

Priority markers:
- **P0** — Blocks user value or creates visible broken experience
- **P1** — Directly improves core value delivery loop (finding → discussion → action → resolved)
- **P2** — Enriches quality, polish, or enables future capabilities
- **P3** — Nice-to-have, do when adjacent work happens

---

## Manual configuration steps (humans only)

These are env vars or external setups that the codebase can't ship for you. Each item links to the feature it unlocks. Do these in Railway (or wherever you keep secrets) before the corresponding flow goes live.

| Step | Env var / setup | Unlocks | Notes |
|---|---|---|---|
| Paddle price ID for /lp checkout | `NEXT_PUBLIC_PADDLE_LP_PRICE_ID=pri_xxx` | The "Unlock the full audit" CTA on `/lp/audit/result/[leadId]`. Without it the button shows "Pricing isn't configured yet" instead of opening Paddle Checkout. | Use the same `priceId` as your $99/mo Vestigio base plan in Paddle. The Surface Scans admin tab works without this. |
| Paddle client token | `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=live_xxx` | Paddle.js Initialize on `/lp/audit/result/[leadId]` and the existing `/onboard` checkout flow. | Already set in production for /onboard — verify same value works for /lp. |
| Paddle environment | `NEXT_PUBLIC_PADDLE_ENV=production` | Tells Paddle.js to hit live (not sandbox). Default falls to sandbox if unset. | Production-only. Don't set in staging. |
| Brevo API + senders | `BREVO_API_KEY`, `BREVO_SENDER_NOREPLY=no-reply@vestigio.io`, `BREVO_SENDER_NOTIFICATIONS=notifications@vestigio.io` | Magic links for `promoteLeadToOrg` (post-checkout) + transactional notifications. | Verified working in production via 3 live test sends. |
| Lead form HMAC secret (optional) | `LEAD_FORM_SECRET=<openssl rand -hex 32>` | Cryptographic form session token on `/lp/audit`. Falls back to `SECRET` env if unset. | Optional but recommended for prod hardening. |
| Meta WhatsApp Cloud API (optional) | `META_*` cluster (see [docs/WHATSAPP_SETUP.md](WHATSAPP_SETUP.md)) | Real WhatsApp delivery for incident/regression alerts. Falls back to Brevo WhatsApp (which requires Brevo paid plan) or skips. | Step-by-step in WHATSAPP_SETUP.md. Complete Coexistence flow. |
| Wave 0.2 — push `RawBehavioralEvent` table | `DATABASE_URL=$DATABASE_PUBLIC_URL npx prisma db push` | The `/api/behavioral/ingest` route. App build is fine without it but ingest writes will fail with `relation "RawBehavioralEvent" does not exist`. | Run once after pulling Wave 0.2. Same flow used for Wave 0.7 (CycleSnapshot + Finding tables). |

---

## Open items

| Item | Status | Wave |
|------|--------|------|
| Workspace Redesign — browser verification only | **~85% done** — only browser verification remains | Wave 3.11 |
| Workspace Lens Enrichment — checklist-first views | **Fases 1-5 shipped 2026-04-27** — Chargeback Resilience (checklist + trust score), Revenue Intelligence (funnel map + opportunities), Security Posture (checklist), perspective-level enrichment, full i18n (4 languages). CommerceContext KPIs + Product Intelligence deferred until projection layer exposes integration data. | Wave 3.11B |
| ~~Shopify: promoted product cross-reference~~ | **✅ Fixed 2026-04-27** — `handle` added to product fetch, cross-ref with crawled URLs in poller, `promotedProductIds` now populated. Finding M fires. | Wave 3.7 |
| ~~Ad Platforms: Creative→LP matcher + message-match + waste signal (C-E)~~ | **✅ Shipped 2026-04-27** — `ad-message-match.ts` module (extractAdLpPairs, Haiku analysis, parseAssessment), new signal `ad_message_mismatch_detected`, inference `inferAdCreativeMessageMismatch`, root cause `ad_landing_promise_gap`, impact baselines, remediation catalog, run-cycle wiring. | Wave 3.9 |
| Meta Ads + Google Ads OAuth app approvals | External — 1-6 weeks | Wave 3.9 |
| Prisma migration in prod for `syncMetadata` | Pending `npx prisma db push` | Wave 3.9 |
| Stripe Integration — OAuth + poller (scaffolding ~40% done) | Types + reconciliation + Prisma + API CRUD done; missing OAuth flow + revenue poller + sync route | Wave 3.8 |
| Copy Analysis Pack — remaining 16 items (A-D, G-P) | **0% of remaining items** — foundation only (4 enrichment types + signals + root cause) | Wave 3.10 |
| ~~Opportunity-First Actions — unified impact-ranked pipeline~~ | **✅ Shipped 2026-04-27** — all 6 fases complete. ActionProjection enriched with opportunity data, 2 tabs (Pipeline/My Actions) + filter bar, unified summary cards, type+upside badges, hypothesis inline + drawer card, ScatterPlot (effort × impact, 4 quadrants), OpportunityTracking Prisma model, PATCH status API, auto-verify on improvement, i18n (4 langs). | Wave 3.12 |
| ~~Re-engagement & Remediation — close the loop~~ | **✅ Fully shipped 2026-04-27** — Fases 1-3 (dashboard landing, CrossSignalHero, daily digest, Fix with AI in action drawer) + Fase 3I (Fix with AI in FindingDetailPanel with multi-action picker) + Fase 4 (i18n, 17 keys × 4 langs). Shared FixWithAiSection component extracted. | Wave 3.13 |
| Vestigio AI — Transversal Copilot | **Shipped 2026-04-22** — FAB with color orb + spring animation, full-height panel (side + full-screen expand), playbooks grid menu, CopilotProvider global state, SideDrawer coexistence, compact ChatInputBar with animated cycling placeholders, budget exhausted card, cross-domain pack insight bubbles during streaming, pack-aware ThinkingIndicator, voice message bubble, i18n (4 langs), chat removed from sidenav. | Wave 3.14 |
| ~~Cross-Signal Surface — making the moat visible~~ | **✅ Shipped 2026-04-27** — dedicated `/app/cross-signals` page, `GET /api/cross-signals` endpoint, CrossSignalsShell (hero stats, filters, chain cards), CrossSignalChainCard (expandable), temporal pattern detection (sequential vs simultaneous via cycleId), template-based narrative generator, sidebar nav entry, mock data, i18n (4 langs). CrossSignalHero dashboard widget enhanced with temporal patterns + narratives. | Wave 3.15 |
| Product Telemetry — measure before you change | **Shipped 2026-04-21** — ProductEvent model, useProductTrack hook, engagement score cron, admin product-analytics page. `prisma db push` applied to prod. | Wave 3.16 |
| ~~Upgrade Moments + Feedback Moments~~ | **✅ Shipped 2026-04-27** — PlanProvider + usePlan hook, UpgradeNudge (3 variants: inline/badge/blurred-overlay), FeedbackMoment (rating 5-star + NPS 0-10), useFeedbackMoment hook (3-layer cooldown: 48h/session/3-dismiss), NpsPulse 14-day pulse, copilot Pro pill badge, copilot upgrade nudge in empty state, copilot feedback after 3 messages, FindingDetailPanel 10s dwell trigger, WhatChangedCard cadence nudge, CrossSignalHero chain limiting for Starter, AdSpendKpi blurred preview, i18n (4 langs). | Wave 3.17 |
| ~~First-Audit Experience — value before data~~ | **✅ Shipped 2026-04-27** — FirstAuditProgress (5-stage emerald timeline, SSE-driven, business-type heuristic preview), FirstAuditCelebration (emerald glow dots overlay), wired into DashboardShell, i18n (4 langs). | Wave 3.18 |
| ~~Cancel Flow & Save Offers~~ | **✅ Shipped 2026-04-27** — CancelSurvey Prisma model, 3-step cancel page (`/app/settings/cancel`), dynamic save offers by reason (discount/pause/downgrade/support/roadmap), Paddle API integration (pause + cancel + discount), win-back email via Brevo, CancelSubscriptionButton in settings, i18n (4 langs). | Wave 3.19 |
| Unified Entity Architecture — Findings as first-class citizens | **Fase 1 shipped 2026-04-21** — FindingDetailPanel unified, cross-refs wired (workspace_refs, action_refs, opportunity_ref), canonical /app/findings/[id], URL filter state on Analysis, finding-in-URL on drawer open/close. **Fase 2 (saved views + sidebar simplification) and Fase 3 (custom views) deferred.** | Wave 3.20 |
| `integration_pull` executor | Scaffolded only | Wave 3 |
| `prisma db push` → `prisma migrate` | Pending | Wave 2.5 |
| Conversation export/branching | Not started | Wave 4.4 |
| Neglected Findings — data collected, findings missing | **Not started** — payment handoff (pixel), SaaS activation (auth sessions), oscillation clustering (pixel), network error weighting (Playwright), mobile trust gap (Playwright), behavioral micro-patterns (pixel) | Wave 4.6 |
| Cross-Domain Compound Findings — multi-source moat | **Not started** — security×revenue, ad promise×reality×behavior, trust×hesitation×revenue, post-purchase chain, brand impersonation×revenue | Wave 4.7 |

---

## Wave 2 — Remaining

### 2.5 Prisma Migrate

| | |
|---|---|
| **Tag** | `infra` |
| **Priority** | P2 |
| **What** | Project uses `prisma db push` (no migrations directory). Production data now exists. |
| **Fix** | Initialize `prisma migrate` with baseline migration from current schema. Update deploy docs. |

---

## Wave 3 — Semantic Enrichment & New Lenses

**Goal:** Add lightweight LLM enrichment to strengthen signal quality, and begin building the strategic lenses identified in the North Star (Trust & Conversion, Money-Moment Exposure).

> **Completed in Wave 3:** 3.1 (LLM Enrichment — 7 findings), 3.2 (CTA Clarity — subsumed by 3.1), 3.3 (Cybersecurity Pack — 12 findings), 3.7B (Nuvemshop Integration). See [COMPLETED_ROADMAP.md](COMPLETED_ROADMAP.md).

---

### 3.4 Composite Findings — High Leverage ✅ COMPLETE

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P1 |
| **Status** | **Fully implemented and integrated — 2026-04-21 audit confirmed.** All 3 composites wired into `recomputeAll()` at `recompute.ts:871-879`, stored in `MultiPackResult.composites`. |

Per [FINDINGS_OPPORTUNITIES.md § 7](FINDINGS_OPPORTUNITIES.md). These strengthen existing decisions, not create new findings.

| # | Composite | What it does | Surface | Status |
|---|-----------|-------------|---------|--------|
| A | Trust Surface Strength Score (FO-17) | Aggregate positive indicators into composite 0/10 score. 11 trust checks, graded A-F. | Preflight, Scale workspace | ✅ `packages/composites/trust-surface-score.ts` |
| B | High-Blast-Radius Regression (CO-5) | Detect 3+ decisions regressing in same cycle with overlapping factors. Auto-creates incident. Severity: critical (shared root cause) / high (3+ concurrent). | Incident candidate, Preflight blocker | ✅ `packages/composites/blast-radius-regression.ts` |
| C | Opportunity Compression (CO-6) | Group findings by root cause where 3+ findings share remediation. Priority boost 1.5×–2.0×. 18 root cause titles. | Action re-ranking, MCP artifact | ✅ `packages/composites/opportunity-compression.ts` |

---

### 3.5 MCP — Journey Narrative

| | |
|---|---|
| **Tag** | `mcp` |
| **Priority** | P2 |
| **What** | New MCP artifact (not a finding). Generates a natural-language customer journey narrative from existing findings, evidence graph, and page classifications. |
| **Output** | `JourneyNarrative { executive_summary, journey_stages[], friction_highlights[], strength_highlights[] }` |
| **Tool** | `get_journey_narrative` or enhancement to `get_workspace_summary`. |
| **Cost** | One Sonnet call per workspace summary request. Cached per cycle. |

---

### 3.6 Remaining Rule-Based Opportunities

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P2 |

| # | Opportunity | Effort |
|---|-----------|--------|
| A | FO-5: Response time by page criticality (comparative, not absolute) | Low |
| B | FO-6: Canonical URL mismatch detection | Low |
| C | FO-12: Surface relation anomaly detection | Medium |

---

### 3.7 Integration Data Layer + Shopify (Expanded)

| | |
|---|---|
| **Tag** | `engine` `platform` `collection` `frontend` |
| **Priority** | P1 |

**Current state:** Phase 4A shipped a read-only Shopify Admin API client (`packages/shopify-adapter/`), a production poller with adaptive backoff, and a mapper that translates Shopify metrics → `BusinessInputs`. **What's missing:** expanded data (customers/products/checkouts/inventory), and — critically — an **Integration Data Layer** that reconciles data from multiple sources (Shopify, Stripe, Meta, Google) without breaking when any source is absent.

> **Already shipped:** 3.7.0 (IntegrationSnapshot + reconcileIntegrations + CommerceContext), 3.7.1 (Shopify Connection Flow + Data Sources UI + KB article), 3.7.3 (Pipeline hookup in audit-runner), 3.7B (Nuvemshop full integration — see [COMPLETED_ROADMAP.md](COMPLETED_ROADMAP.md)). Line items wired into product dead-weight detection (2026-04-17).

#### 3.7.0 Integration Data Layer (Architectural Foundation)

**`CommerceContext` (shipped):** Extended commerce data consumed by signals, inferences, and workspaces:

```typescript
interface CommerceContext {
  // Shopify-exclusive
  abandonment_rate: number | null;
  abandonment_value_monthly: number | null;
  repeat_purchase_rate: number | null;
  new_vs_returning_ratio: number | null;
  avg_customer_lifetime_value: number | null;
  total_products: number | null;
  products_never_sold_30d: number | null;
  out_of_stock_promoted_count: number | null;
  top_products_by_revenue: { title: string; revenue: number }[];

  // Stripe-exclusive (future 3.8)
  mrr: number | null;
  subscriber_churn_rate: number | null;
  failed_payment_rate: number | null;

  // Ad platforms (future 3.9)
  total_ad_spend_monthly: number | null;
  ad_spend_by_platform: Record<string, number>;

  // Meta
  sources: string[];  // ['shopify'], ['shopify', 'stripe'], etc.
  basis_type: 'data_driven' | 'mixed' | 'heuristic';
}
```

**Revenue Recovery Tracker (open):** Correlates resolved findings with revenue changes across cycles.

```typescript
interface RevenueRecoveryEstimate {
  finding_key: string;
  resolved_at_cycle: string;
  estimated_impact_at_resolution: { min: number; max: number };
  revenue_delta_next_cycle: number | null;
  confidence: 'correlation' | 'strong_correlation' | 'inconclusive';
}
```

| # | Part | Description | Status |
|---|------|-------------|--------|
| 0d | **Revenue Recovery Tracker** | Cross-cycle correlation of resolved findings + revenue delta. Surfaces in Bragging Rights + Panorama. | Open |

#### 3.7.2 Expanded Shopify Data

| # | Part | Description | Status |
|---|------|-------------|--------|
| F | **Abandoned checkouts** | Fetch `/checkouts.json` (created_at filter, 90d window). Aggregate: abandonment_count, abandonment_rate, abandonment_value, avg_steps_before_abandon. Map to `CommerceContext.abandonment_rate` + `abandonment_value_monthly`. | ✅ Done — fetch (`client.ts:194`), aggregation (`aggregator.ts:208`), mapping (`snapshot-mapper.ts:69`), CommerceContext (`reconcile.ts:218`) all wired |
| G | **Customers** | Fetch `/customers.json` (orders_count, total_spent). Aggregate: repeat_purchase_rate, new_vs_returning_ratio, avg_customer_lifetime_value. Map to `CommerceContext`. | ✅ Done — fetch (`client.ts:245`), aggregation (`aggregator.ts:234`), mapping (`snapshot-mapper.ts:76`), CommerceContext (`reconcile.ts:226`) all wired |
| H | **Products** | Fetch `/products.json` (id, title, status, variants). Cross-reference with order line items. Identify: total_products, products_never_sold_30d (listed but 0 orders), top_products_by_revenue. Map to `CommerceContext`. | ✅ Done — fetch (`client.ts:295`), line items cross-ref (`poller.ts:171`), aggregation (`aggregator.ts:267`), CommerceContext (`reconcile.ts:232`) all wired |
| I | **Inventory levels** | Fetch `/inventory_levels.json` for products found on crawled pages. Identify: out_of_stock_promoted_count (product page exists in crawl inventory but stock = 0). Map to `CommerceContext`. | ✅ Done — fetch + batching (`client.ts:347`), `aggregateInventory()` (`aggregator.ts:305`), `handle` field added to product fetch (`client.ts`), poller cross-references product handles with crawled `/products/{handle}` URLs to populate `promotedProductIds`. Fixed 2026-04-27. |

#### 3.7.4 New Findings & Signals

| # | Finding | Data source | Pack | Status |
|---|---------|-------------|------|--------|
| L | `checkout_abandonment_revenue_leak` — "Your checkout loses $X/mo in abandoned carts" | abandoned_checkouts | revenue_integrity | ✅ Firing — signal `checkout_abandonment_rate_high` (>60%) → inference wired (`inference/engine.ts:3264`) |
| M | `promoted_product_out_of_stock` — "Products on your site are out of stock, frustrating buyers" | inventory_levels + crawled pages | money_moment_exposure | ✅ Firing — `promotedProductIds` now populated via handle cross-reference (3.7.2-I fix, 2026-04-27) |
| N | `high_refund_rate_eroding_revenue` — "Refund rate is X%, eroding $Y/mo in revenue" | refund data (real, not proxy) | chargeback_resilience | ✅ Firing — signal `refund_rate_elevated` (>5%) → inference wired (`inference/engine.ts:3300`) |
| O | `single_payment_gateway_risk` — "95%+ of payments go through one gateway — one outage stops all revenue" | payment_methods | money_moment_exposure | ✅ Firing — signal `payment_gateway_concentrated` (>90%) → inference wired (`inference/engine.ts:3318`) |
| P | `discount_abuse_pattern` — "X% of orders use discounts, leaking $Y/mo in margin" | discount data | channel_integrity | ✅ Firing — signal `discount_usage_elevated` (>40%) → inference wired (`inference/engine.ts:3336`) |
| Q | `low_repeat_purchase_rate` — "Only X% of buyers return — acquisition cost isn't being recovered" | customers | revenue_integrity | ✅ Firing — signal `repeat_purchase_rate_low` (<15%) → inference wired (`inference/engine.ts:3458`) |
| R | `dead_weight_products` — "X products are listed but haven't sold in 30 days" | products + orders | revenue_integrity (action_value_map behavioral) | ✅ Firing — signal `dead_weight_products_detected` (>5 + >25% catalog) → inference wired (`inference/engine.ts:3476`) |

#### 3.7.5 Transversal Impact (existing surfaces enriched by Shopify data)

| Surface | What changes with Shopify connected |
|---|---|
| **Impact estimates** | `basis_type` switches from `heuristic` → `data_driven`. All $X/mo estimates use real revenue. Confidence boost 1.3x. |
| **Maps** | Revenue Leakage Map nodes show real $ amounts per surface. |
| **Inventory page** | Products enriched with Shopify sales data (revenue per page, orders per product). |
| **Workspace Revenue Map** | Real $ breakdown by perspective instead of heuristic ranges. |
| **Bragging Rights** | Revenue Recovery Tracker: "Vestigio helped recover est. $X/mo from N resolved findings." |
| **Pulse Summary** | Haiku cites real numbers: "Your checkout abandonment costs $4.2k/mo based on Shopify data." |
| **Operational Amplifiers** | 5 amplifiers (cancellation, discount abuse, economic leakage, payment concentration, tx failure) derived from real Shopify operational data. Already built in mapper. |

---

### 3.8 Stripe Integration — Revenue Intelligence

| | |
|---|---|
| **Tag** | `platform` `collection` |
| **Priority** | P1 |
| **Status** | **Scaffolding ~40% complete — 2026-04-21 audit confirmed.** Type-level foundation done: `StripeSnapshotData` interface, `IntegrationProvider` includes `'stripe'`, `reconcileIntegrations()` handles Stripe data (SaaS priority, dispute_rate wins over Shopify proxy, CommerceContext mrr/churn/failed_payment wired). Prisma model reuses `IntegrationConnection`. API CRUD routes accept `provider: "stripe"` (connect/disconnect/list). Settings UI card exists but `configurable: false`. **Missing:** OAuth Connect flow, Revenue poller, Sync route handler, Audit cycle wiring (~16-24h). |

**Current state:** Stripe is the primary billing provider (checkout, webhooks, subscription lifecycle). **But** we only use Stripe for billing ourselves — we don't read the customer's Stripe data for revenue intelligence the way we do with Shopify.

**Architecture:** Uses the same `IntegrationConnection` Prisma model and `IntegrationSnapshot<'stripe'>` pattern from 3.7.0. The `reconcileIntegrations()` function handles Shopify+Stripe overlap automatically.

| # | Part | Description | Effort | Status |
|---|------|-------------|--------|--------|
| A | **OAuth Connect flow** | Stripe Connect (Standard or Express) OAuth: let the customer connect their own Stripe account so we can read their revenue data. `/api/stripe/connect/auth` → `/api/stripe/connect/callback`. Scopes: `read_only` on charges, invoices, subscriptions. Uses the generic `IntegrationConnection` model from 3.7.1B. | Medium | ❌ Not started — use Meta/Google Ads OAuth as template |
| B | **Revenue poller** | Fetch last 90d of charges/invoices/subscriptions. Compute: MRR, churn rate, avg revenue per customer, refund rate, failed payment rate, real dispute rate. Produce `IntegrationSnapshot<'stripe'>`. | Medium | ❌ Not started — use Shopify poller as template |
| C | **Settings UI** | "Connect Stripe" card alongside Shopify in Data Sources page. Same pattern as Shopify card. | Low | ⚠️ Card exists (`data-sources/page.tsx:593`) but `configurable: false` — needs flip + connect form/button |
| D | **Chargeback pack enrichment** | With real Stripe dispute data, the chargeback pack gets real dispute rates instead of Shopify's refund-rate proxy. `reconcileIntegrations()` prefers Stripe's `chargeback_rate` over Shopify's proxy when both present. | Low | ✅ Already wired in `reconcile.ts:154-162` — no new code needed, just needs data flowing |
| E | **SaaS-specific fields** | Populate `CommerceContext.mrr`, `subscriber_churn_rate`, `failed_payment_rate` — Shopify can't provide these. | Low | ✅ Already wired in `reconcile.ts` — no new code needed, just needs poller returning data |

**Note:** This is about reading the **customer's** Stripe account for revenue intelligence — completely separate from our own Stripe billing integration which is already working.

---

### 3.9 Ad Platform Integrations — Meta & Google Ads ✅ COMPLETE

| | |
|---|---|
| **Tag** | `platform` `collection` `engine` |
| **Priority** | P1 |
| **Status** | **✅ Fully shipped — 2026-04-27.** Full pipeline built: pollers (Graph API + GAQL), OAuth full-flow with CSRF protection, LGPD webhooks (data deletion + deauthorize for Meta), UI cards with Connect buttons in Data Sources, run-cycle wiring, KB articles, deployment docs. Graph foundation (Layer 1): ad_creative/ad_campaign node types, ad_targets/ad_funds edge types, 4 compound findings (dead destination, landing trust gap, form friction waste, mobile checkout degraded), 2 context signals (ad spend concentrated, ads without conversion tracking). 6 new inferences + impact baselines + root causes + remediation catalog. Dashboard AdSpendKpi widget reading syncMetadata. **Layer 2 (C-E shipped 2026-04-27):** Creative→LP matcher (`extractAdLpPairs`), Haiku message-match analysis (`analyzeAdMessageMatch`), ad spend waste quantification — full signal→inference→impact→remediation pipeline wired in run-cycle. **Pending (external):** Meta Developer App Review approval (ads_read + business_management) + Google Cloud OAuth verification + Google Ads Developer Token. `npx prisma db push` for syncMetadata field. |

**Context:** Pulling actual ad creative text from ad platforms enables precise message-match analysis (does the landing page deliver what the ad promised?), ad spend waste quantification, and conversion attribution. This data also enriches the Copy Analysis Pack (3.10) with real ad creatives instead of UTM heuristics.

| # | Part | Description | Effort | Status |
|---|------|-------------|--------|--------|
| A | **Meta Ads API integration** | OAuth flow, Graph API poller (30d insights + top 20 creatives with headline/body/cta/destination_url/spend), LGPD webhooks, UI card, KB article. **Pending:** Meta app review approval. | — | ✅ Done |
| B | **Google Ads API integration** | OAuth flow, GAQL poller (campaign costs + responsive search ad headlines/descriptions + final URLs), UI card, KB article. **Pending:** Google OAuth verification + developer token. | — | ✅ Done |
| C | **Creative → LP matcher** | Match ad creatives to landing pages via: (1) destination URL exact match, (2) UTM campaign/content → creative ID mapping, (3) final URL domain + path pattern. Each matched pair becomes a `AdLpPair { creative_text, creative_cta, lp_url, lp_copy_elements }` fed to the Haiku analysis. | Low | ✅ Done — `extractAdLpPairs()` in `workers/ingestion/enrichment/ad-message-match.ts`, traverses graph `ad_creative` nodes + `ad_targets` edges, pairs with page copy from enrichment evidence |
| D | **Precise message-match analysis** | Haiku call per `AdLpPair`: does the LP headline echo the ad promise? Does the LP CTA match the ad CTA type? Is the value prop consistent? Structured output with specific mismatch points and fix suggestions. New signal `ad_message_mismatch_detected`, new inference `landing_page_breaks_ad_promise`. | Low | ✅ Done — `analyzeAdMessageMatch()` Haiku prompt + `parseAssessment()` in `ad-message-match.ts`, signal `ad_message_mismatch_detected` in `signals/engine.ts`, inference `inferAdCreativeMessageMismatch` in `inference/engine.ts`, root cause `ad_landing_promise_gap`, evidence type `ad_message_match` |
| E | **Ad spend waste signal** | Quantify message-mismatch findings in dollars: "This LP receives ~$X/day in ad spend but breaks the ad promise — estimated waste: $Y/mo." Uses `CommerceContext.ad_spend_by_platform` for real $ amounts. | Low | ✅ Done — inference aggregates total spend across mismatched pairs, impact baselines in `baselines.ts` (high: 4-7%, medium: 2-4%, low: 1-2%), remediation catalog with 5 steps, pack `revenue_integrity`, surface `Meta Ads / Google Ads → landing page copy` |
| F | **Settings UI** | Meta Ads + Google Ads cards in Data Sources page. | — | ✅ Done |
| — | **4 compound findings (heuristic, graph-based)** | `ad_creative_dead_destination`, `ad_creative_landing_trust_gap`, `ad_creative_form_friction_waste`, `ad_creative_mobile_checkout_degraded` — all with signals + inferences + remediation. These analyze page structure (forms, trust signals, mobile perf), NOT creative text content. | — | ✅ Done (`signals/engine.ts:5583-5645`) |
| — | **2 context signals** | `ad_spend_platform_concentrated`, `ads_active_without_conversion_tracking`. | — | ✅ Done |

---

### 3.10 Copy Analysis Pack — AI-Powered Copy & Funnel Alignment (Foundation Shipped)

| | |
|---|---|
| **Tag** | `engine` `collection` `docs` |
| **Priority** | P1 |
| **Status** | **Foundation shipped — 2026-04-11. Remaining items 0% implemented — 2026-04-21 audit confirmed.** 4 enrichment types (`checkout_trust`, `cta_clarity`, `product_page_quality`, `pricing_page_framing`) produce `ContentEnrichmentPayload` evidence via Haiku in `workers/ingestion/enrichment/semantic-enrichment.ts`. Signal extraction (`extractCopyEnrichmentSignals` at `signals/engine.ts:4662`) and 4 root cause mappings to `copy_strategy_gap` wired. Tier 2 signals (social_proof/form_error/onboarding) defined in extraction logic but semantic enrichment pass doesn't produce their evidence yet. **Items A-D, G-P: none implemented.** No `packages/copy-analysis/` directory, no `CopyElementsPayload` type, no ICP fields on Environment, no `CopyAnalysis` structured output, no `copy_alignment_pack`, no copy workspace, no MCP tool. |
| **Why after integrations?** | With Shopify/Stripe connected (3.7/3.8), copy analysis can measure impact against **real revenue data** instead of heuristics. With ad platform data (3.9), message-match (item J) can compare **actual ad creative text** against landing page copy word-for-word, not just UTM keyword guesses. The pack is 10x more valuable with integration data feeding it. |

**The thesis:** Most SaaS/ecommerce sites have copy that was written once and never audited against the actual ICP, funnel stage, or commercial intent of each page. The result is generic copy that doesn't convert — not because the product is bad, but because the words on the page don't match the buyer's mental state at that point in the journey. This pack turns Vestigio into a **copy strategist** that evaluates alignment between what the page says and what the page should say.

**Requires:** Haiku LLM calls per commercial page (~$0.003/page). A reference knowledge base of copy best practices, marketing angles, and funnel-stage expectations that the LLM evaluates against.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Copy Best Practices Knowledge Base** | Build a structured reference at `packages/copy-analysis/guidelines.ts` containing: funnel-stage expectations, ICP alignment criteria, marketing angle taxonomy, page-type copy rules. Each guideline is a structured object with `id`, `category`, `rule`, `good_example`, `bad_example`, `funnel_stages[]`, `page_types[]` so the LLM can cite specific guidelines in its analysis. | Medium |
| B | **Copy extraction enrichment** | ✅ Done — `body_text_snippet` expanded to 2000 chars (2026-04-12). Remaining: extract page headline (h1), subheadline, CTA text(s), social proof elements, trust signals, urgency indicators into `CopyElementsPayload`. | Low |
| C | **ICP profile input** | During onboarding (or in settings), capture ICP basics: target persona description, industry, average deal size, buying sophistication (technical/non-technical/mixed), primary pain point. Stored on the Environment model. Falls back to heuristic ICP detection from the site content if not provided. | Low |
| D | **Haiku copy analysis per page** | For each commercial page, call Haiku with: the extracted copy elements, the page's funnel classification, the ICP profile, and the relevant subset of guidelines. Structured output: `CopyAnalysis { funnel_alignment_score, icp_match_score, issues[], strengths[], overall_grade }`. Cache by SHA256(copy_elements + icp_profile + guidelines_version). | Medium |
| E | **New signals** | `copy_funnel_misalignment`, `copy_icp_disconnect`, `missing_trust_at_decision_point`, `cta_clarity_weak`, `value_proposition_absent`, `objection_unaddressed`, `social_proof_misplaced`. ✅ Partially covered by Tier 1+2 enrichment. | Medium |
| F | **New inference keys** | `copy_misaligned_with_funnel_stage`, `copy_disconnected_from_icp`, `trust_copy_absent_at_decision`, `cta_unclear_or_competing`, `value_proposition_missing_above_fold`, `key_objection_unaddressed`, `social_proof_ineffective_placement`. ✅ Partially covered. | Medium |
| G | **Decision pack** | New `copy_alignment_pack`. Pack question: `is_copy_aligned_with_commercial_intent`. Four tiers. | Low |
| H | **Workspace** | `copy_alignment` workspace. Shows per-page copy grades, overall funnel alignment score, top issues by impact, before/after suggestion previews. | Medium |
| I | **MCP integration** | New tool `analyze_copy` + playbook `copy_audit` for comprehensive copy review. | Low |
| J | **Message-match** | With ad platform data (3.9), compare actual ad creative text against LP copy. Without it, falls back to UTM keyword heuristic. **Significantly stronger with 3.9 data.** | Low |
| K | **Cross-page narrative consistency** | Haiku call with copy elements from all commercial pages in sequence. Detect: contradictory promises, abandoned commitments, tone shifts, inconsistent naming. | Medium |
| L | **Pricing page psychology** | Specialized Haiku analysis: anchoring effectiveness, decoy positioning, value framing, plan naming, objection handling. | Low |
| M | **Localization quality** | For multi-locale sites, compare persuasive structure between primary locale and translations. Detect when translation preserved meaning but lost marketing intent. | Medium |
| N | **Micro-copy audit** | Extract and analyze form labels, error messages, button text, tooltips, empty states, confirmation messages. | Low |
| O | **SEO vs conversion tension** | Cross-reference SEO audit data with copy analysis. Detect keyword-stuffed headlines or conversion-optimized copy invisible to Google. | Low |
| P | **Copy staleness** | Detect outdated references: contradictory social proof numbers, expired promotions, past dates, old screenshots. | Low |

**Cost estimate:** ~$0.02-0.05 per audit. Items K-P can be implemented incrementally after core A-I.

---

### 3.11 Workspace Redesign — Perspectives + Transversal Lenses (~85% Done)

| | |
|---|---|
| **Status** | **~85% complete — 2026-04-21 audit confirmed.** Backend: All 5 engine functions fully implemented (`detectMaturityStage`, `groupByPerspective`, `buildRevenueMap`, `buildCycleDelta`, `buildBraggingRights`). Pulse Summary API endpoint working with real Haiku LLM calls + 1h cache. Frontend: Panorama page + 4 perspective detail pages (`/workspaces/perspective/[slug]`) fully built and navigable. All 4 lens components (PulseSummary, RevenueMap, CycleDelta, BraggingRights) render correctly. **Nuance:** PulseSummary is wired to real API; the other 3 lens components use **client-side derived logic** from `WorkspaceProjection[]` props instead of calling the engine functions — output is functionally equivalent but the engine functions (`buildRevenueMap`, `buildCycleDelta`, `buildBraggingRights`) are technically dead code. **Remaining:** browser verification only. The "wire engine functions into API routes" gap is cosmetic, not functional — components already produce correct output. |

**Goal:** Consolidate 12 flat workspaces into 5 smart perspectives with transversal lenses that cut across all packs. Each perspective adapts its content based on the detected maturity stage of the business.

#### Perspectives (replaces flat workspace list)

| Perspective | Replaces | What it answers | Behavioral sub-views (pixel-dependent) |
|---|---|---|---|
| **Panorama** (home) | New | "What matters right now?" | — |
| **Receita** (Revenue) | revenue_integrity + scale_readiness | "Where am I losing money?" | First Impression Revenue, Action Value Map, Acquisition Integrity, Friction Tax, Path to Purchase Efficiency |
| **Confiança** (Trust) | chargeback_resilience + money_moment_exposure (security) | "Does the buyer trust me?" | Trust Revenue Gap |
| **Comportamento** (Behavior) | — | "What do real users do on mobile?" | Mobile Revenue Exposure |
| **Copy** | New (Wave 3.7) | "Does my copy match what buyers need to hear?" | — |

#### Transversal lenses (appear in Panorama globally + in each perspective filtered)

| Lens | What it shows | Data source |
|---|---|---|
| **Pulse Summary** | LLM briefing (3-4 sentences) generated by Haiku from workspace findings. Adapts framing to maturity stage. | Haiku call per workspace, ~$0.001 each |
| **Onde está seu dinheiro** (Revenue Map) | Breakdown of estimated monetary impact by perspective. Treemap or bar chart. | Impact engine value_cases aggregated by pack |
| **O que mudou nesse ciclo** (Cycle Delta) | Delta highlights: findings that improved, worsened, or appeared since last cycle. | Change detection engine (change_report) |
| **O que você está fazendo certo** (Bragging Rights) | Positive checks that passed + findings resolved since last cycle. | POSITIVE_CHECKS from projections + resolved actions |

#### Maturity stage detection (property of Environment, not a workspace)

| Stage | Detection heuristic | Impact on workspace framing |
|---|---|---|
| **Launch** | First 1-2 cycles, no behavioral data, few resolved findings | "Is this ready to go live?" |
| **Growth** | Active traffic (pixel sessions > 0), < 1000 sessions/month | "Am I losing money as I scale?" |
| **Scale** | High traffic, Shopify/Stripe connected with real revenue, multiple cycles with resolved findings | "Where are the marginal gains?" |

#### Remaining implementation

| # | Part | Tag | Effort | Status |
|---|---|---|---|---|
| A-F | **Engine functions** (maturity, pulse, perspectives, revenue map, cycle delta, bragging rights) | `engine` | — | ✅ Done — all integrated in `recompute.ts` |
| G | **Frontend: Workspace page redesign** | `frontend` | High | ✅ Done — Panorama + 4 perspective pages |
| H-K | **Frontend: Lens components** (PulseSummary, RevenueMap, CycleDelta, BraggingRights) | `frontend` | — | ✅ Done — PulseSummary wired to real API; other 3 use equivalent client-side logic |
| — | ~~**Wire engine functions into API routes**~~ | `frontend` | ~~Medium~~ | **Deprioritized** — lens components already produce correct output via client-side derivation from `WorkspaceProjection[]`. Engine functions are dead code but not blocking. Optional cleanup. |
| — | **Browser verification** of the full workspace experience | `frontend` | Low | Open — the only truly remaining item |
| — | **Workspace-level health scores** | Each workspace detail shows a 0-100 score with sparkline of last 5 cycles. Chargeback uses Trust Surface Score; Revenue derives from CommerceContext KPIs + finding severity. Score changes per cycle → reason to return. | `frontend` `engine` | Medium | Open — feeds into 3.13 digest |
| — | **"What changed this cycle" hero banner** per workspace | Colored banner at top of each workspace detail: "3 items improved, 1 regressed, score went from B to A-." Data exists in `WorkspaceProjection.change_summary` but isn't prominent. | `frontend` | Low | Open |
| — | **Trend sparklines** on KPI cards and checklist items | Mini sparkline showing last 5 cycle values next to each KPI and checklist item that has history. Creates temporal narrative. | `frontend` | Medium | Open |
| — | **Workspace ↔ Actions bidirectional links** | (1) `workspace_ref` on ActionProjection + badge in Actions table, (2) "N actions in progress" badge on workspace header, (3) "Ask about this workspace" CTA on workspace detail (pre-populates chat context), (4) Opportunity Preview rows link to `/app/actions?tab=opportunity&id={x}` | `frontend` | Low | Open |

---

### 3.11B Workspace Lens Enrichment — Checklist-First, Not Findings-First ✅ COMPLETE

| | |
|---|---|
| **Tag** | `frontend` `engine` |
| **Priority** | P1 |
| **Status** | **Fases 1-5 shipped 2026-04-27** — Chargeback Resilience (checklist + trust score), Revenue Intelligence (funnel map + opportunities), Security Posture (checklist), perspective-level enrichment, full i18n (4 languages). CommerceContext KPIs + Product Intelligence deferred until projection layer exposes integration data. |

**Problem:** Every workspace detail page (except Preflight) renders the same generic layout: change summary + findings table + coherence panel. This makes workspaces feel like filtered Analysis views — not enough value to justify dedicated surfaces. Meanwhile, the engine stores rich data (`CommerceContext`, `TrustSurfaceScore`, `opportunities`, `top_products_by_revenue`, inference reasoning, pilar-level aggregations) that never reaches the user.

**Principle:** Preflight already solves this — it renders a `PreflightChecklist` instead of a generic DataTable. The pattern generalizes: each workspace type gets a **domain-specific primary view** above the findings table. The findings table stays as drill-down at the bottom, but stops being the only content.

**Design rules:**
- **If the user hasn't connected an integration, hide the block entirely** — no empty states, no "connect X to see data" CTAs. The workspace renders what it can from crawl data alone. Integration blocks appear silently when data starts flowing.
- **Technology-agnostic** — never reference specific platforms. "Commerce data" not "Shopify data"; "payment provider" not "Stripe." The engine already abstracts this via `CommerceContext` and `IntegrationSnapshot`.
- **No manual inputs** — if it can't be detected automatically (crawl, integration API, pixel), it doesn't appear. No toggles, no self-assessment checklists.
- **Surface stored data** — every field the engine computes and stores must be exposed in the workspace where it's relevant. Dead data = wasted compute.

**Navigation context:**
```
/app/workspaces (Panorama)
  └── /perspective/[slug] (Perspective: Faturamento | Confiança | Comportamento | Copy)
      └── /workspaces/[id] (Workspace Detail) ← enrichment goes here
```

The workspace detail page (`/workspaces/[id]`) already branches on `type === "preflight"`. This wave extends the branching:

```
if (type === "preflight")         → PreflightChecklist (existing)
if (type === "chargeback")        → ChargebackResilience (new)
if (type === "revenue")           → RevenueIntelligence (new)
if (type === "security_posture")  → SecurityPosture (new)
else                              → DataTable (behavioral + fallback)
```

---

#### Fase 1 — Chargeback Resilience workspace

**Where:** `/workspaces/[id]` when `type === "chargeback"` (inside Faturamento perspective)

**Layout:**

```
┌─ HEADER (existing) ───────────────────────────────────┐
│ Chargeback Resilience · [Severity] · [Trend]           │
└─────────────��──────────────────────────────────────────┘
┌─ 60% LEFT ─────────────────────┬─ 40% RIGHT ─────────┐
│                                │                      │
│ RESILIENCE CHECKLIST           │ TRUST SCORE CARD     │
│ (collapsible pillar groups)    │ Grade: B (7/10)      │
│                                │ ████████░░           │
│ ▸ Pre-transaction prevention   │ passing_checks[]     │
│   ✅ / ❌ / ⚠️ per item        │ failing_checks[]     │
│                                │                      │
│ ▸ Transaction security         │ PILAR BREAKDOWN      │
│   ✅ / ❌ per item             │ (bar per pilar)      │
│                                │                      │
│ ▸ Post-transaction metrics     │ DISPUTE RATE GAUGE   │
│   (only if integration data)   │ (only if integ data) │
│                                │                      │
│                                │ COHERENCE (existing) │
│                                │                      │
├────────────────────────────────┴───────────���──────────┤
│ FINDINGS TABLE (existing, below as drill-down)         │
└────────────���───────────────────────────────────────────┘
```

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Resilience Checklist component** | Groups existing chargeback inferences (17 total) into 3 automatic pillars: **Pre-transaction prevention** (refund policy, terms, support contact, product descriptions, subscription disclosure, shipping/delivery policy, cancellation docs), **Transaction security** (3DS presence, fraud screening tool, trust signals on payment pages), **Post-transaction metrics** (dispute rate zone, refund rate health, refund turnaround). Each item derives pass/fail from the inference `conclusion_value` already in `WorkspaceProjection.findings[]`. Items in the post-transaction pillar **only render when `CommerceContext` has integration data** — the pillar itself is hidden otherwise. No manual toggles. | Medium |
| B | **New crawl signals for transaction security** | Detect 3D Secure presence (Cardinal Commerce, Stripe.js 3DS elements, Adyen 3DS2 components, issuer auth redirects) and fraud screening tools (Signifyd, Riskified, ClearSale, Sift, Kount, NoFraud, Stripe Radar) via script/iframe analysis on payment pages. Two new signals: `three_d_secure_detected` and `fraud_screening_tool_detected`. Feed into the checklist's Transaction Security pillar. | Medium |
| C | **Trust Score Card** | Surface the `TrustSurfaceScore` composite (already computed in `MultiPackResult.composites.trust_surface_score`, never rendered). Show grade (A-F), score (0-10), passing_checks[] and failing_checks[] as compact lists. | Low |
| D | **Pilar Breakdown chart** | Small horizontal bar chart showing pass rate per pillar (e.g., Pre-tx: 8/10, Tx security: 1/3, Post-tx: 3/4). Derived from checklist items at render time, no new engine data. | Low |
| E | **Dispute Rate Gauge** | Gauge visualization with zones: green (<0.5%), yellow (0.5–0.65%), orange (0.65–0.9%), red (>0.9% Visa VDMP / >1.0% Mastercard ECM). Shows current rate + "Revenue at risk" amount. **Only renders when `CommerceContext` contains real dispute/refund data from any connected integration.** Hidden entirely otherwise. | Low |

---

#### Fase 2 — Revenue Intelligence workspace

**Where:** `/workspaces/[id]` when `type === "revenue"` (inside Faturamento perspective)

**Layout:**

```
┌─ HEADER (existing) ─────────────���─────────────────────┐
│ Revenue Integrity · [Severity] · [Trend]               │
└───────────────────────────────────��─────────────────��──┘
┌─ COMMERCE KPI STRIP (only if integration data) ───────┐
│ ┌──────────┐ ┌────────��─┐ ┌────────���─┐ ┌──────────┐  │
│ │Cart Aband│ │Repeat    │ │Avg CLV   │ │Refund    │  │
│ │  32.1%   │ │ Rate     │ │  $340    │ │ Rate     │  │
│ │ ↑ 2.3%   │ │  12.4%   │ │ ↑ $12    │ │  4.8%    ��  │
│ └──────────┘ └──────────┘ └──────────┘ └───────��──┘  │
│ (cards appear individually as each field has data)     │
└────────────────────────────────────────────────────────┘
┌─ 60% LEFT ────────────────��────┬─ 40% RIGHT ─────────┐
│                                │                      │
│ FUNNEL INTEGRITY MAP           │ PRODUCT INTELLIGENCE │
│                                │ (only if integ data) │
│ Discovery → Interest →         │                      │
│   Decision → Purchase          │ Top 5 by revenue     │
│ ✅  0    ⚠️ 2   ❌ 3   ⚠️ 1   │ Dead weight: N prods │
│ $0     $1.2k  $4.8k   $800    │ OOS promoted: N      │
│                                │                      │
│                                │ COHERENCE (existing) │
│                                │                      │
├────────────────────────────────┴──────────────���───────┤
│ OPPORTUNITY PREVIEW                                    │
│ • "Reduce checkout friction" $2k-5k/mo · Quick win    │
�� • "Fix abandoned cart flow" $1.5k-3k/mo · Medium      │
│ Potencial combinado: $4k-10k/mo                       │
├────────────────────────────────────���───────────────────┤
│ FINDINGS TABLE (existing, below as drill-down)         │
└──────��────────────────────────────────��────────────────┘
```

| # | Part | Description | Effort |
|---|------|-------------|--------|
| F | **Commerce KPI Strip** | Horizontal row of metric cards sourced from `CommerceContext`. Each card renders **only if its field is non-null**: `abandonment_rate` + `abandonment_value_monthly`, `repeat_purchase_rate`, `avg_customer_lifetime_value`, `refund_rate`, `discount_usage_rate`, `payment_gateway_concentration`. For SaaS: `mrr`, `subscriber_churn_rate`, `failed_payment_rate`. Each card shows current value + delta vs previous cycle (from `CycleDelta` data). **The entire strip is hidden if no integration data exists** — no empty cards. | Medium |
| G | **Funnel Integrity Map** | Horizontal flow visualization: Discovery → Interest → Decision → Purchase → Post-purchase. Each stage shows: finding count affecting that stage + aggregate impact $. Stage classification uses the existing page funnel classification from `FindingProjection.surface` URL patterns (commercial_entry, commercial_path, checkout, post_purchase). Always visible — works from crawl data alone. | Medium |
| H | **Product Intelligence panel** | Three data sections, each hidden independently if data absent: (1) **Top products by revenue** — `CommerceContext.top_products_by_revenue` as ranked mini-table, (2) **Dead weight** — `products_never_sold_30d` count + % of `total_products`, (3) **Out of stock promoted** — `out_of_stock_promoted_count` (requires 3.7.2-I bug fix). Panel hidden entirely if all three sections lack data. | Low |
| I | **Opportunity Preview** | Top 3-5 opportunities from `MultiPackResult.opportunities` filtered by revenue-related inference keys. Each shows `uplift_hypothesis` + `value_case.range` + `effort_hint`. Combined potential total at bottom. Links to Actions page Opportunities tab. **Hidden if no opportunities exist.** | Low |

---

#### Fase 3 — Security Posture workspace

**Where:** `/workspaces/[id]` when `type === "security_posture"` (inside Confiança perspective)

| # | Part | Description | Effort |
|---|------|-------------|--------|
| J | **Security Checklist component** | Same pattern as Chargeback Resilience Checklist but for security domain. Groups the 12 cybersecurity pack findings into pillars: **Transport security** (HTTPS everywhere, HSTS, mixed content), **Response security** (security headers, clickjack protection, CORS), **Application security** (SRI on scripts, sensitive endpoints, cookie security, rate limiting, predictable URLs, error page information disclosure). Each item derives pass/fail from the existing cybersecurity inference in `WorkspaceProjection.findings[]`. | Medium |
| K | **Trust Score integration** | Same `TrustSurfaceScore` card from Fase 1C, but here filtered to show only the security-relevant checks (not the policy/support checks that appear in the chargeback workspace). Avoids duplication — each workspace shows the subset of the trust score relevant to its domain. | Low |

---

#### Fase 4 — Perspective-level enrichment (light)

**Where:** `/perspective/[slug]` pages — these aggregate all workspaces within a perspective. Light enrichment only — the heavy content lives at the workspace detail level.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| L | **Faturamento: KPI strip** | Same Commerce KPI Strip component from Fase 2F, rendered at the perspective level with data aggregated across all revenue workspaces. Appears between the Pulse Summary and the Findings Table. Hidden if no integration data. | Low (reuse) |
| M | **Faturamento: Opportunity Preview** | Same component from Fase 2I but showing top 5 opportunities across all revenue + chargeback workspaces. | Low (reuse) |
| N | **Confiança: Trust Score hero** | Large Trust Score card (grade A-F + score + top 3 failing checks) as a hero element between Pulse Summary and findings. Always visible since it's derived from crawl data. | Low (reuse) |

---

#### Fase 5 — i18n

| # | Part | Description | Effort |
|---|------|-------------|--------|
| O | **Dictionary keys (4 languages)** | ~40-50 new keys across en/pt-BR/es/de: checklist pillar names, checklist item labels, KPI card labels, funnel stage names, product intelligence labels, opportunity preview labels, gauge zone labels, trust score labels. `console.workspaces.chargeback.*`, `console.workspaces.revenue.*`, `console.workspaces.security.*`. pt-BR with real translation; es/de fallback to en. | Low |

---

#### Data flow: what's already stored vs what's new

| Data | Source | Already computed? | Currently surfaced? | Surfaced in |
|---|---|---|---|---|
| Trust Surface Score (grade, passing/failing checks) | `MultiPackResult.composites.trust_surface_score` | ✅ Yes | ❌ Never rendered | Fase 1C, 3K, 4N |
| 17 chargeback inferences with reasoning | `WorkspaceProjection.findings[]` | ✅ Yes | ⚠️ Only as flat finding rows | Fase 1A (regrouped as checklist) |
| 12 cybersecurity findings | `WorkspaceProjection.findings[]` | ✅ Yes | ⚠�� Only as flat finding rows | Fase 3J (regrouped as checklist) |
| CommerceContext KPIs (abandonment, CLV, repeat, refund, discount, gateway) | `CommerceContext` via `reconcileIntegrations()` | ✅ Yes | ❌ Never rendered in UI | Fase 2F, 4L |
| Top products by revenue | `CommerceContext.top_products_by_revenue` | ✅ Yes | ❌ Never rendered | Fase 2H |
| Dead weight products count | `CommerceContext.products_never_sold_30d` | ✅ Yes | ⚠️ Only as finding text | Fase 2H |
| Opportunities with uplift hypothesis | `MultiPackResult.opportunities` | ✅ Yes | ❌ Never rendered | Fase 2I, 4M |
| Dispute/refund rate from integrations | `CommerceContext` | ✅ Yes | ⚠️ Only as finding text | Fase 1E |
| Page funnel classification | `FindingProjection.surface` + URL patterns | ✅ Yes | ❌ Not grouped by stage | Fase 2G |
| 3DS / fraud tool presence | New signals | ❌ New | — | Fase 1B |

**New engine work:** Only Fase 1B (2 new crawl signals). Everything else is frontend reorganization of existing data.

**Total estimate:** ~35-40h (~4-5 days). Fase 1 (Chargeback) and Fase 2 (Revenue) are independent and can run in parallel. Fase 3 (Security) follows the same checklist pattern. Fase 4 (Perspective) reuses components. Fase 5 (i18n) is a sweep at the end.

**Files touched:** [src/app/app/workspaces/[id]/page.tsx](../src/app/app/workspaces/[id]/page.tsx) (branching logic), new components in [src/components/console/](../src/components/console/) (`ChargebackResilience.tsx`, `RevenueIntelligence.tsx`, `SecurityPosture.tsx`, `ResilienceChecklist.tsx`, `CommerceKpiStrip.tsx`, `FunnelIntegrityMap.tsx`, `ProductIntelligence.tsx`, `OpportunityPreview.tsx`, `TrustScoreCard.tsx`, `DisputeRateGauge.tsx`), [src/app/app/workspaces/perspective/[slug]/page.tsx](../src/app/app/workspaces/perspective/[slug]/page.tsx) (perspective enrichment), [workers/ingestion/enrichment/](../workers/ingestion/enrichment/) (3DS + fraud tool detection), [packages/signals/engine.ts](../packages/signals/engine.ts) (2 new signals), dictionary files.

---

### 3.12 Opportunity-First Actions — Unified Impact-Ranked Pipeline ✅ COMPLETE

| | |
|---|---|
| **Tag** | `frontend` `engine` `platform` |
| **Priority** | P1 |
| **Status** | **✅ Fully shipped 2026-04-27 — all 6 fases complete.** Engine: `ActionProjection` enriched with 5 new fields (uplift_hypothesis, upside_score, value_case_basis, cluster_key, cluster_count), opportunity data resolved from `MultiPackResult.opportunities` + cluster data from `opportunity_compression`, auto-verify on improvement (change_class === 'improvement' + status === 'implemented' → 'verified'). Frontend: 6 tabs → 2 tabs (Pipeline/My Actions) + filter bar (type/severity/effort/status), unified summary cards (Total Exposure, Quick Wins, In Progress, Captured), type+upside badges, hypothesis inline + emerald drawer card, ScatterPlot SVG (effort × impact, 4 quadrants, red/emerald dots). Platform: `OpportunityTracking` Prisma model, `PATCH /api/actions/[id]/status` endpoint with transition validation. i18n: 4 languages. |

**Design revision (2026-04-24):** Tabs split "what to fix" from "what to gain" as if they're different decisions. They're not — the user always asks "where do I invest time for max return?" A **single unified list ranked by $ impact** answers this directly. Incidents (loss) and opportunities (gain) are both actions with a dollar value; the type becomes a visual badge (red vs emerald) on the same row, not a tab switch. This eliminates the tab overhead, prevents the user from missing high-value opportunities buried in a secondary tab, and lets the scatter plot work across both types.

**Goal:** Remove the Opportunities tab. Enrich the single Actions list with opportunity data so incidents and opportunities live side by side, **ranked by impact**. The user sees "Fix checkout CSP ($2.4k/mo)" next to "Add social proof to pricing page (+$1.8k/mo)" in one prioritized view. No new page, no new sidenav entry — same Actions surface, enriched.

**Context:** The engine already produces rich `Opportunity` objects via `generateOpportunities()` in [packages/decision/opportunity-gate.ts](../packages/decision/opportunity-gate.ts) — with `uplift_hypothesis`, `raw_upside_score`, `value_case`, `effort_hint`, full lifecycle, and `OpportunityCompressionResult` clusters grouped by root cause. This data doesn't reach `ActionProjection` yet.

**Design decisions:**
- **No tabs.** Single list, sorted by `impact.midpoint` descending. Type badge differentiates.
- **No kanban.** Status progression via action buttons (Aceitar / Iniciar / Verificar) in the drawer.
- **Scatter plot works for both types.** Incidents plot as "cost of inaction", opportunities as "gain from action". Same axes (effort × $), different colors.

#### Fase 1 — Enrich ActionProjection with opportunity data

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **New fields on ActionProjection** | Add to [packages/projections/types.ts](../packages/projections/types.ts): `uplift_hypothesis: string \| null`, `upside_score: number \| null`, `value_case_basis: 'data_driven' \| 'heuristic' \| 'mixed' \| null`, `cluster_key: string \| null`, `cluster_count: number \| null`. | Low |
| B | **Wire in projection engine** | In [packages/projections/engine.ts](../packages/projections/engine.ts), resolve new fields from `MultiPackResult.opportunities` and `composites.opportunity_compression` during `projectActions()`. | Medium |

#### Fase 2 — Unified summary cards

| # | Part | Description | Effort |
|---|------|-------------|--------|
| C | **Impact-aware hero cards** | Replace tab-specific cards with unified cards that combine both types: (1) **Total Exposure** — sum of incident losses + opportunity potential, (2) **Captured** — verified opportunities + resolved incidents, (3) **In Progress** — accepted + implemented, (4) **Quick Wins** — count of low-effort, high-impact items (both types). Dual-tone: red portion for losses, emerald for opportunities. | Medium |

#### Fase 3 — Visual differentiation in unified list

| # | Part | Description | Effort |
|---|------|-------------|--------|
| D | **Type badge + hypothesis inline** | Each row gets a small badge: `incident` (red) or `opportunity` (emerald). For opportunity rows, `uplift_hypothesis` renders as a second line in zinc-500. In the drawer, hypothesis gets a dedicated emerald card before Impact Breakdown. Remove the Opportunities tab — the filter bar gets a type filter dropdown instead (All / Incidents / Opportunities). | Medium |
| E | **Cluster grouping (optional view)** | Collapsible root-cause clusters in a toggle view. Groups actions by `cluster_key`, header shows root cause + combined impact + "Accept cluster" button. Flat list is default; cluster view is a toggle. | Medium |

#### Fase 4 — Status workflow

| # | Part | Description | Effort |
|---|------|-------------|--------|
| F | **Opportunity status transitions** | Status-aware buttons for opportunity actions: identified → "Accept" + "Discard"; accepted → "Start" + "Back"; implemented → "Verify"; verified → "Reopen". | Medium |
| G | **Status persistence** | New `PATCH /api/actions/[id]/status` endpoint. New `OpportunityTracking` Prisma model. Projection engine reads persisted status on next cycle. | Medium |
| H | **Auto-verify on improvement** | When a finding linked to an `implemented` opportunity improves, auto-advance to `verified`. Feeds into Money Recovered widget. | Low |

#### Fase 5 — Effort × Impact scatter

| # | Part | Description | Effort |
|---|------|-------------|--------|
| I | **Scatter plot view toggle** | List/scatter toggle. Both incidents and opportunities plotted: x = effort, y = $ impact. Incidents in red, opportunities in emerald, colored by status. Quadrants: "Quick wins", "Big bets", "Fill-ins", "Strategic". SVG, no charting library. | Medium |

#### Fase 6 — i18n

| # | Part | Description | Effort |
|---|------|-------------|--------|
| J | **Dictionary keys (4 languages)** | ~25 new keys in `console.actions` namespace: type badges, hypothesis label, scatter quadrants, status buttons, cluster headers. | Low |

**Total estimate:** ~18h (~2.5 days). Simplified from 22h by removing tab-switching logic and tab-specific card branches.

**Visual language constraint:** Same component library, color tokens, font sizes, spacing. Opportunities are a **mode** of the same list, not a separate surface.

**Files touched:** [packages/projections/types.ts](../packages/projections/types.ts), [packages/projections/engine.ts](../packages/projections/engine.ts), [src/app/app/actions/page.tsx](../src/app/app/actions/page.tsx), [src/app/api/actions/[id]/status/route.ts](../src/app/api/actions/) (new), [prisma/schema.prisma](../prisma/schema.prisma) (`OpportunityTracking`), [dictionary/*.json](../dictionary/).

---

### 3.13 Re-engagement & Remediation — Closing the Loop ✅ COMPLETE

| | |
|---|---|
| **Tag** | `platform` `frontend` `engine` `mcp` |
| **Priority** | P1 |
| **Status** | **✅ Fully shipped 2026-04-27.** Fase 1: dashboard as default landing, CrossSignalHero widget as hero. Fase 2: daily digest email via Brevo cron (24h interval, leader-elected, narrative HTML+text). Fase 3: `generateRemediationPrompt()` template generator, `POST /api/actions/remediation-prompt` endpoint (tool-aware: Claude/Codex/Cursor/Windsurf/Lovable), FixWithAiSection extracted as shared component in `src/components/console/actions/FixWithAiSection.tsx`, wired in both ActionDrawerContent and FindingDetailPanel (multi-action picker for findings with multiple linked actions). Fase 4: i18n complete (17 keys × 4 langs in `console.actions.fix_with_ai` namespace). |

**Problem:** Vestigio finds problems but has (1) **zero proactive mechanisms** to bring users back and (2) **no bridge from finding to fix**. Users must manually translate Vestigio's findings into code changes. In the vibecoding era, every user has access to AI coding tools (Cursor, Claude Code, Replit, Lovable, Codex) — Vestigio should generate the prompt that those tools need to implement the fix. The finding→fix loop is: Vestigio detects → user reviews → copies prompt → AI codes the fix → Vestigio verifies.

**Competitive gap:**

| Mechanic | Competitors | Vestigio |
|---|---|---|
| Score/health metric | All have it | ⚠️ Exists on secondary dashboard |
| Email digests | ContentKing, Semrush, Baremetrics, Contentsquare | ❌ Zero |
| Cross-domain narrative | ❌ Nobody does this | ⚠️ Pack insights in copilot (3.14), not yet in dashboard/digest |
| AI-generated fix prompts | ❌ Nobody does this | ❌ Not yet — massive differentiator |

**Design rules:**
- Same rules as 3.11B: hide when no data, technology-agnostic, no manual inputs.
- Digests tell a **narrative**, not dump metrics. "Your checkout trust improved and abandonment dropped 8%" not "12 findings, 3 resolved."
- Cross-signal is the hero — it's the unique differentiator, not a hidden section.
- Remediation playbooks are technology-aware but tool-agnostic (work in any AI coding tool).

#### Fase 1 — Dashboard as Daily Briefing + Cross-Signal Hero

No new pages. The dashboard becomes the landing and the cycle summary lives here.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Default landing = Dashboard** | Change redirect from `/app/actions` to `/app/dashboard`. Reorder widgets: **Cross-Signal Insights** as hero (top, full width) when cross-domain correlations exist, **What Changed** as secondary hero, Health Score + Money Recovered row, Streak + Activity row. "See all actions →" CTA for task-oriented users. | Medium |
| B | **"Since you were last here" mode** | If user hasn't visited in >24h, dashboard hero switches to "since your last visit" — aggregates all cycle changes while away. Uses `lastAccessedAt` (already tracked via `env-activity.ts`). | Medium |
| C | **Cross-Signal Insights hero widget** | Dedicated widget showing causal chains across perspectives. For each finding that correlates across 2+ packs (same surface URL, same cycle), render horizontal flow: `[Security] CSP missing → [Trust] Buyer hesitation ↑ → [Revenue] Conversion ↓ $2.1k/mo`. Correlation: group findings by `surface` across different `pack` values. This is the visual anchor for Vestigio's moat. | Medium |
| D | **Cross-signal in Pulse Summary prompt** | Upgrade Haiku prompt for Pulse Summary to include findings from ALL perspectives. When findings correlate across domains, the narrative connects them: "Checkout page load time degraded (Security) which correlates with 12% abandonment increase (Revenue) and 3 rage-click sessions (Behavioral)." Engine data already exists; prompt engineering change only. | Low |

#### Fase 2 — Email Digest

| # | Part | Description | Effort |
|---|------|-------------|--------|
| E | **Digest email (daily/weekly configurable)** | After each cycle (or daily/weekly), send narrative digest via Brevo (already configured). Content: cross-signal highlights (if any) as the hero, health score + delta, top 3 changes, money recovered, streak, deep-link to dashboard. Toggle in `/api/user/notification-prefs` (route exists, `emailEnabled` toggle exists but sends nothing). Template: plain text with key metrics. | Medium |
| F | **Digest preferences UI** | Settings page section: frequency (per-cycle / daily / weekly), channels (email on/off). Stored on User model. | Low |

#### Fase 3 — Remediation Execution Playbooks (Vibecoding Bridge)

The bridge from "finding" to "fix". Each action's SideDrawer gets a "Fix with AI" section that generates a context-rich prompt the user can copy into any AI coding tool.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| G | **Playbook prompt generator** | Server function that takes an ActionProjection + its linked findings + detected tech stack (from TechnologyDetection) and generates a structured remediation prompt. Includes: problem context (finding title, severity, impact, evidence), detected framework/platform, step-by-step remediation from the finding's `remediation` field, success criteria, verification instructions. Output is a copy-ready string. ~200 lines. | Medium |
| H | **"Fix with AI" panel in Action SideDrawer** | New section in the Action detail SideDrawer (below remediation steps). Shows: generated prompt preview (collapsible), "Copy prompt" button, tool suggestions (Cursor, Claude Code, Replit, Lovable — icons only, no hard dependency). Tracks `copy_remediation_prompt` in product telemetry (3.16). | Medium |
| I | **"Fix with AI" in FindingDetailPanel** | Same CTA in FindingDetailPanel for findings that have linked actions. Button: "Generate fix prompt" → expands inline with the prompt + copy button. If no linked action, shows "Create action first" nudge. | Low |
| J | **Technology-aware prompt templates** | Prompt templates adapt based on detected tech: Next.js/React (component-level fix), Shopify/Liquid (theme edit), WordPress/PHP (plugin/theme), static HTML, generic. Detection data already exists in `TechnologyDetection` model. Templates are stored as string templates with `{{placeholders}}`, not LLM-generated (zero token cost). | Medium |

#### Fase 4 — i18n

| # | Part | Description | Effort |
|---|------|-------------|--------|
| K | **Dictionary keys** | ~40 keys across en/pt-BR/es/de: dashboard hero labels, cross-signal templates, digest email strings, remediation playbook labels, "Fix with AI" UI strings. | Low |

**Total estimate:** ~35-40h (~4-5 days). Fase 1 (dashboard + cross-signal hero) is the highest-impact change. Fase 3 (remediation playbooks) is the most differentiated feature.

**Infrastructure already in place:** Brevo API configured, `emailEnabled` toggle on User, `lastAccessedAt` tracking on Environment, CycleProgressBanner SSE stream, Dashboard page with all widgets, `change_summary` on every WorkspaceProjection, Pulse Summary API with Haiku, TechnologyDetection model, ActionProjection with linked findings, FindingDetailPanel with CTA slots, product telemetry (3.16).

---

### 3.14 Vestigio Pulse AI — Transversal Copilot ✅ COMPLETE

| | |
|---|---|
| **Tag** | `frontend` `mcp` `platform` |
| **Priority** | P0 |
| **Status** | **✅ Shipped 2026-04-22.** CopilotProvider (global context, conversation persistence, SSE streaming, budget tracking), CopilotPanel (full-height floating panel, playbooks grid, minimize/expand/close, model selector), CopilotFab (animated color orb, spring animation, Pro badge for Starter, unread indicator), SideDrawer coexistence (auto-minimize on drawer open), ChatInputBar with animated cycling placeholders, budget exhausted card, cross-domain pack insight bubbles during streaming, pack-aware ThinkingIndicator, voice message bubble, page context injection via usePathname, chat removed from sidenav. i18n (4 langs). |

**Problem:** Chat is a full-page route (`/app/chat`) with zero page awareness. Every "Discuss Finding" CTA forces a page navigation, losing the user's visual context. Users must leave what they're looking at to ask a question about it. This is the single biggest friction point in the product — it breaks every task that requires insight + action in the same flow.

**Solution:** Transform the chat from a dedicated page into a **floating copilot panel** available on every page, inspired by embedded AI assistant patterns (minimizable card, bottom-right, page-context-aware). The existing `/app/chat` route stays as a full-screen fallback for long conversations.

**Technical feasibility (confirmed via codebase audit):** Chat code is modular — SSE streaming, context hydration, conversation persistence, verification flow, rich cards (FindingCard, ActionCard, KbArticleCard, CreateActionCard, ToolCallStep), playbooks all work independently of the full-page layout. `SideDrawer` component already proves the overlay pattern. Pulse Summary proves LLM works embedded in pages. Refactor is extraction, not rewrite.

#### Copilot UX Design

**Visual: floating card panel (bottom-right)**

```
┌─ APP PAGE (any) ──────────────────────────────────────┐
│                                                        │
│  [Page content: workspaces, actions, analysis, etc.]  │
│                                                        │
│                                                        │
│  ┌─ SideDrawer (finding detail) ──────┐               │
│  │ Opens from RIGHT edge, full height │               │
│  │ z-index: 50                        │               │
│  └────────────────────────────────────┘               │
│                                                        │
│                           ┌─ COPILOT PANEL ──────────┐│
│                           │ z-index: 40              ││
│                           │ 420px wide, ~600px tall   ││
│                           │ bottom-right, floating    ││
│                           │ rounded-xl, shadow-2xl    ││
│                           │                          ││
│                           │ [Messages scroll area]   ││
│                           │                          ││
│                           │ [Quick actions / badges] ││
│                           │ [Input bar + controls]   ││
│                           └──────────────────────────┘│
│                                              [💬 FAB] │
└────────────────────────────────────────────────────────┘
```

**Coexistence with SideDrawer:**
- Copilot panel: `fixed bottom-4 right-4 z-40` — floating card, NOT full-height
- SideDrawer: `fixed inset-y-0 right-0 z-50` — full-height overlay, higher z-index
- When SideDrawer opens → copilot auto-minimizes to FAB (avoids visual collision)
- When SideDrawer closes → copilot restores previous state (expanded/minimized)
- FAB (floating action button) always visible at `bottom-4 right-4 z-30` when minimized
- Finding drawer has "Ask Vestigio about this" button → opens copilot with finding context pre-loaded

**Three states:**

| State | Visual | Trigger |
|---|---|---|
| **Minimized** | FAB button only (emerald circle, sparkle icon, unread badge) | Click X on panel, SideDrawer opens, default on page load |
| **Expanded (empty)** | Card with welcome message + quick action badges + input bar | Click FAB when no active conversation |
| **Expanded (conversation)** | Card with message thread + context chips + input bar | Click FAB when conversation active, or trigger from page CTA |

**Quick action badges (replace playbooks drawer):**

Contextual per page — copilot knows which page the user is on via `usePathname()`:

| Page | Quick Actions |
|---|---|
| Workspaces (any) | "What changed?", "Revenue audit", "Trust check", "Explain this workspace" |
| Actions | "What should I fix first?", "Explain this action", "Verify finding" |
| Analysis | "Analyze selected", "Cross-signal check", "Summarize findings" |
| Inventory | "Audit this page", "Why is this page down?" |
| Dashboard | "Executive summary", "What improved?", "Where am I losing money?" |

Badges use the same pattern as the reference UI: `Badge variant="secondary"` with colored icons. Clicking a badge sends the prompt with current page context.

#### Implementation

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **CopilotProvider (global context)** | React Context at app layout level. State: `isOpen`, `isMinimized`, `conversationId`, `messages[]`, `contextItems[]`, `pageContext { pathname, selectedFindings?, visibleWorkspace? }`. Persists `conversationId` in localStorage. Auto-injects `pageContext` via `usePathname()`. Exposes `useCopilot()` hook for any component to open/send/attach context. | Medium |
| B | **CopilotPanel component** | Floating card component: `fixed bottom-4 right-4 w-[420px] max-h-[min(600px,80vh)]`. Three sections: header (minimize/close/conversation selector), messages scroll area (reuses existing `ChatMessageRenderer` + all rich cards), input bar (textarea + model selector + attach + shortcuts). CSS: `rounded-xl shadow-2xl border bg-card`. Animation: slide-up from bottom on expand, slide-down on minimize. | High |
| C | **FAB (floating action button)** | `fixed bottom-4 right-4 z-30`. Emerald circle with sparkle icon. Unread count badge when copilot has unread responses. Pulse animation on new message. Click → toggles panel. Long-press or right-click → "Open full chat" (navigates to `/app/chat`). | Low |
| D | **Page context injection** | `usePathname()` + `useMcpData()` to detect: current page, visible workspace (if on workspace detail), selected findings (if on analysis with selection), current action (if drawer open). Auto-attached to system prompt: "User is currently viewing [page] with [context]." Updates on navigation without interrupting conversation. | Medium |
| E | **SideDrawer coexistence** | Listen for SideDrawer open/close state (new `useSideDrawer()` context or event). On SideDrawer open → auto-minimize copilot to FAB. On SideDrawer close → restore. SideDrawer finding detail gets new "Ask Vestigio" button → calls `copilot.open({ finding: currentFinding })`. | Low |
| F | **Quick action badges** | Per-page badge configuration mapping `pathname` patterns to action arrays. Each action: `{ icon, label, prompt, color }`. Click → `copilot.send(prompt)` with current page context. Renders in the empty state (before first message) and as a collapsible strip above input bar (during conversation). Replaces the current PlaybooksDrawer in the full chat page too. | Medium |
| G | **Conversation continuity** | Conversation persists across page navigation. User asks on workspaces, navigates to actions → copilot still shows the thread. `conversationId` in CopilotProvider. "New conversation" button in panel header. Conversation list accessible via dropdown (last 5) or "See all" → `/app/chat`. | Medium |
| H | **Verification flow in copilot** | VerificationPlanIsland works inside the copilot panel with no changes (it's a self-contained component). "Create Action" CTA at terminal state works the same. The compact panel height means the plan island scrolls within the message area. | Low |
| I | **Full-screen escape hatch** | "Expand" button in panel header → navigates to `/app/chat?conversation={id}` with full-screen layout. For long conversations, complex playbooks, or when user wants more space. The `/app/chat` route continues to exist but is demoted from sidebar primary nav to a secondary access point. | Low |
| J | **Sidebar nav update** | Set `ai_chat_enabled = false` in platform config — the feature flag already conditionally hides Chat from sidebar. The copilot FAB replaces the sidebar entry as the primary AI access point. `/app/chat` stays as full-screen fallback accessible via copilot "See all conversations" dropdown. Sidebar goes from 7 to 6 items. See 3.20 sidebar evolution plan for the full navigation strategy. | Low |
| K | **i18n** | ~20 new keys: welcome message, quick action labels per page, FAB tooltip, panel header labels, "Ask Vestigio" button label. | Low |

**Total estimate:** ~3-4 weeks. Item B (panel component) is the bulk — extracting chat rendering into a constrained card layout. Items A, D, F are the differentiating logic. The rest is wiring.

**Migration path:** Ship copilot alongside existing `/app/chat`. Both work. Measure adoption via 3.16 telemetry. When copilot usage exceeds chat page usage, demote chat from sidebar.

**Files touched:** New: `src/components/app/CopilotProvider.tsx`, `src/components/app/CopilotPanel.tsx`, `src/components/app/CopilotFab.tsx`, `src/components/app/CopilotQuickActions.tsx`. Modified: `src/app/app/layout.tsx` (mount CopilotProvider + Panel), `src/components/app/sidebar-nav-data.ts` (demote Chat), `src/components/console/SideDrawer.tsx` (emit open/close events), all page-level finding drawers (add "Ask Vestigio" CTA).

---

### 3.15 Cross-Signal Surface — Making the Moat Visible ✅ COMPLETE

| | |
|---|---|
| **Tag** | `engine` `frontend` |
| **Priority** | P1 |
| **Status** | **✅ Shipped 2026-04-27.** Dedicated `/app/cross-signals` page with CrossSignalsShell (hero stats: total chains, combined impact, perspectives involved; filters by perspective/temporal pattern; expandable chain cards). `GET /api/cross-signals` endpoint. CrossSignalChainCard component with link flow visualization, narrative text, temporal badge (sequential/simultaneous), expandable detail. Aggregator refactored with shared `buildCrossSignalChains()` helper, temporal pattern detection via cycleId comparison, `computeAllCrossSignals()` export. Template-based narrative generator (`cross-signal-narrative.ts`). CrossSignalHero dashboard widget enhanced with temporal patterns + narratives. Sidebar nav entry under Analysis group. Mock data for demo. i18n (4 languages). **Deferred:** Analysis page `?chain=` pre-filter (when clicking from Cross-Signals page). |

**Problem:** Vestigio's unique competitive advantage — correlating technical + behavioral + revenue + security signals into a single view — is invisible to users. Each perspective is a silo. The engine computes composites (blast radius, opportunity compression) that span perspectives, but the UI never shows the cross-domain story. No competitor (ContentKing, Hotjar, Semrush, Baremetrics, Contentsquare) correlates across these domains. This is the moat, and it's hidden.

**Solution:** Create a first-class "Cross-Signal Insights" surface that appears wherever findings from different perspectives share the same affected URL or temporal correlation.

#### Implementation

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Cross-signal detection engine** | New function `detectCrossSignalCorrelations(findings: FindingProjection[]): CrossSignalChain[]`. Groups findings by `surface` URL, then checks if findings span 2+ perspectives. For each group, builds a causal chain: `[Security finding] → [Behavioral finding] → [Revenue finding]`. Orders chain by causal priority (infrastructure → behavior → revenue). Also detects temporal correlations: findings that appeared in the same cycle with `change_class: 'new_issue'` or `'regression'` across perspectives. Returns structured chains with `{ trigger, consequences[], affected_surface, combined_impact, perspectives_involved[] }`. | Medium |
| B | **Cross-Signal Insights block (Panorama)** | New component between Pulse Summary and Perspective Cards on `/app/workspaces`. Renders each `CrossSignalChain` as a horizontal flow: `[Icon+Badge] "Checkout trust degraded" → [Icon+Badge] "Bounce rate +12%" → [Icon+Badge] "3 abandoned carts"`. Each chain has: combined impact estimate, affected URL, "Ask Vestigio" CTA (opens copilot with full chain context), "See findings" CTA (navigates to Analysis pre-filtered). Hidden when no cross-signal correlations exist. | Medium |
| C | **Cross-signal in Pulse Summary prompt** | Upgrade the Haiku system prompt to receive `CrossSignalChain[]` alongside findings. When chains exist, Pulse Summary explicitly narrates the correlation: "Your checkout page shows a connected pattern: [security issue] is likely causing [behavioral issue] which is costing [revenue amount]." This makes the AI briefing uniquely valuable vs competitors. | Low |
| D | **Cross-signal in Cycle Summary** | In 3.13A Cycle Summary page, dedicated "Cross-Signal Insights" section showing chains that appeared or worsened this cycle. Timeline format: "This cycle, 2 cross-signal patterns detected." | Low |
| E | **Cross-signal in Copilot** | When user asks about a finding that's part of a cross-signal chain, copilot auto-mentions: "This finding is connected to [N] other findings across [perspectives]. [Brief explanation]." Context injection in 3.14D includes chain data. | Low |

**Total estimate:** ~1-2 weeks. Item A (detection engine) is the core logic. The UI components (B-E) are lightweight — they consume the chains and render them.

---

### 3.16 Product Telemetry — Measure Before You Change ✅ COMPLETE

| | |
|---|---|
| **Tag** | `platform` |
| **Priority** | P1 |
| **Status** | **✅ Shipped 2026-04-21.** ProductEvent Prisma model (userId, orgId, environmentId, event, properties, pathname, sessionId, indexed on orgId+event+createdAt), useProductTrack() hook (auto-includes context, debounced fire-and-forget POST), page view tracking via usePathname, feature adoption flags, engagement score computed daily per environment (weighted: copilot_sends 0.3, actions_created 0.3, workspace_drills 0.15, verifications_run 0.15, page_views 0.1), 90-day auto-prune cron in instrumentation-node.ts, admin product-analytics page. `prisma db push` applied to prod. |

**Problem:** Vestigio has solid marketing analytics (custom-built funnel, UTM, A/B testing) but **zero product-level engagement tracking**. Can't tell which console pages users visit, which features they adopt, when they're at risk of churning (only detects after 14 days of absence), or whether changes like workspace enrichment actually drive engagement. Flying blind on product decisions.

**Existing infra:** `TrackingScript` + `PageView`/`MarketingEvent` models for marketing site. `McpSession`/`McpPromptEvent`/`PlaybookRun` for chat usage. `Usage` table for cycle/compute metering. `lastAccessedAt` on Environment. All self-hosted, no third-party analytics.

**Solution:** Lightweight product event tracking using the same self-hosted philosophy. No third-party tools.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **ProductEvent Prisma model** | `{ id, userId, orgId, environmentId, event, properties: Json, pathname, sessionId, createdAt }`. Index on `(orgId, event, createdAt)` for efficient rollups. Retention: 90 days (auto-prune via cron). | Low |
| B | **useProductTrack() hook** | Client-side hook: `useProductTrack()` returns `track(event, properties?)`. Auto-includes: userId, orgId, pathname, sessionId (generated once per tab). Debounced write to `POST /api/product-events` (fire-and-forget, never blocks UI). Events: `page_view`, `feature_first_use`, `copilot_open`, `copilot_send`, `workspace_drill`, `finding_action`, `drawer_open`, `upgrade_surface_view`, `playbook_run`. | Medium |
| C | **Page view tracking** | `usePathname()` hook in app layout fires `page_view` on navigation. Properties: `{ from, to, time_on_previous_page }`. Enables: "which pages do users visit?", "what's the most common flow?", "where do they drop off?" | Low |
| D | **Feature adoption flags** | On User model: `firstChatAt`, `firstActionAt`, `firstVerifyAt`, `firstWorkspaceDrillAt`. Set once on first use via `track('feature_first_use', { feature })`. Enables: "time from signup to first chat", "% of users who ever opened workspaces", activation funnel analysis. | Low |
| E | **Engagement score** | Computed daily per environment: weighted sum of page_views (0.1), copilot_sends (0.3), actions_created (0.3), workspace_drills (0.15), verifications_run (0.15). Stored on Environment model as `engagementScore` (0-100). Enables: at-risk detection BEFORE 14-day pause, cohort analysis, impact measurement. | Medium |
| F | **Admin product analytics dashboard** | New tab in admin: page view heatmap, feature adoption funnel (signup → first audit → first finding view → first chat → first action), engagement score distribution, at-risk users (score < 20 for 7+ days), top pages by time-spent. | Medium |

**Total estimate:** ~1 week. A-D are the foundation (~3 days). E-F are the analysis layer (~2 days).

**Privacy:** Same approach as marketing analytics — no PII in events, org-scoped, self-hosted, auto-pruned. Respects existing notification preferences.

---

### 3.17 Upgrade & Feedback Moments — Monetize & Measure ✅ COMPLETE

> **See also:** 3.18 (First-Audit Experience) and 3.19 (Cancel Flow & Save Offers) below.

| | |
|---|---|
| **Tag** | `frontend` `platform` |
| **Priority** | P2 |
| **Status** | **✅ Shipped 2026-04-27.** Scope expanded beyond original spec to include feedback moments alongside upgrade moments. **Upgrade moments:** PlanProvider + usePlan() hook (Starter/Pro/Max), UpgradeNudge component (3 variants: inline, badge, blurred-overlay), copilot Pro pill badge for Starter, copilot upgrade nudge in empty state, WhatChangedCard cadence nudge ("Upgrade to Pro for daily insights"), CrossSignalHero chain limiting (Starter: 1 chain + "N more"), AdSpendKpi blurred preview overlay. **Feedback moments:** FeedbackMoment component (2 variants: rating 5-star, NPS 0-10), useFeedbackMoment hook with 3-layer cooldown (48h per-trigger, session global, 3-dismiss suppression), NpsPulse 14-day pulse at bottom-left, copilot feedback after 3 messages, FindingDetailPanel 10s dwell timer, `/api/feedback` extended with "contextual" + "nps" types + 0-10 rating range. i18n (4 languages). |

**Problem:** Workspace enrichment (3.11B) creates rich surfaces with KPIs, checklists, and funnels. Some data requires integrations (Pro+ feature). The copilot (3.14) creates AI interactions (Pro+ feature with MCP budget). But there are **zero upgrade prompts in workspaces** — upgrade pressure only exists in chat budget bar, seat limits, and billing page. The value the user sees in workspaces never converts to upgrade intent.

**Solution:** Contextual, non-intrusive upgrade moments where enriched workspace data would appear but requires a higher tier.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Integration-gated workspace blocks** | When a workspace block (e.g., Commerce KPI Strip, Dispute Rate Gauge, Product Intelligence) would render but has no data because no integration is connected, show a subtle placeholder: blurred preview of what the block looks like with sample data + "Unlock with [plan feature]" CTA. Not a hard gate — the workspace still shows everything it can from crawl data. The blurred block is additive, not blocking. | Medium |
| B | **Copilot upgrade nudge** | When Starter user clicks "Ask Vestigio" on a workspace (3.14E), show a gentle upgrade prompt: "AI insights are available on Pro. [See plans]." Same pattern as ChatBudgetBar's 0% state. Non-blocking — the button is disabled, not hidden. | Low |
| C | **Continuous audit cadence nudge** | On workspace "What Changed" hero (3.11 addition), if user is on Starter (weekly cycles), show: "Updated weekly. [Upgrade to Pro for daily insights]." Subtle text below the change summary, not a modal. | Low |
| D | **Cross-signal as Pro+ feature** | Cross-Signal Insights block (3.15B) visible to all plans but with a limit: Starter sees 1 chain max, Pro sees all, Max gets proactive alerts. When Starter user sees "2 more cross-signal patterns detected — [Upgrade to see all]", it demonstrates value without fully gating it. | Low |

**Total estimate:** ~3-5 days. All items are lightweight UI additions on top of existing plan config (`src/libs/plan-config.ts`). No engine changes.

**Design rules:**
- Never hard-gate a workspace. Crawl-based data is always visible regardless of plan.
- Blurred previews show WHAT the user would get, not empty states.
- Upgrade CTAs are inline text or subtle badges, never modals or banners.
- Copy is value-framing ("Unlock daily insights") not fear-framing ("You're missing out").

---

### 3.20 Unified Entity Architecture — Findings as First-Class Citizens (Fase 1 ✅)

| | |
|---|---|
| **Tag** | `frontend` `engine` |
| **Priority** | P1 (Fase 1 is a **prerequisite for 3.14 Copilot** — the copilot needs a unified FindingDetailPanel to embed. Also prerequisite for 3.15 Cross-Signal — cross-references need to be on the entity. Ship Fase 1 before or alongside 3.14.) |
| **Status** | **Fase 1 shipped 2026-04-21.** FindingDetailPanel unified (extracted from Analysis + Workspace Detail), cross-refs wired (workspace_refs, action_refs, opportunity_ref), canonical `/app/findings/[id]` route (supports ID + inference_key lookup), URL-encoded filter state on Analysis page, finding-in-URL on drawer open/close (history.replaceState). **Fase 2 (saved views + sidebar simplification) and Fase 3 (custom views) deferred.** |

**Problem:** The same finding appears in 5 pages (Dashboard, Analysis, Actions, Workspaces, Chat) with **different drawer implementations, different CTAs, and no cross-references**. `FindingDrawerContent` is copy-pasted between Analysis and Workspace Detail (~400 lines duplicated). Actions has a separate `ActionDrawerContent`. Filter state resets on navigation. No finding has a canonical URL. The user cannot tell "where else does this finding appear?" or "is there an action for this already?"

**Root cause (codebase audit confirmed):** `WorkspaceProjection` **embeds copies** of `FindingProjection[]` instead of referencing by ID. This creates the illusion of separate data when the engine already produces a unified `MultiPackResult`. The separation is purely frontend.

**Architecture principle:** Findings are the atomic unit of Vestigio's value. Every surface (workspaces, actions, analysis, dashboard, chat, maps) is a **view/lens** over the same findings database — not a container. This is how Linear, GitHub Projects, and Notion work.

**Sidebar evolution principle (validated via competitive research — Linear, Datadog, FullStory, PostHog, Grafana, Notion):** Saved views are a **page-level concern, not a sidebar-level concern**. No major monitoring/intelligence tool puts saved views as default sidebar items. They live INSIDE the tool they relate to (Datadog pattern) or behind a favorites/pin system (Linear pattern). The sidebar stays stable and simple; the page grows with views.

#### Sidebar Evolution (across 3.20 + 3.14)

**Fase 1 + 3.14 Copilot (no structural sidebar change):**
```
Dashboard                    → /app/dashboard (dividerAfter)
Actions                      → /app/actions (stays primary landing)
Workspaces                   → /app/workspaces
[Chat removed]               → copilot FAB replaces (ai_chat_enabled = false)
Analysis                     → parent group
  ├ Findings                 → /app/analysis
  └ Inventory                → /app/inventory
Maps                         → /app/maps
────────────────────
Customer Center              → bottom
Data Sources                 → bottom
```
Chat disappears when copilot FAB ships (feature flag already exists). Sidebar goes from 7 to 6 items. Zero disruption.

**Fase 2 (sidebar simplification when saved views ship):**
```
Dashboard                    → /app/dashboard (dividerAfter)
Actions                      → /app/actions (stays primary landing)
Findings                     → /app/findings (promoted, was "Analysis > Findings")
Workspaces                   → /app/workspaces
Maps                         → /app/maps
Inventory                    → /app/inventory (promoted from child to top-level)
────────────────────
Customer Center              → bottom
Data Sources                 → bottom
```
"Analysis" parent group disappears (was always an artificial umbrella). "Findings" and "Inventory" promoted to top-level. Redirect from `/app/analysis` → `/app/findings` preserves bookmarks. Still 6 items.

**Key decisions:**
- **"Incidents" and "Opportunities" stay as tabs in Actions** — not sidebar items, not saved views. Actions is defined by its operational nature ("what to DO"), splitting it fragments the operational focus.
- **Saved views appear INSIDE `/app/findings` as a view selector** (horizontal tabs or dropdown in page header), NOT in the sidebar. Avoids "two paths to same data" problem entirely.
- **"By Workspace" is a view inside Findings** — separate from Workspaces page (Panorama) which has distinct value (PulseSummary, RevenueMap, CycleDelta, BraggingRights, perspective cards, 3.11B enrichment).
- **Custom views appear in the same in-page view selector** — sidebar never grows. Pin-to-sidebar (Fase 3) is opt-in, max 5 pins.
- **Copilot FAB is NOT in the sidebar** — `fixed bottom-4 right-4`. Sidebar handles navigation, FAB handles AI. Independent concerns.

#### Fase 1 — Linear-style Foundation (~1.5-2 weeks)

The user experience doesn't change. Pages keep their names and nav positions. What improves: consistent drawer everywhere, cross-references, filter persistence, canonical URLs.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **FindingDetailPanel** (shared component) | Extract duplicated `FindingDrawerContent` from Analysis + Workspace Detail into `src/components/console/FindingDetailPanel.tsx`. Used by all pages via `<SideDrawer><FindingDetailPanel finding={f} /></SideDrawer>`. Shows: header (title, severity, verification, change badges), cross-references section, impact breakdown, reasoning + cause + effect, remediation steps + effort, evidence quality, verification lifecycle, KB link. **CTAs are state-driven, not page-driven:** if finding has action → "See Action"; if no action → "Create Action"; always "Ask Vestigio" (opens copilot with context); if verification_strategy exists → "Verify". | Medium |
| B | **Cross-references section** | In FindingDetailPanel, "Context" block showing: workspace(s) where this finding appears (clickable → `/app/workspaces/{id}`), action(s) linked (clickable → opens in Actions with `?selected={id}`), perspective label, cross-signal chain (if part of one, from 3.15), opportunity (if exists, with uplift hypothesis). Derived from new fields on FindingProjection. | Medium |
| C | **Projection model enrichment** | Add to `FindingProjection`: `workspace_refs: { id, name, type }[]` (resolved from WorkspaceProjection pack_key matching), `action_refs: { id, title, status, category }[]` (resolved from ActionProjection inference_key matching), `opportunity_ref: { id, hypothesis, value_range } \| null` (from opportunities matching), `cross_signal_chain_id: string \| null` (from 3.15 when implemented). Populated during `projectFindings()` via lookups on `MultiPackResult`. | Medium |
| D | **Canonical URL** | New route `/app/findings/[id]`. Full-page view: FindingDetailPanel rendered wide (no drawer constraint) with expanded reasoning, full evidence quality breakdown, full remediation with links. "Open full page" button (↗ icon) in FindingDetailPanel header navigates here. Shareable. Bookmark-friendly. | Low |
| E | **URL-encoded filter state** | On Analysis page: all 7 filters encoded as URL params (`?severity=critical&pack=revenue_integrity&surface=/checkout&change=regression&search=trust`). On Actions page: tab + any future filters. On Workspaces perspective pages: perspective slug already in URL. Parse on mount, update on filter change. Back button preserves state. Sharing URL shares exact view. | Medium |
| F | **Finding-in-URL on drawer open** | When SideDrawer opens with a finding, URL updates to include `?finding={id}` (without full navigation — `history.replaceState`). This means: (1) refreshing the page re-opens the drawer, (2) sharing the URL shows the same finding open, (3) back button closes the drawer. Same pattern as Linear (`/team/views/abc/TEAM-123`). | Low |

**Fase 1 total:** ~1.5-2 weeks. Zero disruption for existing users — pages look the same, drawer is better. **No sidebar change in this fase.**

#### Fase 2 — Saved Views + Sidebar Simplification (~1 week, can be deferred)

Findings page gets an in-page view selector. Sidebar simplifies (Analysis group → Findings + Inventory top-level).

| # | Part | Description | Effort |
|---|------|-------------|--------|
| G | **SavedView model** | `Prisma: SavedView { id, userId, environmentId, name, icon, color, filters: Json, groupBy: String?, sortBy: String?, layout: 'table' \| 'checklist', isDefault: Boolean, isShared: Boolean, order: Int, createdAt }`. Defaults seeded on first access. | Low |
| H | **Default views (in-page)** | 2-3 non-deletable views rendered as tabs/dropdown in the Findings page header: (1) **"All"** = no filters (current Analysis behavior), (2) **"By Workspace"** = findings grouped by `workspace_ref` (collapsible sections in DataTable). More defaults can be added later without sidebar changes. | Medium |
| I | **View selector component** | Horizontal tab bar or dropdown in `/app/findings` page header — same visual pattern as Actions page category tabs. Shows default views + user-created views. Active view sets URL: `/app/findings?view={id}`. "Save current view" button appears when filters ≠ default. New saved views appear in the selector immediately. | Medium |
| J | **Sidebar simplification** | Remove "Analysis" parent group. Add "Findings" as top-level item (`/app/findings`). Add "Inventory" as top-level item (unchanged URL `/app/inventory`). Set up redirect `/app/analysis` → `/app/findings` to preserve bookmarks. 6 sidebar items total (same count as Fase 1). | Low |
| K | **"Save current view" CTA** | In the filter bar of Findings page, button appears when filters ≠ any default view: "Save as view." Persists current filter state as a new `SavedView`. Appears in the view selector immediately. | Low |

#### Fase 3 — Custom Views / Enterprise Foundation (~1 week, can be deferred further)

Power-user features. Opt-in, never forced.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| L | **Custom grouping** | Views can group findings by: workspace, severity, root_cause, surface, pack, change_class. Renders as collapsible sections within DataTable. | Medium |
| M | **Column selection** | Views can show/hide DataTable columns. Persisted in SavedView. | Low |
| N | **Share view with team** | `isShared: true` → visible to all org members. "Team" badge in view selector. | Low |
| O | **Pin to sidebar** | Any SavedView can be pinned as a first-level sidebar item below "Findings". Max 5 pins per user. Pinned views have a small dot icon in sidebar. Only mechanism by which custom views enter the sidebar — always opt-in. | Low |

**Dependency chain:** Fase 1 is self-contained. Fase 2 depends on Fase 1 (URL-encoded filters). Fase 3 depends on Fase 2 (SavedView model).

**Migration path:** Ship Fase 1 immediately (no sidebar change). When copilot ships (3.14), Chat leaves sidebar via feature flag. When Fase 2 ships, sidebar simplifies (Analysis group → Findings + Inventory). Each step is independently shippable with zero user disorientation.

**Files touched:** Fase 1: extract from `src/app/app/analysis/page.tsx` + `src/app/app/workspaces/[id]/page.tsx` → new `src/components/console/FindingDetailPanel.tsx`. Modify `packages/projections/engine.ts` (add refs to FindingProjection). New route `src/app/app/findings/[id]/page.tsx`. URL param handling in Analysis + Actions + Workspaces pages. Fase 2: new `prisma/schema.prisma` (SavedView), `src/components/app/sidebar-nav-data.ts` (restructure productNav), new `src/components/console/ViewSelector.tsx`, redirect middleware for `/app/analysis`. Fase 3: extend ViewSelector with grouping/columns, add pin logic to sidebar-nav-data.

---

### 3.18 First-Audit Experience — Value Before Data ✅ COMPLETE

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P2 |
| **Status** | **✅ Shipped 2026-04-27.** `FirstAuditProgress.tsx` — 5-stage emerald-accented timeline (Discover, Classify, Analyze, Enrich, Compute) driven by SSE stream from `/api/cycles/[id]/stream`, advances heuristically based on page count + finding count. Business-type heuristic preview below timeline with 5 bullet points per business type (ecommerce/SaaS/lead gen/hybrid), sourced from `BusinessProfile.businessType`. `FirstAuditCelebration.tsx` — 1.5s overlay with 24 emerald glow dots (custom `celebration-dot` keyframe), finding/page counts, fades into real dashboard. Wired into `DashboardShell.tsx`. i18n (4 langs). |

**Problem:** After onboarding, the first audit cycle takes 5-10 minutes. During this time, users see empty pages with a "Audit in progress" banner and page count ticking up. First contact with value only happens when findings appear. This is the highest-churn window — users who don't see value in their first session rarely return.

**Competitors:** Semrush shows a partial Health Score immediately. Contentsquare shows an onboarding tutorial. ProfitWell shows revenue data within seconds (different category but same principle: instant value).

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Rich progress feed** | Replace the minimal CycleProgressBanner with a richer progress view on the empty workspace/analysis pages during first audit. Instead of "42 pages crawled", show a narrative feed: "Analyzing checkout security... Found 3 trust signals", "Checking refund policy... Policy found at /refund", "Scanning payment page... Detecting 3D Secure..." Each step corresponds to actual pipeline stages (Stage A discovery, Stage B classification, Stage C analysis, Stage D enrichment). Feed uses real data from the SSE stream, not fake data. | Medium |
| B | **Heuristic preview briefing** | While the audit runs, generate a heuristic briefing from onboarding data (business type, revenue range, conversion model) + domain surface analysis (which was completed in seconds by Stage A). "Based on your ecommerce site with ~$50k/mo revenue, here's what we typically find..." with 3-5 common finding categories for that business type. Marked clearly as "Preview — full results in a few minutes." Disappears once real findings load. | Low |
| C | **First-findings celebration** | When the first batch of findings loads (SSE `status: complete`), animate the transition from progress feed to real workspaces. Brief celebration: "Audit complete. 27 findings across 4 perspectives. Your Health Score: 62/100." Then fade into the normal workspace view. Sets the baseline for future "what changed" comparisons. | Low |

**Total estimate:** ~1 week. Item A is the bulk (needs SSE message enrichment). B and C are lightweight UI.

---

### 3.19 Cancel Flow & Save Offers — Reduce Voluntary Churn ✅ COMPLETE

| | |
|---|---|
| **Tag** | `platform` `frontend` |
| **Priority** | P2 |
| **Status** | **✅ Shipped 2026-04-27.** `CancelSurvey` Prisma model (reason, freeText, offeredSave, acceptedSave, cancelledAt). `POST /api/billing/cancel` endpoint with 3 actions (survey → dynamic offer, accept-offer → Paddle API, confirm → cancel + win-back email). Cancel page at `/app/settings/cancel` — 3-step flow: exit survey (7 reasons + free text), dynamic save offer (discount/pause/downgrade/support/roadmap mapped by reason, emerald card with primary + fallback), confirmation (feature loss list, destructive red button). Paddle integration via fetch (pause, cancel effective_from next_billing_period, discount). Post-cancel win-back via `notifyOrganization()`. `CancelSubscriptionButton` in settings page. i18n (4 langs, `cancel_flow` + `subscription` namespaces). |

**Problem:** No cancel flow exists. Cancellation via Paddle is instant — no exit survey, no save offer, no pause option, no win-back sequence. Industry benchmarks show that even a minimal cancel flow (survey + one save offer) recovers 10-15% of cancellations. A well-designed flow with dynamic offers recovers 25-35%.

**Current state:** Paddle webhook handles `subscription.canceled` → sets org status. No interception before the Paddle cancel action. The billing page has "Manage Subscription" → direct Paddle portal.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Custom cancel flow (intercept)** | Instead of linking directly to Paddle's cancel portal, route "Cancel subscription" through a custom page `/app/billing/cancel`. This page runs the flow below BEFORE calling `paddle.subscriptions.cancel()`. If the user accepts a save offer, the cancel never reaches Paddle. | Medium |
| B | **Exit survey (1 question)** | Single-select with optional free text. Reasons: "Too expensive", "Not using it enough", "Missing a feature I need", "Switching to another tool", "Technical issues", "Temporary / don't need right now", "Other." Stored as `CancelSurvey` Prisma model (`{ orgId, reason, freeText, offeredSave, acceptedSave, cancelledAt }`). Data feeds admin dashboard for churn reason analysis. | Low |
| C | **Dynamic save offer** | Offer mapped to reason: **Too expensive** → 25% off for 3 months (via Paddle discount API) or downgrade to lower plan. **Not using it enough** → Pause subscription for 1-3 months (Paddle `subscription.pause`). **Missing feature** → Show relevant roadmap item + "notify me" toggle. **Switching** → Comparison point + discount. **Technical** → Escalate to priority support. **Temporary** → Pause. **Other** → Generic "we'd love to keep you" + small discount. One primary offer + one fallback per reason. | Medium |
| D | **Pause subscription** | Paddle supports native pause. User selects 1, 2, or 3 months. Auto-resume with 7-day advance email notification. Data/settings preserved. Paused environments skip audit scheduling but resume automatically. 60-80% of pausers reactivate (industry benchmark). | Low |
| E | **Post-cancel win-back sequence** | If user completes cancellation: immediate confirmation email with reactivation link + "what you'll lose" summary. Day 7: "Here's what changed on your site since you left" (run one final audit, email the summary). Day 30: "We've improved [feature they cited]" (if applicable based on survey reason). Via Brevo (already configured). | Medium |
| F | **Admin churn dashboard** | New admin tab: cancel reason distribution (pie chart), save offer acceptance rate, pause reactivation rate, churn by plan tier, churn by tenure cohort, monthly churn trend. Sourced from `CancelSurvey` + Paddle webhook events. | Medium |

**Total estimate:** ~2 weeks. A-D are the critical path (~1 week). E-F are follow-up (~1 week).

**Metrics to track (via 3.16 telemetry):**
- Cancel flow save rate (target: 25-35%)
- Offer acceptance rate by reason (target: 15-25%)
- Pause reactivation rate (target: 60-80%)
- Win-back email conversion rate
- Time from first churn signal (engagement score drop) to cancel

---

## Wave 4 — Expansion & Depth

**Goal:** Extend the product into new strategic lenses, deeper verification, and platform maturity.

---

### 4.1 Cybersecurity Pack — Phase 2 (Minor Collection Extension)

| # | Finding | Collection Needed | Effort |
|---|---------|-------------------|--------|
| A | Cookie security assessment | Parse `Set-Cookie` header attributes | Low |
| B | Information disclosure | Error page body text capture on 4xx/5xx | Low |
| C | Script supply chain / SRI | Extract `integrity` attribute from `<script>` tags | Low |
| D | Auth surface security | Password field type detection in forms | Low |

---

### 4.2 LLM Enrichment — Pricing & Structured Data

| # | Enrichment | Input | Value |
|---|-----------|-------|-------|
| A | Pricing/offer clarity | Pricing page body text (expanded snippet) | Strengthens `expectation_misalignment` |
| B | Page purpose validation | title + h1 + body_text_snippet vs URL classification | Improves commercial path accuracy |
| C | Structured data cross-validation | JSON-LD claims vs visible page content | Detects schema/content mismatches |

---

### 4.3 Trust & Conversion Lens

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P2 |
| **What** | Transversal analysis across packs. Trust asymmetry scoring: `trust_density_pre_checkout - trust_density_at_checkout`. Journey-level trust arc, not per-page. |
| **Builds on** | Existing trust signals + semantic enrichment (trust language, CTA clarity). |
| **Surface** | Revenue workspace anchor, cross-pack finding, MCP insight. |

---

### 4.4 Platform Maturity

| # | Item | Tag | Priority |
|---|------|-----|----------|
| A | Conversation export (PDF/markdown) | `mcp` | P3 |
| B | Conversation branching | `mcp` | P3 |
| C | SPA resolution (Stage D — selective headless) | `collection` | P3 |
| D | Integration pull executor (analytics/payment APIs) | `collection` `platform` | P3 |
| E | Pixel event ingestion pipeline | `collection` `platform` | P3 |
| F | Multi-page post-login SaaS exploration | `collection` | P2 |

---

### 4.5 Cybersecurity Pack — Phase 3 (Infrastructure Dependencies)

| # | Finding | Infrastructure | Effort |
|---|---------|---------------|--------|
| A | Certificate / TLS posture | `socket.getPeerCertificate()` in HTTP client | Medium |
| B | Payment surface security indicators | Cross-correlation logic across evidence | Medium |
| C | Email deliverability (SPF/DKIM/DMARC) | DNS TXT record lookup | Medium |
| D | Privacy / consent compliance | Depends on cookie analysis + browser consent flow | Medium |

---

### 4.6 Neglected Findings — Data Collected, Findings Missing

**Goal:** Extract high-impact findings from evidence the system already collects but doesn't use. Zero new collection infrastructure needed — only signal extraction + inference functions.

---

#### 4.6A Payment Handoff Leakage (Pixel)

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P1 |
| **Effort** | Low (~1 day) |
| **Data source** | `BehavioralSessionPayload.handoff_without_return_count`, `handoff_without_confirmation_count` |
| **Status** | Fields collected, no signal extraction, no inference |

| # | Finding | Signal | Impact |
|---|---------|--------|--------|
| A | Payment handoff abandonment | `handoff_without_return_count / session_count > threshold` | "34% of buyers who go to payment gateway never return. Revenue lost in handoff: R$X/month." |
| B | Post-purchase confirmation absent | `handoff_without_confirmation_count > 0` | "Buyers complete payment but never see a confirmation page. Drives 'did my order go through?' support contacts and disputes." |

---

#### 4.6B SaaS Activation Findings (Authenticated Sessions)

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P1 |
| **Effort** | Medium (~3-5 days) |
| **Data source** | `AuthenticatedPageView`, `ActivationStepObserved`, `UpgradeSurfaceObserved`, `EmptyStateObserved`, `NavigationStructureObserved` |
| **Status** | All evidence types collected, all InferenceCategory values exist in enum, 0% signal/inference implemented |

| # | Finding | Signal | Impact |
|---|---------|--------|--------|
| A | Activation blocked | `ActivationStepObserved.has_clear_cta === false` + high complexity | "Trial users can't find how to start — activation rate at risk" |
| B | Activation friction high | `ActivationStepObserved.estimated_complexity === 'high'` across multiple steps | "Onboarding requires 5+ high-complexity steps — predicts trial-to-paid drop" |
| C | Empty state without guidance | `EmptyStateObserved.has_guidance === false && has_cta === false` | "New users land on empty screens with no direction — churn trigger" |
| D | Navigation overcomplex | `NavigationStructureObserved.total_nav_items > threshold` + `depth_levels > 3` | "Navigation has 40+ items across 4 levels — feature discovery suffers" |
| E | Upgrade invisible | `UpgradeSurfaceObserved.visibility === 'hidden'` | "Upgrade path exists but is hidden — expansion revenue blocked" |
| F | Upgrade timing wrong | Upgrade CTA on onboarding pages (too early) or absent on usage-limit pages | "Upgrade shown before value, absent when user hits limits" |
| G | Landing ≠ app mismatch | Crawled homepage promise vs `AuthenticatedPageView` first-screen reality | "Marketing promises X, product shows empty dashboard — trust break at first login" |

---

#### 4.6C Surface Oscillation Clustering (Pixel)

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P2 |
| **Effort** | Low-Medium (~2 days) |
| **Data source** | `BehavioralSessionPayload.surface_oscillation_top_pairs` |
| **Status** | Detailed pair data collected, only basic oscillation rate used |

| # | Finding | Signal | Impact |
|---|---------|--------|--------|
| A | Indecision map by page pair | Top oscillation pairs × conversion rate delta | "Visitors oscillating between /pricing and /features convert 70% less. Indecision cost: R$X/month." |
| B | Friction cluster detection | 3+ pages forming oscillation loop | "Circular navigation pattern detected: /cart → /shipping → /cart → /shipping. Checkout friction loop costs R$X/month." |

---

#### 4.6D Network Error Commercial Weighting (Playwright)

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P2 |
| **Effort** | Low (~1 day) |
| **Data source** | `BrowserFailureEvent.network_errors[]`, `NetworkAnalysis` payment/trust/measurement breakdown |
| **Status** | Errors captured without commercial impact classification |

| # | Finding | Signal | Impact |
|---|---------|--------|--------|
| A | Payment provider request failing | `network_errors` on checkout page matching payment provider domains | "3 failed requests to Stripe on checkout — these block purchases, not just tracking" |
| B | Trust asset load failure | Trust-related requests (seal, badge, SSL indicator) failing | "Trust badges fail to load on 12% of sessions — trust erosion on high-intent pages" |

---

#### 4.6E Mobile Trust Gap Quantification (Playwright)

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P2 |
| **Effort** | Low (~1 day) |
| **Data source** | `MobileVerificationResult.trust_degraded_vs_desktop` + desktop trust signal count |
| **Status** | Boolean flag exists, no quantification |

| # | Finding | Signal | Impact |
|---|---------|--------|--------|
| A | Mobile trust signal gap | Desktop shows 5 trust signals, mobile shows 2 | "Mobile hides 3 of 5 trust signals visible on desktop. Mobile converts X% worse — trust gap is a measurable driver." |
| B | Mobile checkout path slower | `MobileVerificationResult.duration_ms` vs desktop `BrowserNavigationTrace.duration_ms` | "Mobile path to checkout: 8.2s vs desktop 2.1s. Each extra second reduces conversion ~7%." |

---

#### 4.6F Behavioral Micro-Pattern Gaps (Pixel)

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P2 |
| **Effort** | Low (~1-2 days) |
| **Data source** | `BehavioralSessionPayload` fields with partial or no usage |

| # | Finding | Signal | Impact |
|---|---------|--------|--------|
| A | Sensitive field type abandonment breakdown | `sensitive_input_abandon_kinds[]` per field type (CPF, card, address, phone) | "68% of form abandonments happen at CPF field specifically — not generic 'form friction'" |
| B | Time-to-first-action benchmark | `time_to_first_commercial_action_ms` vs industry/traffic cohort | "Visitors take 47s to first commercial action. Benchmark for e-commerce: 12s. Landing page isn't connecting." |
| C | CTA render timing impact | `cta_rendered_late` events correlated with engagement rate | "CTA appears after user has already scrolled past — 40% of visitors never see primary CTA" |

---

### 4.7 Cross-Domain Compound Findings

**Goal:** Produce findings that are **only possible** because Vestigio sees data from 3+ sources simultaneously. These are the moat — no single-domain tool can replicate them.

> Existing compounds (3.4) combine 2 signals within the same domain. These combine evidence from fundamentally different collection methods (crawl × pixel × integration × browser verification).

---

#### 4.7A Security Exposure × Revenue Surface Quantification

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P1 |
| **Sources** | Nuclei (security) × Shopify (revenue) × Pixel (traffic) |
| **Effort** | Medium |

| # | Finding | Cross-Domain Logic | Impact |
|---|---------|-------------------|--------|
| A | Vulnerability on revenue-critical page | Nuclei finds vulnerability on URL → Pixel shows that URL receives X sessions/month → Shopify shows that URL processes R$Y/month | "XSS vulnerability on your checkout page. This page processes R$400k/month across 2,300 sessions. Exposure: 100% of checkout traffic." |
| B | Exposed endpoint with transaction volume | Katana finds guessable endpoint → Shopify confirms transactions flow through that path | "Guessable order endpoint /api/orders/{id} handles R$X/month in transactions. Enumeration risk is financial, not theoretical." |

**Why unique:** Snyk finds the vulnerability. Shopify knows the revenue. Only Vestigio connects "this vulnerability is on your R$400k/month page."

---

#### 4.7B Ad Promise × Landing Reality × Behavioral Proof

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P1 |
| **Sources** | Meta/Google Ads (creative copy) × Crawl (landing page content) × Pixel (behavioral drop-off) × Shopify (actual values) |
| **Effort** | Medium — requires Wave 3.9 (C-E) ad creative matcher |

| # | Finding | Cross-Domain Logic | Impact |
|---|---------|-------------------|--------|
| A | Ad promise ≠ landing page reality | Ad copy promises "free shipping" → Landing page shows R$15 shipping → Pixel shows 60% bounce at shipping info → Shopify confirms avg shipping R$18 | "Your Meta ad promises free shipping. Your landing page charges R$15-18. 60% of paid visitors bounce at shipping info. CPC waste: R$X/month." |
| B | Ad audience × mobile experience mismatch | Ads target mobile-heavy demographic → Playwright shows mobile checkout broken → Pixel confirms mobile paid traffic converts 5× worse | "72% of your ad spend reaches mobile users. Mobile checkout has 3 critical errors. You're paying to send traffic into a broken funnel." |

**Why unique:** Meta knows the ad. The crawl sees the page. The pixel sees the behavior. Shopify knows the real price. No single tool has all four.

---

#### 4.7C Trust Architecture × Behavioral Hesitation × Revenue Impact

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P1 |
| **Sources** | Crawl (trust signal inventory) × Pixel (hesitation patterns) × Shopify (conversion by page) |
| **Effort** | Medium |

| # | Finding | Cross-Domain Logic | Impact |
|---|---------|-------------------|--------|
| A | Trust density ↔ drop-off correlation | Crawl counts trust signals per page → Pixel measures drop-off rate per page → Correlation: pages with <3 trust signals have 5× drop-off | "Pages with fewer than 3 trust signals have 5× the drop-off rate. Adding trust signals to your top 3 leaking pages: estimated R$X/month recovery." |
| B | Chargeback driver chain | Shopify shows high chargeback on category X → Pixel shows those buyers visited policy page 3× more → Crawl shows policy is thin (200 words, no clear return process) | "Buyers of [category] visit your return policy 3× before purchasing, but your policy is thin and unclear. This drives your 4.2% chargeback rate. Cost: R$X/month." |

**Why unique:** Hotjar sees behavior but doesn't correlate with trust signal density or chargeback data. Shopify sees chargebacks but not the behavioral pattern that caused them.

---

#### 4.7D Post-Purchase Experience × Chargeback × Support Correlation

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P2 |
| **Sources** | Pixel (post-purchase behavior) × Playwright (confirmation flow) × Shopify (support tickets, chargebacks) × Crawl (tracking page existence) |
| **Effort** | Medium |

| # | Finding | Cross-Domain Logic | Impact |
|---|---------|-------------------|--------|
| A | Missing post-purchase → support flood → chargebacks | Pixel shows 40% of buyers seek support within 24h → Crawl finds no order tracking page → Playwright confirms confirmation email links broken → Shopify shows 8% of these become chargebacks | "40% of buyers seek support within 24h of purchase. No order tracking page exists. Confirmation email links are broken. This chain drives 8% chargeback rate: R$X/month." |
| B | Shipping expectation gap | Crawl shows shipping page says "3-5 days" → Shopify shows avg fulfillment is 9 days → Pixel shows support spikes 5 days post-purchase | "You promise 3-5 day shipping. Average fulfillment: 9 days. Support contacts spike on day 5. Expectation gap drives disputes: R$X/month." |

**Why unique:** Each piece of evidence is in a different system. The causal chain (missing tracking → support → chargeback) is only visible when you see all three together.

---

#### 4.7E Brand Impersonation × Revenue Correlation

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P2 |
| **Sources** | Brand intel scan (lookalike domains) × Shopify (organic traffic trend) × Crawl (lookalike site has checkout) |
| **Effort** | Low-Medium |

| # | Finding | Cross-Domain Logic | Impact |
|---|---------|-------------------|--------|
| A | Active impersonation with revenue diversion | Brand scan finds lookalike domain → Crawl of lookalike shows active checkout → Shopify organic traffic declined 15% since lookalike registration | "vestigio-shop.com registered 3 weeks ago, actively selling your products. Your organic traffic dropped 15% in the same period. Estimated revenue diversion: R$X/month." |

**Why unique:** Brand monitoring tools find the domain. Analytics shows the traffic drop. Only together do you see the causal link and financial impact.

---

## Wave 6 — Future Cross-Domain Findings

**Goal:** Expand the decision engine beyond commercial path analysis into adjacent financial surfaces — same buyer, same loss-frame, same defensible R$. Each category requires the finding to pass: *"Is this real money, already happening, verifiable with data we have?"*

> These are **future explorations**, not committed work. Each requires validation that the R$ is defensible before building.

---

### 6.1 Revenue Attribution Integrity

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P2 |
| **What** | Cross-reference ad platform reported revenue (Meta, Google) with actual transaction data (Stripe, Shopify) to detect overattribution. |
| **Key finding** | "You think Meta brought R$120k/month. Crossing with Stripe, it's R$74k. You're overinvesting R$X in CPC based on inflated attribution." |
| **Requires** | Meta Ads + Google Ads OAuth (Wave 3.9) + Stripe integration (Wave 3.8) + Shopify integration (existing) |
| **R$ credibility** | High — compares two real data sources, delta is verifiable |

---

### 6.2 Pricing Exposure

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P2 |
| **What** | Detect pricing errors: expired coupons still active, channel inconsistencies, underpricing vs market, unintentional discounts. |
| **Key findings** | "Coupon BLACKFRIDAY still active since November — R$4k/month in unintentional discount." · "Product X sells 300 units/month at R$89 but competitor charges R$129 — margin R$12k/month below market." |
| **Requires** | Shopify integration (existing) — discount/coupon data, catalog pricing |
| **R$ credibility** | High — transaction data proves the loss directly |

---

### 6.3 Vendor Cost Leakage

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P3 |
| **What** | Analyze SaaS/infra spend to find waste — duplicate tools, oversized plans, unused subscriptions. |
| **Key finding** | "Your Shopify Plus plan costs R$2k/month but your sales volume fits Basic at R$130/month." |
| **Requires** | Billing API integrations (Stripe for SaaS subscriptions, potentially AWS billing) |
| **R$ credibility** | High for plan downgrades (billing data is factual), medium for tool consolidation recommendations |

---

### 6.4 Contract & Subscription Revenue Decay (SaaS)

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P3 |
| **What** | Predict churn from usage patterns, quantify MRR at risk before cancellation happens. |
| **Key finding** | "47 accounts with total MRR of R$38k haven't logged in for 30 days. Based on historical pattern, 60% cancel next cycle. Revenue at risk: R$23k." |
| **Requires** | Stripe Billing (MRR data) + behavioral pixel (login/usage tracking) or authenticated session data |
| **R$ credibility** | Medium-high — probabilistic but based on the client's own historical churn data, not market averages |

---

## Wave 5 — Continuous Incremental Engine (Remaining)

> Fases 1-3 shipped (2026-04-14). See [COMPLETED_ROADMAP.md](COMPLETED_ROADMAP.md) for details.

### Fase 4 — Rollout gradual

Feature-flag gated rollout with a kill switch. Order:
1. Internal demo org first (7 days soak)
2. 1-2 real customers opted-in, with a phone-call-able escalation path
3. Metrics gate before broad rollout: Redis backlog p95 < 10s, cycle p95 duration within plan budget, memory per worker < 1.2GB, DB pool saturation < 70%
4. Broad rollout per plan tier; Starter last (highest relative risk if incremental mis-gates something)

**Kill switch:** a `VESTIGIO_CONTINUOUS_SCHEDULER_ENABLED` env flag that short-circuits the scheduler cron if flipped off; cycles still run on webhook trigger.

---

## Summary View

| Wave | Theme | Key Outcomes | Status |
|------|-------|-------------|--------|
| **0** | Critical Pipeline Gaps | Onboarding auto-trigger, pixel ingest + worker, inventory auto-build, real inventory counts, verification UI wiring, finding persistence | **7 of 7 shipped** ✅ |
| **1** | Core Experience Polish | Actions/Analysis/Inventory UX, billing, page tooltips, Stage D enrichment framework | **9 of 9 done** ✅ |
| **2** | Knowledge, Members & Confidence | Knowledge base, invite flow, root cause refinement (33→27), confidence reframed, prisma migrate | 2.1-2.4 ✅ — **2.5 (Prisma Migrate) open** |
| **—** | Marketing Surface Polish | Homepage UX (Phases 11-14), mobile redesigns, section reordering, ProductTour Maps rewrite, ShinyButton redesign | ✅ |
| **—** | SEO Overhaul | JSON-LD, OG image, metadataBase, canonical, hreflang, sitemap expansion, metadata on all pages, ISR | ✅ |
| **3** | Semantic Enrichment, New Lenses & Product Experience | LLM enrichment, cybersecurity, copy analysis, integrations, workspace redesign + enrichment, opportunity actions, re-engagement, **AI copilot**, **cross-signal surface**, **product telemetry**, **upgrade moments** | 3.1-3.4 + 3.7 (F-H, L-R) + 3.7B + 3.9 (A-B, F, 4 compounds, 2 ctx signals) + 3.11 (~85%) ✅ — **3.5-3.6, 3.7 (I, M), 3.8 (A-C), 3.9 (C-E), 3.10 (A-P), 3.11B, 3.12-3.20 open** |
| **4** | Expansion & Depth | Cybersecurity Phase 2+3, pricing/structured data enrichment, Trust & Conversion lens, platform maturity, **neglected findings (4.6)**, **cross-domain compounds (4.7)** | All open |
| **5** | Continuous Incremental Engine | Redis queue, worker service, leader election, activation flow, incremental engine, scheduler | Fases 1-3 ✅ — **Fase 4 (rollout) open** |
| **6** | Future Cross-Domain Findings | Revenue attribution integrity, pricing exposure, vendor cost leakage, subscription revenue decay | All exploratory — not committed |

---

## What is NOT on this roadmap

Per the [North Star anti-drift commitments](NORTHSTAR.md):

- Competitive benchmarks based on ungrounded LLM knowledge
- AI analysis on every crawled page
- Explosion of packs without evidence depth to back them
- Transformation into a vulnerability scanner
- Finding count maximization
- Features that don't strengthen the value delivery loop: `finding → discussion/verification → action → resolved`
