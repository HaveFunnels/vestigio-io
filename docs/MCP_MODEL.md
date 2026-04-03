# MCP Model

## Purpose

Definir o papel do MCP como:

**interface cognitiva e camada controlada de execucao para responder perguntas de negocio sobre o workspace**

MCP nao substitui o decision engine. Ele:

- consome decisions, evidence e projections
- organiza contexto para chat
- solicita verificacao adicional quando necessario
- opera com guardrails de custo, escopo e seguranca

## Position in the system

```text
User / Chat UI
  -> MCP
    -> read models
    -> decision engine
    -> evidence graph
    -> verification policy
    -> engine execution adapters
```

## MCP responsibilities

- interpretar intencao do usuario
- localizar decisions e evidence relevantes
- responder com linguagem de produto, nao com blobs tecnicos
- decidir quando basta reutilizar dados existentes
- abrir `verification_request` quando confidence/freshness exigir
- manter coerencia entre surfaces

## MCP primitives

### Resources

Objetos de leitura para contexto estavel.

Exemplos:

- workspace summary
- environment summary
- decision pack views
- incident board
- opportunity board
- preflight view
- evidence graph slices

### Tools

Operacoes controladas.

Implemented tools:

- `get_finding_projections` — get finding projections with impact summaries
- `get_action_projections` — get action projections with priority and categorization
- `get_workspace_projections` — get workspace projections with scoped findings
- `get_change_report` — **get cycle-to-cycle change report: regressions, improvements, new issues, resolved items, and overall trend**
- `get_map` — get a specific map definition (revenue_leakage, chargeback_risk, root_cause)
- `get_preflight_status` — get preflight readiness evaluation
- `request_verification` — trigger browser or probe verification (expensive, budget-limited)
- `answer_can_i_scale` — answer the "can I scale traffic?" question
- `answer_where_losing_money` — answer the "where am I losing money?" question

Planned tools:

- `get_decision_pack`
- `get_decision_explainability`
- `get_graph_path`
- `list_incidents`
- `list_opportunities`

### Prompts

Templates de raciocinio e resposta.

Devem orientar:

- answer-first
- cite confidence/freshness
- dont invent missing evidence
- prefer reuse over execution

## Execution policy

MCP segue uma escada de custo/incerteza.

### Level 0. Reuse existing evidence

Use quando:

- decision fresca ja existe
- evidence supporting a pergunta esta adequada
- custo de erro e baixo ou confidence ja e suficiente

### Level 1. Recompute from existing evidence

Use quando:

- precisamos de nova projection ou agregacao
- nao ha necessidade de coleta adicional

### Level 2. Light probe

Use quando:

- falta confirmar um ponto estrutural simples
- custo e baixo
- a diretiva permite coleta via audit pipeline

Nao e chamado diretamente pelo MCP; MCP abre `verification_request`.

### Level 3. Browser verification

Use quando:

- relacao estrutural nao basta
- a pergunta depende de comportamento real do browser
- checkout/journey/trust handoff precisam confirmacao runtime

### Level 4. Integration pull

Use quando:

- valor esperado depende de dado externo
- business profile e insuficiente
- integracao pode reduzir muito a incerteza

### Level 5. Refuse or defer

Use quando:

- custo supera valor esperado
- escopo nao esta autorizado
- environment e ambiguo
- confidence nao pode subir de forma segura

## Reuse-first contract

MCP deve sempre perguntar, nesta ordem:

1. Ja existe decisao fresca para isso?
2. Ja existe evidence suficiente para recalcular?
3. Vale a pena pedir verificacao?
4. A verificacao esta dentro do custo e da politica do plano?
5. Se nao, devo responder com caveat ou recusar?

## When to use probes

`light_probe` e apropriado para:

- confirmar status HTTP, redirect ou SSL
- validar existencia de endpoint/landing critica
- verificar relacao estrutural simples

`browser_verification` e apropriado para:

- checkout runtime handoff
- navegacao JS-dependent
- formularios e thank-you path ambigua
- friccao que depende do browser

## Integration triggers

Pedir integracao externa quando:

- usuario quer estimativa economica mais forte
- chargeback/churn/revenue ranges estao muito amplos
- ha gap entre heuristica e dado real de negocio

Nao pedir integracao quando:

- a pergunta ja pode ser respondida utilmente sem ela
- o ganho de confianca esperado e baixo

## Relationship with decision engine

Decision engine:

- produz a verdade de negocio
- define impacto, confidence, freshness e acoes

MCP:

- consulta essa verdade
- monta narrativas de produto
- aciona verificacao dentro das politicas

MCP nao pode criar decisao fora do contrato central.

## Relationship with chat

Chat consome MCP, nao chama camadas internas diretamente.

Resposta de chat ideal:

- `answer`
- `confidence`
- `freshness`
- `why`
- `recommended_next_step`
- `optional_verification`

### Chat content block system

Chat responses are composed of typed content blocks rendered by `ChatMessageRenderer`:

| Block type | Description |
|---|---|
| `markdown` | Formatted text response |
| `tool_call` | Spinner/checkmark with label, duration, expandable result |
| `finding_card` | Inline finding card with severity, impact, pack |
| `action_card` | Inline action card with priority, savings estimate |
| `impact_summary` | Revenue impact visualization |
| `confidence` | Confidence badge |
| `navigation_cta` | **Buttons directing user to relevant surfaces** (Actions, Maps, Analysis, Workspaces) |
| `suggested_prompts` | Clickable follow-up question pills, **including change-related prompts** |
| `create_action` | Editable form to save as action |
| `quote` | Blockquote with source |
| `data_rows` | Key-value table with severity badges |

### Navigation CTA blocks

`navigation_cta` blocks allow MCP responses to direct users to the appropriate surface for action. Each target has:

- `label` — button text
- `href` — destination route
- `variant` — primary / secondary / ghost

This closes the loop between cognitive interface (Chat) and operational surfaces (Actions, Workspaces, Maps).

### Change report awareness

When the user asks about changes, MCP uses `get_change_report` to fetch cycle-to-cycle data and surfaces:

- regressions, improvements, new issues, resolved items
- overall trend
- suggested follow-up prompts ("What regressed?", "Show resolved issues", "What new incidents appeared?")

## History and memory

MCP precisa de memoria suficiente para:

- lembrar contexto recente da conversa
- manter foco no workspace/environment atual
- referenciar incidents/opportunities discutidos

Nao deve usar memoria para:

- persistir overrides fora do control plane
- substituir source of truth de decisions

## Token and effort controls

Guardrails:

- preferir summaries e references em vez de payloads crus
- limitar profundidade de graph traversal por default
- limitar numero de objects trazidos ao chat
- pedir confirmacao implicita via UX antes de verificacoes custosas

## Safety and cost guardrails

- respeitar `continuous_audits_is_enabled`
- nao disparar coleta fora do orchestrator
- nao misturar environments
- nao ignorar suppressions e allowlists
- nao afirmar certeza alta com evidence stale

## MCP deliverables by surface

| Surface | MCP role |
|---|---|
| Chat | primary conversational interface with navigation CTAs and change report awareness |
| Actions page | data source for operational queue, change summary banner, category projections |
| Workspace detail | data source for findings, change timeline, trust strength, preflight readiness |
| Analysis / Findings | data source for finding projections with verification maturity |
| Preflight assistant | answer launch/traffic questions via checklist rendering |
| Maps | data source for map definitions (revenue_leakage, chargeback_risk, root_cause) |
| Change monitoring | `get_change_report` tool for cycle-to-cycle comparisons |

## Open Questions

- O launch do MCP deve expor apenas tools de leitura e `request_verification`, ou ja incluir acao de re-run audit explicitamente como ferramenta de usuario?
- `browser_verification` sera transparente para o usuario ou exigira sempre um passo de confirmacao visivel na interface?
- Qual nivel de memoria conversacional e aceitavel antes de haver risco de drift entre chat context e source of truth do engine?
