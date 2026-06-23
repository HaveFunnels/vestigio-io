# ROADMAP.md — Vestigio.io

> Last updated: **2026-06-11** (post Wave 22.x)
> Histórico pré-Wave 22 arquivado em `docs/archive/ROADMAP_pre_wave22.md`
> Companion: `docs/COMPLETED_ROADMAP.md` para shipped detalhado

## Estado atual

- Primeiro cliente pagante: **havefunnels** (SaaS B2B, plan Max, pt-BR)
- Foco do produto: PMF na havefunnels antes de qualquer expansão
- Thesis de posicionamento: **"always-on revenue protection"** (em validação)
- Reformulação Wave 22.x do `/app/library/strategy` concluída — virou referência de visual language
- Console (`/app/maps`, `/app/actions`, etc) alinhado com plan via padrões granulares
- Workspaces transformado em config hub (não mais surfaces analíticas)

## Now (próximas 2 semanas)

### Cleanup operacional

- [x] **Wave A — Componentes órfãos** (`79a71c60`): 8 componentes verificados 0 refs deletados
- [x] **Wave B — Docs organização** (`79a71c60`): 21 docs históricos → `docs/archive/`, 3 HTML comps de abril deletados (2.5MB), `docs/ROADMAP.md` arquivado em `docs/archive/ROADMAP_pre_wave22.md`. `docs/` foi de 54 → 28
- [x] **Wave C — Decisões estratégicas** (`de2fed95`, `9ec67333`): track always-on mantida como A.1–A.5, MCP analytics deferido
- [x] **Wave D — Disco** (`3112c80f`): `.playwright-mcp/` (21MB), `tsconfig.tsbuildinfo` (4.4MB), 23 PNGs raiz (~27MB total)
- [x] **Wave E — Scripts one-time + orphan tests** (`3112c80f`): 7 scripts já executados deletados, `test-vertical-slice.ts` da era V2 removido
- [x] **Wave F — Raiz arrumada** (`3112c80f`): `AUDIT_ARCHITECTURE.md` → `docs/`, `DEV_PROGRESS.md` (564KB) → `docs/archive/`

Pendentes (mais agressivos, fazer caso a caso):
- [ ] **Wave G — i18n keys mortas**: sweep nos 4 `dictionary/*.json` (483KB+) procurando keys sem consumo
- [ ] **Wave H — API routes órfãs**: endpoints `/api/*` que ninguém chama
- [ ] **Wave I — Tabelas Prisma órfãs** (além das MCP já decididas)
- [ ] **Wave J — Componentes adicionais**: sweep nos >200 components/ (auditei 15)

### Plano + Console — refinamentos remanescentes do Wave 22

- [ ] **Plan drawer-bodies** ainda usa `<section>` ad-hoc — migrar para `DrawerSection` (mesmo que Maps RichFindingDrawer já consome)
- [ ] **ActionDrawer chrome**: hoje não usa `SideDrawer` compartilhado — alinhar
- [ ] **Mini-audit pre-expiry email** (commit `11889c45`) — verificar disparo em prod

### Customer reality — havefunnels

- [ ] **Recuperado attribution fix** (commit `1e5ce4d6`) — confirmar que próximo plan mostra R$ 0 com empty state em vez do 67k inflado
- [ ] **Trust boundary crossed render fallback** (commit `a47af150`) — verificar humanização em planos já persistidos
- [ ] Agendar 1 sessão de usabilidade com havefunnels para validar Plan reformulado

## Next (2-4 semanas)

### Engenharia — débito categorizado (3 blockers)

- [ ] **Worker telemetria PrismaTokenLedgerStore** — fix shipped em commit anterior, confirmar funcionamento sustentado
- [ ] **Inventory state-of-truth**: 3 fontes para `pageType` (regex, classifiedPageType, freshnessState). Eleger uma autoritativa, remover as outras
- [ ] **Carry-forward sem source-hash verify**: hoje clona evidências sem validar hash do ciclo origem (Wave 9.2)

### Polish post-PMF (4 itens)

- [ ] **Inventory `Evidence.payload` em `@db.Text`** — migrar para coluna `Json` (parse repetido a cada lookup)
- [ ] **Regex-first classification rebalance** — regex virou primary em vez de tiebreaker
- [ ] **Discoverability/Brand integrity packs** — já shipped, mas faltam workspace projections
- [ ] **Tabelas MCP analytics** (ver Wave C)

### Reforços Plan

- [ ] **MCP write** (Step 9 do `docs/PLAN_MONTHLY_STRATEGY.md`): `propose_plan_edit`, `add_plan_comment` tools — Step 8 read shipped
- [ ] **Export PDF endpoint** (Step 10) — `chromium` pool + single-page dynamic height

## Track: Always-on revenue protection (pós-PMF havefunnels)

Mantido no roadmap como track própria. Não compromete timeline ainda — gated em (1) PMF validado na havefunnels, (2) 2-3 clientes pagantes adicionais validando a thesis. Quando ativar, executar em sequência abaixo.

### A.1 — Wire 5: `NetworkAnalysisPayload` emitter (destrava 7 detectors)

**Por que primeiro**: ~10 linhas em [browser-worker.ts:282-313](apps/browser-worker/browser-worker.ts#L282) — `buildNetworkAnalysisSummary` em [playwright-runtime.ts:243-245](apps/playwright-runtime/playwright-runtime.ts#L243) já popula o payload, `resultToEvidence` só não lê. Maior leverage por tempo investido. Esforço: S, ~1-2 dias.

### A.2 — Calibrar detectors dormants (rollout havefunnels-only)

7+ detectors em [packages/signals/engine.ts:2837-3000+](packages/signals/engine.ts#L2837) (`checkout_api_latency_degrading`, `mobile_payment_slow`, `payment_critical_failed`, etc) — thresholds chutados, nunca rodaram contra dado real. Feature-flag rollout só na havefunnels por 1-2 semanas pra calibrar FP rate antes de release broader. Esforço: M, ~7-10 dias.

### A.3 — `extractVitalityFromEvents` heartbeat

[packages/behavioral/session-aggregator.ts:392-428](packages/behavioral/session-aggregator.ts#L392) já definido. Wire em [apps/audit-runner/process-behavioral.ts](apps/audit-runner/process-behavioral.ts) + 2-3 signal extractors em `SurfaceVitality`. Heartbeat infra pre-existing. Esforço: M, ~3-5 dias.

### A.4 — Surface drift entre ciclos

"Apareceu uma URL JSON nova que ontem não existia." A thesis do always-on revenue protection depende disso. Diff de `NetworkSurface` entre ciclos. Esforço: L, ~10-15 dias.

### A.5 — Wires 1-4, 6-7 (Surface Audit Refactor restante)

Pré-trabalho do Surface Audit wave (2026-06-07): NetworkSurface model, Katana `-jc` parsing, Nuclei templates customizados, Platform endpoint catalog. Esforço: cada Wire ~5 dias.

## Track: Payment Surface Integrity (lens premium — plan Max)

Carve-out de segurança que passa o filtro anti-slop: vuln com caminho de dinheiro **mecânico** (formjacking → cartão roubado → chargeback + multa PCI), não probabilidade-de-breach. **Não** é reversão do Won't de SAST/DAST/OWASP — esses seguem rejeitados; esta é a única fatia de segurança on-thesis. Gatilho externo: PCI DSS 4.0 req **6.4.3** (inventário + autorização + integridade de scripts na página de pagamento) e **11.6.1** (detecção de tamper em header/conteúdo da página de pagamento), obrigatórios desde **2025-03-31**.

**Gating**: lens do plano Max (havefunnels já é Max). Única expansão com trigger de *demanda* externo — pode rodar antes das 4 categorias de "Expansão futura" se houver pull, mas sem comprometer o foco PMF.

**Estado**: detecção estática **já existe e é forte** — checks Nuclei (`vi_payment_formjacking_risk`, `vi_payment_sri_missing`, `vi_payment_missing_csp`, `vi_payment_xss_reflected` em [curated-checks.ts](packages/nuclei-adapter/curated-checks.ts)); inferências (`checkout_script_hijack_risk`, `payment_surface_compromised`, `payment_data_unencrypted`, `checkout_clickjack_risk` em [security-posture.ts](packages/inference/packs/security-posture.ts) + [channel-integrity.ts](packages/inference/packs/channel-integrity.ts)); sinais em [signals/engine.ts](packages/signals/engine.ts); `ScriptPayload` com src/host/is_external/known_provider/integrity em [evidence.ts](packages/domain/evidence.ts). O trabalho é **confirmação + diff + empacotamento**, não detecção do zero.

### PS.1 — Inventário de scripts por ciclo (S, ~2-3d)

Persistir o set de scripts da página de pagamento por ciclo. Reusa `ScriptPayload`; falta agrupar + persistir por página+ciclo, ancorado na URL de checkout (`checkout_detected` / `CheckoutIndicatorPayload.target_url`).

### PS.2 — Headless no checkout + enumeração DOM (M, ~4-6d)

Apontar o Playwright pra página de pagamento real e enumerar `<script>` do DOM renderizado + headers + `form.action`. Reusa `PlaywrightRuntime`, [selective-headless.ts](workers/ingestion/enrichment/selective-headless.ts), `captured_requests`. Hoje Stage D roda no `landing_url` com intent genérico e só conta scripts — falta roteamento explícito ao checkout e enumeração DOM.

### PS.3 — Confirm-before-claim (M, ~3-5d)

Findings de payment-surface não afirmam (nem mostram $) até `browser_runtime` confirmar o script vivo na página de pagamento. Reusa verification dispatcher ([workers/verification/](workers/verification/)) + `VerificationMaturity` + `Finding.status`. Falta ligar as inferências a confirmação obrigatória e suprimir o impacto até `verified`.

### PS.4 — Diff entre ciclos / tamper (L, ~8-12d) — irmão de A.4

Detectar script novo/removido, hash SRI mudado, CSP enfraquecido, HSTS sumido, CORS aberto, `form.action` alterado. **Construir o diff genérico uma vez** junto com A.4 (Surface drift) — não duplicar infra. Novas inference keys → PCI 11.6.1.

### PS.5 — Allowlist autorizada do merchant (M, ~5-7d)

Lista de scripts aprovados por env; finding dispara em não-**autorizado** (não só desconhecido-globalmente). `known_provider` vira seed. Modelo por env + UI + workflow → PCI 6.4.3.

### PS.6 — Mapeamento PCI + impacto mecânico (M, ~4-6d)

Mapear cada finding a 6.4.3 / 11.6.1. Impacto = **valor-em-risco** (GMV que passa pela superfície) + custo de incidente confirmado (chargeback + exposição a penalidade), **nunca probabilidade de breach**; $ só quando confirmado. Novo `ImpactType` (ex. `PaymentFraudExposure`) em [enums.ts](packages/domain/enums.ts); entradas PCI no remediation-catalog (pt + en).

### PS.7 — Calibração havefunnels + gate Max (M, ~5-7d)

Rollout feature-flag havefunnels-only (padrão A.2), medir FP rate, gate plano Max antes de release broader.

**Total**: ~4-6 semanas pro lens completo; v1 defensável (PS.1+2+3, PS.6 parcial) em ~2-3 semanas.

**Riscos que sobrevivem ao escopo:**
- **Checkout redirect/hosted** (ex. MP redirect): se o pagamento sai do domínio, a superfície monitorável encolhe pra página pré-redirect; scripts no domínio do processador não são seus. Ler `checkout_mode` e degradar honestamente quando for redirect.
- **FP de marketing tag**: GTM/pixel/analytics são scripts externos em página comercial. O finding honesto não é "você foi hackeado" — é "este script não-autorizado consegue ler o formulário de pagamento; autorize (allowlist) ou restrinja (SRI+CSP)", ação PCI-correta e verdadeira independente de intenção. Allowlist (PS.5) + calibração (PS.7) são pré-requisito de release.

## Deferido (mantém infra, ativa quando precisar)

### MCP analytics layer

`McpPromptEvent`, `McpSession`, `McpSuggestionClick`, `PlaybookRun` em `prisma/schema.prisma:1375-1424`. Write paths em `apps/platform/mcp-persistence.ts` continuam ativos; zero reads em prod. Decisão do fundador: manter como está — vai ser necessário um dia, sem urgência. Quando ativar, wire um dashboard de uso em `/app/admin/` lendo as 4 tabelas (estimativa 2-3 dias).

### Screenshot evidence como MCP chat tool

Provas visuais (captures de página com bounding box) reframadas como **tool do copilot** em vez de auto-captura em background. Customer pergunta no chat ("tira screenshot de /checkout focando no CTA") → tool `capture_visual_evidence` roda Playwright → retorna imagem inline com bbox opcional.

Por que deferido: arquitetura mais limpa (sem novas tabelas, sem cron, sem lifecycle complexo) mas precisa de R2 provisionado + decisão de quando integrar com Vestigio Copilot (Wave 3.14). Esforço estimado: ~3.5 dias.

**Hook nas findings (lightweight)**: botão "Tirar screenshot →" no `FindingDetailPanel` que abre o chat com prompt pré-preenchido. Best of both: descobribilidade no drawer + execução natural no chat.

Pré-requisitos pra ativar:
- Provisionar R2 (mesmo bucket que homepage com prefix `screenshots/chat/` + lifecycle 3 dias)
- Confirmar credenciais R2 nas env vars
- Decidir se entra na próxima Wave do Copilot ou em release dedicado

## Won't (rejeitados estrategicamente)

- **SAST/DAST product line** — fora do escopo de revenue protection
- **Compliance certification track** — não diferencia
- **OWASP/security pack expansion** — security é tangencial, não primary
- **Standalone pricing strategy surface** — encaixa em existing inventory
- **Terminal aesthetic** — wrong positioning signal; Vestigio é monitoring infra, não visible AI labor

**Carve-out**: o Won't de SAST/DAST/OWASP segue valendo para segurança *genérica* (header faltando, CVE match, vuln em microsite sem função comercial — impacto probabilístico, território Detectify). A track "Payment Surface Integrity" **não** é reversão disso: é a única fatia que passa o filtro money-mechanism + tem gatilho regulatório (PCI 4.0). Se uma proposta de segurança não tem caminho de dinheiro mecânico e confirmação determinística, continua Won't.

A track "Always-on revenue protection" foi proposta como Won't em uma rodada, mas mantida no roadmap. Reavaliar se ficar 60 dias sem início de execução pós-PMF.

## Track: Cobertura multi-vertical via camada de percepção

> Discovery de execução feito (2026-06-22) — PV.0–PV.6 abaixo. Gated pós-PMF havefunnels; sem timeline comprometida.

**Tese**: o gargalo de ir além de e-commerce **não é a biblioteca de findings** — os trilhos `inference_key → projection → pack → seção` já são agnósticos a vertical (keys de food/fashion já fluem). É a **percepção**: o motor não sabe (a) que indústria é o negócio, nem (b) pra que serve cada página. Classificação de *modelo* existe mas é rasa e ecom-shaped ([classification/engine.ts](packages/classification/engine.ts)); classificação de *indústria* + propósito semântico de superfície não existem (`/agendar`→"demo", `PageType` sem Booking/ServiceListing, enum `BusinessModel` achata `services`→Hybrid em [enums.ts](packages/domain/enums.ts)). Percepção é upstream e gateia tanto findings novos quanto vocabulário.

> Correção de camada: o "finding" (observação) vive nas inference packs (cause/effect/reasoning) + mapas `INFERENCE_TITLES`/`INFERENCE_CAUSES` em [projections/engine.ts](packages/projections/engine.ts); o remediation-catalog é só o *como remediar*. Ambos estáticos por key.

**Direção (NÃO construir biblioteca de findings por vertical):**
- **Percepção primeiro** — passe LLM sobre evidência crawleada → `BusinessContext { vertical, surfaces:[{url, purpose}] }` em ontologia fechada. Pré-requisito de tudo; o ativo difícil de copiar.
- **Ancorar findings universais na percepção** — "CTA enterrado *na página de agendamento*" vs "no checkout". Mesmo detector, relevante por vertical, sem catálogo novo.
- **Punhado de detectores verticais** só pras verticais em venda (agendamento travado, convênio não informado). Não 319×N.
- Vocabulário/tom por vertical: no máximo reescritor LLM pós-fato ancorado no texto do catálogo, pós-PMF. Não é o investimento.

**Execução (discovery 2026-06-22)** — mecânica derisada: o passe de percepção é o mesmo formato do framework-lens (Haiku sobre `page_content` → JSON estruturado → persistido → pre-populado, cold-cycle). Reusa **verbatim** `callModel` + token ledger + circuit-breaker de custo por org ([client.ts](apps/mcp/llm/client.ts)), e `sanitizeForPrompt` + guard `<page_data>` + `parseAuditResponse` ([framework-audit.ts](packages/copy-analysis/framework-audit.ts)). Custo: ~30 páginas × ~500 tokens ≈ **$0,012/ciclo** — fração de 1% do cap mensal ($50 max). Plug-point: nova enrichment pass em [runner.ts](workers/ingestion/enrichment/runner.ts), pós-crawl, antes de signals/inference; emite evidence `BusinessClassification` → `extractSignals` → packs. Sem blocker técnico.

**Princípio anti-slop (inegociável)**: o LLM só emite LABELS numa ontologia FECHADA (`vertical` + `surface.purpose` + confidence), **nunca escreve finding**. Detectores seguem determinísticos. LLM percebe, engine conclui. Fallback pro classificador heurístico Bayesiano que já existe ([classification/engine.ts](packages/classification/engine.ts)) quando confidence baixa ou parse falha.

**3 decisões (forks reais, não plumbing):**
- **Loop de timing**: percepção roda pós-crawl, então informa *detecção* neste ciclo mas *priorização de crawl* só no próximo. Default: cold crawleia genérico → percebe vertical → warm crawleia as superfícies certas (eventually-consistent).
- **Representabilidade + reconciliação**: enum `BusinessModel` (4 valores) não armazena services/clínica — colapsa em hybrid→ecommerce ([enums.ts](packages/domain/enums.ts), [classification/engine.ts](packages/classification/engine.ts) `mapOnboardingModel`). Prereq: campo `PerceivedVertical`. Regra: percepção sobrepõe onboarding acima de confidence T; onboarding vira prior/fallback.
- **Escopo da ontologia**: começar PEQUENA (services/leadgen + superfícies de agendamento/serviço), validar, expandir. Não desenhar 50 verticais no especulativo.

**Checar ANTES de construir**: `surfaceInventoryPass` + `semanticEnrichmentPass` já estão no registry de enrichment e podem já emitir parte de surface-purpose (risco de coleta-sem-consumo). Auditar overlap antes de criar passe paralela.

### PV.0 — Representabilidade + reconciliação (S, ~2-3d)
Campo `PerceivedVertical` (Environment) + taxonomia fechada de `surface.purpose`. Regra de precedência percepção vs onboarding.

### PV.1 — Auditar passes semânticas existentes ✅ (auditado 2026-06-22)
**Resultado**: `surfaceInventoryPass` + `semanticEnrichmentPass` estão VIVAS — 22 `enrichment_type` (ContentEnrichment) produzidos E consumidos por `extractCopyEnrichmentSignals`/`extractCompetitiveSurfaceSignals` → signals → findings → UI. Sem coleta-sem-consumo aqui. `surface_inventory` já emite label de negócio coarse (`customer_type`: saas/ecommerce/infoproduct), mas só pra seleção de categoria competitiva. **Dead-branches reais (localizados no page-classifier, baratos, só afinam o type ecommerce — NÃO são progresso de vertical):** classifier lê `above_fold_density.detected_page_type` (campo que a pass nunca seta), `pricing_psychology` fora do `typeMapping`, nomes stale (`product_description_quality` vs `product_page_quality`; `onboarding_copy_quality` vs `onboarding_copy`), e `page_purpose_validation` só emite em mismatch (~5% das páginas → slot LLM do classifier quase inerte). Fix ~5-10 linhas, separado. `classifiedPageType` em si está VIVO (PageInventoryItem → funnel/form/gap inferences + /api/inventory + EcosystemSection UI).

### PV.2 — Passe de percepção ✅ (shipped a9f1ccce)
**NÃO é infra nova** (PV.1 provou): é o **23º `ContentEnrichment`** num padrão com 22 consumidores vivos. Enrichment pass `perception-classifier` copiando o template framework-lens (Haiku sobre `page_content`, JSON ontologia-fechada, guard + parse hardening + fail-closed pro heurístico). Emite `ContentEnrichment{ enrichment_type:'business_perception', vertical, surfaces:[{url,purpose,confidence}] }`, consumido por novo extractor espelhando `extractCopyEnrichmentSignals`. **Guarda anti-drift**: definir `enrichment_type` + payload num único lugar autoritativo — o drift de strings entre producer/consumer foi exatamente o que matou os branches em PV.1. Dobrar no débito "eleger pageType autoritativo".

**Shipped (a9f1ccce)** — `workers/ingestion/enrichment/perception-classifier.ts` registrada (full-mode). Núcleo puro em `packages/perception/` (prompt+parser, 10 testes; fail-closed em vertical fora da ontologia / JSON ruim). Dois desvios por restrição real: (1) `EnrichmentContext` não expõe cold/warm/hot → **freshness-gate** (re-percebe se `perceivedVerticalUpdatedAt` null ou >7d) em vez de cold-only; (2) a pass escreve o cache `Environment.perceivedVertical` direto (confidence ≥ 0.6 = `PERCEPTION_CACHE_FLOOR`), sem tocar `run-cycle.ts`. **Produce-only**: nada consome a evidence e o cache é unread até PV.3 → behaviour-preserving (observável sem mudar finding). Typecheck do repo limpo.

### PV.2.1 — Persistência iterativa + accessor `BusinessContext` ✅ (shipped)
PV.2 hoje re-percebe o site inteiro a cada 7d. Tornar **incremental**: purpose por-URL persistido em `PageInventoryItem` (ao lado de `classifiedPageType` — **unifica o débito "eleger pageType autoritativo"**), **content-hash gated** (`hashContentInput`/`readContentEnrichmentCache`, padrão surface-inventory) → só página nova/alterada vai pro LLM; o resto acumula. Vertical de env re-julgada só quando o conjunto de superfícies muda. Expor `getBusinessContext(envId)` → `{ vertical, confidence, surfaces:[{url,purpose,confidence}] }` lendo Environment + PageInventoryItem. **A vertical retornada é a RECONCILIADA** (`resolveEffectiveVertical` do PV.0), não a percebida crua — senão uma percepção de baixa confiança envenena a tese do plano e o chat. Uma fonte de verdade pros 3 consumidores abaixo.

**Shipped** — `getBusinessContext`/`buildBusinessContext` (reconciliado) em `packages/perception/business-context.ts` (7 testes; prisma via import dinâmico pra não poluir os puros). Pass agora com **content-hash gate** (não re-roda o LLM se o conjunto de páginas não mudou) substituindo o freshness-gate de 7d, + guard de min-páginas. Desvio do plano: surfaces persistidos como blob `Environment.perceivedSurfacesJson` (uma coluna, migration `20260622130000` aplicada) em vez de por-URL no `PageInventoryItem` — mais simples, sem tocar `run-cycle.ts`; unificação com o débito de pageType **adiada**. Ainda read-only até PV.3.

### PV.3 — Consumo (3 superfícies, todas leem `getBusinessContext`) (L, ~8-12d)
**Status**: 3c MCP (`1c8a8681`) ✅ · 3b plano (`8c7c7880`/`77d6e0e7`) ✅ · 3a competitive (`3f456889`) ✅ · lista de superfícies no inventário (`339991f2`) ✅ · 3a vertical-inference dispatch usa vertical reconciliada (`f39e8203`) ✅. **Arco de consumo completo pra tudo que junta limpo.** **Bloqueado (data-model)**: chip de purpose no finding/action drawer + ranking por relevância de superfície — `finding.surface` é label ESTÁTICO (`INFERENCE_SURFACES[key]`, engine.ts:1230), não a URL real crawleada, então não dá join com as superfícies percebidas (keadas por URL). Fazer certo exige os findings carregarem a URL real (mudança mais funda no `projectFindings`) — peça separada, não wire rápido. `analyze_copy` por purpose: marginal (3c já dá surfaces ao copilot). **Nota de design**: não reescrever `INFERENCE_TITLES` (ecommerce-específicos). **Tudo dormente até um ciclo full da havefunnels rodar o PV.2** — observar via `SELECT perceivedVertical,perceivedSurfacesJson FROM "Environment"`.

A percepção alimenta tudo que hoje assume e-commerce.
- **3a — Findings/detecção**: `extractBusinessClassificationSignals` → signals `vertical.detected`/`surface.purpose:*`; reconciliação no chokepoint run-cycle.ts:562/1917; `vertical-inference.ts` if-blocks → registry keyed pela vertical reconciliada (dispatch deixa de ler `onboarding_business_model` cru). Findings ancorados na superfície percebida (subsume PV.4).
- **3b — Plano (PRECISÃO, não conteúdo novo)**: injeta `BusinessContext` nos prompts do `packages/strategy-plan/generator.ts` — `thesisOfMonth`, `generateNarrativeWhatHappened` (Sonnet), `generateNextSteps` (Haiku) → tese e priorização vertical-aware. **Não** vira bloco/seção nova no plano (poluiria). O *display* da percepção pro usuário vai pra lista de superfícies no sidedrawer "O que analisamos", não no corpo do plano.
- **3c — MCP chat**: injeta `BusinessContext` no contexto do copilot (`apps/mcp`) — system context ou tool `get_business_context` — pro chat raciocinar sabendo a vertical + propósito das páginas.

### PV.4 — Ancorar findings universais na superfície (M, ~3-5d)
Label de superfície no título vem do purpose percebido ("na sua página de agendamento") em vez de URL/assunção ecommerce. Mesmo detector, relevante por vertical, sem catálogo novo.

### PV.5 — Loop de priorização de crawl (M, ~5-7d)
Vertical percebida alimenta a seleção de critical-paths/scenarios do PRÓXIMO ciclo ([scenarios.ts](workers/ingestion/enrichment/scenarios.ts) switch → registry).

### PV.6 — Detectores de vertical (`local_service` / `professional`) (L)
Converte "percepção certa" em "findings novos" pras verticais sem detector. A percepção (PV.2) já entrega a vertical + os purposes; faltam os detectores.

**Keystone (destrava tudo)**: passar `business_context.surfaces` pra `computeVerticalInferences` ([vertical-inference.ts:92](packages/inference/vertical-inference.ts#L92) hoje recebe só a string da vertical). Aí o detector acha "a página de agendamento/serviços" pelo *purpose percebido*, não por regex de URL.

**Fase 1 — construíveis HOJE (evidência já existe):** `local_service`: `booking_absent_or_phone_only` (script widget), `contact_friction_high` (sinal de contato), `booking_form_excessive` (FormPayload field count), `mobile_booking_broken` (MobileVerificationResult). `professional` (= extensão do branch `services`): `credentials_not_visible` (corpus OAB/CRC/CREA + trust_signals), `no_consultation_cta` (CopyElements CTA) + reuse de `no_case_study_with_metrics`/`contact_form_excessive_fields`. Cada finding = inference fn (template `inferContactFormExcessiveFields`) + key (codegen) + catálogo pt-BR + título/cause/effect + pack mapping.

**Fase 2 — precisa coleta upstream:** endereço/horário (`AddressPayload` novo OU estender StructuredData LocalBusiness, hoje só `schema_type`) → `location_hours_absent`; review count/nota (estender `OffSiteReconPayload`, hoje só presença) → `local_reviews_absent`.

**2 bloqueios pré-requisito (decisão do fundador):**
1. **Modelo de $** — sem transação visível (não é ecommerce), "R$X perdido no agendamento" exige valor-da-consulta × volume. Opções: input de onboarding (ticket médio / valor de cliente) | severidade sem $ (fere doutrina) | default de indústria (número inventado). **Sem isso, findings dessas verticais não ficam on-thesis.**
2. **Calibração** — havefunnels é saas, sem dogfood. Precisa de 1 site real de clínica + 1 de advogado pra calibrar FP, senão thresholds chutados.

**Sequência**: keystone → `local_service` Fase 1 (~4 findings) → resolver modelo de $ → calibrar contra 1 site real → expandir `professional` + Fase 2.

**Shipped**: keystone (`8fe5cf99`) · `local_service` 4 detectores (`1b8c3bde`/`3830beda`) · breadth +6 buckets (`586e0b60`: infoproduct, real_estate, marketplace, travel, financial_services, home_services + 4 surfaces).

**Backlog de findings (passagem de aprofundamento — ⬜ construível hoje, ◐ precisa upstream):**
- **professional** (próximo, 0 detectores): ⬜ credentials_not_visible (OAB/CRC/CREA), no_consultation_cta, service_scope_vague, team_expertise_invisible + reuse services (no_case_study, contact_form_excessive, response_time).
- **infoproduct** (maior mercado BR): ⬜ no_proof_of_result, guarantee_invisible, testimonials_generic, no_payment_options (parcelamento), no_curriculum_visible, price_anchor_missing.
- **real_estate**: ⬜ listing_no_filters, no_property_details, contact_per_listing_absent · ◐ listing_photos_insufficient, no_financing_info.
- **financial_services**: ⬜ regulation_trust_absent (SUSEP/BACEN), no_simulation_tool, jargon_heavy, no_social_proof.
- **home_services**: ⬜ no_quote_path, service_area_unclear, contact_friction · ◐ portfolio_absent.
- **travel**: ⬜ pricing_per_date_absent, no_booking_path · ◐ no_availability_calendar, photos_insufficient.
- **local_service** (aprofundar): ⬜ local_proof_absent, no_service_menu, no_cancellation_policy · ◐ location_hours_unclear.
- **food** (aprofundar): ⬜ no_online_ordering, min_order_unclear.
Cada ⬜ = repetição do padrão provado (detector + surface + título pt-BR + pack + catálogo). Ordem por mercado BR: professional → infoproduct → real_estate → financial_services.

### PV.7 — Inversão perception-first + calibração bilíngue ✅ (shipped 2026-06-22)
Os detectores PV.6 gateavam por **corpus-regex pt-BR** → falso-positivavam sistematicamente fora do pt-BR. Calibrado contra **10 sites reais** (US/BR/ES × local_service/professional/infoproduct) achados por **busca neutra** (negócio+cidade, nunca a palavra-sinal — buscar pela keyword é circular e esconde o bug).

**Bilíngue (`503c9901`/`f945b6b3`)**: 10 listas de padrão EN+PT, currency-agnostic, soltas. Corrigidos falso-positivos (contact perdia "Call 1-800", pricing perdia "$59", response-time perdia "24/7", case-study perdia "$90M verdict") + falso-**negativos** por colisão de substring (`ementa`⊂"implementation", `grade`⊂"upgrade" silenciavam `no_curriculum` em toda página EN; `member of`⊂"member of our team").

**Inversão (`d17493e9`)**: `perceivedPresent(ctx, ...purposes)` (floor 0.6) é o gate **primário**, antes do regex. Purpose é rótulo semântico language-agnostic → site em qualquer idioma cujo surface a perception viu nunca chega no regex enviesado. **7 detectores** invertidos (signal = page purpose): service_pricing→`pricing`, booking→`booking`/`availability`, no_case_study→`case_study`, no_consultation→`booking`/`intake_form`/`contact`, team→`team`/`about`, no_proof→`testimonials`/`case_study`, no_payment→`checkout`/`cart`. `businessContext` passou a fluir pro dispatch professional+infoproduct (antes não recebiam). Wired ponta-a-ponta (run-cycle:1922→recompute:860→detectores), degrade-safe. 9 asserts + zero regressão + typecheck limpo. Mata as classes **idioma + colisão + cegueira página-vs-site** via perception.

### PV.8 — Content flags da perception ✅ (shipped 9606b1ed, 2026-06-22)
**Fecha a fronteira que PV.7 deixou.** 5 detectores são **atributo de conteúdo**, não papel de página — sem `purpose` pra ancorar, ficaram corpus-only (idioma-enviesados): `guarantee_invisible`, `credentials_not_visible`, `no_curriculum_visible`, `response_time_not_promised`, `contact_friction_high`. Fix durável: a passe de perception (que já LÊ as páginas) emite **content flags** site-level, e os 5 gateiam por flag (language-agnostic) em vez de regex.

**Taxonomia fechada (5 flags, 1:1 com os detectores)** em [vertical.ts](packages/domain/vertical.ts) ao lado de `SURFACE_PURPOSES`: `has_guarantee`, `shows_credentials`, `shows_curriculum`, `promises_response_time`, `has_immediate_contact` + guard `isContentFlag`. Anti-slop: conjunto fechado, estender deliberadamente.

**Camadas (cada uma espelha um padrão PV.2/PV.2.1 vivo):**
1. **Prompt** [perception-prompt.ts](packages/perception/perception-prompt.ts): seção CONTENT FLAGS + `content_flags:[{flag,confidence}]` no schema JSON. Instrução semântica language-agnostic ("a página promete reembolso em QUALQUER idioma?"), mesmo guard anti-injection, site-level (não por-página). **Mesma call Haiku** → custo marginal ≈ 0 (alinha always-on cost analysis).
2. **Parser** [perception-parser.ts:97](packages/perception/perception-parser.ts#L97): `BusinessPerception` ganha `contentFlags`; loop de validação espelhando `surfaces` (drop fora-de-ontologia, clamp confidence, fail-closed).
3. **Schema** [schema.prisma:356](prisma/schema.prisma#L356): coluna aditiva nullable `perceivedContentFlagsJson Json?`. Migration aditiva → `migrate deploy` (NUNCA `migrate dev`); cuidado com o ledger (histórico P3009 → `migrate resolve --applied` se houver drift). Única parte delicada (DB de prod).
4. **Classifier write** [perception-classifier.ts:233](workers/ingestion/enrichment/perception-classifier.ts#L233): grava no mesmo `.update`, sob o **mesmo content-hash gate** (não re-roda se as páginas não mudaram).
5. **BusinessContext** [business-context.ts](packages/perception/business-context.ts): `contentFlags` no tipo + `coerceContentFlags`; `getBusinessContext` seleciona a coluna nova. Degrade-safe (ausente → []).
6. **Consumo** [vertical-inference.ts](packages/inference/vertical-inference.ts): `perceivedFlag(ctx, flag)` (espelha `perceivedPresent`); gateia os 5 perception-first → regex fallback. `contact_friction` já recebe `businessContext`; passar aos outros 4 (`guarantee`, `credentials`, `no_curriculum`, `response_time`) no dispatch + signature.

**Decisão de design — FULL tri-state (shipped, não o present-only escopado)**: perception autoritativa nos DOIS sentidos via `perceivedFlag()` (espelha `perceivedPresent`). present (≥0.6) → suprime; **absent (≥0.75) → fira com prioridade +8, SOBREPONDO falso-presente do regex** (mata a classe de colisão de substring `ementa`⊂"implementation" de vez, não só os casos remendados à mão); unknown → regex fallback (degrade-safe). Floors **assimétricos**: suprimir é barato (perde-se um finding), firar finding errado no cliente é caro → absent exige mais confiança que present.

**Não surfacear no "O que analisamos"** — flags são input de precisão dos detectores, não bloco de UI.

**Shipped (9606b1ed)** — 5 flags (`has_guarantee`/`shows_credentials`/`shows_curriculum`/`promises_response_time`/`has_immediate_contact`), 8 camadas espelhando PV.2/PV.2.1, migration `20260622140000` migrate-deployed em prod (coluna verificada via `db execute`). 25/25 testes unit (8 novos) + 6/6 harness tri-state + typecheck do repo limpo. Wired end-to-end (getBusinessContext → recompute:860 → 5 detectores), degrade-safe. **Dormente até a havefunnels rodar um ciclo full do PV.2** (a perception precisa popular `perceivedContentFlagsJson`). Calibração contra sites reais com flags fica pra quando houver dado perceived em prod.

## Expansão futura (4 categorias validadas, post-PMF)

Não comprometidas com timeline. Cada uma demanda discovery próprio.

- **Attribution lens** — multi-touch attribution para ações
- **Pricing intelligence** — detecção de pricing leak (psychology + competitive)
- **Vendor cost analysis** — detection de waste em ad spend + tooling
- **Churn detection** (preditivo) — não é o cancel flow shipped, é predição pre-cancel

## Funnel Moment Findings (25 findings prontos)

Em standby — implementação gated por `businessModel` na audit. Pode entrar depois que havefunnels validar Plan reformulado.

## Integrations pendentes

- **Meta Ads + Google Ads**: types existem (`packages/integrations/`), signal engine não consome. Revisitar depois da próxima wave behavioral-heuristics.

## Como manter este doc

- Seções "Shipped" não vão pra cá — vão pra `docs/COMPLETED_ROADMAP.md`
- Wave 22.x detalhado fica nos commits — não polui aqui
- Quando decidir um item de "Later → Decisões C", mova pra Now ou Won't
- Histórico denso de waves antigos (0-20+) fica em `docs/archive/ROADMAP_pre_wave22.md`

---

## Referência rápida

| Doc | Para que serve |
|---|---|
| `ROADMAP.md` (este) | O que está acontecendo agora + próximos passos |
| `docs/COMPLETED_ROADMAP.md` | Histórico de shipped por wave |
| `docs/archive/ROADMAP_pre_wave22.md` | Roadmap detalhado pré-2026-06 (arquivado) |
| `docs/PLAN_MONTHLY_STRATEGY.md` | Spec autoritativa do Plano Mensal |
| `docs/NORTHSTAR.md` | Posicionamento estratégico |
