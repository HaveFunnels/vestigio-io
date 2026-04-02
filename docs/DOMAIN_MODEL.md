# Domain Model

## NorthStar

Vestigio V2 deve ser modelado como:

**um sistema de intelligence orientado a decisões sobre funcionamento comercial, perda de receita, risco operacional, confiança e readiness de ambientes digitais**.

O produto nao e um scanner de findings. `finding` passa a ser projeção. As unidades centrais sao:

- `audit_cycle` para versionamento
- `evidence` para observabilidade
- `decision` para resposta de negocio
- `incident` e `opportunity` para operacao do produto

## Ontology

| Term | Definition | Notes |
|---|---|---|
| `evidence` | dado observavel, tipado, versionado e sem conclusao final de negocio | pode ser estrutural, comportamental, operacional ou integrado |
| `signal` | fato derivado local a partir de evidence | ainda nao responde pergunta de negocio |
| `inference` | interpretacao composta de um ou mais signals | pode atravessar dominios locais |
| `risk_evaluation` | avaliacao canonica de downside por `subject + question` | separa risco bruto, confianca e impacto |
| `decision` | resposta explicavel para uma pergunta de negocio | unidade primaria de produto |
| `finding` | detalhe explicativo projetado a partir de decision ou supporting inference | nunca source of truth |
| `incident` | estado operacional aberto para um problema material, ativo ou recorrente | pode colapsar varios findings |
| `opportunity` | estado operacional aberto para upside plausivel e priorizavel | simetrico de incident, mas voltado a ganho |
| `artifact` | pacote exportavel ou resumivel de evidence/decision | ex.: defense pack, preflight summary |
| `verification` | acao adicional para reduzir incerteza ou confirmar mudanca | pode reutilizar probe ou browser verification |

## Canonical entities

### 1. `workspace`

Container comercial e administrativo.

Source of truth:

- control plane

Responsavel por:

- tenant boundary
- billing and plan
- access control
- business profile ownership
- environment registry

### 2. `environment`

Representa um ambiente monitorado dentro do workspace.

Exemplos:

- `production`
- `staging`
- `brand-microsite`
- `checkout-subdomain`

Source of truth:

- rewrite: entity propria ligada ao control plane
- hoje: implícito em `website`, host roots e selecao manual

Campos centrais:

- `workspace_ref`
- `environment_key`
- `environment_type`
- `root_domains[]`
- `path_scopes[]`
- `business_unit`
- `is_customer_facing`
- `is_production`

### 3. `business_profile`

Perfil economico e operacional do negocio.

Source of truth:

- onboarding + manual inputs + future integrated metrics

Campos:

- `business_model` (`ecommerce`, `lead_gen`, `saas`, `hybrid`)
- `monthly_revenue_range`
- `average_ticket_range`
- `chargeback_rate_range`
- `churn_rate_range`
- `traffic_plan_range`
- `growth_goal`
- `platform_hints[]`
- `provider_hints[]`

Papel:

- calibrar `decision_impact`
- alimentar `opportunity` e `value_case`
- ajustar prioridade e tono de recomendacao

### 4. `website`

Sujeito tecnico monitorado.

Source of truth:

- `websites`

Observacao:

- em V2, `website` deve ficar subordinado a `environment`
- um `environment` pode ter um ou mais `website` roots/subdomains

### 5. `audit_cycle`

Unidade canonica de coleta, versionamento e avaliacao.

Source of truth:

- `audit_refresh_cycles`

Campos centrais:

- `cycle_type` (`full`, `incremental`, `verification`)
- `trigger_source`
- `started_at`, `completed_at`
- `freshness_state`
- `coverage_summary`

### 6. `core_snapshot`

Snapshot bruto do ciclo.

Source of truth:

- hoje: `audits.data`, `audits.issues`, campos em `audits`
- rewrite: entidade tipada derivada do `audit_cycle`

### 7. `page_inventory_item`

Pagina conhecida e classificada.

Source of truth:

- `website_page_inventory`

Campos:

- `normalized_url`
- `path_scope`
- `page_type`
- `tier`
- `priority`
- `criticality`
- `environment_ref`

### 8. `surface_relation`

Aresta estrutural entre superficies.

Source of truth:

- `website_surface_relations`

### 9. `behavioral_event`

Evento bruto runtime.

Source of truth:

- `behavioral_events_raw`

### 10. `behavioral_session`

Agregado de sessao runtime.

Source of truth:

- `behavioral_sessions`

### 11. `journey_graph`

Projection model agregado de jornadas.

Source of truth:

- `behavioral_journey_nodes_daily`
- `behavioral_journey_edges_daily`
- `behavioral_journey_exceptions_daily`

### 12. `evidence`

Entidade canonica de observacao.

Source of truth:

- rewrite: typed evidence store
- hoje: espalhado entre inventory, relations, heartbeat, journey, radars e blobs

Campos minimos:

- `evidence_key`
- `evidence_type`
- `subject_ref`
- `environment_ref`
- `cycle_ref`
- `observed_at`
- `fresh_until`
- `source_kind`
- `collection_method`
- `payload`
- `quality_score`

### 13. `signal`

Fato derivado local e tipado.

Exemplos:

- `platform.shopify = true`
- `checkout.mode = hosted`
- `policy.refund.present = false`
- `journey.dropoff.checkout = high`
- `measurement.coverage = shallow`

### 14. `inference`

Conclusao intermediaria composta.

Exemplos:

- `commerce_context = true`
- `trust_boundary_crossed = true`
- `revenue_path_fragile = true`
- `policy_gap = high`

### 15. `risk_evaluation`

Avaliacao de downside por `subject + question`.

Campos:

- `raw_risk_score`
- `confidence_score`
- `effective_severity`
- `decision_impact`
- `gate_result`

### 16. `decision`

Resposta explicavel para uma pergunta de negocio.

Campos:

- `decision_key`
- `question_key`
- `subject_ref`
- `environment_ref`
- `cycle_ref`
- `status`
- `confidence_score`
- `impact_summary`
- `recommended_actions[]`
- `supporting_evidence_refs[]`

### 17. `incident`

Objeto de operacao para downside material.

Criado quando:

- ha `decision_impact` alto o suficiente
- ha recorrencia, regressao ou blast radius relevante
- multiplos findings apontam para mesma causa-raiz

### 18. `opportunity`

Objeto de operacao para upside plausivel.

Criado quando:

- ha friccao, lacuna ou desalinhamento com potencial de ganho
- o ganho tem `value_case` defendavel
- a acao sugerida e executavel

### 19. `value_case`

Estimativa de impacto economico associada a `decision`, `incident` ou `opportunity`.

Campos:

- `impact_type` (`revenue_uplift`, `chargeback_reduction`, `churn_reduction`, `conversion_uplift`)
- `range_low`, `range_mid`, `range_high`
- `confidence_band`
- `basis_type` (`heuristic`, `mixed`, `data_driven`)
- `assumptions[]`

### 20. `preflight_profile`

Lente de readiness sobre um landing/commercial route.

Source of truth:

- `website_preflight_profiles`

### 21. `preflight_evaluation`

Projecao de readiness de um `preflight_profile` sobre um `audit_cycle`.

Source of truth:

- `website_preflight_profile_versions`

### 22. `suppression_rule`

Governanca de falso positivo.

Campos:

- `scope_ref`
- `match_key`
- `reason`
- `created_by`
- `expires_at`
- `review_policy`

### 23. `verification_request`

Pedido controlado de verificacao adicional.

Tipos:

- `reuse_only`
- `light_probe`
- `browser_verification`
- `integration_pull`

## Relationship model

```text
workspace
  -> business_profile
  -> environment
      -> website
          -> audit_cycle
              -> core_snapshot
              -> evidence
              -> signal
              -> inference
              -> risk_evaluation
              -> decision
              -> artifact
          -> page_inventory_item
          -> surface_relation
          -> behavioral_event
          -> behavioral_session
          -> journey_graph
      -> preflight_profile
          -> preflight_evaluation

decision
  -> finding projection
  -> incident (downside path)
  -> opportunity (upside path)
  -> value_case
  -> verification_request

suppression_rule
  -> decision / finding / signal visibility
```

## Source of truth rules

| Concept | Canonical owner | Must not own it |
|---|---|---|
| cycle status | `audit_cycle` | findings, dashboards |
| structural topology | evidence graph over inventory + relations | per-radar helpers |
| platform/provider detection | shared signals/inferences | preflight-specific copy |
| readiness status | `preflight_evaluation` using shared decisions | standalone logic fork |
| risk semantics | `risk_evaluation` | radar-local severity enums |
| business conclusion | `decision` | UI fallback logic |
| downside operational state | `incident` | findings table |
| upside operational state | `opportunity` | ad hoc recommendation cards |
| economic estimate | `value_case` | prose-only recommendation blobs |
| false positive governance | `suppression_rule` + review state | hardcoded UI hides |

## Freshness contract

Freshness nao e atributo exclusivo de preflight.

Todo `evidence`, `signal`, `inference`, `decision` e `integration snapshot` deve carregar:

- `observed_at`
- `fresh_until`
- `staleness_reason`
- `refresh_strategy`

Regras:

- `signal` nao pode ser mais fresco do que o evidence que o suporta
- `decision` nao pode parecer `fresh` se um input critico estiver stale
- `preflight_evaluation` pode reutilizar ultimo estado completo, mas deve marcar `stale`
- `provider inference` e `journey inference` exigem TTLs proprios por volatilidade

## Scoping contract

Toda entidade operacional deve responder:

- `workspace_ref`
- `environment_ref`
- `subject_ref`
- `path_scope`
- `production_scope`

Isso evita misturar:

- staging com production
- subdominio de blog com checkout real
- business units diferentes no mesmo root domain

## Output contract

Outputs sao sempre projeções:

- `finding` projeta detalhe
- `workspace summary` projeta portfolio
- `preflight view` projeta readiness
- `incident board` projeta downside ativo
- `opportunity board` projeta upside priorizado
- `chat answer` projeta decisao + explainability

## Preservation guidance

Preservar conceitualmente:

- `audit_cycle`
- `website_page_inventory`
- `website_surface_relations`
- `behavioral_journey_*`
- `preflight_profile`
- hybrid discovery
- shared evidence graph

Reconstruir com contrato novo:

- signal store
- inference store
- decision store
- incident/opportunity model
- business profile model
- suppression governance

## Open Questions

- O `workspace` vai suportar multiplos ambientes produtivos paralelos por marca/regiao desde o dia zero, ou apenas um `production` principal com extensoes futuras?
- `business_profile` entrara somente por onboarding/manual input no inicio, ou havera um contrato minimo obrigatorio para importacao de metrics externas ja na fase 1?
- `incident` e `opportunity` terao ownership humano explicito desde o primeiro release, ou inicialmente serao apenas estados operacionais sem workflow de assignee?
