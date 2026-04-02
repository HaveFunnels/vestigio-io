# Evidence Graph

## Purpose

Definir o modelo canonico do evidence graph do rewrite.

O graph existe para:

- unificar estrutura do site, handoffs comerciais e comportamento observado
- sustentar discovery, checkout detection, journey inference, preflight e explainability
- reduzir recomputacao paralela
- dar substrate consultavel ao decision engine e ao MCP

## Core idea

`website_surface_relations` e o embriao do graph estrutural atual.

Em V2, o graph passa a unir:

- **structural graph**
- **trust/commercial overlay**
- **behavioral overlay**
- **decision references**

## Node model

### Structural nodes

| Node type | Description | Current source |
|---|---|---|
| `workspace` | tenant boundary for portfolio queries | rewrite |
| `environment` | scoped monitored environment | rewrite |
| `website` | root monitored website/domain | `websites` |
| `page` | normalized URL in inventory | `website_page_inventory` |
| `host` | normalized host/domain | relations and checkout domains |
| `endpoint` | form or checkout target URL | `form_action`, `intent_target` |
| `provider` | inferred payment/service provider | checkout/provider inference |
| `policy_document` | policy page instance | `chargeback_policy_pages` |
| `asset` | relevant script, iframe, stylesheet or third-party asset | relations payload |

### Behavioral nodes

| Node type | Description | Current source |
|---|---|---|
| `journey_node` | normalized runtime step | `behavioral_journey_nodes_daily` |
| `journey_exception` | error/friction point | `behavioral_journey_exceptions_daily` |
| `session_segment` | optional traffic slice | derived from runtime filters |

### Analytical nodes

| Node type | Description |
|---|---|
| `critical_route` | derived commercial path or landing scope |
| `decision_anchor` | optional reference node for explainability, not truth owner |

## Edge model

### Structural edges

Preservar os tipos relevantes do legado:

- `anchor`
- `form_action`
- `iframe_src`
- `script_src`
- `stylesheet_src`
- `redirect`
- `canonical_external`
- `intent_target`
- `runtime_navigation`
- `runtime_request`
- `runtime_checkout_handoff`

### Behavioral edges

- `journey_transition`
- `journey_loop`
- `exception_on_node`

### Context edges

- `belongs_to_environment`
- `belongs_to_workspace`
- `in_path_scope`
- `uses_provider`
- `references_policy`
- `affects_critical_route`

## Graph contract

### Edge payload

Cada edge deve carregar:

- `edge_type`
- `source_ref`
- `target_ref`
- `observation_scope`
- `confidence`
- `cycle_ref`
- `observed_at`
- `fresh_until`
- `evidence_ref`
- `metadata`

### Observation scopes

- `cycle`
- `live`
- `rolling_window`
- `integration_snapshot`

## Query model

O graph precisa responder pelo menos:

### 1. Commercial path query

"Deste landing/path, quais paginas, redirects, forms e handoffs levam a conversao?"

Usado por:

- revenue intelligence
- preflight
- chat

### 2. Checkout posture query

"Quais paginas conectam com checkout-like endpoints, por quais relacoes, e com qual provider/host?"

Usado por:

- chargeback intelligence
- preflight

### 3. Trust boundary query

"Onde a rota deixa o dominio esperado, com que confianca, e para onde?"

Usado por:

- revenue intelligence
- chargeback intelligence
- fraud/brand overlays

### 4. Journey bottleneck query

"Quais nodes/edges tem maior dropoff, erro, loop ou abandono?"

Usado por:

- journey UX
- decision engine
- MCP explainability

### 5. Critical route coverage query

"Quais rotas criticas sao conhecidas, observadas, medidas e ligadas a conversao?"

Usado por:

- discovery
- readiness decisions
- measurement decisions

### 6. Environment separation query

"Este asset/host/path pertence ao mesmo environment comercial ou atravessa boundary indevido?"

Usado por:

- scoping
- false-positive avoidance
- control plane governance

## Graph layers

```text
Layer 1: topology
  pages, hosts, endpoints, redirects, forms, assets

Layer 2: trust/commercial overlay
  provider guess, policy presence, internal/external, trust boundary

Layer 3: behavioral overlay
  visits, transitions, dropoffs, loops, errors

Layer 4: decision references
  affected paths, blast radius, supporting evidence anchors
```

## Classification rules

### Internal vs external

Default:

- root-domain comparison

Exceptions:

- known PSPs continuam externos estruturalmente, mas podem ser tratados como trusted handoff
- lookalike domains e suspicious providers anulam essa suavizacao
- environment allowlists podem autorizar subdominios/hosts externos operacionais

### Confidence

Structural confidence:

- `static`
- `confirmed`
- `runtime_observed`

Behavioral confidence:

- volume adequacy
- recency
- ingestion trust

## Freshness policy

Todo node/edge derivado deve carregar TTL/freshness quando a observacao for volatil.

Exemplos:

- `journey_transition` tem TTL curto
- `redirect` estatico pode ter TTL longo
- `provider` guessed em script checkout pode expirar mais rapido que pagina conhecida

## How decisions use the graph

Decision engine nao consulta HTML solto quando o graph ja respondeu a relacao.

Exemplos:

- `unsafe_to_scale_traffic` consulta trust boundary e critical route coverage
- `high_chargeback_risk` consulta checkout posture e policy adjacency
- `revenue_leakage_detected` consulta handoff friction e journey bottlenecks

## How MCP uses the graph

MCP deve usar o graph para:

- explicar caminhos
- responder "onde esta o problema?"
- justificar verificacoes adicionais
- evitar probes redundantes

## Current redundancies the graph must eliminate

- mesma logica de same-domain vs off-domain em Chargeback, Revenue Leak e Preflight
- reconstrucao repetida de path comercial
- provider inference contextual duplicada
- critical page linking repetido por modulo

## Rewrite contract

Preservar:

- relation kinds
- runtime overlays
- cycle scoping
- critical-path orientation

Adicionar explicitamente:

- workspace/environment scoping
- freshness metadata
- query contract para decision engine e MCP

Substituir:

- blobs de contexto por radar
- relation summarizers locais
- consultas ad hoc inconsistentes

## Open Questions

- O launch precisa de armazenamento de graph materializado dedicado, ou uma projection relacional/indexada sobre evidence typed ja cobre os queries iniciais?
- `decision_anchor` precisa existir como node proprio no graph, ou references em tabelas auxiliares bastam para explainability?
- Qual profundidade maxima de path traversal sera aceita por default para queries de MCP sem disparar verificacao adicional?
