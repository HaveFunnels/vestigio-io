# Product Model

## Product thesis

Vestigio deve ser entendido como:

**um intelligence product que responde perguntas de negocio sobre funcionamento digital, risco comercial e upside operacional com alta explicabilidade**

Nao e:

- um scanner de vulnerabilidades genericamente empilhado
- uma tabela de findings como produto final
- um pixel-dependent analytics suite
- um "AI agent" sem substrate de evidence

## Unit of value

A unidade primaria de valor do produto e:

**uma decisao defendavel para uma pergunta de negocio material**

Essa decisao deve dizer:

- o que esta acontecendo
- por que acreditamos nisso
- qual o impacto provavel
- o que fazer agora
- como confirmar fechamento

## Product promise

O usuario quer saber:

- se o site/funil esta funcional para operar e escalar
- onde esta deixando dinheiro na mesa
- o que aumenta chargeback, churn, perda de atribuicao ou desperdicio de trafego
- o que merece prioridade agora

Vestigio responde isso por:

- evidence confiavel
- decisions centralizadas
- incidents e opportunities priorizados
- explicabilidade pronta para chat e dashboard

## Product surfaces

| Surface | Primary question | Primary object |
|---|---|---|
| Chat | "o que importa agora?" | `decision` |
| Dashboard | "qual e o estado do workspace?" | decision aggregates |
| Findings table | "qual o detalhe tecnico?" | `finding` projection |
| Incidents | "o que esta quebrando, vazando ou bloqueando?" | `incident` |
| Opportunities | "onde ha upside plausivel?" | `opportunity` |
| Preflight | "posso lancar ou escalar esta rota?" | readiness decisions |
| Use-case maps | "como estou em cada pergunta de negocio?" | decision packs |
| Workspace summary | "qual o estado geral dos ambientes?" | portfolio summary |

## Decision packs

Decision packs sao agrupamentos de respostas que organizam o produto por pergunta de negocio, nao por modulo tecnico.

Packs iniciais:

| Pack | Primary question |
|---|---|
| `scale_readiness_pack` | e seguro escalar trafego? |
| `launch_readiness_pack` | esta rota/landing esta pronta? |
| `revenue_integrity_pack` | ha vazamento de receita ou atribuicao? |
| `chargeback_resilience_pack` | a experiencia aumenta chargeback? |
| `trust_and_conversion_pack` | ha friccao ou ausencia de confianca com impacto em conversao? |
| `measurement_confidence_pack` | a instrumentacao esta suficiente para otimizar? |

## User-question mapping

| User question | Canonical decision outputs |
|---|---|
| "Posso subir trafego?" | `unsafe_to_scale_traffic`, `launch_blocked`, supporting preflight |
| "Onde estou perdendo dinheiro?" | `revenue_leakage_detected`, `opportunity` list, path-specific incidents |
| "Meu checkout esta seguro o suficiente?" | `high_chargeback_risk`, `checkout_trust_fragility` |
| "O que eu arrumo primeiro?" | incident priority queue + top opportunities |
| "Quanto isso pode impactar?" | `value_case` with range and confidence |
| "Por que voce esta dizendo isso?" | evidence refs + graph explanation + confidence |

## Incidents vs opportunities

### `incident`

Use para:

- downside material
- regressao
- bloqueio operacional
- causa-raiz que agrega varios findings

Caracteristicas:

- lifecycle operacional
- prioridade e owner possiveis
- foco em risco, perda ou bloqueio

### `opportunity`

Use para:

- upside plausivel
- uplift hypothesis defendavel
- melhoria priorizavel sem exigir existencia de bug critico

Caracteristicas:

- `value_case`
- prioridade por upside x esforco
- confidence de upside, nao apenas de risco

## Opportunity engine

Vestigio nao deve focar so em risco.

`opportunity` precisa de contrato proprio:

| Field | Meaning |
|---|---|
| `opportunity_key` | tipo de upside |
| `subject_ref` | rota, landing, checkout path, environment |
| `uplift_hypothesis` | que ganho esperado existe |
| `raw_upside_score` | intensidade plausivel do upside |
| `upside_confidence_score` | confianca da estimativa |
| `value_case` | faixa de impacto |
| `effort_hint` | custo relativo estimado |
| `priority` | ranking operacional |

Exemplos grounded na analise atual:

- reduzir handoff externo na rota de checkout
- aumentar trust assets perto da conversao
- melhorar alinhamento entre CTA e destino real
- reduzir friccao em lead capture / WhatsApp handoff

## Value estimation philosophy

Vestigio deve estimar valor com disciplina.

### Rules

- usar **ranges**, nunca ponto unico
- exibir **confidence band**
- declarar `basis_type`: `heuristic`, `mixed`, `data_driven`
- usar business profile para escalar estimativas
- evitar promessas agressivas sem dados externos confiaveis

### Impact types

- `revenue_uplift`
- `chargeback_reduction`
- `churn_reduction`
- `trust_conversion_uplift`
- `traffic_waste_avoidance`

### Inputs

- conversion proximity
- business model
- monthly revenue / ticket range
- traffic plan
- current downside severity
- behavioral evidence when available

### Guardrails

- sem business profile: limitar a estimativa a ranges amplos e linguagem conservadora
- sem evidence suficiente: mostrar upside qualitativo, nao quantitativo
- sem freshness adequada: degradar confidence do `value_case`

## Onboarding and business profile

Onboarding nao e detalhe de CRM; e input de intelligence.

Business profile deve capturar ao menos:

- business model
- monthly revenue band
- average ticket band
- chargeback/churn band quando aplicavel
- traffic plans
- growth goals
- platform/provider hints

Esse perfil alimenta:

- impact engine
- prioritization
- recommendation tone
- opportunity sizing

## Chat as product surface

Chat nao e apenas camada de UX.

Chat deve operar como interface principal para:

- perguntas diretas de negocio
- drill-down por decision
- solicitacao de verificacao adicional
- resumo de incident/opportunity
- explicacao de confidence e freshness

Resposta ideal do chat:

- decisao curta
- por que
- impacto
- proxima acao
- opcionalmente: pedir verificacao adicional quando necessario

## What the product is

- decision-first
- dataset-first
- phased enrichment
- explainable by design
- modular na execucao

## What the product is not

- collection-first product
- dashboard-only analytics tool
- static checklist generator
- all-knowing AI without explicit evidence contracts

## Lifecycle model

### Decision lifecycle

- created
- confirmed
- stale
- resolved
- regressed

### Incident lifecycle

- opened
- acknowledged
- mitigated
- verified
- closed

### Opportunity lifecycle

- identified
- sized
- accepted
- implemented
- verified
- archived

## Open Questions

- O launch deve expor `opportunity` como superficie de primeira classe desde o dia zero, ou inicialmente como secao secundaria dentro de decision packs?
- O `value_case` inicial sera exibido como impacto monetario, percentual ou ambos, dado o nivel de confianca esperado nos primeiros ciclos?
- Quais decision packs precisam ser visiveis na navegacao principal do produto na fase 1, e quais podem permanecer apenas como agrupamentos internos?
