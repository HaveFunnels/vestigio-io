# BUILD_STRATEGY.md

## Purpose

Definir a estratégia de construção do Vestigio garantindo:

* entrega rápida de valor (time-to-value)
* preservação da arquitetura decision-first
* isolamento entre control plane e engine
* evolução incremental sem dívida estrutural

Este documento existe para impedir:

* overbuilding
* colapso de camadas
* acoplamento prematuro
* implementação fora de ordem

---

## Core principles

### 1. Decision-first always

Nada é construído sem responder:

> qual decisão isso vai permitir responder?

Se não responde uma decisão real → não entra agora.

---

### 2. Dataset-first, execution-second

* primeiro: modelar evidence e contracts
* depois: ingestion e probes
* nunca o contrário

---

### 3. Single vertical slice > horizontal completeness

Sempre entregar um fluxo completo:

```text
evidence → graph → decision → MCP → chat response
```

Mesmo que limitado a 1 use case.

---

### 4. Reuse before execution

O sistema deve funcionar com:

* evidence mínima
* sem depender de browser ou integrações externas

Execução avançada entra depois.

---

### 5. MCP is not the brain

* MCP consome decisions
* MCP não cria lógica de negócio
* MCP não substitui o decision engine

---

## Build phases

---

## Phase 0 — Foundations (contracts only) ✅ COMPLETE

### Goal

Criar o esqueleto do sistema sem execução real.

### Scope

* domain contracts
* entity definitions
* type systems
* interfaces entre camadas

### Deliverables

* `audit_cycle` ✅
* `evidence` ✅ (with ~30 typed payload variants)
* `signal` ✅
* `inference` ✅
* `decision` ✅ (with conflict resolver)
* `incident` ✅
* `opportunity` ✅
* `preflight_profile` ✅
* `action` ✅ (new — primary UI entity)
* `saas_access` ✅ (SaaS access configuration)
* `business_profile_lifecycle` ✅ (versioning, drift detection)

All contracts live in `packages/domain/` with 27 exported entity types.

---

## Phase 1 — Evidence ingestion (minimal viable dataset) ✅ COMPLETE

### Goal

Ter dados reais mínimos para alimentar decisões.

### Deliverables

* ingestion pipeline (`workers/ingestion/pipeline.ts` + `staged-pipeline.ts`) ✅
* HTTP client (`workers/ingestion/http-client.ts`) ✅
* HTML parser (`workers/ingestion/parser.ts`) ✅
* crawl constraints (`workers/ingestion/crawl-constraints.ts`) ✅
* evidence store — in-memory + PrismaEvidenceStore (PostgreSQL) ✅
* audit_cycle funcional (`AuditCycle` Prisma model) ✅

---

## Phase 2 — Evidence graph (structural truth) ✅ COMPLETE

### Goal

Conectar evidence em relações úteis.

### Deliverables

* graph builder (`packages/graph/`) ✅
* graph query layer ✅
* path tracing ✅
* `Website`, `PageInventoryItem`, `SurfaceRelation` Prisma models ✅
* technology registry (`packages/technology-registry/`) ✅

---

## Phase 3 — Signals + Inferences ✅ COMPLETE

### Goal

Transformar evidence em significado.

### Deliverables

* signal engine (`packages/signals/`) ✅
* inference engine (`packages/inference/`) ✅
* confidence framework ✅
* 50+ inference categories covering: commerce context, trust boundary, policy gap, revenue path, measurement coverage, checkout integrity, conversion flow, friction path, SaaS-specific (activation, onboarding, upgrade), discoverability, brand integrity, behavioral ✅

---

## Phase 4 — Decision Engine (multi-pack) ✅ COMPLETE

### Goal

Responder perguntas reais de negócio.

### Deliverables

* decision engine with conflict resolver (`packages/decision/`) ✅
* risk evaluation (`packages/risk/`) ✅
* impact quantification (`packages/impact/`) ✅
* multi-pack orchestration (`packages/workspace/`) ✅

### Implemented packs

* `scale_readiness` ✅
* `revenue_integrity` ✅
* `chargeback_resilience` ✅
* `saas_growth_readiness` ✅

### Supporting infrastructure

* confidence audit (`packages/workspace/confidence-audit.ts`) ✅
* behavioral validation (`packages/workspace/behavioral-validation.ts`) ✅
* truth resolution with contradiction detection (`packages/truth/`) ✅
* suppression governance (`packages/suppression/`) ✅

---

## Phase 5 — Projections + Actions (primary product surface) ✅ COMPLETE

### Goal

Criar a experiência operacional principal pro usuário.

### Deliverables

* projection engine (`packages/projections/engine.ts`) ✅
* findings projection (with verification maturity, change class, evidence quality) ✅
* actions projection (primary surface, with category, resolve path) ✅
* workspace summary projection (with coherence, confidence narrative) ✅
* change report projection ✅
* system health indicators ✅
* preflight result (readiness scoring) ✅

---

## Phase 6 — MCP / Chat (intelligence interface) ✅ COMPLETE

### Goal

Permitir interação natural com o sistema.

### Deliverables

* MCP server with tools and resources (`apps/mcp/`) ✅
* 3-layer LLM pipeline (input guard, core chat, output classifier) ✅
* playbooks and context chaining ✅
* suggestion engine v2 ✅
* conversation persistence (`Conversation`, `ConversationMessage`, `TokenCostLedger` models) ✅
* conversation memory and context management ✅
* rate limiting (Redis-backed) ✅
* session management ✅
* SaaS awareness for intelligent suggestions ✅
* verification request bridge ✅
* chat feedback collection (`ChatFeedback` model) ✅

---

## Phase 7 — Incidents & Opportunities ✅ COMPLETE

### Goal

Transformar decisões em ação.

### Deliverables

* incident model (`packages/domain/incident.ts`) with status lifecycle ✅
* opportunity model (`packages/domain/opportunity.ts`) with status lifecycle ✅
* value case with quantified ranges (`packages/impact/`) ✅
* action derivation from decisions (`packages/actions/`) ✅
* actions page as primary operational surface (`src/app/app/actions/`) ✅

---

## Phase 8 — Value Engine ✅ COMPLETE

### Goal

Responder: "quanto isso impacta?"

### Deliverables

* quantified value cases with ranges (`packages/impact/`) ✅
* confidence bands ✅
* scaling via business profile ✅
* profile confidence penalty based on staleness and drift ✅
* impact types: revenue_uplift, chargeback_reduction, churn_reduction, trust_conversion_uplift, traffic_waste_avoidance ✅

---

## Phase 9 — Verification Layer (controlled execution) ✅ COMPLETE

### Goal

Adicionar precisão sem explodir custo.

### Deliverables

* verification lifecycle (`packages/verification-lifecycle/`) ✅
* verification economics (`packages/verification-economics/`) ✅
* browser verification with Playwright (`workers/verification/`) ✅
* authenticated SaaS runtime (`workers/verification/authenticated-runtime.ts`) ✅
* verification types: reuse_only, light_probe, browser_verification, integration_pull, authenticated_journey_verification ✅

### Constraints (preserved)

* sempre via policy
* nunca direto do MCP

---

## Phase 10 — Advanced ingestion ✅ COMPLETE

### Goal

Aumentar cobertura.

### Deliverables

* nuclei integration (`workers/nuclei/`, `packages/nuclei-adapter/`) ✅
* katana deep discovery (`workers/katana/`, `packages/katana-adapter/`) ✅
* brand intelligence (`workers/brand-intel/`, `packages/brand-adapter/`) ✅
* technology registry (`packages/technology-registry/`) ✅
* behavioral intelligence (`packages/behavioral/`) ✅
* inline script analysis, structured data, network analysis ✅
* mobile verification ✅
* change detection with versioned snapshots (`packages/change-detection/`) ✅

---

## Phase 11 — Integrations ✅ PARTIALLY COMPLETE

### Goal

Melhorar precisão econômica.

### Deliverables

* Shopify integration (`workers/shopify/`, `packages/shopify-adapter/`) ✅
* Shopify store metrics evidence type ✅

### Pending

* Ads platform integrations
* Additional commerce platform integrations

---

## Phase 12 — UX & surfaces expansion ✅ PARTIALLY COMPLETE

### Deliverables

* Actions page (primary surface) ✅
* Workspace list + detail views (`app/workspaces/[id]/`) ✅
* Chat interface ✅
* Analysis page ✅
* Inventory page ✅
* Use-case maps (`app/maps/`, `packages/maps/`) ✅
* Onboarding flow ✅
* Billing (Paddle primary, Stripe fallback) ✅
* Admin panel (organizations, environments, pricing, errors, usage, system health) ✅
* Settings (data sources, SaaS access) ✅
* Members management ✅
* Dual domain (vestigio.io marketing + app.vestigio.io app) ✅

### Pending

* Dashboards realtime
* Advanced filters

---

## What NOT to do (critical)

* não começar por MCP
* não começar por UI
* não integrar tudo desde o início
* não usar browser automation no core inicial
* não misturar control plane com engine
* não criar “super crawler” antes de ter decisões

---

## Initial slice definition (MANDATORY)

Primeira entrega completa deve ser:

```text
Input:
- domain

System:
- ingestion (basic)
- evidence
- graph
- signals
- inference
- decision (scale_readiness)

Output:
- preflight result
- 1 decisão clara
- resposta via MCP
```

Se isso funcionar → o sistema está correto.

---

## Actual repo structure

```text
/apps
  /platform      (control plane services)
  /mcp           (cognitive layer)

/packages
  /domain        /evidence       /graph          /signals
  /inference     /decision       /risk           /intelligence
  /classification /projections   /workspace      /impact
  /plans         /maps           /suppression    /truth
  /change-detection              /verification-lifecycle
  /verification-economics        /behavioral
  /technology-registry           /brand-adapter
  /nuclei-adapter                /katana-adapter
  /shopify-adapter               /actions

/workers
  /ingestion     /verification   /brand-intel
  /nuclei        /katana         /shopify

/src
  /app/(site)    — marketing (vestigio.io)
  /app/app       — authenticated app (app.vestigio.io)
  /app/api       — API routes
  /libs          — Redis, rate limiter, plan config
  /paddle        — Paddle billing (primary)
  /stripe        — Stripe billing (fallback)
```

---

## Build order (actual — all complete unless noted)

1. contracts ✅
2. ingestion (basic) ✅
3. evidence store (in-memory + PostgreSQL) ✅
4. graph ✅
5. signals ✅
6. inference ✅
7. decision (multi-pack: scale_readiness, revenue_integrity, chargeback_resilience, saas_growth_readiness) ✅
8. projections (findings, actions, workspaces, change reports) ✅
9. MCP / Chat (3-layer pipeline, playbooks, conversation memory) ✅
10. incidents/opportunities ✅
11. value engine ✅
12. verification (browser, authenticated SaaS) ✅
13. advanced ingestion (nuclei, katana, brand intel, behavioral) ✅
14. integrations (Shopify done, others pending)
15. Redis integration (job queue, rate limiting) ✅
16. change detection ✅
17. dual domain routing ✅
18. billing (Paddle primary, Stripe fallback) ✅

---

## Exit criteria per phase

Cada fase só termina quando:

* outputs são utilizáveis
* contracts são respeitados
* nenhuma camada vazou responsabilidade

---

## Final principle

Se em algum momento o sistema:

* vira crawler-first
* vira dashboard-first
* vira AI-agent-first

→ você saiu do caminho certo.

Voltar para:

**decision-first, dataset-first, execution-second**
