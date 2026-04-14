# ROADMAP.md — Vestigio Development Roadmap

> Last updated: 2026-04-14
> Companion to: [NORTHSTAR.md](NORTHSTAR.md), [DEV_PROGRESS.md](../DEV_PROGRESS.md), [FINDINGS_OPPORTUNITIES.md](FINDINGS_OPPORTUNITIES.md), [COLLECT_OPPORTUNITIES.md](COLLECT_OPPORTUNITIES.md)
>
> **2026-04-14 Admin org provisioning + continuous-incremental engine plan (Wave 5 spec):** Two outputs from this session. **(1) Admin org provisioning shipped (commit `4431774`).** New `POST /api/admin/organizations` creates Org + owner User (null password — admin enters via impersonation) + Membership + Environment + BusinessProfile in one transaction, audit-logged. New `PATCH /api/admin/organizations/[id]` for manual plan/status/orgType/trialEndsAt overrides (bypasses Stripe/Paddle flow, for demos/trials/comp'd accounts; captures before/after in `AuditLog.metadata.changes`). New `/app/admin/organizations/new` form UI with success state that links straight into impersonation. Org detail page gained inline "Edit plan & type" panel. "New Organization" button added to admin orgs list. **Paddle webhook parity confirmed** — [src/app/api/paddle/webhook/route.ts](../src/app/api/paddle/webhook/route.ts) already updates `Organization.plan` + `status` on `subscription.created/updated/canceled/paused/resumed` and `transaction.completed` via `resolvePlanFromPriceId()`; full parity with Stripe. **(2) Wave 5 — Continuous Incremental Engine specified.** Infrastructure audit revealed three existential gaps for scaling audits to "continuous intelligence" as the pitch promises: (a) `continuousAudits` flag in [src/libs/plan-config.ts](../src/libs/plan-config.ts) is cosmetic — no scheduler exists, the only cycle creators today are Stripe/Paddle webhooks and the heal cron; (b) `cycleType` values `full | incremental | verification` in [prisma/schema.prisma](../prisma/schema.prisma) are cosmetic — [apps/audit-runner/run-cycle.ts](../apps/audit-runner/run-cycle.ts) never reads `cycle.cycleType` and always runs the full pipeline; (c) audit-runner dispatch is in-process `Promise.then()` fire-and-forget from webhooks, meaning process restart silently loses in-flight cycles (5-10min recovery window via heal cron) and multi-replica Railway deploys run the heal `setInterval` N times in parallel with no leader election, causing duplicate re-dispatches. Wave 5 architecture: **hot/warm/cold ternary mode** (hot = revenue-critical surfaces every 15min-6h depending on plan, warm = rotating sampling of periphery, cold = full baseline weekly minimum regardless of plan) + **critical surface hybrid model** (heuristic auto-detection + user-marks up to 10 surfaces as critical from inventory sidedrawer with mixed-weight scoring from finding severity + traffic volume) + **warm guarantee** (every surface visited at least once per warm cycle window) + **demo org exception** (`orgType=demo` never pauses) + **infra rearchitecture**: wire `runAuditCycle` into existing but unused `apps/platform/redis-job-queue.ts` (has lock + TTL + retry, just not consumed by audit-runner), separate worker service on Railway (`start:worker` deploy sharing image + Redis + DB), Redis `SET NX EX` leader election for the heal/scheduler crons, Chromium browser pool with semaphore of 3 (~1GB RAM ceiling) + context reuse. Rollout staged as **Fase 1 (Foundation infra)** → **Fase 2 (Activation flow: admin create simplified + onboarding refactor + SSE wiring on inventory/analysis/actions + lastAccessedAt + inactivity pause)** → **Fase 3 (Incremental engine: EvidenceSnapshot.contentHash + FindingEvidenceDep index + CriticalSurface table + cycleType branching in pipeline + regression detection moved from aggregator to engine + hot/warm/cold scheduler)** → **Fase 4 (Feature-flag rollout: demo org first, then 1-2 real customers, metrics on Redis backlog + p95 duration + memory per worker + DB pool saturation)**. See § Wave 5 below for the full spec.
>
> **2026-04-12 Engine expansion + marketing polish continued:** Four major engine streams completed over 2026-04-11/12. **(1) Wave 3.3 Cybersecurity Pack — fully shipped.** Grew from the original 4 findings to **12 findings** across security headers, mixed content, redirects, sensitive endpoints, CORS, rate limiting, cookies, error pages, and predictable URLs. All findings reframed with commercial language ("Browsers signal your site as unsafe to buyers" instead of "Security Headers Weak"). Nuclei and Katana enrichment passes wired into the pipeline runner (`workers/ingestion/enrichment/runner.ts`). Dedicated `SecurityWorkspace` with aggregation logic (`packages/workspace/security-workspace.ts`). New `money_moment_exposure` decision pack. **(2) Wave 3.1 LLM Enrichment — extended to 7 findings.** Beyond the original policy page analysis (Tier 1), added 4 new enrichment types: `checkout_trust`, `cta_clarity`, `product_page_quality`, `pricing_page_framing` with Haiku LLM calls per page type. Then Tier 2 added 3 more: `social_proof_quality`, `form_error_quality`, `onboarding_quality` — signals + inferences wired but semantic enrichment pass not yet extended to produce their evidence. **(3) Wave 3.11 Workspace Redesign — partially shipped.** Pulse Summary API endpoint (`/api/workspace/pulse-summary`) with Haiku briefings + 1h in-memory cache. Frontend redesign: 5 perspectives (Panorama, Receita, Confiança, Comportamento, Copy) with 4 transversal lenses (Pulse Summary, Revenue Map, Cycle Delta, Bragging Rights). Perspective detail pages at `/workspaces/perspective/[slug]`. Needs browser verification. **(4) Wave 2.2 Members & Invite — partially shipped.** OrgInvite Prisma model, API routes (`/api/organization/invites`, `/api/organization/invites/accept`), InviteMemberModal component, accept-invite page. **(5) Homepage polish continued:** replaced counter stats with Chargeflow-inspired bento grid (4X ROI Guarantee hero card, Vestigio Pulse orbit visual, Quick Start/Visibilidade Completa/Monitoramento Contínuo/Integrações cards), fixed FAQ mobile accordion (max-height transition), added trust headline above client gallery, receita→faturamento i18n fix, MiniCalculator domain regex validation + currency localization, white bold headline above ProductTour. Complete German (de) engine translations added. **(6) ROADMAP expansion:** Added Wave 3.7 (Copy Analysis Pack, 16-item A-P spec), 3.8 (Shopify completion), 3.9 (Stripe Revenue Intelligence), 3.10 (Ad Platform Integrations), 3.11 (Workspace Redesign spec).
>
> **2026-04-11 Marketing surface polish + SEO overhaul:** Two streams of work completed over 2026-04-10/11. **(1) Homepage UX polish (Phases 11-14).** Removed 5th pill card for symmetry (2+2 mobile grid), fixed FAQ accordion clipping (grid-rows + min-h-0), moved CTA from Hero to below ProductTour, tightened Hero/ProductTour gap, added BigCard rounded corners on mobile, redesigned pill cards for mobile (icon badge on corner, single-line layout), reordered sections (SolutionLayers right after BigCard, renamed pill to "O que a Vestigio faz"), fixed mobile hamburger menu (flex-col + dropdown height), hid FeaturesWithImage on mobile, reordered Features bento (CSS order for mobile: audita→diagnostica→prioriza→recupera while preserving desktop bento grid), rewrote ProductTour Maps tab as a zigzag flowchart with bezier SVG connectors, redesigned mobile tabs (icon-only with active label), fixed panel height (overflow-y-auto), centered URL bar, colored traffic light dots, bumped hero headline to 2.5rem, replaced ShinyButton (removed sparkle, inverted to white bg/black text/emerald highlight), removed CallToAction section. **(2) SEO overhaul** based on freeseoknowledge.com best practices audit. Added: JSON-LD structured data (Organization, WebSite with SearchAction, SoftwareApplication with 3 pricing tiers, FAQPage on FAQ section), dynamic OG image (1200x630 via ImageResponse API), metadataBase + canonical URLs, hreflang tags for 4 locales (en/pt-BR/es/de), expanded sitemap (added /pricing, dynamic blog posts from Sanity, fixed lastModified), replaced force-dynamic with revalidate=3600 on homepage + blog, improved page titles (keyword-rich extended format), added OG/Twitter metadata to pricing/blog/support pages, added generateMetadata to blog posts and author pages, added noindex layout for /scans/, expanded robots.txt disallows (/lp/, /scans/). SEO score estimated improvement: 4/10 → 7-8/10.
>
> **2026-04-07 Wave 2.4 — Confidence out of the UI, verification reframed as corroboration:** Two operator-facing vocabulary problems were dragging the product down even though the engine was correct. **(1) Confidence as a number was hostile.** Drawers, chat messages, workspace cards all showed "67% / 82% / Confidence dropped 12 points" strings — operators kept asking "is 67% good?" and there was no good answer because confidence is internal calibration data, not a UX surface. Wave 2.4 adds a `confidence_tier: 'low' | 'medium' | 'high'` field to `FindingProjection` + `ActionProjection` (thresholds 70/40, aligned with the engine's existing internal floor at [packages/intelligence/root-causes.ts:284](../packages/intelligence/root-causes.ts) and [packages/impact/engine.ts:115](../packages/impact/engine.ts)), filters `low` findings out of `projectFindings()` entirely (so they never reach the UI but the engine still processes them for calibration / change detection / MCP internal context), and **removes every confidence percentage from every UI surface** — finding drawer badge, action drawer row, analysis "Conf" column + filter dropdown, workspace summary cards, workspace detail "Trust Strength" section, maps drawer + node tooltip, chat ConfidenceBlock (removed from union entirely), chat FindingCard "% conf" label, suppression callout, truth context delta, VerificationPanel "confidence dropped" message. The MCP system prompt was updated from "Cite confidence percentages" to **"NEVER cite numeric confidence percentages in your output"** and the tool-adapter / answers.ts / suggestions.ts had their `Confidence: X%` narration stripped — the LLM still receives confidence in raw projections it consumes internally for ranking, but does not narrate it back. **(2) The verification lifecycle vocabulary suggested the finding might be fake.** The internal enum `unverified / pending / partially / verified / degraded / stale` framed browser verification as a fact-check on whether the finding was real, but static evidence is *real evidence* — browser verification is corroboration layered on top, not a "let's see if this is true" gate. Wave 2.4 renames the projection-layer string union to `static_evidence / confirming / partial_confirmation / confirmed / evidence_weakened / confirmation_expired`. The engine's internal `VerificationMaturity` enum stays unchanged; only the projection-layer string is renamed, with backwards-compat via `migrateLegacyVerificationMaturity()` at the persistence boundary so cycles run before Wave 2.4 still render correctly when reloaded from DB. Three new i18n namespaces (`verification_badge`, `verification_panel`, `verification_sufficiency`) carry the new operator-facing labels in en/pt-BR/es. Foundation articles' "How we detect it" section was rewritten to talk about severity + verification stage instead of confidence (the rewrite happens in the generator so all 154 articles pick it up automatically). Dictionary cleanup pruned `confidence_label`, `columns.confidence`, `cards.avg_confidence`, the entire `filters.confidence` block, `confidence_reduced`, `workspaces.confidence/structural/economic`, and dropped the `{delta}%` suffix from `contradictions_detected`. **65/65 tests pass, 0 TS errors. Wave 2.4 fully complete.** See [DEV_PROGRESS.md § Wave 2.4](../DEV_PROGRESS.md) for the full diff.
>
> **2026-04-07 Wave 2.3 — Root cause vocabulary refinement (33 → 27, all rewritten):** The root cause vocabulary had 32 active keys with three abuse keys that always fired together (`abuse_friendly_channel`, `deep_commerce_abuse_surface`, `weak_commerce_governance`), four discoverability keys that resolved to identical map nodes, three brand impersonation keys that were really severity tiers of one problem, and engine-facing jargon (`uncontrolled_commerce_variant`, `commerce_continuity_exposure`, `elevated_dispute_risk`) that operators couldn't act on. Wave 2.3 is a **vocabulary-only refactor** — engine inference keys did not change, only `INFERENCE_TO_ROOT_CAUSE` mapping + `ROOT_CAUSE_TITLES` + `ROOT_CAUSE_DESCRIPTIONS` were rewritten. Consolidations: 3 abuse → `commerce_abuse_exposure` (1), 4 discoverability → `commerce_pages_invisible_to_search` + `brand_inconsistent_in_previews` (2), 3 brand impersonation → `brand_impersonation_active` (1). Renames: `commerce_continuity_exposure` → `commerce_operations_exposed`, `uncontrolled_commerce_variant` → `untracked_purchase_paths`, `elevated_dispute_risk` → `dispute_defenses_absent`. Two cases where consolidation was rejected after explicit user direction (**"nao faça merge se nao fizer sentido fazer"**): `weak_conversion_signal` stays distinct from `friction_barrier_on_path` (one is about the conversion signal itself being absent/unreliable, the other is about active friction), and `runtime_commerce_fragility` got its own new `runtime_fragility` `RootCauseCategory` instead of being merged into `friction_barrier`. All 27 descriptions rewritten end-to-end as 3-4 sentence operator-facing paragraphs (structural condition → commercial consequence → remediation hint, without prescribing a specific fix). Foundation articles auto-regenerated from 160 → 154 (127 finding articles unchanged + 27 root cause articles down from 33). Translations rewritten in en/pt-BR/es. Only one hardcoded engine-side reference needed updating ([packages/maps/engine.ts](../packages/maps/engine.ts) `rcToCategory` lookup). No DB migration needed — Prisma's `Finding.rootCause` stores the title string, not the key, so persisted findings continue to render. **65/65 tests pass, 0 TS errors. Wave 2.3 fully complete.** See [DEV_PROGRESS.md § Wave 2.3](../DEV_PROGRESS.md) for the full diff.
>
> **2026-04-07 Wave 2.1 — Knowledge Base wired end-to-end + 160 foundation articles:** The Learn-more loop on findings, actions and chat is now closed. Both the finding drawer and the action drawer always render a styled Learn-more card (no more dead "docs coming soon" placeholder); a new `kb_article_card` content block lets the LLM emit `$$KB{finding:KEY}$$` / `$$KB{root_cause:KEY}$$` markers inline in chat, resolved server-side via Sanity with locale awareness. The breakthrough is a programmatic foundation article generator at [packages/knowledge/foundation-articles.ts](../packages/knowledge/foundation-articles.ts) that derives one foundation article per inference_key (127) and per root_cause_key (33) from the engine's existing structured metadata — total **160 foundation articles, all guaranteed to exist**, all rendered as Sanity Portable Text so the existing slug page renders foundation and authored content identically. Sanity remains the override layer: any hand-authored article with a matching key/slug wins on conflict. Coverage is enforced by a new test suite that fails the build if anyone adds an inference_key without a foundation article. Wave 2.1 parts A (sidenav), B (catalog page), C (Sanity schema) were already shipped in earlier work — D (finding drawer) and E (action drawer) are now done. **Wave 2.1 is fully complete.** Also fixed 3 unrelated pre-existing TypeScript errors that were blocking the typecheck (ExportButton reduce inference, pricing-card duplicate export, stage-d-enrichment orphaned `@ts-expect-error`). 65/65 tests pass, build clean. See [DEV_PROGRESS.md § Wave 2.1](../DEV_PROGRESS.md) for the full diff.
>
> **2026-04-07 Wave 1 — Stage D shipped (with LLM-ready foundation):** Stage D Selective Headless is live as the first implementation of a **generalizable enrichment pass framework** ([workers/ingestion/enrichment/](../workers/ingestion/enrichment/)). The framework was designed so Wave 3 LLM Semantic Enrichment will plug in as another pass with no staged-pipeline.ts changes — just drop a new file in `enrichment/` and register it in the runner. Stage D itself: business-aware scenarios per business model (ecommerce / lead_gen / saas / hybrid), shared support-reach probe for chargeback resilience, retry with exponential backoff for transient failures (turnstile, captcha, browser launch, network, timeout), 1 successful execution per cycle cap, gates on `mode === 'full' && spa_detected`. Reuses BrowserWorker via a new `executeRequest()` method. Audit-runner now passes mode + business_model (was missing). Also fixed 3 projections.test.ts assertions that broke during behavioral workspaces Phase B (filter behavioral placeholders so the test expects 3 core workspaces, not 10). 24 new tests, 14/14 main suites pass, build clean. **Wave 1 is now fully complete.** With Wave 0 also complete, the next focus is Wave 2 (Knowledge Base, Members, Root Cause vocab refinement, Confidence Gap, Prisma Migrate). See [DEV_PROGRESS.md § Stage D](../DEV_PROGRESS.md) for the full diff.
>
> **2026-04-07 Wave 1 prep:** Wave 0 is fully complete (0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7 ✅). The 7 behavioral workspaces are wired end-to-end. Stale "Open" status rows in Wave 0.2/0.3/0.5/0.6 detail blocks have been corrected. New Wave 1.9 spec added for Stage D (selective headless) — the only remaining Wave 1 item. Snapshot state and hand-off notes for the next session live in [DEV_PROGRESS.md § Wave 1 Prep](../DEV_PROGRESS.md#wave-1-prep--starting-state----2026-04-07). Sprint 3.12 (onboard form refactor) intentionally deferred to post-Wave 1 because the surface area is too large to risk before Stage D.
>
> **2026-04-07 Behavioral workspaces wired up (after Wave 0.3):** The 7 pixel-dependent workspaces (First Impression Revenue, Action Value Map, Acquisition Integrity, Mobile Revenue Exposure, Friction Tax, Trust Revenue Gap, Path to Purchase Efficiency) are now live end-to-end. The engine layer was largely already implemented (signals, inferences, decisions, factory, baselines, eligibility, projection plumbing) — only 3 wiring gaps were stopping it: (1) the Wave 0.3 worker now emits a second `BehavioralCohortPayload` evidence so the cohort signal extractor fires; (2) `recomputeAll()` now passes `behavioralContext` to `computePackEligibility()` so the eligibility result is real; (3) the `projectFindings` if-else got 7 new cases for the behavioral pack keys. Phase B added `category` + `pixel_status` fields to `WorkspaceProjection` and refactored `projectWorkspaces` to ALWAYS emit the 7 cards (even with no findings) so the UI can show placeholder/greyed states. Phase C grouped the workspaces page into Core/Behavioral sections, added a yellow "Configure Vestigio pixel" banner, and built a locked card variant that routes the user to /app/settings/data-sources. New i18n keys in en/pt-BR/es. All 14 test suites pass, build clean. See [DEV_PROGRESS.md § Behavioral Workspaces](../DEV_PROGRESS.md) for the full diff.
>
> **2026-04-07 Wave 0.3 update (after Wave 0.2):** Wave 0 is **fully complete**. The pixel event processing worker reads `RawBehavioralEvent` rows persisted by Wave 0.2, runs `aggregateSession()` per session, reduces N session aggregates into one `BehavioralSessionPayload`, and emits it as Evidence inline in the audit-runner before `recomputeAll()`. As a small bonus, `/api/inventory` now does a `COUNT(DISTINCT sessionId)` query per surface so the inventory page shows real `session_count` instead of `null` — that closes Wave 0.5 properly. The 30-day window is enforced by a prune in the existing instrumentation cron. 10 new reducer tests, all 14 project test suites pass, build clean. Wave 0 status: **0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7 — all done.** The 7 behavioral workspaces plan at `~/.claude/plans/ticklish-discovering-nova.md` is now unblocked. See [DEV_PROGRESS.md § Wave 0.3](../DEV_PROGRESS.md) for the full diff.
>
> **2026-04-07 Wave 0.2 update (after Wave 0.6):** Pixel ingest endpoint is live. New `RawBehavioralEvent` Prisma model (one row per snippet event), new `POST /api/behavioral/ingest` route with CORS preflight, dual content-type support (sendBeacon `text/plain` + fetch `application/json`), env-id existence check (cached 5min), IP-hashed in-memory rate limit (600 events/min), per-event sanitizer (drops unknown types / oversized payloads / clock-skewed events), and a 5-min memory prune cron. The snippet at `public/snippet/vestigio.js` POSTs to a real URL now. Wave 0 status: 0.1, 0.2, 0.4, 0.6, 0.7 done; 0.5 still partial (sessions still null until 0.3 ships). Remaining Wave 0: only **0.3** (pixel processing worker). See [DEV_PROGRESS.md § Wave 0.2](../DEV_PROGRESS.md) for the full diff. **Manual step required**: run `prisma db push` against production with `DATABASE_PUBLIC_URL` set to add the `RawBehavioralEvent` table — the app build is fine but ingest writes will fail until the table exists.
>
> **2026-04-07 Wave 0.6 update (after Wave 0.7):** Verification frontend wiring shipped. The Actions drawer's "Re-verify" and "Confirm Resolution" buttons are no longer toast stubs — they now POST to a new `/api/verification/run` route that goes through the existing `mcpServer.verify()` policy + orchestrator + recompute pipeline and returns the updated action projection so the UI refreshes inline. Also fixed a latent bug in `McpServer.executeVerification()` that was dropping translations + previousSnapshot on every recompute, which would have erased i18n labels and change_class badges after each verification. Wave 0 status: 0.1, 0.4, 0.6, 0.7 done; 0.5 partial. Remaining Wave 0: 0.2 + 0.3 (pixel pipeline). See [DEV_PROGRESS.md § Wave 0.6](../DEV_PROGRESS.md) for the full diff.
>
> **2026-04-07 Wave 0.7 update (after Sprint 4):** Findings persistence + change detection shipped end-to-end. Two new Prisma models (`CycleSnapshot`, `Finding`), two new stores (`PrismaSnapshotStore`, `PrismaFindingStore`). The audit-runner now runs `recomputeAll()` with `previous_snapshot` lookup → `projectAll()` → dual persist (snapshot + findings). `/api/inventory` shows real finding counts per surface. Cold-start `ensureContext()` rehydrates with change_class populated. The frontend `/app/(console)/analysis/page.tsx` already had `change_class` filters/badges wired — they now light up with real data automatically. Wave 0 status: 0.1, 0.4, 0.7 done; 0.5 partial (mocks gone, finding_count is real now, sessions still null until pixel pipeline). Remaining Wave 0: 0.2 + 0.3 (pixel) + 0.6 (verify UI). See [DEV_PROGRESS.md § Wave 0.7](../DEV_PROGRESS.md) for the full diff.
>
> **2026-04-07 Sprint 2-4 update (later same day):** Dual funnel shipped. The `/lp` anonymous lead funnel is live end-to-end: visitor → 4-step form → mini-audit (Stage A only, 5s, cached 14d by domain) → animated result page with 5 visible + 10 blurred findings → Paddle Checkout → webhook promotes lead to a real User+Org+Env+AuditCycle → magic link sent. The crawler pipeline gained a `mode: 'full' | 'shallow_plus' | 'shallow'` field so it can serve all three funnels (signup, /lp, admin outreach) from one codebase. The admin gained a Surface Scans tab under Growth that lets sales/marketing run shallow_plus prospect audits with shareable public links. See [DEV_PROGRESS.md § Sprint 2-4](../DEV_PROGRESS.md) for the full diff. None of this is part of Wave 0 — Sprint 2-4 is independent commercial work that runs in parallel.
>
> **2026-04-07 Sprint 1 update:** Wave 0.1 + 0.4 shipped, Wave 0.5 partial. See entries below for details and [DEV_PROGRESS.md § Sprint 1](../DEV_PROGRESS.md) for the full diff. Onboarding → audit auto-trigger now works end-to-end: payment → worker fire-and-forget → live banner-row in inventory.
>
> **2026-04-06 deep pipeline audit added Wave 0** — see below. The audit
> revealed that several P0 gaps were absent from the previous roadmap, so the
> "Known open items" table has been rebuilt against ground truth (the actual
> code, not assumptions). See [DEV_PROGRESS.md § Pipeline Audit 2026-04-06](../DEV_PROGRESS.md#pipeline-audit--2026-04-06--ground-truth-vs-roadmap)
> for the full per-phase report with file:line references.

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

## What's already done

See [DEV_PROGRESS.md](../DEV_PROGRESS.md) for the full build history. Key milestones:

- **Phases 1-23**: Core engine (evidence → signals → inferences → decisions → projections), 4 decision packs, graph, preflight, suppression, verification lifecycle, change detection
- **Phases 24-29**: Enterprise-grade behavioral consistency, truth resolution, calibration, observability
- **Phase 30 series**: 47 findings across 4 packs, title rewrites, impact baselines, root cause mappings
- **Phases 2-2D**: Collection deepening (recursive crawl, technology registry, mobile verification, network analysis, structured data, inline scripts, policy content analysis)
- **Phases 3A-3E**: Channel integrity, Katana, Nuclei, discoverability, brand impersonation
- **Phases 4A-4B**: Shopify integration, behavioral intelligence, surface vitality, inventory UI
- **Phase 5**: Claude LLM chat (3-layer pipeline, 21 MCP tools, 30 playbooks, SSE streaming, conversation persistence)
- **Phase 0 UX**: Actions page, workspaces, analysis, maps, chat rewrite

### Known open items (rebuilt from 2026-04-06 audit, updated 2026-04-07)

| Item | Status | Wave | Source |
|------|--------|------|--------|
| Onboarding → ingestion auto-trigger | ✅ **Done — Sprint 1 (2026-04-07)** | Wave 0.1 | apps/audit-runner/run-cycle.ts |
| Inventory auto-build from parser | ✅ **Done — Sprint 1 (2026-04-07)** | Wave 0.4 | persisted inside audit-runner worker |
| Inventory mock data removed | ✅ **Done — Wave 0.7 + 0.3 (2026-04-07)** | Wave 0.5 | api/inventory/route.ts — finding_count from PrismaFindingStore (0.7); session_count from RawBehavioralEvent per-surface count (0.3) |
| Pixel ingest endpoint `/api/behavioral/ingest` | ✅ **Done — Wave 0.2 (2026-04-07)** | Wave 0.2 | RawBehavioralEvent model + POST route + CORS + IP-hashed rate limit |
| Pixel event processing worker | ✅ **Done — Wave 0.3 (2026-04-07)** | Wave 0.3 | apps/audit-runner/process-behavioral.ts — inline in run-cycle.ts before recompute |
| Verification UI → backend wiring | ✅ **Done — Wave 0.6 (2026-04-07)** | Wave 0.6 | POST /api/verification/run + actions page handler; toast stubs replaced |
| Findings persistence to PostgreSQL | ✅ **Done — Wave 0.7 (2026-04-07)** | Wave 0.7 | CycleSnapshot + Finding Prisma models, change detection wired |
| Behavioral workspaces (7) wired up + UI category | ✅ **Done — 2026-04-07** | Wave 1 | engine plumbing was already in place; cohort emission + recompute eligibility + Behavioral category in workspaces page + greyed-out placeholders + yellow banner |
| Stage D selective headless | ✅ **Done — Wave 1 (2026-04-07)** | Wave 1 | enrichment pass framework + Stage D pass + business-aware scenarios + retry + wire; see § 1.9 below |
| Knowledge Base — finding/action drawer Learn more + chat KB cards + 160 foundation articles | ✅ **Done — Wave 2.1 (2026-04-07)** | Wave 2.1 | drawers always render styled card; chat embeds `$$KB{...}$$` markers as styled blocks; programmatic foundation generator covers every finding + root cause; Sanity remains override layer |
| Root cause vocabulary refinement (33 → 27, all rewritten) | ✅ **Done — Wave 2.3 (2026-04-07)** | Wave 2.3 | 8 keys consolidated, 6 renamed, 27 descriptions rewritten end-to-end; new `runtime_fragility` category; no DB migration needed (Prisma stores title string); foundation articles auto-regenerated 160 → 154 |
| Confidence out of UI + verification reframed as corroboration | ✅ **Done — Wave 2.4 (2026-04-07)** | Wave 2.4 | `confidence_tier` (low/medium/high) bucketing at projection layer, `low` filtered out before reaching UI; every confidence percentage removed from drawers/tables/cards/chat/maps/MCP narration; verification stages renamed to `static_evidence/confirming/partial_confirmation/confirmed/evidence_weakened/confirmation_expired`; backwards-compat via `migrateLegacyVerificationMaturity()`; engine internals untouched |
| Katana / Nuclei runners | ✅ **Done — Wave 3.3 (2026-04-11)** | Wave 3.3 | Wired as enrichment passes in `workers/ingestion/enrichment/runner.ts` (katanaDiscoveryPass → nucleiScanPass) |
| Cybersecurity Pack (12 findings) | ✅ **Done — Wave 3.3 (2026-04-11)** | Wave 3.3 | 12 findings in `money_moment_exposure` pack, SecurityWorkspace, all i18n |
| LLM Enrichment — Policy + Copy (7 findings) | ✅ **Done — Wave 3.1 (2026-04-11)** | Wave 3.1 | Tier 1 (4 enrichment types) + Tier 2 (3 copy signals wired, enrichment pass pending) |
| Workspace Redesign — Perspectives + Lenses | **Partial — Wave 3.11 (2026-04-11)** | Wave 3.11 | Pulse Summary API + frontend redesign built; needs browser verification |
| Members & Invite Flow | ✅ **Done — Wave 2.2 (2026-04-12)** | Wave 2.2 | Full lifecycle: OrgInvite model, invite/accept/revoke APIs, Brevo email, seat limits, members table with role management |
| `integration_pull` executor | Scaffolded only | Wave 3 | executors.ts:197-212 returns "not implemented" |
| `body_text_snippet` 500 → 2000 chars | ✅ **Done — 2026-04-12** | Wave 3.7B | parser.ts:105 changed to 2000 |
| Nuvemshop Integration (full) | ✅ **Done — 2026-04-12** | Wave 3.7B | OAuth callback, adapter package, poller, reconciliation, audit runner, Data Sources UI, KB guide, LGPD webhooks |
| Conversation export/branching | Not started | Wave 4 | unchanged |
| `prisma db push` → `prisma migrate` | Pending | Wave 2 | unchanged |
| Admin-driven org provisioning (Org + Owner + Membership + Env + BusinessProfile + plan override, impersonation-ready) | ✅ **Done — 2026-04-14** (commit `4431774`) | — | `POST /api/admin/organizations`, `PATCH /api/admin/organizations/[id]`, `/app/admin/organizations/new`, inline "Edit plan & type" panel on detail page, audit-logged |
| `cycleType: 'incremental'` actually implemented in engine | **Cosmetic today** — planned | Wave 5 | [apps/audit-runner/run-cycle.ts](../apps/audit-runner/run-cycle.ts) never reads `cycle.cycleType`; always runs full pipeline. See § Wave 5 Fase 3 |
| `continuousAudits` scheduler | **Cosmetic today** — planned | Wave 5 | Flag exists in plan-config but no code creates recurring cycles. See § Wave 5 Fase 3 |
| Audit-runner persistence (queue + worker service + leader election) | **Risk today** — planned | Wave 5 | In-process `Promise.then()` from webhooks; restart silently orphans cycles; multi-replica `setInterval` duplicates heal work. See § Wave 5 Fase 1 |
| Activation flow (owner-driven env creation + first-cycle trigger + SSE progress on inventory/analysis/actions + inactivity pause after 14d) | Planned | Wave 5 | See § Wave 5 Fase 2 |

---

## Wave 0 — Critical Pipeline Gaps

**Goal:** Close the load-bearing breaks in the data pipeline that the 2026-04-06 audit surfaced. Each item below is a step where the user-visible product is broken or where the architecture promises something the code doesn't deliver. **Nothing else in the roadmap matters if these don't ship first** — Wave 1 polish on top of a broken pipeline is wasted effort.

These are ordered by dependency: 0.1 unblocks 0.4-0.5, which unblock 0.7, which strengthens 0.6.

---

### 0.1 Onboarding → Ingestion Auto-Trigger ✅

| | |
|---|---|
| **Tag** | `platform` `engine` |
| **Priority** | P0 |
| **Status** | **Done — Sprint 1 (2026-04-07).** New worker [apps/audit-runner/run-cycle.ts](../apps/audit-runner/run-cycle.ts) `runAuditCycle()` is dispatched fire-and-forget from both [stripe/webhook/route.ts](../src/app/api/stripe/webhook/route.ts) and [paddle/webhook/route.ts](../src/app/api/paddle/webhook/route.ts) right after `prisma.auditCycle.create({status:'pending'})`. The worker marks the cycle `running`, calls `runStagedPipeline()`, persists Evidence + PageInventoryItem, marks `complete`/`failed`. A heal cron in [src/instrumentation.ts](../src/instrumentation.ts) runs every 60s to (a) auto-fail cycles stuck in `running` >10min and (b) re-dispatch orphaned `pending` cycles >5min old (recovers from process restart). |
| **What** | ✅ Webhook → fire-and-forget worker → staged pipeline → DB persistence → status transition. No manual action required. |
| **Acceptance** | ✅ Met. New user signs up → completes payment → lands on `/app/onboarding/thank-you` → auto-redirect to `/app/inventory` where the live banner-row shows audit progress and rows appear as the crawler discovers pages. |

---

### 0.2 Pixel Ingest Endpoint ✅

| | |
|---|---|
| **Tag** | `collection` `platform` |
| **Priority** | P0 |
| **Status** | **Done — Wave 0.2 (2026-04-07).** New Prisma model `RawBehavioralEvent` (one row per event, indexed by `(envId, sessionId, processedAt)` for the Wave 0.3 worker). New `POST /api/behavioral/ingest` route in [src/app/api/behavioral/ingest/route.ts](../src/app/api/behavioral/ingest/route.ts) with CORS preflight, dual content-type support (sendBeacon `text/plain` + fetch `application/json`), env-id existence cache, IP-hashed in-memory rate limit (600 events/min, daily-rotating salt), per-event sanitizer (drops unknown types / oversized payloads / clock-skewed events). Always returns silent 204 so bots can't differentiate accept vs reject. Persistence schema is deployed in production. |
| **What** | ✅ Route + model + defense layers + 30-day prune cron. |
| **Acceptance** | ✅ Met. Snippet → endpoint → DB. See [DEV_PROGRESS.md § Wave 0.2](../DEV_PROGRESS.md). |

---

### 0.3 Pixel Event Processing Worker ✅

| | |
|---|---|
| **Tag** | `collection` |
| **Priority** | P0 (depends on 0.2) |
| **Status** | **Done — Wave 0.3 (2026-04-07).** New worker [apps/audit-runner/process-behavioral.ts](../apps/audit-runner/process-behavioral.ts) reads the last 30 days of `RawBehavioralEvent` for the env, groups by `(envId, sessionId)`, calls `aggregateSession()` per session, reduces N session aggregates into one `BehavioralSessionPayload` AND one `BehavioralCohortPayload` (the latter added 2026-04-07 to power the 7 behavioral workspaces). Architecture is **inline** in `runAuditCycle()` right before `recomputeAll()` — no separate cron, the cycle_ref is already known, no race conditions with snapshot/findings persistence. Window-based not delta-based: each cycle re-aggregates the full 30-day window. Persists the new evidence via `PrismaEvidenceStore.addMany` for cold-start rehydration. 30-day prune cron in `instrumentation-node.ts`. 10 reducer tests cover the math. |
| **What** | ✅ Worker + reducer + cohort emission + device classifier (UA regex) + cron prune. |
| **Acceptance** | ✅ Met. Snippet → ingest → audit cycle → behavioral findings + 7 workspaces light up. See [DEV_PROGRESS.md § Wave 0.3](../DEV_PROGRESS.md). |

---

### 0.4 Inventory Auto-Build from Parser Output ✅

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P0 |
| **Status** | **Done — Sprint 1 (2026-04-07).** Persistence happens inside `runAuditCycle()` ([apps/audit-runner/run-cycle.ts](../apps/audit-runner/run-cycle.ts)), not inside the pipeline itself — keeps `staged-pipeline.ts` pure. After the pipeline returns, the worker upserts a `Website` row (also previously missing — silent gap), then iterates `coverage_entries` (newly exposed in `StagedPipelineResult`) and upserts one `PageInventoryItem` per discovered URL with `pageType` inferred from URL pattern, `tier`, `criticality`, `title` (from PageContent evidence), `statusCode` (from HttpResponse evidence), and `freshnessState`. Per-row failures are non-fatal. `SurfaceRelation` is left for a follow-up — not needed for the wow effect. |
| **What** | ✅ Worker upserts Website + PageInventoryItem rows from `coverage_entries`. |
| **Acceptance** | ✅ Met. After audit completes, `/app/inventory` lists the real crawled pages. |

---

### 0.5 Inventory: Replace Mock Counts with Real Data ✅

| | |
|---|---|
| **Tag** | `engine` `frontend` |
| **Priority** | P0 |
| **Status** | **Done — Sprint 1 + Wave 0.7 + Wave 0.3 (2026-04-07).** Sprint 1 removed the mock counts and made both columns null-safe in the UI. Wave 0.7 wired `finding_count` from `PrismaFindingStore.countBySurfaceForLatestCycle` (3-tier path matcher: exact path / exact url / substring fallback). Wave 0.3 wired `session_count` from `RawBehavioralEvent` via `COUNT(DISTINCT sessionId)` per surface over the last 30 days, using the same 3-tier matcher. Both columns now show real numbers when data exists, return `0` when audit/snippet are installed but the surface has no findings/sessions, and return `null` only when there's no data at all (frontend hides null-only columns). |
| **What** | ✅ Real `finding_count` + real `session_count` + null-safe UI. |
| **Acceptance** | ✅ Met. After audit + snippet install, `/app/inventory` shows live numbers per surface. |

---

### 0.6 Verification: Frontend → Backend Wiring ✅

| | |
|---|---|
| **Tag** | `frontend` `engine` |
| **Priority** | P0 |
| **Status** | **Done — Wave 0.6 (2026-04-07).** New `POST /api/verification/run` route in [src/app/api/verification/run/route.ts](../src/app/api/verification/run/route.ts). Body: `{ action_id, intent: 're_verify' \| 'confirm_resolution' }`. Resolves user → org → env, calls `ensureContext()`, looks up the action by `action_key`, derives `subject_ref` + `decision_ref`, calls `mcpServer.verify()`. Response includes the **updated action projection** so the client refreshes inline without an extra round-trip. Three response shapes: `ok+verification`, `ok+skipped` (policy denied — UI shows reasoning toast), `ok=false`. Actions page replaced its toast stubs with a real handler + spinner state + `router.refresh()`. Latent bug fix: `McpServer.executeVerification()` was rebuilding the engine context without translations or `previousSnapshot`, silently erasing i18n labels and `change_class` after each verification — fixed by caching both on the instance. |
| **What** | ✅ POST route + actions page handler + latent bug fix. |
| **Acceptance** | ✅ Met. Click "Re-verify" → real verification runs → drawer updates inline. See [DEV_PROGRESS.md § Wave 0.6](../DEV_PROGRESS.md). |

---

### 0.7 Findings Persistence to PostgreSQL ✅

| | |
|---|---|
| **Tag** | `engine` `platform` |
| **Priority** | P0 |
| **Status** | **Done — Wave 0.7 (2026-04-07).** Two new Prisma models pushed to production: `CycleSnapshot` (decisions+signals JSON for change detection input) and `Finding` (denormalized projection rows for fast queries + cold-start rehydration). The audit-runner worker now: (a) loads previous snapshot from `PrismaSnapshotStore.asyncGetLatest`, (b) calls `recomputeAll({previous_snapshot})` so the engine produces a real `change_report`, (c) `projectAll()` turns it into FindingProjections with populated `change_class`, (d) saves both the new snapshot and the findings via `PrismaSnapshotStore.asyncSave` + `PrismaFindingStore.saveForCycle`, (e) prunes snapshots beyond the 10-cycle retention cap. The legacy `/api/analysis/stream` route also looks up + saves snapshots (skips findings persistence since it has no real cycleId). `assembleContext` + `bootstrapMcpContextSync` + `loadContext` all gained an optional `previousSnapshot` parameter so cold-start MCP rehydration via `ensureContext()` also produces change_class. `/api/inventory` reads real per-surface finding counts via `PrismaFindingStore.countBySurfaceForLatestCycle` (matches by exact path, exact url, or substring fallback so a finding declared at surface "/checkout" still matches an inventory row at "/en/checkout/step-2"). |
| **What** | ✅ CycleSnapshot + Finding Prisma models. PrismaSnapshotStore (implements SnapshotStore interface from packages/change-detection). PrismaFindingStore (saveForCycle, loadLatestForEnvironment, countBySurfaceForLatestCycle, pruneOlderThan). Wired into audit-runner, stream route, MCP context assembly, ensureContext, and /api/inventory. Lead promotion auto-inherits via `runAuditCycle()`. Admin prospect scans use static heuristics so they correctly skip engine persistence. |
| **Acceptance** | ✅ Met. Run audit twice → second run shows real `change_class`. Server restart rehydrates findings from DB without recomputing the engine. `/api/inventory` returns real `finding_count` per surface (or `0` if surface had no findings, or `null` only when no audit has ever completed for the env). The frontend `/app/(console)/analysis/page.tsx` already had filters + badges for `change_class` wired up — they now light up automatically with real data. |

---

## Wave 1 — Core Experience Polish

**Goal:** Make what exists feel complete, trustworthy, and self-explanatory. Fix broken flows, close UX gaps that create confusion, and wire the final missing connection (onboarding → ingestion).

> **Audit note (2026-04-06):** Items 1.2 through 1.8 in this Wave were verified as actually shipped in code. Item 1.1 (Onboarding → Ingestion) was promoted to **Wave 0.1** because it's the load-bearing P0 break. Item 1.6 (Billing — Manage Subscription) was already shipped via the Paddle integration in commit `4aa7ce7` but the roadmap entry was never updated.

Everything in Wave 1 either fixes a P0 (broken) or makes the value delivery loop more obvious.

---

### 1.1 Onboarding → Ingestion Wiring **→ promoted to [Wave 0.1](#01-onboarding--ingestion-auto-trigger)**

| | |
|---|---|
| **Tag** | `platform` `engine` |
| **Priority** | P0 |
| **Status** | Moved to Wave 0 after the 2026-04-06 audit confirmed it's a load-bearing break and added more dependent work around it. See Wave 0.1 above for the full spec. |

---

### 1.2 Actions — UX Fixes ✅

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P0/P1 |
| **Status** | **Done** (2026-04-05) |

| # | Issue | Fix | Priority | Status |
|---|-------|-----|----------|--------|
| A | Observation category doesn't appear as a filter tab | Added `observation` tab with count and dot color. | P1 | ✅ |
| B | "Resolve" column is confusing | Renamed to "Next Step". Labels: "Mark Resolved", "Run Verification", "Track Progress", "Dismiss". | P1 | ✅ |
| C | "Verify this verification" circular text | Resolve button now shows only the action label (e.g. "Run Verification"), no category suffix. | P0 | ✅ |
| D | Side drawer: lacks description / context | Added "Description" section header in drawer. Root cause already shown in dedicated section. | P1 | ✅ |
| E | Relationship between Actions and Findings unclear | Added explanatory text above the tab bar. i18n in all 4 languages. | P1 | ✅ |

---

### 1.3 Analysis — UX Fixes (A, B, D ✅ · C deferred)

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P1 |
| **Status** | **Mostly done** (2026-04-05). 1.3C deferred to Wave 3 (needs LLM enrichment). |

| # | Issue | Fix | Priority | Status |
|---|-------|-----|----------|--------|
| A | Verification section unclear | Added `InfoTooltip` (i) button next to "VERIFICATION" header with i18n tooltip text. | P1 | ✅ |
| B | Reasoning layout broken | Reasoning now in its own bordered card, visually separated from badges. | P0 | ✅ |
| C | Reasoning too terse | Deferred — requires LLM enrichment at projection time. | P2 | Deferred → 3.2 |
| D | Pack badge missing | Added `PackBadge` component with distinct pastel colors per pack (blue/amber/rose/violet). | P1 | ✅ |

---

### 1.4 Inventory — Style Fix ✅

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P1 |
| **Status** | **Done** (2026-04-05) |
| **What** | Findings count column showed underlined text. |
| **Fix** | Replaced `underline` with `font-semibold`. Clickable behavior preserved. |

---

### 1.5 Chat — Layout Fix ✅

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P1 |
| **Status** | **Done** (2026-04-05) |
| **What** | Playbook button and content areas had inconsistent padding. |
| **Fix** | Standardized all horizontal padding to `px-4 sm:px-6` across header, messages, setup banner, and context indicator. |

---

### 1.6 Billing — Fix Broken Button ✅

| | |
|---|---|
| **Tag** | `platform` |
| **Priority** | P0 |
| **Status** | **Done** (commit `14b77ee`, "Brevo notifications…" series). Billing page now has real Paddle checkout for new subs, change-plan flow, cancel modal, and uses the live Paddle webhook for state. Verified in [src/app/app/billing/page.tsx](../src/app/app/billing/page.tsx). |

---

### 1.7 Page Title Tooltips ✅

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P1 |
| **Status** | **Done** (2026-04-05) |
| **What** | Page titles had no contextual help. |
| **Fix** | Created shared `PageHeader` component (`src/components/console/PageHeader.tsx`) with hover tooltip. Wired into Actions, Workspaces, Analysis, Inventory, and Maps pages. Tooltip text i18n'd in `console.common.page_tooltips` (en, pt-BR, es, de). |

---

### 1.8 Billing — Compare Plans Animation ✅

| | |
|---|---|
| **Tag** | `frontend` |
| **Priority** | P2 |
| **Status** | **Done** (2026-04-05) |
| **What** | Monthly ↔ Annual toggle had no transition. |
| **Fix** | Added `AnimatedPrice` component (ease-out cubic count animation), sliding highlight on toggle, and "Save X%" badge that fades in on annual selection. Strikethrough price animates height/opacity. |

---

### 1.9 Stage D — Selective Headless ✅

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P1 |
| **Status** | **Done — Wave 1 (2026-04-07).** Built as the first implementation of a generalizable **enrichment pass framework** ([workers/ingestion/enrichment/](../workers/ingestion/enrichment/)) so Wave 3 LLM Semantic Enrichment can plug in as another pass without refactoring the staged pipeline. New `EnrichmentPass` interface, `runEnrichmentPasses()` orchestrator, business-aware scenario builders (ecommerce / lead_gen / saas / hybrid + shared support reach probe), retry logic with exponential backoff for transient errors (turnstile, captcha, browser launch, network, navigation timeout), and 1 successful execution per cycle cap. Reuses the existing BrowserWorker (added new `executeRequest()` method that bypasses the hardcoded default scenario). Wires into the staged pipeline at the previously placeholder slot (lines 420-424). The audit-runner now passes `mode: 'full'` and `onboarding_business_model` so Stage D's gates and scenario picker have real input. 24 new reducer/framework tests, full project test suite still passes. See [DEV_PROGRESS.md § Stage D](../DEV_PROGRESS.md) for the full diff. |
| **What** | ✅ Enrichment pass framework + Stage D selective-headless implementation + business-aware scenarios + retry + wire. |
| **Acceptance** | ✅ Met. SPA-detected full-mode audits now fire Stage D, run business-aware scenarios via real Playwright, and append browser-rendered evidence (BrowserNavigationTrace, BrowserCheckoutConfirmation, BrowserFailureEvent, classified network analysis) to the cycle. Non-SPA sites and shallow/shallow_plus modes skip Stage D cleanly with logged reasons. |
| **Foundation for LLM Wave 3** | The enrichment framework was deliberately designed so Wave 3 LLM Semantic Enrichment is a **drop-in addition**: implement `semanticEnrichmentPass` in `enrichment/`, register it in the runner, done. The `EnrichmentResult.cost_units` field already exists for Wave 3's Haiku-cost tracking. The contract guarantees later passes see earlier passes' evidence in their context — so the LLM pass can read Stage D's browser-rendered DOM as input. See [README.md](../workers/ingestion/enrichment/README.md) for the architecture rationale. |

---

## Wave 2 — Knowledge, Members & Confidence

**Goal:** Make the product self-documenting, enable team collaboration, and strengthen the confidence/verification discipline.

---

### 2.1 Knowledge Base ✅

| | |
|---|---|
| **Tag** | `docs` `frontend` `platform` |
| **Priority** | P1 |
| **Status** | **Done — Wave 2.1 (2026-04-07).** All five parts shipped. Sanity CMS won the approach decision (already in project, supports non-developer editing) — but the breakthrough is that Sanity is now a **pure override layer** on top of a programmatic foundation: 160 foundation articles are derived at build/runtime from existing engine metadata (INFERENCE_TITLES, ROOT_CAUSE_TITLES, ROOT_CAUSE_DESCRIPTIONS, INFERENCE_TO_PACK, INFERENCE_TO_ROOT_CAUSE, POSITIVE_CHECKS), so every finding and every root cause is **guaranteed** to have a useful article — no manual content authoring required, no dead "docs coming soon" state, ever. |

| # | Part | Status |
|---|------|--------|
| A | **Sidenav entry** | ✅ Already shipped (via Customer Center group above Data Sources in [src/components/console/sidebar-nav-data.ts](../src/components/console/sidebar-nav-data.ts)). |
| B | **Knowledge base page** | ✅ Shipped at [src/app/(console)/knowledge-base/page.tsx](../src/app/(console)/knowledge-base/page.tsx) and [\[slug\]/page.tsx](../src/app/(console)/knowledge-base/[slug]/page.tsx). The catalog now merges Sanity articles with foundation articles (Sanity wins on slug conflict). |
| C | **Sanity schema** | ✅ Shipped at [src/sanity/schemas/knowledge-article.ts](../src/sanity/schemas/knowledge-article.ts) — fields include `title`, `slug`, `category` (`get_started`/`concept`/`pack`/`finding`/`api`/`guide`), `finding_key`, `root_cause_key`, `excerpt`, `body` (blockContent), `locale`, `publishedAt`. |
| D | **Finding drawer Learn more** | ✅ **Done — Wave 2.1 (2026-04-07).** Always renders a styled card (no more "docs coming soon" placeholder). Fetches via [/api/knowledge-base/by-finding-key](../src/app/api/knowledge-base/by-finding-key/route.ts) which falls back to the foundation article if Sanity has no match. |
| E | **Action drawer Learn more** | ✅ **Done — Wave 2.1 (2026-04-07).** New `root_cause_key` field on `ActionProjection` powers a styled card via the new [/api/knowledge-base/by-root-cause-key](../src/app/api/knowledge-base/by-root-cause-key/route.ts) endpoint, also with foundation fallback. |
| F | **Chat KB cards (bonus)** | ✅ **Done — Wave 2.1 (2026-04-07).** New `kb_article_card` block type. The LLM emits `$$KB{finding:KEY}$$` or `$$KB{root_cause:KEY}$$` markers; the chat API resolves them server-side via Sanity (with locale awareness) and ships a `kb_articles_data` map in the SSE `done` event so the client renders styled cards inline — never bare URL strings. System prompt instruction added at [apps/mcp/llm/system-prompt.ts:41](../apps/mcp/llm/system-prompt.ts). |
| G | **Foundation article generator (architectural)** | ✅ **Done — Wave 2.1 (2026-04-07).** [packages/knowledge/foundation-articles.ts](../packages/knowledge/foundation-articles.ts) — derives 127 finding articles + 33 root cause articles = **160 total** from engine metadata. Each article is rendered as Sanity Portable Text (16 blocks: title → "What this means" → "Why it matters" → "How we detect it" → "Underlying root cause" → "What to do about it" → "Discuss this finding"). The 4 sanity-utils lookups (`getKnowledgeArticles`, `getKnowledgeArticleBySlug`, `getKnowledgeArticleByFindingKey`, `getKnowledgeArticleByRootCauseKey`) all check Sanity first then fall back to foundation. New test [tests/foundation-articles.test.ts](../tests/foundation-articles.test.ts) asserts every inference_key has an article so the build fails on drift. |

**Files touched:** [packages/knowledge/foundation-articles.ts](../packages/knowledge/foundation-articles.ts) (new), [src/sanity/sanity-utils.ts](../src/sanity/sanity-utils.ts) (4 lookups + foundation adapter), [src/app/api/knowledge-base/by-root-cause-key/route.ts](../src/app/api/knowledge-base/by-root-cause-key/route.ts) (new), [src/components/console/chat/KbArticleCard.tsx](../src/components/console/chat/KbArticleCard.tsx) (new), [src/lib/chat-types.ts](../src/lib/chat-types.ts) (`KbArticleCardBlock`), [src/lib/use-chat-stream.ts](../src/lib/use-chat-stream.ts) (`$$KB{...}$$` parser + resolver), [src/app/api/chat/route.ts](../src/app/api/chat/route.ts) (server-side marker resolution + locale-aware fetch), [apps/mcp/llm/system-prompt.ts](../apps/mcp/llm/system-prompt.ts) (LLM instruction), [src/components/console/chat/ChatMessageRenderer.tsx](../src/components/console/chat/ChatMessageRenderer.tsx) (new render branch), [src/app/(console)/analysis/page.tsx](../src/app/(console)/analysis/page.tsx) (always-render styled card), [src/app/(console)/actions/page.tsx](../src/app/(console)/actions/page.tsx) (new card section), [packages/projections/types.ts](../packages/projections/types.ts) (`ActionProjection.root_cause_key`), [packages/projections/engine.ts](../packages/projections/engine.ts) (export `INFERENCE_TITLES` / `INFERENCE_TO_PACK` / `POSITIVE_CHECKS` + populate `root_cause_key`), [packages/intelligence/root-causes.ts](../packages/intelligence/root-causes.ts) (export `INFERENCE_TO_ROOT_CAUSE` / `ROOT_CAUSE_TITLES` / `ROOT_CAUSE_DESCRIPTIONS`), i18n keys for en/pt-BR/es/de.

---

### 2.2 Members & Invite Flow ✅

| | |
|---|---|
| **Tag** | `platform` |
| **Priority** | P1 |
| **Status** | **Done — 2026-04-11/12.** Full invite lifecycle: Prisma `OrgInvite` model with unique constraint on `(organizationId, email)`, secure 32-byte token, 7-day expiry. API routes: `POST /api/organization/invites` (create + Brevo email), `GET` (list), `DELETE` (revoke), `GET/POST /api/organization/invites/accept` (validate + accept). Seat limit enforcement checks `memberCount + pendingInviteCount >= plan.maxMembers` with upgrade prompt on `SEAT_LIMIT` code. `InviteMemberModal` with email/role form, error states, seat limit handling. Accept-invite page at `/accept-invite?token=xxx` with 4 states (loading/valid/error/accepted) + auto-redirect. Members page at `/app/members` with full table (avatar, name, email, role badge, joined date), role change dropdown (owner→admin promotion, admin→member/viewer), remove button with confirmation, pending invites section with revoke. Permission model: owner can do everything, admin can manage members/viewers, self-modification blocked. |

| # | Part | Description | Status |
|---|------|-------------|--------|
| A | **Invite button handler** | Wire the "Invite Members" button to open a modal: email input, role selector (admin/member/viewer), send invite. | ✅ InviteMemberModal + wired in members page |
| B | **Invite model** | New Prisma model: `OrgInvite { id, org_id, email, role, status (pending/accepted/expired), token, expires_at, invited_by }`. | ✅ Prisma model with unique constraint + token index |
| C | **Magic link email** | On invite creation, send email with magic link: `/accept-invite?token=xxx`. Uses Brevo SMTP. Link creates user + membership + redirects to console. | ✅ Brevo email + accept page + accept API with transaction |
| D | **Seat limits** | Enforce plan-based seat limits. Before sending invite, check `membership count + pending invites < plan.max_members`. Show upgrade prompt if at limit. | ✅ Enforced in POST handler with SEAT_LIMIT code + upgrade link in modal |
| E | **Members table** | Render existing members with name, email, role, joined date. Add role change dropdown and remove button for admins. | ✅ Full table + role change (PATCH) + remove (DELETE) + pending invites section |

---

### 2.3 Root Cause Vocabulary Refinement ✅

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P1 |
| **Status** | **Done — Wave 2.3 (2026-04-07).** Vocabulary-only refactor at the projection seam — engine inference keys did not change; only `INFERENCE_TO_ROOT_CAUSE` mapping + `ROOT_CAUSE_TITLES` + `ROOT_CAUSE_DESCRIPTIONS` were rewritten. Final: **33 → 27 root causes** (8 consolidated, 6 renamed in place, 27 descriptions rewritten end-to-end). Foundation articles auto-regenerated from 160 → 154. No DB migration needed — Prisma's `Finding.rootCause` stores the title string, not the key. |

| # | Change | Result |
|---|--------|--------|
| A | Consolidate abuse root causes (3 keys) | ✅ Merged into `commerce_abuse_exposure` (1 key) |
| B | Consolidate discoverability (4 keys) | ✅ Split into `commerce_pages_invisible_to_search` + `brand_inconsistent_in_previews` (2 keys, along the actual operational distinction: structural crawlability vs. content/preview quality) |
| C | Consolidate brand (3 keys) | ✅ Merged into `brand_impersonation_active` (1 key) — severity belongs on the finding, not on the root cause |
| D | Rename `elevated_dispute_risk` | ✅ Renamed to `dispute_defenses_absent` — describes the *cause*, not the *symptom* |
| E | Rename jargon titles | ✅ `commerce_continuity_exposure` → `commerce_operations_exposed`; `uncontrolled_commerce_variant` → `untracked_purchase_paths` |
| F | Merge or remove `weak_conversion_signal` | ❌ **Rejected** after explicit user direction (*"nao faça merge se nao fizer sentido fazer"*). Stays distinct from `friction_barrier_on_path`: the first is about the conversion signal itself being absent or unreliable (instrumentation problem), the second is about active friction in the funnel (UX problem). Different remediation paths. |
| G | Separate `runtime_commerce_fragility` category | ✅ Got its own new `runtime_fragility` `RootCauseCategory` (added to the union in [packages/intelligence/types.ts](../packages/intelligence/types.ts)) instead of being merged into `friction_barrier` |

**Files touched:** [packages/intelligence/root-causes.ts](../packages/intelligence/root-causes.ts) (rewrote 3 maps end-to-end), [packages/intelligence/types.ts](../packages/intelligence/types.ts) (`runtime_fragility` category), [packages/maps/engine.ts](../packages/maps/engine.ts) (single `rcToCategory` lookup updated: `elevated_dispute_risk` → `dispute_defenses_absent`), [packages/knowledge/foundation-articles.ts](../packages/knowledge/foundation-articles.ts) (auto-regenerated, no manual edit), [dictionary/en.json](../dictionary/en.json), [dictionary/pt-BR.json](../dictionary/pt-BR.json), [dictionary/es.json](../dictionary/es.json) (translations rewritten for renamed root causes; pruned removed keys).

**Verified:** 65/65 tests pass, 0 TS errors. See [DEV_PROGRESS.md § Wave 2.3](../DEV_PROGRESS.md) for the full diff.

---

### 2.4 Confidence Gap Surfacing ✅ — reframed as "remove confidence from UI"

| | |
|---|---|
| **Tag** | `engine` `frontend` `mcp` |
| **Priority** | P1 (escalated from P2 — operator confusion was significant) |
| **Status** | **Done — Wave 2.4 (2026-04-07).** The original 2.4 spec was about flagging the *gap* between confidence and evidence quality. The user reframed it: **"o nível de confiança nao deveria ficar exposto pro cliente, isso é backend. O certo dividir em low, medium e high. low nao mostra pro cliente e continuar monitorando, medium e high mostram. Nada de confidence na UI, não ajuda, só atrapalha."** Confidence as a number was hostile — operators couldn't tell whether 67% was good or bad. The fix removes confidence from every UI surface and gates findings on a tier instead. |

| # | Part | Status |
|---|------|--------|
| A | **`confidence_tier` bucketing at projection layer** | ✅ New `confidence_tier: 'low' \| 'medium' \| 'high'` field on `FindingProjection` + `ActionProjection`. Single derivation function `deriveConfidenceTier()` in [packages/projections/types.ts](../packages/projections/types.ts) (thresholds: ≥70 high, ≥40 medium, <40 low). 40 is aligned with the engine's existing internal floor at [packages/intelligence/root-causes.ts:284](../packages/intelligence/root-causes.ts) and [packages/impact/engine.ts:115](../packages/impact/engine.ts) — same threshold the engine already uses to skip low-quality inferences in root-cause grouping. |
| B | **Filter `low` findings out of projection** | ✅ Single `findings.filter((f) => f.confidence_tier !== 'low')` line at the bottom of `projectFindings()` in [packages/projections/engine.ts](../packages/projections/engine.ts). The engine still processes those findings (they participate in maps, change detection, calibration, MCP internal context); they just never reach the UI. Any `FindingProjection` that reaches the UI is `medium` or `high`. |
| C | **Confidence removed from every UI surface** | ✅ Finding drawer "Confidence X%" badge, action drawer Confidence row, analysis "Conf" column + filter dropdown, workspace summary card percentage, workspace list card percentage, workspace detail "Trust Strength" / `confidence_narrative` section + `ConfidenceBar` helper, maps drawer Confidence label, map node tooltip percentage, chat `ConfidenceBlock` (removed entirely from union/parser/renderer), chat `FindingCard` "% conf" label, suppression callout "Confidence reduced" line, truth context "Confidence adjusted by {delta}%" suffix, VerificationPanel "Confidence dropped X points" message. |
| D | **Confidence removed from MCP narration** | ✅ System prompt "Cite confidence percentages" rule replaced with **"NEVER cite numeric confidence percentages in your output"**. Tool-adapter `Confidence: X%` lines stripped from `summarizeAnswer` / `summarizeFindings` / `summarizeWorkspaces` / `summarizeWorkspaceSummary` / `summarizeDecisionExplainability`. `composeWhy()` in [apps/mcp/answers.ts](../apps/mcp/answers.ts) drops the confidence segment from root cause lines. [apps/mcp/suggestions.ts](../apps/mcp/suggestions.ts) drops confidence from finding rationale. **The LLM still has internal access** to numeric confidence via raw projections it consumes for ranking; it just doesn't narrate it back to the user. |
| E | **Verification lifecycle vocabulary rename** | ✅ Old internal enum (`unverified / pending / partially / verified / degraded / stale`) → projection-layer string union (`static_evidence / confirming / partial_confirmation / confirmed / evidence_weakened / confirmation_expired`). The new vocabulary frames every state as **additive corroboration on top of real static evidence** — `static_evidence` is not a downgrade, it's the floor. The engine's internal `VerificationMaturity` enum stays unchanged; only the projection-layer string was renamed. Backwards-compat via `migrateLegacyVerificationMaturity()` at the persistence boundary in [packages/projections/prisma-finding-store.ts](../packages/projections/prisma-finding-store.ts). |
| F | **Foundation articles "How we detect it" rewrite** | ✅ The 154 foundation articles' "How we detect it" section was rewritten to talk about **severity + verification stage** (the two qualitative signals the user actually sees) instead of confidence. Generated programmatically by [packages/knowledge/foundation-articles.ts](../packages/knowledge/foundation-articles.ts) so the rewrite propagates to every article automatically. |
| G | **i18n + dictionary cleanup** | ✅ Three new namespaces (`verification_badge`, `verification_panel`, `verification_sufficiency`) carry operator-facing labels for the new verification states in en/pt-BR/es. Pruned: `confidence_label`, `columns.confidence`, `cards.avg_confidence`, the entire `filters.confidence` block, `confidence_reduced`, `workspaces.confidence/structural/economic`. Dropped `{delta}%` placeholder from `contradictions_detected`. |

**Files touched:** [packages/projections/types.ts](../packages/projections/types.ts) (new types + helpers + migration function), [packages/projections/engine.ts](../packages/projections/engine.ts) (`confidence_tier` populated, low filtered, `buildActionVerificationMaturity()` rewritten), [packages/projections/prisma-finding-store.ts](../packages/projections/prisma-finding-store.ts) (legacy migration at parse time), [apps/mcp/llm/system-prompt.ts](../apps/mcp/llm/system-prompt.ts), [apps/mcp/llm/tool-adapter.ts](../apps/mcp/llm/tool-adapter.ts), [apps/mcp/answers.ts](../apps/mcp/answers.ts), [apps/mcp/suggestions.ts](../apps/mcp/suggestions.ts), [packages/knowledge/foundation-articles.ts](../packages/knowledge/foundation-articles.ts), [src/components/console/VerificationBadge.tsx](../src/components/console/VerificationBadge.tsx) (rewritten), [src/components/console/VerificationPanel.tsx](../src/components/console/VerificationPanel.tsx) (rewritten, props removed), [src/components/console/VerificationSufficiencyWarning.tsx](../src/components/console/VerificationSufficiencyWarning.tsx) (rewritten), [src/app/(console)/analysis/page.tsx](../src/app/(console)/analysis/page.tsx), [src/app/(console)/actions/page.tsx](../src/app/(console)/actions/page.tsx), [src/app/(console)/workspaces/page.tsx](../src/app/(console)/workspaces/page.tsx), [src/app/(console)/workspaces/[id]/page.tsx](../src/app/(console)/workspaces/[id]/page.tsx), [src/app/(console)/maps/page.tsx](../src/app/(console)/maps/page.tsx), [src/lib/chat-types.ts](../src/lib/chat-types.ts), [src/lib/use-chat-stream.ts](../src/lib/use-chat-stream.ts), [src/components/console/chat/ChatMessageRenderer.tsx](../src/components/console/chat/ChatMessageRenderer.tsx), [src/components/console/chat/FindingCard.tsx](../src/components/console/chat/FindingCard.tsx), [src/app/api/chat/route.ts](../src/app/api/chat/route.ts), [tests/production-hardening.test.ts](../tests/production-hardening.test.ts) (mockFinding helper updated for new field), [dictionary/en.json](../dictionary/en.json), [dictionary/pt-BR.json](../dictionary/pt-BR.json), [dictionary/es.json](../dictionary/es.json).

**Verified:** 65/65 tests pass, 0 TS errors. Initial threshold attempt was 75/50 — broke 4 tests because fixtures produced findings in the 30-33 range. Lowering to 70/40 (aligned with the engine's existing internal floor) fixed it. See [DEV_PROGRESS.md § Wave 2.4](../DEV_PROGRESS.md) for the full diff.

---

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

---

### 3.1 LLM Enrichment — Policy Pages ✅ (+ Tier 1 & Tier 2 Extensions)

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P1 |
| **Status** | **Done — 2026-04-11.** Core policy enrichment shipped (A-G). Extended well beyond the original scope with two additional tiers. **Tier 1** added 4 new enrichment types: `checkout_trust` (checkout pages), `cta_clarity` (commercial pages), `product_page_quality` (product pages), `pricing_page_framing` (pricing pages) — each with dedicated Haiku prompts, page classification helpers, and type-specific structured output in `semantic-enrichment.ts`. **Tier 2** added 3 more copy analysis signals: `social_proof_quality`, `form_error_quality`, `onboarding_quality` — signals + inferences wired in the engine, but the semantic enrichment pass hasn't been extended yet to produce their evidence types (engine-side ready, collection-side pending). Total: **7 LLM-powered findings** across policy, checkout, CTA, product, pricing, social proof, form errors, and onboarding quality. |

**The highest-ROI semantic enrichment opportunity.** Per [COLLECT_OPPORTUNITIES.md](COLLECT_OPPORTUNITIES.md) and [NORTHSTAR.md](NORTHSTAR.md).

| # | Part | Description | Status |
|---|------|-------------|--------|
| A | **Enrichment step in pipeline** | After Phase 2B content enrichment (post-parser, pre-signals), add a `runSemanticEnrichment()` step. Starts with policy pages only. | ✅ `semanticEnrichmentPass` in enrichment runner |
| B | **Policy quality analysis** | Haiku call per policy page. Input: policy body text. Output: `PolicyQualityAssessment { clarity_score, ambiguity_flags[], missing_sections[], regulatory_gaps[], readability_grade }`. Structured output schema. | ✅ |
| C | **New evidence type** | `ContentEnrichmentPayload` with `enrichment_type`, `scores`, `flags`, `missing_elements`, `confidence`, `model_used`, `cached`. | ✅ Extended with 7 enrichment types |
| D | **Cache layer** | Key: SHA256(evidence_hash + enrichment_type). Store in evidence store. Skip enrichment if cached result exists and source evidence unchanged. | ✅ |
| E | **Degradation** | If Haiku API unavailable or over budget, skip enrichment. Existing rule-based `thin_refund_policy` and `policy_gap` signals continue to work. | ✅ |
| F | **Signal integration** | New signals from enrichment: `policy_quality_score` (numeric), `policy_ambiguity_detected` (boolean), `policy_missing_critical_section` (boolean with section name). Feed into `refund_policy_gap` and `policy_deficiency` root cause. | ✅ + 6 additional enrichment signal extractors |
| G | **Cost** | ~$0.02 per audit (expanded to 3-8 commercial pages × Haiku). Still negligible. | ✅ |

---

### 3.2 LLM Enrichment — CTA Clarity & Trust Language (Partially Subsumed)

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P2 |
| **Status** | **Partially subsumed by Wave 3.1 Tier 1 (2026-04-11).** Items B and C are now covered by the `cta_clarity` and `checkout_trust` enrichment types added in Wave 3.1 Tier 1 extension. Item A (`body_text_snippet` expansion) and deeper signal integration still pending. |

| # | Part | Description | Status |
|---|------|-------------|--------|
| A | **Expand body_text_snippet** | Parser now stores first 2000 chars (was 500). Applies to all pages — classification happens downstream. | ✅ Done — 2026-04-12 |
| B | **CTA clarity analysis** | Haiku call with all CTA link texts from commercial pages. Output: per-CTA `clarity_score`, `is_ambiguous`, `competing_ctas_detected`. | ✅ Covered by `cta_clarity` enrichment type in 3.1 Tier 1 |
| C | **Trust language detection** | Haiku call with checkout page snippet. Output: `has_security_assurance`, `has_guarantee`, `has_urgency_tactics`, `trust_language_score`. | ✅ Covered by `checkout_trust` enrichment type in 3.1 Tier 1 |
| D | **Signal integration** | Enriched signals feed `trust_break_in_checkout`, `unclear_conversion_intent`, `strong_cta_clarity`. | ✅ Signals wired in `extractCopyEnrichmentSignals()` |

---

### 3.3 Cybersecurity Pack — Phase 1 ✅ (12 Findings)

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P1 |
| **Status** | **Done — 2026-04-11.** Grew from 4 original findings to **12 findings** across the full security surface. All findings framed with commercial language per Vestigio's philosophy (e.g., "Browsers signal your site as unsafe to buyers" instead of "Security Headers Weak"). Nuclei scan and Katana discovery passes wired into enrichment pipeline runner. Dedicated `SecurityWorkspace` with `SecurityContext` (risk_level, checkout_risks, infrastructure_risks, trust_signal_gaps) and `SecuritySummary` (what_buyers_see, what_attackers_see, what_breaks_silently). Decision pack `money_moment_exposure` with question key `is_visible_security_posture_creating_financial_risk` (4 tiers). Always-eligible (no prerequisites). Full i18n in en/pt-BR/es/de. |

Per [FINDINGS_OPPORTUNITIES.md § 6](FINDINGS_OPPORTUNITIES.md) and [NORTHSTAR.md](NORTHSTAR.md) (Money-Moment Exposure).

| # | Finding | Status |
|---|---------|--------|
| A | Security headers (HSTS, CSP) — `security_header_weakness` | ✅ |
| B | Clickjack protection — `clickjack_protection_missing` | ✅ |
| C | Mixed content on commercial pages — `mixed_content_exposure` | ✅ |
| D | Redirect chain trust erosion — `redirect_chain_erodes_checkout_trust` (merged open redirect) | ✅ |
| E | Exposed sensitive endpoints — `sensitive_endpoint_exposed` | ✅ |
| F | CORS misconfiguration — `cors_misconfiguration` | ✅ |
| G | Rate limiting absent — `rate_limiting_absent` | ✅ |
| H | Cookie security — `cookie_security_lax` | ✅ |
| I | Error page information leak — `error_page_information_leak` | ✅ |
| J | Predictable resource URLs — `predictable_resource_urls` | ✅ |
| K | Nuclei scan pass — `nuclei-scan.ts` enrichment pass | ✅ Wired in pipeline runner |
| L | Katana discovery pass — `katana-discovery.ts` enrichment pass | ✅ Wired in pipeline runner |

**Decision pack:** `money_moment_exposure`. Pack question: "Is the visible security posture creating financial or trust risk?"

**Files:** [packages/signals/engine.ts](../packages/signals/engine.ts) (`extractSecurityPostureSignals`), [packages/inference/engine.ts](../packages/inference/engine.ts) (12 security inferences), [packages/impact/baselines.ts](../packages/impact/baselines.ts) (12 baselines), [packages/workspace/security-workspace.ts](../packages/workspace/security-workspace.ts) (new), [packages/workspace/recompute.ts](../packages/workspace/recompute.ts) (wired), [packages/decision/engine.ts](../packages/decision/engine.ts) (question_key handler), [workers/ingestion/enrichment/nuclei-scan.ts](../workers/ingestion/enrichment/nuclei-scan.ts) (new), [workers/ingestion/enrichment/katana-discovery.ts](../workers/ingestion/enrichment/katana-discovery.ts) (new), [workers/ingestion/enrichment/runner.ts](../workers/ingestion/enrichment/runner.ts) (registry).

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

**Current state:** Phase 4A shipped a read-only Shopify Admin API client (`packages/shopify-adapter/`), a production poller with adaptive backoff, and a mapper that translates Shopify metrics → `BusinessInputs`. **What's missing:** user-facing connection flow, pipeline integration, expanded data (customers/products/checkouts/inventory), and — critically — an **Integration Data Layer** that reconciles data from multiple sources (Shopify, Stripe, Meta, Google) without breaking when any source is absent.

#### 3.7.0 Integration Data Layer (Architectural Foundation)

Not all users are Shopify users. Some use Stripe. Some will connect both. Future ad platforms bring ad spend data. The engine must handle any combination without breaking.

**The `IntegrationSnapshot` pattern:** Each integration produces a typed snapshot. A reconciliation layer merges them into the existing `BusinessInputs` (unchanged — no downstream consumers break) plus a new `CommerceContext` (extended data that `BusinessInputs` can't hold) and future `AdSpendInputs`.

```
Shopify ─┐                                    ┌→ BusinessInputs (unchanged, reconciled)
Stripe  ─┤→ IntegrationSnapshot<source> ──→ reconcile() ─┤→ CommerceContext (new, extended)
Meta    ─┤                                    ├→ AdSpendInputs (new, future)
Google  ─┘                                    └→ OperationalAmplifiers (existing, merged)
```

**Reconciliation rules for overlapping fields:**

| Field | Shopify | Stripe | Priority rule |
|---|---|---|---|
| `monthly_revenue` | ✅ extrapolated from orders | ✅ from charges/invoices | Stripe wins (payment source of truth for SaaS); Shopify wins for pure ecommerce. Determined by `onboarding_business_model`. |
| `monthly_transactions` | ✅ order count | ✅ charge count | Same priority rule as revenue |
| `chargeback_rate` | Proxy (refund rate, capped 10%) | ✅ Real dispute rate | Stripe always wins (real disputes > proxy) |
| `churn_rate` | null | ✅ from subscriptions | Stripe only |
| `refund_rate` | ✅ from orders | ✅ from refunds | Average of both when available |

**Provenance tracking:** Every field in the reconciled `BusinessInputs` carries a `source` tag so the UI can show "Based on Shopify data" or "Based on Shopify + Stripe data". Stored in a parallel `DataProvenance` object, not on `BusinessInputs` itself (keeps the interface clean).

**`CommerceContext` (new type):** Extended commerce data that doesn't fit in `BusinessInputs` but is consumed by signals, inferences, and workspaces:

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

**Revenue Recovery Tracker:** Correlates resolved findings with revenue changes across cycles.

```typescript
interface RevenueRecoveryEstimate {
  finding_key: string;
  resolved_at_cycle: string;
  estimated_impact_at_resolution: { min: number; max: number };
  revenue_delta_next_cycle: number | null;
  confidence: 'correlation' | 'strong_correlation' | 'inconclusive';
}
```

Logic: compare `BusinessInputs.monthly_revenue` at cycle N (resolution) vs N+1. If revenue increased AND the finding had high estimated impact → `strong_correlation`. Lives in Bragging Rights lens and Panorama dashboard as "Estimated recovery: $X/mo from resolved findings".

| # | Part | Description | Effort |
|---|------|-------------|--------|
| 0a | **IntegrationSnapshot type** | Generic typed snapshot per source. Each integration mapper produces one. Stored as Evidence. | Low |
| 0b | **reconcileIntegrations()** | Merges N snapshots into `BusinessInputs` + `CommerceContext` + `OperationalAmplifiers`. Priority rules by field + business model. Provenance tracking. | Medium |
| 0c | **CommerceContext type + wiring** | New type consumed by signals/inferences. Passed through `MultiPackInput` alongside `BusinessInputs`. | Low |
| 0d | **Revenue Recovery Tracker** | Cross-cycle correlation of resolved findings + revenue delta. Surfaces in Bragging Rights + Panorama. | Medium |

#### 3.7.1 Shopify Connection Flow

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Custom App flow (not OAuth)** | User creates a Custom App in Shopify admin, grants scopes, copies Admin API access token. Vestigio stores it. No OAuth needed — simpler, no app store listing required. Scopes: `read_orders`, `read_customers`, `read_products`, `read_inventory`. | Low |
| B | **Credentials storage** | New Prisma model `IntegrationConnection { id, env_id, provider ('shopify'\|'stripe'\|'meta_ads'\|'google_ads'), config (encrypted JSON), status, installed_at, last_synced_at, sync_error }`. Generic model for all integrations — avoids N models. Encrypt config at rest via `VESTIGIO_SECRET_KEY`. | Low |
| C | **API routes** | `POST /api/integrations/connect` (store credentials + verify connection), `GET /api/integrations/status` (sync state per provider), `DELETE /api/integrations/disconnect` (revoke), `POST /api/integrations/sync` (manual trigger). All generic — `provider` field routes to the right adapter. | Medium |
| D | **Data Sources UI — Shopify card** | Card in `/app/settings/data-sources` with: (1) Store URL field (`mystore.myshopify.com`), (2) Admin API Access Token field (password-masked), (3) Inline step-by-step: "In Shopify admin → Settings → Apps → Develop apps → Create app → Configure Admin API scopes (read_orders, read_customers, read_products, read_inventory) → Install → Copy token", (4) Link to KB article: "Need help? [Step-by-step guide with screenshots](/app/knowledge-base/shopify-integration-setup)", (5) Connection status indicator (connected/syncing/error), (6) Last sync time + "Sync now" button, (7) Value feedback: "Analyzing $124k across 1,284 orders (last 30d)". | Medium |
| E | **Knowledge Base article** | Sanity article at slug `shopify-integration-setup`. Full tutorial: why connect, what data we read (reassure: read-only, no write access), step-by-step with `[SCREENSHOT: description]` placeholders for user-provided screenshots. Category: `guide`. | Low |

#### 3.7.2 Expanded Shopify Data

| # | Part | Description | Effort |
|---|------|-------------|--------|
| F | **Abandoned checkouts** | Fetch `/checkouts.json` (created_at filter, 90d window). Aggregate: abandonment_count, abandonment_rate, abandonment_value, avg_steps_before_abandon. Map to `CommerceContext.abandonment_rate` + `abandonment_value_monthly`. | Medium |
| G | **Customers** | Fetch `/customers.json` (orders_count, total_spent). Aggregate: repeat_purchase_rate, new_vs_returning_ratio, avg_customer_lifetime_value. Map to `CommerceContext`. | Medium |
| H | **Products** | Fetch `/products.json` (id, title, status, variants). Cross-reference with order line items. Identify: total_products, products_never_sold_30d (listed but 0 orders), top_products_by_revenue. Map to `CommerceContext`. | Medium |
| I | **Inventory levels** | Fetch `/inventory_levels.json` for products found on crawled pages. Identify: out_of_stock_promoted_count (product page exists in crawl inventory but stock = 0). Map to `CommerceContext`. | Low |

#### 3.7.3 Pipeline Hookup

| # | Part | Description | Effort |
|---|------|-------------|--------|
| J | **Pipeline auto-trigger** | In `runAuditCycle()`, after behavioral processing and before `recomputeAll()`: load `IntegrationConnection` for the env, if Shopify connected → run poller → produce `IntegrationSnapshot<'shopify'>` → store as Evidence. | Low |
| K | **Reconciliation in recompute** | In `recomputeAll()`, before impact estimation: collect all `IntegrationSnapshot` evidence → call `reconcileIntegrations()` → pass reconciled `BusinessInputs` + `CommerceContext` to impact engine. | Low |

#### 3.7.4 New Findings & Signals

| # | Finding | Data source | Pack | Effort |
|---|---------|-------------|------|--------|
| L | `checkout_abandonment_revenue_leak` — "Your checkout loses $X/mo in abandoned carts" | abandoned_checkouts | revenue_integrity | Low |
| M | `promoted_product_out_of_stock` — "Products on your site are out of stock, frustrating buyers" | inventory_levels + crawled pages | money_moment_exposure | Low |
| N | `high_refund_rate_eroding_revenue` — "Refund rate is X%, eroding $Y/mo in revenue" | refund data (real, not proxy) | chargeback_resilience | Low |
| O | `single_payment_gateway_risk` — "95%+ of payments go through one gateway — one outage stops all revenue" | payment_methods | money_moment_exposure | Low |
| P | `discount_abuse_pattern` — "X% of orders use discounts, leaking $Y/mo in margin" | discount data | channel_integrity | Low |
| Q | `low_repeat_purchase_rate` — "Only X% of buyers return — acquisition cost isn't being recovered" | customers | revenue_integrity | Low |
| R | `dead_weight_products` — "X products are listed but haven't sold in 30 days" | products + orders | revenue_integrity (action_value_map behavioral) | Low |

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

### 3.7B Nuvemshop Integration

| | |
|---|---|
| **Tag** | `platform` `collection` `engine` `frontend` |
| **Priority** | P1 |
| **Status** | ✅ **Done — 2026-04-12** |

**Context:** Nuvemshop holds 30-40% of the Brazilian SMB e-commerce market (vs Shopify's ~20%). Co-launching Nuvemshop alongside Shopify is critical for go-to-market in Brazil.

**Architecture:** Mirrors the Shopify adapter exactly. `NuvemshopSnapshotData` has the identical shape as `ShopifySnapshotData`, so the engine's reconciliation layer treats them interchangeably. One Nuvemshop OR one Shopify per environment; if both exist, Shopify wins (unlikely scenario). Uses the same `IntegrationConnection` Prisma model.

**Key difference from Shopify:** Nuvemshop uses full OAuth (authorization_code flow) instead of custom app tokens. Tokens don't expire. Rate limit: 2 req/s with 40-burst bucket (leaky bucket algorithm).

| # | Part | Description | Status |
|---|------|-------------|--------|
| A | **OAuth callback route** | `POST /api/integrations/nuvemshop/callback` — exchanges code for `access_token` + `user_id` (store_id), persists encrypted credentials, verifies connection, redirects to Data Sources. | ✅ Done |
| B | **LGPD webhooks** | 3 mandatory LGPD compliance endpoints for Nuvemshop app homologation: store-redact, customers-redact, customers-data-request. | ✅ Done |
| C | **Adapter package** | `packages/nuvemshop-adapter/` — types, client, aggregator, mapper, snapshot-mapper. Mirrors Shopify adapter structure. | ✅ Done |
| D | **Poller worker** | `workers/nuvemshop/poller.ts` — fetch orders/customers/products, aggregate into time-windowed metrics, produce BusinessInputs + OperationalContext. | ✅ Done |
| E | **Integration types** | Added `'nuvemshop'` to `IntegrationProvider`, `NuvemshopSnapshotData` to `IntegrationDataMap`. | ✅ Done |
| F | **Reconciliation** | Updated `reconcileIntegrations()` to treat Shopify and Nuvemshop as interchangeable ecommerce sources. | ✅ Done |
| G | **API routes** | Added Nuvemshop to connect/verify/disconnect + sync routes. | ✅ Done |
| H | **Audit runner** | Wired Nuvemshop poller into `runAuditCycle()` alongside Shopify. | ✅ Done |
| I | **Data Sources UI** | Nuvemshop card with OAuth instructions, store ID + token fields, connect/disconnect/sync. PT-BR copy. | ✅ Done |
| J | **KB guide** | `nuvemshop-integration-setup` guide with setup instructions. | ✅ Done |

**Nuvemshop API limitations vs Shopify:**
- No abandoned checkout API → `abandoned_checkouts` always null
- No separate inventory levels endpoint → stock comes from product variants
- Customer list doesn't include `orders_count` → repeat rate inferred from `total_spent` + `last_order_id`
- Pagination via `page` + `per_page` (max 200) instead of cursor-based

**Demo store:** `vestigiodemostore.lojavirtualnuvem.com.br` (Store ID: 7556429)
**Partner dashboard:** partners.nuvemshop.com.br (App ID: 29656)

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

**Context:** Pulling actual ad creative text from ad platforms enables precise message-match analysis (does the landing page deliver what the ad promised?), ad spend waste quantification, and conversion attribution. This data also enriches the Copy Analysis Pack (3.10) with real ad creatives instead of UTM heuristics.

**Architecture:** Uses the same `IntegrationConnection` model. Ad data flows into `CommerceContext.total_ad_spend_monthly` and `ad_spend_by_platform` via `IntegrationSnapshot<'meta_ads'>` / `IntegrationSnapshot<'google_ads'>`.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Meta Ads API integration** | OAuth flow for Facebook/Instagram Ads. Read-only access to active ad creatives (`ads.read` scope). Pull: ad headline, primary text, description, CTA type, destination URL, ad status, ad spend. New `IntegrationSnapshot<'meta_ads'>`. Poller syncs active creatives every 24h. | Medium |
| B | **Google Ads API integration** | OAuth flow for Google Ads. Read-only access to ad creatives. Pull: responsive search ad headlines/descriptions, destination URLs, campaign/ad group structure, ad spend. New `IntegrationSnapshot<'google_ads'>`. Same sync pattern as Meta. | Medium |
| C | **Creative → LP matcher** | Match ad creatives to landing pages via: (1) destination URL exact match, (2) UTM campaign/content → creative ID mapping, (3) final URL domain + path pattern. Each matched pair becomes a `AdLpPair { creative_text, creative_cta, lp_url, lp_copy_elements }` fed to the Haiku analysis. | Low |
| D | **Precise message-match analysis** | Haiku call per `AdLpPair`: does the LP headline echo the ad promise? Does the LP CTA match the ad CTA type? Is the value prop consistent? Structured output with specific mismatch points and fix suggestions. New signal `ad_message_mismatch_detected`, new inference `landing_page_breaks_ad_promise`. | Low |
| E | **Ad spend waste signal** | Quantify message-mismatch findings in dollars: "This LP receives ~$X/day in ad spend but breaks the ad promise — estimated waste: $Y/mo." Uses `CommerceContext.ad_spend_by_platform` for real $ amounts. | Low |
| F | **Settings UI** | "Connect Meta Ads" and "Connect Google Ads" cards in the Data Sources page alongside Shopify/Stripe. | Low |

---

### 3.10 Copy Analysis Pack — AI-Powered Copy & Funnel Alignment (Foundation Shipped)

| | |
|---|---|
| **Tag** | `engine` `collection` `docs` |
| **Priority** | P1 |
| **Status** | **Foundation shipped — 2026-04-11.** The engine foundation for copy analysis is live via Wave 3.1 Tier 1+2 extensions. 4 enrichment types (`checkout_trust`, `cta_clarity`, `product_page_quality`, `pricing_page_framing`) produce `ContentEnrichmentPayload` evidence via Haiku. Signal extraction (`extractCopyEnrichmentSignals`) and inference functions wired. Tier 2 added 3 more signals (`social_proof_quality`, `form_error_quality`, `onboarding_quality`) at the engine level. Root cause `copy_strategy_gap` defined. The full 16-item A-P spec below represents the complete vision — items E-F are partially covered by existing signals, A-D and G-P are the remaining work to make this a standalone pack with its own decision, workspace, guidelines KB, ICP input, and advanced analyses (cross-page narrative, pricing psychology, localization quality, micro-copy, SEO tension, staleness). |
| **Why after integrations?** | With Shopify/Stripe connected (3.7/3.8), copy analysis can measure impact against **real revenue data** instead of heuristics. With ad platform data (3.9), message-match (item J) can compare **actual ad creative text** against landing page copy word-for-word, not just UTM keyword guesses. The pack is 10x more valuable with integration data feeding it. |

**The thesis:** Most SaaS/ecommerce sites have copy that was written once and never audited against the actual ICP, funnel stage, or commercial intent of each page. The result is generic copy that doesn't convert — not because the product is bad, but because the words on the page don't match the buyer's mental state at that point in the journey. This pack turns Vestigio into a **copy strategist** that evaluates alignment between what the page says and what the page should say.

**Requires:** Haiku LLM calls per commercial page (~$0.003/page). A reference knowledge base of copy best practices, marketing angles, and funnel-stage expectations that the LLM evaluates against.

| # | Part | Description | Effort |
|---|------|-------------|--------|
| A | **Copy Best Practices Knowledge Base** | Build a structured reference at `packages/copy-analysis/guidelines.ts` containing: (1) **Funnel-stage expectations** — what copy should accomplish at each stage (awareness → consideration → decision → post-purchase), what tone/length/CTA style is appropriate, what objections to address; (2) **ICP alignment criteria** — how copy should reflect the target persona's language, pain points, sophistication level, and buying triggers; (3) **Marketing angle taxonomy** — common angles (social proof, urgency, authority, transformation, risk reversal, exclusivity) and where each is appropriate vs manipulative; (4) **Page-type copy rules** — homepage hero (clarity > cleverness, 5-second test), pricing page (value framing, objection handling, comparison anchoring), checkout (trust, friction reduction, commitment reinforcement), landing page (single CTA, message match with ad source), product page (benefit > feature, sensory language, social proof proximity). Each guideline is a structured object with `id`, `category`, `rule`, `good_example`, `bad_example`, `funnel_stages[]`, `page_types[]` so the LLM can cite specific guidelines in its analysis. | Medium |
| B | **Copy extraction enrichment** | ✅ Done — `body_text_snippet` expanded to 2000 chars (2026-04-12). Remaining: extract page headline (h1), subheadline, CTA text(s), social proof elements, trust signals, urgency indicators into `CopyElementsPayload`. | Low |
| C | **ICP profile input** | During onboarding (or in settings), capture ICP basics: target persona description, industry, average deal size, buying sophistication (technical/non-technical/mixed), primary pain point. Stored on the Environment model. Falls back to heuristic ICP detection from the site content if not provided. | Low |
| D | **Haiku copy analysis per page** | For each commercial page, call Haiku with: the extracted copy elements, the page's funnel classification (from URL/content classifier), the ICP profile, and the relevant subset of guidelines. Structured output: `CopyAnalysis { funnel_alignment_score (0-100), icp_match_score (0-100), issues[] { guideline_id, severity, description, suggestion }, strengths[], overall_grade ('A'-'F') }`. Cache by SHA256(copy_elements + icp_profile + guidelines_version). | Medium |
| E | **New signals** | `copy_funnel_misalignment` (copy tone/intent doesn't match funnel stage), `copy_icp_disconnect` (language doesn't match target persona), `missing_trust_at_decision_point` (checkout/pricing lacks trust copy), `cta_clarity_weak` (ambiguous or competing CTAs), `value_proposition_absent` (no clear "why buy" above fold), `objection_unaddressed` (common objections for the ICP not handled), `social_proof_misplaced` (testimonials on wrong pages or absent from decision pages). | Medium |
| F | **New inference keys** | `copy_misaligned_with_funnel_stage`, `copy_disconnected_from_icp`, `trust_copy_absent_at_decision`, `cta_unclear_or_competing`, `value_proposition_missing_above_fold`, `key_objection_unaddressed`, `social_proof_ineffective_placement`. Each maps to root cause `copy_strategy_gap` (new). | Medium |
| G | **Decision pack** | New `copy_alignment_pack`. Pack question: `is_copy_aligned_with_commercial_intent`. Four tiers: Incident (grade F, critical funnel pages have anti-patterns), FixBeforeScale (grade C-D, significant misalignments), Optimize (grade B, room for improvement), Observe (grade A, copy is well-aligned). | Low |
| H | **Workspace** | `copy_alignment` workspace. Shows per-page copy grades, overall funnel alignment score, top issues by impact, before/after suggestion previews. | Medium |
| I | **MCP integration** | New tool `analyze_copy` that lets the operator ask "Why isn't my checkout page converting?" and get copy-specific analysis citing guidelines. New playbook `copy_audit` for comprehensive copy review. | Low |
| J | **Message-match** | With ad platform data (3.9), compare actual ad creative text against LP copy. Without it, falls back to UTM keyword heuristic (compare `utm_term` keywords against h1/subheadline/CTAs on the LP). New signal `ad_message_mismatch_detected`, new inference `landing_page_breaks_ad_promise`. **Significantly stronger with 3.9 data.** | Low |
| K | **Cross-page narrative consistency** | Haiku call with copy elements from all commercial pages in sequence (by funnel stage). Detect: contradictory promises ("enterprise-grade" on hero, "perfect for startups" on pricing), abandoned commitments (trial mentioned once then never again), tone shifts (formal hero → casual checkout), inconsistent naming (product called different things on different pages). New signal `narrative_contradiction_detected`, `promise_abandoned_cross_page`, `tone_inconsistency`. | Medium |
| L | **Pricing page psychology** | Specialized Haiku analysis for the pricing page: anchoring effectiveness (is the middle plan the obvious choice?), decoy positioning, value framing (features listed vs benefits communicated), plan naming (do names communicate progression?), objection handling on-page, comparison anchoring against alternatives. New signal `pricing_page_psychology_weak`, `value_framing_features_over_benefits`. | Low |
| M | **Localization quality** | For multi-locale sites, compare the persuasive structure (not just words) between the primary locale and translations. Detect when translation preserved meaning but lost marketing intent — "Get started free" → "Comece gratuitamente" is technically correct but persuasively dead. New signal `translation_lost_persuasive_intent`. Requires the site to have multiple locale versions of the same page (detected by hreflang or URL pattern). | Medium |
| N | **Micro-copy audit** | Extract and analyze form labels, error messages, button text, tooltips, empty states, confirmation messages. These are small copy moments with outsized conversion impact. "Enviar" vs "Garantir minha vaga" on a checkout button. New signal `microcopy_generic_at_conversion_point`, `error_message_unhelpful`. | Low |
| O | **SEO vs conversion tension** | Cross-reference SEO audit data (already collected) with copy analysis. Detect when keyword-optimized copy is hurting readability/conversion (keyword stuffing in headlines), or when conversion-optimized creative copy is invisible to Google (no target keyword in h1/title). New signal `seo_copy_tension_detected`. | Low |
| P | **Copy staleness** | Detect outdated references: social proof numbers that contradict footer/about ("500+ companies" but footer says "10,000+"), expired promotions still live, date references in the past, screenshots of old product versions, testimonials from companies that no longer exist or rebranded. Rule-based + light Haiku verification. New signal `copy_stale_reference_detected`. | Low |

**Cost estimate:** ~$0.02-0.05 per audit (3-8 commercial pages x Haiku, cross-page analysis, pricing page specialist call). Still negligible.

**Dependency:** 3.2A (expand body_text_snippet) ✅ done. Items K-P can be implemented incrementally after the core A-I are live. Item J is stronger with 3.9 (ad platform data) but can ship with UTM heuristic first.

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

Maturity stage influences: which findings appear first, how Pulse Summary frames the situation, which actions are suggested.

#### Implementation parts

| # | Part | Tag | Effort | Status |
|---|---|---|---|---|
| A | **Maturity stage detection** — `detectMaturityStage()` in `packages/classification/maturity.ts`. Returns launch/growth/scale based on sessions, integrations, cycles, resolved findings. | `engine` | Low | ✅ Done — 2026-04-12 |
| B | **Pulse Summary API** — new endpoint that calls Haiku with workspace findings and returns a 3-4 sentence briefing. Cached per cycle. | `mcp` `engine` | Medium | ✅ `/api/workspace/pulse-summary` with 1h cache |
| C | **Perspective grouping in projections** — `groupByPerspective()` in `packages/projections/engine.ts`. Groups workspaces into 5 perspectives with aggregate stats. | `engine` | Medium | ✅ Done — 2026-04-12 |
| D | **Revenue Map aggregation** — `buildRevenueMap()` aggregates impact value_cases by perspective. | `engine` | Low | ✅ Done — 2026-04-12 |
| E | **Cycle Delta lens** — `buildCycleDelta()` groups change_report data by perspective. | `engine` | Low | ✅ Done — 2026-04-12 |
| F | **Bragging Rights lens** — `buildBraggingRights()` aggregates POSITIVE_CHECKS + resolved findings. | `engine` | Low | ✅ Done — 2026-04-12 |
| G | **Frontend: Workspace page redesign** — replace flat workspace grid with perspective-based navigation. Each perspective is a page with Pulse Summary, findings table, and filtered transversal lenses. Panorama is the home with all 4 lenses showing global data. | `frontend` | High | ✅ Built, needs browser verification |
| H | **Frontend: Pulse Summary component** — renders the LLM briefing in each workspace with a subtle loading state. | `frontend` | Low | ✅ `PulseSummary.tsx` |
| I | **Frontend: Revenue Map visualization** — treemap or horizontal bar chart showing $ impact by perspective. | `frontend` | Medium | ✅ `RevenueMap.tsx` (needs real data from 3.11D) |
| J | **Frontend: Cycle Delta component** — shows improved/worsened/new findings with change badges. | `frontend` | Low | ✅ `CycleDelta.tsx` (needs real data from 3.11E) |
| K | **Frontend: Bragging Rights component** — shows positive checks with green checkmarks and resolved count. | `frontend` | Low | ✅ `BraggingRights.tsx` (needs real data from 3.11F) |

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

## Summary View

| Wave | Theme | Key Outcomes | Status |
|------|-------|-------------|--------|
| **0** | Critical Pipeline Gaps | Onboarding auto-trigger, pixel ingest + worker, inventory auto-build, real inventory counts, verification UI wiring, finding persistence | **7 of 7 shipped** ✅ |
| **1** | Core Experience Polish | Actions/Analysis/Inventory UX, billing, page tooltips, Stage D enrichment framework | **9 of 9 done** ✅ |
| **2** | Knowledge, Members & Confidence | Knowledge base, invite flow, root cause refinement (33→27), confidence reframed, prisma migrate | 2.1 ✅, 2.3 ✅, 2.4 ✅ — **2.2 (Members) + 2.5 (Prisma Migrate) open** |
| **—** | Marketing Surface Polish | Homepage UX (Phases 11-14), mobile redesigns, section reordering, ProductTour Maps rewrite, ShinyButton redesign | **Done — 2026-04-10/11** ✅ |
| **—** | SEO Overhaul | JSON-LD, OG image, metadataBase, canonical, hreflang, sitemap expansion, metadata on all pages, ISR | **Done — 2026-04-11** ✅ |
| **3** | Semantic Enrichment & New Lenses | LLM on policy pages, CTA/trust language, cybersecurity Phase 1, composite findings, journey narrative, **copy analysis pack**, **Shopify completion**, **Stripe revenue intelligence**, **workspace redesign (perspectives + lenses)** | All open |
| **4** | Expansion & Depth | Cybersecurity Phase 2+3, pricing/structured data enrichment, Trust & Conversion lens, platform maturity | All open |

---

## Wave 5 — Continuous Incremental Engine

**Goal:** Deliver the "continuous intelligence" pitch for real. Today `continuousAudits` and `cycleType` are cosmetic labels — this wave makes them load-bearing. It's two jobs in one: (A) harden the dispatch/scheduler infra so we can safely run hundreds of cycles/day without process-restart orphaning, multi-replica duplication, or burst OOM; and (B) implement incremental cycle semantics in the engine so hot sweeps can run every 15min on Max without saturating infra or re-doing cold work.

**Guiding decisions made in the 2026-04-14 session:**
- **Hybrid critical-surface model** — heuristic auto-detection (regex on `checkout|cart|pricing|product|home`) as fallback, with user opt-in to mark up to 10 surfaces as critical from a "Mark as critical" CTA in the inventory surface sidedrawer. Hot entry also triggered by a **mixed weight** of recent finding severity + traffic volume (page with `severity >= high` within last 7d enters hot; top-traffic-share pages enter hot via percentile).
- **Cold full weekly minimum for every plan** including Starter — otherwise Starter drifts uncontrollably without a baseline reset.
- **First post-activation cycle is cold full obligatorily** — incremental makes no sense without a baseline.
- **Warm guarantee** — every surface is visited at least once per warm-cycle window (prevents a page silently regressing between colds when it happens to be outside consecutive warm samples).
- **Demo org exception** — `orgType=demo` is never paused by the inactivity cron; demo account must always be alive for sales surfaces.
- **First cycle is fire-and-forget, progress via SSE** — reuse the existing `/api/analysis/stream` endpoint (already has `stage_complete`, `findings`, `score`, `complete` events + Last-Event-ID reconnect + 5min cache + 15s heartbeat — just never consumed by a frontend). Wire `EventSource` in `/app/inventory`, `/app/analysis`, `/app/actions`. Redirect to `/app/inventory` after activation button.
- **No "Resume Audits" button** — just a banner at the top of `/app/*` when `Environment.continuousPaused=true`. Access automatically clears the flag and triggers a catch-up cycle.
- **Max = 1x/hour incremental is the aspirational target** but only with real incremental semantics in place (Fase 3); Fase 1+2 will run on `full` cycles at slower cadence until Fase 3 lands.

**Cadence plan once incremental is live (Fase 3 complete):**

| Plan | Hot sweep | Warm sweep | Cold full |
|---|---|---|---|
| Starter | 1x / 6h | 1x / day (20% rotating) | 1x / week |
| Pro | 1x / hour | 1x / 4h (30% rotating) | 1x / 3 days |
| Max | 1x / 15min | 1x / hour (40% rotating) | 1x / day |

The Max differentiator is not just frequency — it's **scope**: Max cold audits also run regression checks on **all** active findings, not only `severity >= high`.

**Incremental mechanics that need to exist:**
1. `EvidenceSnapshot.contentHash` per page — if HTML SHA matches previous cycle, skip re-parse (saves engine time, not bandwidth).
2. `FindingEvidenceDep` index — maps which finding depends on which evidence row; when evidence changes (hash diff), invalidate and re-run only affected findings.
3. Behavioral session window — parametric per `cycleType` (hot = last 1h, warm = last 24h, cold = last 30d). Keep the `session_count >= 20` gate from [packages/behavioral/](../packages/behavioral/) so hot sweeps with low volume skip behavioral inferences gracefully.
4. `cycle_budget` — per-cycleType wall-clock cap (hot ≤ 30s, warm ≤ 2min, cold ≤ 10min). Pages timed out get queued for the next cycle of the same type.
5. Engine `merge semantics` at write — today `recomputeAll()` overwrites the finding set; incremental needs `new | updated | resolved | regressed` diff at engine write time, not only at aggregator/projection read time (the `ChangeReport` in the dashboard aggregator today does this at read time, needs to move one layer in so incrementals can avoid re-running resolved findings to confirm they stayed resolved).

**Infra rearchitecture that needs to exist:**
1. **Wire `apps/platform/redis-job-queue.ts` into `runAuditCycle`** — the queue already has per-env locks via `SET NX EX`, TTL, FIFO, retry; it just wasn't the path audit-runner used. Change the webhook dispatch from `Promise.then()` to `redisEnqueueJob()`; add a consumer loop in the worker process.
2. **Separate worker service on Railway** — add `"start:worker": "tsx apps/audit-runner/worker-loop.ts"` to `package.json`, deploy a second Railway service pointing at the same image with `CMD` override, share `REDIS_URL` + `DATABASE_URL`. ~$5-10/month extra on Railway, isolates audit compute from web request spikes (Chromium launches don't starve HTTP handlers). See updated § 15 in [DEPLOY.md](DEPLOY.md) for the procedure.
3. **Leader election on the heal / scheduler crons** — `SET NX EX {replica_id} 90` in [src/instrumentation-node.ts](../src/instrumentation-node.ts) before running the 60s interval body; only the holder runs it. Prevents 3-replica Railway deploys from firing 3× heal passes and 3× concurrent orphan re-dispatches.
4. **Chromium browser pool** — replace per-page `chromium.launch()` with a pool-of-3 in [workers/verification/playwright-runtime.ts](../workers/verification/playwright-runtime.ts), context reuse instead of fresh launches. Caps memory at ~1GB even under burst.
5. **Per-environment concurrency lock** — already in the queue abstraction; just enforce it in the new consumer.

**Schema additions (Fase 1 + Fase 2):**
```prisma
model Environment {
  // ... existing fields
  lastAccessedAt    DateTime?
  activated         Boolean   @default(false)   // true after first cold full cycle
  continuousPaused  Boolean   @default(false)   // true if >14d without access; cleared on next access
}

model CriticalSurface {
  id              String      @id @default(cuid())
  environmentId   String
  url             String
  markedBy        String      // userId
  createdAt       DateTime    @default(now())
  environment     Environment @relation(fields: [environmentId], references: [id], onDelete: Cascade)
  @@unique([environmentId, url])
  @@index([environmentId])
}
```

**Schema additions (Fase 3):**
```prisma
model EvidenceSnapshot {
  // existing VersionedSnapshot or a new sibling, depending on final design
  contentHash   String?     // SHA-1 of normalized HTML; null for non-HTML evidence
  @@index([contentHash])
}

model FindingEvidenceDep {
  id            String   @id @default(cuid())
  findingId     String
  evidenceId    String
  @@unique([findingId, evidenceId])
  @@index([evidenceId])  // hot path: "which findings depend on this evidence?"
}
```

### Fase 1 — Foundation infra

| Item | Tag | Output |
|---|---|---|
| Redis queue wire for `runAuditCycle` | `platform` `infra` | Webhook dispatch uses `redisEnqueueJob`; worker consumes |
| Separate worker service on Railway | `infra` | `start:worker` script + second Railway service + docs update |
| Leader election on heal + scheduler crons | `platform` | `SET NX EX` before `setInterval` body |
| Chromium pool + semaphore | `collection` | Pool-of-3 + context reuse; RAM ceiling ~1GB |
| Metrics: Redis backlog, p95 cycle duration, memory, DB pool saturation | `platform` | Admin dashboard tile + PlatformError linkage |

**Zero UX change at the end of Fase 1.** Just makes the current fire-and-forget dispatch safe for higher volume.

### Fase 2 — Activation flow

| Item | Tag | Output |
|---|---|---|
| Admin org-create simplified | `platform` | Form at [/app/admin/organizations/new](../src/app/app/admin/organizations/new/) drops domain/env/profile fields; only creates Org + Owner + Membership + plan |
| Onboarding refactor | `platform` `frontend` | Remove inline `/api/onboard` env+profile creation; last step is "Activate Environment" button |
| `POST /api/environments/activate` | `platform` | Creates Environment + BusinessProfile + first AuditCycle with `cycleType='full'` + sets `activated=true`; returns SSE URL |
| `/app/layout.tsx` gate | `frontend` | Redirect to `/app/onboarding` when membership exists but no env has `activated=true` |
| SSE wiring on inventory/analysis/actions | `frontend` | `EventSource` against `/api/analysis/stream`; progress banner during cycle |
| `lastAccessedAt` tracking | `platform` | Server component in `/app/layout.tsx` with 1h debounce write |
| Inactivity pause cron | `platform` | Daily check for envs >14d without access (excluding `orgType=demo`); set `continuousPaused=true`; log NotificationLog event `inactivity_pause`; send email |
| Paused banner + auto-resume | `frontend` | Banner in `/app/*` when `continuousPaused=true`; access clears flag and triggers catch-up cycle |

**End of Fase 2 deliverable:** admin → create org → impersonate → onboarding → Activate → first audit runs → inventory shows live progress → dashboard populates. Demo-ready for prospects. Cycles still `full` at webhook-triggered cadence (no scheduler yet).

### Fase 3 — Incremental engine

| Item | Tag | Output |
|---|---|---|
| `EvidenceSnapshot.contentHash` | `engine` `collection` | SHA-1 per page in crawler output; stored in evidence row |
| `FindingEvidenceDep` index | `engine` | Write-side index; engine populates during `recomputeAll()` |
| `CriticalSurface` model + marking UI | `frontend` `engine` | Inventory surface sidedrawer gets "Mark as critical" CTA (max 10/env); ranking service reads it + heuristic fallback |
| `cycleType` branching in `staged-pipeline.ts` | `engine` | Hot = critical surfaces only + last-1h events; warm = rotating sample + last-24h events; cold = full |
| Regression detection moved to engine | `engine` | `new/updated/resolved/regressed` emitted at engine write time, not aggregator read time |
| Finding revalidation scope | `engine` | Hot → `severity >= high` only; warm → `severity >= medium`; cold → all |
| Scheduler cron | `platform` | Reads `Environment.activated + continuousPaused + plan`; enqueues hot/warm/cold cycles on cadence; leader-elected |
| Plan gating | `platform` | Pro unlocks warm + daily scheduling; Max unlocks hot + hourly scheduling; Starter stays cold-weekly |
| Cycle budget enforcement | `engine` | Wall-clock caps per cycleType; timed-out pages queued for next same-type cycle |

**End of Fase 3 deliverable:** continuous intelligence for real. `continuousAudits` flag becomes load-bearing. `cycleType` drives actual pipeline branching. Max customers get a new cycle every 15min without saturating infra.

### Fase 4 — Rollout gradual

Feature-flag gated rollout with a kill switch. Order:
1. Internal demo org first (7 days soak)
2. 1-2 real customers opted-in, with a phone-call-able escalation path
3. Metrics gate before broad rollout: Redis backlog p95 < 10s, cycle p95 duration within plan budget, memory per worker < 1.2GB, DB pool saturation < 70%
4. Broad rollout per plan tier; Starter last (highest relative risk if incremental mis-gates something)

**Kill switch:** a `VESTIGIO_CONTINUOUS_SCHEDULER_ENABLED` env flag that short-circuits the scheduler cron if flipped off; cycles still run on webhook trigger.

---

## What is NOT on this roadmap

Per the [North Star anti-drift commitments](NORTHSTAR.md):

- Competitive benchmarks based on ungrounded LLM knowledge
- AI analysis on every crawled page
- Explosion of packs without evidence depth to back them
- Transformation into a vulnerability scanner
- Finding count maximization
- Features that don't strengthen the value delivery loop: `finding → discussion/verification → action → resolved`
