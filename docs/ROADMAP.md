# ROADMAP.md — Vestigio Development Roadmap

> Last updated: 2026-05-21 (Wave 20 + Wave 21 added — engine consolidation as forcing function for the always-on revenue protection layer. Grounded in the engine map at [ENGINE_MAP.md](ENGINE_MAP.md). Strategic context: "always-on revenue protection" thesis chosen, see memory.)
> Previously: 2026-05-13 (Wave 11 🟢 tier complete on workspace-specific + cross-cutting — Revenue 1/1, Preflight 4/4, Security 4/4, Copy 5/5, Cross-cutting 3/3 shipped. 17 widgets total. Behavioral 🟡 and 11.7d remain integration-gated.)
> Companion to: [NORTHSTAR.md](NORTHSTAR.md), [DEV_PROGRESS.md](../DEV_PROGRESS.md), [FINDINGS_OPPORTUNITIES.md](FINDINGS_OPPORTUNITIES.md), [COLLECT_OPPORTUNITIES.md](COLLECT_OPPORTUNITIES.md)
>
> **For completed work** (Waves 0, 1, 2.1–2.5, 3.1–3.20, 4.1, 4.2, 4.4, 4.6, 4.7, 5 Fases 1–3, Marketing/SEO polish), see [COMPLETED_ROADMAP.md](COMPLETED_ROADMAP.md).

> **2026-05-17 audit note**: A systematic audit on this date verified that ~30 P0/P1 items previously marked "Not started" or "Data flows but no signals" had actually been shipped silently across waves 18r-18u and earlier. Status markers have been corrected in-place. The pattern: implementation often shipped without roadmap maintenance. Future audits should grep before assuming "not started" claims are accurate.

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
| ~~Workspace Redesign~~ | **✅ Shipped 2026-04-27** — TrendSparkline on all workspace pages, action count badges (bidirectional links), dead-code annotations on unused engine functions, i18n. All layouts, lenses, enrichment, change summary hero already complete. | Wave 3.11 |
| Workspace Lens Enrichment — checklist-first views | **Fases 1-5 shipped 2026-04-27** — Chargeback Resilience (checklist + trust score), Revenue Intelligence (funnel map + opportunities), Security Posture (checklist), perspective-level enrichment, full i18n (4 languages). CommerceContext KPIs + Product Intelligence deferred until projection layer exposes integration data. | Wave 3.11B |
| ~~Shopify: promoted product cross-reference~~ | **✅ Fixed 2026-04-27** — `handle` added to product fetch, cross-ref with crawled URLs in poller, `promotedProductIds` now populated. Finding M fires. | Wave 3.7 |
| ~~Ad Platforms: Creative→LP matcher + message-match + waste signal (C-E)~~ | **✅ Shipped 2026-04-27** — `ad-message-match.ts` module (extractAdLpPairs, Haiku analysis, parseAssessment), new signal `ad_message_mismatch_detected`, inference `inferAdCreativeMessageMismatch`, root cause `ad_landing_promise_gap`, impact baselines, remediation catalog, run-cycle wiring. | Wave 3.9 |
| Meta Ads + Google Ads OAuth app approvals | External — 1-6 weeks | Wave 3.9 |
| Prisma migration in prod for `syncMetadata` | Pending `npx prisma db push` | Wave 3.9 |
| ~~Stripe Integration~~ | **✅ Shipped 2026-04-27** — OAuth Connect flow (authorize + callback), revenue poller (charges, subscriptions, MRR, churn, disputes, refunds, failed payments with pagination), sync route handler, run-cycle wiring, Data Sources UI (connect button, metrics display, sync/disconnect). Env vars: `STRIPE_CONNECT_CLIENT_ID`, `STRIPE_SECRET_KEY`. **Pending (external):** Stripe Connect platform approval. | Wave 3.8 |
| ~~Copy Analysis Pack~~ | **✅ Shipped 2026-04-28** — all 4 fases. Guidelines KB (80 guidelines from copywriting/CRO/marketing-psychology), 17 enrichment types total (5 existing + 8 new page-type + cross-page + pricing psychology + localization + micro-copy + SEO tension + staleness), 20+ signals, 12+ inferences, 7 root causes replacing `copy_strategy_gap`, copy_alignment_pack decision, CopyAlignment workspace, analyze_copy MCP tool + copy_audit playbook, ICP fields on BusinessProfile, i18n (4 langs). | Wave 3.10 |
| ~~Opportunity-First Actions — unified impact-ranked pipeline~~ | **✅ Shipped 2026-04-27** — all 6 fases complete. ActionProjection enriched with opportunity data, 2 tabs (Pipeline/My Actions) + filter bar, unified summary cards, type+upside badges, hypothesis inline + drawer card, ScatterPlot (effort × impact, 4 quadrants), OpportunityTracking Prisma model, PATCH status API, auto-verify on improvement, i18n (4 langs). | Wave 3.12 |
| ~~Re-engagement & Remediation — close the loop~~ | **✅ Fully shipped 2026-04-27** — Fases 1-3 (dashboard landing, CrossSignalHero, daily digest, Fix with AI in action drawer) + Fase 3I (Fix with AI in FindingDetailPanel with multi-action picker) + Fase 4 (i18n, 17 keys × 4 langs). Shared FixWithAiSection component extracted. | Wave 3.13 |
| Vestigio AI — Transversal Copilot | **Shipped 2026-04-22** — FAB with color orb + spring animation, full-height panel (side + full-screen expand), playbooks grid menu, CopilotProvider global state, SideDrawer coexistence, compact ChatInputBar with animated cycling placeholders, budget exhausted card, cross-domain pack insight bubbles during streaming, pack-aware ThinkingIndicator, voice message bubble, i18n (4 langs), chat removed from sidenav. | Wave 3.14 |
| ~~Cross-Signal Surface — making the moat visible~~ | **✅ Shipped 2026-04-27** — dedicated `/app/cross-signals` page, `GET /api/cross-signals` endpoint, CrossSignalsShell (hero stats, filters, chain cards), CrossSignalChainCard (expandable), temporal pattern detection (sequential vs simultaneous via cycleId), template-based narrative generator, sidebar nav entry, mock data, i18n (4 langs). CrossSignalHero dashboard widget enhanced with temporal patterns + narratives. | Wave 3.15 |
| Product Telemetry — measure before you change | **Shipped 2026-04-21** — ProductEvent model, useProductTrack hook, engagement score cron, admin product-analytics page. `prisma db push` applied to prod. | Wave 3.16 |
| ~~Upgrade Moments + Feedback Moments~~ | **✅ Shipped 2026-04-27** — PlanProvider + usePlan hook, UpgradeNudge (3 variants: inline/badge/blurred-overlay), FeedbackMoment (rating 5-star + NPS 0-10), useFeedbackMoment hook (3-layer cooldown: 48h/session/3-dismiss), NpsPulse 14-day pulse, copilot Pro pill badge, copilot upgrade nudge in empty state, copilot feedback after 3 messages, FindingDetailPanel 10s dwell trigger, WhatChangedCard cadence nudge, CrossSignalHero chain limiting for Starter, AdSpendKpi blurred preview, i18n (4 langs). | Wave 3.17 |
| ~~First-Audit Experience — value before data~~ | **✅ Shipped 2026-04-27** — FirstAuditProgress (5-stage emerald timeline, SSE-driven, business-type heuristic preview), FirstAuditCelebration (emerald glow dots overlay), wired into DashboardShell, i18n (4 langs). | Wave 3.18 |
| ~~Cancel Flow & Save Offers~~ | **✅ Shipped 2026-04-27** — CancelSurvey Prisma model, 3-step cancel page (`/app/settings/cancel`), dynamic save offers by reason (discount/pause/downgrade/support/roadmap), Paddle API integration (pause + cancel + discount), win-back email via Brevo, CancelSubscriptionButton in settings, i18n (4 langs). | Wave 3.19 |
| ~~Unified Entity Architecture~~ | **✅ Fases 1-3 shipped.** Fase 1 (2026-04-21): FindingDetailPanel, cross-refs, canonical URL, filter state. Fase 2 (2026-05-01): SavedView model, 4 default views (Phosphor icons), ViewSelector, `/app/findings`, sidebar simplification, redirect, SaveViewModal. **Fase 3 (2026-05-01):** ColumnSelector (9 toggleable columns, auto-save), share with team (UsersThree badge, read-only for non-owners), pin to sidebar (isPinned, max 5, usePinnedViews hook, colored dots in sidebar). | Wave 3.20 |
| `integration_pull` executor | Scaffolded only | Wave 3 |
| ~~`prisma db push` → `prisma migrate`~~ | **✅ Shipped 2026-04-27** — Baseline migration `0_init` generated from current schema, `migration_lock.toml` added, package.json scripts updated (`db:migrate:deploy`, `db:migrate:dev`, `db:push:dev`), deployment guide at `docs/PRISMA_MIGRATE.md`. One-time `prisma migrate resolve --applied 0_init` required on prod before next deploy. | Wave 2.5 |
| ~~Conversation export/branching~~ | **✅ Shipped 2026-05-01** — Branching (fork) already existed. Export: JSON/Markdown/CSV formats, `/api/conversations/[id]/export` endpoint, ExportDropdown in CopilotPanel header, i18n. | Wave 4.4 |
| ~~Neglected Findings~~ | **✅ Shipped 2026-05-01** — 6 findings: payment handoff dropoff (30%+ don't return), SaaS activation gap (heuristic proxy via first-action failure), oscillation clustering (same pair 3+ times), network error weighting (payment×3/measurement×2), mobile trust gap (trust degraded on mobile), behavioral micro-pattern cascade (2+ friction signals simultaneous). All with signals, inferences, root cause mappings, baselines, remediation, i18n. | Wave 4.6 |
| ~~Cross-Domain Compound Findings~~ | **✅ Shipped 2026-05-01** — 5 compound types (security_revenue_chain, ad_promise_reality_behavior, trust_hesitation_revenue, post_purchase_chain, brand_impersonation_revenue). Detection engine in `packages/composites/compound-findings.ts`, wired into recompute + projections (1.5x priority boost) + cross-signal narratives. CompoundInput lightweight type, confidence tiers (confirmed/likely/heuristic), multiplicative impact. i18n (4 langs). | Wave 4.7 |
| ~~Critical Fixes — Deep Analysis Issues~~ | **✅ All 15 fixed 2026-05-01** — 3 critical (pixel coverage gating, source expansion tagging, revenue=0 fallback), 5 earlier (mobile detection, embeddings, MCP schema×3), 7 remaining (behavioralContext wiring, Stripe signals, Ads consumption, Nuvemshop mapping, state machine, legacy scheduler, CycleType normalization). | Wave 7.11 |
| ~~24 Additional Bugs (Deep Code Review)~~ | **✅ All 24 fixed 2026-05-02** — 6 CRITICAL (trust score clickjack, formExcessive, coherence penalty, MCP tenant isolation, Nuvemshop OAuth, chat actions ownership), 10 HIGH (conversion_proximity, impact retention/loss, handoff_returned, pre-penalty actions, integration source detection, admin params, Stripe bulk-decrypt, config secret clearing, invite accept, SSE cache), 8 MEDIUM (coherence normalization, asymmetric uncertainty, policy abandon, revenue recovery gate, trust max_score, HMAC timing, fork author, budget TOCTOU). | Wave 7.11+ |
| ~~Activate Declared-but-Unimplemented Packs~~ | **✅ Shipped 2026-05-03** — Channel Integrity (`is_channel_integrity_compromised`), Discoverability (`is_discoverability_limiting_growth`), Brand Integrity (`is_brand_integrity_at_risk`): 3 `produceDecision()` calls added, 12 decision keys, workspace projections, perspective assignments, i18n (4 langs). Fixed missing `INFERENCE_TO_PACK` entries for `open_redirect_indicator` + Wave 4.1 cybersecurity findings. | Wave 7.12 |
| ~~Payment Health & Involuntary Churn Pack~~ | **✅ Shipped 2026-05-03** — 4 signals (`failed_payment_rate_elevated`, `subscriber_churn_rate_elevated`, `mrr_available`, `payment_health_data_present`), 3 inferences + 3 `InferenceCategory` enum values, 3 impact baselines, 2 root causes (`payment_infrastructure_weakness`, `subscriber_retention_failure`), 3 remediation entries, `INFERENCE_TO_PACK` mappings, pack decision gated on Stripe data, pack eligibility, question key `is_payment_health_creating_revenue_risk` with 3 outcomes, i18n (en + pt-BR). | Wave 8.1 |
| Content Freshness & Decay Pack | **Not started** — `copy_staleness` enrichment exists (Wave 3.10), `asyncGetNthRecent()` built but never called. Content half-life collapsed to 6 months in AI era. | Wave 8.3 |
| ~~Inventory backend — race & resilience bugs~~ | **✅ Shipped 2026-05-12** — `evidence_key` now UUID-backed (no Date.now()+counter collisions). Classification + edge-scoring chunked loops track rejections explicitly; >50% chunk failure stamps `AuditCycle.lastError`. Outer classification catch also stamps the error instead of swallowing it. | Wave 9.1 |
| Inventory backend — state-of-truth refactors | **Not started** — Residual from 2026-05-12 inventory hardening sweep. (a) 3 sources of truth for page state: `pageType` (regex), `classifiedPageType` (multi-signal), `freshnessState` — pick one as authoritative. (b) Carry-forward without source-hash verify — clones evidence rows without checking original cycle hash. (c) `Evidence.payload` is `@db.Text` JSON, re-parsed on every lookup — migrate to `Json` column. (d) Regex-first classification — regex is the always-available signal so it became primary instead of tiebreaker; rebalance the voter. | Wave 9.2 |
| ~~Inventory features parity vs Screaming Frog/Sitebulb~~ | **✅ Shipped 2026-05-13** — All four milestones: (M1) per-URL `discoverySource` tracking with 10 source types — homepage / homepage_link / critical_path / sitemap / robots_txt / redirect / pagination / internal_link / behavioral_event / manual; (M2) `skipReason` audit trail with 9 reason tags — over_budget / excluded / deduped / loop_detected / challenge / asset / fetch_failed / disallowed / aborted (over_budget + excluded + aborted are NOT persisted to keep inventory bounded); (M3) A/B test platform detection — 11 platforms via substring matching on script srcs + inline JS (Optimizely, VWO, Google Optimize, Convert, AB Tasty, Kameleoon, Adobe Target, Statsig, LaunchDarkly, GrowthBook, Split); (M4) hreflang-driven discovery of localized variants + numbered pagination (rel=next/prev plus inferred ?page=N / /page/N / /p/N, capped at 5 inferred per page). Load-more pagination (JS-triggered) deferred until customer demand — needs brittle button-selector heuristics. | Wave 9.3 |
| ~~Inventory frontend — polish residuals~~ | **✅ Shipped 2026-05-12** — Drawer surfaces `classificationSignals` as foldable Details with source/vote/weight per signal. Discovery sources now via `tDiscovery` (6 known labels + titleCase fallback). `isCommercialPageType` helper centralized in `lib/page-type-colors`; removed duplicate Set in inventory API. New `isDemoOrgCtx` helper consolidates the inline `orgType === "demo" \|\| orgId === "demo"` pattern (3 API routes refactored). Cycle banner already uses SSE for status — 10s polling left is just the cycle-discovery loop, which is the intended pattern. Bonus: status semantics reframed after user feedback to result-based (Live = 2xx/3xx, Down = 4xx/5xx, Not checked = fetch failed); inventory upserts now persist failed-fetch rows so Not checked actually populates. | Wave 9.4 |
| Inventory observability / alerting parity (Sentry/Datadog/Hotjar tier) | **Not started** — Competitive-gap residuals from 2026-05-11 inventory frontend audit. (a) Core Web Vitals per page (LCP/FID/CLS/INP) — needs the behavioral pixel to send `web-vitals` library output; today inventory only has server-side response time. (b) Page template grouping — cluster pages by template signature (same nav/footer/structure) so 200 product pages collapse to one "Product Template" row. (c) Alert rules per page — Vestigio fires a notification when `${metric}` on `${page}` crosses `${threshold}` (e.g. checkout response_time > 2s). (d) Compare across environments — diff staging vs production inventory side-by-side. (e) Page hierarchy / funnel view — group inventory rows by funnel stage with collapse/expand. | Wave 9.5 |
| ~~Workspaces UI/UX audit~~ | **✅ Shipped 2026-05-13** — All 7 fixes from the audit: (1) Cross-Signal pack labels switched from non-existent `console.analysis.packs` to `console.common.packs` (exists in en/pt-BR/es); (2) perspective page now has real `Panorama / [Perspective]` breadcrumb; (3) workspace-cards inside perspective now have icon + accent gradient + sparkline + hover state matching panorama design, plus locale-aware currency formatter (Intl.NumberFormat with `BRL`→`R$`, `EUR`→`€`, etc) across all 3 workspace pages; (4) Resumo Rápido grid collapses to single column when no change content + "None" severity translated via `tc("severity.{value}")`; (5) `<PulseSummary workspaceName findingIds />` rendered on workspace [id] page, API extended to accept those scope params and filter findings to the workspace's set (workspace-specific prompt); (6) Pulse prompts aligned to 3 sentences + `max_tokens` raised 150→300; (7) `useLocale()` replaces hardcoded `pt-BR` in PulseSummary client (fetch body + time formatter). | Wave 10 |
| Workspaces feature depth — kill widgets per workspace | **Not started** — Brainstorm 2026-05-13. ~35 ideated features distributed across 6 workspaces (revenue / chargeback / preflight / security / copy / behavioral) + 4 cross-cutting widgets. Each feature tagged with data dependencies (🟢 always available · 🟡 pixel · 🔵 Stripe · 🟣 e-commerce · 🔴 external integration · ⚪ manual). Standouts: "Dinheiro na mesa" report (revenue, 🟢), MRR trajectory dual-scenario (revenue, 🔵), VAMP/VDMP risk meter (chargeback, 🔵), "O que quebra em 10x" simulator (preflight, 🟢), Voice-of-customer copy alignment (copy, 🔴), top frustrating sessions (behavioral, 🟡). Each card must surface its locked state in-place (gradient-blurred preview + integration-specific CTA) when dependencies are missing — never hide. Full spec in Wave 11 detail section below. | Wave 11 |

---

## Wave 2 — Remaining

### 2.5 Prisma Migrate ✅ COMPLETE

| | |
|---|---|
| **Tag** | `infra` |
| **Priority** | P2 |
| **Status** | **Shipped 2026-04-27** |
| **What** | Project uses `prisma db push` (no migrations directory). Production data now exists. |
| **Fix** | Initialize `prisma migrate` with baseline migration from current schema. Update deploy docs. |
| **Deliverables** | `prisma/migrations/0_init/migration.sql` (baseline), `migration_lock.toml`, `docs/PRISMA_MIGRATE.md`, updated `package.json` scripts. |
| **Remaining** | One-time `prisma migrate resolve --applied 0_init` must be run against production before next deploy. |

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

### 3.8 Stripe Integration — Revenue Intelligence ✅ COMPLETE

| | |
|---|---|
| **Tag** | `platform` `collection` |
| **Priority** | P1 |
| **Status** | **✅ Fully shipped 2026-04-27.** Type-level foundation (StripeSnapshotData, IntegrationProvider, reconcileIntegrations, CommerceContext SaaS fields) already existed. **New:** OAuth Connect flow (`/api/integrations/stripe/authorize` + `/callback`), `workers/stripe/poller.ts` (charges, subscriptions, MRR, churn, disputes, refunds, failed payments — full pagination via `has_more`/`starting_after`, `Stripe-Account` header for connected accounts), sync route handler (`/api/integrations/sync` stripe case), run-cycle.ts wiring (polls alongside Shopify/Meta/Google, persists IntegrationSnapshot + syncMetadata), Data Sources UI (Stripe card configurable=true, OAuth connect button, connected state with MRR/dispute-rate/charge-count metrics, sync + disconnect). **Pending (external):** Stripe Connect platform approval + `STRIPE_CONNECT_CLIENT_ID` + `STRIPE_SECRET_KEY` env vars in production. Type-level foundation done: `StripeSnapshotData` interface, `IntegrationProvider` includes `'stripe'`, `reconcileIntegrations()` handles Stripe data (SaaS priority, dispute_rate wins over Shopify proxy, CommerceContext mrr/churn/failed_payment wired). Prisma model reuses `IntegrationConnection`. API CRUD routes accept `provider: "stripe"` (connect/disconnect/list). Settings UI card exists but `configurable: false`. **Missing:** OAuth Connect flow, Revenue poller, Sync route handler, Audit cycle wiring (~16-24h). |

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

### 3.10 Copy Analysis Pack — AI-Powered Copy & Funnel Alignment ✅ COMPLETE

| | |
|---|---|
| **Tag** | `engine` `collection` `docs` `frontend` |
| **Priority** | P1 |
| **Status** | **✅ Fully shipped 2026-04-28.** All 4 fases complete. 5 enrichment types (`policy_quality`, `checkout_trust`, `cta_clarity`, `product_page_quality`, `pricing_page_framing`) produce `ContentEnrichmentPayload` evidence via Haiku in `workers/ingestion/enrichment/semantic-enrichment.ts`. Signal extraction (`extractCopyEnrichmentSignals` at `signals/engine.ts:4662`) → 7 signals → 4 inferences → 1 root cause (`copy_strategy_gap`). **Expansion:** 8 new enrichment types (total 13), 7 root causes replacing the single `copy_strategy_gap`, guidelines KB distilled from professional copywriting/CRO/marketing-psychology frameworks, ICP-aware analysis, copy workspace, MCP tooling. |
| **Why after integrations?** | With Shopify/Stripe connected (3.7/3.8), copy analysis measures impact against **real revenue data**. With ad platform data (3.9), message-match compares **actual ad creative text** against landing page copy. The pack is 10x more valuable with integration data feeding it. |

**The thesis:** Most SaaS/ecommerce sites have copy that was written once and never audited against the actual ICP, funnel stage, or commercial intent of each page. The result is generic copy that doesn't convert — not because the product is bad, but because the words on the page don't match the buyer's mental state at that point in the journey. This pack turns Vestigio into a **copy strategist** that evaluates alignment between what the page says and what the page should say.

**Knowledge sources:** The guidelines KB distills professional frameworks from three domains:
- **Copywriting** — 13 headline formulas, CTA formula `[Verb]+[Value]+[Qualifier]`, 6-point style rules (simple/specific/active/confident/show/honest), page-type structure templates, natural transitions anti-patterns
- **Page CRO** — 7 conversion dimensions ranked by impact (value prop > headline > CTA > visual hierarchy > trust > objections > friction), page-type CRO frameworks, quick wins vs high-impact categorization, 70+ experiment ideas
- **Marketing Psychology** — 80+ mental models across 6 categories: buyer psychology (23 models: anchoring, framing, loss aversion, social proof, endowment effect, paradox of choice...), persuasion techniques (14: reciprocity, commitment, scarcity, authority...), pricing psychology (5: charm pricing, Rule of 100, Good-Better-Best, mental accounting...), behavioral design (8: Hick's Law, BJ Fogg, EAST, nudge theory...)

Each guideline is a structured object (`id`, `category`, `rule`, `good_example`, `bad_example`, `page_types[]`, `funnel_stages[]`, `psychology_models[]`) that the Haiku LLM cites in its analysis. **Page-type routing** ensures each Haiku call receives only the ~500-800 token subset relevant to that page type, keeping cost at ~$0.003/call.

**Requires:** Haiku LLM calls per commercial page (~$0.003/page). ~$0.04-0.06 per full audit with expanded enrichment types.

#### Enrichment types (5 existing + 8 new = 13 total)

| # | Enrichment type | What it analyzes | Target pages | Status |
|---|----------------|-----------------|-------------|--------|
| — | `policy_quality` | Policy clarity, ambiguity, regulatory gaps | Policy pages | ✅ Existing |
| — | `checkout_trust` | Trust language, security signals, guarantees | Checkout | ✅ Existing |
| — | `cta_clarity` | CTA count, clarity, competing actions | All commercial | ✅ Existing |
| — | `product_page_quality` | Description quality, benefit-to-feature ratio, objections | Product pages | ✅ Existing |
| — | `pricing_page_framing` | Plan recommendation, value framing, anchoring | Pricing | ✅ Existing |
| 1 | `homepage_hero` | Value prop in 5s, headline formula match, CTA specificity, multi-audience handling | Homepage, landing pages | New |
| 2 | `social_proof_placement` | Proof type (logo/testimonial/case study/metric), specificity, placement relative to CTA, attribution quality | All commercial | New |
| 3 | `objection_handling` | Common objections by vertical addressed? FAQ exists? Guarantee visible? Risk reversal near CTA? | Pricing, product, checkout | New |
| 4 | `urgency_scarcity` | Authentic vs manipulative scarcity. Timer, stock count, "limited" — ethical or dark pattern? Psychology: scarcity heuristic, loss aversion | Product, pricing, checkout | New |
| 5 | `onboarding_copy` | Welcome message, empty states, tooltips, quick-win guidance. Goal-gradient, IKEA effect, Zeigarnik | SaaS dashboard/app | New |
| 6 | `error_page_recovery` | 404/500/form error tone: technical vs human? Recovery path offered? | Error pages | New |
| 7 | `navigation_clarity` | Menu labels: descriptive or internal jargon? Hierarchy matches buyer mental model? Hick's Law compliance | All pages | New |
| 8 | `above_fold_density` | Content vs noise ratio above fold. Pop-ups, banners, competing elements diluting message? BJ Fogg: ability vs friction | All commercial | New |

#### Root causes (7 replacing single `copy_strategy_gap`)

| Root cause key | Operator title | When it fires | Psychology models |
|---------------|---------------|---------------|-------------------|
| `copy_funnel_misalignment` | "Your copy doesn't match where the buyer is in their journey" | Homepage uses BOFU language, checkout does pitch instead of confirming, landing page doesn't match traffic source | AIDA, buyer journey stages, message-match |
| `value_proposition_buried` | "Your value proposition is hidden or missing above the fold" | Hero section has no clear value prop, visitor can't tell what you do in 5s, benefit buried below slider | 5-second rule, first principles, curse of knowledge |
| `trust_copy_absent_at_decision` | "Buyers don't see trust signals when they're about to pay" | Checkout/pricing/product without guarantees, security badges, testimonials, refund policy | Authority bias, social proof, risk aversion |
| `social_proof_ineffective` | "Your social proof doesn't convince — it's generic or misplaced" | Unnamed testimonials, logos without context, case studies far from CTA, vague numbers | Bandwagon effect, mimetic desire, specificity bias |
| `cta_competing_or_unclear` | "Your call-to-action competes with itself or says nothing" | 3+ CTAs on screen, "Submit" instead of value-specific button, primary not visually dominant | Hick's Law, paradox of choice, activation energy |
| `objection_unaddressed` | "Key buyer objections go unanswered on the page" | Pricing without FAQ/guarantee, product without comparison/ROI, checkout without refund link | Regret aversion, status-quo bias, loss aversion |
| `copy_cross_page_inconsistent` | "Your pages contradict each other or shift tone" | Homepage promises "simple" but pricing is complex, product says "free" but checkout upsells, tone shifts between pages | Commitment & consistency, trust erosion |

#### Implementation items

**Fase 1 — Core engine (guidelines KB + enrichment + ICP + root causes)**

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Copy & CRO Guidelines Knowledge Base** | `packages/copy-analysis/guidelines.ts` — structured reference distilled from professional copywriting (13 headline formulas, CTA formula, 6-point style rules, page-type templates), page CRO (7 conversion dimensions, page-specific frameworks, 70+ experiment ideas), and marketing psychology (80+ mental models: anchoring, framing, loss aversion, social proof, Hick's Law, BJ Fogg, scarcity, reciprocity, pricing psychology). Each guideline: `{ id, category, rule, good_example, bad_example, page_types[], funnel_stages[], psychology_models[] }`. **Page-type routing**: each Haiku call receives only the ~500-800 token subset relevant to that page type. | Medium |
| B | **Copy extraction enrichment** | Extract `CopyElementsPayload` per commercial page: h1, subheadline, CTA texts, social proof elements, trust signals, urgency indicators, above-fold content, navigation labels. Extends existing parser evidence. | Low |
| C | **ICP profile input** | Add `icpDescription`, `targetIndustry`, `buyerSophistication` fields on `BusinessProfile` Prisma model. Optional — falls back to heuristic ICP detection from site content (business_model + detected patterns). Wire into enrichment context. | Low |
| D | **Haiku copy analysis per page** | For each commercial page, call Haiku with: copy elements, page funnel classification, ICP profile, and routed guidelines subset. Structured output: `CopyAnalysis { dimension_scores: Record<string, number>, issues: Array<{ dimension, guideline_cited, finding, suggestion, psychology_model? }>, strengths[], overall_grade }`. 8 new enrichment types (homepage_hero through above_fold_density). Cache by SHA256(copy_elements + guidelines_version). | High |
| E | **Expanded signals** | ~13 new signals beyond the 7 existing: `value_proposition_absent`, `value_proposition_below_fold`, `social_proof_generic`, `social_proof_misplaced`, `objection_unaddressed_at_decision`, `urgency_dark_pattern`, `urgency_authentic_absent`, `onboarding_no_quick_win`, `error_recovery_absent`, `navigation_jargon`, `above_fold_cluttered`, `copy_tone_inconsistent`, `headline_formula_weak`. Total: ~20 copy signals. | Medium |
| F | **Expanded inferences + 7 root causes** | Replace single `copy_strategy_gap` with 7 granular root causes. ~12 inferences mapping signals to root causes. Each root cause gets its own remediation catalog, impact baselines, and reasoning template. Wire `INFERENCE_TO_ROOT_CAUSE` mappings. | Medium |

**Fase 2 — Discovery layer (pack + workspace + MCP)**

| # | Part | Description | Effort |
|---|------|-------------|--------|
| G | **Decision pack** | New `copy_alignment_pack`. Pack question: `is_copy_aligned_with_commercial_intent`. Four tiers (aligned/minor_gaps/significant_gaps/misaligned). Pack joins `revenue_integrity` and `chargeback_resilience` in the decision engine. | Low |
| H | **Copy workspace** | `copy_alignment` workspace type. Shows: per-page copy grades (A-F), overall funnel alignment score, top issues by impact grouped by root cause, dimension radar chart (7 CRO dimensions), before/after suggestion previews from Haiku. Enrichment components follow 3.11B pattern. | Medium |
| I | **MCP integration** | New `analyze_copy` tool returns copy analysis for a given URL. New `copy_audit` playbook walks the user through a comprehensive copy review with recommendations. | Low |

**Fase 3 — High-value enrichments**

| # | Part | Description | Effort |
|---|------|-------------|--------|
| J | **Message-match integration** | Wire ad-message-match (3.9 C-E) into copy pack. Mismatch findings surface in copy workspace with ad creative context. `ad_landing_promise_gap` root cause already exists — link to `copy_funnel_misalignment` when triggered by ad data. | Low |
| K | **Cross-page narrative consistency** | Haiku call with copy elements from all commercial pages in sequence. Detect: contradictory promises, abandoned commitments, tone shifts, inconsistent naming. Feeds `copy_cross_page_inconsistent` root cause. Psychology: commitment & consistency principle. | Medium |
| L | **Pricing page psychology** | Specialized Haiku analysis using marketing-psychology pricing models: charm pricing detection (Rule of 100), anchoring effectiveness, decoy positioning (Good-Better-Best), plan naming psychology, value framing ($/day vs $/month mental accounting), objection handling. | Low |

**Fase 4 — Polish (incremental)**

| # | Part | Description | Effort |
|---|------|-------------|--------|
| M | **Localization quality** | For multi-locale sites, compare persuasive structure between primary locale and translations. Detect when translation preserved meaning but lost marketing intent (urgency, social proof specificity, CTA power). | Medium |
| N | **Micro-copy audit** | Extract and analyze form labels, error messages, button text, tooltips, empty states, confirmation messages. Psychology: friction reduction, goal-gradient, activation energy. | Low |
| O | **SEO vs conversion tension** | Cross-reference SEO audit data with copy analysis. Detect keyword-stuffed headlines or conversion-optimized copy invisible to Google. Tension detection: when SEO wins, conversion loses (and vice versa). | Low |
| P | **Copy staleness** | Detect outdated references: past dates, expired promotions, contradictory social proof numbers, seasonal language out of season, old screenshots, discontinued feature mentions. | Low |

**Cost estimate:** ~$0.04-0.06 per audit (13 enrichment types × ~$0.003/call + cross-page analysis). Items K-P can be implemented incrementally after core A-I.

**Implementation order:** Fase 1 (A-F, ~3-4 days) → Fase 2 (G-I, ~2 days) → Fase 3 (J-L, ~1-2 days) → Fase 4 (M-P, incremental).

**Files touched:** `packages/copy-analysis/guidelines.ts` (new), `workers/ingestion/enrichment/semantic-enrichment.ts` (8 new types), `packages/signals/engine.ts` (~13 new signals), `packages/inference/engine.ts` (~12 new inferences), `packages/intelligence/root-causes.ts` (7 new root causes replacing 1), `packages/impact/baselines.ts` (7 new baselines), `packages/projections/remediation-catalog.ts` (7 new entries), `packages/decision/engine.ts` (copy_alignment_pack), `prisma/schema.prisma` (ICP fields on BusinessProfile), `src/app/app/workspaces/[id]/page.tsx` (copy workspace enrichment), `apps/mcp/tools.ts` (analyze_copy), `apps/mcp/playbook-prompts.ts` (copy_audit), `dictionary/{en,pt-BR,es,de}.json`.

---

### 3.11 Workspace Redesign — Perspectives + Transversal Lenses ✅ COMPLETE

| | |
|---|---|
| **Status** | **✅ Fully shipped 2026-04-27.** Backend: All 5 engine functions fully implemented (`detectMaturityStage`, `groupByPerspective`, `buildRevenueMap`, `buildCycleDelta`, `buildBraggingRights`). Pulse Summary API endpoint working with real Haiku LLM calls + 1h cache. Frontend: Panorama page + 4 perspective detail pages (`/workspaces/perspective/[slug]`) fully built and navigable. All 4 lens components (PulseSummary, RevenueMap, CycleDelta, BraggingRights) render correctly. **Nuance:** PulseSummary is wired to real API; the other 3 lens components use **client-side derived logic** from `WorkspaceProjection[]` props instead of calling the engine functions — output is functionally equivalent but the engine functions (`buildRevenueMap`, `buildCycleDelta`, `buildBraggingRights`) are technically dead code. **Remaining:** browser verification only. The "wire engine functions into API routes" gap is cosmetic, not functional — components already produce correct output. |

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

### 4.1 Cybersecurity Pack — Phase 2 ✅ COMPLETE

| # | Finding | Status |
|---|---------|--------|
| A | Cookie security assessment | ✅ Already existed (signals/engine.ts:4334) |
| B | Information disclosure | ✅ Shipped 2026-05-01 — server version + error page detection, `inferInformationDisclosure` |
| C | Script supply chain / SRI | ✅ Shipped 2026-05-01 — `integrity` attr on ScriptPayload, `external_script_no_sri` signal, `inferScriptSupplyChainRisk` |
| D | Auth surface security | ✅ Shipped 2026-05-01 — `field_types` on FormPayload, password-as-text detection, `inferAuthSurfaceInsecure` |

---

### 4.2 LLM Enrichment — Pricing & Structured Data ✅ COMPLETE

| # | Enrichment | Status |
|---|-----------|--------|
| A | Pricing/offer clarity | ✅ Shipped 2026-05-01 — `pricing_offer_unclear` signal when model unknown or no recommended plan |
| B | Page purpose validation | ✅ Shipped 2026-05-01 — heuristic keyword alignment, `page_purpose_mismatch` signal, zero LLM cost |
| C | Structured data cross-validation | ✅ Shipped 2026-05-01 — JSON-LD parser, compares name/price/rating vs visible content, `structured_data_mismatch` signal |

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

### 4.6 Neglected Findings — Data Collected, Findings Missing ✅ COMPLETE

**Goal:** Extract high-impact findings from evidence the system already collects but doesn't use. Zero new collection infrastructure needed — only signal extraction + inference functions.

> **Status (2026-05-17 audit):** All six neglected-finding waves (A-F) verified shipped via grep on signal + inference engines. Spec preserved below for historical context.

---

#### 4.6A Payment Handoff Leakage (Pixel)

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P1 |
| **Effort** | Low (~1 day) |
| **Data source** | `BehavioralSessionPayload.handoff_without_return_count`, `handoff_without_confirmation_count` |
| **Status** | ✅ Shipped (verified 2026-05-17) — `packages/signals/engine.ts:4013` emits `payment_handoff_incomplete` |

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
| **Status** | ✅ Shipped (verified 2026-05-17) — `packages/signals/engine.ts:4028` emits `saas_activation_gap_heuristic`, inference at `packages/inference/engine.ts:4291` |

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
| **Status** | ✅ Shipped (verified 2026-05-17) — `packages/signals/engine.ts:3927` emits `surface_oscillation_before_dropoff` |

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
| **Status** | ✅ Shipped (verified 2026-05-17) — `packages/inference/engine.ts:4312` emits inference `network_error_weighted` with payment×3/measurement×2 weighting |

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
| **Status** | ✅ Shipped (verified 2026-05-17) — dual-source signals at `packages/signals/engine.ts:1877` (verification) + `:3161` (network), unified inference at `packages/inference/engine.ts:4329` |

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
| **Status** | ✅ Shipped (verified 2026-05-17) — `packages/signals/engine.ts:4067` + inference `packages/inference/engine.ts:4333` |

| # | Finding | Signal | Impact |
|---|---------|--------|--------|
| A | Sensitive field type abandonment breakdown | `sensitive_input_abandon_kinds[]` per field type (CPF, card, address, phone) | "68% of form abandonments happen at CPF field specifically — not generic 'form friction'" |
| B | Time-to-first-action benchmark | `time_to_first_commercial_action_ms` vs industry/traffic cohort | "Visitors take 47s to first commercial action. Benchmark for e-commerce: 12s. Landing page isn't connecting." |
| C | CTA render timing impact | `cta_rendered_late` events correlated with engagement rate | "CTA appears after user has already scrolled past — 40% of visitors never see primary CTA" |

---

### 4.7 Cross-Domain Compound Findings ✅ COMPLETE

**Goal:** Produce findings that are **only possible** because Vestigio sees data from 3+ sources simultaneously. These are the moat — no single-domain tool can replicate them.

> Existing compounds (3.4) combine 2 signals within the same domain. These combine evidence from fundamentally different collection methods (crawl × pixel × integration × browser verification).

> **Status (2026-05-17 audit):** All 5 compound finding types (A–E) verified shipped — `packages/composites/compound-findings.ts:494,587,667,758` covers `security_revenue_chain`, `ad_promise_reality_behavior`, `trust_hesitation_revenue`, `post_purchase_chain`, `brand_impersonation_revenue`. Detection wired into recompute + cross-signal narratives. Spec preserved below for historical context.

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
| **0** | Critical Pipeline Gaps | Onboarding auto-trigger, pixel ingest + worker, inventory auto-build, real inventory counts, verification UI wiring, finding persistence | ✅ All shipped |
| **1** | Core Experience Polish | Actions/Analysis/Inventory UX, billing, page tooltips, Stage D enrichment framework | ✅ All shipped |
| **2** | Knowledge, Members & Confidence | Knowledge base, invite flow, root cause refinement (33→27), confidence reframed, prisma migrate | ✅ All shipped |
| **3** | Semantic Enrichment, New Lenses & Product Experience | 20 sub-waves: integrations, copy analysis, workspace redesign, actions pipeline, copilot, cross-signal, telemetry, upgrade moments, cancel flow, saved views | ✅ All shipped |
| **4** | Expansion & Depth | Cybersecurity Phase 2, LLM enrichment, conversation export, neglected findings, cross-domain compounds | ✅ All shipped |
| **5** | Continuous Incremental Engine | Redis queue, worker service, leader election, activation flow, incremental engine, scheduler | ✅ Fases 1-3 shipped |
| **—** | Marketing/SEO | Homepage, /lp funnel, structured data, OG images, hreflang | ✅ All shipped |
| **7** | Scaling & Moat Deepening | ✅ 7.11 critical fixes (15+24 bugs), ✅ 7.12 activate 3 packs. Open: batch writes, CWV, trends, recovery, webhooks, maps | **Active** |
| **8** | New Analysis Packs | ✅ 8.1 Payment Health, ✅ 8.3 Content Freshness. Open: TBD | **Active** |
| **10** | Workspaces UI/UX Audit | 7 fixes: Cross-Signal i18n, perspective breadcrumb, unified card styling, Resumo Rápido fallback layout, workspace content depth, Pulse truncation, hardcoded locale | ✅ All shipped 2026-05-13 |
| **11** | Workspaces Feature Depth | ~35 widget ideas across 6 workspaces + 4 cross-cutting, each tagged with availability (🟢/🟡/🔵/🟣/🔴/⚪) and locked-state UX | **Active** |

---

## Wave 7 — Scaling & Moat Deepening

**Goal:** Address scaling bottlenecks, add demo-winning features, and deepen the competitive moat identified in the Deep Analysis Report.

---

### 7.1 Multi-Cycle Trend Analysis ⭐ ✅ COMPLETE

| | |
|---|---|
| **Tag** | `engine` `frontend` `mcp` |
| **Priority** | P1 |
| **Status** | ✅ Shipped (verified 2026-05-17) — `packages/projections/trend-engine.ts:84` exposes `TrendAnalysis` type with pattern classification; MCP tool `get_trend_analysis` wired at `apps/mcp/tools.ts:240,695` |
| **Effort** | ~1 week |

**Problem:** Only current vs previous cycle comparison exists. Users can't see "my checkout has been degrading for 3 weeks." No competitor offers trend-based regression detection.

**Architecture:** `CycleSnapshot` store already retains 10 cycles. `detectChanges()` does pairwise comparison. Need: multi-snapshot loop + pattern classification + MCP tool + visual component.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Trend engine** | `packages/projections/trend-engine.ts` — loads N snapshots, runs pairwise detectChanges in sequence, classifies finding patterns: `consecutive_regressions`, `gradual_degradation`, `sudden_spike`, `improving`, `stable` | Medium |
| B | **`get_trend_analysis` MCP tool** | Accepts `lookback_cycles` (3-20) + optional `filter_pattern`. Returns workspace-level trend + finding patterns with narratives | Low |
| C | **TrendAnalysisCard widget** | Dashboard widget showing 10-cycle sparkline + top pattern findings (consecutive regressions, sudden spikes) | Medium |
| D | **Findings page integration** | Trend badge on findings with patterns. Filter: `?trend=consecutive_regressions` | Low |

---

### 7.2 Revenue Recovery Tracker ⭐ ✅ COMPLETE

| | |
|---|---|
| **Tag** | `engine` `frontend` `mcp` |
| **Priority** | P1 |
| **Status** | ✅ Shipped (verified 2026-05-17) — `packages/integrations/revenue-recovery.ts` exports `RevenueRecoveryEstimate` + `computeRevenueRecovery`; MCP tool `get_recovery_impact` at `apps/mcp/tools.ts:255,753`; widgets `MoneyRecoveredTicker.tsx` + `RecoveryBreakdown.tsx` render strong_correlation/correlation/inconclusive tiers |
| **Effort** | ~1 week |

**Problem:** When a finding is resolved, we don't track if revenue actually improved. No "before/after" proof. Proves ROI and justifies subscription renewal.

**Architecture:** `attribution-confirmation.ts` already stamps `verifiedResolvedAt`. `MoneyRecoveredTicker` shows totals. Missing: revenue per cycle from integration snapshots, confidence scoring, before/after widget.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Revenue attribution engine** | `packages/integrations/revenue-attribution.ts` — correlates resolved actions with revenue deltas across cycles. Confidence: strong_correlation / correlation / inconclusive | Medium |
| B | **Enhanced MoneyRecovered widget** | Before/after per action, confidence badge, "3 strong / 2 correlated / 1 inconclusive" breakdown | Medium |
| C | **`get_recovery_impact` MCP tool** | "How much did fixing X actually recover?" — returns attribution with narrative | Low |
| D | **Revenue per cycle persistence** | Store integration revenue snapshot per cycle for before/after queries | Low |

---

### 7.3 Batch Evidence/Finding Persistence (Scaling) — ✅ SHIPPED

| | |
|---|---|
| **Tag** | `infra` |
| **Priority** | P1 |
| **Status** | **✅ Shipped (verified 2026-05-17)** — `packages/evidence/prisma-store.ts:137-220` implements `addMany()` via batched INSERT ON CONFLICT DO UPDATE. Batch size 80 (1600 params per statement, well under Postgres' 65535 limit). Deduplicates by `(cycleRef, evidenceKey)` before the INSERT to avoid 21000 errors. Comment in source explicitly cites Wave 7.3 with the achieved improvement (~10-15s → <500ms for 300 items, 10-50x). |
| **Effort** | ~2-3 days (delivered earlier — exact wave undocumented but commit history points to ~Wave 7.x) |

**Problem (solved):** `PrismaEvidenceStore.addMany()` previously looped individual upserts — N round-trips for N evidence items. With 300+ evidence items per cycle, persistence took 10-15s. Replaced with batched raw SQL.

**Implementation:** `$executeRawUnsafe()` with `INSERT INTO "Evidence" (...20 cols...) VALUES (...) ON CONFLICT ("cycleRef", "evidenceKey") DO UPDATE SET ...`. Chunked at 80 rows per statement. Dedup pass before insert. Identical pattern applied to Findings + Actions stores (also shipped).

---

### 7.4 Core Web Vitals from Playwright

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P2 |
| **Status** | Not started — Playwright already launched but doesn't extract CWV |
| **Effort** | ~3-4 days |

**Problem:** Vestigio has Playwright (Chromium) running on every full cycle but doesn't extract LCP, CLS, or INP. Lighthouse does; Vestigio should too.

**Fix:** Inject `web-vitals` library via `addInitScript()`, capture metrics post-navigation via `page.evaluate()`. New `CoreWebVitalsPayload` evidence type. New signals: `lcp_poor`, `cls_poor`, `inp_poor`. New inferences for performance-related findings.

---

### 7.5 Webhook-Triggered Audits (Deploy Integration)

| | |
|---|---|
| **Tag** | `platform` `infra` |
| **Priority** | P1 |
| **Status** | Not started — enqueueAuditCycle() already supports hot priority |
| **Effort** | ~2-3 days |

**Problem:** Cycle-based model misses between-cycle deploy regressions. ContentKing does real-time monitoring. Deploy webhook → immediate hot cycle → regression detection in minutes.

**Fix:** New `POST /api/webhooks/deploy` endpoint. HMAC auth (secret per environment). On POST: `enqueueAuditCycle(envId, 'hot')`. Supports GitHub Actions, Vercel, GitLab CI, custom. Returns `{ cycle_id, estimated_seconds }`.

---

### 7.6 ELK/Dagre Layout for Maps

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P2 |
| **Status** | Not started — custom column layout produces edge crossings |
| **Effort** | ~2 days |

**Problem:** `applyHierarchicalLayout()` uses fixed column x-coordinates with no edge routing. Maps with 20+ nodes have overlapping edges. Sitebulb has superior graphs.

**Fix:** Replace `applyHierarchicalLayout()` with `dagre.layout()` (LR direction). Keep current layout as fallback. Dagre handles edge routing, collision avoidance, and optimal node placement automatically.

---

### 7.7 Map Export (PNG/SVG)

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P2 |
| **Status** | Not started — React Flow v12 supports toImage() |
| **Effort** | ~1 day |

**Fix:** Add "Export" button in map header. Use `html2canvas` or React Flow's `toImage()` for PNG. Programmatic SVG serialization for SVG format. Include map title + timestamp in filename.

---

### 7.8 Custom Map Persistence

| | |
|---|---|
| **Tag** | `mcp` `frontend` |
| **Priority** | P3 |
| **Status** | `CustomMap` Prisma model exists, `buildCustomMap()` works, but result not persisted |
| **Effort** | ~1 day |

**Fix:** After `buildCustomMap()` returns, persist to `CustomMap` table. Add GET `/api/maps/custom/{id}` endpoint. "Save This Map" button in UI. Maps survive page reload.

---

### 7.9 Behavioral Delta Processing (Scaling)

| | |
|---|---|
| **Tag** | `infra` |
| **Priority** | P2 |
| **Status** | Not started — re-processes ALL 30d events every cycle |
| **Effort** | ~2-3 days |

**Problem:** `processBehavioralEventsForEnv()` reads all events in 30d window every cycle. Quadratic growth: O(N×M) with N events and M cycles.

**Fix:** Checkpoint-based delta processing. Add `lastBehavioralProcessedAt` on Environment. Only query events since last checkpoint. Load prior aggregate as baseline, merge delta, emit merged result. Fallback to full window on first run.

---

### 7.10 Maps Modernization — State of the Art ⭐

| | |
|---|---|
| **Tag** | `frontend` `engine` |
| **Priority** | P1 |
| **Status** | **✅ Mostly shipped (verified 2026-05-17)** — Phase 1 ✅ (dagre + 5 bezier edges + 9 modular nodes + page 324L vs target 400L). Phase 2 ✅ revenue heat overlay + mobile responsive shipped today; glass-morph + interactive legend + Framer Motion already in. Phase 3 ✅ (PNG/SVG export, Cmd+K search, severity filter w/ opacity-preserve, multi-select shift+click). Phase 4 (timeline animation, revenue particles, cycle comparison) ❌ not shipped — marketing/demo polish, optional. |
| **Effort** | ~2-3 weeks — most of it already invested across earlier waves |

**Problem:** Maps scored 7.0/10 in Deep Analysis. Layout quality 5/10 (fixed columns, edge crossings), mobile 4/10 (broken), interactivity 7/10 (no export/search/filter/multi-select). 2111-line monolith file. Edges are straight lines with no routing. Deprecated React Flow prop. Competitors (Sitebulb) have superior graph visualization.

**Target:** Production-grade, demo-winning graph visualization. Dagre layout with crossing minimization, bezier edges with animated strokes, modular component architecture, mobile-responsive canvas, revenue heat overlay (node size by $), interactive legend, export (PNG/SVG), severity filter, canvas search.

**Architecture target:**
```
packages/maps/
  ├── engine.ts (builders — keep)
  ├── layout/
  │   ├── dagre-layout.ts (LR + TB + custom ranks)
  │   └── layout-config.ts (spacing, padding, rank separation)
  └── types.ts (add edge routing types)

src/components/maps/
  ├── nodes/ (12 modular components)
  ├── edges/ (custom bezier edge components)
  ├── controls/ (toolbar, severity filter, search)
  ├── overlays/ (insight badges, revenue heat)
  └── MapCanvas.tsx (core wrapper, <500 lines)

src/app/app/maps/[mapId]/page.tsx (~300 lines, orchestration only)
```

#### Phase 1 — Layout + Edge Routing + Modularization (~1 week)

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | ~~**Dagre layout engine**~~ | ✅ Shipped — `packages/maps/engine.ts:120,234,338` + `packages/maps/layout/dagre-layout.ts`. LR rankSep 250-300px. | Medium |
| B | ~~**Custom edge components**~~ | ✅ Shipped — 5 of 5 components in `src/components/maps/edges/` (CausalEdge/ContributesToEdge/AddressesEdge/RedirectEdge use `getBezierPath`, TransitionEdge uses `getSmoothStepPath`). | Medium |
| C | ~~**Modularize nodes**~~ | ✅ Shipped — 9 of 9 node components in `src/components/maps/nodes/`. | Medium |
| D | ~~**Modularize page**~~ | ✅ EXCEEDED — `[mapId]/page.tsx` is **324 lines** vs target ~400. | Medium |
| E | ~~**Fix deprecated prop**~~ | ✅ Shipped — zero `edgesReconnectable` references. | Low |

#### Phase 2 — Visual Polish + Heat Overlay (~1 week) — ✅ COMPLETE

| # | Part | Description | Effort |
|---|------|-------------|--------|
| F | ~~**Revenue heat overlay**~~ | ✅ Shipped (today) — severity-driven scale + glow on finding/action nodes. | Medium |
| G | ~~**Glass morphism**~~ | ✅ Shipped — `backdrop-blur-md` on toolbar, search, and map header. | Low |
| H | ~~**Interactive legend**~~ | ✅ Shipped — `MapLegend.tsx` has `useState<activeFilter>` + `onFilterChange`. `legendFilter` in MapCanvas filters nodes/edges via opacity. | Medium |
| I | ~~**Framer Motion transitions**~~ | ✅ Shipped — `motion.div` in MapCanvas + JourneyOtherEventsNode. | Medium |
| J | ~~**Mobile responsive canvas**~~ | ✅ Shipped (today) — viewport-aware height, MiniMap hidden on mobile, touch gestures via React Flow defaults. | Medium |

#### Phase 3 — Features + Export (~3-4 days) — ✅ COMPLETE

| # | Part | Description | Effort |
|---|------|-------------|--------|
| K | ~~**Map export (PNG/SVG)**~~ | ✅ Shipped — `MapExportButton.tsx` (128L) with `html2canvas`. | Low |
| L | ~~**Canvas search (Cmd+K)**~~ | ✅ Shipped — `MapSearch.tsx` (195L) with `Cmd+K` keyboard binding. | Medium |
| M | ~~**Severity filter**~~ | ✅ Shipped — `SeverityFilter.tsx` (97L) with opacity-0.15 fading (preserves layout). | Low |
| N | ~~**Multi-select + batch discuss**~~ | ✅ Shipped — `selectedNodes` Set + `shiftKey` handler in MapCanvas. | Medium |

#### Phase 4 — Demo-winning features (optional, ~1 week)

| # | Part | Description | Effort |
|---|------|-------------|--------|
| O | **Funnel timeline animation** | Week-over-week journey evolution. Slider control shows funnel changes across cycles. Nodes grow/shrink based on conversion rate delta. **No competitor has this.** | High |
| P | **Revenue flow visualization** | Edge thickness proportional to $ flowing through that path. Animated particles (like Stripe's payment flow) showing money movement. | High |
| Q | **Comparison mode** | Side-by-side map comparison: "this cycle vs 3 cycles ago". Diff overlay shows new/removed nodes+edges. | Medium |

---

### 7.11 Critical Fixes — Issues from Deep Analysis ⭐ ✅ MOSTLY SHIPPED

| | |
|---|---|
| **Tag** | `engine` `mcp` `collection` `infra` |
| **Priority** | P0 |
| **Status** | ✅ Mostly shipped (verified 2026-05-17) — 14 of 15 sub-fixes verified shipped. Only 7.11K (delete legacy `apps/platform/audit-scheduler.ts`) still pending; the file remains in the tree as DEPRECATED but uncalled. |
| **Effort** | ~5-7 days total (15 fixes, 3 critical) |

**Source:** [DEEP_ANALYSIS_REPORT.md](DEEP_ANALYSIS_REPORT.md) — comprehensive investigation of 5 core modules.

| # | Fix | Module | What's Wrong | Status |
|---|-----|--------|-------------|--------|
| A | **Fix `mobile_session_count`** | Findings/Behavioral | `isMobileSession()` placeholder fixed; mobile classifier wired through. | ✅ Shipped (verified 2026-05-17) — `packages/behavioral/session-aggregator.ts:496` + `apps/audit-runner/process-behavioral.ts:561` populate `mobile_session_count` via device classifier |
| B | **Wire `behavioralContext` into compound findings** | Engine | `behavioralContext` now passed into `detectCompoundFindings()`. | ✅ Shipped (verified 2026-05-17) — `packages/workspace/recompute.ts:1357` passes `behavioralContext` as 3rd arg |
| C | **Wire embeddings to `search_findings` MCP tool** | MCP | Tool definition + executor wired. | ✅ Shipped (verified 2026-05-17) — `apps/mcp/tools.ts:232,672` defines + executes `search_findings` via `searchFindingsSync` |
| D | **Fix `get_decision_explainability` schema** | MCP | Enum now includes `saas_growth_readiness`. | ✅ Shipped (verified 2026-05-17) — `apps/mcp/tools.ts:58` includes `saas_growth_readiness` alongside scale_readiness_pack + revenue_integrity_pack |
| E | **Hide `integration_pull` from MCP tool schema** | MCP | Tool no longer registered. | ✅ Shipped (verified 2026-05-17) — zero `integration_pull` references in `apps/mcp/tools.ts` |
| F | **Fix SSE progress counter** | Audit Lifecycle | Counter now scoped to current cycle via PageInventoryItem rows. | ✅ Shipped (verified 2026-05-17) — `src/app/api/cycles/[id]/stream/route.ts:106-116` documents per-cycle counting |
| G | **Consume Stripe data in signal engine** | Engine | All signals + inferences + decision wired. | ✅ Shipped (Wave 18r/earlier) — `packages/signals/engine.ts:6383-6450` + `packages/inference/engine.ts:4339-4439` |
| H | **Consume Meta/Google Ads in signal engine** | Engine | 4 ad signals emitted from graph nodes. | ✅ Shipped (verified 2026-05-17) — `packages/signals/engine.ts:6625-6675` emits `ad_creative_dead_destination`, `ad_creative_landing_trust_gap`, `ad_creative_form_friction_waste`, `ad_creative_mobile_checkout_degraded` |
| I | **Map Nuvemshop-exclusive data into CommerceContext** | Engine | `reconcileCommerceContext()` now reads coupons/shipping/channels. | ✅ Shipped (verified 2026-05-17) — `packages/integrations/reconcile.ts:254-267` |
| J | **Clean up state machine inconsistency** | Audit Lifecycle | `CycleStatus` documents 4 production states + 3 deprecated states kept solely for DB backward-compat. | ✅ Shipped (verified 2026-05-17) — `packages/domain/audit-cycle.ts:25-51` |
| K | **Remove legacy scheduler artifact** | Audit Lifecycle | File still exists at `apps/platform/audit-scheduler.ts` (header marked DEPRECATED, no live callers). Deletion not performed. | ⚠️ Partial — marked deprecated, not yet removed |
| L | **Fix CycleType enum drift** | Audit Lifecycle | `CycleType` enum consolidated to 3 canonical (`hot`/`warm`/`cold`) + 3 legacy aliases with `normalizeCycleType()` mapping. | ✅ Shipped (verified 2026-05-17) — `packages/domain/enums.ts:59-84` |
| M | **Pixel coverage metadata** | Engine/Collection | `pixel_coverage_page_types` added to payload + gating signals. | ✅ Shipped (Wave 7.11M — commit 7a38f84) |
| N | **Source expansion tagging** | Engine | `change.reason = 'data_source_expanded'` distinguishes new-visibility findings from regressions. | ✅ Shipped (verified 2026-05-17) — `packages/change-detection/engine.ts:78` |
| O | **`monthly_revenue=0` fallback** | Engine | Replaced `\|\|` with `??` nullish coalescing so explicit `0` no longer falls back to $50k SMB default. | ✅ Shipped (verified 2026-05-17) — `packages/impact/engine.ts:289` |
---

#### 7.11B — Wire `behavioralContext` into Compound Findings (Fix B) ✅ COMPLETE

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P0 |
| **Status** | ✅ Shipped (verified 2026-05-17) — `packages/workspace/recompute.ts:1357` passes `behavioralContext` as 3rd arg to `detectCompoundFindings()` |
| **Effort** | ~2h |

**Problem:** `recompute.ts:913` passes `null` as the third argument to `detectCompoundFindings()`. The `detectAdPromiseRealityBehavior` detector in `compound-findings.ts:381-382` reads `behavioralContext?.bounce_rate` and `behavioralContext?.avg_session_duration` to upgrade compound confidence from `'heuristic'` to `'confirmed'` and compute precise excess-bounce impact. With `null` passed, **every** `ad_creative_message_mismatch` compound finding is permanently `'heuristic'` confidence and uses only a flat 25% ad spend waste estimate — even when the pipeline already computed rich behavioral cohort data earlier in the same cycle.

**What the data looks like:**
- `BehavioralCohortPayload.cohorts.paid_traffic` has `conversion_rate`, `backtrack_rate`, `hesitation_pause_rate`
- These are already computed in `processBehavioralEventsForEnv()` and present as `Evidence<BehavioralSession>` by the time `detectCompoundFindings()` runs
- The compound detector only needs `bounce_rate` (proxy: `1 - paid_traffic.conversion_rate`) and `avg_session_duration`

**Fix:**

| # | Step | File | Change |
|---|------|------|--------|
| 1 | Build `BehavioralContextForCompound` | `packages/workspace/recompute.ts` | Before line 913, extract `BehavioralSessionPayload` from evidence array (same loop at lines 388-401). Compute `{ bounce_rate: 1 - (payload.checkout_reached_rate \|\| 0), avg_session_duration: payload.avg_session_duration_ms / 1000 }` |
| 2 | Pass instead of `null` | `packages/workspace/recompute.ts:913` | `detectCompoundFindings(compoundInputs, commerceContext, behavioralCtx)` |
| 3 | Verify detector reads it | `packages/composites/compound-findings.ts:381-382` | Already reads `behavioralContext?.bounce_rate` — no change needed here |

**Result:** When behavioral data is available, ad-promise compound findings jump from `heuristic` → `confirmed` confidence. When absent, behavior unchanged (`null` → heuristic fallback preserved). **Zero regression risk.**

---

#### 7.11M — Pixel Coverage Metadata (Fix M) ✅ COMPLETE

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P0 |
| **Status** | ✅ Shipped (verified 2026-05-17) — Wave 7.11M shipped in commit 7a38f84 |
| **Effort** | ~4-6h |

**Problem:** When the behavioral pixel is installed on some pages but not others (e.g., homepage + pricing but NOT checkout), the engine produces **silently incorrect findings**:

- `checkout_reached_rate = 0%` → engine concludes nobody reaches checkout
- `conversion_rate = 0%` → engine concludes zero conversions
- `inferCheckoutAbandonmentRevenueLeak` may fire with "$X/mo lost" based on false data
- `inferHighIntentDetour` fires for all sessions (nobody "reached" checkout)
- All behavioral findings about checkout are factually wrong — it's not "zero conversions," it's "pixel isn't on conversion pages"

**Why it's silent:** There is no `pixel_coverage_page_types` field in `BehavioralSessionPayload` or `BehavioralCohortPayload`. The engine cannot distinguish "zero conversions" from "no visibility into conversions." No caveat is shown to the user.

**The session aggregator already has the data needed:** Every `RawBehavioralEvent` has a URL. The `Surface.page_type: SurfacePageType` classifies each URL as `homepage | checkout | pricing | product | cart | thank_you | ...`. The aggregator just never collects which page types it observed across all sessions.

**Fix:**

| # | Step | File | Change |
|---|------|------|--------|
| 1 | Add `pixel_coverage_page_types` field | `packages/behavioral/types.ts` | Add to `BehavioralSessionPayload`: `pixel_coverage_page_types: SurfacePageType[]` — the set of all `page_type` values observed across any session |
| 2 | Compute coverage in aggregation | `apps/audit-runner/process-behavioral.ts` | In `sessionsToBehavioralPayload()`, collect `Set<SurfacePageType>` from all session events' URLs. Map URLs → page types using the same `inferPageType()` from `run-cycle.ts:56`. Attach to payload. |
| 3 | Gate checkout-dependent signals | `packages/signals/engine.ts` | In behavioral signal extractors (lines ~3809, 3858, 3979, 5957), check `payload.pixel_coverage_page_types.includes('checkout')` before emitting checkout-rate signals. If checkout not covered: skip signal OR emit a `checkout_coverage_absent` signal instead |
| 4 | Gate checkout-dependent inferences | `packages/inference/engine.ts` | Inferences that read checkout behavioral signals (`inferHighIntentDetour`, `inferCheckoutAbandonNoFeedback`, `inferSensitiveInputAbandonment`) should check for the `checkout_coverage_absent` signal. If present: don't fire, or emit with `confidence: 15` + reasoning "checkout page not covered by pixel" |
| 5 | Surface coverage gap in UI | `frontend` (optional) | Show "Pixel not detected on: checkout, cart" warning in behavioral workspace header. Low effort, high trust. |

**Affected `SurfacePageType` values for gating:**

| Page Type | If NOT in coverage → suppress signals about... |
|-----------|------------------------------------------------|
| `checkout` | `checkout_reached_rate`, `conversion_rate`, `sensitive_input_abandon`, `checkout_abandon`, `handoff_without_return` |
| `cart` | `cart_to_checkout_rate` |
| `thank_you` | `confirmation_seen_rate`, `reached_thank_you` |
| `pricing` | `pricing_then_backtrack` (already correct — if pixel not on pricing, the event won't fire) |

**Result:** Findings that depend on page types NOT covered by the pixel are either suppressed or clearly caveated. Zero false positives from partial pixel coverage. Full backward compatibility when pixel covers all pages.

---

#### 7.11N — Change Detection Source Expansion Tagging (Fix N) ✅ COMPLETE

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P0 |
| **Status** | ✅ Shipped (verified 2026-05-17) — `packages/change-detection/engine.ts:78` sets `change.reason = 'data_source_expanded'` for new-source findings |
| **Effort** | ~4-6h |

**Problem:** When a user installs the pixel or connects an integration mid-lifecycle, the next audit cycle produces many new findings that are genuinely new *visibility* — not new *problems*. But the change detection system treats them identically to real site degradation:

1. `detectChanges()` in `change-detection/engine.ts:51-53` classifies any decision present in current but absent in previous as `new_issue` with `contributing_factors: ['First observation of this decision']`
2. All 7 behavioral workspace decisions enter as `new_issue` → dashboard shows "7 new issues"
3. Integration-powered findings (checkout abandonment, refund rate, etc.) enter as `new_issue` → "5 new issues"
4. **Worse:** The `revenue_path_regressed` synthetic inference at `recompute.ts:763-791` fires when `changeReport.regressions` has `severity >= notable`. These "new issues" can meet that threshold → a false regression inference is injected → the user sees "revenue path degraded" when nothing degraded

**The user experience:** "I installed the pixel to get more insights. Now my dashboard says everything is getting worse. This tool is broken."

**Fix:**

| # | Step | File | Change |
|---|------|------|--------|
| 1 | Track active source kinds per snapshot | `packages/change-detection/types.ts` | Add `active_source_kinds: SourceKind[]` to `CycleSnapshot` metadata. Populated from evidence at snapshot creation time in `recompute.ts`. |
| 2 | Detect source expansion | `packages/change-detection/engine.ts` | At the top of `detectChanges()`, compare `previous.active_source_kinds` vs `current.active_source_kinds`. Compute `newSources = current - previous`. |
| 3 | Tag new-issue reason | `packages/change-detection/engine.ts` | In `createNewIssueChange()` (line 231-250): accept optional `reason` param. When `newSources` is non-empty AND the decision's `question_key` relates to a new source (e.g., behavioral workspace question keys when `BehavioralSnippet` is a new source), set `reason: 'data_source_expanded'` instead of default. Add to `contributing_factors: ['First observation — new data source (behavioral pixel) connected this cycle']`. |
| 4 | Add `reason` field to `DecisionChange` | `packages/change-detection/types.ts` | `reason?: 'site_degradation' \| 'data_source_expanded' \| 'first_observation'` |
| 5 | Suppress false regression injection | `packages/workspace/recompute.ts:763-791` | In the regression injection block, filter `materialRegressions` to exclude changes where `reason === 'data_source_expanded'`. Only inject `revenue_path_regressed` for genuine site degradations. |
| 6 | UI distinction (optional) | `frontend` | In change summary hero (WhatChangedCard), show data-source-expansion findings with a distinct badge: "📊 New visibility" instead of "⚠️ New issue". Different color (blue info vs amber warning). |

**Mapping question_keys to source kinds for tagging:**

| New Source Kind | Question Keys to Tag as `data_source_expanded` |
|----------------|------------------------------------------------|
| `BehavioralSnippet` | All 7 behavioral workspace questions (`is_first_session_conversion_leaking`, `are_user_actions_driving_revenue`, etc.) |
| `Integration` (Shopify) | Commerce-dependent findings (`checkout_abandonment_revenue_leak`, `promoted_product_out_of_stock`, etc.) |
| `Integration` (Stripe) | Payment findings (future 8.1 pack: `is_payment_health_creating_revenue_risk`) |
| `Integration` (Meta/Google) | Ad findings (`ad_creative_message_mismatch`, etc.) |

**Result:** "7 new issues" becomes "7 new insights from behavioral pixel installation." No false `revenue_path_regressed` inference. Real site degradation still triggers true regression alerts. Full backward compatibility.

---

#### 7.11O — Fix `monthly_revenue = 0` Fallback in Impact Engine (Fix O) ✅ COMPLETE

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P1 |
| **Status** | ✅ Shipped (verified 2026-05-17) — `packages/impact/engine.ts:289` uses `??` nullish coalescing, not `\|\|` |
| **Effort** | ~30min |

**Problem:** In `packages/impact/engine.ts:233-235`, three lines use `||` (logical OR) instead of `!= null` for fallback:

```ts
const revenue = business.monthly_revenue || FALLBACK_INPUTS.monthly_revenue!;      // line 233
const transactions = business.monthly_transactions || FALLBACK_INPUTS.monthly_transactions!;  // line 234
const chargebackRate = business.chargeback_rate || FALLBACK_INPUTS.chargeback_rate!;   // line 235
```

When `monthly_revenue` is explicitly `0` (pre-revenue startup that entered $0 in business profile), JavaScript `0 || 50000` evaluates to `50000`. The engine silently uses the $50k SMB default. All impact estimates are inflated: a finding that should show "$0/mo impact" shows "$X,XXX/mo impact" based on phantom revenue.

Same issue for `monthly_transactions = 0` (→ falls back to 625) and `chargeback_rate = 0` (→ falls back to 0.01).

**Fix:**

| # | Step | File | Change |
|---|------|------|--------|
| 1 | Replace `\|\|` with `!= null` ternary | `packages/impact/engine.ts:233-235` | `const revenue = business.monthly_revenue != null ? business.monthly_revenue : FALLBACK_INPUTS.monthly_revenue!;` — same pattern for all three lines |
| 2 | Same fix in `mini-impact.ts` if present | `packages/impact/mini-impact.ts` | Check for same pattern with `FALLBACK_MONTHLY_REVENUE_BRL` (line 51) |

**Result:** Pre-revenue startups with $0 declared revenue get $0/mo impact estimates (correct). Startups that never entered revenue data (fields are `null`) still get the $50k fallback (preserved). **Zero regression risk** — only `0` changes behavior, `null` and positive numbers are unchanged.

---

### 7.12 Activate Declared-but-Unimplemented Packs ✅ COMPLETE

| | |
|---|---|
| **Tag** | `engine` `frontend` |
| **Priority** | P1 |
| **Status** | ✅ Shipped (verified 2026-05-17) — `packages/workspace/recompute.ts:505,518,531` call `produceDecision()` for `is_channel_integrity_compromised`, `is_discoverability_limiting_growth`, `is_brand_integrity_at_risk` |
| **Effort** | ~3-5 days total |

**Source:** Deep Analysis codebase exploration — 4 pack slots have gate logic, inference categories, root-cause entries, and projection mappings but NO decision pack wired in `recomputeAll()`. Findings surface via intelligence layer but have no workspace, no scoring, no copilot answer.

| # | Pack | Question Key | Existing Infrastructure | What's Missing | Effort |
|---|------|-------------|------------------------|----------------|--------|
| A | **Channel Integrity** | `is_channel_integrity_compromised` | Gate in `eligibility.ts`, 8+ inference categories (`PaymentSurfaceScriptExposure`, `ChannelHijackExposure`, `CommerceContinuityThreat`, `AbuseExposureConditions`, etc.), `INFERENCE_TO_PACK` mappings, root causes | `produceDecision()` call in `recomputeAll()`, workspace creator, i18n | 1-2d |
| B | **Discoverability** | `is_discoverability_limiting_growth` | Gate in `eligibility.ts`, 7 inference categories, projection mappings | Same as above | 1d |
| C | **Brand Integrity** | `is_brand_integrity_at_risk` | Gate in `eligibility.ts`, 6 inference categories (brand impersonation via `brandIntelScanPass`), projection mappings | Same as above | 1d |

---

### Open items (Wave 7)

| Item | Priority | Effort | Status |
|------|----------|--------|--------|
| **7.1** ~~Multi-Cycle Trend Analysis~~ | P1 | 1 week | **✅ Shipped (verified 2026-05-17)** |
| **7.2** ~~Revenue Recovery Tracker~~ | P1 | 1 week | **✅ Shipped (verified 2026-05-17)** |
| **7.3** ~~Batch Evidence Persistence~~ | P1 | 2-3 days | **✅ Shipped 2026-05-03** |
| **7.4** Core Web Vitals | P2 | 3-4 days | Not started |
| **7.5** Webhook-Triggered Audits | P1 | 2-3 days | Not started |
| **7.6** ~~ELK/Dagre Layout~~ | — | — | Subsumed by 7.10 Phase 1A |
| **7.7** ~~Map Export~~ | — | — | Subsumed by 7.10 Phase 3K |
| **7.8** Custom Map Persistence | P3 | 1 day | Model exists |
| **7.9** Behavioral Delta Processing | P2 | 2-3 days | Not started |
| **7.10** Maps Modernization | P1 | 2-3 weeks | Phase 1 foundation (@xyflow/react) shipped; Phases 2-4 pending |
| **7.11** ~~Critical Fixes (Deep Analysis)~~ | P0 | 3-5 days | **✅ Mostly shipped (verified 2026-05-17)** — 7.11K (delete legacy scheduler file) still pending |
| **7.12** ~~Activate Declared Packs (3)~~ | P1 | 3-5 days | **✅ Shipped (verified 2026-05-17)** |

**Implementation order:**
1. **7.11** Critical fixes (P0 — unblocks data consumption + fixes broken behavioral)
2. **7.12** Activate declared packs (low-hanging fruit — infrastructure already exists)
3. **7.3** Batch writes (unblocks scaling) + **7.5** Webhooks (deploy integration)
4. **7.1** Multi-cycle trends + **7.2** Revenue recovery (moat features)
5. **7.9** Behavioral delta (scaling) + **7.4** CWV (new findings)
6. **7.10** Maps Modernization (demo-winning)

---

## Wave 8 — New Analysis Packs

**Goal:** Add high-value decision packs that leverage Vestigio's unique multi-source data architecture. These packs produce compound findings that no single-source competitor can replicate.

> **Source:** Deep Analysis Report (2026-05-01) — market research, competitive landscape, codebase exploration. Packs ranked by compound value × feasibility.

---

### 8.1 Payment Health & Involuntary Churn Pack ⭐

| | |
|---|---|
| **Tag** | `engine` `frontend` `mcp` |
| **Priority** | P0 |
| **Status** | **✅ Mostly shipped** — see commits Wave 18r through Wave 18u. Remaining gaps: (a) MRR contraction cycle-over-cycle delta; (b) MCP `composePaymentHealthAnswer` business answer function; (c) dedicated workspace UI (low priority — generic renderer suffices); (d) `inferBillingPageFriction` compound (low priority). Verified by grep on 2026-05-17. |
| **Effort** | ~3-5 days (most already absorbed; ~1d remaining for genuine gaps) |

**Problem:** Involuntary churn accounts for 20-40% of all SaaS churn. $440B/year globally in failed payments. Stripe already returns `failed_payment_rate`, `subscriber_churn_rate`, and `mrr` into `CommerceContext` — but no signal extraction function reads them. Chargeflow/Redux focus on *recovery*; no one does *diagnosis* of why payment friction exists.

> **Status update (2026-05-17):** Eligibility (`isPaymentHealthEligible()` in `packages/classification/eligibility.ts`), decision wiring (`produceDecision({ question_key: 'is_payment_health_creating_revenue_risk', ... })` in `packages/workspace/recompute.ts:506`), action builder (`buildPaymentHealthActions` in `packages/decision/engine.ts`, Wave 18r), `INFERENCE_TO_PACK` mappings (3 keys, Wave 18r/18t-C), catalog + translations (pt-BR + 8 entries in en/es/de, Wave 18u), UI pack labels in findings page + ViewSelector inclusion, and `payment_health → 'decision'` journey stage in tools.ts are all shipped. Genuine remaining gaps are listed in the parts table below.

**Question key:** `is_payment_health_creating_revenue_risk`

**Gate:** Stripe integration connected (`IntegrationConnection.provider === 'stripe'`)

**Data sources (all already available):**

| Data | Source | Status in CommerceContext |
|------|--------|--------------------------|
| `failed_payment_rate` | Stripe poller | ✅ Populated, **never read by signal engine** |
| `subscriber_churn_rate` | Stripe poller | ✅ Populated, **never read by signal engine** |
| `mrr` | Stripe poller | ✅ Populated, **never read by signal engine** |
| `dispute_rate` | Stripe poller | ✅ Already consumed by chargeback pack |
| `single_payment_gateway_risk` | Inference | ✅ Already exists |
| Billing/account page UX | Crawl | ⚠️ Not classified as critical surface |

| # | Part | Description | Effort | Status |
|---|------|-------------|--------|--------|
| A | ~~**Signal extraction**~~ | `packages/signals/engine.ts:6383-6450` emits `failed_payment_rate_high`, `failed_payment_rate_elevated`, `subscriber_churn_elevated`, `subscriber_churn_rate_elevated`, `mrr_available`, `payment_health_data_present` from Stripe `commerce.*` fields. | Low | **✅ Shipped (Wave 18r)** |
| B | **Inference rules** (partial) | 3 of 4 shipped in `packages/inference/engine.ts:4339-4439`: `inferFailedPaymentRevenueDrain`, `inferSubscriberChurnUnsustainable`, `inferPaymentDiversityInsufficient` (plus extras: `inferSubscriberChurnElevated`, `inferFailedPaymentRateHigh`). 🟡 Remaining: `inferMrrContraction` (cycle-over-cycle delta) + 🟢 `inferBillingPageFriction` compound (billing-page quality × failed-payment rate, low priority). | Medium | 🟡 **Mostly shipped — MRR contraction pending** |
| C | ~~**Impact baselines**~~ | `failed_payment_rate × mrr × 12 = annual involuntary churn cost`. Real data from Stripe wired through impact engine. | Low | **✅ Shipped (Wave 18r)** |
| D | ~~**Pack decision**~~ | `produceDecision({ question_key: 'is_payment_health_creating_revenue_risk', ... })` in `packages/workspace/recompute.ts:506`. `isPaymentHealthEligible()` in `packages/classification/eligibility.ts`. `buildPaymentHealthActions` in `packages/decision/engine.ts`. `INFERENCE_TO_PACK` maps 3 keys → `payment_health`. 🟢 Dedicated workspace UI deferred (low priority — generic workspace renderer serves it today). | Low | **✅ Shipped (Wave 18r/18t-C)** |
| E | **MCP integration** | `payment_health` registered as `'decision'` journey stage in `apps/mcp/llm/tools.ts`. 🟡 Remaining: dedicated `composePaymentHealthAnswer` business-answer function (no pack-specific MCP answer composer yet). | Low | 🟡 **Partial — answer composer pending** |
| F | ~~**i18n**~~ | Catalog entries with translations: pt-BR + 8 entries each in en/es/de (Wave 18u). UI pack labels in findings page + ViewSelector include `payment_health`. | Low | **✅ Shipped (Wave 18u)** |

**Files touched:** `packages/signals/engine.ts`, `packages/inference/engine.ts`, `packages/impact/baselines.ts`, `packages/projections/remediation-catalog.ts`, `packages/projections/engine.ts` (INFERENCE_TO_PACK), `packages/workspace/recompute.ts`, `packages/classification/eligibility.ts`, `apps/mcp/answers.ts`, `apps/mcp/playbook-prompts.ts`, `dictionary/{en,pt-BR,es,de}.json`

**Why this pack first:** The data is already there. `failed_payment_rate` sits in CommerceContext unused. This is the highest ROI-per-effort pack possible.

---

### 8.3 Content Freshness & Decay Pack ✅ COMPLETE

| | |
|---|---|
| **Tag** | `engine` `frontend` `mcp` |
| **Priority** | P1 |
| **Status** | ✅ Shipped (verified 2026-05-17) — `packages/workspace/recompute.ts:573` produces decision for `question_key: 'is_stale_content_eroding_trust_and_visibility'`; 4 inferences pushed at inference engine lines 245-248 |
| **Effort** | ~1 week |

**Problem:** Content half-life collapsed from 18 to 6 months in 2026. AI-cited content is 25.7% fresher than Google organic. CTR drops 61% when AI Overviews appear. No audit tool detects content decay as a revenue problem — they show "content is old" but not "this old content is costing you $X/month."

**Question key:** `is_stale_content_eroding_trust_and_visibility`

**Gate:** Always eligible (content freshness detectable from any crawl)

**Existing foundation:**

| Component | Status |
|-----------|--------|
| `copy_staleness` enrichment type (Fase 4) | ✅ Exists — detects old dates, expired promotions, outdated screenshots, discontinued features |
| `PrismaSnapshotStore.asyncGetNthRecent()` | ✅ Built but **never called** — only `asyncGetLatest()` used |
| `PrismaSnapshotStore.asyncList()` | ✅ Built, returns up to 50 snapshots — **never called** |
| Change detection engine | ✅ Compares cycle-to-cycle — but only pairwise, not N-cycle trends |
| `PageInventoryItem` with freshness tracking | ✅ Exists |

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Temporal staleness scoring** | Use `asyncGetNthRecent(10)` to compare evidence across cycles. Pages unchanged for N cycles get `staleness_score = 1 - (1 / cycles_since_change)`. Pages with commercial intent + high staleness = priority finding. | Medium |
| B | **Content age extraction** | Extend `copy_staleness` enrichment to extract explicit dates from page content (copyright years, "last updated", blog dates). Compare against current date. Pages with dates >6 months old on competitive topics = decaying. | Low |
| C | **Revenue correlation** | Cross-reference stale pages with traffic data (if analytics integration exists) or behavioral session data. Stale page + high traffic + declining engagement = quantifiable revenue loss. Stale page + low traffic = already decayed. | Medium |
| D | **AI visibility scoring** | Heuristic: pages last updated >30 days ago on topics where AI Overviews appear are 25.7% less likely to be cited. Flag as "AI visibility risk." | Low |
| E | **Inference rules** | `inferCommercialPageStale` (commercial page unchanged >3 cycles), `inferContentDecayProgression` (N-cycle declining engagement), `inferPricingPageOutdated` (pricing page with old dates/stale competitive claims), `inferSocialProofExpired` (testimonials with old dates/names) | Medium |
| F | **Pack decision + workspace** | `produceDecision()`, content freshness workspace showing page-by-page staleness heatmap, N-cycle timeline of content changes | Medium |
| G | **MCP integration** | `get_content_freshness` tool, `content_refresh_audit` playbook | Low |
| H | **i18n** | 4 languages | Low |

**Files touched:** `packages/projections/trend-engine.ts` (if 7.1 ships first, reuse), `packages/change-detection/engine.ts` (N-cycle behavioral trend), `workers/ingestion/enrichment/semantic-enrichment.ts`, `packages/signals/engine.ts`, `packages/inference/engine.ts`, `packages/workspace/recompute.ts`

**Why this pack third:** The infrastructure exists (`copy_staleness` + snapshot store). The market changed (AI search compressed content half-life). The pack reuses multi-cycle trend analysis from 7.1 if shipped first.

---

### Open items (Wave 8)

| Item | Priority | Effort | Status |
|------|----------|--------|--------|
| **8.1** ~~Payment Health Pack~~ | P0 | 3-5 days | **✅ Shipped (Wave 18r-18u)** |
| **8.3** ~~Content Freshness Pack~~ | P1 | 1 week | **✅ Shipped (verified 2026-05-17)** |

**Wave 8.2 (Dark Pattern & Compliance Pack) removed 2026-05-17** — out of customer scope.

**Dependency:** ~~7.11G (Consume Stripe data in signal engine) should ship before 8.1, or be merged into 8.1A.~~ — Resolved: 7.11G shipped alongside 8.1A in Wave 18r.

---

## Wave 10 — Workspaces UI/UX Audit

**Goal:** Close visible UX gaps in `/workspaces` discovered in the 2026-05-13 audit. Bugs span i18n leaks, missing breadcrumbs, inconsistent card design language between sibling pages, layout fallback failures, and a Pulse Summary that truncates because of prompt/token conflicts. Each fix is small in isolation — but the cumulative perception of polish in the user's main daily-driver area is high-leverage.

---

### 10.1 Cross-Signal pack labels falling back to English

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P0 |
| **Status** | **✅ Shipped 2026-05-13** |
| **Where** | [`src/components/console/cross-signals/CrossSignalChainCard.tsx:78,113`](../src/components/console/cross-signals/CrossSignalChainCard.tsx#L78-L113) |
| **Symptom** | In `/workspaces` Cross-Signal card, pack names render as "Money Moment Exposure", "Scale Readiness", "Chargeback Resilience" even when the platform is in pt-BR. |
| **Cause** | Component calls `useTranslations("console.analysis.packs")` but that namespace **does not exist** in any dictionary (en, pt-BR, es — confirmed via JSON parse). `tp.has()` always returns false, fallback formats the raw key (`money_moment_exposure` → "Money Moment Exposure"). Same bug in all locales, only visible in pt-BR because the surrounding UI is translated. |
| **Fix** | Switch namespace to `console.workspaces.packs` (exists in [`pt-BR.json:1469`](../dictionary/pt-BR.json#L1469): "Postura de Segurança", "Prontidão para Escala", etc.). |
| **Effort** | 5min |

---

### 10.2 Perspective page has back-link, not breadcrumb

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P1 |
| **Status** | **✅ Shipped 2026-05-13** |
| **Where** | [`src/app/app/workspaces/perspective/[slug]/page.tsx:247-255`](../src/app/app/workspaces/perspective/%5Bslug%5D/page.tsx#L247-L255) |
| **Symptom** | When entering a perspective, breadcrumbs don't show all steps — just a `← Panorama` link. |
| **Cause** | Page renders a single `<Link>` "back to panorama" instead of a `<nav>` breadcrumb. Compare with [`workspaces/[id]/page.tsx:243-256`](../src/app/app/workspaces/%5Bid%5D/page.tsx#L243-L256) which has the correct pattern `Workspaces / [Perspective] / [Workspace]`. |
| **Fix** | Replace back-link with `<nav>` breadcrumb showing `Workspaces / [Perspective]`. |
| **Effort** | 15min |

---

### 10.3 Card design language drifts across `/inventory`, `/workspaces`, perspective

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P2 |
| **Status** | **✅ Shipped 2026-05-13** |
| **Where** | [`SummaryCards.tsx:176`](../src/components/console/SummaryCards.tsx#L176) (reference), [`workspaces/page.tsx:313`](../src/app/app/workspaces/page.tsx#L313), [`perspective/[slug]/page.tsx:360`](../src/app/app/workspaces/perspective/%5Bslug%5D/page.tsx#L360) |
| **Symptom** | Workspace cards inside perspective look "just like another card" — no gradient, no icon, no accent. Inventory header has a more polished card style. Perspective cards on the home are between the two. |
| **Cause** | Three different card implementations: (a) `SummaryCards` with `variantShadow` + gradient overlay + dot + sparkline; (b) perspective cards custom-built with accentBg + icon + sparkline; (c) workspace-inside-perspective cards: bare `rounded-2xl border border-edge bg-surface-card`. Also `fmtCurrency` in [`perspective/[slug]/page.tsx:78-82`](../src/app/app/workspaces/perspective/%5Bslug%5D/page.tsx#L78-L82) and [`workspaces/[id]/page.tsx:59-63`](../src/app/app/workspaces/%5Bid%5D/page.tsx#L59-L63) hardcodes `$` — should use org currency. |
| **Fix** | Either (i) create unified `PerspectiveCard` / `WorkspaceCard` components reused by all three pages, or (ii) reuse `SummaryCards` directly. Add accent dot/border, icon, colored shadow, sparkline, and locale-aware currency to all card variants. |
| **Effort** | 2-3h |

---

### 10.4 Resumo Rápido orphaned + "None" rendered in English

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P1 |
| **Status** | **✅ Shipped 2026-05-13** |
| **Where** | [`src/app/app/workspaces/[id]/page.tsx:305-338`](../src/app/app/workspaces/%5Bid%5D/page.tsx#L305-L338) |
| **Symptom** | Quick Stats / Resumo Rápido section confined to right 2fr column with empty space on left. "Maior Severidade" card shows "None" in English even in pt-BR. |
| **Cause** | Grid `lg:grid-cols-[3fr_2fr]` always assigns Quick Stats to right column. When workspace has no `change_summary` and no `workspaceChanges`, left column renders empty `<div />` (line 319). On [line 331](../src/app/app/workspaces/%5Bid%5D/page.tsx#L331), value renders as `topSeverity.charAt(0).toUpperCase() + topSeverity.slice(1)` — produces literal "None" instead of `tc("severity.none")`. |
| **Fix** | (a) When left column has no content, collapse grid to `lg:grid-cols-1` so Resumo Rápido goes full-width OR replace empty side with something informative. (b) Replace string capitalization with `tc("severity.{topSeverity}")` (chave já existe em `console.common`). |
| **Effort** | 15min |

---

### 10.5 Workspace `[id]` page lacks the widgets that make panorama useful

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P1 |
| **Status** | **✅ Shipped 2026-05-13** |
| **Where** | [`src/app/app/workspaces/[id]/page.tsx`](../src/app/app/workspaces/%5Bid%5D/page.tsx) (no `PulseSummary` import) |
| **Symptom** | Individual workspaces (e.g. "Análise de faturamento") only show: change summary + quick stats + domain enrichment + findings table. No Pulse, no Cross-Signal, no Revenue Map. Page feels like "just a finding table with a header." |
| **Cause** | The detail page never imports `PulseSummary`, `CrossSignalSection`, `RevenueMap`, `CycleDelta`, `BraggingRights` — all present in the panorama [`workspaces/page.tsx:272-292`](../src/app/app/workspaces/page.tsx#L272-L292) and in the perspective page. |
| **Fix** | Add (in order of leverage): (a) `<PulseSummary workspaceId={ws.id} />` — extend `/api/workspace/pulse-summary` route to accept a `workspaceId` parameter and build a prompt scoped to that workspace's findings; (b) `<CrossSignalSection>` filtered to this workspace's findings; (c) `<RevenueMap workspaces={[workspace]}>` in the same asymmetric layout as siblings; (d) Top Actions strip (data already computed in `linkedActionCount` at line 181 but not rendered). |
| **Effort** | 1-2h |

---

### 10.6 Pulse Summary truncated by max_tokens + prompt conflict

| | |
|---|---|
| **Tag** | `mcp` |
| **Priority** | P0 |
| **Status** | **✅ Shipped 2026-05-13** |
| **Where** | [`src/app/api/workspace/pulse-summary/route.ts:70,122-123,261`](../src/app/api/workspace/pulse-summary/route.ts#L70) |
| **Symptom** | Vestigio Pulse often cuts off mid-sentence — summary doesn't render the whole briefing. |
| **Cause** | Three-way contradiction in the prompt + token budget: (a) line 70 system says "STRICT LENGTH: 2-3 sentences, maximum 280 characters"; (b) line 122-123 user says "Write a **3-4 sentence** briefing"; (c) `max_tokens: 150` on line 261 (~100 words of pt-BR output, very tight). Haiku tries to satisfy the user prompt and gets cut at the token cap. Truncation is **server-side**, not client — `PulseSummary.tsx` has no `line-clamp` or `max-h`. |
| **Fix** | Align both prompts to the same target (e.g. 3 sentences / 400 chars) and bump `max_tokens` to 300. |
| **Effort** | 10min |

---

### 10.7 Hardcoded `pt-BR` locale in PulseSummary client

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P2 |
| **Status** | **✅ Shipped 2026-05-13** |
| **Where** | [`src/components/console/PulseSummary.tsx:28,68`](../src/components/console/PulseSummary.tsx#L28) |
| **Symptom** | Users with locale `en`/`es`/`de` still get pt-BR briefing; clock timestamp also formatted in pt-BR. |
| **Cause** | Line 28: `body: JSON.stringify({ perspective: ..., locale: "pt-BR" })` — hardcoded. Line 68: `toLocaleTimeString("pt-BR", { ... })` — also hardcoded. |
| **Fix** | Read current locale via `useLocale()` from `next-intl` and pass into both calls. |
| **Effort** | 10min |

---

### Implementation order (Wave 10)

| # | Fix | Severity | Effort |
|---|---|---|---|
| 10.1 | Cross-Signal pack namespace | P0 (visible English in all locales) | 5min |
| 10.6 | Pulse max_tokens + prompts | P0 (core UX broken) | 10min |
| 10.7 | PulseSummary locale hardcoded | P2 (i18n leak) | 10min |
| 10.4 | Resumo Rápido layout + None i18n | P1 (visible) | 15min |
| 10.2 | Perspective breadcrumb | P1 | 15min |
| 10.5 | Workspace [id] content depth | P1 (value gap) | 1-2h |
| 10.3 | Unified card styling | P2 (consistency) | 2-3h |

---

## Wave 11 — Workspaces Feature Depth

**Goal:** Each workspace today is descriptive (findings table, checklist, score). Wave 11 turns each workspace into a **decision surface** with at least one "killer widget" that answers a business question the user couldn't formulate on their own. The user complaint that motivated this: *"workspaces trazem pouca informação útil — só resumo de issues, funil e tabela."*

**Design principle:** every widget must (a) be predictive or prescriptive, not descriptive; (b) tie observation to a dollar amount or risk threshold; (c) have a clear next action.

### 11.0 Availability tiers & locked-state contract

Every widget must declare its data dependencies up-front, and **never hide** when deps are missing — instead show a gradient-blurred preview of what the widget would render, with a contextual CTA pointing to the integration page. This mirrors the existing pattern at [`workspaces/page.tsx:319`](../src/app/app/workspaces/page.tsx#L319) where locked perspective cards route to `/app/settings/data-sources`.

| Tier | Meaning | Locked CTA |
|---|---|---|
| 🟢 | Always available — derived from Vestigio crawl, findings, or LLM. No external dependency. | n/a |
| 🟡 | Requires Vestigio Pixel active. | "Activate the Vestigio Pixel to see X" → `/app/settings/data-sources#pixel` |
| 🔵 | Requires Stripe Connect (Wave 3.8). | "Connect Stripe to unlock X" → `/app/settings/data-sources#stripe` |
| 🟣 | Requires e-commerce integration (Shopify or Nuvemshop, Wave 3.7). | "Connect Shopify/Nuvemshop to see X" → same path |
| 🔴 | Requires external integration not yet in product (support tool, observability, etc.). Build the integration as part of the feature. | "Connect [Intercom/Zendesk/...] to enable X" — integration may need building first |
| ⚪ | Requires manual input (uploaded transcripts, configured competitors, etc.). | Inline upload/configure CTA |

**Locked-state visual pattern:** the widget renders at full size with a `backdrop-blur-sm`+ `bg-surface-card/40` overlay showing a faded mock version of the chart/data, a lock icon, a one-line value prop ("Recover lost MRR with..."), and a primary CTA button. This is the same pattern as the existing `UpgradeNudge` blurred-overlay variant from Wave 3.17.

---

### 11.1 Revenue (Análise de Faturamento)

#### a. "Dinheiro na mesa" report ⭐ 🟢 — ✅ Shipped 2026-05-13
- **What:** Single-screen synthesis showing the dollar amount currently being lost, decomposed by cause (checkout friction, message misalignment, payment failures, etc.). Top 3 fixes ranked by ROI with explicit timelines: "fix X → recover $Y/mo within 14 days". Replaces today's abstract finding list with a money-first headline.
- **Data deps:** Vestigio findings + impact baselines (already computed). No external integration.
- **Locked state:** n/a — always renders. Empty state when there are no loss-role findings.
- **Effort:** 1-2 days (heavy on copy + ranking logic; data is already there).
- **Implementation:** `src/components/console/workspace/MoneyOnTheTable.tsx`. Filter to `polarity === "negative" && impact.role === "loss"`. Buckets group by `root_cause` (top-4 + "Others (N)"). Top-3 are individual findings sorted by `impact.midpoint`. Effort tier from `estimated_effort_hours` (hours/days/weeks/TBD). i18n key: `console.workspaces.detail.money_on_table.*` × 4 locales. Wired into workspace `[id]` (revenue + chargeback types) and the revenue perspective page.

#### b. MRR Trajectory dual-scenario ⭐ 🔵
- **What:** Line chart with two paths from today forward — solid line if no action is taken (extrapolated from current MRR decay), dashed line if top-3 actions ship (using impact estimates). Creates tangible urgency around inaction.
- **Data deps:** Stripe MRR + churn data (Wave 3.8) + Vestigio impact estimates.
- **Locked state:** Blurred line chart preview + "Connect Stripe to see your MRR trajectory" CTA → `/app/settings/data-sources#stripe`. For Paddle-only customers (no Stripe), CTA changes to "Coming soon — Paddle integration on roadmap".
- **Effort:** 2-3 days.

#### c. Pricing leakage map 🟣
- **What:** Heatmap of pages with discount applied vs full-price catalog price. Surfaces which surfaces are selling below potential (e.g. landing page shows $99 but checkout auto-applies 30% coupon).
- **Data deps:** Product/price data from Shopify/Nuvemshop (Wave 3.7) + Vestigio crawl of pricing pages.
- **Locked state:** Blurred preview + "Connect Shopify or Nuvemshop to map your pricing leakage" CTA.
- **Effort:** 2 days.

#### d. Cart abandonment heatmap por etapa 🟡
- **What:** Bar chart of conversion rate per checkout step (Cart → Address → Payment → Confirm). Identifies which step kills conversion. Each step clickable to drill into the failing field/element.
- **Data deps:** Behavioral pixel + checkout flow detection (already present via `payment` page type classification).
- **Locked state:** Blurred funnel preview + "Activate the Vestigio Pixel to track checkout drop-off" CTA → pixel install instructions.
- **Effort:** 2-3 days (needs funnel detection refinement).

#### e. Concentração de receita 🔵
- **What:** Pareto chart showing % of MRR from top N customers. Flags single-point-of-failure risk ("50% of MRR comes from 3 customers — losing 1 wipes out a quarter").
- **Data deps:** Stripe customer-level MRR data (Wave 3.8).
- **Locked state:** Blurred Pareto preview + "Connect Stripe to assess revenue concentration" CTA.
- **Effort:** 1-2 days.

#### f. Refund clustering 🔵
- **What:** Auto-grouped refund reasons by surface, product, and customer segment. Detects patterns: "32% of refunds last month came from `/pricing` cohort — likely pricing/value mismatch".
- **Data deps:** Stripe refund data with reason codes (Wave 3.8).
- **Locked state:** "Connect Stripe to cluster your refunds" CTA.
- **Effort:** 2 days (clustering heuristic + UI).

---

### 11.2 Chargeback (Análise de Chargeback)

#### a. VAMP/VDMP risk meter ⭐ 🔵
- **What:** Gauge showing your dispute rate vs Visa VAMP (0.65% monitoring, 0.9% standard, 1.5% excessive) and Mastercard MATCH thresholds. The "danger imminence" that no other tool surfaces. Includes "days until threshold breach" projection.
- **Data deps:** Stripe disputes API with monthly volume (Wave 3.8).
- **Locked state:** Blurred gauge + "Connect Stripe to monitor your card-network risk" CTA. Explicitly call out the stakes: "Crossing 1.5% triggers card-network programs that cost $25K-$100K/year in fines."
- **Effort:** 2 days.

#### b. Dispute defense readiness per transaction ⭐ 🔵
- **What:** For each recent high-risk transaction, show the evidence you'd have if it became a dispute: TOS clickwrap ✓, AVS match ✓, IP geolocation ✓, delivery confirmation ✗. Outputs an estimated win rate: "You'd win 60% of cases at current evidence levels — closing the ✗ gaps raises it to 80%."
- **Data deps:** Stripe transaction data + Vestigio crawl evidence (TOS page presence, checkout fields, etc.).
- **Locked state:** "Connect Stripe to assess your dispute defense" CTA.
- **Effort:** 3-4 days (evidence-mapping logic is the heavy lift).

#### c. Time-to-dispute distribution 🔵
- **What:** Histogram of days between purchase and dispute. Buckets segment strategy: 0-3 days = fraud (need fraud rules); 30-60 days = buyer remorse / UX (need clearer expectations); 90+ days = friendly fraud (need better dispute response).
- **Data deps:** Stripe dispute events with timestamps.
- **Locked state:** "Connect Stripe to see dispute timing patterns" CTA.
- **Effort:** 1 day.

#### d. Issuer scorecard 🔵
- **What:** Table of issuing banks ranked by your dispute rate per bank. Some US banks dispute 3-5x more aggressively than others. Enables selective fraud rule tuning by issuer.
- **Data deps:** Stripe dispute data with issuer info (available via `payment_method_details.card.issuer`).
- **Locked state:** "Connect Stripe to scorecard issuers" CTA.
- **Effort:** 1-2 days.

#### e. Cancel-vs-chargeback funnel 🔵
- **What:** Sankey-style flow showing how subscribers exit: graceful cancel → support cancel → chargeback. Each chargeback that could've been a cancel signals UX failure (cancel button hidden, support unresponsive). Already have `CancelSurvey` model from Wave 3.19 — pair it with chargeback data.
- **Data deps:** Stripe disputes + Vestigio `CancelSurvey` data.
- **Locked state:** "Connect Stripe to map your involuntary churn paths" CTA.
- **Effort:** 2-3 days.

#### f. 3DS friction analysis 🔵
- **What:** For each chargeback, show whether 3DS was triggered. Disputes on non-3DS transactions are typically not covered by liability shift → flag rule gaps. Recommends 3DS trigger rule changes.
- **Data deps:** Stripe payment_intent data with 3DS authentication results.
- **Locked state:** "Connect Stripe to optimize 3DS rules" CTA.
- **Effort:** 2 days.

---

### 11.3 Preflight (Scale Readiness)

> **Foundation shipped 2026-05-13:** `GET /api/workspace/tech-stack` endpoint aggregates `TechnologyDetected` evidence rows already produced by `workers/ingestion/pipeline.ts:187-210`. Returns a `TechnologyStackProjection` shape consumed by all four widgets below.

#### a. "O que quebra em 10x" simulator ⭐ 🟢 — ✅ Shipped 2026-05-13
- **What:** Heuristic scaling-readiness widget. For each detected vendor, surfaces curated scaling pain points (free-tier caps, rate limits, plan thresholds, non-linear pricing dimensions). Sorted critical-first. We do NOT simulate real load — we curate documented vendor thresholds.
- **Data deps:** Vestigio crawl + tech detection. Pixel-driven projection would replace this with concrete forecasts later.
- **Implementation:** `src/lib/scaling-pain-points.ts` (37 pain points across 21 vendors), `src/components/console/workspace/WhatBreaksAt10x.tsx`. i18n: ~45 keys × 4 locales.

#### b. SPOF (Single Point of Failure) map ⭐ 🟢 — ✅ Shipped 2026-05-13
- **What:** One row per critical category (payment/platform/cdn/email/error-tracking/tag-manager/consent/analytics/ab-testing/support). Status pill: Single point (1 detected), Has redundancy (2+), Not detected (0). Per-row business-impact narrative ("If checkout dies, each hour = a full day of lost sales").
- **Data deps:** Tech detection from Vestigio crawl.
- **Implementation:** `src/components/console/workspace/SpofMap.tsx`. i18n: 32 keys × 4 locales including category names + impact narratives. Wired into preflight workspace + trust perspective.

#### c. Budget forecast at projected scale 🟢 — ✅ Shipped 2026-05-13
- **What:** For each detected vendor with curated public pricing (~25 vendors), shows estimated monthly cost at three scenarios: today, 5x, 10x. Totals at the bottom (5x and 10x highlighted in amber/red). Transactional fees explicitly excluded.
- **Data deps:** Tech detection + curated `src/lib/vendor-pricing.ts` table.
- **Implementation:** `src/components/console/workspace/BudgetForecast.tsx`. i18n: 14 keys × 4 locales.

#### d. Pre-launch runbook generator ⚪
- **What:** Before a major event (sale, product launch, ad campaign), generate a customized checklist: provision capacity, test webhooks, raise alerts, brief support. LLM-driven from the workspace context.
- **Data deps:** LLM + workspace context. Optional: user-described event details.
- **Locked state:** Renders an empty state with "Describe your upcoming event" input.
- **Effort:** 2 days.

#### e. Third-party dependency health 🟢 — ✅ Shipped 2026-05-13
- **What:** Live status of every SaaS your tech stack depends on. For each detected vendor with a known status page, fetches Atlassian Statuspage v2 JSON, displays indicator (Operational/Minor/Major/Critical) + description + click-through to the public page. Coverage line at top shows X of Y dependencies have public status.
- **Data deps:** Tech detection + curated `src/lib/status-pages.ts` mapping (~25 vendors). 5-min in-memory cache to be friendly to vendor endpoints.
- **Implementation:** `GET /api/workspace/dependency-health` route + `src/components/console/workspace/DependencyHealth.tsx`. i18n: 11 keys × 4 locales.

#### f. Recovery time estimate 🔴
- **What:** "If your site goes down right now, your TTR is N minutes based on past incidents". Surfaces oncall rotation, runbook coverage, who has admin access.
- **Data deps:** Integration with PagerDuty/Opsgenie/Linear for incident history.
- **Locked state:** "Connect PagerDuty/Opsgenie to assess your incident readiness" CTA — integration not yet built.
- **Effort:** 5-7 days (requires building a new integration).

---

### 11.4 Security Posture

#### a. Compliance gap analyzer ⭐ 🟢 — ✅ Shipped 2026-05-13
- **What:** Mechanical readiness scorecard for LGPD/GDPR/PCI-DSS/SOC 2. For each framework, evaluates 5-7 requirements against existing cybersecurity findings + tech-stack detection. Reports passed/total + readiness % + list of unmet requirements.
- **Data deps:** FindingProjection (cybersecurity inference_keys) + TechnologyStackProjection (consent_manager + error_tracking categories + PCI Level 1 payment processors).
- **Implementation:** `src/lib/compliance-frameworks.ts` (catalog with 4 frameworks × 5-7 requirements + small DSL for check shapes) + `src/components/console/workspace/ComplianceGap.tsx` (2×2 grid with progress bars + gap list). Explicit caveat: mechanical analysis, full legal audit needs specialist review. i18n: 24 keys × 4 locales.

#### b. "What a pentester would find in 1 hour" ⭐ 🟢 — ✅ Shipped 2026-05-13
- **What:** Reframes Wave 4.1 cybersecurity findings as visceral attack vectors. For each finding whose inference_key is in the curated catalog (15 vectors covering all 3 security pillars), shows the attack-vector name in operator language, what an attacker actually does with it, exploit-time estimate (2 min for MITM up to 30 min for brute force), and target surface. Sorted by exploit time ASC (fastest first), tiebreaker severity DESC.
- **Data deps:** Workspace findings + curated `src/lib/pentester-vectors.ts`.
- **Implementation:** `src/components/console/workspace/PentesterFinds.tsx`. i18n: ~37 keys per locale (15 vectors × 2 + shell).

#### c. Token rotation aging 🔴
- **What:** API keys older than 90 days, with last-use timestamp. "Rotate now" CTA.
- **Data deps:** Integration with the customer's own auth/secrets system. Could be CSV import as a starter.
- **Locked state:** "Upload API key inventory (CSV)" or "Connect [Vault/AWS Secrets Manager]" CTA.
- **Effort:** 3-4 days (depending on integration scope; ⚪ CSV import is 1-2 days).

#### d. Phishing surface monitor 🟢 — ✅ Shipped 2026-05-13
- **What:** Detects registered typo-squat / brand-impersonation domains targeting the customer apex. Generates ~30 variants per apex (character omission, adjacent-key substitution, visual swaps, TLD swaps, brand prefixes/suffixes), DNS-resolves them in parallel, returns the ones that resolve. Each hit classified by pattern with resolved IPs and a "Check whois" CTA.
- **Data deps:** Env.domain + Node native `dns.resolve4`. No external paid API.
- **Implementation:** `src/lib/typo-squat.ts` (variant generation) + `/api/workspace/phishing-surface` (1h in-memory cache) + `src/components/console/workspace/PhishingSurface.tsx`. i18n: 13 keys × 4 locales.

#### e. Anomaly feed 🔴
- **What:** Live stream of suspicious events on the customer's app: login from new country, new device, off-hours admin access. Sentry-style but auth-focused.
- **Data deps:** Integration with customer's auth provider (Auth0, Clerk, Cognito, custom). Requires building an SDK/webhook.
- **Locked state:** "Connect your auth provider for live anomaly detection" CTA — integration to be built.
- **Effort:** 5-7 days.

#### f. Vendor security advisories (pivoted from CVE radar) 🟢 — ✅ Shipped 2026-05-13
- **What:** Without version detection in the existing pipeline, automatic CVE matching would generate noise. Pivot: surface canonical security feed for each detected vendor (one-click jump list) + highlight curated recent critical alerts worth verifying. Each notable advisory shows CVE ID + date + severity + summary + plain-English mitigation.
- **Data deps:** TechnologyStackProjection + curated `src/lib/vendor-advisories.ts` (~20 vendors with official feed URLs + ~3 notable advisories curated for WordPress + Cloudflare).
- **Implementation:** `src/components/console/workspace/VendorAdvisories.tsx`. Explicit caveat: no version matching — user verifies their version against affected ranges. UI already accommodates real CVE feed if version detection lands. i18n: 13 keys × 4 locales.

---

### 11.5 Copy Alignment

#### a. Voice of customer alignment ⭐ 🔴
- **What:** Compare your headlines and value props with actual words customers use (from support tickets, NPS comments, sales call transcripts, G2 reviews). Alignment score per page. "Your site says 'unified analytics platform'. Your customers say 'stops me from losing money.'" Surfaces customer phrasing as suggested rewrites.
- **Data deps:** Integration with Intercom/Zendesk/Crisp for support tickets + optional ⚪ uploaded transcripts. Could also scrape G2/Trustpilot reviews of the customer's product if a profile exists.
- **Locked state:** "Connect your support tool or upload customer transcripts" CTA. Without it, show a sample/demo state with anonymous example so users can see what they'd get.
- **Effort:** 5-7 days (support tool integration is the bulk).

#### b. Live competitor copy diff ⭐ ⚪
- **What:** For each main page (homepage, pricing, features), show your headline next to the top 3 competitors' equivalents. Highlights tonal and message-positioning differences. Refreshes weekly.
- **Data deps:** Vestigio crawls competitor sites (Vestigio already crawls — this just needs competitor URLs configured per org).
- **Locked state:** "Configure your competitors in Settings" CTA → competitor URL config UI to be built.
- **Effort:** 3-4 days (mostly UI + competitor crawl scheduling).

> **Foundation shipped 2026-05-13:** `GET /api/workspace/copy-content` reads `PageContent` evidence rows (title + h1 + meta_description) for the latest cycle. Full body HTML isn't persisted by the ingestion pipeline, so all Wave 11.5 widgets scope to the visible-on-SERP copy fields — which are also the most leverage-bearing.

#### c. Test recommendation engine 🟢 — ✅ Shipped 2026-05-13
- **What:** Haiku produces 3 concrete A/B test specs grounded in the top negative copy findings (copy_alignment + scale_readiness + revenue_integrity packs). Each spec includes target page, hypothesis referencing a specific finding, concrete variant copy, expected lift range, and priority tier.
- **Data deps:** FindingProjection (workspace findings) + LLM via `apps/mcp/llm/client.callModel`. Cached per (env, cycle, locale).
- **Implementation:** `/api/workspace/copy-test-recommendations` + `src/components/console/workspace/TestRecommendations.tsx`. i18n: 12 keys × 4 locales.

#### d. Persona-rewrite preview 🟢 — ✅ Shipped 2026-05-13
- **What:** Haiku rewrites the homepage H1 + meta description for 3 distinct ICP personas. When `BusinessProfile.icpDescription` is set, the primary persona honors it and the other two are synthesized contrasting personas. Each variant: persona label, rewritten headline (<80 chars), rewritten subhead (<160 chars).
- **Data deps:** PageContent (homepage = shortest path heuristic) + BusinessProfile.{icpDescription, targetIndustry, buyerSophistication} + LLM.
- **Locked state:** Empty state when no homepage H1/meta detected.
- **Implementation:** `/api/workspace/copy-persona-rewrite` + `src/components/console/workspace/PersonaRewrite.tsx`. i18n: 11 keys × 4 locales.

#### e. Reading level per page 🟢 — ✅ Shipped 2026-05-13
- **What:** Flesch-Kincaid grade level per crawled page, computed client-side on title + h1 + meta description. Pages sorted by grade desc, tiered into easy / moderate / complex / very_complex, friction note when any page hits grade ≥ 12.
- **Data deps:** PageContent evidence only — no LLM, pure computation.
- **Implementation:** `src/components/console/workspace/ReadingLevel.tsx`. Vowel-group syllable heuristic in-component (English-leaning but relative ordering stays valid for pt-BR). i18n: 14 keys × 4 locales.

#### f. Tone consistency timeline 🟢 — ✅ Shipped 2026-05-13
- **What:** Haiku batch-classifies each page's tone into one of 8 tags (playful, casual, confident, professional, corporate, technical, urgent, salesy). Computes consistency % (pages on dominant tone) and renders stacked bar + per-tone breakdown with sample URLs. Warns when consistency < 70%.
- **Data deps:** PageContent (up to 25 pages) + LLM. Cached per (env, cycle).
- **Implementation:** `/api/workspace/copy-tone` + `src/components/console/workspace/ToneConsistency.tsx`. i18n: 13 keys × 4 locales.

#### g. Framework lens — always-on copy audit 🟢 — ✅ Shipped 2026-05-13
- **What:** "ESLint for copy" — user picks a framework + page from two dropdowns and sees the page audited against that framework's criteria with per-criterion pass/warn/fail + evidence + concrete fix suggestion. Catalog of 10 copywriting frameworks: AIDA, PAS, 4 P's, BAB, SPIN, FAB, Dream-Obstacle-Solution, Pixar storytelling, QUEST, 4 Cs (38 criteria total). Score % shown alongside each framework in the dropdown so the user spots the biggest gap before clicking. Each failing criterion has a "Discuss with Copilot" button that opens the existing Copilot panel (Wave 3.14) with a pre-filled prompt containing the criterion, current copy, evidence, and suggested fix.
- **Data deps:** PageContent (top 4 pages: home/pricing/features/about via URL pattern heuristic) + Copilot SDK + LLM. Cached server-side per (env, cycle, framework, page, locale) — re-selecting a previously visited combo is instant.
- **Locked state:** Empty state when none of the top-4 pages detected on the cycle.
- **Implementation:** `src/lib/copy-frameworks.ts` (catalog with `en` + `pt` text inline per criterion to avoid exploding i18n by ~150 keys) + `/api/workspace/copy-framework-audit` + `src/components/console/workspace/CopyFrameworkLens.tsx`. Component fires 10 parallel audit requests on page change to warm the dropdown score badges. i18n shell: 18 keys × 4 locales.
- **Differentiator:** This is the "lens-switcher" — most copy tools generate generic critique. By framing through 10 known frameworks the user already trusts (or can quickly learn via the inline "About" toggle), Vestigio becomes a discovery surface. Users will toggle frameworks to see their site through different professional eyes.

---

### 11.6 Behavioral

> **Pre-condition:** Entire workspace requires 🟡 Pixel active. Today the whole workspace is gated at the perspective level ([`workspaces/page.tsx:241`](../src/app/app/workspaces/page.tsx#L241)). Wave 11.6 features inherit the same gate — when pixel is inactive, the workspace shows the existing locked banner; no need for per-widget locked states inside.

#### a. Top 5 frustrating sessions of the week ⭐ 🟡
- **What:** Replay-style summaries (no actual replay needed — text-based) of sessions where behavioral pixel detected friction: "User X clicked the Y button 12 times before abandoning. Hovered on pricing for 47s without clicking." Each session gets a 1-line LLM diagnosis.
- **Data deps:** Behavioral pixel + LLM summarization.
- **Effort:** 3-4 days.

#### b. Rage click heatmap ⭐ 🟡
- **What:** Visual heatmap of pages overlaid with rage-click density. Existing pixel already detects rage clicks; surface them spatially.
- **Data deps:** Behavioral pixel.
- **Effort:** 3-4 days (visualization is the work).

#### c. Form field killer 🟡
- **What:** For each form, drop-off rate per field with mean time spent before abandonment. Identifies which field kills conversion ("Address line 2 → 38% abandonment, avg 12s spent").
- **Data deps:** Behavioral pixel with field-level event capture.
- **Effort:** 4-5 days (field detection logic).

#### d. Hesitation map 🟡
- **What:** Long hovers without clicks — moments where the user "thinks too much". Signals unclear messaging or trust gap on that element.
- **Data deps:** Behavioral pixel.
- **Effort:** 2-3 days.

#### e. Cross-device journey 🟡
- **What:** Users who started on mobile and finished on desktop (or vice versa). Identifies mobile-specific friction that pushes the funnel to desktop.
- **Data deps:** Behavioral pixel + user-ID tracking across devices (requires authenticated tracking).
- **Effort:** 4-5 days.

#### f. Power user pattern 🟡
- **What:** Sequence of actions that distinguishes activated users from drop-offs. Lets product onboarding direct new users toward this path.
- **Data deps:** Behavioral pixel + sufficient user history (~30 days minimum).
- **Effort:** 3-4 days.

---

### 11.7 Cross-cutting widgets (fit in any workspace)

#### a. "Próxima ação recomendada" persistent strip ⭐ 🟢 — ✅ Shipped 2026-05-13
- **What:** Top-of-workspace single-CTA strip showing the ONE thing to do right now. Surfaces the highest-priority action linked to findings in this workspace (filters out resolved/completed) using existing Wave 3.12 `priority_score`. Shows title + description + impact recovery + effort tier + click-through to `/app/actions?action=<id>`.
- **Data deps:** ActionProjection (existing) + FindingProjection.action_refs. No LLM, no new integration.
- **Implementation:** `src/components/console/workspace/NextActionStrip.tsx`. Wired at the very top of `workspaces/[id]` above PulseSummary. i18n: 10 keys × 4 locales.

#### b. Trend deltas vs last week 🟢 — ✅ Shipped 2026-05-13 (V1, scope-limited)
- **What:** Inline pill beside the workspace header issue count showing net change vs the previous cycle (green − or red +). Derived from existing `change_summary` fields: `net = improvement + resolved − regression`. Zero net hides the pill.
- **Data deps:** `WorkspaceProjection.change_summary` (already populated by Wave 7.1 multi-cycle pipeline).
- **Implementation:** `src/components/console/workspace/TrendDelta.tsx`. Wired beside `workspace.summary.issue_count` in the header.
- **Scope note (deferred):** Magnitude deltas on dollar exposure (`total_loss −15%` style) require loading the previous cycle's WorkspaceProjection.summary which the current projection layer doesn't expose. Deferred until a previous-cycle summary loader lands; current V1 covers count delta only (which is the most-visible number in the header).

#### c. Cost-of-inaction timer 🟢 — ✅ Shipped 2026-05-13
- **What:** Aggregates dollar amount already lost across open negative findings in the workspace. Per-finding days_open ≈ `trend_streak × cycle_interval_days` (1 day default). Daily burn = `impact.midpoint / 30`. Shows total lost + daily burn + top 3 burners with per-finding loss + days open.
- **Data deps:** FindingProjection (existing impact + trend_streak from Wave 7.1).
- **Implementation:** `src/components/console/workspace/CostOfInaction.tsx`. Wired in `workspaces/[id]` below Pulse + Quick Stats. i18n: 9 keys × 4 locales.

#### d. Customer-quote contextual 🔴
- **What:** When a finding touches a theme (e.g. checkout friction), surface a real customer quote complaining about the same thing from support/NPS data. Makes findings emotional, not abstract.
- **Data deps:** Same support-tool integration as 11.5a — reuse.
- **Effort:** Bundled with 11.5a (+1 day for thematic matching).

---

### Wave 11 implementation order

**Build sequence ordered by leverage × cheapness:**

1. **11.1a "Dinheiro na mesa"** ⭐ 🟢 — single biggest perception shift, no integration needed (1-2 days)
2. **11.7a "Próxima ação recomendada" strip** ⭐ 🟢 — small effort, huge UX impact across all workspaces (1-2 days)
3. **11.7c Cost-of-inaction timer** 🟢 — emotional lever, 1 day
4. **11.3a "O que quebra em 10x" simulator** ⭐ 🟢 — moat-building feature, no integration (4-5 days)
5. **11.4b "Pentester would find in 1 hour"** ⭐ 🟢 — reframe existing data, 2-3 days
6. **11.4a Compliance gap analyzer** ⭐ 🟢 — high-stakes, 4-5 days
7. **11.5c Test recommendation engine** 🟢 — leverages existing findings + LLM, 3 days
8. **11.5d Persona-rewrite preview** 🟢 — ICP already captured, 2 days
9. **11.2a VAMP/VDMP risk meter** ⭐ 🔵 — requires Stripe; bundle with 11.2b dispute defense and 11.2c-f for a "Stripe-powered Chargeback" release (2 weeks)
10. **11.1b MRR Trajectory dual-scenario** ⭐ 🔵 — bundle in the same Stripe release
11. **11.6 entire Behavioral workspace** 🟡 — single pixel-dependency release (3-4 weeks for all 6 widgets)
12. **11.5a Voice of customer** ⭐ 🔴 — biggest moat but needs new integration (5-7 days + Intercom OAuth)

**Anti-pattern to avoid:** building 🔴 features (require new integrations) before 🟢 features are shipped. The 🟢 tier alone could reshape the perception of all 6 workspaces in ~2-3 weeks of focused build.

---

## Wave 17 — 10k Customer Scale Plan

Working backwards from "support 10,000 active customers with 5 envs avg = 50k envs, ~14 cycles/sec sustained at hot-tier cadence". Wave 5 Fase 2 brought capacity to ~700-1000. Each row below is a discrete cliff that breaks somewhere between 1k and 10k.

### Tier A — Foundations that unblock the rest

| # | Bottleneck | Solution | Effort | Where it bites first |
|---|---|---|---|---|
| A1 | Postgres connection pool exhaustion | Stand up **PgBouncer** in transaction-pool mode on Railway. Set `connection_limit=1` on Prisma URL (PgBouncer manages the real pool). Web/worker share a pgbouncer URL; pgbouncer multiplexes onto a small real Postgres connection set (50-100). | 1 day | ~150 concurrent workers/web replicas hit Postgres max_connections (~200 default). |
| A2 | Single-process MCP singleton still latent | **Per-request MCP context model.** Replace `globalThis.__vestigio_mcp_server__` with a request-scoped factory (Next.js `headers()` + a cache keyed by envRef). Eliminates the singleton entirely. Wave 5 Fase 2 added a mutex bridge; A2 is the real fix. | 2-3 days | When legacy MCP fallback fires under load (rare today; common if cache writes start failing). |
| A3 | Worker autoscaling | Railway HPA on queue depth: scale `audit-worker` replicas based on `vestigio:auditq:priority:hot` length. `worker-loop.ts` already supports multi-replica via env-lock. Configure: scale-up at depth > 20, scale-down at depth < 5, max replicas based on plan limits. | 0.5 day (Railway dashboard) | ~100 concurrent cycles needed in the hot tier. |

### Tier B — Throughput multipliers

| # | Bottleneck | Solution | Effort | Where it bites first |
|---|---|---|---|---|
| B1 | Evidence storage cost + load time | **S3 tiering for large payloads.** Move `ContentEnrichment`, `PageContent.body`, `off_site_recon` payloads >8KB to S3. Keep only a pointer + metadata in Postgres. Evidence load skips the heavy column entirely; engine fetches S3 lazily for the inferences that actually need it. | 3-4 days | When Evidence table grows past ~10M rows or 100GB; OOM on `loadLatestCycle()`. |
| B2 | recomputeAll is per-cycle pure CPU | **Move to Node `worker_threads`** per concurrent cycle. Each thread runs `recomputeAllAsync` on its own V8 isolate → true CPU parallelism, not just event-loop yields. Main thread keeps polling Redis + serving heal. Wave 5 Fase 2's generator refactor was the prerequisite. | 2 days | When per-worker concurrency > 2 starts queueing on the event loop. |
| B3 | Postgres read replicas | Route layout's projections-cache read to a read replica (Railway / Neon / RDS). Audit-runner writes stay on primary. Wave 16 cache load is the dominant read pattern, so even one replica halves primary load. | 1 day | ~50 page renders/sec sustained. |

### Tier C — Fairness and observability

| # | Bottleneck | Solution | Effort | Where it bites first |
|---|---|---|---|---|
| C1 | Queue priority decay (aged cold cycles never run if hot is always full) | Add **priority aging**: every 10min the worker-loop promotes the head of `cold` → `warm` and `warm` → `hot` if dwell time exceeds threshold. Prevents the long tail from being permanently starved. | 1 day | When hot+warm sustained queue depth > 50 for hours. |
| C2 | Per-tenant rate limiting beyond cycle cap | Wave 5 Fase 2 has `ORG_CYCLE_CAP` (concurrent). Add a **per-org daily cycle quota** so a customer with broken cron-triggers can't burn 10x their plan limit in a day. Track via Redis `INCR` with daily TTL. | 1 day | A buggy integration triggers excess cycles for one customer. |
| C3 | Metrics, traces, alerting | Wire OpenTelemetry into worker-loop + audit-runner phases. Export to Grafana Cloud / Datadog. Critical signals: queue depth per tier, p95 cycle duration, recompute duration, DB pool saturation, Chromium pool waiters, OOM events. | 2-3 days | Always useful; pays for itself the first time prod degrades. |

### Tier D — Specific known sharp edges

| # | Bottleneck | Solution | Effort |
|---|---|---|---|
| D1 | `RawBehavioralEvent` 30-day scan at end of every cycle | Replace SELECT/GROUP BY with a **rolling materialized view** refreshed every N minutes. Cycle reads the matview (instant) instead of scanning raw events. | 1 day |
| D2 | `EnvLock` 15-min TTL on crash blocks env for 15 min | Reduce TTL to 5 min, add a graceful-shutdown release hook in worker-loop (SIGTERM handler already exists — extend it). | 0.5 day |
| D3 | Scheduler revisits all envs every tick | Cursor pagination from Wave 5 Fase 2 fixes the cap, but at 50k envs the scheduler tick itself becomes slow. Partition by org-id hash modulo N tick buckets; each hourly tick processes 1/N of the fleet. | 1 day |
| D4 | Notification dispatcher cron blocks on Brevo API | Already async, but no concurrency cap. Add a small task queue (Redis BLPOP) so a slow Brevo response doesn't back up the dispatcher cron. | 1 day |

### Capacity ceiling per tier

| Customer count | Status |
|---|---|
| 0–200 active | Comfortable as-is (post-Wave 5 Fase 2 + this commit). |
| 200–1k | Comfortable; watch queue depth + chromium pool waiters. |
| 1k–5k | Need **Tier A** (PgBouncer + MCP per-request + autoscaling). |
| 5k–10k | Need **Tier B** (S3 tiering + worker_threads + read replica) on top of A. |
| 10k+ | Need **Tier C** + **D** for fairness and the long tail. Beyond 10k, multi-region Postgres + sharded Redis become real considerations. |

### Anti-patterns to avoid

- **Don't shard Postgres prematurely.** Single Postgres + PgBouncer + read replica gets to ~5k customers cleanly. Sharding adds operational complexity that's hard to undo.
- **Don't move to managed queue (SQS/Kafka) yet.** Redis lists + the env-lock pattern handle this scale and lose no semantics.
- **Don't replace Prisma.** The pool sizing change in Wave 5 Fase 2 + PgBouncer covers the connection issue without changing the ORM.
- **Don't run engine workers in Lambda.** Audit-runner is long-running (1-3min per cycle) and stateful within a cycle. Long-running container model (Railway / Render / Fly) is correct.

---

## Wave 18 — Production fixes shipped 2026-05-15

Multi-bug session. Surface symptom was "Copy workspace empty after a 56s cycle on havefunnels". Investigation cascaded into four separate production bugs, all now fixed.

### What was wrong

| Bug | Symptom | Root cause | Fix commit |
|---|---|---|---|
| **#1 Deploy drift** | audit-worker running code from Apr 14 despite many May pushes | Railway service was configured with `builder=RAILPACK` (the auto-detection builder) instead of `DOCKERFILE`. RAILPACK ignored our `/Dockerfile` and built something different. Env-var bumps + `railway redeploy` only re-tagged the cached image; they never rebuilt from git. | User changed builder to `/Dockerfile` in dashboard. **Future pushes now auto-deploy correctly.** |
| **#2 `projectionsCache` always NULL** | Zero rows in entire DB had `projectionsCache` populated. Layout always fell through to slow legacy `ensureContext`. | Cache write was the last step of an atomic `$transaction` that aborted earlier on finding-upsert conflicts. The catch block tried individual upserts on the same aborted tx, every one returned PostgreSQL 25P02, then catastrophic-loss check threw. Cache was never reached. | **`8e14d63`** — dedupe in `prisma-finding-store.ts` |
| **#3 Only 4 packs producing findings** (expected 8-10) | Findings table for havefunnels had: saas_growth_readiness (4), money_moment_exposure (3), scale_readiness (3), revenue_integrity (1). Missing: copy_alignment, chargeback, content_freshness, funnel_*, vertical_specific. | The engine WAS producing findings for all packs, but persistence was failing for the bigger packs (e.g., `funnel_dead_end_page` emitted 6× across pages, hit the `(cycleId, inferenceKey)` unique constraint). Transaction aborted, only the small ones (which happened to be processed first) made it. | **`8e14d63`** (same as #2) |
| **#4 Copy Framework Lens limited** | Widget audits only against title + h1 + meta_description. Body text never available. | `PageContentPayload` never included body text. Parser already extracts `body_text_snippet` but it's not in the payload schema. Engine signals + Framework Lens both starve of input. | **Wave 18a** below — in progress, this session's main feature work |

### Infrastructure shipped this session (before bug discovery)

- **A1 PgBouncer** (`pgbouncer` Railway service, transaction-pool, edoburu image, SCRAM auth). Web + worker DATABASE_URL → pgbouncer at port 6432 with `?pgbouncer=true`. DIRECT_URL stays direct for migrations.
- **A3 Worker static scaling**: 3 replicas of audit-worker in us-west2 region. `AUDIT_WORKER_CONCURRENCY=2` per replica = 6 concurrent cycles cluster-wide.
- **B2 worker_threads recompute pool**: `apps/audit-runner/recompute-pool.ts` + esbuild-bundled `recompute-worker.ts`. Flag `RECOMPUTE_USE_WORKER_THREADS=1` enables it on audit-worker. True CPU parallelism across concurrent cycles.
- **C3 OpenTelemetry**: `@opentelemetry/sdk-node` + selected instrumentations (http/undici/redis/prisma) wired to Grafana Cloud free tier at `https://otlp-gateway-prod-sa-east-1.grafana.net/otlp`. Custom spans on the 8 `recompute.*` phases (named yields in `recomputeAllGen`). Custom metrics: `vestigio.queue.depth{tier}`, `vestigio.recompute.pool.{total,idle,busy,queued}`, `vestigio.chromium.pool.{in_use,idle_browsers}`. Worker init lives inside `mainLoop()` (top-level statements were swallowed by Railway log shipper; in-mainLoop logs surface).

### Verification (cycle `cmp72nbea0001ckemoposjpgb`, run 2026-05-15 15:31 UTC)

```
status: complete
hasCache: true                              <-- Wave 16 cache populated for first time ever
dur_ms: 190111                              <-- 190s (longer than 56s pre-fix; OTel + worker_threads overhead)
deduped 39 -> 33 findings (merged surfaces)
persisted 33/39
10 packs producing findings:
  chargeback_resilience: 2
  content_freshness: 1
  copy_alignment: 1                         <-- previously zero
  funnel_integrity: 3
  funnel_journey: 9
  money_moment_exposure: 3
  revenue_integrity: 4
  saas_growth_readiness: 4
  scale_readiness: 4
  vertical_specific: 2
```

### Reference: Railway service config

To diagnose deploy drift in the future, the GraphQL API exposes per-service `serviceManifest.build.builder`:

```bash
# accessToken sourced from ~/.railway/config.json user.accessToken
curl -s -H "Authorization: Bearer $ACCESS" -H "Content-Type: application/json" \
  -d "{\"query\":\"{ project(id: \\\"$PROJECT_ID\\\") { services { edges { node { name serviceInstances { edges { node { latestDeployment { meta } } } } } } } } }\"}" \
  https://backboard.railway.com/graphql/v2
```

Look for `serviceManifest.build.builder`. Must be `DOCKERFILE` for any service that should respect the repo's `/Dockerfile`. `RAILPACK` / `NIXPACKS` ignore it.

The `accessToken` from the CLI session is read-only. For service-level mutations (e.g. `serviceInstanceUpdate`), a Personal Access Token from `railway.com/account/tokens` is required. Project tokens (UUID format) are scoped to the project but didn't have write access in this session's testing — Personal Token is the safe default for ops scripts.

---

## Wave 18a — Body text + copy elements extraction (shipped 2026-05-15, commit `3dbc877`)

Goal: make every crawled page produce evidence rich enough that (a) the engine's `copy_alignment` inferences fire on actual page copy, not just metadata, and (b) the LLM-powered `Copy Framework Lens` widget can audit against the full body, not just title + h1 + meta_description.

### What shipped

1. **Schema** — `PageContentPayload.body_text_snippet: string | null` (up to 2000 chars of visible body text) + `headings: Array<{ level: 1 | 2 | 3; text: string }>` (cap 50). New `EvidenceType.CopyElements = 'copy_elements'` enum entry (the payload type existed since Wave 3.10 but was never written).

2. **Parser** — `extractHeadings(html)` in [workers/ingestion/parser.ts](workers/ingestion/parser.ts) added alongside the existing `body_text_snippet` extraction. Both are derived from whatever HTML the upstream pipeline hands to `parsePage()`, so when the caller already swapped to Playwright-rendered HTML for SPA pages, the snippet/headings reflect the hydrated DOM automatically.

3. **`addPageContentEvidence`** in [workers/ingestion/staged-pipeline.ts](workers/ingestion/staged-pipeline.ts) threads `body_text_snippet` + `headings` into the evidence payload.

4. **`addCopyElementsEvidence`** — new helper invoked after every `addPageContentEvidence` call (both Stage A homepage bootstrap and Stage C per-page crawl). Classifies page_type from URL (homepage / pricing / checkout / product / onboarding / blog / about / feature / landing_page / all_commercial) + infers funnel_stage (awareness / consideration / decision / retention), then runs the existing `extractCopyElements()` pure parser and pushes a `copy_elements` evidence row. Guarded — skips emission when the page has no h1, no CTAs, fewer than 30 words, no social proof, and no trust signals (avoids empty rows from 404s).

5. **SPA / Playwright fallback** — Stage A now runs `shouldTriggerPlaywright` on the bootstrap fetch and renders headlessly when the raw HTML is a thin shell. Re-parses the rendered DOM before emitting evidence so the homepage `body_text_snippet` populates for JS-hydrated landing pages. Shares the same `playwrightBudget` + `PLAYWRIGHT_PER_DOMAIN_CAP=3` as Stage C. The homepage was excluded from Stage C's crawl loop (added to `seen` before the loop runs), so without this branch a SPA-shell homepage produced empty copy for findings.

6. **`/api/workspace/copy-content`** — returns `body_text_snippet` + `headings` per page so future widgets can consume body without going back to the evidence table.

7. **`/api/workspace/copy-framework-audit`** — Haiku prompt now includes `<headings>` (capped at 30, sanitized) + `<body_text>` (1800 chars, sanitized) alongside title/h1/meta. Token budget unchanged — Haiku 4.5's ~200K input window easily absorbs body × headings + framework spec.

### Acceptance criteria — to verify on next havefunnels audit

- Every `page_content` evidence payload has `body_text_snippet` non-null for pages that returned HTML (excluding 404 / redirect-only)
- At least one `copy_elements` evidence row per crawled page
- Engine produces `value_proposition_buried`, `social_proof_ineffective`, `objection_unaddressed`, `cta_clarity_weak_on_commercial`, or `copy_funnel_misalignment` findings when applicable (cycle `cmp72nbea0001ckemoposjpgb` produced 1 copy_alignment finding; expect 3-5 after this lands)
- Framework Lens scores vary meaningfully per framework (no longer all clustered at ~25% because of empty body)
- For SPA-detected homepages, `body_text_snippet` still populates via Playwright

### Bonus shipped this session

- **Live audit-status polling** (commit `a2c5ef2`) — `AuditStatusBadge` now polls `/api/cycles/latest` every 8s while the tab is visible. A cycle kicked off from `/app/dashboard` flips the header badge to "Analyzing" without requiring a navigation. Polls pause when the tab is hidden.
- **Dismissable impersonation banner** (same commit) — small X in the amber strip. Persisted in `sessionStorage` so closing it once hides it across navigations for the same tab but reappears on fresh tab / new login. Existing UserMenu "Exit impersonation" flow unchanged.

### Out of scope (still future)

- Storing FULL body (not just 2000-char snippet) — current cap is the safe choice for evidence row size + R2 tiering will come later
- Per-funnel-stage copy classification (homepage vs pricing vs about) — already roughed in by `extractCopyElements` page_type parameter, but no engine inferences use it yet
- LLM body summarization for super-long pages — defer until we see real customers blowing past 2000 chars meaningfully

---

## Wave 18z — Backlog (not blocking customers, defer until friction shows up)

### Docker image size — ~750MB on each Railway deploy

Diagnosed 2026-05-16. Current image breaks down roughly as:

- Chromium binary (Playwright) — **~280 MB** — required for audit-worker headless render
- Debian system libs (libnss3, libcairo, libgbm, libpango, ...) — **~150 MB** — Chromium dependencies
- node_modules (prod, after `npm ci --omit=dev`) — **~150 MB**
- Prisma engine binaries (5 platforms) — **~50 MB**
- Next.js standalone output (.next/standalone + static) — **~60 MB**
- Prisma CLI shipped for boot-time `db push` — **~43 MB**
- Worker source for tsx runtime (workers/apps/packages/src/dictionary) — **~15 MB**

Not bloated for this stack (Chromium + Debian + Prisma = ~480MB irreducible). The non-Chromium portion (~270MB) is roughly right-sized. But there are 3 quick wins worth ~150MB combined when we want to optimize:

1. ~~**`experimental.optimizePackageImports`** in next.config.js for `@phosphor-icons/react` (57MB local), `lucide-react` (38MB), `date-fns` (24MB). One config line, low risk, probably ~80-100MB off the standalone bundle.~~ **Shipped 2026-05-17.** Added to `next.config.js` covering all three packages; Next.js now rewrites barrel imports to direct module-level imports, tree-shaking the unused icon/date code out of the standalone bundle. Estimated saving: ~80-100MB.
2. ~~**Drop Prisma CLI from runtime** (~43MB) — move `prisma db push` from the boot CMD to a pre-deploy step (Railway hook or GitHub Action) so the runtime image doesn't need the CLI at all.~~ **Shipped 2026-05-17.** `prisma db push` moved from the boot CMD to the Docker builder stage (gated on a `DATABASE_URL` build arg). The runner stage no longer copies `node_modules/prisma`, and the runtime CMD is now a pure `node server.js` for the web role. Estimated saving: ~43MB. **Operator action required**: set `DATABASE_URL` as a *build-time* variable on the Railway web service (Settings → Variables → "Add Build Variable"). Until that's done, the build still completes (the push step prints `[build] DATABASE_URL build arg not set — skipping prisma db push`) but the deploy will boot against whatever schema is already in the DB — manually run `npm run db:push:dev` against the prod DB once before the first deploy of any schema change. Nixpacks fallback (`nixpacks.toml`) was intentionally left alone — only the Dockerfile path optimized.
3. **Split into two images** — web (no Chromium, ~200MB) and worker (full, ~700MB). Cuts web image by ~70% but doubles Railway deploy ops. Only worth doing if web deploy cadence diverges from worker, or if cold-start latency becomes a customer complaint. **Not shipped** — defer per Wave 18z scope.

---

## Wave 19d — Cross Signal Insights wired to CompoundFinding (quick win, ~1h)

> **Context (2026-05-21):** The `/cross-signals` page is supposed to surface **causal chains** ("checkout off-domain → missing trust badges → unknown payment provider, $X/mo combined exposure") but currently shows a much weaker heuristic — "findings grouped by URL when ≥2 packs co-occur." This is why the page feels disconnected. The wiring exists; the wire isn't connected.

The full data layer is in place:

- `packages/composites/compound-findings.ts:detectCompoundFindings()` — runs every cycle, produces `CompoundFinding[]` with real causal chains + narratives + combined impact
- `src/lib/dashboard/cross-signal-narrative.ts:101:compoundFindingsToChains()` — converts `CompoundFinding[]` → `CrossSignalChain[]` (the format the UI consumes)
- `MultiPackResult.composites.compound_findings` — already serialized into `AuditCycle.projectionsCache`

**What's missing:** `compoundFindingsToChains()` has zero call sites. Today's `/cross-signals` page reads `buildCrossSignalChains()` which builds chains from URL co-occurrence only.

**Fix (3 changes):**

1. In `src/lib/dashboard/aggregator.ts:computeAllCrossSignals()`: also load `compound_findings` from `AuditCycle.projectionsCache` of the latest complete cycle.
2. Run `compoundFindingsToChains(compoundFindings)` to convert.
3. Merge with the existing heuristic chains, sort compound-first (they carry real causal narratives + higher confidence), then heuristic co-occurrence chains below.

Bonus: add a `chain_type: 'compound' | 'co-occurrence'` field on `CrossSignalChain` so the UI can visually differentiate the two (a small badge or different card style).

**Acceptance criteria:** open `/cross-signals` on a havefunnels.com cycle and see the compound chains at the top with their pre-written narratives (e.g. `cf.narrative`) instead of the generic template-generated text.

**Why this can't wait for Wave 20:** Wave 21 alerts depend on having CompoundFinding chains reach the surface — see Wave 21.3. And the customer's UX problem ("cross signal insights são meio desconexos") resolves immediately with this change.

---

## Wave 20 — Engine Consolidation + Always-On Layer

> **Strategic context (2026-05-21):** The Vestigio thesis is being formalized around **"always-on revenue protection"** — continuous monitoring of conversion-critical surfaces, alerts when changes break revenue, and a monthly "value caught" report that makes the product feel inevitable (vs. the current "log in once a week to review findings" pattern). The engineering work to support this divides cleanly into two waves with a hard dependency: Wave 20 (engine consolidation) is the forcing function and prerequisite; Wave 21 (the always-on layer itself) plugs into Wave 20's clean API surface.
>
> See [ENGINE_MAP.md](ENGINE_MAP.md) for the current engine map that motivates this wave. See the [inevitability thesis memory](../.claude/projects/-Users-luisgall-Downloads-Vestigio-io-vestigio-io/memory/project_inevitability_thesis.md) and [always-on cost analysis memory](../.claude/projects/-Users-luisgall-Downloads-Vestigio-io-vestigio-io/memory/project_always_on_cost_analysis.md) for the strategic backing.

### Wave 20 — Goals

1. **Eliminate the 5 bypass paths** so every signal/inference flows through the canonical pipeline (`engine.run() → harmonize → quality-adjust → inference → decision → projection`).
2. **Delete the 6 pieces of dead code** that pretend to be live (catalogued in [ENGINE_MAP.md §B](ENGINE_MAP.md#b-dead-code-defined-exported-never-imported)).
3. **Resolve the 4 triple-implementations / public-API inconsistencies** (catalogued in [ENGINE_MAP.md §C](ENGINE_MAP.md#c-triple-implementation--overlapping-responsibilities)).
4. **Split the 11k-line `inference/engine.ts` monolith** into pack-scoped sub-modules so adding a new pack doesn't grow the central file.
5. **Expose a single `engine.run()` entry point** that supports both `scope: "full_cycle"` and `scope: { url, enrichers }` — the latter is what Wave 21's diff-triggered re-analysis needs.

### Wave 20 — Sequence

This is the order; each step gates the next.

**Step 20.1 — Audit + target API design (2-3 days, no code changes yet)**

- Read [ENGINE_MAP.md](ENGINE_MAP.md) in full.
- Write `docs/ENGINE_TARGET_API.md` capturing:
  - The single `engine.run(input: EngineRunInput): EngineRunOutput` signature.
  - Where each currently-bypassed path is to be re-rooted.
  - The pack-decomposition plan for `inference/engine.ts` (recommended: `inference/packs/{revenue,security,copy,behavioral,brand,chargeback,scale,channel,discoverability}/`).
  - Decision lifecycle policy: keep the enum, implement the transitions, OR delete the unused states. **Recommendation: keep + implement** — the Confirmed/Stale states are the foundation for "value caught" tracking in Wave 21.
- Output of this step: a 1-page API contract that the next steps work against. **Reviewable + approvable before any code moves.**

**Step 20.2 — Delete dead code (½ day) — SHIPPED 2026-05-21**

Surgical changes after thorough recon. Each item's verdict was revised based on actual usage, sometimes flipping the original plan:

- ✅ **`triple-source-inference.ts` — WIRED, not deleted.** Recon found all 7 inference keys have COMPLETE downstream pipeline support (root-causes, projections, remediation-catalog, decision/engine, compound-findings). The functions were dormant features, not dead code. Wired via 1 import + 1 line in `recompute.ts`. 7 new inferences start firing next cycle. See ENGINE_MAP.md item #1 verdict flip.
- ✅ **`CompoundFinding[]` output — already wired in Wave 19d** (commit `2f8fb79`).
- ⏸️ **`domain/Finding` interface — DEFERRED to Wave 20.4.** Recon found `packages/workspace/workspace.ts:154` actively constructs `Finding[]` as preflight workspace shape, consumed by `src/app/app/workspaces/[id]/page.tsx`. Two parallel types is a real design smell (UI reads fields not on the domain type), but deleting now would break preflight. Merge with FindingProjection in Wave 20.4 lifecycle work.
- ⏸️ **`DecisionStatus` enum — DEFERRED to Wave 20.4.** UI in `actions/page.tsx:562,571,1337` + `NextActionStrip.tsx:68` filters by `decision_status === "confirmed" | "resolved"`. Today silently broken (engine only assigns `Created`), but deleting now converts silent breakage to visible breakage. Wave 20.4 replaces with `FindingProjection.status` and repoints UI in the same wave.
- ✅ **`Decision.projections.findings[]` field — DELETED.** Removed the whole `DecisionProjections` interface (all 4 fields were unused, only referenced by validation). Updated `packages/decision/engine.ts:158-163`, `packages/domain/decision.ts:47,85`, `packages/domain/validation.ts:284-291`, `tests/behavioral-audit.test.ts:138`.
- ✅ **`assertTruthResolved` — ACTIVATED in WARN mode.** Added `mode: 'throw' | 'warn'` parameter. Called from `recompute.ts:430` before `computeInferences`, mode=`'warn'`. Logs unresolved signals + top offenders without crashing. Will be upgraded to `'throw'` after Wave 20.5 fixes the static-checks bypass path.

Net: 3 of 6 items shipped, 3 deferred to Wave 20.4 with concrete justifications. Wave 20.3 (consolidate triple `createSignal` + `computeClassification`) is next.

**Step 20.3 — Consolidate triples (1 day) — SHIPPED 2026-05-22**

All three sub-tasks landed in one wave:

- ✅ **createSignal — single factory.** Removed the historical copy at `packages/signals/engine.ts:5710` and the local copy at `workers/ingestion/stages/static-checks.ts:822`. Both now import from `packages/signals/create.ts` (also exported via `packages/signals/index.ts:8`). Verified via `grep -rn "^function createSignal" packages/ workers/` — returns 1 match (the canonical one).
- ✅ **computeClassification — one invocation per cycle.** Added optional `classification?: ClassificationState` to `MultiPackInput`. `run-cycle.ts` now passes `result.classification` from `runStagedPipeline()` through to `recomputeWithPool`, and `recompute.ts:609` uses the input if provided, falls back to computing only when absent (so direct test callers still work). Net: one fewer compute pass per cycle on the same evidence.
- ✅ **inference/index.ts public surface.** Added exports for `computeCrossPackSynthesis` and `computeExternalReconInferences` (previously imported directly from `recompute.ts`, bypassing the public surface). `recompute.ts` updated to use the package-level barrel import for all 10 inference modules consistently.

**Step 20.4 — Implement Finding lifecycle (1-2 days) — SHIPPED 2026-05-22**

- ✅ **Schema migration** (`prisma/migrations/20260522000000_finding_lifecycle/`): added `status` (default `'created'`), `statusChangedAt` (default NOW()), `cyclesSeen` (default 1) to `Finding`. New indices: `(environmentId, inferenceKey, surface)` for cross-cycle lookup and `(environmentId, status, statusChangedAt)` for Wave 21.5 value-caught queries.
- ✅ **`packages/projections/lifecycle.ts`** — `applyLifecycle(current, prior)` with the 5-state transition table from ENGINE_TARGET_API.md §6. Pure function — no I/O. Phantom `'resolved'` rows are emitted for prior findings absent in current, carrying prior cycle's impact data for value-caught accounting.
- ✅ **`FindingProjection` type extended** (`packages/projections/types.ts`): `status`, `status_changed_at`, `cycles_seen`. All construction sites (projectFindings, positive_check builder, demo data, test fixtures) updated with defaults.
- ✅ **`PrismaFindingStore`** — `saveForCycle()` persists the 3 new columns via batch SQL + Prisma upsert fallback. New `loadPriorFindingStates(envId, excludingCycleId)` method returns `Map<identityKey, PriorFindingState>` for matching.
- ✅ **Wired in `run-cycle.ts`** — after `projectAll` returns, lifecycle pass runs: loads prior states, applies transitions, appends phantom resolved rows to `projections.findings` before persistence. Best-effort: a failure leaves projections untouched (default `'created'`) and the next cycle retries.
- ⏸️ **`Decision.category` + `Decision.decision_impact` migration to `Finding`** — deferred to a follow-up. Lifecycle work is sufficient to unlock Wave 21.5; the category/impact plumbing can land alongside the UI repointing of `ActionProjection.decision_status` (which is still using the dormant Decision-side enum).

This step unlocks Wave 21.5 "value caught" report: a simple `SELECT impactMidpoint FROM Finding WHERE status='resolved' AND statusChangedAt > start_of_month GROUP BY environmentId` query produces the monthly captured-value totals.

**Step 20.5 — Re-root the bypass paths (partial — SHIPPED 2026-05-22)**

Scope-revised based on production realities surfaced during the recon. The original 4-item plan was over-broad; what actually unblocks the assertTruthResolved THROW upgrade is item 1 only. Items 2-4 are inference-level (not signal-level) and don't trip the guard.

- ✅ **`additional_signals` from static-checks — RE-ROOTED.** Merge moved from post-harmonize (line ~867, after truth resolution + quality adjustment had already run) to PRE-harmonize (immediately after `extractSignals` returns). Static-check signals now flow through `harmonizeSignals` + `guardTruthConsistency` + `adjustConfidenceByQuality` like every other signal source. A Structural static-check signal that contradicts a BrowserObserved finding now correctly loses in harmonization (was previously winning due to bypass).
- ✅ **`assertTruthResolved` upgraded WARN → THROW.** With static-checks fixed, the guard is no longer a tripwire — every signal entering the main inference path MUST carry `truth_metadata`. Any future post-harmonize injection bug fails loud + immediately + names the offending signal_key. This is the contract enforcement that Wave 20.2 prepared.
- ☑️ **MRR contraction signal push** — verified to already be pre-harmonize (line ~400, BEFORE harmonize at line ~422). Not a bypass; the "manual push" framing in the original plan was inaccurate. No change needed.
- ⏸️ **`additional_inferences` from funnel-gap + form-flow** — deferred. Inference-level bypass, doesn't trip the guard. Best done alongside Wave 20.6 (inference monolith split) where the derived/ folder gets carved out.
- ⏸️ **Regression-inference manual construction** — deferred. Same reasoning as above.
- ⏸️ **SaaS signals bypass** — surfaced during Wave 20.5 recon: `extractSaasSignals` runs AFTER harmonize and feeds `computeSaasInferences` via `[...signals, ...saasSignals]` without participating in truth resolution. The guard does NOT check the saas path, so saas remains a documented bypass. Will be re-rooted in Wave 20.6 alongside the inference split.

**Step 20.6 — Split the inference monolith (3-5 days)**

- New structure: `packages/inference/packs/{revenue, security, chargeback, copy, behavioral, brand, channel, discoverability, scale}/`.
- Each pack file is < 800 lines, owns its own `IdGenerator` namespace, owns its own `forPack()` early-return.
- Top-level `inference/engine.ts` becomes the orchestrator that fans in/out per-pack modules.
- Migrate one pack at a time, run tests after each, keep the old monolith functions until the migration is complete (parallel-run for one full cycle to verify identical outputs).

**Step 20.7 — Expose `engine.run()`** (1 day)

- New file: `packages/workspace/engine.ts` exporting `run(input: EngineRunInput): EngineRunOutput`.
- This wraps `recomputeAllAsync` + `estimateImpact` + `projectAll` into one entry point.
- `apps/audit-runner/run-cycle.ts` shrinks to a thin orchestrator that just calls `engine.run({ scope: 'full_cycle', ... })` and handles persistence.
- This is the API surface Wave 21 depends on.

### Wave 20 — Acceptance criteria

A cycle run end-to-end on havefunnels.com produces the same `FindingProjection[]` + `ActionProjection[]` as the pre-Wave-20 version (regression-tested via snapshot comparison), AND:

- `grep -r "additional_signals\|additional_inferences" packages/ apps/` returns zero matches.
- `grep -r "createSignal" packages/ workers/` returns matches only in `packages/signals/create.ts`.
- `packages/inference/triple-source-inference.ts` no longer exists.
- `engine.run({ scope: { url: '...', enrichers: ['copy_micro_copy'] }, ... })` runs and returns a partial `EngineRunOutput`.
- Every `Decision.status` reflects its actual cross-cycle state (not all `Created`).

### Wave 20 — Estimated effort

~8-12 days of focused work. Reviewable in PRs of 1-2 days each. Risk profile: medium — the engine is well-tested at the recompute level, so regressions surface quickly via snapshot diffs.

### Wave 20 — Out of scope

- New inference rules. No.
- New packs. No.
- Performance optimization beyond what falls out of the consolidation. The goal is coherence, not speed.

---

## Wave 21 — Always-On Revenue Protection Layer

**Depends on Wave 20.7** (the `engine.run({ scope: targeted })` API).

Strategy + cost analysis: see the [always-on cost analysis memory](../.claude/projects/-Users-luisgall-Downloads-Vestigio-io-vestigio-io/memory/project_always_on_cost_analysis.md). Incremental LLM cost estimated at **~$0.03/mo/env** with event-driven design. Infra cost (probe workers + ingestion scaling) is the larger line item at ~$5-15/mo/env.

### Wave 21 — Goals

Make the Vestigio product feel like infrastructure (sticky, recurring value visible monthly) rather than a tool (episodic, low retention). Three mechanisms:

1. **Lightweight probes** — detect material changes on the customer's site without paying audit cost.
2. **Anomaly alerts** — push (Slack, email, webhook, WhatsApp) when revenue-relevant metrics move.
3. **Monthly "value caught" report** — explicit ROI to the customer at end of each month.

### Wave 21 — Sequence

**Step 21.1 — Behavioral events server-side proxy (2-3 days, can start in parallel with Wave 20)**

This is on the user's blocker list independent of always-on — adblocker brittleness means today's behavioral findings are based on ~60-70% of real traffic.

- New endpoint subdomain per env: `evt.<customer-domain>` via CNAME → Cloudflare for SaaS / Fly.io custom domain / Caddy on Vestigio edge.
- Customer onboarding flow: two copy-paste steps (1 DNS CNAME record + 1 `<script>` tag).
- Self-serve validation page: polls until DNS propagates + first event arrives, shows green check.
- The existing snippet stays — just points at the first-party hostname instead of `vestigio.io/track`. Adblockers (uBlock, Brave Shields, Safari ITP) defer to first-party policy.

**Step 21.2 — Probe scheduler (3-5 days)**

- New worker app: `apps/probe-runner/`.
- Cron-style loop every 5-15 min (configurable per plan: Max=5min, Pro=15min, Starter=hourly).
- For each active env, fetches the configured "critical pages" (initially: homepage + pricing + checkout/signup). Computes content hash. Persists `PageProbe` row.
- On hash diff: enqueue `TargetedReanalysis` job referencing the diffed URL + affected enrichers.
- The diffed URL gets re-fetched + re-enriched via `engine.run({ scope: { url, enrichers } })` from Wave 20.7. ContentEnrichmentCache (Wave 19c) already covers cosmetic changes — only semantic changes pay Haiku.

**Step 21.3 — Revenue-anomaly rules in alert-evaluator (5-7 days)**

- Extend `src/libs/alert-evaluator.ts` with new metrics:
  - `conversion_drop` — rolling 24h conversion rate dropped >X% vs prior 7d baseline.
  - `page_change_detected` — fired by 21.2 when a critical page hashes differently.
  - `error_rate_per_page` — already exists, extend to surface page-scoped alerts.
  - `funnel_dropoff_anomaly` — step in tracked funnel dropped >X%.
- Each rule type owns its own threshold logic + LLM-narration template (1 Haiku call per alert, bounded ~5/mo/env).
- Alert routing config per env: `alertChannels: { slack?, email?, webhook?, whatsapp? }`.
- **Prefer CompoundFinding chains over individual findings when composing alerts.** When multiple findings sharing a causal root trigger simultaneously, surface as a single consolidated alert ("Your checkout has 3 connected issues totalling $X/mo at risk: off-domain handoff → missing trust badges → unknown payment provider") instead of 3 spammy alerts. This requires Wave 19d (wire-compound-findings-to-cross-signals) to land first so the CompoundFinding data is already reaching the surface layer.

**Step 21.4 — Notification dispatcher (3-4 days)**

- Slack: incoming-webhook (1 line URL config).
- Email: extend the existing `brevo` integration (`src/libs/notifications.ts`).
- Webhook: HTTP POST signed with HMAC.
- WhatsApp (optional): start with [unofficial lib](../.claude/projects/-Users-luisgall-Downloads-Vestigio-io-vestigio-io/memory/) (Baileys / whatsapp-web.js via Playwright) for early-stage. Plan migration to Meta Cloud API after ~50 customers receiving alerts.

**Step 21.5 — Monthly "value caught" report (3-5 days)**

This is the stickiness lever. Without it, always-on is "fica vigiando." With it, it's "tô te poupando $X/mês."

- Cron: monthly per env on the 1st (or on subscription anniversary).
- Source of truth: `Decision.status` transitions from Wave 20.4 (`Resolved` decisions = captured value, computed from their `value_case.range_mid` at resolution time).
- Aggregation: sum of `value_case.range_mid` for all decisions that transitioned to `Resolved` during the month + alert count + diff count.
- Delivery: email PDF with the explicit framing "Vestigio caught $X this month."
- Dashboard widget: same data, always visible.

### Wave 21 — Acceptance criteria

- A copy change on havefunnels.com homepage triggers a targeted re-analysis within 15 minutes and a Slack alert within 30 minutes.
- The monthly value-caught email lands on the 1st of each month with non-zero captured value once at least one finding has been resolved across cycles.
- The customer can disable always-on per env and the audit cycle continues to work (the layer is additive).

### Wave 21 — Estimated effort

~20-30 days of focused work, parallelizable. Step 21.1 (behavioral proxy) is independent and can start now.

---

## What is NOT on this roadmap (Wave 20/21 specific)

- Replacing the LLM provider. Anthropic / Haiku 4.5 / Sonnet 4.6 / Opus 4.7 stay.
- Adding new finding packs. Wave 20 is about coherence; new packs come in Wave 22+ on the clean engine.
- Marketing / acquisition work. Premature pre-PMF — see [marketing premature memory](../.claude/projects/-Users-luisgall-Downloads-Vestigio-io-vestigio-io/memory/feedback_marketing_premature_pre_pmf.md).
- Enterprise SSO / SAML scaffolding. Comes after Wave 21 ships and the SMB ICP is validated by retention.
- Mobile optimization beyond what we have. Operator audience uses desktop.
- The PostHog Code-style "autonomous code PR" feature. Wrong audience for the SMB ICP — see [PostHog positioning memory](../.claude/projects/-Users-luisgall-Downloads-Vestigio-io-vestigio-io/memory/project_posthog_code_positioning.md).

Trigger to revisit: Railway image storage pricing becomes meaningful, or deploy time crosses ~3 min on web-only changes, or we ship lots of marketing/CMS updates that don't need a worker redeploy.

### Audit-worker deploy interrupts in-flight cycles — partially shipped

Observed 2026-05-16: every `git push` to main triggers a Railway rolling deploy of `audit-worker`. The old container's running cycle gets SIGTERM mid-flight; the new worker (or heal cron) marks the cycle `status='failed'` with `lastError=null`. Three havefunnels hot cycles died this way during a single development session (cmp7q716h, cmp7slk7d, cmp7ubm6g — all ~12 min duration).

**Shipped 2026-05-17:**

1. **Configurable graceful-shutdown drain** in `apps/audit-runner/worker-loop.ts`. SIGTERM / SIGINT / SIGUSR2 set `shutdownRequested=true` (existing), the main loop stops claiming new cycles, then the drain block awaits the in-flight `processCycle()` promises up to `WORKER_SHUTDOWN_GRACE_MS` (default 900_000 = 15 min, was hard-coded 5 min). The drain logs the running cycle IDs by name (`[worker] graceful shutdown: N cycle(s) still running, waiting up to 15 minute(s)...`) and emits a heartbeat every 30s so a long drain isn't silent in Railway's deploy log. If the deadline elapses, env locks are released best-effort so siblings can pick up immediately instead of waiting for the 15min Redis TTL.

2. **Path-filtered Railway config** at `railway.worker.json`. Lists the paths that should trigger an audit-worker rebuild (`apps/audit-runner/**`, `workers/**`, `packages/**`, `prisma/**`, the handful of `src/libs/*` files the worker actually imports, plus `Dockerfile`, `nixpacks.toml`, `package.json`, `package-lock.json`, `tsconfig.json`, `railway.worker.json` itself). Web-only commits under `src/app/**`, `src/components/**`, etc. no longer trigger a worker redeploy. Also sets `drainingSeconds: "960"` (16 min — one minute longer than the in-process grace so the worker exits cleanly before Railway escalates to SIGKILL) and `restartPolicyType: "ON_FAILURE"` with 10 retries.

3. **Companion fix already shipped** (commit `db91331`): worker-loop catch now stamps `lastError = "worker-loop: <message>"` so the next time a cycle dies we can read the cause from the DB instead of needing Railway logs.

**Still requires manual Railway dashboard setup** (operator action):

- **Point the audit-worker service at `railway.worker.json`**: Railway dashboard → audit-worker service → Settings → "Config-as-code" → set the config file path to `railway.worker.json`. Without this step, the JSON file in the repo is ignored and the existing dashboard config wins. Leave the web service pointed at its current config (or no config file) so its deploys aren't filtered.
- **Confirm `drainingSeconds`**: the JSON sets 960s but some Railway plans cap this. Dashboard → audit-worker → Settings → "Healthcheck & Restart" → confirm the value is honored after the next deploy. If capped, the JSON value silently falls back to the plan max; raise a support ticket if the cap is below 600s.
- **Set `WORKER_SHUTDOWN_GRACE_MS` env var** on the audit-worker service if you want a non-default grace (e.g. 20 min). Default (15 min) is the right starting point for havefunnels-class workloads. Should always be SHORTER than Railway's `drainingSeconds` so the worker exits via the in-process path, not SIGKILL.

**Caveats / what's NOT solved:**

- Railway's watchPatterns is path-based on the commit diff; a commit that touches both `src/app/**` AND `packages/**` still triggers a worker rebuild. That's correct (the `packages/**` change is real), but means mixed commits can't be selectively skipped.
- A cycle that exceeds 15 min still dies on deploy. Empirically p99 is ~12 min for havefunnels; if a customer's cycles routinely exceed this we'll need to raise the grace or split the cycle into checkpointable stages (much larger refactor — defer until friction shows up).
- Race window remains: a cycle that's about to be claimed (in-flight in the queue but not yet in `inFlightCycleIds`) can still be lost on SIGTERM. The heal cron's "stuck pending" pass picks these up within 15 min, which is acceptable.

### Catalog translation long-tail (Wave 18t-C continuation)

Wave 18t-C shipped the i18n infrastructure for action remediation steps — `engine.remediation.<inference_key>` block in en/es/de dictionaries, read via `translations?.remediation?.[k]` in the projection layer's catalog-lookup chain. 9 high-priority entries translated for all 3 locales (trust_boundary_crossed, policy_gap, measurement_blindspot, unclear_conversion_intent, commercial_pages_disconnected, failed_payment_revenue_drain, subscriber_churn_unsustainable, security_header_weakness, payment_diversity_insufficient). The remaining 295 entries fall through to the existing pt-BR REMEDIATION_CATALOG, which is no worse than current behavior for any locale.

When revisited:

- Generate translations for the remaining 295 entries × 3 locales × ~5 strings each = ~4,500 translations.
- Approach: extract via `/tmp/translate-catalog.py` (already written), batch-translate via LLM or human translators, inject via the same `add_or_replace_block` Python helper.
- Priority order: revenue_integrity & payment_health (customer-visible) → chargeback → security → copy_alignment → behavioral → long tail.
- Trigger to revisit: first non-pt-BR customer onboards, OR Vestigio's content team has translation bandwidth, OR a customer reports mixed-locale action drawer text.

### Per-secondary impact attribution (shipped — Wave 18t-A)

Wave 18s shipped a projection-layer fallback that splits derived secondary action titles into `remediation_steps`, lighting up the "Como Corrigir" + "Fix with AI" sections that were previously hidden. But the drawer's *Impact Breakdown* section still hid for secondaries because each one lacked an honest impact estimate.

Wave 18t-A fixed this by plumbing `inference_keys` end-to-end (engine → deriver → action → projection) and computing each secondary's impact as the MAX of its triggering inferences' value_case ranges (conservative attribution, no double-count vs parent). Dashboard `totalImpact` / `capturedValue` sums now dedupe by decision_key to keep totals honest.

This section kept for historical context; the original architectural sketch was:

Deeper fix when revisited:

- **Engine output structural change**: replace `DecisionActions.secondary: string[]` with `secondary: SecondaryAction[]`, where `SecondaryAction = { title: string; inference_keys: string[] }`. The `inference_keys` carry which firing inferences triggered the prescription. Touches all 18 builders in `packages/decision/engine.ts`.
- **Persist `inference_key` on `Action`**: pipe it through `packages/actions/deriver.ts` into the DB schema (new column on Action).
- **Projection lookup**: replace `lookupRemediationForAction(action_key)` (which strips suffix to decision_key — almost never matches a catalog entry, since the catalog is keyed by inference_key) with `lookupRemediation(action.inference_key)`. Unlocks all 304 catalog entries for derived actions.
- **Impact attribution**: each secondary's impact = sum of its `inference_keys`' evidence-based impact contributions. No double-counting against parent.

Estimated work: 1–2 days for the structural change, plus another day to backfill the catalog with secondary-specific entries where the engine emits prescriptions that don't have a 1-to-1 inference mapping.

Trigger to revisit: any customer asks "why doesn't this action show impact?" or we want the existing catalog (pt-BR remediation_steps for 304 inference_keys) to actually drive actions instead of only findings.

### Action-pack translations: complete en/de coverage for 13 packs

Wave 18r audited tr() key coverage in `packages/decision/engine.ts` across 18 pack action builders. pt-BR and es have good coverage (only payment_health + 2 stray keys were missing, now fixed). en.json and de.json are missing whole packs:

- en: 13 packs without dictionary entries (copy_alignment, brand_integrity, saas_growth_readiness, channel_integrity, friction_tax, content_freshness, mobile_revenue_exposure, trust_revenue_gap, first_impression_revenue, action_value_map, acquisition_integrity, path_efficiency, and now-partial discoverability)
- de: same 13 packs

Functional impact: zero today — the engine's `tr(key, fallback)` returns the English fallback when the dict key is missing, which is what runs in production for those locales. This is a tidiness/maintainability gap, not a customer-facing bug. Trigger to fix: any en/de customer reports inconsistent translations, OR we want a single source of truth for engine output text.

Quick win when revisited: extract every `tr('key', 'fallback')` literal from engine.ts via AST or grep, write to en.json directly (no translation effort needed since they're already English). The de.json fills are a real translation pass.

### Audit-driven backlog (Wave 18m audit pass, 2026-05-16)

Broader audit run after the `bv_1` PK collision exposed a class of latent bugs. Most shipped in Waves 18d-18m. Remaining items deferred here:

- **Impersonation auto-expiry after 1h** — `impersonationStartedAt` is set in the JWT at sign-in but never enforced as a session expiry. `blockIfImpersonating` returns 403 regardless of timestamp, so destructive actions are correctly blocked, but read access to customer data continues for the full 30-day cookie window. Fix shape: in `src/libs/auth.ts` session callback, treat the session as expired when `isImpersonating && Date.now() - impersonationStartedAt > 1h` (same pattern as `sessionExpiresAt`). UX cost: admin re-clicks "Impersonate" hourly.

- **`hasOrganization`/`hasActivatedEnv` JWT staleness** — if an admin deletes an org or deactivates an env after a user's JWT is minted, the user passes the middleware onboarding gate with stale `true` values. Downstream `resolveOrgContext()` falls back to DEMO_CONTEXT, so it's a UX bug (confusing empty state) rather than a security boundary. Fix shape: revalidate these signals on a periodic refresh (next session.update() after 1h since last refresh).

- **`isImpersonating` exit edge case** — if an admin is demoted from ADMIN to USER mid-impersonation, the exit-impersonation flow tries to mint a restore-admin token for an email that no longer has admin role, the restore-admin provider rejects, and the user is stuck impersonating until they clear cookies. Rare; UX-only impact. Fix shape: fall back to plain `signOut()` in `/api/admin/exit-impersonation` when restore-admin token mint fails.

- **Orphaned pending re-dispatch race** — SHIPPED Wave 18z (2026-05-17). Heartbeat-on-claim model: `AuditCycle.lastHeartbeatAt` is seeded when the cycle is marked `running` and refreshed every `WORKER_HEARTBEAT_MS` (default 30s) by `runAuditCycle` until the cycle returns. `healStuckCycles` now re-dispatches a running cycle when EITHER (a) it has never heartbeated AND `createdAt` is older than `STUCK_RUNNING_AFTER_MS` (25min, legacy / pre-column rows), OR (b) `lastHeartbeatAt` is older than `STUCK_RUNNING_HEARTBEAT_MS` (default 3min, 6× the heartbeat interval). An actively-heartbeating cycle matches neither branch and is safe from re-dispatch, eliminating the race entirely. Files touched: `prisma/schema.prisma` (+`lastHeartbeatAt` + `@@index([status, lastHeartbeatAt])`), `prisma/migrations/20260518000000_audit_cycle_heartbeat/migration.sql`, `apps/audit-runner/run-cycle.ts` (heartbeat timer + new heal predicate).

### Wave 20.6 — Post-mortem opportunities (2026-05-22 session)

Caught during the engine.ts monolith split + the test-suite cleanup that followed. These items don't block Wave 20.7 but each is high-leverage relative to its effort cost.

- **`funnel_journey` pack is orphan in projectWorkspaces.** Findings from `navigation_dead_ends`, `decision_moment_anxiety`, `expansion_ceiling`, `post_purchase_abandonment`, `consideration_friction` (and ~20 more — see `packages/projections/inference-to-pack.ts:417-440`) are tagged with `pack: 'funnel_journey'` but [`projectWorkspaces`](../packages/projections/engine.ts#L1986-L2086) has no workspace for that pack. Every audit cycle produces ≥1 finding that goes straight to `/dev/null` — paid CPU + LLM cost, zero customer surface. Caught by the [projections.test.ts:269](../tests/projections.test.ts#L269) "workspace findings sum equals total findings" assertion (currently allow-listed to keep CI green). Fix: ~30 lines adding a `funnel_journey` workspace projection mirroring the `copy_alignment` / `channel_integrity` pattern (workspace always emits even with zero findings; decision_key/impact synthesized from the worst finding's severity since `funnel_journey` doesn't have a pack-level decision today). Removes the test allow-list.

- **`impact_role: 'retention'` is computed but probably not surfaced.** Phase 1.2 introduced [the loss/retention split](../packages/impact/types.ts#L43) — `estimateImpact` returns both kinds of `QuantifiedValueCase`. The dashboard summary likely sums only the `loss` arm. "You're retaining R$ X/mo via working controls" is a renewal/upsell narrative that costs nothing new to compute. Surface in: the workspace summary cards, the monthly value-caught report (Wave 21.3 hook), and the FindingDetailPanel's "what this is keeping you from losing" footer. Sanity check first: grep `impact_role` in `src/components/` to confirm the assumption.

- **`harmonizeSignals` + `guardTruthConsistency` double-pass.** Both functions group signals by `(signal_key, subject_ref)` back-to-back — [`signal-harmonizer.ts:42-48`](../packages/truth/signal-harmonizer.ts#L42-L48) then again at [`consistency-guard.ts:93-99`](../packages/truth/consistency-guard.ts#L93-L99). Merging into a single grouping pass (harmonize returns the group map, guard reuses it) cuts ~50% of the truth-resolution CPU per audit cycle. The truth phase isn't the heaviest step (inferences are), but it's a clean ~5-min refactor.

- **`ensureOrgCredits` non-atomic upsert.** [`apps/platform/credits.ts:47-50`](../apps/platform/credits.ts#L47-L50) does `findUnique` → `??` → `create`. Two concurrent calls for a fresh-org user (e.g. MCP + browser tab hitting the platform simultaneously) race: both find null, both try to create, the second throws on the `@unique` constraint. Surfaced as a production bug only at the cold-start moment for each org — once OrgCredits exists, the race vanishes. Fix in 3 lines by using `prisma.orgCredits.upsert({ where: { organizationId }, update: {}, create: {...} })`. Same pattern applies to the cycle-rollover `update` if we want to make it idempotent under concurrent rollover requests.

- **SaaS signals bypass `assertTruthResolved` guard.** Documented in [`packages/workspace/recompute.ts:457-462`](../packages/workspace/recompute.ts#L457-L462): `extractSaasSignals` runs AFTER harmonize and is fed to `computeSaasInferences` via `[...signals, ...saasSignals]`. The guard does not re-run on that merged array, so any future bug that injects signals into the SaaS path silently bypasses truth resolution. Today the only affected pack is `saas_growth_readiness`, but the bypass exists for ANY signal injected via the merged-array pattern. Fix: re-root SaaS signal extraction PRE-harmonize so it participates in truth resolution + the THROW guard. Was already flagged for Wave 20.6 in the original write-up but the inference split didn't touch this path; explicitly schedule for Wave 20.7 or 20.8.

- **Cross-customer inference benchmarks (zero-collection moat play).** 177 unique `inference_key` strings across 23 packs × N customers = a benchmarking corpus that no competitor has. The query is one line of SQL: `SELECT inference_key, scoping.business_model, COUNT(*) FROM inferences GROUP BY inference_key, business_model`. Output drives: (a) inbound editorial ("73% of e-com sites with Stripe have `policy_gap`"), (b) onboarding copy ("82% of SaaS B2B see `trust_boundary_crossed` on their first audit — you're not alone"), (c) selling point on landing ("we've audited X businesses and the patterns repeat"). Zero PII — every aggregation is over inference KEYS, not values. Build shape: a nightly cron writes a `BenchmarkSnapshot` row (one per businessModel + inference_key combination), the marketing page reads from a public API that hits this table. 1-2 days for a prototype, including the landing page snippet.

---

## What is NOT on this roadmap

Per the [North Star anti-drift commitments](NORTHSTAR.md):

- Competitive benchmarks based on ungrounded LLM knowledge
- AI analysis on every crawled page
- Explosion of packs without evidence depth to back them
- Transformation into a vulnerability scanner
- Finding count maximization
- Features that don't strengthen the value delivery loop: `finding → discussion/verification → action → resolved`
