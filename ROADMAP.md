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

- [ ] **Wave A — Componentes órfãos**: deletar 8 componentes verificados 0 refs (`PulseTelemetry`, `Auth/SigninWithPassword`, `Common/{CopyToClipboard,SectionTitleH2,PreLoader}`, `strategy/PrintLayout`, `console/{McpUsageIndicator,CycleDelta}`)
- [ ] **Wave B — Docs organização**: mover ~17 docs >60d sem update para `docs/archive/`, deletar `docs/desiredexample*.html` (2.5MB de comps de abril), consolidar `docs/ROADMAP.md` em `docs/archive/ROADMAP_pre_wave22.md`
- [ ] **Wave C — Decisões estratégicas** (ver seção dedicada abaixo)

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

## Decisões pendentes (não always-on)

### MCP analytics layer (4 tabelas dormants)

`McpPromptEvent`, `McpSession`, `McpSuggestionClick`, `PlaybookRun` em `prisma/schema.prisma:1375-1424`. Write paths em `apps/platform/mcp-persistence.ts`, **zero reads** em prod. Decisão pendente: wire dashboard / deletar / manter.

## Won't (rejeitados estrategicamente)

- **SAST/DAST product line** — fora do escopo de revenue protection
- **Compliance certification track** — não diferencia
- **OWASP/security pack expansion** — security é tangencial, não primary
- **Standalone pricing strategy surface** — encaixa em existing inventory
- **Terminal aesthetic** — wrong positioning signal; Vestigio é monitoring infra, não visible AI labor

A track "Always-on revenue protection" foi proposta como Won't em uma rodada, mas mantida no roadmap. Reavaliar se ficar 60 dias sem início de execução pós-PMF.

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
