# ROADMAP.md — Vestigio Development Roadmap

> Last updated: 2026-04-07
> Companion to: [NORTHSTAR.md](NORTHSTAR.md), [DEV_PROGRESS.md](../DEV_PROGRESS.md), [FINDINGS_OPPORTUNITIES.md](FINDINGS_OPPORTUNITIES.md), [COLLECT_OPPORTUNITIES.md](COLLECT_OPPORTUNITIES.md)
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
| Inventory mock data removed | ⚠️ **Partial — Sprint 1.** Mocks gone, returns null, UI hides cols. Real numbers blocked on 0.2/0.3/0.7 | Wave 0.5 | api/inventory/route.ts |
| Pixel ingest endpoint `/api/behavioral/ingest` | Open. Snippet POSTs to dead URL | Wave 0.2 | snippet/vestigio.js:20 |
| Pixel event processing worker | Open. session-aggregator never called | Wave 0.3 | depends on 0.2 |
| Verification UI → backend wiring | Open. Drawer button still `toast.success(...)` stub | Wave 0.6 | actions/page.tsx:563 — backend `verify()` works |
| Findings persistence to PostgreSQL | Open. Findings live only in MCP memory | Wave 0.7 | no `Finding` Prisma model exists |
| Behavioral findings dormant | Require ≥20 sessions of pixel data → 0 today | Wave 1 | recompute.ts:343-369, blocked by Wave 0.2/0.3 |
| Stage D selective headless | Declared, skipped to "complete" | Wave 1 | staged-pipeline.ts:346-348 |
| Katana / Nuclei runners | Built, not invoked from main pipeline | Wave 2 | runners ready, no caller in pipeline |
| `integration_pull` executor | Scaffolded only | Wave 3 | executors.ts:197-212 returns "not implemented" |
| Root cause consolidation 32 → 24 | Still 54+ active keys | Wave 2 | root-causes.ts unchanged since claim |
| `body_text_snippet` 500 → 2000 chars | Still 500 | Wave 3 | parser.ts:105 hardcoded |
| Conversation export/branching | Not started | Wave 4 | unchanged |
| `prisma db push` → `prisma migrate` | Pending | Wave 2 | unchanged |

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

### 0.2 Pixel Ingest Endpoint

| | |
|---|---|
| **Tag** | `collection` `platform` |
| **Priority** | P0 |
| **Status** | Open. The behavioral snippet at [public/snippet/vestigio.js:20](../public/snippet/vestigio.js#L20) POSTs batches to `/api/behavioral/ingest`, **which does not exist**. Search confirmed: only `/api/admin/marketing/pixels` (3rd-party pixel admin) is present. |
| **What** | Create `src/app/api/behavioral/ingest/route.ts` that: (a) reads JSON batch of events, (b) validates `data-env` against the org's environment id (resolve via API key or signed env id), (c) writes to a new `RawBehavioralEvent` Prisma table, (d) returns 204. Rate-limited per env id. |
| **Where** | New file. New Prisma model. New env-id signing helper (HMAC of `environmentId + secret` so customers can't fake other people's traffic). |
| **Acceptance** | Install snippet on a test page → events arrive → rows visible in `RawBehavioralEvent` table. |

---

### 0.3 Pixel Event Processing Worker

| | |
|---|---|
| **Tag** | `collection` |
| **Priority** | P0 (depends on 0.2) |
| **Status** | Open. [packages/behavioral/session-aggregator.ts](../packages/behavioral/session-aggregator.ts) `aggregateSession()` exists and works, but **nothing calls it**. Behavioral findings + 7 behavioral workspaces in `recompute.ts:343-369` are gated on `BehavioralSessionPayload` evidence — which never gets created without this worker. |
| **What** | Background job that polls `RawBehavioralEvent` for unaggregated batches, groups by `(envId, sessionId)`, calls `aggregateSession()`, writes the result as `BehavioralSessionPayload` evidence into `PrismaEvidenceStore`. Schedule: every 60s, batch size ~100 sessions. |
| **Where** | New worker file under `workers/behavioral/aggregator.ts`. Triggered from `src/app/app/layout.tsx` boot timer (same pattern as `health-checker.ts`). |
| **Acceptance** | Snippet installed → user browses for 1 minute → within 2 minutes the org's behavioral findings + workspaces start populating. |

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

### 0.5 Inventory: Replace Mock Counts with Real Data ⚠️ Partial

| | |
|---|---|
| **Tag** | `engine` `frontend` |
| **Priority** | P0 |
| **Status** | **Partial — Sprint 1 (2026-04-07).** The mocks (`MOCK_SESSION_COUNTS`, `MOCK_FINDING_COUNTS`) are gone from [src/app/api/inventory/route.ts](../src/app/api/inventory/route.ts). Both fields now return `null` in the API response. The frontend [src/app/(console)/inventory/page.tsx](../src/app/(console)/inventory/page.tsx) detects `null`-only columns and hides them entirely (no fake numbers, no empty columns). Also drops null-safe handling in filters, summary cards, and the side drawer. The "real numbers" half (sessions from behavioral pipeline, findings from a per-surface join) still depends on **0.2 + 0.3 + 0.7** to ship. |
| **What** | ✅ No more fake numbers anywhere. ⏳ Real numbers waiting on Wave 0.2/0.3 (sessions) + Wave 0.7 (findings). |
| **Acceptance** | ✅ No hardcoded values. Once 0.2/0.3/0.7 land, the API just stops returning `null` and the UI columns reappear automatically. |

---

### 0.6 Verification: Frontend → Backend Wiring

| | |
|---|---|
| **Tag** | `frontend` `engine` |
| **Priority** | P0 |
| **Status** | Open. The backend chain works: [apps/mcp/server.ts:217 `verify()`](../apps/mcp/server.ts#L217) → orchestrator → executor → recompute → new evidence. But the frontend handler at [src/app/(console)/actions/page.tsx:563](../src/app/(console)/actions/page.tsx#L563) is `onRequestVerification={() => toast.success(t("drawer.verificationRequested"))}` — a fake toast that never calls anything. |
| **What** | (1) Create `POST /api/verification/run` that takes `{ subject_ref, verification_type, reason }`, looks up the user's org, calls `mcpServer.verify(...)`, returns the new verification status. (2) Replace the toast handler with a real fetch + optimistic UI update + error handling. (3) After verification completes, refresh the action drawer's `verification_maturity` and impact figures from the recomputed projections. |
| **Where** | New API route. Update [src/lib/mcp-client.ts](../src/lib/mcp-client.ts). Update Actions/Analysis drawers. |
| **Acceptance** | Click "Run Verification" → real Playwright run executes → drawer updates to `verified` with new evidence → impact recomputed. |

---

### 0.7 Findings Persistence to PostgreSQL

| | |
|---|---|
| **Tag** | `engine` `platform` |
| **Priority** | P0 |
| **Status** | Open. After `recomputeAll()` produces findings in [packages/projections/engine.ts](../packages/projections/engine.ts), they're held only in the in-memory MCP server singleton. Server restart triggers a recompute from persisted evidence — works, but expensive on every cold start, and **change detection is broken** because there's no persisted "previous cycle" snapshot to compare against. |
| **What** | Add `Finding` Prisma model with `id`, `cycleRef`, `inferenceKey`, `pack`, `severity`, `confidence`, `impactMin`, `impactMax`, `rootCause`, `verificationMaturity`, `evidenceIds[]`, `createdAt`, plus a snapshot of the projection JSON for cheap rehydration. Persist after `recomputeAll()` in `analysis/stream/route.ts`. Change detection then queries the previous cycle for the same `inferenceKey` and computes `regression`/`improvement`/`new_issue`/`stable_risk`/`resolved`. |
| **Where** | Schema. Persist hook. Modify [packages/change-detection/engine.ts](../packages/change-detection/engine.ts) to read from DB instead of in-memory cycle history. |
| **Acceptance** | Run audit twice → second run shows real `change_class` on findings → server restart preserves both cycles. |

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

## Wave 2 — Knowledge, Members & Confidence

**Goal:** Make the product self-documenting, enable team collaboration, and strengthen the confidence/verification discipline.

---

### 2.1 Knowledge Base

| | |
|---|---|
| **Tag** | `docs` `frontend` `platform` |
| **Priority** | P1 |

| # | Part | Description |
|---|------|-------------|
| A | **Sidenav entry** | Add a help/knowledge icon button above Data Sources in the sidebar. Routes to `/knowledge-base` (authenticated). |
| B | **Knowledge base page** | New console page that renders Sanity CMS content. Categories: Concepts (what are decisions, actions, findings, root causes), Packs (what each pack answers), Findings Catalog (one doc per finding explaining logic, evidence, remediation). |
| C | **Sanity schema** | New `knowledgeArticle` schema: `title`, `slug`, `category` (concept/pack/finding/guide), `finding_key` (optional, for finding-specific docs), `body` (blockContent), `publishedAt`. |
| D | **Finding drawer link** | In every finding side drawer (Analysis page), add a "Learn more" link that opens the corresponding knowledge base article (matched by `finding_key`). Show placeholder text if no article exists yet: "Documentation for this finding is being written." |
| E | **Action drawer link** | Same pattern for action drawers — link to the root cause knowledge base article. |

**Approach decision needed:** Sanity CMS (already in project, good for authored content) vs. static MDX files (simpler, version-controlled). Sanity is better if you want non-developers to edit articles. MDX is better if you want articles close to the code. Both can work — the schema and routing are the same.

---

### 2.2 Members & Invite Flow

| | |
|---|---|
| **Tag** | `platform` |
| **Priority** | P1 |

| # | Part | Description |
|---|------|-------------|
| A | **Invite button handler** | Wire the "Invite Members" button to open a modal: email input, role selector (admin/member/viewer), send invite. |
| B | **Invite model** | New Prisma model: `Invite { id, org_id, email, role, status (pending/accepted/expired), token, expires_at, invited_by }`. |
| C | **Magic link email** | On invite creation, send email with magic link: `/accept-invite?token=xxx`. Uses existing SMTP configuration. Link creates user + membership + redirects to console. |
| D | **Seat limits** | Enforce plan-based seat limits. Before sending invite, check `membership count < plan.max_members`. Show upgrade prompt if at limit. |
| E | **Members table** | Render existing members with name, email, role, joined date. Add role change dropdown and remove button for admins. |

---

### 2.3 Root Cause Vocabulary Refinement

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P1 |

Per the root cause inventory in [FINDINGS.md § E](FINDINGS.md), the vocabulary needs:

| # | Change | From | To | Rationale |
|---|--------|------|----|-----------|
| A | Consolidate abuse root causes | 3 keys (`abuse_friendly_channel`, `deep_commerce_abuse_surface`, `weak_commerce_governance`) | 1-2 keys | Users can't distinguish them. Often fire together. Remediation is similar. |
| B | Consolidate discoverability | 4 keys (all `discoverability_gap`) | 2 keys: structural (pages not crawlable) + content (brand signal inconsistent) | 4 indistinguishable map nodes → 2 meaningful ones. |
| C | Consolidate brand | 3 keys (all `brand_impersonation`) | 1 key with evidence-driven severity | 3 severity levels of one problem don't need 3 root causes. |
| D | Rename `elevated_dispute_risk` | "Elevated dispute and chargeback risk" | "Multiple defenses absent at dispute-prone moments" (or similar) | Current title is circular — restates inference. |
| E | Rename jargon titles | `uncontrolled_commerce_variant`, `commerce_continuity_exposure` | Business language: "Unmonitored purchase paths outside your main flow", "Commerce operations exposed to interruption" | Operator-facing, not engine-facing. |
| F | Merge or remove `weak_conversion_signal` | Standalone root cause | Merge into `friction_barrier_on_path` | Adds nothing the friction barrier doesn't cover. |
| G | Separate `runtime_commerce_fragility` category | Shares `friction_barrier` category with `friction_barrier_on_path` | Own category (`runtime_fragility`) or merge | Same category = indistinguishable in maps. |

**Net effect:** 32 → ~24 root causes. Fewer map nodes, clearer MCP narratives, better action collapse.

**Files:** [packages/intelligence/root-causes.ts](../packages/intelligence/root-causes.ts), [packages/intelligence/types.ts](../packages/intelligence/types.ts)

---

### 2.4 Confidence Gap Surfacing

| | |
|---|---|
| **Tag** | `engine` `frontend` |
| **Priority** | P2 |
| **What** | Per North Star Principle 11: important decisions should not appear confident when evidence is thin. Currently, confidence score and evidence quality are projected but the GAP between them isn't flagged. |
| **Fix** | In preflight and workspace summaries, when `decision.confidence_score > evidence_quality.composite × 1.3`, show a visual indicator: "Confidence based on limited evidence. Browser verification recommended." In MCP `answer_can_i_scale`, add caveat when gap exists. |

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

### 3.1 LLM Enrichment — Policy Pages

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P1 |

**The highest-ROI semantic enrichment opportunity.** Per [COLLECT_OPPORTUNITIES.md](COLLECT_OPPORTUNITIES.md) and [NORTHSTAR.md](NORTHSTAR.md).

| # | Part | Description |
|---|------|-------------|
| A | **Enrichment step in pipeline** | After Phase 2B content enrichment (post-parser, pre-signals), add a `runSemanticEnrichment()` step. Starts with policy pages only. |
| B | **Policy quality analysis** | Haiku call per policy page. Input: policy body text. Output: `PolicyQualityAssessment { clarity_score, ambiguity_flags[], missing_sections[], regulatory_gaps[], readability_grade }`. Structured output schema. |
| C | **New evidence type** | `ContentEnrichmentPayload` with `enrichment_type`, `scores`, `flags`, `missing_elements`, `confidence`, `model_used`, `cached`. |
| D | **Cache layer** | Key: SHA256(evidence_hash + enrichment_type). Store in evidence store. Skip enrichment if cached result exists and source evidence unchanged. |
| E | **Degradation** | If Haiku API unavailable or over budget, skip enrichment. Existing rule-based `thin_refund_policy` and `policy_gap` signals continue to work. |
| F | **Signal integration** | New signals from enrichment: `policy_quality_score` (numeric), `policy_ambiguity_detected` (boolean), `policy_missing_critical_section` (boolean with section name). Feed into `refund_policy_gap` and `policy_deficiency` root cause. |
| G | **Cost** | ~$0.002 per audit (1-3 policy pages × Haiku). Negligible. |

---

### 3.2 LLM Enrichment — CTA Clarity & Trust Language

| | |
|---|---|
| **Tag** | `engine` `collection` |
| **Priority** | P2 |

| # | Part | Description |
|---|------|-------------|
| A | **Expand body_text_snippet** | Parser currently stores first 500 chars. Expand to 2000 chars on commercial-classified pages (checkout, pricing, cart). ~5 lines of code in parser.ts. |
| B | **CTA clarity analysis** | Haiku call with all CTA link texts from commercial pages. Output: per-CTA `clarity_score`, `is_ambiguous`, `competing_ctas_detected`. |
| C | **Trust language detection** | Haiku call with checkout page snippet. Output: `has_security_assurance`, `has_guarantee`, `has_urgency_tactics`, `trust_language_score`. |
| D | **Signal integration** | Enriched signals feed `trust_break_in_checkout`, `unclear_conversion_intent`, `strong_cta_clarity`. |

---

### 3.3 Cybersecurity Pack — Phase 1 (Zero Collection Dependency)

| | |
|---|---|
| **Tag** | `engine` |
| **Priority** | P1 |

Per [FINDINGS_OPPORTUNITIES.md § 6](FINDINGS_OPPORTUNITIES.md) and [NORTHSTAR.md](NORTHSTAR.md) (Money-Moment Exposure).

| # | Finding | Evidence | Signals | Effort |
|---|---------|----------|---------|--------|
| A | Security header posture | `HttpResponsePayload.headers` (already collected) | `hsts_missing`, `csp_missing_or_weak`, `clickjack_protection_missing`, `security_headers_score` | Low |
| B | Mixed content on commercial pages | `ScriptPayload.src`, `FormPayload.action`, `IframePayload.src` (already collected) | `mixed_content_script`, `mixed_content_form_action`, `mixed_content_on_checkout` | Low |
| C | Open redirect indicators | `RedirectPayload` (already collected) | `redirect_with_url_parameter`, `redirect_chain_to_unknown_domain` | Low |
| D | Exposed sensitive endpoints | Add 10-15 sensitive paths to crawl discovery probe list | `admin_panel_exposed`, `sensitive_file_accessible`, `api_docs_public` | Low |

**Decision pack:** New `money_moment_exposure_pack`. Pack question: "Is the visible security posture creating financial or trust risk?"

**Finding families:** Checkout Security Weakness, Trust-Surface Security Gap, Exposed Sensitive Surface, Transport Integrity Failure.

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
| **0** | Critical Pipeline Gaps | Onboarding auto-trigger, pixel ingest + worker, inventory auto-build, real inventory counts, verification UI wiring, finding persistence | **0 of 7 shipped** — added 2026-04-06 |
| **1** | Core Experience Polish | Actions/Analysis/Inventory UX, billing, page tooltips, mobile polish, Brevo notifications | **8 of 8 done** (1.1 promoted to 0.1, 1.6 done in `14b77ee`) |
| **2** | Knowledge, Members & Confidence | Knowledge base, invite flow, root cause refinement (32→24), confidence gap surfacing, prisma migrate | KB done (commit `8eb3278`), members + root cause + prisma still open |
| **3** | Semantic Enrichment & New Lenses | LLM on policy pages, CTA/trust language, cybersecurity Phase 1, composite findings, journey narrative | All open |
| **4** | Expansion & Depth | Cybersecurity Phase 2+3, pricing/structured data enrichment, Trust & Conversion lens, platform maturity | All open |

---

## What is NOT on this roadmap

Per the [North Star anti-drift commitments](NORTHSTAR.md):

- Competitive benchmarks based on ungrounded LLM knowledge
- AI analysis on every crawled page
- Explosion of packs without evidence depth to back them
- Transformation into a vulnerability scanner
- Finding count maximization
- Features that don't strengthen the value delivery loop: `finding → discussion/verification → action → resolved`
