# ROADMAP.md — Vestigio Development Roadmap

> Last updated: 2026-04-17
> Companion to: [NORTHSTAR.md](NORTHSTAR.md), [DEV_PROGRESS.md](../DEV_PROGRESS.md), [FINDINGS_OPPORTUNITIES.md](FINDINGS_OPPORTUNITIES.md), [COLLECT_OPPORTUNITIES.md](COLLECT_OPPORTUNITIES.md)
>
> **For completed work** (Waves 0, 1, 2.1–2.4, 3.1–3.3, 3.7B, 5 Fases 1–3, Marketing/SEO polish), see [COMPLETED_ROADMAP.md](COMPLETED_ROADMAP.md).

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
| Workspace Redesign — browser verification + real data wiring | **Partial** — engine done, frontend needs verification | Wave 3.11 |
| `integration_pull` executor | Scaffolded only | Wave 3 |
| `prisma db push` → `prisma migrate` | Pending | Wave 2.5 |
| Conversation export/branching | Not started | Wave 4.4 |
| Meta Ads + Google Ads OAuth app approvals | External — 1-6 weeks | Wave 3.9 |
| Prisma migration in prod for `syncMetadata` | Pending `npx prisma db push` | Wave 3.9 |

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

### 3.4 Composite Findings — High Leverage

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P1 |

Per [FINDINGS_OPPORTUNITIES.md § 7](FINDINGS_OPPORTUNITIES.md). These strengthen existing decisions, not create new findings.

| # | Composite | What it does | Surface |
|---|-----------|-------------|---------|
| A | Trust Surface Strength Score (FO-17) | Aggregate positive indicators into composite 0/N score. Enriches preflight readiness. | Preflight, Scale workspace |
| B | High-Blast-Radius Regression (CO-5) | Detect 3+ decisions regressing in same cycle with overlapping factors. Auto-creates incident. | Incident candidate, Preflight blocker |
| C | Opportunity Compression (CO-6) | Group findings by root cause where 3+ findings share remediation. Boost action priority. | Action re-ranking, MCP artifact |

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
| F | **Abandoned checkouts** | Fetch `/checkouts.json` (created_at filter, 90d window). Aggregate: abandonment_count, abandonment_rate, abandonment_value, avg_steps_before_abandon. Map to `CommerceContext.abandonment_rate` + `abandonment_value_monthly`. | Open |
| G | **Customers** | Fetch `/customers.json` (orders_count, total_spent). Aggregate: repeat_purchase_rate, new_vs_returning_ratio, avg_customer_lifetime_value. Map to `CommerceContext`. | Open |
| H | **Products** | Fetch `/products.json` (id, title, status, variants). Cross-reference with order line items. Identify: total_products, products_never_sold_30d (listed but 0 orders), top_products_by_revenue. Map to `CommerceContext`. | Partial — line_items wired (2026-04-17) |
| I | **Inventory levels** | Fetch `/inventory_levels.json` for products found on crawled pages. Identify: out_of_stock_promoted_count (product page exists in crawl inventory but stock = 0). Map to `CommerceContext`. | Open |

#### 3.7.4 New Findings & Signals

| # | Finding | Data source | Pack | Status |
|---|---------|-------------|------|--------|
| L | `checkout_abandonment_revenue_leak` — "Your checkout loses $X/mo in abandoned carts" | abandoned_checkouts | revenue_integrity | Open |
| M | `promoted_product_out_of_stock` — "Products on your site are out of stock, frustrating buyers" | inventory_levels + crawled pages | money_moment_exposure | Open |
| N | `high_refund_rate_eroding_revenue` — "Refund rate is X%, eroding $Y/mo in revenue" | refund data (real, not proxy) | chargeback_resilience | Open |
| O | `single_payment_gateway_risk` — "95%+ of payments go through one gateway — one outage stops all revenue" | payment_methods | money_moment_exposure | Open |
| P | `discount_abuse_pattern` — "X% of orders use discounts, leaking $Y/mo in margin" | discount data | channel_integrity | Open |
| Q | `low_repeat_purchase_rate` — "Only X% of buyers return — acquisition cost isn't being recovered" | customers | revenue_integrity | Open |
| R | `dead_weight_products` — "X products are listed but haven't sold in 30 days" | products + orders | revenue_integrity (action_value_map behavioral) | Partial — line_items wired |

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

**Current state:** Stripe is the primary billing provider (checkout, webhooks, subscription lifecycle). **But** we only use Stripe for billing ourselves — we don't read the customer's Stripe data for revenue intelligence the way we do with Shopify.

**Architecture:** Uses the same `IntegrationConnection` Prisma model and `IntegrationSnapshot<'stripe'>` pattern from 3.7.0. The `reconcileIntegrations()` function handles Shopify+Stripe overlap automatically.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **OAuth Connect flow** | Stripe Connect (Standard or Express) OAuth: let the customer connect their own Stripe account so we can read their revenue data. `/api/stripe/connect/auth` → `/api/stripe/connect/callback`. Scopes: `read_only` on charges, invoices, subscriptions. Uses the generic `IntegrationConnection` model from 3.7.1B. | Medium |
| B | **Revenue poller** | Fetch last 90d of charges/invoices/subscriptions. Compute: MRR, churn rate, avg revenue per customer, refund rate, failed payment rate, real dispute rate. Produce `IntegrationSnapshot<'stripe'>`. | Medium |
| C | **Settings UI** | "Connect Stripe" card alongside Shopify in Data Sources page. Same pattern as Shopify card. | Low |
| D | **Chargeback pack enrichment** | With real Stripe dispute data, the chargeback pack gets real dispute rates instead of Shopify's refund-rate proxy. `reconcileIntegrations()` prefers Stripe's `chargeback_rate` over Shopify's proxy when both present. | Low |
| E | **SaaS-specific fields** | Populate `CommerceContext.mrr`, `subscriber_churn_rate`, `failed_payment_rate` — Shopify can't provide these. | Low |

**Note:** This is about reading the **customer's** Stripe account for revenue intelligence — completely separate from our own Stripe billing integration which is already working.

---

### 3.9 Ad Platform Integrations — Meta & Google Ads

| | |
|---|---|
| **Tag** | `platform` `collection` `engine` |
| **Priority** | P1 |
| **Status** | **Partially shipped — 2026-04-17.** Full pipeline built: pollers (Graph API + GAQL), OAuth full-flow with CSRF protection, LGPD webhooks (data deletion + deauthorize for Meta), UI cards with Connect buttons in Data Sources, run-cycle wiring, KB articles, deployment docs. Graph foundation (Layer 1): ad_creative/ad_campaign node types, ad_targets/ad_funds edge types, 4 compound findings (dead destination, landing trust gap, form friction waste, mobile checkout degraded), 2 context signals (ad spend concentrated, ads without conversion tracking). 6 new inferences + impact baselines + root causes + remediation catalog. Dashboard AdSpendKpi widget reading syncMetadata. **Pending:** Meta Developer App Review approval (ads_read + business_management) + Google Cloud OAuth verification + Google Ads Developer Token. `npx prisma db push` for syncMetadata field. |

**Context:** Pulling actual ad creative text from ad platforms enables precise message-match analysis (does the landing page deliver what the ad promised?), ad spend waste quantification, and conversion attribution. This data also enriches the Copy Analysis Pack (3.10) with real ad creatives instead of UTM heuristics.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Meta Ads API integration** | ✅ Done — OAuth flow, Graph API poller, LGPD webhooks, UI card, KB article. **Pending:** Meta app review approval. | — |
| B | **Google Ads API integration** | ✅ Done — OAuth flow, GAQL poller, UI card, KB article. **Pending:** Google OAuth verification + developer token. | — |
| C | **Creative → LP matcher** | Match ad creatives to landing pages via: (1) destination URL exact match, (2) UTM campaign/content → creative ID mapping, (3) final URL domain + path pattern. Each matched pair becomes a `AdLpPair { creative_text, creative_cta, lp_url, lp_copy_elements }` fed to the Haiku analysis. | Low |
| D | **Precise message-match analysis** | Haiku call per `AdLpPair`: does the LP headline echo the ad promise? Does the LP CTA match the ad CTA type? Is the value prop consistent? Structured output with specific mismatch points and fix suggestions. New signal `ad_message_mismatch_detected`, new inference `landing_page_breaks_ad_promise`. | Low |
| E | **Ad spend waste signal** | Quantify message-mismatch findings in dollars: "This LP receives ~$X/day in ad spend but breaks the ad promise — estimated waste: $Y/mo." Uses `CommerceContext.ad_spend_by_platform` for real $ amounts. | Low |
| F | **Settings UI** | ✅ Done — Meta Ads + Google Ads cards in Data Sources page. | — |

---

### 3.10 Copy Analysis Pack — AI-Powered Copy & Funnel Alignment (Foundation Shipped)

| | |
|---|---|
| **Tag** | `engine` `collection` `docs` |
| **Priority** | P1 |
| **Status** | **Foundation shipped — 2026-04-11.** 4 enrichment types (`checkout_trust`, `cta_clarity`, `product_page_quality`, `pricing_page_framing`) produce `ContentEnrichmentPayload` evidence via Haiku. Signal extraction (`extractCopyEnrichmentSignals`) and inference functions wired. Tier 2 added 3 more signals at the engine level. Root cause `copy_strategy_gap` defined. Items E-F partially covered. A-D and G-P are the remaining work. |
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

### 3.11 Workspace Redesign — Perspectives + Transversal Lenses (Partial)

| | |
|---|---|
| **Status** | **Engine complete, frontend needs verification — 2026-04-12.** Backend: Pulse Summary API endpoint, `detectMaturityStage()` in `packages/classification/maturity.ts`, `groupByPerspective()` + `buildRevenueMap()` + `buildCycleDelta()` + `buildBraggingRights()` in `packages/projections/engine.ts`, `maturity_stage` field on `MultiPackResult`. Frontend: workspace page redesigned with 5 perspectives (Panorama, Receita, Confiança, Comportamento, Copy). 4 transversal lenses (PulseSummary, RevenueMap, CycleDelta, BraggingRights) as components. Perspective detail pages at `/workspaces/perspective/[slug]`. **Remaining:** wire new engine functions into frontend API routes so components get real data; browser verification. |

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
| A-F | **Engine functions** (maturity, pulse, perspectives, revenue map, cycle delta, bragging rights) | `engine` | — | ✅ Done |
| G | **Frontend: Workspace page redesign** | `frontend` | High | ✅ Built, needs browser verification |
| H-K | **Frontend: Lens components** (PulseSummary, RevenueMap, CycleDelta, BraggingRights) | `frontend` | — | ✅ Built, need real data wiring |
| — | **Wire engine functions into API routes** so lens components get real data | `frontend` | Medium | Open |
| — | **Browser verification** of the full workspace experience | `frontend` | Low | Open |

---

### 3.12 Opportunity-First Actions — Revenue Pipeline Surface

| | |
|---|---|
| **Tag** | `frontend` `engine` `platform` |
| **Priority** | P1 |
| **Status** | Open |

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
| **3** | Semantic Enrichment & New Lenses | LLM enrichment, cybersecurity, copy analysis pack, Shopify expanded, Stripe, **ads integrations (partial)**, workspace redesign, **opportunity-first actions** | 3.1-3.3 + 3.7B + 3.9 (partial) ✅ — **3.4-3.8, 3.10-3.12 open** |
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
