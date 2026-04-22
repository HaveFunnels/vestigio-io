# ROADMAP.md — Vestigio Development Roadmap

> Last updated: 2026-04-21 (full codebase audit of all P1 open items)
> Companion to: [NORTHSTAR.md](NORTHSTAR.md), [DEV_PROGRESS.md](../DEV_PROGRESS.md), [FINDINGS_OPPORTUNITIES.md](FINDINGS_OPPORTUNITIES.md), [COLLECT_OPPORTUNITIES.md](COLLECT_OPPORTUNITIES.md)
>
> **For completed work** (Waves 0, 1, 2.1–2.4, 3.1–3.4, 3.7 (F-H, L-R), 3.7B, 3.9 (A-B, F + 4 compound findings + 2 context signals), 5 Fases 1–3, Marketing/SEO polish), see [COMPLETED_ROADMAP.md](COMPLETED_ROADMAP.md).

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
| Workspace Lens Enrichment — checklist-first views | **Not started** — 5 fases, ~35-40h. Surfaces stored data (TrustSurfaceScore, CommerceContext KPIs, opportunities, product intelligence) that's currently never rendered | Wave 3.11B |
| Shopify: promoted product cross-reference with crawled pages | **Bug** — `promotedProductIds` passes `[]` in poller.ts:185; `out_of_stock_promoted` always 0; finding M never fires | Wave 3.7 |
| Ad Platforms: Creative→LP matcher + message-match + waste signal (C-E) | **Not started** — infrastructure 90% in place, ~12-17h | Wave 3.9 |
| Meta Ads + Google Ads OAuth app approvals | External — 1-6 weeks | Wave 3.9 |
| Prisma migration in prod for `syncMetadata` | Pending `npx prisma db push` | Wave 3.9 |
| Stripe Integration — OAuth + poller (scaffolding ~40% done) | Types + reconciliation + Prisma + API CRUD done; missing OAuth flow + revenue poller + sync route | Wave 3.8 |
| Copy Analysis Pack — remaining 16 items (A-D, G-P) | **0% of remaining items** — foundation only (4 enrichment types + signals + root cause) | Wave 3.10 |
| Opportunity-First Actions — 7 fases | **~5%** — engine generates opportunities, tab exists; all UI/UX fases open | Wave 3.12 |
| `integration_pull` executor | Scaffolded only | Wave 3 |
| `prisma db push` → `prisma migrate` | Pending | Wave 2.5 |
| Conversation export/branching | Not started | Wave 4.4 |

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
| I | **Inventory levels** | Fetch `/inventory_levels.json` for products found on crawled pages. Identify: out_of_stock_promoted_count (product page exists in crawl inventory but stock = 0). Map to `CommerceContext`. | ⚠️ Partial — fetch + batching works (`client.ts:347`), `aggregateInventory()` exists (`aggregator.ts:305`), **but `promotedProductIds` hardcoded as `[]` in `poller.ts:185`** — needs cross-reference with crawled page graph to extract promoted product IDs. `out_of_stock_promoted` always = 0. |

#### 3.7.4 New Findings & Signals

| # | Finding | Data source | Pack | Status |
|---|---------|-------------|------|--------|
| L | `checkout_abandonment_revenue_leak` — "Your checkout loses $X/mo in abandoned carts" | abandoned_checkouts | revenue_integrity | ✅ Firing — signal `checkout_abandonment_rate_high` (>60%) → inference wired (`inference/engine.ts:3264`) |
| M | `promoted_product_out_of_stock` — "Products on your site are out of stock, frustrating buyers" | inventory_levels + crawled pages | money_moment_exposure | ⚠️ **Blocked** — signal + inference exist but never fire because `promotedProductIds = []` (see 3.7.2-I bug) |
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

### 3.9 Ad Platform Integrations — Meta & Google Ads

| | |
|---|---|
| **Tag** | `platform` `collection` `engine` |
| **Priority** | P1 |
| **Status** | **Partially shipped — 2026-04-17.** Full pipeline built: pollers (Graph API + GAQL), OAuth full-flow with CSRF protection, LGPD webhooks (data deletion + deauthorize for Meta), UI cards with Connect buttons in Data Sources, run-cycle wiring, KB articles, deployment docs. Graph foundation (Layer 1): ad_creative/ad_campaign node types, ad_targets/ad_funds edge types, 4 compound findings (dead destination, landing trust gap, form friction waste, mobile checkout degraded), 2 context signals (ad spend concentrated, ads without conversion tracking). 6 new inferences + impact baselines + root causes + remediation catalog. Dashboard AdSpendKpi widget reading syncMetadata. **Pending:** Meta Developer App Review approval (ads_read + business_management) + Google Cloud OAuth verification + Google Ads Developer Token. `npx prisma db push` for syncMetadata field. |

**Context:** Pulling actual ad creative text from ad platforms enables precise message-match analysis (does the landing page deliver what the ad promised?), ad spend waste quantification, and conversion attribution. This data also enriches the Copy Analysis Pack (3.10) with real ad creatives instead of UTM heuristics.

| # | Part | Description | Effort | Status |
|---|------|-------------|--------|--------|
| A | **Meta Ads API integration** | OAuth flow, Graph API poller (30d insights + top 20 creatives with headline/body/cta/destination_url/spend), LGPD webhooks, UI card, KB article. **Pending:** Meta app review approval. | — | ✅ Done |
| B | **Google Ads API integration** | OAuth flow, GAQL poller (campaign costs + responsive search ad headlines/descriptions + final URLs), UI card, KB article. **Pending:** Google OAuth verification + developer token. | — | ✅ Done |
| C | **Creative → LP matcher** | Match ad creatives to landing pages via: (1) destination URL exact match, (2) UTM campaign/content → creative ID mapping, (3) final URL domain + path pattern. Each matched pair becomes a `AdLpPair { creative_text, creative_cta, lp_url, lp_copy_elements }` fed to the Haiku analysis. **Note:** Graph already has `ad_creative` nodes with headline/body/cta/destination_url in metadata + `ad_targets` edges — matcher needs to traverse these and pair with page copy. | Low | ❌ Not started — no `AdLpPair` type, no matcher logic |
| D | **Precise message-match analysis** | Haiku call per `AdLpPair`: does the LP headline echo the ad promise? Does the LP CTA match the ad CTA type? Is the value prop consistent? Structured output with specific mismatch points and fix suggestions. New signal `ad_message_mismatch_detected`, new inference `landing_page_breaks_ad_promise`. **Note:** Haiku enrichment infra exists (ContentEnrichment pattern) — just needs a new call type. | Low | ❌ Not started — no Haiku prompt, no signal/inference keys |
| E | **Ad spend waste signal** | Quantify message-mismatch findings in dollars: "This LP receives ~$X/day in ad spend but breaks the ad promise — estimated waste: $Y/mo." Uses `CommerceContext.ad_spend_by_platform` for real $ amounts. **Note:** `ad_spend_by_platform` + `total_ad_spend_monthly` already populated by `reconcileCommerceContext()`. | Low | ❌ Not started — depends on D |
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

---

### 3.11B Workspace Lens Enrichment — Checklist-First, Not Findings-First

| | |
|---|---|
| **Tag** | `frontend` `engine` |
| **Priority** | P1 |
| **Status** | Not started — 2026-04-21 |

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

### 3.12 Opportunity-First Actions — Revenue Pipeline Surface

| | |
|---|---|
| **Tag** | `frontend` `engine` `platform` |
| **Priority** | P1 |
| **Status** | **~5% implemented — 2026-04-21 audit confirmed.** Engine side: `generateOpportunities()` in `opportunity-gate.ts` is complete (130+ inference templates, confidence scoring, clustering). `OpportunityCompressionResult` in composites is wired. Frontend side: Opportunities tab exists in Actions page with emerald badge, count card, category filtering, and opportunity lifecycle steps defined (`['identified', 'sized', 'accepted', 'implemented', 'verified', 'archived']`). **But:** `ActionProjection` has NO opportunity-specific fields (no uplift_hypothesis, no upside_score, no cluster_key); projection engine never calls `generateOpportunities()`; all 7 UI/UX fases (hero cards, cluster grouping, hypothesis display, status workflow, scatter plot, i18n) are unimplemented. No `OpportunityTracking` Prisma model. No status API endpoint. |

**Context:** The engine already produces rich `Opportunity` objects via `generateOpportunities()` in [packages/decision/opportunity-gate.ts](../packages/decision/opportunity-gate.ts) — with `uplift_hypothesis`, `raw_upside_score`, `value_case`, `effort_hint`, full lifecycle (`identified → sized → accepted → implemented → verified → archived`), and `OpportunityCompressionResult` clusters grouped by root cause. The Actions page at [src/app/app/actions/page.tsx](../src/app/app/actions/page.tsx) already has a dedicated "Opportunities" tab with emerald badge, count card, category filtering, and operational timeline in the drawer. But the tab treats opportunities as slightly-green incidents instead of a **revenue pipeline**. The rich opportunity data from `MultiPackResult` doesn't reach `ActionProjection`.

**Goal:** Reformulate the existing Actions page so the Opportunities tab feels like "where to gain money" instead of "what else to fix." No new page, no new sidenav entry — same Actions page, same visual language (card styles, font sizes, badge shapes, drawer structure, table layout), enriched conditionally when the user is on the Opportunities tab.

**Design decision:** No kanban board. The operational timeline already in the drawer handles status visualization. Status progression is handled by action buttons (Aceitar / Iniciar / Verificar) instead of drag-and-drop — the expected opportunity count per cycle (5-15) doesn't justify kanban overhead. An effort × impact scatter plot is included as an alternative view toggle (like Analysis page's grid/list toggle).

#### Fase 1 — Enrich ActionProjection with opportunity data

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **New fields on ActionProjection** | Add to [packages/projections/types.ts](../packages/projections/types.ts): `uplift_hypothesis: string \| null` (from `Opportunity.uplift_hypothesis`), `upside_score: number \| null` (from `Opportunity.raw_upside_score`), `value_case_basis: 'data_driven' \| 'heuristic' \| 'mixed' \| null` (from `Opportunity.value_case.basis_type`), `cluster_key: string \| null` (root_cause_key from matching `OpportunityCluster`), `cluster_count: number \| null` (finding count in the cluster). | Low |
| B | **Wire in projection engine** | In [packages/projections/engine.ts](../packages/projections/engine.ts), resolve new fields from `MultiPackResult.opportunities` and `composites.opportunity_compression` during `projectActions()`. Match via `decision_refs` overlap between ActionProjection source and Opportunity objects. Build cluster lookup from `OpportunityCompressionResult.clusters[]` keyed by finding_key. | Medium |

#### Fase 2 — Contextual summary cards

| # | Part | Description | Effort |
|---|------|-------------|--------|
| C | **Opportunity-specific hero cards** | When `activeTab === 'opportunity'`, replace the 4 summary cards with: (1) **Potencial Total** — sum of `value_case.range` (min–max) across non-archived opportunities, (2) **Capturado** — sum for `operational_status === 'verified'`, (3) **Em Execução** — sum for `accepted` + `implemented`, (4) **Esforço Médio** — distribution histogram of `effort_hint` values. Same card component, same dimensions, same font — only content and accent color (emerald) change. Incident tab keeps current red-framed loss cards. "All" tab shows a combined 2-row summary or the current generic cards. | Medium |

#### Fase 3 — Cluster grouping

| # | Part | Description | Effort |
|---|------|-------------|--------|
| D | **Collapsible root-cause clusters** | When `activeTab === 'opportunity'` and clusters exist (`cluster_key !== null` on any action): group actions by `cluster_key`, render each group as a collapsible section with header showing root cause title + finding count + combined impact range + "Aceitar cluster" button (advances all to `accepted`). Actions with `cluster_key === null` render below clusters as individual rows. Same table columns inside each cluster — no layout change, just grouping with a subtle border/indent. Collapse state per cluster in local component state. | Medium |

#### Fase 4 — Hypothesis inline

| # | Part | Description | Effort |
|---|------|-------------|--------|
| E | **Uplift hypothesis in table row** | For `category === 'opportunity'` rows, render `uplift_hypothesis` as a second line below `title` in zinc-500 text-sm. Same font family, same cell — just an extra line. In the drawer, render hypothesis in a dedicated card with emerald-500/10 background + emerald border, positioned before the Impact Breakdown section. Both conditional on `uplift_hypothesis !== null`. | Low |

#### Fase 5 — Status workflow

| # | Part | Description | Effort |
|---|------|-------------|--------|
| F | **Opportunity status transitions** | Replace the generic `resolve_path` button for opportunity actions with status-aware buttons: `identified/sized` → "Aceitar" (→ accepted) + "Descartar" (→ archived); `accepted` → "Iniciar" (→ implemented) + "Voltar" (→ sized); `implemented` → "Verificar" (triggers re-verify); `verified` → "Reabrir" (→ accepted). Button styling follows existing resolve button patterns (emerald for primary, zinc for secondary). | Medium |
| G | **Status persistence** | New `PATCH /api/actions/[id]/status` endpoint. Persists `operational_status` transitions. Storage: new `OpportunityTracking` Prisma model (`{ id, findingKey, environmentId, status, updatedAt, updatedBy }`) — lightweight, avoids polluting Finding model with workflow state. On next audit cycle, projection engine reads persisted status and carries it forward instead of resetting to `identified`. | Medium |
| H | **Auto-verify on improvement** | In projection engine: when a finding linked to an opportunity with `operational_status === 'implemented'` receives `change_class: 'improvement'` from the change report, auto-advance to `verified`. Feeds into Bragging Rights (3.11F) as captured value. | Low |

#### Fase 6 — Effort × Impact scatter

| # | Part | Description | Effort |
|---|------|-------------|--------|
| I | **Scatter plot view toggle** | Add a list/scatter toggle (same pattern as Analysis page view toggles) visible only on the Opportunities tab. Scatter renders a 2D plot: x-axis = `effort_hint` (5 discrete positions: trivial → very_high), y-axis = `value_case.range.max` (continuous, $ scale). Each dot = one opportunity, colored by `operational_status` (emerald=identified, blue=accepted, amber=implemented, green=verified). Dot click opens the drawer. Quadrant labels: "Quick wins" (low effort, high $), "Big bets" (high effort, high $), "Fill-ins" (low effort, low $), "Strategic" (high effort, low $). Lightweight — no charting library, SVG with positioned circles. | Medium |

#### Fase 7 — i18n

| # | Part | Description | Effort |
|---|------|-------------|--------|
| J | **Dictionary keys (4 languages)** | ~30 new keys across en/pt-BR/es/de in `console.actions.opportunities` namespace: summary card labels, cluster header template, hypothesis section label, status button labels, scatter quadrant labels, empty states per status group. pt-BR with real translation; es/de fallback to en. | Low |

**Total estimate:** ~22h (~3 days). Zero engine refactor — projection enrichment + conditional UI rendering within the existing Actions page structure.

**Visual language constraint:** All new elements (cards, badges, buttons, table rows, drawer sections, scatter dots) must use the same component library, color tokens, font sizes, spacing, and border radiuses already established in the Actions page. No new design primitives. The Opportunities tab should feel like a natural mode of the same surface, not a grafted-on feature.

**Files touched:** [packages/projections/types.ts](../packages/projections/types.ts), [packages/projections/engine.ts](../packages/projections/engine.ts), [src/app/app/actions/page.tsx](../src/app/app/actions/page.tsx), [src/app/api/actions/[id]/status/route.ts](../src/app/api/actions/) (new), [prisma/schema.prisma](../prisma/schema.prisma) (`OpportunityTracking`), [dictionary/en.json](../dictionary/en.json), [dictionary/pt-BR.json](../dictionary/pt-BR.json), [dictionary/es.json](../dictionary/es.json), [dictionary/de.json](../dictionary/de.json).

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
| **3** | Semantic Enrichment & New Lenses | LLM enrichment, cybersecurity, copy analysis pack, Shopify expanded, Stripe, **ads integrations (partial)**, workspace redesign, **workspace lens enrichment**, **opportunity-first actions** | 3.1-3.4 + 3.7 (F-H, L-R) + 3.7B + 3.9 (A-B, F, 4 compounds, 2 ctx signals) + 3.11 (~85%) ✅ — **3.5-3.6, 3.7 (I, M), 3.8 (A-C), 3.9 (C-E), 3.10 (A-P), 3.11B, 3.12 open** |
| **4** | Expansion & Depth | Cybersecurity Phase 2+3, pricing/structured data enrichment, Trust & Conversion lens, platform maturity | All open |
| **5** | Continuous Incremental Engine | Redis queue, worker service, leader election, activation flow, incremental engine, scheduler | Fases 1-3 ✅ — **Fase 4 (rollout) open** |

---

## What is NOT on this roadmap

Per the [North Star anti-drift commitments](NORTHSTAR.md):

- Competitive benchmarks based on ungrounded LLM knowledge
- AI analysis on every crawled page
- Explosion of packs without evidence depth to back them
- Transformation into a vulnerability scanner
- Finding count maximization
- Features that don't strengthen the value delivery loop: `finding → discussion/verification → action → resolved`
