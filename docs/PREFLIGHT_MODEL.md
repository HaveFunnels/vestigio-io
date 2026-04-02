# Preflight Model

## Purpose

Formalizar `preflight` como primitive de produto:

- landing-scoped
- evidence-based
- decision-oriented
- versioned per cycle
- consumivel por chat, dashboard e execution policy

Preflight nao e mini-engine independente. E uma lente de readiness sobre evidence e decisions ja existentes.

## Core entities

### `preflight_profile`

Representa:

- landing ou rota comercial escolhida
- opcional business context local
- identidade estavel para reavaliacoes recorrentes

Source of truth:

- `website_preflight_profiles`

Campos esperados:

- `workspace_ref`
- `environment_ref`
- `landing_url`
- `path_scope`
- `goal_type`
- `planned_spend_range`
- `expected_conversion_type`

### `preflight_evaluation`

Representa:

- avaliacao de um `preflight_profile` contra um `audit_cycle`

Source of truth:

- `website_preflight_profile_versions`

## Inputs

Preflight deve consumir evidence ja disponivel. Nunca reexecuta discovery por conta propria.

### Required evidence families

- inventory evidence do landing
- relations do path selecionado
- checkout/provider evidence
- policy/support evidence
- operational and security evidence
- behavioral signals quando existirem
- business profile do workspace
- freshness state do ciclo e das inferencias usadas

## Output contract

```yaml
preflight_result:
  profile_ref: preflight:landing-x
  cycle_ref: audit_cycle:456
  version_status: ready|stale|unavailable
  summary:
    overall_status: ready|ready_with_risks|blocker|na
    confidence_score: 0..100
    readiness_score: 0..100
  blockers: []
  risks: []
  opportunities: []
  supporting_decisions: []
  evidence_refs: []
```

## Lifecycle

### 1. Configured

Profile existe, sem avaliacao concluida ainda.

### 2. Awaiting evidence

Nao ha ciclo completo ou o landing nao apareceu no escopo atual.

### 3. Ready

Avaliacao concluida para o ciclo vigente.

### 4. Stale

Novo ciclo em andamento ou algum input critico expirou; mostrar ultima versao completa com badge `stale`.

### 5. Invalid scope

Landing ou path_scope nao pertence ao environment/producao declarado.

## Readiness semantics

### `blocker`

Algo torna escalada/lancamento operacionalmente indefensavel.

Exemplos grounded no legado:

- redirect away de dominio esperado
- cycle com erro critico de coleta
- landing ausente do inventory atual
- SSL/transporte invalido
- handoff comercial off-domain sem continuidade de confianca
- contexto de comercio sem refund/privacy/terms coverage minima

### `ready_with_risks`

O fluxo opera, mas otimizar trafego ou lancar sem remediacao seria imprudente.

Exemplos grounded:

- redirect chain longa
- suporte e contato fracos
- script/performance pressure
- brand pressure elevada
- measurement superficial
- trust assets fracos perto da conversao

### `ready`

Nao significa "perfeito". Significa:

- sem blockers materiais
- riscos remanescentes nao impedem operacao
- confidence suficiente para recomendar prosseguir com cautela normal

### `na`

Nao aplicavel por ausencia de contexto comercial ou escopo.

## Blocker vs risk vs opportunity

### Blocker

- downside material
- alta proximidade de conversao
- impede lancamento/escala

### Risk

- downside real, mas sem impedir operacao imediata

### Opportunity

- upside plausivel identificado no mesmo path
- nao substitui blocker/risk, mas enriquece a decisao

Exemplo:

- preflight pode estar `ready_with_risks` e ainda expor uma `opportunity` de uplift de trust/conversion

## Evidence-only principle

Preflight nao deve:

- crawl again
- inferir checkout de forma paralela
- chamar probes sozinho
- duplicar scoring de risco fora do decision engine

Preflight pode:

- selecionar decisions relevantes ao landing
- agregar supporting evidence
- aplicar presentation logic de readiness

## Freshness and staleness policy

`preflight_evaluation` depende de freshness dos seus insumos.

Campos obrigatorios:

- `freshness_state`
- `staleness_reason`
- `oldest_critical_input_at`
- `recommended_refresh_mode`

Regras:

- se novo ciclo estiver incompleto, serve ultima avaliacao concluida
- se provider/journey inputs estiverem stale demais, reduzir confidence
- se evidence critica estiver faltando, preferir `awaiting evidence` a falsa certeza

## Environment and scope policy

Preflight sempre deve explicitar:

- `workspace_ref`
- `environment_ref`
- `production_scope`
- `path_scope`

Regras:

- staging nunca deve contaminar preflight de production
- path subsets podem limitar decisions a rota da campanha
- subdominios externos podem participar se explicitamente ligados ao mesmo environment comercial

## Relationship with incidents and opportunities

Preflight nao e dono desses objetos, mas pode projetar:

- blockers ativos derivados de `incident`
- opportunities relevantes para o landing
- supporting findings

## Product surfaces

| Surface | Preflight role |
|---|---|
| Dashboard | readiness summary por landing/environment |
| Chat | resposta direta para "posso subir trafego?" |
| Incident board | blockers e riscos ativos ligados ao landing |
| Opportunity board | melhorias de upside ligadas ao path |
| Findings table | supporting details filtrados por profile |

## Rewrite contract

Manter:

- `preflight_profile`
- versionamento por ciclo
- stale handling
- landing-scoped evaluation

Mover para shared layers:

- scoring de risco
- confidence policy
- freshness policy
- incident/opportunity creation

## Open Questions

- O primeiro release precisa suportar preflight multipath dentro do mesmo profile, ou um profile deve continuar representando apenas um landing/path principal?
- `readiness_score` deve ser exibido ao usuario no launch, ou ficar interno enquanto o produto amadurece a interpretacao desse numero?
- Qual e o TTL aceitavel para reutilizar behavioral/journey inputs dentro de preflight sem exigir verificacao adicional?
