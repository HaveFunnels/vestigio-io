# Implementation Guide

## Purpose

Guiar o rewrite para que:

- preserve o cerebro do produto
- nao reintroduza acoplamentos do monolito atual
- mantenha control plane separado do engine
- trate MCP como interface cognitiva, nao como lugar da logica de negocio

## Build philosophy

Sequencia desejada:

1. contracts first
2. typed evidence second
3. decision engine third
4. projections and MCP fourth
5. optional enrichment later

## Actual repository structure

```text
apps/
  platform/            — control plane services (job queue, billing, auth logging,
                         Redis job queue, SaaS access store, token ledger, env validation,
                         conversation store, cost guardrails, MCP persistence)
  mcp/                 — cognitive layer (LLM pipeline with 3-layer architecture:
                         input guard → core chat → output classifier,
                         tools, resources, playbooks, context chaining, suggestions,
                         session management, rate limiter, conversation memory)

packages/
  domain/              — canonical contracts (27 entity types exported)
  evidence/            — typed evidence persistence (in-memory + PrismaEvidenceStore)
  graph/               — evidence graph model and query layer
  signals/             — signal extraction
  inference/           — inference synthesis
  decision/            — decision engine with conflict resolver
  risk/                — risk evaluation
  intelligence/        — shared domain services, root cause analysis, global actions
  classification/      — pack eligibility, route classification
  projections/         — projection engine: findings, actions, workspaces, change reports
  workspace/           — workspace orchestration (preflight, revenue, chargeback packs,
                         recompute engine, confidence audit, behavioral validation)
  impact/              — quantified value cases, impact summaries
  plans/               — plan entitlements and limits
  maps/                — use-case maps
  suppression/         — suppression governance
  truth/               — truth resolution, contradiction detection
  change-detection/    — cycle-to-cycle change detection, versioned snapshots
  verification-lifecycle/ — verification request lifecycle
  verification-economics/ — cost/benefit analysis for verification
  behavioral/          — behavioral intelligence aggregates
  technology-registry/ — technology/provider fingerprinting
  brand-adapter/       — brand impersonation detection
  nuclei-adapter/      — nuclei scan integration
  katana-adapter/      — katana deep discovery
  shopify-adapter/     — Shopify integration
  actions/             — action derivation from decisions

workers/
  ingestion/           — HTTP client, parser, crawl pipeline, staged pipeline
  verification/        — browser verification (Playwright), authenticated runtime
  brand-intel/         — brand intelligence worker
  nuclei/              — nuclei scan worker
  katana/              — katana discovery worker
  shopify/             — Shopify data sync worker

src/                   — Next.js application
  app/(site)/          — marketing site (vestigio.io)
  app/(console)/       — legacy console routes
  app/app/             — authenticated app (app.vestigio.io)
  app/api/             — API routes
  libs/                — shared libraries (Redis, rate limiter, plan config, etc.)
  paddle/              — Paddle billing integration
  stripe/              — Stripe billing integration (fallback)
  middleware.ts        — dual-domain routing (vestigio.io vs app.vestigio.io)
```

## Boundary definitions

### `apps/platform/` (control plane)

Owns:

- auth and session management
- organizations, memberships (full CRUD)
- plans and entitlements (`packages/plans/`)
- billing (Paddle primary, Stripe fallback)
- environment registry
- onboarding flows
- SaaS access configuration store
- job queue (Redis-backed with in-memory fallback)
- audit scheduling
- token cost tracking and usage metering
- conversation persistence
- platform error tracking and observability
- MCP persistence (prompt events, sessions, suggestion clicks, playbook runs)

Does not own:

- inference rules
- risk logic
- evidence semantics
- graph traversals

### `src/app/api/` + `src/app/app/` (application layer)

Owns:

- cycle orchestration entrypoints (`api/analysis/`)
- typed reads for decisions/evidence
- verification request API
- projection APIs for UI/chat
- admin panel (organizations, environments, pricing, errors, usage)
- workspace detail views (`app/workspaces/[id]/`)

### `apps/mcp/` (cognitive layer)

Owns:

- conversational contracts
- LLM pipeline (3-layer: input guard, core chat, output classifier)
- tool/resource layer
- playbooks and context chaining
- suggestion engine
- execution policy facade
- explainability composition
- conversation memory and context management
- rate limiting

Does not own:

- decision semantics
- direct collection logic

### `packages/domain/`

Owns canonical schemas for:

- evidence (with ~30 typed payload variants)
- signal, inference
- risk_evaluation, decision (with conflict resolver)
- incident, opportunity
- value_case
- verification_request
- suppression_rule
- action (new — primary UI entity)
- workspace, environment, business_profile
- saas_access (SaaS access configuration)
- business_profile_lifecycle (versioning, drift detection)
- audit_cycle, finding, preflight, website

### `packages/evidence/`

Owns:

- typed evidence persistence (in-memory store + PrismaEvidenceStore)
- freshness metadata
- cycle store
- quality scoring
- confidence adjuster

### `packages/graph/`

Owns:

- evidence graph model
- graph query contracts
- path traversal helpers

### `packages/intelligence/`

Owns:

- shared domain services
- root cause analysis
- global actions

### `packages/signals/` + `packages/inference/`

Owns:

- signal extraction
- local inference synthesis

### `packages/decision/`

Owns:

- business question definitions
- risk/upside normalization
- conflict resolution between packs
- action prioritization (via `packages/actions/`)

### `packages/projections/`

Owns:

- findings projection (with truth context, suppression context)
- actions projection (with category, operational status, change class, verification maturity, resolve path)
- workspace summary projection (with coherence, confidence narrative, change summary)
- change report projection (regressions, improvements, new issues, resolved)
- system health indicators

### `packages/workspace/`

Owns:

- workspace orchestration (preflight, revenue, chargeback packs)
- recompute engine (multi-pack)
- confidence audit
- behavioral validation

### `packages/impact/`

Owns:

- quantified value cases
- impact summaries
- calibration helpers for impact/value estimation

### Adapter packages

- `packages/brand-adapter/` — brand impersonation detection
- `packages/nuclei-adapter/` — nuclei scan integration
- `packages/katana-adapter/` — katana deep discovery
- `packages/shopify-adapter/` — Shopify integration
- `packages/technology-registry/` — technology/provider fingerprinting
- `packages/behavioral/` — behavioral intelligence aggregates

### `packages/verification-lifecycle/` + `packages/verification-economics/`

Owns:

- verification request lifecycle
- policy for `light_probe`, `browser_verification`, `integration_pull`, `authenticated_journey_verification`
- cost/benefit analysis for verification decisions

## Worker model

### `workers/ingestion/`

Responsibilities:

- HTTP client for core audit collection
- HTML parser
- crawl pipeline with constraints
- staged pipeline for phased enrichment

### `workers/verification/`

Responsibilities:

- browser verification via Playwright runtime
- authenticated runtime for SaaS analysis
- orchestrator for verification execution
- feed results back as evidence

### `workers/brand-intel/`

Brand intelligence worker for lookalike domain detection.

### `workers/nuclei/`

Nuclei scan worker for vulnerability/exposure checks.

### `workers/katana/`

Katana deep discovery worker for hidden route finding.

### `workers/shopify/`

Shopify data sync worker for integration metrics.

### Orchestration

- Audit scheduling: `apps/platform/audit-scheduler.ts`
- Job queue: `apps/platform/redis-job-queue.ts` (Redis-backed with in-memory fallback)
- Analysis jobs: `AnalysisJob` Prisma model with status tracking

## Layer contracts

### Ingestion -> Evidence

Must pass:

- typed payload
- subject/environment scope
- provenance
- timestamps
- collection method

### Evidence -> Intelligence

Must pass:

- stable references
- freshness state
- evidence quality
- graph relations

### Intelligence -> Decision

Must pass:

- signals
- inferences
- local confidence
- evidence refs

### Decision -> Projections/MCP

Must pass:

- canonical decision object
- incident/opportunity refs
- value_case
- freshness/confidence
- explainability links

## Build order (actual progress)

### Phase 1. Contracts and core stores — COMPLETE

- canonical schemas (`packages/domain/` — 27 entity types)
- cycle store (`packages/evidence/cycle-store.ts`)
- evidence store (in-memory + PrismaEvidenceStore)
- business profile store (Prisma + lifecycle management)
- suppression store (`packages/suppression/`, `SuppressionRule` Prisma model)

### Phase 2. Graph and shared intelligence — COMPLETE

- graph model (`packages/graph/`)
- route classification (`packages/classification/`)
- platform/provider inference (via technology registry)
- trust boundary and policy services

### Phase 3. Decision engine — COMPLETE

- question registry
- risk engine (`packages/risk/`)
- decision engine with conflict resolver (`packages/decision/`)
- opportunity sizing baseline
- incident/opportunity promotion

### Phase 4. Core projections — COMPLETE

- findings (with truth context, suppression context, verification maturity, change class, evidence quality)
- actions (with category, operational status, resolve path)
- workspace summary (with coherence, confidence narrative, change summary)
- change report (regressions, improvements, new issues, resolved)
- system health indicators

### Phase 5. MCP — COMPLETE

- resources and tools (`apps/mcp/`)
- 3-layer LLM pipeline (input guard, core chat, output classifier)
- playbooks and context chaining
- suggestion engine
- conversation persistence and memory
- explainability composition
- verification request bridge

### Phase 6. Advanced enrichment — COMPLETE

- browser verification (`workers/verification/` with Playwright)
- authenticated SaaS analysis (`workers/verification/authenticated-runtime.ts`)
- nuclei integration (`workers/nuclei/`, `packages/nuclei-adapter/`)
- katana deep discovery (`workers/katana/`, `packages/katana-adapter/`)
- brand intelligence (`workers/brand-intel/`, `packages/brand-adapter/`)
- Shopify integration (`workers/shopify/`, `packages/shopify-adapter/`)
- behavioral intelligence (`packages/behavioral/`)
- network analysis evidence
- mobile verification evidence
- change detection (`packages/change-detection/`)
- Redis integration for job queue and rate limiting

## How to use SaaS boilerplate

Permitted uses:

- auth
- workspace/project CRUD
- plan gating
- billing
- notifications
- generic admin UI

Forbidden uses:

- embedding product rules in controllers/views
- storing decision semantics in generic JSON settings
- mixing workflow state with evidence state

## Anti-patterns to avoid

- `audits.data`-style omni-blob as truth source
- module-specific graphs
- multiple severity ontologies
- UI-computed business meaning
- MCP calling collectors directly
- projections becoming writable sources of truth
- no explicit environment scoping
- value estimates without assumptions/confidence

## Migration guidance

Preserve first:

- audit cycle semantics
- discovery/crawl adapters
- evidence graph concept
- behavioral aggregates
- preflight profile concept

Defer or isolate:

- legacy UI payload shapes
- bespoke radar storage models
- monolithic scorecards sem semantica clara

## Definition of done for architecture

O rewrite esta estruturalmente correto quando:

- uma pergunta de negocio pode ser respondida a partir de `decision`
- cada decisao aponta para evidence refs claras
- incidents e opportunities nao dependem de findings como source
- preflight nao recomputa logica separada
- MCP nao inventa regra fora do engine

## Resolved Questions

- **Repo structure**: Single monorepo with strong logical boundaries. `apps/`, `packages/`, `workers/`, `src/` directories provide clear separation.
- **Taxonomy ownership**: `packages/domain/` owns canonical contracts. `packages/decision/` owns decision logic. `packages/classification/` owns pack eligibility.
- **Migration approach**: Incremental — shared intelligence services with multiple decision packs (scale_readiness, revenue_integrity, chargeback_resilience, saas_growth_readiness) now operational.
