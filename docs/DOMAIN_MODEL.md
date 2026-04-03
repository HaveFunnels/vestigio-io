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

### 1. `workspace` / `organization`

Container comercial e administrativo. **Implemented as `Organization` in Prisma.**

Source of truth:

- `prisma/schema.prisma` — `Organization` model
- `packages/domain/workspace.ts` — domain contract

Campos implementados (Prisma `Organization`):

- `id`, `name`, `ownerId`
- `plan` — vestigio | pro | max
- `status` — pending | active | suspended
- relationships: memberships, environments, businessProfile, auditCycles, usage, conversations, tokenLedger

Responsavel por:

- tenant boundary
- billing and plan
- access control via `Membership` (owner | admin | member)
- business profile ownership
- environment registry

### 2. `environment`

Representa um ambiente monitorado dentro do workspace. **Implemented in Prisma.**

Source of truth:

- `prisma/schema.prisma` — `Environment` model
- `packages/domain/workspace.ts` — domain contract

Campos implementados (Prisma `Environment`):

- `id`, `organizationId`, `domain`, `landingUrl`, `isProduction`
- relationships: organization, auditCycles, saasAccessConfig

Campos no domain contract (extended):

- `workspace_ref`, `environment_key`, `environment_type`
- `root_domains[]`, `path_scopes[]`
- `business_unit`, `is_customer_facing`, `is_production`

Cada environment pode ter um `SaasAccessConfig` associado para analise autenticada.

### 3. `business_profile`

Perfil economico e operacional do negocio. **Implemented in Prisma + domain contracts.**

Source of truth:

- `prisma/schema.prisma` — `BusinessProfile` model + `BusinessProfileVersion` model
- `packages/domain/workspace.ts` — domain contract with SaaS extensions
- `packages/domain/business-profile-lifecycle.ts` — versioning, drift detection, recalibration

Campos implementados (Prisma `BusinessProfile`):

- `id`, `organizationId` (unique)
- `businessModel` — ecommerce | lead_gen | saas | hybrid
- `monthlyRevenue`, `averageOrderValue`, `monthlyTransactions`
- `conversionRate`, `chargebackRate`, `churnRate`
- `conversionModel` — checkout | whatsapp | form | external

Campos no domain contract (extended):

- `monthly_revenue_range`, `average_ticket_range`
- `chargeback_rate_range`, `churn_rate_range`
- `traffic_plan_range`, `growth_goal`
- `platform_hints[]`, `provider_hints[]`
- `saas` — SaaS profile extension (auth_method, mfa_mode, trial, activation goal, upgrade path)

Lifecycle management (implemented in `packages/domain/business-profile-lifecycle.ts`):

- `BusinessProfileVersion` — versioned snapshots with source tracking
- `evaluateProfileFreshness()` — graduated staleness bands (30/60/90/180 days)
- `detectProfileDrift()` — compares declared profile against observed signals
- `profileConfidencePenalty()` — confidence multiplier based on staleness and drift
- `BusinessProfileVersion` Prisma model stores version history with source and change summary

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

Unidade canonica de coleta, versionamento e avaliacao. **Implemented in Prisma.**

Source of truth:

- `prisma/schema.prisma` — `AuditCycle` model
- `packages/domain/audit-cycle.ts` — domain contract

Campos implementados (Prisma `AuditCycle`):

- `id`, `organizationId`, `environmentId`
- `status` — pending | running | complete | failed
- `cycleType` — full | incremental | verification
- `createdAt`, `completedAt`
- relationships: organization, environment, evidence[]

### 5a. `saas_access_config` (new)

Configuracao de acesso autenticado para analise de SaaS. **Implemented in Prisma.**

Source of truth:

- `prisma/schema.prisma` — `SaasAccessConfig` model
- `packages/domain/saas-access.ts` — domain contract

Campos:

- `environmentId` (unique), `loginUrl`, `email`, `passwordEncrypted`
- `authMethod` — password | oauth | magic_link | unknown
- `mfaMode` — none | optional | required | unknown
- `hasTrial`, `requiresSeedData`, `testAccountAvailable`
- `activationGoal`, `primaryUpgradePath`
- `status` — unconfigured | configured | verified | failed | expired | awaiting_manual_mfa

Created during onboarding. Consumed by the verification layer.

### 5b. `platform_config` (new)

Configuracao de plataforma para pricing e limites de plano. **Implemented in Prisma.**

Source of truth:

- `prisma/schema.prisma` — `PlatformConfig` model
- `src/libs/plan-config.ts`

Campos: `configKey` (unique), `value` (JSON text).

Stores plan configurations (price IDs, limits, features) synced from Paddle.

### 6. `versioned_snapshot`

Snapshot versionado do ciclo para change detection. **Replaces legacy `core_snapshot`.**

Source of truth:

- `prisma/schema.prisma` — `VersionedSnapshot` model
- `packages/change-detection/`

Campos implementados:

- `cycleRef`, `workspaceRef`, `environmentRef`
- `schemaVersion`, `snapshot` (JSON), `isBaseline`
- `decisionCount`, `signalCount`, `auditMode`
- `recomputeMs`, `contentHash`

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

Entidade canonica de observacao. **Implemented and persisted.**

Source of truth:

- `packages/domain/evidence.ts` — typed contract with ~30 payload types
- `packages/evidence/store.ts` — in-memory evidence store
- `packages/evidence/prisma-store.ts` — PostgreSQL persistence via `PrismaEvidenceStore`
- `prisma/schema.prisma` — `Evidence` model

Campos implementados:

- `evidence_key`
- `evidence_type` — extensive enum: http_response, page_content, redirect, script, form, link, iframe, meta, certificate, policy_page, checkout_indicator, provider_indicator, platform_indicator, browser_navigation_trace, browser_checkout_confirmation, browser_failure_event, browser_redirect_chain, authenticated_session_attempt, authentication_blocked_event, prerequisite_missing_event, authenticated_page_view, activation_step_observed, empty_state_observed, upgrade_surface_observed, navigation_structure_observed, inline_script_content, structured_data_item, technology_detected, mobile_verification_result, classified_runtime_errors, nuclei_match, katana_discovery, network_analysis, brand_impersonation_match, shopify_store_metrics, behavioral_session, surface_vitality
- `subject_ref`
- `scoping` (workspace_ref, environment_ref, subject_ref, path_scope)
- `cycle_ref`
- `freshness` (observed_at, fresh_until, freshness_state, staleness_reason)
- `source_kind` — crawl, http_fetch, pixel, heartbeat, integration, browser_verification, manual, nuclei_scan, katana_crawl, brand_intel_scan, shopify_integration, behavioral_snippet
- `collection_method` — static_fetch, dynamic_render, api_call, passive_collection, manual_input, external_tool_scan
- `payload` — typed union, JSON-serialized in Prisma
- `quality_score` — 0..100

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
- `authenticated_journey_verification` (new — SaaS authenticated verification)

### 24. `action` (new — implemented)

Unidade operacional derivada de decisions. **Primary UI surface.**

Source of truth:

- `packages/domain/actions.ts` — domain contract
- `packages/projections/types.ts` — `ActionProjection`

Campos:

- `action_key`, `scoping`, `cycle_ref`, `decision_ref`
- `action_type` — risk_mitigation | opportunity_capture | verification | observation
- `title`, `description`, `priority`, `severity`, `decision_impact`
- `effort_hint`, `evidence_refs[]`, `status` (pending | in_progress | completed | dismissed)

Projection extensions:

- `category` — incident | opportunity | verification | observation
- `operational_status`, `decision_status`, `change_class`, `verification_maturity`, `resolve_path`

### 25. `conversation` (new — implemented)

Sessao de chat LLM persistida.

Source of truth:

- `prisma/schema.prisma` — `Conversation`, `ConversationMessage`, `TokenCostLedger` models

### 26. `analysis_job` (new — implemented)

Job de analise com status, progresso e stages.

Source of truth:

- `prisma/schema.prisma` — `AnalysisJob` model

## Relationship model

```text
organization (Prisma)
  -> membership[] (user + role)
  -> business_profile (1:1, with versioning via business_profile_version[])
  -> environment[]
      -> saas_access_config (1:1, optional)
      -> website[]
          -> page_inventory_item[]
          -> surface_relation[]
      -> audit_cycle[]
          -> evidence[] (persisted in PostgreSQL via PrismaEvidenceStore)
          -> versioned_snapshot (for change detection)
          -> signal (in-memory, derived)
          -> inference (in-memory, derived)
          -> risk_evaluation (in-memory, derived)
          -> decision (in-memory, derived)
      -> analysis_job
  -> usage[]
  -> conversation[]
      -> conversation_message[]
      -> token_cost_ledger[]

decision
  -> action projection (primary UI surface)
  -> finding projection (detail view)
  -> incident (downside path)
  -> opportunity (upside path)
  -> value_case
  -> verification_request

suppression_rule (Prisma)
  -> decision / finding / signal visibility

platform_config (Prisma)
  -> plan pricing, limits, features
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

Reconstruido com contrato novo (implemented):

- signal extraction (`packages/signals/`)
- inference synthesis (`packages/inference/`)
- decision engine (`packages/decision/`) with conflict resolver
- incident/opportunity model (`packages/domain/incident.ts`, `packages/domain/opportunity.ts`)
- business profile model with lifecycle (`packages/domain/business-profile-lifecycle.ts`)
- suppression governance (`packages/suppression/`, `SuppressionRule` Prisma model)
- action derivation (`packages/actions/`, `packages/domain/actions.ts`)
- change detection (`packages/change-detection/`, `VersionedSnapshot` Prisma model)
- truth resolution (`packages/truth/`)

## Resolved Questions

- **Multiple environments**: Organization supports multiple environments. Each environment has its own domain, landing URL, and production flag. SaaS access is per-environment.
- **Business profile source**: Enters via onboarding and manual input. BusinessProfileVersion tracks source (onboarding, user_update, integration_sync, system_inference). Drift detection compares declared profile against observed signals.
- **Incident/opportunity ownership**: Currently operational states without explicit human assignee workflow. Actions page serves as the primary operational interface.
