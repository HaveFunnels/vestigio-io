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

## Recommended repository structure

```text
apps/
  control-plane/
  engine-api/
  mcp-service/

packages/
  contracts/
  evidence/
  graph/
  intelligence/
  decision/
  projections/
  business-profile/
  integrations/
  verification/

workers/
  audit-orchestrator/
  ingestion-worker/
  projection-worker/
  verification-worker/
```

## Boundary definitions

### `control-plane`

Owns:

- auth
- workspaces
- plans and entitlements
- billing
- environment registry
- onboarding flows
- human workflow states

Does not own:

- inference rules
- risk logic
- evidence semantics
- graph traversals

### `engine-api`

Owns:

- cycle orchestration entrypoints
- typed reads for decisions/evidence
- verification request API
- projection APIs for UI/chat

### `mcp-service`

Owns:

- conversational contracts
- tool/resource layer
- execution policy facade
- explainability composition

Does not own:

- decision semantics
- direct collection logic

### `packages/contracts`

Owns canonical schemas for:

- evidence
- signal
- inference
- risk_evaluation
- decision
- incident
- opportunity
- value_case
- verification_request
- suppression_rule

### `packages/evidence`

Owns:

- typed evidence persistence
- freshness metadata
- provenance handling

### `packages/graph`

Owns:

- evidence graph model
- graph query contracts
- path traversal helpers

### `packages/intelligence`

Owns:

- shared domain services
- signal extraction
- local inference synthesis

### `packages/decision`

Owns:

- business question definitions
- risk/upside normalization
- action prioritization
- incident/opportunity promotion

### `packages/projections`

Owns:

- findings projection
- workspace summary
- preflight projection
- incident board projection
- opportunity board projection
- decision pack projection

### `packages/business-profile`

Owns:

- onboarding profile schema
- calibration helpers for impact/value estimation

### `packages/integrations`

Owns:

- adapter contracts
- external snapshot normalization
- source trust metadata

### `packages/verification`

Owns:

- verification request lifecycle
- policy for `light_probe`, `browser_verification`, `integration_pull`

## Worker model

### `audit-orchestrator`

Responsibilities:

- create cycles
- enforce plan gates
- drain outbox
- schedule ingestion and verification

Grounding:

- preserve the spirit of `cron/audits`

### `ingestion-worker`

Responsibilities:

- execute core audit collection
- run allowed probes
- ingest heartbeat/pixel/integration payloads

### `projection-worker`

Responsibilities:

- compute read models for dashboard/chat
- refresh decision packs and summaries

### `verification-worker`

Responsibilities:

- execute approved verification requests
- feed results back as evidence

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

## Suggested build order

### Phase 1. Contracts and core stores

- canonical schemas
- cycle store
- evidence store
- business profile store
- suppression store

### Phase 2. Graph and shared intelligence

- graph model
- route classification
- platform/provider inference
- trust boundary and policy services

### Phase 3. Decision engine

- question registry
- risk engine
- opportunity sizing baseline
- incident/opportunity promotion

### Phase 4. Core projections

- findings
- workspace summary
- preflight
- incident board
- opportunity board

### Phase 5. MCP

- resources
- tools
- explainability composition
- verification request bridge

### Phase 6. Advanced enrichment

- browser verification
- richer external integrations
- economic estimation refinement

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

## Open Questions

- O rewrite vai nascer em monorepo unico com boundaries fortes ou em repos separados por `control-plane`, `engine` e `mcp`?
- Qual package deve ser dono inicial das taxonomias de business questions e decision packs: `packages/decision` ou `packages/contracts`?
- O primeiro milestone precisa migrar todos os radars de uma vez, ou um caminho por `shared intelligence services -> one decision pack at a time` e aceitavel?
