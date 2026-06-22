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

## Track (preliminar): Cobertura multi-vertical via camada de percepção

> **Preliminar** — precisa de discovery de execução antes de detalhar passos (PV.x). Sem timeline. Gated pós-PMF havefunnels.

**Tese**: o gargalo de ir além de e-commerce **não é a biblioteca de findings** — os trilhos `inference_key → projection → pack → seção` já são agnósticos a vertical (keys de food/fashion já fluem). É a **percepção**: o motor não sabe (a) que indústria é o negócio, nem (b) pra que serve cada página. Classificação de *modelo* existe mas é rasa e ecom-shaped ([classification/engine.ts](packages/classification/engine.ts)); classificação de *indústria* + propósito semântico de superfície não existem (`/agendar`→"demo", `PageType` sem Booking/ServiceListing, enum `BusinessModel` achata `services`→Hybrid em [enums.ts](packages/domain/enums.ts)). Percepção é upstream e gateia tanto findings novos quanto vocabulário.

> Correção de camada: o "finding" (observação) vive nas inference packs (cause/effect/reasoning) + mapas `INFERENCE_TITLES`/`INFERENCE_CAUSES` em [projections/engine.ts](packages/projections/engine.ts); o remediation-catalog é só o *como remediar*. Ambos estáticos por key.

**Direção (NÃO construir biblioteca de findings por vertical):**
- **Percepção primeiro** — passe LLM sobre evidência crawleada → `BusinessContext { vertical, surfaces:[{url, purpose}] }` em ontologia fechada. Pré-requisito de tudo; o ativo difícil de copiar.
- **Ancorar findings universais na percepção** — "CTA enterrado *na página de agendamento*" vs "no checkout". Mesmo detector, relevante por vertical, sem catálogo novo.
- **Punhado de detectores verticais** só pras verticais em venda (agendamento travado, convênio não informado). Não 319×N.
- Vocabulário/tom por vertical: no máximo reescritor LLM pós-fato ancorado no texto do catálogo, pós-PMF. Não é o investimento.

**Sonda barata (1º passo de execução)**: provar em UMA vertical adjacente — services/leadgen, que já tem meio caminho ([vertical-inference.ts](packages/inference/vertical-inference.ts), scenarios services→leadgen). Estender `BusinessModel` pra armazenar services + entendimento semântico de superfícies de agendamento/serviço. Se a tese não segura aqui, não segura em 15.

**Próximo passo antes de detalhar**: discovery de execução — manter o passe de percepção determinístico o suficiente pro padrão anti-slop, custo LLM por env, e a ontologia de verticais/superfícies.

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
