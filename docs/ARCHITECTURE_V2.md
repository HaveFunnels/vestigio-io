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

### Responsibilities

- workspace and user management
- plan entitlements
- environment registry
- onboarding and business profile capture
- scheduling policy
- notifications and workflow states

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

### Canonical stores

- cycle store
- evidence store
- graph store
- artifact store
- freshness store

### Preserve

- `website_page_inventory`
- `website_surface_relations`
- behavioral journey tables
- cycle model

### Replace

- `audits.data` as intelligence hub
- radar-local copy tables as truth source

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

## Recommended repo/modules shape

```text
control-plane/
engine/
  ingestion/
  evidence/
  intelligence/
  decision/
  projections/
  workers/
mcp/
shared-contracts/
```

## Primary flows

### Flow 1. Full audit cycle

- orchestrator creates cycle
- ingestion collects
- evidence normalizes
- intelligence derives signals/inferences
- decision layer answers questions
- projections update UI/chat surfaces

### Flow 2. Incremental refresh

- heartbeat/pixel/integration event arrives
- entitlement gate checks `continuous_audits_is_enabled`
- incremental evidence updates freshness-bound slices
- only affected decisions are recomputed

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

## Open Questions

- A primeira fase do rewrite precisa suportar um engine fisicamente separado do control plane em repos/processos distintos, ou o isolamento logico com boundaries fortes ja basta?
- `browser_verification` sera executado dentro do mesmo runtime operacional do audit ou em worker pool dedicado desde o inicio?
- Qual projeção sera considerada o read model prioritario no launch: workspace summary, incident board ou chat-first surface?
