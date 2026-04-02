# Risk Engine

## Objective

Unificar todos os sistemas atuais de risco em um modelo canonico sem perder:

- nuance de confianca
- convergencia de sinais
- severidade efetiva
- diferenca entre risco, gate e impacto operacional

O rewrite tambem precisa deixar explicito que risco de downside e apenas metade do problema; upside sera modelado em paralelo, mas sem poluir a ontologia de risco.

## Canonical downside model

### 1. Raw risk

`raw_risk_score: 0..100`

Representa:

- intensidade do risco inferido antes de gates
- sempre avaliado por `subject + question`

### 2. Confidence

`confidence_score: 0..100`

Representa:

- quao defensavel e a inferencia
- qualidade, cobertura, recencia e consistencia das evidencias

Nao mede severidade.

### 3. Convergence

`convergence_score`

Representa:

- quantos sinais/inferences independentes apontam para o mesmo failure mode
- quao consistente e a convergencia

### 4. Effective severity

`effective_severity`

Enum canonico:

- `none`
- `low`
- `medium`
- `high`
- `critical`

Derivada de:

- `raw_risk_score`
- `confidence_score`
- `convergence_score`
- freshness
- gate policy

### 5. Decision impact

`decision_impact`

Enum canonico:

- `observe`
- `optimize`
- `fix_before_scale`
- `block_launch`
- `incident`

Isso responde o que o operador deve fazer, nao quao grave o risco parece isoladamente.

### 6. Gate result

`gate_result`

Campos:

- `passed`
- `downgraded`
- `blocked`
- `reasons[]`

## Canonical evaluation formula

```text
evidence
  -> signals
  -> inferences
  -> raw_risk_score

raw_risk_score
  + confidence_score
  + convergence_score
  + freshness penalties
  + suppression/allowlist context
  + business criticality
  -> effective_severity

effective_severity
  + business_profile
  + conversion_proximity
  + blast_radius
  -> decision_impact
```

## Canonical risk object

```yaml
risk_evaluation:
  subject_ref: "checkout_path:abc"
  question_key: "chargeback_risk"
  raw_risk_score: 78
  confidence_score: 72
  convergence_score: 3
  freshness_state: fresh
  gate_result:
    passed: true
    downgraded: false
    blocked: false
    reasons: []
  effective_severity: high
  decision_impact: fix_before_scale
  rationale:
    evidence_refs: []
    signals: []
    inferences: []
```

## Mapping current systems to canonical model

### Legacy audit severity

Current:

- `major`
- `moderate`
- `minor`

Mapping:

- `major` -> base severity `high`
- `moderate` -> `medium`
- `minor` -> `low`

Policy:

- legacy issues devem virar signals, supporting findings ou low-level checks
- nao devem permanecer ontologia paralela

### Radar scores

Current:

- scores 0..100 por radar/dimensao

Mapping:

- tornam-se `raw_risk_score`

### Finding severity

Current:

- `low/high/critical` e variantes

Mapping:

- normalizar para `effective_severity`

### Preflight status

Current:

- `ready`
- `ready_with_risks`
- `blocker`
- `na`

Policy:

- isso nao e escala de risco
- e projection de `decision_impact`

## Severity thresholds

| Raw risk | Base severity |
|---|---|
| 0-19 | none |
| 20-39 | low |
| 40-59 | medium |
| 60-79 | high |
| 80-100 | critical |

## Confidence policy

Confidence deve combinar:

- source trust
- coverage completeness
- recency
- evidence agreement
- behavioral volume adequacy
- provider/platform ambiguity

Indicacao operacional:

| Confidence | Interpretation |
|---|---|
| 0-29 | too weak to promote material decision |
| 30-49 | weak, explain with caution |
| 50-69 | usable with caveats |
| 70-84 | strong |
| 85-100 | very strong |

## Freshness penalties

Freshness precisa alterar risco efetivo quando a pergunta depende de evidencias volateis.

Exemplos:

- `provider inference` stale deve reduzir confidence
- `journey dropoff` stale nao deve bloquear lancamento automaticamente
- `checkout policy absence` em ciclo recente continua material
- `integration snapshot` stale pode impedir estimativa economica forte

## Composite risk model

Composite risks sao first-class.

Campos minimos:

- `composite_key`
- `component_signals[]`
- `component_inferences[]`
- `minimum_convergence`
- `raw_risk_formula`
- `gate_policy`

### Example: `broken_revenue_attribution`

Preservar o comportamento conceitual atual:

- tag manager volatility
- outbound leak
- measurement coverage fraca

Regra:

- exigir pelo menos 2 componentes materialmente coerentes

### Example: `shadow_checkout_processor`

Preservar:

- iframe/script domains desconhecidos na rota de checkout
- trust boundary risk
- checkout integrity ambiguity

## Subject model

Risco sempre precisa de sujeito explicito.

Tipos permitidos:

- `workspace`
- `environment`
- `website`
- `host`
- `page`
- `journey`
- `checkout_path`
- `preflight_profile`

## Business-context scaling

`decision_impact` pode subir sem alterar `raw_risk_score` quando:

- rota e muito proxima de conversao
- business profile indica trafego pago relevante
- ambiente e `production`
- incidencia e recorrente

Exemplo:

- um risco `medium` em pagina de checkout de producao com alto paid traffic pode virar `fix_before_scale`

## Separation from upside

Upside nao deve ser modelado como risco negativo.

Usar paralelo:

- `raw_upside_score`
- `upside_confidence_score`
- `opportunity_priority`

O `decision` e o ponto onde downside e upside convivem; o `risk_evaluation` continua semanticamente limpo.

## False-positive governance

Antes de promover severidade material, aplicar:

- provider allowlist
- environment allowlist
- manual suppression
- evidence dispute
- trusted external handoff policies

Regras:

- suppressao reduz exposicao e prioridade, nao apaga historico
- override deve ser auditavel

## Decision priority formula

Prioridade operacional sugerida:

```text
priority =
  f(decision_impact,
    effective_severity,
    confidence_score,
    conversion_proximity,
    blast_radius,
    recurrence,
    value_case,
    effort_hint)
```

## Preservation guidance

Preservar:

- score 0..100 como substrate util
- gates por confidence
- composite risk logic
- separacao entre gravidade e acao

Substituir:

- enums paralelos de severidade
- score geral sem semantica clara
- mappings escondidos em UI/payloads

## Open Questions

- O produto precisa de thresholds globais fixos no launch, ou alguns dominios como `chargeback` e `measurement` precisam de tabelas de threshold dedicadas desde o inicio?
- `value_case` deve influenciar apenas prioridade, ou em alguns cenarios pode alterar `decision_impact` diretamente?
- Havera politica formal de expiração para `suppression_rule`, ou algumas suppressions poderao ser permanentes por provider/trust model?
