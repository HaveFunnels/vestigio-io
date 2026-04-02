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

## Phase 0 — Foundations (contracts only)

### Goal

Criar o esqueleto do sistema sem execução real.

### Scope

* domain contracts
* entity definitions
* type systems
* interfaces entre camadas

### Deliverables

* `audit_cycle`
* `evidence`
* `signal`
* `inference`
* `decision`
* `incident`
* `opportunity`
* `preflight_profile`

### Constraints

* sem crawler
* sem CLI tools
* sem MCP
* sem UI complexa

---

## Phase 1 — Evidence ingestion (minimal viable dataset)

### Goal

Ter dados reais mínimos para alimentar decisões.

### Scope

* HTTP fetch simples (guzzle-like, mas moderno)
* parsing básico de páginas
* descoberta inicial de:

  * homepage
  * checkout candidates
  * login/contact
* normalização em `evidence`

### Deliverables

* ingestion pipeline básico
* storage de evidence
* audit_cycle funcional

### Explicitly NOT included

* nuclei
* amass
* katana
* browser automation

---

## Phase 2 — Evidence graph (structural truth)

### Goal

Conectar evidence em relações úteis.

### Scope

* nodes:

  * page
  * host
  * path
  * checkout_path
* edges:

  * links
  * redirects
  * domain transitions

### Deliverables

* graph builder
* graph query layer
* path tracing básico

### Outcome

Agora você consegue responder:

> "como o usuário chega ao checkout?"

---

## Phase 3 — Signals + Inferences

### Goal

Transformar evidence em significado.

### Scope

* signals:

  * missing policy
  * external redirect
  * checkout ambiguity
  * weak trust surface
* inferences:

  * checkout_off_domain
  * trust_gap_near_conversion
  * broken flow possibility

### Deliverables

* signal engine
* inference engine
* confidence básico

---

## Phase 4 — Decision Engine (first pack)

### Goal

Responder uma pergunta real de negócio.

### Chosen pack

👉 `scale_readiness_pack`

### Scope

* decision creation
* risk evaluation
* decision impact
* linking evidence → decision

### Deliverables

Exemplos:

* `unsafe_to_scale_traffic`
* `fix_before_scale`
* `ready_with_risks`

### Outcome

Você já responde:

> "posso subir tráfego?"

---

## Phase 5 — Preflight (first product surface)

### Goal

Criar a primeira experiência clara pro usuário.

### Scope

* `preflight_profile`
* avaliação por ciclo
* readiness status
* blockers + risks

### Deliverables

* preflight result
* readiness scoring
* linkage com decisions

---

## Phase 6 — MCP (read-only intelligence)

### Goal

Permitir interação natural com o sistema.

### Scope

* tools:

  * get_decision_pack
  * get_preflight
  * list_incidents
* resposta estruturada:

  * answer
  * confidence
  * why
  * next step

### Constraints

* sem execução ativa
* sem browser
* sem integrations

---

## Phase 7 — Incidents & Opportunities

### Goal

Transformar decisões em ação.

### Scope

* incident creation rules
* opportunity engine básico
* value estimation (heuristic-based)

### Deliverables

* incident board
* opportunity board
* prioritização simples

---

## Phase 8 — Value Engine

### Goal

Responder:

> "quanto isso impacta?"

### Scope

* value ranges
* confidence bands
* scaling via business profile

---

## Phase 9 — Verification Layer (controlled execution)

### Goal

Adicionar precisão sem explodir custo.

### Scope

* verification_request
* light probes
* (opcional) browser verification

### Constraints

* sempre via policy
* nunca direto do MCP

---

## Phase 10 — Advanced ingestion (only now)

### Goal

Aumentar cobertura.

### Scope

* nuclei
* amass
* katana
* wp-scan
* platform detection avançado

---

## Phase 11 — Integrations (optional)

### Goal

Melhorar precisão econômica.

### Scope

* Stripe
* Shopify
* Ads platforms

---

## Phase 12 — UX & surfaces expansion

### Scope

* dashboards realtime
* use-case maps (react flow)
* advanced filters
* workspace segmentation UI

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

## Suggested repo structure (high-level)

```text
/apps
  /web          (control plane UI)
  /mcp          (cognitive layer)

/packages
  /domain
  /evidence
  /graph
  /signals
  /inference
  /decision
  /risk
  /preflight
  /value

/workers
  /ingestion
  /verification
```

---

## Build order (strict)

1. contracts
2. ingestion (basic)
3. evidence store
4. graph
5. signals
6. inference
7. decision (1 pack)
8. preflight
9. MCP (read-only)
10. incidents/opportunities
11. value engine
12. verification
13. advanced ingestion
14. integrations

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
