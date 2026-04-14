# Architecture V2

> Last updated: 2026-04-14
> Companion to: [ROADMAP.md](ROADMAP.md), [DEV_PROGRESS.md](../DEV_PROGRESS.md), [DEPLOY.md](DEPLOY.md)

## Goal

Transformar o sistema em:

**um decision-first intelligence engine para digital business assurance**

com:

- dataset-first execution
- phased enrichment
- MCP como interface cognitiva
- control plane separado do engine
- **continuous incremental audits** sob cadência por plano

## Architectural principles

### 1. Single collection owner

Coleta ativa pertence ao audit pipeline (`apps/audit-runner/` + `workers/ingestion/`). Radars, módulos de intelligence e MCP não fazem rede, shell ou probe ad hoc. Segue `AUDIT_INTELLIGENCE_DIRECTIVES.md`.

### 2. Evidence first

Toda lógica downstream consome evidence normalizado (`packages/evidence/`), nunca blobs heterogêneos como verdade primária.

### 3. Decisions are first-class

`decision` é a unidade primária de produto; findings, ações, incidents, opportunities são projeções.

### 4. Reuse before execution

O sistema responde com evidence existente antes de:

- probe leve
- browser verification (Stage D, Playwright)
- integração externa

Cold cycles quebram reuse intencionalmente (baseline reset). Hot/warm cycles maximizam reuse via content-hash + evidence carry-forward.

### 5. Environment-aware intelligence

Nenhuma decisão material mistura:

- production com staging
- checkout de uma business unit com landing de outra
- root domain institucional com surface comercial sem scoping explícito

Todo material object carrega `workspace_ref`, `environment_ref`, `subject_ref`, `path_scope`.

### 6. Control plane separate from product brain

SaaS boilerplate (auth, tenants, billing, jobs, notifications) não contém:

- rules de discovery
- decision logic
- graph semantics
- risk ontology

## High-level architecture

```text
Control Plane
  → Engine Orchestration (scheduler + worker loop + Redis queue)
    → Ingestion Layer (staged pipeline + Playwright pool)
      → Evidence Layer (Postgres + content-hash + graph)
        → Intelligence Layer (signals, inferences, shared services)
          → Decision Layer (decisions, risk, value case)
            → Output Layer (findings, actions, workspaces, maps)
              → MCP / Chat / UI Surfaces
```

## Control Plane

### Responsibilities (`apps/platform/` + `src/app/api/`)

- workspace, user, membership CRUD
- plan entitlements (`packages/plans/`, `PlatformConfig` model, `src/libs/plan-config.ts` para cadência)
- environment registry (`Environment` com `activated`, `continuousPaused`, `lastAccessedAt`)
- onboarding + business profile capture (`BusinessProfile` + `BusinessProfileVersion`)
- SaaS access config (`SaasAccessConfig` por ambiente)
- admin org provisioning (`POST /api/admin/organizations`, `/app/admin/organizations/new`)
- impersonation (`apps/platform/impersonation.ts` + `/api/admin/impersonate/*`)
- billing (Paddle primário, Stripe fallback)
- Redis-backed job queue + rate limiter com fallback in-memory
- leader election (`src/libs/leader-election.ts`)
- usage metering para pay-as-you-go (`src/libs/usage-meter.ts`)
- notifications + workflow states (`NotificationLog`)
- platform error tracking, auth event logging, token cost ledger

### Must not own

- evidence semantics
- inference logic
- decision synthesis
- heuristic policies

## Engine Orchestration

### Responsibilities

- criar `AuditCycle` com `cycleType` correto (hot/warm/cold)
- enfileirar em prioridade na Redis queue
- resolver critical surfaces + URL allow-list + carry-forward
- invocar staged pipeline com `pipelineMode` + `url_filter` + `cycleBudgetMs`
- processar behavioral payload no window correto
- acionar verification sob demanda
- emitir structured logs com correlação (`cycle_id/org_id/env_id/worker_id`)
- gravar usage meter no final do cycle

### Current grounding

- **Worker separado:** `apps/audit-runner/worker-loop.ts` é o processo canônico (rodando via `npm run start:worker` em um Railway service dedicado). Consome `apps/platform/audit-cycle-queue.ts` (priority Redis list).
- **Scheduler horário:** `apps/audit-runner/scheduler.ts` roda de hora em hora sob `withLeadership("audit-scheduler", ttlSec:90)` em `src/instrumentation-node.ts`. Enumera envs `activated=true, continuousPaused=false, org.status != suspended`, resolve cycleType devido via `PLAN_CADENCE`, cria `AuditCycle` + enfileira.
- **Inactivity pause cron:** hourly, pausa envs sem acesso por 14d (exceto `orgType=demo`).
- **Heal cron:** minutely, redispatcha cycles órfãos (`pending/running` > 10min) via queue.
- **Fallback in-process:** quando `REDIS_URL` não está configurado, todos os dispatch sites caem para `Promise.then(runAuditCycle)` — single-box deploys continuam funcionando.

### Deprecated

- `apps/platform/audit-scheduler.ts` — scheduler in-memory legacy, nenhum consumidor vivo. O scheduler vivo é `apps/audit-runner/scheduler.ts`.

## 1. Ingestion Layer

### Responsibilities

- core audit collection
- domain discovery + crawl seletivo via `url_filter`
- heartbeat + pixel ingestion
- external adapter pulls
- browser verification (cold-only, gated em `pipelineMode='full'`)

### Preserved

- `AuditHttpClient`, `AuditPipelineProbe`, `DomainInventoryCrawler`, `DomainCrawlPlanner`
- `PixelTrack` + heartbeat ingestion
- Chromium semaphore (`workers/verification/chromium-pool.ts`, default 3, env `CHROMIUM_POOL_SIZE`) envolvendo todo `chromium.launch()` call site — teto de RAM ~1GB sob burst.

### Pipeline modes

- `full` — todas as stages A-D (Stage D = Playwright browser verification). Apenas cold cycles.
- `shallow_plus` — stages A-C sem Stage D. Hot/warm cycles. Agora respeita `url_filter`: intersect antes do slice (o slice de 5 URLs só aplica quando nenhum filter é passado).
- `shallow` — stage A somente. Usado pelo funil `/lp` e admin surface scans.

## 2. Evidence Layer

### Responsibilities

- typed storage de evidence por cycle/environment
- evidence graph persistence
- freshness + provenance
- behavioral overlays
- integration snapshot storage
- content-hash para change detection

### Canonical stores

- cycle store (`packages/evidence/cycle-store.ts`)
- evidence store — in-memory (`packages/evidence/store.ts`) + Postgres (`packages/evidence/prisma-store.ts`)
- graph store (`packages/graph/`)
- quality scoring (`packages/evidence/quality.ts`)
- confidence adjuster (`packages/evidence/confidence-adjuster.ts`)

### Prisma models

- `Evidence` — com `contentHash String?` + índice `(environmentRef, subjectRef, evidenceType)`
- `Website` + `PageInventoryItem` (type, tier, criticality, freshness) + `SurfaceRelation`
- `AuditCycle` (status, cycleType, timestamps) + `CycleSnapshot` + `Finding`
- `VersionedSnapshot` para change-detection baselines
- `RawBehavioralEvent` para pixel ingest

### Evidence carry-forward

Hot/warm cycles clonam evidence rows do cycle anterior **apenas** para URLs fora do allow-list (páginas que o cycle não vai re-crawlar), via `carryEvidenceForward()` em `apps/audit-runner/cycle-modes.ts`. Rows carregam `CollectionMethod.CarriedForward` ("carried_forward") para downstream quality-scoring discriminar. Evita duplicação de evidence e preserva continuidade para o engine atomic recompute.

### Preserve

- `website_page_inventory`, `website_surface_relations`, behavioral session intelligence (`packages/behavioral/`), cycle model.

## 3. Intelligence Layer

### Responsibilities

- extrair signals
- computar inferences locais
- expor shared domain services
- aplicar suppression + allowlist context

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

- revenue, chargeback, readiness, brand/fraud, measurement, security, behavioral.
- Módulos consomem shared services; não reconstroem topologia independentemente.

## 4. Decision Layer

### Responsibilities

- responder business questions
- normalizar risk e upside
- aplicar confidence, freshness, gates
- criar `decision`, promover a `incident` ou `opportunity`
- priorizar actions

### Central contracts

- `decision`, `risk_evaluation`, `value_case`, `verification_request`, `suppression_rule`.

## 5. Output Layer

### Responsibilities

- findings projection (`packages/projections/`)
- preflight projection
- incident + opportunity boards
- workspace summary (7 behavioral workspaces + core packs)
- use-case maps (`packages/maps/`)
- explainability payloads para chat/MCP
- change-detection deltas (`new | updated | resolved | regressed`)

Regra: outputs são **projeções** de decisions canônicas + evidence, nunca fontes paralelas de verdade.

## 6. MCP / Chat Surface

### Responsibilities

- consumir read models + evidence refs
- responder conversacionalmente
- pedir verification quando necessário
- disciplina de token/cost
- exibir explainability + verification stage (nunca confidence percentage numérico — ver Wave 2.4)

### Components (`apps/mcp/`)

- `server.ts`, `tools.ts`, `resources.ts`
- `playbooks.ts` + `playbook-prompts.ts`
- `suggestion-engine-v2.ts`, `suggestions.ts`
- `context.ts` + `context-chaining.ts`
- `session.ts`, `usage.ts`, `observability.ts`
- `saas-awareness.ts`, `verification.ts`, `audit-lifecycle.ts`, `maintenance.ts`
- `llm/` — pipeline, rate limiter, prompt gate

### Must not

- inventar business logic fora de decision contracts
- bypassar freshness + suppression policy
- probar sem aprovação do engine

## Cross-cutting contracts

### Freshness

Todo layer carrega: `observed_at`, `fresh_until`, `freshness_state`, `staleness_reason`.

### Environment scoping

Todo material object carrega: `workspace_ref`, `environment_ref`, `subject_ref`, `path_scope`.

### URL canonicalization

Para comparações de set-membership (critical surfaces, allow-list intersect), URLs passam por `canonicalizeUrl()` em `apps/audit-runner/cycle-modes.ts`: drop query/fragment, lowercase host, strip trailing slash exceto root. Evita drift silencioso entre `Finding.surface` (às vezes path) e `PageInventoryItem.normalizedUrl` (sempre URL completa).

### False-positive governance

Centralizado em `packages/suppression/`: suppressions, allowlists, evidence dispute, override audit trail.

### Value estimation

Centralizado em `packages/impact/`: range-based estimation, confidence bands, business profile calibration, guardrails.

## Continuous incremental engine

> Foundation shipada em 2026-04-14 (Wave 5 Fase 1 + Fase 2 + Fase 3). Detalhes por commit em [ROADMAP.md](ROADMAP.md) e [DEV_PROGRESS.md](../DEV_PROGRESS.md).

### Cycle modes

Ternário em `apps/audit-runner/cycle-modes.ts`:

| Mode | Behavioral window | Budget | Pipeline mode | Carry-forward | Escopo de crawl |
|------|-------------------|--------|---------------|---------------|-----------------|
| hot  | 1h                | 60s    | shallow_plus  | ON            | Critical surfaces apenas |
| warm | 24h               | 4min   | shallow_plus  | ON            | Critical + 30% rotating sample (Fisher-Yates) |
| cold | 30d               | 10min  | full          | OFF (baseline reset) | Todas as páginas |

### Critical surface selection

Hybrid em `resolveCriticalSurfaces()`:

- **Heuristic regex** sobre path: `/checkout|cart|carrinho|comprar|pay|payment|billing/`, `/pricing|preco|planos|plans/`, `/product|produto|item|p\//`, mais home (`/`) sempre.
- **Auto-promotion:** URLs que tiveram severity ≥ high finding nos últimos 7 dias — surfaces ativamente quebrando revenue entram no hot loop até serem resolvidas.
- UI para user-marks explícitos é trabalho futuro (fora de escopo de Fase 3).

### Plan cadence

`PLAN_CADENCE` em `src/libs/plan-config.ts`:

| Plan    | Cold   | Warm | Hot    |
|---------|--------|------|--------|
| Starter | 1/semana | —    | —      |
| Pro     | 3 dias | 4h   | 1h     |
| Max     | 1 dia  | 1h   | 15 min |

`getCadenceForPlan(planKey)` resolve. Scheduler consulta + emite cycles a cada hora. Cadence não é admin-tunable por UI — mudar exige commit (o custo de misconfig em produção é alto demais).

### Redis queue + worker

- **`apps/platform/audit-cycle-queue.ts`** — queue com prioridade (hot > warm > cold), lock por env via `SET NX EX` (TTL 15min), attempts counter, DLQ em 3 falhas, `getQueueDepth()` para observability.
- **`apps/audit-runner/worker-loop.ts`** — consumer standalone (`npm run start:worker`). Concorrência por worker (default 2, env `AUDIT_WORKER_CONCURRENCY`). Requeue sem penalidade em contenção de env. Backoff exponencial (5s→60s). SIGTERM graceful (5min timeout + lock-release sweep). HTTP health server em `WORKER_HEALTH_PORT` (default 3001). Locks tracked em `heldEnvLocks: Set<string>` para cleanup.
- **Leader election** — `src/libs/leader-election.ts` com `SET NX EX`, fail-open em Redis blip. Envolve scheduler, heal, lead-cleanup, inactivity-pause.
- **Chromium pool** — `workers/verification/chromium-pool.ts`, semaphore in-process.

### Dispatch sites

Todos enfileiram via `enqueueAuditCycle()` primeiro, com fallback in-process:

- Stripe webhook (`src/app/api/stripe/webhook/route.ts`)
- Paddle webhook (`src/app/api/paddle/webhook/route.ts`)
- Activation endpoint (`src/app/api/environments/activate/route.ts`)
- Env-activity resume hook (`src/libs/env-activity.ts`)
- Heal cron (`src/instrumentation-node.ts`)
- Scheduler (`apps/audit-runner/scheduler.ts`)

### Activation + inactivity lifecycle

- `Environment.activated` — flipped true quando owner completa onboarding + clica "Activate environment". `/api/environments/activate` cria env + BusinessProfile + primeiro AuditCycle em uma transação e enfileira.
- `Environment.lastAccessedAt` — 1h-debounced write em `src/libs/env-activity.ts`, chamado no `/app/*` server layout (pulado quando `isImpersonating`, para não resetar o relógio do owner).
- `Environment.continuousPaused` — seteado pelo inactivity cron após 14d sem acesso, exceto `orgType=demo`. Banner âmbar subdued em `/app/*`.
- Auto-resume — primeiro acesso após pausa dispara `resumeIfPaused()` (atomic `updateMany` com gate) que enfileira catch-up cycle.

### SSE progress

- `GET /api/cycles/[id]/stream` — observer puro, poll de cycle status + finding count + page count a cada 2s, eventos `status/complete/error`, 15s heartbeat, 10min guardrail.
- `GET /api/cycles/latest` — discovery endpoint (respeita cookie `active_env`).
- `CycleProgressBanner` em `src/components/app/` monta em `/app/inventory`, `/app/analysis`, `/app/actions` via `EventSource`.

### Observability

- `src/libs/structured-log.ts` — JSON line com correlation IDs (`cycle_id/org_id/env_id/worker_id`), keys em snake_case para parsers.
- `src/libs/usage-meter.ts` — hook no finally{} block de `runAuditCycle` gravando `cycles_run`, `pages_crawled`, `compute_seconds` na tabela `Usage` por período `YYYY-MM`.
- `GET /api/admin/metrics/audit-runner` — endpoint single-call: queue depth por tier + DLQ, cycles-by-status últimas 24h, p50/p95 duration com `sampleTruncated` flag, falhas recentes, top-10 orgs por usage.

### Known limitations / deferred

- **`FindingEvidenceDep` index não existe** — engine `recomputeAll()` ainda é atomic sobre o evidence set completo. Speedup de hot/warm vem de crawl selectivity + carry-forward (não-fetch). Adicionar o index permitiria skip de findings cujo upstream evidence não mudou.
- **Pre-fetch hash comparison** — hoje URLs no allow-list ainda são fetchadas mesmo que o hash fosse bater. Carry-forward economiza parse + signal extraction, não o fetch. HEAD-request gate ou hash-only endpoint seria o próximo ganho.
- **`minSessionsForInferences` hardcoded** — `MIN_SESSIONS=20` em `packages/signals/engine.ts`. Plumbing dinâmico por cycle mode é cross-cutting e ficou fora de escopo.
- **Priority inversion** — scheduler pula env com cycle in-flight. Se um cold está rodando e um hot fica due, o hot espera o cold completar. Heal cron + tick horário mitigam; redesign é out of scope da Fase 3.
- **Plan cadence admin UI** — cadência definida em código. UI para tunar por customer é risky (misconfig em produção derruba SLO); `continuousAudits` flag em `PlanConfig` existe mas não é lido (legacy).
- **DB load em scheduler** — enumera até 500 envs por tick. Cursor pagination quando passar de ~1k envs.

## Current repo shape

```text
apps/
  audit-runner/     — cycle orchestration, worker loop, scheduler, cycle-modes,
                      behavioral processing
  platform/         — control plane (audit-cycle-queue, job-queue, billing-safety,
                      auth-logging, SaaS access store, token ledger, env validation,
                      impersonation, conversation-store, cost-guardrails)
  mcp/              — cognitive layer (LLM pipeline, tools, resources, playbooks,
                      context chaining, suggestion engine v2, session, usage,
                      observability, saas-awareness, verification hooks)

packages/
  actions/          — action derivation from decisions
  behavioral/       — behavioral intelligence aggregates, session cohorts
  brand-adapter/    — brand impersonation detection
  change-detection/ — cycle-to-cycle diff, versioned snapshots, change_class emit
  classification/   — pack eligibility, route classification
  composites/       — blast-radius regression, opportunity compression,
                      trust-surface score
  decision/         — decision engine, conflict resolver
  domain/           — canonical contracts (evidence, signal, inference, decision,
                      action, incident, opportunity, value-case, suppression,
                      verification, saas-access, business-profile-lifecycle,
                      workspace, website)
  evidence/         — typed evidence (in-memory + PrismaEvidenceStore + Postgres),
                      cycle store, quality scoring, confidence adjuster
  graph/            — evidence graph model + query layer
  impact/           — quantified value cases, impact summaries
  inference/        — inference synthesis
  integrations/     — commerce-context, reconcile (since-param incremental),
                      revenue-recovery, shared types
  intelligence/     — shared domain services, root cause analysis, global actions,
                      linking
  katana-adapter/   — katana deep discovery integration
  knowledge/        — foundation-articles (160 programmatic articles), translations,
                      guides
  maps/             — use-case maps (engine maps findings → map nodes)
  nuclei-adapter/   — nuclei scan integration
  nuvemshop-adapter/— Nuvemshop integration
  plans/            — plan entitlements + limits
  projections/      — projection engine: findings, actions, workspaces,
                      change reports, verification maturity, change class,
                      evidence quality
  risk/             — risk evaluation
  shopify-adapter/  — Shopify integration
  signals/          — signal extraction
  suppression/      — suppression governance
  technology-registry/ — technology + provider fingerprinting
  truth/            — truth resolution, contradiction detection
  verification-economics/ — cost/benefit analysis for verification
  verification-lifecycle/ — verification request lifecycle
  workspace/        — workspace orchestration (preflight, revenue, chargeback,
                      security packs), recompute engine, confidence audit,
                      behavioral validation

workers/
  brand-intel/      — brand intelligence worker
  ingestion/        — HTTP client, parser, crawl pipeline, staged pipeline
                      (com url_filter + canon + contentHash), enrichment runner
  katana/           — katana discovery worker
  nuclei/           — nuclei scan worker
  nuvemshop/        — Nuvemshop sync worker
  shopify/          — Shopify sync worker
  verification/     — Playwright runtime, authenticated runtime, chromium-pool

src/
  app/
    (site)/         — marketing site (vestigio.io): homepage, pricing, auth, lp,
                      scans, pricing, support, thank-you, privacy, terms
    (blog)/         — blog routes
    (studio)/       — Sanity Studio
    app/            — authenticated console (app.vestigio.io): actions, workspaces,
                      chat, analysis, inventory, maps, billing, customer-center,
                      dashboard, knowledge-base, members, organization,
                      onboarding, settings, admin
    api/            — analysis, analytics, api-key, auth, behavioral, billing,
                      branding, chat, conversations, cycles, dashboard,
                      data-sources, environments, feedback, forgot-password,
                      generate-content, integrations, inventory, knowledge-base,
                      lead, lemon-squeezy, maps, newsletter, onboard,
                      organization, paddle, pricing, revalidate, scans, stripe,
                      support-tickets, usage, user, user-journey, validate-domain,
                      verification, whatsapp, workspace, admin/*
  libs/             — auth, prismaDb, redis, leader-election, structured-log,
                      usage-meter, env-activity, plan-config, behavioral-ingest,
                      notifications, email, brevo, alert-evaluator, audit-log,
                      integration-crypto, limiter, health-checker, error-tracker
  components/       — UI primitives + app-layer components (CycleProgressBanner,
                      AppSidebarLayout with paused banner, etc.)
  paddle/ stripe/   — payment provider adapters
  middleware.ts     — hostname-based routing (vestigio.io vs app.vestigio.io)
                      + session-based onboarding gate

prisma/             — schema.prisma, migrations, seed
workers/            — see above
```

### Dual domain model

- `vestigio.io` — marketing site (homepage, pricing, auth, blog, support, /lp funnel, /scans prospect audits).
- `app.vestigio.io` — authenticated application (actions, workspaces, chat, analysis, inventory, maps, admin).

Routing enforced em `src/middleware.ts` via hostname detection + session-based `needsOnboarding` gate (`hasOrganization === false || hasActivatedEnv === false`).

### Payment providers

- Paddle (primário) — `src/paddle/`, `src/app/api/paddle/`. Webhook atualiza `Organization.plan/status` em `subscription.created/updated/canceled/paused/resumed` e `transaction.completed` via `resolvePlanFromPriceId()`.
- Stripe (fallback) — `src/stripe/`, `src/app/api/stripe/`.
- Plan config em `PlatformConfig` (DB) + `src/libs/plan-config.ts` (code).

### UX hierarchy

1. **Actions** — primary surface, decision-derived prioritized actions.
2. **Workspaces** — pack-level decision aggregation com workspace detail (7 behavioral + core packs).
3. **Chat** — conversational intelligence (MCP).
4. **Analysis** — deep analysis + evidence exploration + change-class badges.

## Primary flows

### Flow 1. Full cycle (cold)

- scheduler (ou webhook/activation) cria `AuditCycle` com `cycleType='cold'` + enfileira na queue
- worker draina, resolve critical surfaces + allow-list (cold → null, tudo)
- staged pipeline roda em `pipelineMode='full'` (A→D)
- behavioral processor processa janela de 30d
- engine recompute atomic sobre evidence set completo
- projections emitidas (findings, actions, workspaces, change deltas)
- MCP + UI consomem

### Flow 2. Incremental refresh (hot/warm)

> **Estado atual (2026-04-14):** load-bearing. Wave 5 Fase 3 fez `cycleType` ser read-significant em `run-cycle.ts`.

- scheduler/webhook emite cycle hot ou warm conforme `PLAN_CADENCE`
- `resolveCriticalSurfaces` computa set (heurística regex + auto-promotion de severity ≥ high findings dos últimos 7d)
- `buildUrlAllowList` gera allow-list: hot = critical only, warm = critical + 30% rotating sample via Fisher-Yates
- `carryEvidenceForward` clona evidence rows do cycle anterior **apenas para URLs fora do allow-list** (páginas que o cycle não re-crawla)
- staged pipeline roda com `url_filter` + `max_pages_per_domain = urlFilter.length + 1`, `pipelineMode='shallow_plus'` (skip Stage D)
- behavioral processor usa janela apropriada (hot=1h, warm=24h)
- engine recompute (ainda atomic; `FindingEvidenceDep` index é trabalho futuro)
- projections com change-class emit

Primitives pré-existentes que esse flow consome:
- Pixel ingest em `POST /api/behavioral/ingest` + `process-behavioral.ts` — Wave 0.2/0.3.
- Integration deltas via `packages/integrations/reconcile.ts` — já incremental por adapter (`since` params).
- `VersionedSnapshot` + `change-detection` package — substrato do diff.

### Flow 3. Verification on demand

- Chat/UI pede stronger confidence
- Decision layer emite `verification_request`
- Orchestrator decide `light_probe`, `browser_verification`, `integration_pull` ou defer
- Resultados retornam como evidence/cycle fragment novos
- Recompute dispara, projections atualizam

### Flow 4. Activation lifecycle

- Admin cria org shell (Owner + Membership, sem env) via `POST /api/admin/organizations`
- Admin impersona via `/api/admin/impersonate/*` (apps/platform/impersonation.ts)
- Owner completa onboarding + preenche BusinessProfile
- "Activate environment" CTA → `/api/environments/activate` cria env + profile + primeiro cold cycle + `activated=true`
- Middleware libera `/app/*`
- SSE banner mostra progresso real-time via `/api/cycles/[id]/stream`
- Cycle completa → findings populam → workspaces + actions renderizam
- Env idle 14d → inactivity cron pausa (exceto demo) → banner âmbar subdued
- Owner volta → `resumeIfPaused()` dispara catch-up cycle

## Anti-patterns the rewrite must avoid

- product meaning stored in UI serializers
- module-specific severity systems
- probe logic hidden inside intelligence modules
- environment scope inferred too late
- economic estimates without confidence bands
- MCP bypassing engine contracts
- numeric confidence percentages surfaced in UI (Wave 2.4: `confidence_tier` com low filtrado fora da projection)
- verification lifecycle vocabulary que sugere finding é falso (Wave 2.4: `static_evidence → confirming → confirmed`, não `unverified → verified`)

## Resolved design questions

- **Repo structure:** monorepo único com boundaries lógicas (`packages/`, `apps/`, `workers/`, `src/`). Nenhuma separação física necessária.
- **Browser verification:** dedicated worker (`workers/verification/`) com Playwright runtime + chromium pool. Stage D cold-only.
- **Primary read model:** Actions > Workspaces > Chat > Analysis.
- **Cadence governance:** `PLAN_CADENCE` em código, não UI admin-tunável. Custo de misconfig em produção > benefício de flexibilidade.
- **Cycle type storage:** `AuditCycle.cycleType` é a autoridade. Legacy rows com `cycleType='full'` contam como cold para freshness.
- **Worker topology:** processo separado (`npm run start:worker`) em Railway service dedicado sharing `REDIS_URL` + `DATABASE_URL` com o web. Ver [DEPLOY.md § 15.3.1](DEPLOY.md).
