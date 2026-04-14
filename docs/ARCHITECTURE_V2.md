# Architecture V2

## Goal

Transformar o sistema atual em:

**um decision-first intelligence engine para digital business assurance**

com:

- dataset-first execution
- phased enrichment
- MCP como interface cognitiva
- control plane separado do engine

## Architectural principles

### 1. Single collection owner

Preservar a diretiva:

- coleta ativa pertence ao audit pipeline
- radars e modules de intelligence nao fazem rede, shell ou probe ad hoc

Isso segue `AUDIT_INTELLIGENCE_DIRECTIVES.md`.

### 2. Evidence first

Toda logica downstream consome evidence normalizado, nunca blobs heterogeneos como truth principal.

### 3. Decisions are first-class

`decision` e a unidade principal de produto.

### 4. Reuse before execution

O sistema tenta responder com evidence existente antes de:

- probe leve
- browser verification
- integracao externa

### 5. Environment-aware intelligence

Nenhuma decisao material deve misturar:

- production com staging
- checkout de uma business unit com landing de outra
- root domain institucional com superficie comercial sem scoping explicito

### 6. Control plane separate from product brain

SaaS boilerplate pode operar:

- auth
- tenants/workspaces
- billing
- jobs registry
- notifications

Mas nao deve conter:

- rules de discovery
- decision logic
- graph semantics
- risk ontology

## High-level architecture

```text
Control Plane
  -> Engine Orchestration
    -> Ingestion Layer
      -> Evidence Layer
        -> Intelligence Layer
          -> Decision Layer
            -> Output Layer
              -> MCP / Chat / UI Surfaces
```

## Control Plane

### Responsibilities (implemented in `apps/platform/` and `src/app/`)

- workspace and user management (Organization, Membership with full CRUD)
- plan entitlements (`packages/plans/`, `PlatformConfig` model)
- environment registry (Environment model with domain, landing URL, production flag)
- onboarding and business profile capture (BusinessProfile + BusinessProfileVersion)
- SaaS access configuration (SaasAccessConfig created during onboarding, per-environment)
- scheduling policy (`apps/platform/audit-scheduler.ts`)
- billing integration (Paddle primary, Stripe fallback)
- Redis-backed job queue with in-memory fallback
- rate limiting (Redis-backed with in-memory fallback)
- notifications and workflow states
- platform error tracking and observability (`PlatformError` model)
- auth event logging (`AuthEvent` model)
- token cost ledger and usage tracking

### Must not own

- evidence semantics
- inference logic
- decision synthesis
- heuristic policies

## Engine Orchestration

### Responsibilities

- create `audit_cycle`
- route collection jobs
- enforce plan gates such as `continuous_audits_is_enabled`
- drain outbox and projection jobs
- orchestrate verification requests

### Current grounding to preserve

- `cron/audits` remains the primary operational worker
- event-driven incremental refresh preferred over radar polling

## 1. Ingestion Layer

### Responsibilities

- core audit collection
- domain discovery and crawl
- heartbeat ingestion
- pixel ingestion
- external adapter pulls
- browser verification execution when explicitly requested

### Preserve conceptually

- `AuditHttpClient`
- `AuditPipelineProbe`
- `DomainInventoryCrawler`
- `DomainCrawlPlanner`
- `PixelTrack`
- heartbeat ingestion

### Replace

- direct writes of heterogeneous payload into `audits.data`

## 2. Evidence Layer

### Responsibilities

- typed storage of evidence per cycle/environment
- evidence graph persistence
- freshness and provenance tracking
- structural and behavioral overlays
- integration snapshot storage

### Canonical stores (implemented)

- cycle store (`packages/evidence/cycle-store.ts`)
- evidence store — in-memory (`packages/evidence/store.ts`) + PostgreSQL (`packages/evidence/prisma-store.ts`)
- graph store (`packages/graph/`)
- quality scoring (`packages/evidence/quality.ts`)
- confidence adjuster (`packages/evidence/confidence-adjuster.ts`)

### Implemented in Prisma

- `Evidence` model with full scoping, freshness, quality metadata
- `Website` model with pages and surface relations
- `PageInventoryItem` model with type, tier, criticality, freshness
- `SurfaceRelation` model with relation types and cross-domain tracking
- `AuditCycle` model with status, type, timestamps
- `VersionedSnapshot` for change detection baselines

### Preserve

- `website_page_inventory` (now `PageInventoryItem` in Prisma)
- `website_surface_relations` (now `SurfaceRelation` in Prisma)
- behavioral session intelligence (`packages/behavioral/`)
- cycle model

## 3. Intelligence Layer

### Responsibilities

- compute signals
- compute local inferences
- expose shared domain services
- apply suppression and allowlist context

### Shared domain services

- route classification service
- checkout/provider inference service
- policy coverage service
- trust boundary service
- platform classification service
- journey analysis service
- operational confidence service
- value-estimation helper service

### Modules

- revenue intelligence
- chargeback intelligence
- readiness intelligence
- brand/fraud intelligence
- measurement intelligence

Modules consume shared services; they do not reconstruct topology independently.

## 4. Decision Layer

### Responsibilities

- answer business questions
- normalize risk and upside
- apply confidence, freshness and gates
- create `decision`
- promote to `incident` or `opportunity`
- prioritize actions

### Central contracts

- `decision`
- `risk_evaluation`
- `value_case`
- `verification_request`
- `suppression_rule`

## 5. Output Layer

### Responsibilities

- findings table projection
- preflight projection
- incident board
- opportunity board
- workspace summary
- use-case maps
- explainability payloads for chat/MCP

Rule:

Outputs are projections from canonical decisions and evidence, never parallel truth sources.

## 6. MCP / Chat Surface

### Responsibilities

- consume read models and evidence refs
- answer business questions conversationally
- request verification when needed
- keep token/cost discipline
- surface explainability and confidence clearly

### Must not do

- invent business logic outside decision contracts
- bypass freshness and suppression policy
- run unrestricted probing without engine approval

## Core cross-cutting contracts

### Freshness

Every layer must carry:

- `observed_at`
- `fresh_until`
- `freshness_state`
- `staleness_reason`

### Environment scoping

Every material object must carry:

- `workspace_ref`
- `environment_ref`
- `subject_ref`
- `path_scope`

### False-positive governance

Centralize:

- suppressions
- allowlists
- evidence dispute
- override audit trail

### Value estimation

Centralize:

- range-based estimation
- confidence bands
- business profile calibration
- guardrails against overpromising

## What stays

- cycle model
- evidence graph concept
- hybrid discovery
- confidence and gating
- operational enrichment mindset
- composite risk logic
- preflight profiles
- phased enrichment

## What is replaced

- `audits.data` as main intelligence container
- duplicate risk ontologies
- per-radar bespoke topology reconstruction
- UI fallback semantics
- fragmented freshness handling

## Current repo/modules shape

```text
apps/
  platform/          — control plane services (job queue, billing safety, auth logging,
                       Redis job queue, SaaS access store, token ledger, env validation)
  mcp/               — cognitive layer (LLM pipeline, tools, resources, playbooks,
                       context chaining, suggestion engine, session management)

packages/
  domain/            — canonical contracts (evidence, signal, inference, decision, action,
                       incident, opportunity, value-case, suppression, verification,
                       saas-access, business-profile-lifecycle, workspace, website)
  evidence/          — typed evidence persistence (in-memory store + PrismaEvidenceStore
                       backed by PostgreSQL), cycle store, quality scoring, confidence adjuster
  graph/             — evidence graph model and query layer
  signals/           — signal extraction
  inference/         — inference synthesis
  decision/          — decision engine, conflict resolver
  risk/              — risk evaluation
  intelligence/      — shared domain services, root cause analysis, global actions
  classification/    — pack eligibility, route classification
  projections/       — projection engine: findings, actions, workspaces, change reports,
                       verification maturity, change class, evidence quality
  workspace/         — workspace orchestration (preflight, revenue, chargeback packs),
                       recompute engine, confidence audit, behavioral validation
  impact/            — quantified value cases, impact summaries
  plans/             — plan entitlements and limits
  maps/              — use-case maps
  suppression/       — suppression governance
  truth/             — truth resolution, contradiction detection
  change-detection/  — cycle-to-cycle change detection, versioned snapshots
  verification-lifecycle/ — verification request lifecycle
  verification-economics/ — cost/benefit analysis for verification
  behavioral/        — behavioral intelligence aggregates
  technology-registry/ — technology/provider fingerprinting
  brand-adapter/     — brand impersonation detection
  nuclei-adapter/    — nuclei scan integration
  katana-adapter/    — katana deep discovery
  shopify-adapter/   — Shopify integration
  actions/           — action derivation from decisions

workers/
  ingestion/         — HTTP client, parser, crawl pipeline, staged pipeline
  verification/      — browser verification (Playwright runtime), authenticated runtime
  brand-intel/       — brand intelligence worker
  nuclei/            — nuclei scan worker
  katana/            — katana discovery worker
  shopify/           — Shopify data sync worker

src/app/             — Next.js application
  (site)/            — marketing site (vestigio.io): homepage, pricing, auth, blog
  (console)/         — legacy console routes (onboard)
  app/               — authenticated app (app.vestigio.io): actions, workspaces, chat,
                       analysis, inventory, maps, billing, settings, admin, onboarding,
                       members, organization
  api/               — API routes: analysis, chat, conversations, admin, paddle, stripe,
                       onboard, usage, inventory, data-sources, validate-domain
```

### Dual domain model

- `vestigio.io` — marketing site (homepage, pricing, auth, blog, support)
- `app.vestigio.io` — authenticated application (actions, workspaces, chat, analysis, admin)

Routing is enforced in `src/middleware.ts` via hostname detection.

### Evidence persistence (implemented)

Evidence is now persisted in PostgreSQL via `PrismaEvidenceStore` (`packages/evidence/prisma-store.ts`).
The Prisma `Evidence` model stores typed evidence with full scoping, freshness, and quality metadata.
The in-memory `EvidenceStore` remains for fast access; Prisma store provides durability across restarts.

### Redis integration (implemented)

Redis provides:

- **Job queue**: `apps/platform/redis-job-queue.ts` — persistent job state with TTL, FIFO queue, and per-environment locks. Currently consumed by `/api/analysis/*` (Stage 0.1 wave intelligence jobs) only. **Not yet wired into audit-runner** — see "Known gap" below.
- **Rate limiting**: `src/libs/limiter.ts` — Redis-backed fixed-window counters with in-memory fallback
- **MCP rate limiting**: `apps/mcp/llm/rate-limiter.ts`
- **Session support**: shared across instances

Redis is optional — the system gracefully falls back to in-memory when `REDIS_URL` is not set.

### Audit-runner dispatch (Wave 5 Fase 1 — shipped 2026-04-14)

[apps/audit-runner/run-cycle.ts](../apps/audit-runner/run-cycle.ts) is now dispatched through a Redis-backed priority queue + standalone worker process. The legacy in-process `Promise.then()` path is retained as a graceful fallback for deploys without `REDIS_URL`.

**Components:**
- [apps/platform/audit-cycle-queue.ts](../apps/platform/audit-cycle-queue.ts) — three-tier priority queue (hot > warm > cold), per-env locking via `SET NX EX`, attempt counter, DLQ on 3 consecutive failures, observability snapshot via `getQueueDepth()`.
- [apps/audit-runner/worker-loop.ts](../apps/audit-runner/worker-loop.ts) — standalone consumer (`npm run start:worker`). Per-worker concurrency cap (`AUDIT_WORKER_CONCURRENCY`, default 2). Env-contention requeue without retry penalty. Exponential-backoff retry (5s → 60s capped). Graceful SIGTERM drain (5min timeout). Tiny HTTP health server on `WORKER_HEALTH_PORT` (default 3001) returning queue depth + chromium pool + Redis status for Railway probes. Structured JSON logs with `worker_id` correlation.
- [src/libs/leader-election.ts](../src/libs/leader-election.ts) — `SET NX EX` based, fail-open on Redis blip. Wraps the heal cron, lead-cleanup cron, and inactivity-pause cron in [src/instrumentation-node.ts](../src/instrumentation-node.ts) so multi-replica Railway deploys don't N-fold the work.
- [workers/verification/chromium-pool.ts](../workers/verification/chromium-pool.ts) — in-process semaphore (`CHROMIUM_POOL_SIZE`, default 3) wrapping every `chromium.launch()` call site. Caps RAM around 1GB even under burst.
- [src/libs/structured-log.ts](../src/libs/structured-log.ts) — JSON line emitter with cycle_id/org_id/env_id/worker_id correlation, snake_case keys for log aggregator parsing.
- [src/libs/usage-meter.ts](../src/libs/usage-meter.ts) + hook in `runAuditCycle` finally{} block — records `cycles_run`, `pages_crawled`, `compute_seconds` to the existing `Usage` table by period, foundation for pay-as-you-go billing.
- [/api/admin/metrics/audit-runner](../src/app/api/admin/metrics/audit-runner/route.ts) — single-call admin metrics endpoint: queue depth (per tier + DLQ), cycles-by-status last-24h, p50/p95 cycle duration, recent failures, top-10 orgs by cycles_run.

**Dispatch sites** that now enqueue first (with in-process fallback): Stripe webhook ([src/app/api/stripe/webhook/route.ts](../src/app/api/stripe/webhook/route.ts)), Paddle webhook ([src/app/api/paddle/webhook/route.ts](../src/app/api/paddle/webhook/route.ts)), activation endpoint ([src/app/api/environments/activate/route.ts](../src/app/api/environments/activate/route.ts)), env-activity resume hook ([src/libs/env-activity.ts](../src/libs/env-activity.ts)), orphan-redispatch heal cron ([apps/audit-runner/run-cycle.ts](../apps/audit-runner/run-cycle.ts)).

**Deployment topology:** add a second Railway service (Custom Start Command: `npm run start:worker`) sharing `REDIS_URL` + `DATABASE_URL` with the web. See [DEPLOY.md § 15.3.1](DEPLOY.md) for the procedure.

**Fase 3 shipped 2026-04-14:** real `cycleType` branching + scheduler cron + content hash.
- [apps/audit-runner/cycle-modes.ts](../apps/audit-runner/cycle-modes.ts) — hot/warm/cold config (behavioral window, min sessions, budget, carry-forward flag) + critical surface classifier (regex + auto-promotion from recent high-severity findings) + URL allow-list builder (hot = critical only, warm = critical + 30% rotating sample, cold = null/all) + `carryEvidenceForward` helper that clones evidence rows from the previous cycle when carrying hot/warm URLs forward.
- [apps/audit-runner/run-cycle.ts](../apps/audit-runner/run-cycle.ts) — maps `cycle.cycleType` to a `CycleMode`, resolves previous cycle + critical set + allow-list, calls carry-forward, runs staged pipeline with `url_filter` + per-mode budget. Hot/warm use `pipelineMode: 'shallow_plus'` (Stage D stays cold-only).
- [workers/ingestion/staged-pipeline.ts](../workers/ingestion/staged-pipeline.ts) — accepts optional `url_filter: string[]` in `StagedPipelineInput`; when present, intersects discovered candidates with the allow-list (homepage always retained).
- `Evidence.contentHash` — SHA-1 of the normalized HTML body for HttpResponse evidence; indexed `(environmentRef, subjectRef, evidenceType)` for Fase-3-plus-1 work that will pre-check hash before fetching.
- [apps/audit-runner/process-behavioral.ts](../apps/audit-runner/process-behavioral.ts) — `windowHours` param (hot=1h, warm=24h, cold=30d).
- [apps/audit-runner/scheduler.ts](../apps/audit-runner/scheduler.ts) — hourly leader-elected pass; reads `PLAN_CADENCE` from plan-config, resolves due cycleType per env (cold > warm > hot priority), creates `AuditCycle` row, enqueues with matching queue priority. Demo orgs included.
- [src/libs/plan-config.ts](../src/libs/plan-config.ts) — `PLAN_CADENCE` table (Starter: 1/week cold; Pro: 1h hot / 4h warm / 3d cold; Max: 15min hot / 1h warm / 1d cold).

Remaining for post-Fase-3:
- `FindingEvidenceDep` index — engine recompute is still atomic over full evidence set; hot/warm speedup comes from crawl selectivity + carry-forward. Adding the index would let the engine skip re-running findings whose upstream evidence didn't change. Open work.
- Pre-fetch hash comparison — today the allow-listed URLs still get fetched even if hash would match. The win is carry-forward on parse/signal extraction; a HEAD-request gate (or a hash-only endpoint) would skip the fetch entirely. Open work.

### Payment providers (implemented)

- **Paddle** is the primary payment provider (`src/paddle/`, `src/app/api/paddle/`)
- **Stripe** is the fallback provider (`src/stripe/`, `src/app/api/stripe/`)
- Plan configuration is managed via `PlatformConfig` model in Prisma and `src/libs/plan-config.ts`

### UX hierarchy

The product surfaces are ordered by operational priority:

1. **Actions** — primary surface, decision-derived prioritized actions (`src/app/app/actions/`)
2. **Workspaces** — pack-level decision aggregation with workspace detail (`src/app/app/workspaces/[id]/`)
3. **Chat** — conversational intelligence interface (`src/app/app/chat/`)
4. **Analysis** — deep analysis and evidence exploration (`src/app/app/analysis/`)

## Primary flows

### Flow 1. Full audit cycle

- orchestrator creates cycle
- ingestion collects
- evidence normalizes
- intelligence derives signals/inferences
- decision layer answers questions
- projections update UI/chat surfaces

### Flow 2. Incremental refresh

> **Current state (2026-04-14):** cosmetic. `continuous_audits_is_enabled` is a label on `PlanConfig` with no scheduler reading it, and `AuditCycle.cycleType` is a column `run-cycle.ts` never branches on. Every cycle today is `full`, fired by Stripe/Paddle webhook or heal-cron re-dispatch. Making this flow load-bearing is the scope of Wave 5 in [ROADMAP.md](ROADMAP.md).

Target semantics (Wave 5 Fase 3):

- **Ternary cycle modes** — `hot` (revenue-critical surfaces only, short wall-clock budget, last-1h behavioral window, revalidates `severity >= high` active findings), `warm` (rotating sample of periphery with coverage guarantee per window, last-24h behavioral, revalidates `severity >= medium`), `cold` (full pipeline, last-30d behavioral, revalidates everything). The existing `cycleType` string column becomes load-bearing.
- **Evidence diff via content hash** — `EvidenceSnapshot.contentHash` (SHA-1 of normalized HTML) lets hot/warm cycles skip re-parse on unchanged pages. Engine still always writes the evidence row so freshness is honest.
- **Finding → evidence dependency index** — `FindingEvidenceDep` table lets the engine identify which findings an evidence delta could affect, so only those recompute instead of the full set.
- **Regression detection at engine write, not aggregator read** — today the dashboard `ChangeReport` diffs findings at read time; incremental demands `new | updated | resolved | regressed` emitted at engine write so cycles can skip re-checking already-resolved findings.
- **Critical surface selection** — hybrid of heuristic regex (`checkout|cart|pricing|product|home`), mixed-weight scoring (recent high-severity findings + traffic share), and explicit user marks via the inventory surface sidedrawer (max 10 per env, stored in `CriticalSurface` table).
- **Entitlement gate** — `continuousAudits` in `PlanConfig` gates warm/hot scheduling; `cold` runs at least weekly for every plan including Starter so no environment drifts without a baseline reset.
- **Demo org exception** — `orgType=demo` is never paused by the inactivity cron.
- **Progress surfacing** — the existing `/api/analysis/stream` SSE endpoint (already emits `stage_complete`, `findings`, `score`, `complete` with `Last-Event-ID` reconnect + 5min cache + 15s heartbeat) is consumed by `/app/inventory`, `/app/analysis`, `/app/actions` to turn a pending cycle into live UI.

Pre-existing primitives used:
- Pixel ingest at `POST /api/behavioral/ingest` + `process-behavioral.ts` — landed in Wave 0.2/0.3.
- Integration deltas via `packages/integrations/reconcile.ts` — already incremental natively (adapter-by-adapter `since` params).
- `VersionedSnapshot` baselines + `change-detection` package — provide the diff substrate.

### Flow 3. Verification on demand

- chat/UI asks for stronger confidence
- decision layer emits `verification_request`
- orchestrator decides `light_probe`, `browser_verification`, `integration_pull` or defer
- results return as new evidence/cycle fragment

## Anti-patterns the rewrite must avoid

- product meaning stored in UI serializers
- module-specific severity systems
- probe logic hidden inside intelligence modules
- environment scope inferred too late
- economic estimates without confidence bands
- MCP bypassing engine contracts

## Resolved Questions

- **Repo structure**: The system lives in a single monorepo with strong logical boundaries (`packages/`, `apps/`, `workers/`, `src/`). No physical separation needed.
- **Browser verification**: Runs in a dedicated worker pool (`workers/verification/`) with Playwright runtime, separate from the audit pipeline.
- **Primary read model**: Actions page is the primary surface. Workspace summary is the second. Chat is the third. Analysis/findings is the fourth.
