# Decision Engine

## Purpose

Transformar Vestigio de:

- checklist de issues

para:

- mecanismo que responde perguntas de negocio com decisoes explicaveis, priorizadas e acionaveis

O foco do produto deixa de ser "o que esta errado no HTML" e passa a ser:

- o que esta arriscando crescimento
- o que esta vazando receita
- o que esta elevando chargeback/churn/perda de atribuicao
- o que representa upside material

## Canonical flow

```text
evidence
  -> signals
  -> inferences
  -> risk/opportunity evaluation
  -> decision
  -> action policy
  -> output projections
```

## Business-question model

Decisoes devem existir porque uma pergunta de negocio existe.

Perguntas canonicas iniciais:

- `is_it_safe_to_scale_traffic?`
- `is_this_landing_launch_ready?`
- `is_there_revenue_leakage_in_high_intent_paths?`
- `is_checkout_trustworthy_enough?`
- `is_chargeback_pressure_elevated?`
- `is_measurement_good_enough_to_optimize?`
- `is_there_upside_in_conversion_or_trust_friction?`

## Decision contract

```yaml
decision:
  decision_key: unsafe_to_scale_traffic
  question_key: is_it_safe_to_scale_traffic
  subject_ref: environment:prod-main
  cycle_ref: audit_cycle:456
  status: negative
  category: risk
  confidence_score: 74
  freshness_state: fresh
  raw_risk_score: 81
  raw_upside_score: null
  effective_severity: high
  decision_impact: block_launch
  primary_outcome: incident
  why:
    signals: []
    inferences: []
    evidence_refs: []
    gates: []
  actions:
    primary: ""
    secondary: []
    verification: []
  value_case:
    impact_type: traffic_waste_avoidance
    basis_type: heuristic
    range_low: null
    range_mid: null
    range_high: null
  projections:
    findings: []
    incidents: []
    opportunities: []
    preflight_checks: []
```

## Decision classes

| Class | Meaning | Example |
|---|---|---|
| `risk` | downside material ou potencial | `unsafe_to_scale_traffic` |
| `gate` | permissao/bloqueio operacional | `launch_blocked` |
| `opportunity` | upside plausivel e priorizavel | `trust_conversion_uplift_available` |
| `state` | situacao explicativa sem urgencia de acao | `measurement_partial_but_usable` |

## Signal to decision model

### Stage 1. Evidence reuse first

O engine sempre tenta responder com:

- evidence do ciclo atual
- ultimo behavioral aggregate fresco
- snapshots de integracao ainda validos
- business profile do workspace

### Stage 2. Signals

Fatos locais como:

- `checkout.mode = hosted`
- `provider_guess = stripe`
- `policy.refund.present = false`
- `journey.checkout_dropoff = high`
- `measurement.coverage = shallow`

### Stage 3. Inferences

Interpretacoes compostas como:

- `commerce_context = true`
- `trust_boundary_crossed = true`
- `policy_gap = high`
- `attribution_leak_likely = true`
- `upside_from_same_domain_checkout = medium`

### Stage 4. Decision synthesis

O engine combina:

- `risk_evaluation`
- `confidence`
- `freshness`
- `business context`
- `suppression governance`

para produzir uma resposta canonicamente util.

## Incident and opportunity policy

### Quando uma decision vira `incident`

Criar `incident` quando:

- `decision_impact` for `fix_before_scale`, `block_launch` ou `incident`
- houver recorrencia/regressao
- houver blast radius em rota critica
- multiplos findings/inferences apontarem para mesma causa-raiz

Exemplos:

- checkout off-domain sem confianca e sem politicas
- medicao insuficiente para escalar
- journey com erro/loop em rota comercial critica

### Quando uma decision vira `opportunity`

Criar `opportunity` quando:

- existe upside plausivel sem depender de falha critica
- existe `value_case` minimamente defendavel
- a alavanca de melhoria e clara
- a acao nao deve ser escondida dentro de finding de risco

Exemplos:

- friccao de handoff com uplift estimado
- falta de trust assets proximos ao checkout
- lead form com desvio para WhatsApp e baixa instrumentacao

### Quando fica apenas como supporting detail

- baixa severidade
- baixa confianca
- baixo valor esperado
- duplicado de outra causa-raiz mais forte

## Root-cause collapse

Multiplos achados devem colapsar em uma mesma decisao quando compartilham failure mode.

Exemplo:

- redirect hops altos
- off-domain handoff
- provider desconhecido
- policy coverage fraca

Podem colapsar em:

- `checkout_trust_and_conversion_fragility`

Isso reduz ruido e melhora explainability.

## Action policy

Toda decisao deve produzir tres niveis:

### 1. Primary action

Acao unica que melhor reduz downside ou captura upside.

### 2. Secondary actions

Lista ordenada de remediacoes ou melhorias.

### 3. Verification actions

Como provar fechamento ou confirmar hipotese.

## Prioritization policy

Prioridade deve combinar:

- `decision_impact`
- `effective_severity`
- `confidence_score`
- `conversion_proximity`
- `blast_radius`
- `value_case`
- `regression_or_recurrence`
- `operator_effort`

### Conversion proximity order

Preservar a heuristica atual:

1. checkout/billing
2. pricing/cart
3. login/account
4. lead capture/contact
5. product/home

## Product-surface projections

| Surface | What it shows | Primary unit |
|---|---|---|
| Chat | direct answer + why + next step | decision |
| Dashboard | portfolio summary and deltas | decision summary |
| Findings table | supporting details and filters | finding |
| Incident board | active downside states | incident |
| Opportunity board | prioritized upside states | opportunity |
| Preflight | readiness lens for selected landing | decision subset |
| Use-case map | grouped answers by business question | decision pack |
| Workspace summary | cross-environment health and value | decision aggregate |

## Decision packs

Decisoes devem poder ser agrupadas em pacotes coerentes para UX.

Pacotes iniciais:

- `scale_readiness_pack`
- `revenue_integrity_pack`
- `chargeback_resilience_pack`
- `measurement_confidence_pack`
- `trust_and_conversion_pack`

## Execution bridge

O decision engine nao sai executando tudo.

Ele pede verificacao adicional apenas quando:

- confidence insuficiente bloqueia resposta importante
- freshness critica expirou
- custo esperado de erro e alto
- valor economico esperado justifica mais evidencias

Verificacoes possiveis:

- `reuse_only`
- `light_probe`
- `browser_verification`
- `integration_pull`
- `refuse_or_defer`

## Freshness policy

Toda decisao deve carregar:

- `freshness_state`
- `staleness_reason`
- `max_safe_age`
- `refresh_recommendation`

Regras:

- evidence stale pode degradar decisao, nao apenas escondela
- preflight pode reutilizar ultimo estado completo com badge `stale`
- journey, provider and integration inferences precisam TTLs proprios

## False-positive governance

Antes de promover incident/opportunity, o engine deve considerar:

- `suppression_rule`
- trusted-provider allowlist
- environment exclusions
- duplicate-cause collapse
- evidence dispute or manual override

## Examples

### Example 1. Unsafe to scale traffic

Inputs:

- `measurement.coverage = shallow`
- `checkout_trust_fragility = true`
- `preflight blocker = true`

Decision:

- `unsafe_to_scale_traffic`
- class: `risk`
- impact: `block_launch`
- output: `incident`

### Example 2. High chargeback risk

Inputs:

- `checkout_integrity_risk = 76`
- `support_refund_risk = 71`
- trusted policy evidence weak

Decision:

- `high_chargeback_risk`
- impact: `fix_before_scale`
- output: `incident + defense view`

### Example 3. Revenue leakage detected

Inputs:

- trust boundary crossed on conversion path
- redirect friction high
- attribution continuity weak

Decision:

- `revenue_leakage_detected`
- impact: `fix_before_scale`
- output: `incident`

### Example 4. Opportunity available

Inputs:

- same-domain route exists
- trust assets absent near conversion
- business profile indicates meaningful paid traffic

Decision:

- `trust_conversion_uplift_available`
- class: `opportunity`
- output: `opportunity`

## Rewrite contract

### Modules may emit

- evidence
- signals
- local inferences
- local confidence
- recommended verification hints

### Modules may not own

- final decision semantics
- global prioritization
- workspace-level action ordering
- incident/opportunity lifecycle

## Implementation Status (2026-04-02)

### Decision status projection

Decision status (`created`, `confirmed`, `stale`, `resolved`, `regressed`) is now projected to the frontend via `ActionProjection.decision_status` (`packages/projections/types.ts`). Each action card in the UI carries the lifecycle state of its backing decision, enabling operators to distinguish between fresh, confirmed, and degraded decisions at a glance.

### Change detection in projections

Change detection feeds into the projection layer through `ChangeReportProjection` (`packages/projections/types.ts`). The `ProjectionResult` includes a `change_report` field containing regressions, improvements, new issues, resolved items, and overall trend. `WorkspaceProjection` also carries a `change_summary` with trend, regression count, improvement count, and resolved count.

### Verification maturity in projections

Verification maturity is projected alongside decisions and findings:

- `ActionProjection.verification_maturity`: `unverified | pending | partially | verified | degraded | stale`
- `FindingProjection.verification_maturity`: same enum, surfaced per finding
- `ActionProjection.resolve_path`: `fix | verify | track | dismiss` — suggested resolution path based on verification state and decision lifecycle

## Open Questions

- O primeiro release de `opportunity` deve compartilhar exatamente o mesmo workflow de `incident`, ou precisa de um lifecycle mais leve desde o inicio?
- A UX inicial vai expor `decision packs` explicitamente ao usuario, ou apenas usara esses agrupamentos internamente para dashboards/chat?
- Quais decisoes precisam ser sempre reavaliadas em modo incremental quando o plano tiver `continuous_audits_is_enabled`, alem de `measurement`, `journey` e `operational state`?
