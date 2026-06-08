# Surface Audit — State of the Union & Path Forward

> Investigação de código (não plano de execução). Mapeia o que **já está
> conectado** versus **o que falta** para sustentar a virada de "página
> auditável" para "surface auditável". Toda afirmação cita `arquivo:linha`.

> **Status (2026-06-07):** Nuclei **v3.8.0** e Katana **v1.6.1** instalados em
> produção via `Dockerfile` (stage `tools` baixa binários estáticos amd64
> oficiais do ProjectDiscovery + roda `nuclei -update-templates` no build —
> templates pre-baked, zero dependência de rede no primeiro scan). A Surpresa
> 1 desta seção foi resolvida; bloqueador removido para Wires 2, 4, 7. O
> resto do gap analysis permanece válido.

## TL;DR

Temos o esqueleto, **não temos o sistema nervoso**. Nuclei, Katana e
Playwright estão integrados como **caixas paralelas**, cada uma despejando
evidência num barramento (`Evidence[]`) que detectors leem por tipo. Nenhuma
delas alimenta as outras. Playwright **captura** XHR/fetch
(`workers/verification/playwright-runtime.ts:85-171`), Katana **descobre**
rotas JS (`workers/katana/runner.ts:55-127`), Nuclei roda templates
upstream contra `landing_url`
(`workers/ingestion/enrichment/nuclei-scan.ts:64`) — e os três terminam
em silos. A hipótese do fundador ("10-30% da capacidade") está
**confirmada para Katana e Playwright**, e **subestimada para Nuclei**:
não temos **um único template custom**, não usamos matchers, e não
alimentamos URLs descobertas. A pilha suporta a visão surface-centric;
o trabalho é rewiring + autoria de templates, não infra nova.

## A Classe do Problema

O caso Melissa (`/ccstore/v1/sites/B2CMN` retornando JSON de cupons em
público) é **uma instância de uma classe maior**: endpoints de plataforma
que (a) ninguém anchora em `<a>`, (b) ninguém digita na barra do
navegador, (c) o navegador real **chama** durante uma jornada normal de
compra, e (d) carregam dados sensíveis em payloads JSON estruturados.

Essa classe inclui:
APIs de carrinho/pricing/coupon das storefronts headless (Shopify
Storefront API, VTEX `/api/catalog_system`, Magento REST, OCC `/ccstore`,
SFCC OCAPI, BigCommerce Storefront API), GraphQL públicos não-introspect
mas enumeráveis, endpoints de busca/sugestão que indexam catálogo
interno, e endpoints de session/customer expostos por config errada de
CORS. Hoje **nenhum desses entra no raio de auditoria** — a unidade de
auditoria é "página HTML", e essas URLs vivem fora do grafo HTML.

## A Visão Arquitetural

Três primitivas que mudam a unidade de auditoria de "página HTML" para
"surface" (qualquer coisa fetchável da rede pública):

1. **Network-as-surface** — Promover URLs capturadas pelo Playwright (e
   por Katana com JS-crawl ligado) a surfaces de primeira classe. A fila
   de crawl passa a aceitar entradas vindas da camada de runtime.
2. **Body inspection** — Inspecionar **corpos** de resposta procurando
   shapes sensíveis (array de objetos com `code`/`discount`, lista de
   produtos com `cost`/`stock_keeping_unit`, etc.). Hipótese:
   **a maior parte disso já é first-class na DSL do Nuclei** — temos
   matchers `regex`/`dsl`/`word` com `part: body`, só não escrevemos um
   único template custom. LLM body classification é fallback para o
   que não casa.
3. **Platform endpoint catalog** — Quando o fingerprint detecta uma
   plataforma conhecida (OCC, Shopify, VTEX, Magento, SFCC,
   BigCommerce), **probar** sua família de endpoints conhecidos. Hoje
   o fingerprint só **rotula** — não age.

Disciplinas de custo: filtro same-origin nas URLs capturadas, dedup por
template de URL, hard cap de surfaces net-new por audit, gate em dois
estágios (heurística → LLM) para body inspection, cache TTL longo no
probe de catálogo por plataforma.

## Current State: What's Actually Wired

### Nuclei

| Item | Resposta |
| --- | --- |
| Onde é invocado | `workers/nuclei/runner.ts:55` (`runNucleiScan`) → único call site em `workers/ingestion/enrichment/nuclei-scan.ts:63` |
| Binário / versão | `nuclei` no PATH; **v3.8.0 pinada** via `ARG NUCLEI_VERSION` no `Dockerfile` stage `tools` (download estático amd64 + `nuclei -update-templates` pre-baked em `/root/.config/nuclei-templates`). Check em runtime: `workers/nuclei/runner.ts:44` (`isNucleiAvailable`) |
| Flags usadas | `-target`, `-templates`, `-rate-limit`, `-timeout`, `-json`, `-silent`, `-no-color` (`workers/nuclei/runner.ts:76-84`) |
| Templates carregados | **Apenas IDs upstream listados em `CURATED_CHECKS`** (`packages/nuclei-adapter/curated-checks.ts:18-245`). Sem diretório de templates custom, sem `nuclei-templates/`, sem `-t`/`-w` para workflows |
| Targets | **Somente `ctx.landing_url`** (`workers/ingestion/enrichment/nuclei-scan.ts:64`). Subdomínios descobertos NÃO são re-passados. URLs do Katana NÃO são passadas. URLs capturadas pelo Playwright NÃO são passadas |
| Matchers (`type: regex`, `type: dsl`, `part: body`) | **Zero uso direto no nosso código** — herdamos o que vem em cada template upstream listado. `CuratedNucleiCheck` (`packages/nuclei-adapter/types.ts:28-45`) não tem campo de matcher; é só `check_id` + `nuclei_template` (string ID) + classificação comercial |
| Rate / concorrência | `rate_limit: 10` rps, `max_templates: 50`, `timeout_seconds: 120`, `maxBuffer: 10MB` (`workers/nuclei/runner.ts:79-89`, `packages/nuclei-adapter/types.ts:101-105`) |
| Curated checks (nomes) | 19 ao todo: `vi_payment_xss_reflected`, `vi_payment_formjacking_risk`, `vi_payment_missing_csp`, `vi_payment_sri_missing`, `vi_channel_directory_listing`, `vi_channel_open_redirect`, `vi_channel_cors_wildcard`, `vi_ops_admin_panel_exposed`, `vi_ops_debug_exposed`, `vi_ops_env_file_exposed`, `vi_trust_missing_hsts`, `vi_trust_mixed_content`, `vi_trust_expired_cert`, `vi_abuse_api_exposed`, `vi_abuse_graphql_introspection`, `vi_abuse_cart_manipulation`, `vi_abuse_coupon_enumeration`, `vi_abuse_account_enumeration`, `vi_abuse_refund_endpoint_exposed`, `vi_abuse_rate_limit_missing` (`packages/nuclei-adapter/curated-checks.ts:22-244`) |
| Transformação da saída | `NucleiRawMatch` → `NucleiNormalizedMatch` em `packages/nuclei-adapter/normalizer.ts:21-50`. Filtro silencioso por `CHECK_INDEX` — qualquer template fora da lista é descartado. Vira `Evidence` em `workers/ingestion/enrichment/nuclei-scan.ts:85-116` |

### Katana

| Item | Resposta |
| --- | --- |
| Onde é invocado | `workers/katana/runner.ts:55` → único call site `workers/ingestion/enrichment/katana-discovery.ts:95` |
| Binário / versão | `katana` no PATH; **v1.6.1 pinada** via `ARG KATANA_VERSION` no `Dockerfile` stage `tools`. Check em runtime: `workers/katana/runner.ts:42` (`isKatanaAvailable`) |
| Flags usadas | `-u`, `-d`, `-crawl-duration`, `-rate-limit`, `-json`, `-silent`, `-no-color`, **`-headless`**, `-crawl-scope`, `-scope-filter` (`workers/katana/runner.ts:67-84`) |
| **JS parsing** | **NÃO**. `-jc` (`-js-crawl`) ausente. `-aff` (auto-form-fill) ausente. O comentário `// JS crawling mode — renders JavaScript` em `workers/katana/runner.ts:75` é **enganoso**: `-headless` sozinho renderiza a página, mas Katana extrai URLs do **DOM renderizado + HTML estático**, não do **bundle JS**. Para extrair endpoints embutidos em JS minificado é preciso `-jc` |
| Modo | `-headless` (`workers/katana/runner.ts:77`) |
| Depth / scope | `max_depth: 3`, `max_pages: 50` default / `100` em prod (`workers/ingestion/enrichment/katana-discovery.ts:97-98`), `same_host_only: true` |
| Destino da saída | **Apenas `Evidence` com `KatanaDiscoveryPayload`** (`workers/ingestion/enrichment/katana-discovery.ts:122-156`). Vai para o `signals/engine.ts:2548-2715` que conta `is_net_new`, `appears_guessable`, route_intent, etc. **NÃO realimenta crawl queue. NÃO alimenta Nuclei. NÃO popula `PageInventoryItem`.** A URL descoberta vira evidência morta — métrica sobre uma URL que ninguém mais visita |
| Concorrência | `rate_limit: 10` rps (`workers/ingestion/enrichment/katana-discovery.ts:100`) |
| Subdomain enum | **NÃO**. Katana não faz CT-log. Subdomínio vem de um pass separado (`subdomain-discovery.ts:48` — `crt.sh`). Esses **também não alimentam Nuclei nem o crawl** — só geram inferences cross-domain (`packages/inference/cross-domain-inference.ts:962-1087`) |
| Forms / parâmetros | Não — Katana não roda `-form-extraction` nem `-aff`. Forms são extraídos do HTML pelo parser estático (`workers/ingestion/staged-pipeline.ts:986-999`) |
| Eligibility gate | `shouldRun` exige `ctx.mode === 'full'` **E** `ctx.spa_detected === true` **E** condições de "discovery insuficiente" (`workers/ingestion/enrichment/katana-discovery.ts:26-70`). Para sites SSR clássicos com surfaces JSON expostas (Melissa é OCC SSR no shell + XHRs OCC), o gate **não dispara** |

### Playwright

| Item | Resposta |
| --- | --- |
| Onde é invocado | Dois caminhos distintos: (1) `workers/ingestion/playwright-renderer.ts:66` (`renderForIngestion`) — single-shot navigate-and-getContent para SPAs durante o crawl; (2) `workers/verification/playwright-runtime.ts:67` (`PlaywrightRuntime.executeScenario`) — multi-step orquestrado por `workers/verification/browser-worker.ts:74` |
| Páginas alvo (selective-headless) | Pega `ctx.landing_url` e roda 1-2 cenários de `buildStageDScenarios` (`workers/ingestion/enrichment/scenarios.ts:216-224`): commercial-path probe + support-reach probe. **Não anda funil**, **não adiciona ao carrinho**, **não vai pra checkout** |
| **Interações** | `navigate`, `click`, `type`, `wait_for`, `assert_visible`, `screenshot`, `wait_ms` (`workers/verification/browser-types.ts:21-28`). Cenários de `scenarios.ts` **só fazem `navigate` + `assert_visible` + `screenshot`** — clicks reais e fluxos add-to-cart **não são exercitados**. O comentário em `scenarios.ts:15-19` é explícito: "What this is NOT: aggressive funnel-walking with form fills, payment attempts, or anything that mutates customer state" |
| Captura: requests | **SIM** — `page.on('request')`, `page.on('response')`, `page.on('requestfailed')` em `playwright-runtime.ts:112-171`. Resultado: `CapturedNetworkRequest[]` com URL, host, método, status, role classificada (`payment_critical`, `measurement_critical`, etc.), `is_first_party` |
| Captura: console | SIM (`playwright-runtime.ts:118-122`) — só `console.error`, classificado em `RuntimeErrorBucket` (`browser-types.ts:129-215`) |
| Captura: screenshots | SIM (`playwright-runtime.ts:303-308`), salvos em `os.tmpdir()/vestigio-screenshots` |
| Captura: tracing/HAR | **NÃO**. Sem `context.tracing.start()`, sem `recordHar`. Só screenshots PNG |
| **Destino dos `CapturedNetworkRequest[]`** | **DEAD END**. Em `playwright-runtime.ts:243-245` os requests viram `NetworkAnalysisSummary` via `buildNetworkAnalysisSummary` (`browser-types.ts:346-445`) que **só guarda contagens/médias agregadas**. O array de URLs propriamente dito **não é serializado**. Pior: `browser-worker.ts:282-313` em `resultToEvidence` **nem lê `result.network_analysis`** — só emite `BrowserNavigationTrace` (com `redirect_chain`), `BrowserCheckoutConfirmation` e `BrowserFailureEvent`. **`NetworkAnalysisPayload` existe no domain (`packages/domain/evidence.ts:517-559`) mas nada o emite.** O array de URLs capturadas morre na heap |
| Storage / cookies / service workers | **NÃO**. Sem `context.storageState()`, sem leitura de `localStorage`/`sessionStorage`/IndexedDB. Sem inspeção de service workers |
| **`page.route` (interception)** | **NÃO** — zero uso em todo o codebase fora de `node_modules` (grep confirmou) |
| Browser context | Headless = true (`playwright-runtime.ts:96`). Viewport desktop 1280×720 ou mobile 375×812 com touch+UA iPhone (`playwright-runtime.ts:22-26, 99-107`). Sem geo, sem auth, sem proxy |
| Concorrência | `chromium-pool.ts` enforce slot semaphore por env `CHROMIUM_POOL_SIZE` (`playwright-runtime.ts:91-94`) |

### A abstração de "página" hoje

| Item | Resposta |
| --- | --- |
| Termo "surface" no código | **Existe, mas com outro significado**. Em `packages/surfaces/index.ts:27-94` `Surface` é uma **declaração do operador** (kind=`public`/`authenticated`/`mixed`, urlPattern com glob simples) usada para classificar evidência. Modelo Prisma `Surface` (`prisma/schema.prisma:426-459`) tem 1 row catch-all `*` por env. **`SurfaceRelation`** (`prisma/schema.prisma:1492-1512`) é uma tabela de arestas (anchor / form_action / iframe_src / script_src / stylesheet_src / redirect / canonical_external / intent_target / runtime_navigation) — registra o **grafo de links**, mas as URLs ali são strings, não entidades |
| Lifecycle "URL → entidade auditável" | URL entra via `candidates` array em `staged-pipeline.ts:317-484` → `coverage: Map<string, CoverageEntry>` → fetch → parse → `evidence` array → persistido como `PageInventoryItem` por audit-runner (referência em `prisma/schema.prisma:1426-1490`). **Detectors leem `Evidence[]` por tipo**, não `PageInventoryItem`. A "página" não é uma entidade — é um eixo de junção entre evidência + URL |
| Paths separados HTML / JSON / asset | **Um único pipeline**. `staged-pipeline.ts` faz `httpFetch` → `parsePage` em tudo. JSON/asset não tem branch dedicado. Por `parsePage` ser HTML-only, JSON entra, gera parse vazio, e morre como `Evidence` HTTP-response sem `PageContent` |
| **Filtro `.json` em `staged-pipeline.ts:950`** | `if (/\.(css|js|png|jpg\|...\|json)$/i.test(linkPath)) continue;` (`staged-pipeline.ts:950`). **Aplica-se apenas a depth-2 expansion de internal-links**, dentro do branch `mode === 'full' && isCommercialCriticalUrl(...)` (`staged-pipeline.ts:938`). Não é o único filtro: candidates iniciais também são gateados por `isErrorOrSystemPath` (`staged-pipeline.ts:588`). E, importante: a URL OCC `/ccstore/v1/sites/B2CMN` **não casa** com a regex `.json$` — o que filtra esses endpoints da realidade é simplesmente **nunca terem sido anchored em `<a>`** (o parser HTML não os vê) |

### Discovery sources matrix

| Fonte | Funciona? | Onde | Sistemático? |
| --- | --- | --- | --- |
| HTML `<a>` link extraction | SIM | `workers/ingestion/parser.ts` → `parsed.links` consumido em `staged-pipeline.ts:940-985` | Sim — todo crawl |
| Form action URLs | SIM | `staged-pipeline.ts:986-999` | Sim — depth-2 trigger only para `surfaceRelations`, não pra candidates |
| Critical-path catalog | SIM | `getCriticalPaths(businessModel)` em `packages/page-priority/index.ts:41-79` → `staged-pipeline.ts:578` (`candidates.push({ url: probeUrl, source: 'critical_path' })`) | Sim — gated por business model |
| **Playwright network capture** | **CAPTURADO MAS DESCARTADO** | `playwright-runtime.ts:112-171` | Captura sim; promoção a candidate **NÃO** |
| **Katana JS bundle parsing** | **NÃO** (flag `-jc` ausente) | n/a | n/a |
| Katana subdomain enum | NÃO (Katana não faz) | n/a | n/a |
| robots.txt | SIM | `staged-pipeline.ts:1360-1366` | Sim quando full |
| sitemap.xml + sitemap-index | SIM | `staged-pipeline.ts:1352-1413` | Sim — recurse 1 nível |
| `.well-known/` | **NÃO** | grep zero hits em código de crawl | — |
| `.js.map` source maps | **NÃO** | grep zero hits | — |
| Customer-provided HAR import | **NÃO** | nenhuma rota / endpoint / UI | — |
| Platform endpoint catalogs (por tech fingerprint) | **NÃO** | `technology-registry/registry.ts` só **rotula** plataforma; sem famílias de endpoint, sem probes. OCC, BigCommerce, SFCC **nem estão no registry** | — |
| Certificate Transparency (subdomínio) | SIM | `subdomain-discovery.ts:48` (`crt.sh`) | Sim full-mode; **mas resultado não vira target de Nuclei nem candidate** |

## The Gap Analysis

### Missing Wire 1 — Playwright `CapturedNetworkRequest[]` → surface registry / Nuclei target

**Onde aterrar:** o sink atual é `playwright-runtime.ts:243-245`
(`buildNetworkAnalysisSummary`) e `browser-worker.ts:282-313`
(`resultToEvidence`). Falta: emitir um novo
`EvidenceType.NetworkSurfaceCaptured` por request capturado (filtrado por
`is_first_party` + dedup por template de URL), e/ou expor o array fora do
`buildResult` para o staged-pipeline o re-incorporar como candidates.
`NetworkAnalysisPayload` em `packages/domain/evidence.ts:517-559`
**já existe** mas é só agregado — precisa de payload sibling tipo
`NetworkSurfacePayload` que carregue uma URL individual.

### Missing Wire 2 — Katana output → Nuclei target list

**Onde aterrar:** `katana-discovery.ts:108-156` produz
`KatanaClassifiedRoute[]` com `url`. Hoje vira evidência morta.
`nuclei-scan.ts:64` passa **só `ctx.landing_url`**. O fix: depois do
katana-discovery pass, derivar uma lista de targets (commercial-surface
URLs descobertas) e injetar em `runNucleiScan({ targets: [...] })`. Cap
por audit (ex: 20 targets net-new).

### Missing Wire 3 — Technology fingerprint → platform endpoint probes

**Onde aterrar:** `packages/technology-registry/registry.ts` precisa de
um campo novo `endpoint_catalog: string[]` (paths conhecidos por
plataforma). Quando a detecção dispara (`registry.ts` é só matching
hoje), um novo pass `platform-catalog-probe.ts` em
`workers/ingestion/enrichment/` percorreria as N URLs sobre o host atual
e empurraria as resolúveis pra candidate queue + Nuclei targets. OCC,
BigCommerce, SFCC, VTEX e Magento precisam ser **adicionados ao
registry** (hoje só Shopify, WooCommerce, Magento como nome,
WordPress, Wix, Squarespace, VTEX, Nuvemshop estão lá — sem OCC, sem
SFCC, sem BigCommerce).

### Missing Wire 4 — Custom Nuclei templates para shapes de body

**Onde aterrar:** novo diretório `packages/nuclei-templates/` (não
existe) com `.yaml` próprios. `runNucleiScan` em
`workers/nuclei/runner.ts:76-84` precisa aceitar caminho de template
file via `-t <path>` ou `-w` (workflow). `CuratedNucleiCheck` em
`packages/nuclei-adapter/types.ts:28-45` precisa de novo campo
`template_path` (filesystem) além do `nuclei_template` (ID upstream).
**Hipótese do fundador validada**: 100% dos shapes que precisamos
(`type: regex` + `part: body`, `type: dsl` com `len(body) > X`,
`type: word` com lista de keys JSON) já são DSL nativa do Nuclei; só
não escrevemos.

### Missing Wire 5 — `NetworkAnalysisPayload` actually emitted

**Onde aterrar:** `browser-worker.ts:257-316` `resultToEvidence` lê
`result.observations` e `result.artifacts` mas **nunca lê
`result.network_analysis`** (que é populado em `playwright-runtime.ts:258`).
Mesmo o agregado já implementado nunca chega ao banco. Adicionar o
emitter aqui é trivial (~10 linhas) e desbloqueia detectors que olham
para `payment_requests_failed`, `third_party_total_weight_ms`, etc.

### Missing Wire 6 — Surface diff entre cycles

**Onde aterrar:** `PageProbe` (`prisma/schema.prisma:383-403`) já guarda
`contentHash + changedFromPrior + priorHash` por URL — mas a tabela é
sobre **conteúdo de página HTML**, não sobre **conjunto de surfaces
expostas**. Para always-on drift signals ("apareceu uma URL JSON nova"),
falta um `SurfaceObservation { url, first_seen_cycle, last_seen_cycle,
fingerprint_hash }`. Pode reaproveitar `Surface` se generalizarmos a
semântica — ou criar `DiscoveredSurface` paralelo para não quebrar a
declaração do operador.

### Missing Wire 7 — Katana com `-jc`

**Onde aterrar:** `workers/katana/runner.ts:67-84` — adicionar `-jc`,
`-aff` (auto-form-fill com valores fake), opcionalmente
`-js-crawl-scope`. Custo: Katana com `-jc` é 3-10× mais lento; o gate
em `katana-discovery.ts:26-70` precisa ficar mais conservador, e o
output volume requer dedup mais agressivo. Trivial em código, não-trivial
em config.

### Missing Wire 8 — Body inspection trigger

**Onde aterrar:** novo pass `body-inspection.ts` que (1) lê evidências
de surfaces JSON capturadas (após Wire 1), (2) re-fetcha o body, (3)
roda matchers heurísticos (lista compilada de shapes sensíveis), (4)
escalona LLM apenas para o que casa heurística mas precisa
interpretação. Sem ele, mesmo com URLs no inventário não detectamos
vazamento.

## Findings / Signals Desbloqueados

| Finding / sinal | Wires necessários |
| --- | --- |
| Coupon enumeration via endpoint público | Wire 1 + 3 + 4 (ou Wire 1 + 8) |
| Pricing/SKU leakage via Storefront API | Wire 1 + 3 + 8 |
| GraphQL enumeration sem introspection ligada | Wire 1 + 4 |
| CORS mal configurado em endpoints commerce (`Access-Control-Allow-Origin: *` em `/api/cart`) | Wire 1 + 4 (`vi_channel_cors_wildcard` já existe mas alvo é só `landing_url`) |
| Admin/staging panel em subdomínio | Subdomain já descobre — falta passar para Nuclei (variante de Wire 2 com fonte = subdomain) |
| Drift de surface entre cycles ("ontem este endpoint não existia") | Wire 6 |
| Endpoints embutidos em JS chunk (Stripe key, webhook URL, internal API base) | Wire 7 (Katana `-jc`) + Wire 8 |
| Customer data via session/account endpoint público | Wire 1 + 8 |

## Sequencing & Effort

Sizing: S = 1-2 dias, M = 3-7 dias, L = 2-3 semanas, XL = mês+.
Estimativas pressupõem 1 dev focado, sem reescrita de testes existentes.

| Primitiva | Wires | Effort | O que desbloqueia |
| --- | --- | --- | --- |
| Network-as-surface | 1, 5, 7 | **M-L** (Wire 1 + 5 são S cada; Wire 7 é M por causa de tuning) | Inventário inclui URLs JSON/XHR. Pré-requisito de todo o resto |
| Body inspection (Nuclei-first) | 4, 8 | **M** (3-5 templates iniciais como prova; pass de orquestração) | Coupon leak, pricing leak, GraphQL enum, CORS commerce |
| Platform catalog | 3 | **M** (registry expansion + novo pass + cache TTL) | OCC, SFCC, BigCommerce, VTEX, Magento, Shopify Storefront — em paralelo a fingerprint que já existe |
| Katana → Nuclei chain | 2 | **S** (≤2 dias) — passar arrays, deduplicar | Dobra a superfície varrida por Nuclei sem rodar template novo |
| Surface drift | 6 | **L** (mudança de schema + cycle-diff logic + UI signal) | Always-on revenue protection thesis — pré-requisito da Phase II |

Caminho mínimo viável para resolver o caso Melissa: **Wire 1 + Wire 3 +
Wire 4** (rodar OCC catalog + custom template `vi_abuse_coupon_body_shape`
contra os endpoints capturados). Estimativa: ~7-10 dias úteis.

## Open Questions

1. **Katana `-jc` em produção:** qual o custo real (wall-clock) em sites
   com bundles tipo Next.js/Vite de 2-5MB? Code-reading sugere 3-10× mas
   precisa benchmark contra `havefunnels.com` + um SPA pesado real.
2. **Nuclei template authoring loop:** o time tem padrão de teste para
   templates custom (fixture servers, golden files)? `nuclei -validate`
   e `nuclei -t <path>` estão disponíveis em v3.8.0 (versão pinada via
   Dockerfile) — o gap real é definir convenção de fixtures e CI.
3. **Schema diff para Surface:** se a primitiva 1 emite N URLs por
   audit, `PageInventoryItem` vira gigantesco. Devemos criar
   `NetworkSurface` separado (more granular, sem `pageType`) ou
   estender `PageInventoryItem.pageType` com `'api'`/`'xhr'` e aceitar
   linhas com `statusCode` mas sem `title`?
4. **Body inspection — o que fazemos com o body fetcheado?** Não
   queremos armazenar payloads completos (LGPD + custo). Mas o evidence
   precisa de **alguma prova**. Hash + N primeiros bytes? Schema
   inferido sem valores?
5. **Same-origin filter exato:** considerar `pay.dominio.com`,
   `seguro.dominio.com` (CHECKOUT_SUBDOMAIN_REGEX em
   `packages/page-priority/index.ts:113`) como same-origin para
   propósito de surface promotion? Provavelmente sim, mas hoje o
   `is_first_party` em `playwright-runtime.ts:128, 155` exige sufixo
   exato da apex.
6. **OCC/BigCommerce/SFCC fingerprint:** existe header/cookie/script
   pattern documentado para cada um, ou vamos ter que descobrir
   empiricamente customer-by-customer?
7. **O agregado `NetworkAnalysisPayload` que existe mas nunca foi
   emitido — bug ou feature parada?** Quem escreveu o
   `buildNetworkAnalysisSummary` (Phase 2D nos comentários) e por que o
   loop final nunca foi fechado? Pode haver razão de privacy/compliance
   que não vimos.

## Apêndice: File:line Index

**Nuclei**
- `workers/nuclei/runner.ts:55` — `runNucleiScan`
- `workers/nuclei/runner.ts:76-84` — flags atuais
- `workers/ingestion/enrichment/nuclei-scan.ts:64` — único callsite, targets = `[landing_url]`
- `packages/nuclei-adapter/curated-checks.ts:18-245` — 19 curated checks
- `packages/nuclei-adapter/types.ts:28-45` — `CuratedNucleiCheck` schema (sem campo de matcher / template path)
- `packages/nuclei-adapter/normalizer.ts:21-50` — drop silencioso de templates fora da lista

**Katana**
- `workers/katana/runner.ts:55` — `runKatanaScan`
- `workers/katana/runner.ts:67-84` — flags (sem `-jc`, sem `-aff`)
- `workers/katana/runner.ts:75` — comentário enganoso "JS crawling mode"
- `workers/ingestion/enrichment/katana-discovery.ts:26-70` — `shouldRun` (require SPA detected)
- `workers/ingestion/enrichment/katana-discovery.ts:122-156` — evidence emission (não realimenta crawl)
- `packages/katana-adapter/types.ts:53-74` — `KatanaClassifiedRoute`

**Playwright**
- `workers/ingestion/playwright-renderer.ts:66` — render single-shot (ingestion-side)
- `workers/verification/playwright-runtime.ts:67` — `executeScenario`
- `workers/verification/playwright-runtime.ts:85-171` — captura de network requests
- `workers/verification/playwright-runtime.ts:243-245` — `buildNetworkAnalysisSummary` (dead-end)
- `workers/verification/playwright-runtime.ts:258` — `result.network_analysis` populado, nunca lido downstream
- `workers/verification/browser-worker.ts:282-313` — `resultToEvidence` (não lê `network_analysis`)
- `workers/verification/browser-types.ts:246-259` — `CapturedNetworkRequest`
- `workers/ingestion/enrichment/scenarios.ts:37-224` — cenários (sem clicks reais, sem add-to-cart)
- `workers/ingestion/enrichment/selective-headless.ts:59-92` — gate (mode=full, mas SPA não exigido mais)

**Surface / página**
- `packages/surfaces/index.ts:27-94` — `Surface` = declaração do operador
- `prisma/schema.prisma:426-459` — `Surface` (modelo)
- `prisma/schema.prisma:1492-1512` — `SurfaceRelation` (link graph)
- `prisma/schema.prisma:1426-1490` — `PageInventoryItem`
- `prisma/schema.prisma:383-403` — `PageProbe` (content hash diff)
- `workers/ingestion/staged-pipeline.ts:208-217` — `SurfaceRelationEntry`
- `workers/ingestion/staged-pipeline.ts:938-950` — depth-2 expansion + filtro `.json`
- `workers/ingestion/staged-pipeline.ts:986-999` — form actions → surface relations

**Technology registry**
- `packages/technology-registry/registry.ts:19-` — só Shopify, WordPress, WooCommerce, Magento, Wix, Squarespace, VTEX, Nuvemshop, payments. **Sem OCC, sem BigCommerce, sem SFCC.**

**Discovery sources**
- `workers/ingestion/staged-pipeline.ts:1352-1413` — sitemap + sitemap-index
- `workers/ingestion/staged-pipeline.ts:1360-1366` — robots.txt
- `workers/ingestion/staged-pipeline.ts:578` — critical-path probes
- `workers/ingestion/enrichment/subdomain-discovery.ts:48-83` — CT logs (crt.sh)
- `packages/page-priority/index.ts:41-79` — critical paths por business model

**Domain (evidência de rede que existe mas nunca é emitida)**
- `packages/domain/evidence.ts:517-559` — `NetworkAnalysisPayload`
- `packages/domain/enums.ts:208` — `EvidenceType.NetworkAnalysis`

## Outras Phases Mal Entregues / Surpresas Adicionais

Esta seção mapeia outras meias-entregas e mortes silenciosas que **não** são os
três casos já documentados acima (`NetworkAnalysisPayload`, Katana sem `-jc`,
colisão de "surface"). Foco em surpresas que afetam o refactor surface-audit
ou que representam capacidade de detecção que o sistema **acha que tem mas
não tem**. Todas com `path:linha` confirmando producer e consumer.

### Surpresa 1: ~~Nuclei e Katana nunca foram instalados em produção~~ — **RESOLVIDA (2026-06-07)**

Stage `tools` no `Dockerfile` baixa binários estáticos amd64 oficiais
(`nuclei v3.8.0`, `katana v1.6.1`) e roda `nuclei -update-templates` no
build pra pre-bakear o template tree em `/root/.config/nuclei-templates/`.
O stage `runner` copia binários (`/usr/local/bin/{nuclei,katana}`) +
templates. `isNucleiAvailable`/`isKatanaAvailable` (`workers/nuclei/runner.ts:42`,
`workers/katana/runner.ts:42`) agora retornam `true` em prod.

Bloqueador removido para Wires 2, 4, 7. **O resto da análise do refactor
permanece válida** — autoria de templates customizados, JS-crawl tuning,
e os wires de rewiring continuam pendentes.

### Surpresa 2: Phase 2D ("Mobile & runtime") tem **detectores prontos mas zero produtores**

- **Onde**: `packages/signals/engine.ts:1867-1924` (`extractMobileVerificationSignals`) e `packages/signals/engine.ts:1926-1988` (`extractClassifiedRuntimeErrorsSignals`)
- **O que deveria acontecer**: dois detectores que leem `EvidenceType.MobileVerificationResult` e `EvidenceType.ClassifiedRuntimeErrors` e emitem sinais sobre fragilidade mobile e erros runtime classificados
- **O que acontece de fato**: **nenhum produtor existe.** Grep por `evidence_type: EvidenceType.MobileVerificationResult` em código não-teste retorna zero hits. Mesmo para `ClassifiedRuntimeErrors`. O `RuntimeErrorBucket` em `workers/verification/browser-types.ts:129-215` classifica erros internamente, mas `playwright-runtime.ts` não constrói `ClassifiedRuntimeErrorsPayload` (`packages/domain/evidence.ts:444`). Cenários ainda são desktop-only (1280×720) e o viewport mobile só aparece em `playwright-runtime.ts:22-26` como constante sem callsite — **o cenário "mobile" nunca roda em produção**
- **Por que importa**: a hipótese de "mobile_revenue" e "checkout em mobile quebrado" é uma das mais comuns em e-commerce. O sistema declara que detecta, mas zero sinais mobile podem disparar. Para o surface refactor: se promovermos URLs JSON capturadas a surfaces, **ainda assim não saberemos se elas falham em mobile** porque o cenário mobile não roda
- **Esforço pra consertar**: **M** — `playwright-runtime.ts` precisa de uma segunda passada com viewport mobile + emissão de `MobileVerificationResultPayload` + `ClassifiedRuntimeErrorsPayload`. Os signal extractors estão prontos
- **Evidência**: `packages/signals/engine.ts:1874` (`byType.get(EvidenceType.MobileVerificationResult)`); `packages/signals/engine.ts:1936` (`byType.get(EvidenceType.ClassifiedRuntimeErrors)`); `packages/domain/enums.ts:200-202` (declaração); `workers/verification/playwright-runtime.ts:22-26` (`MOBILE_VIEWPORT` const) — nenhum lugar emite `evidence_type: EvidenceType.MobileVerificationResult`. Tests inventam o payload em `tests/commerce-heuristics.test.ts:1217` mas produção não

### Surpresa 3: `SuppressionRule` Prisma é **escrita por ninguém, lida por ninguém em produção**

- **Onde**: `prisma/schema.prisma:1389-1404` (modelo) e `packages/workspace/recompute.ts:1013-1041` (consumidor)
- **O que deveria acontecer**: customers/admins criam regras de supressão pela UI, audit-runner carrega `prisma.suppressionRule.findMany({ where: { scopeRef, isActive: true } })`, passa em `input.suppression_rules` para `recompute()`, e a Phase 26 do recompute (`recompute.ts:1013`) penaliza/cap a confiança das decisions afetadas
- **O que acontece de fato**: `grep -rn "prisma\.suppressionRule"` retorna **zero hits**. Não existe API route, não existe componente UI, e o `apps/audit-runner/run-cycle.ts` nunca consulta a tabela nem passa `suppression_rules` em `engine.run`. O default `input.suppression_rules || []` em `recompute.ts:1015` significa que a Phase 26 **só executa em testes** (`tests/e2e-behavioral-audit.test.ts:367,480,496,507,709`)
- **Por que importa**: a feature inteira de "operador pode silenciar findings irrelevantes" não existe. Customers reclamando de findings ruidosos só têm o caminho de feedback/manual. Para o surface refactor: se Wires 1-4 explodirem o volume de findings (centenas de surfaces JSON), **não há válvula de escape**. Construir essa válvula é pré-requisito de qualquer expansão de superfície
- **Esforço pra consertar**: **M** — schema + recompute estão prontos. Falta API CRUD + UI + hook no `run-cycle.ts` para carregar e passar
- **Evidência**: `prisma/schema.prisma:1389-1404`; `packages/workspace/recompute.ts:1015,1020`; `packages/suppression/confidence-applicator.ts:32` (função existe); `tests/behavioral-audit.test.ts:418-672` (heavy test coverage); `grep -rn "prisma\.suppressionRule"` em código não-teste = 0 hits

### Surpresa 4: `EvidenceType.PlaywrightRender` é **escrita mas ninguém lê**

- **Onde**: `workers/ingestion/staged-pipeline.ts:415-435` e `staged-pipeline.ts:884-901`
- **O que deveria acontecer**: depois de cada render Playwright durante ingestion, uma evidência `PlaywrightRender` carimba a página com `rendered_dom_length`, `console_error_count`, `render_duration_ms`. Algum detector deveria ler isso e sinalizar "esta página depende de JS para ter conteúdo" ou "este SPA tem erro de runtime no boot"
- **O que acontece de fato**: produto emite em 2 lugares, **ninguém consome**. Grep `EvidenceType.PlaywrightRender` em signals/inference = 0 hits. O `playwright_renders` count em `(result as any).playwright_renders` (`run-cycle.ts:777`) é só telemetria de log, não vira finding
- **Por que importa**: para o surface refactor, esse era um sinal natural — "SPA detectado e tivemos que renderizar com Playwright" é meta-informação para a heurística de surface promotion. Hoje a heurística usa `ctx.spa_detected` em vez (`katana-discovery.ts:43`), mas a evidência PlaywrightRender carrega mais sinal (DOM length, error count) e está morta
- **Esforço pra consertar**: **S** — escrever 1-2 extractors em `packages/signals/engine.ts` que leem `EvidenceType.PlaywrightRender` e disparam sinais como `spa_runtime_error_on_boot` ou `static_html_empty_needs_render`
- **Evidência**: `workers/ingestion/staged-pipeline.ts:415` (emite); `staged-pipeline.ts:891` (emite); `packages/domain/enums.ts:223` (`PlaywrightRender = 'playwright_render'`); zero hits em `packages/signals/`, `packages/inference/`, `packages/intelligence/`

### Surpresa 5: `SurfaceVitality` — função aggregadora + payload + enum, todos isolados

- **Onde**: `packages/behavioral/session-aggregator.ts:392-428` (`extractVitalityFromEvents`), `packages/domain/evidence.ts:750-770` (payload), `packages/domain/enums.ts:215` (enum)
- **O que deveria acontecer**: `extractVitalityFromEvents` deveria ser chamada em `apps/audit-runner/process-behavioral.ts` (ao lado de `aggregateSession` + `aggregateCohorts`), emitindo evidência `SurfaceVitality` por surface_id que captura `is_live`, `last_heartbeat_at`, `js_error_rate`, `resource_error_rate`. Algum detector deveria usar para sinalizar "surface morta há X dias" ou "erros JS por sessão acima do normal"
- **O que acontece de fato**: a função `extractVitalityFromEvents` **é definida mas nunca chamada**. `grep -rn "extractVitalityFromEvents"` retorna só a definição. `packages/signals/engine.ts:32` importa `SurfaceVitalityPayload` mas não usa o tipo (import morto). `EvidenceType.SurfaceVitality` tem zero produtores e zero consumidores no código não-teste
- **Por que importa**: a heurística de "surface drift" (Missing Wire 6 do doc principal) menciona ressuscitar essa primitiva. Antes de planejar `SurfaceObservation { first_seen_cycle, last_seen_cycle }`, vale entender que **já existe** infraestrutura conceitual de "surface alive vs morta" via heartbeat, só não foi ligada
- **Esforço pra consertar**: **M** — chamar `extractVitalityFromEvents` no `process-behavioral.ts:204` (logo após `sessionPayload`), construir um Evidence wrapper, e escrever 1-2 signal extractors. Mas combinar com o redesign de Surface entity (Missing Wire 6) é mais inteligente do que ressuscitar isolado
- **Evidência**: `packages/behavioral/session-aggregator.ts:392-428` (definida); `grep -rn "extractVitalityFromEvents"` = só self-reference; `packages/signals/engine.ts:32` (import morto); `packages/domain/enums.ts:215` (zero leitores/emissores)

### Surpresa 6: Endpoints autenticados de SaaS emitem evidência **que ninguém consome**

- **Onde**: `workers/verification/authenticated-runtime.ts:476-562` (emite `AuthenticatedSessionAttempt`, `AuthenticationBlockedEvent`, `PrerequisiteMissingEvent`)
- **O que deveria acontecer**: o `AuthenticatedJourneyExecutor` (`workers/verification/executors.ts:299-450+`) executa cenários autenticados em SaaS, emite as 3 evidências acima, e detectores de signals/inference deveriam ler para sinalizar "auth falhou", "MFA descobriu", "credencial incompleta"
- **O que acontece de fato**: a infra emissora existe e está integrada no orchestrator (`workers/verification/orchestrator.ts:65`), **mas zero detectores leem essas 3 evidence types**. `grep -rn "EvidenceType.AuthenticatedSessionAttempt"` em código não-teste/não-domain retorna apenas os emitters em `authenticated-runtime.ts`. `packages/signals/`, `packages/inference/`, `packages/intelligence/` = 0 hits. Os tests em `tests/saas-auth-runtime.test.ts:265-304` validam que a evidência é gerada, mas o ciclo nunca fecha
- **Por que importa**: o vertical SaaS depende criticamente de poder distinguir "checkout funcionou" de "tentei login e quebrou". Hoje as evidências viram lixo bem-formatado. Para o surface refactor: surfaces autenticadas são justamente o caso onde "API endpoint sem auth" vira "API endpoint **com** auth — entrei e a coisa falhou". Sem detector dessa evidência, mesmo descobrindo a surface, não há como gerar finding
- **Esforço pra consertar**: **M** — escrever 3-5 signal extractors em `packages/signals/engine.ts` para `AuthenticatedSessionAttempt` (sucesso vs falha), `AuthenticationBlockedEvent` (MFA, captcha, IP block) e `PrerequisiteMissingEvent` (sem credencial, sem TOTP secret)
- **Evidência**: `workers/verification/authenticated-runtime.ts:476,501,562` (emitters únicos); `packages/domain/enums.ts:186-188` (declaração); `packages/domain/surface.ts:117,123,124` (só roteia para surface kind); zero detectores em produção

### Surpresa 7: MCP analytics — sessions, prompts, suggestion clicks **nunca são persistidos em produção**

- **Onde**: `apps/platform/mcp-persistence.ts:99-110` (interface store), `apps/platform/mcp-persistence.ts:202-308` (`PrismaMcpStore` writes via `prisma.mcpPromptEvent`, `prisma.mcpSession`, `prisma.mcpSuggestionClick`, `prisma.playbookRun`, `prisma.analysisJob`)
- **O que deveria acontecer**: cada interação do MCP (prompt, sugestão clicada, playbook iniciado) deveria gerar uma row para analítica posterior (entender padrões de uso, otimizar sugestões)
- **O que acontece de fato**: `grep -rn "savePromptEvent\|saveSuggestionClick\|saveSession\|recordSuggestionClick\|startPlaybookRun"` em código não-teste retorna **apenas as definições e o re-export em index**. Nenhum call site real. O singleton `PrismaMcpStore` existe (`apps/platform/production-state-lock.ts:241`) mas seus métodos nunca são chamados pela camada de chat/MCP/playbooks. Tabelas `McpPromptEvent`, `McpSession`, `McpSuggestionClick`, `PlaybookRun` ficam vazias em produção
- **Por que importa**: não afeta surface-audit refactor diretamente, mas é uma instância clara do padrão "infraestrutura de telemetria que ninguém puxou o gatilho de gravar". Se há decisões de produto baseadas em "qual sugestão MCP funciona melhor", estão sendo tomadas no escuro
- **Esforço pra consertar**: **S-M** — adicionar chamadas a `mcpStore.savePromptEvent()` em `apps/mcp/llm/pipeline.ts` (depois de cada resposta) e `mcpStore.saveSession()` em `apps/mcp/server.ts` (no end-of-conversation). Suggestion clicks precisam de hook na UI
- **Evidência**: `apps/platform/mcp-persistence.ts:202,241,258,280` (writes existem na classe); `grep -rn "savePromptEvent\b"` em código não-teste/não-self = 0; `apps/mcp/suggestion-engine-v2.ts:392` (`recordSuggestionClick` existe) sem callsite externo

### Surpresa 8: `EvidenceType.BehavioralEvent` e `EvidenceType.IntegrationSnapshot` são enums **mortos**

- **Onde**: `packages/domain/enums.ts:180-181`
- **O que deveria acontecer**: cada enum value tem semântica documentada — `BehavioralEvent` ("sent from the in-browser pixel") e `IntegrationSnapshot` (snapshot Shopify/Stripe/ads). Deveriam ser tipo de evidência usados pelos respectivos produtores
- **O que acontece de fato**: nenhum produtor usa `evidence_type: EvidenceType.BehavioralEvent` (o pixel grava direto em `RawBehavioralEvent` e o reducer emite `BehavioralSession`/`BehavioralCohort` payloads sob `EvidenceType.BehavioralSession`). Nenhum produtor usa `evidence_type: EvidenceType.IntegrationSnapshot` (o engine recebe `integration_snapshots: IntegrationSnapshot[]` direto via `engine.run` input, fora do Evidence bus). Os consumidores em `packages/classification/maturity.ts:65` e `packages/workspace/recompute.ts:1349` que filtram por essas evidências **nunca retornam linhas**
- **Por que importa**: efeito direto no scoring de "maturity" e "evidence_coverage" — duas dimensões inteiras (behavioral, integration) estão sempre em zero porque a checagem é por tipo de evidência que ninguém emite. O classification engine acha que o customer não tem behavioral data **mesmo quando tem**
- **Esforço pra consertar**: **S** — ou (a) wrappear o array `integration_snapshots` em evidências `IntegrationSnapshot` antes de chegar no recompute, ou (b) reescrever os consumers para checar `EvidenceType.BehavioralSession` + presença de `integration_snapshots` no input. Opção (b) é menos invasiva
- **Evidência**: `packages/domain/enums.ts:180,181` (declarados); `grep -rn "evidence_type: EvidenceType.BehavioralEvent"` = 0 produtores; `grep -rn "evidence_type: EvidenceType.IntegrationSnapshot"` = 0 produtores; `packages/classification/maturity.ts:65` e `recompute.ts:1349` (consumidores que nunca disparam)

### Surpresa 9: Phase 2D — não só payload mas **bloco inteiro de 7 detectores** de signal está morto

- **Onde**: `packages/signals/engine.ts:2837-3000+` (função `extractNetworkAnalysisSignals`)
- **O que deveria acontecer**: 7+ detectores que leem `EvidenceType.NetworkAnalysis`: `checkout_api_latency_degrading`, `commercial_pages_slower`, `mobile_payment_slow`, `mobile_render_blocking_third_party`, `measurement_critical_failed`, `payment_critical_failed`, etc.
- **O que acontece de fato**: a doc principal já notou que `NetworkAnalysisPayload` nunca é emitido em `browser-worker.ts:282-313`. Mas o tamanho do que está morto vai além do payload — são **160+ linhas de lógica de detecção** (`engine.ts:2851-3000+`) que nunca foram exercitadas em produção, e portanto nunca foram realmente validadas. Quando Wire 5 (emitir o payload) for ligado, **esse bloco vai disparar dezenas de sinais nunca testados contra dados reais**
- **Por que importa**: aviso de detonação. Não é só "adicionar 10 linhas em browser-worker e ligar". É "ligar 7 detectores estáticos que vão de uma hora pra outra começar a emitir signal_keys que nunca apareceram no console". Vai gerar enxurrada de findings novos no próximo cycle de cada customer. **Precisa de feature flag e roll-out gradual**
- **Esforço pra consertar (sized junto com Wire 5)**: **M-L** — emitir o payload é S, mas validar comportamento dos 7 detectores em customer real (havefunnels primeiro) é M; observação de FP rate por 1-2 semanas é L
- **Evidência**: `packages/signals/engine.ts:2837-3000+`; thresholds inventados sem ground truth (`payment_slowest_ms > 3000`, `> 5000`, `> 8000` em linhas 2878, 2885) — números sem evidence-base de calibração

### Suspeitas a Verificar

Items que parecem suspeitos mas não tive como confirmar 100% sem rodar contra um banco de prod:

- **`OpportunityTracking` parece "tracking" mas só roda em status manuais**. `prisma.opportunityTracking.upsert` só dispara em `src/app/api/actions/[id]/status/route.ts:135` — i.e. quando o customer clica botão de status. Sem clique = zero rows. Verificar: a UI realmente expõe esses botões? (`grep -rn "status.*identified\|status.*sized\|status.*accepted"` no client)
- **`UptimeCheck` table escreve só via admin route + alert evaluator**. `src/libs/health-checker.ts:165` chama via `runAndPersistHealthChecks` → `src/app/api/admin/health-check/route.ts` (manual) e `src/libs/alert-evaluator.ts:51` lê count. **Não existe cron rodando uptime automaticamente** — confirmar grep por `setInterval.*runAndPersistHealth`. Se sim, é uma quarta surpresa: monitoring de uptime existe mas é só botão de admin
- **`MarketingEvent` e `ABTest` são admin-only**. Toda a tabela `MarketingEvent` é gravada via `src/app/api/analytics/event/route.ts:39` (pixel público) e lida só por `src/app/api/admin/marketing/stats/route.ts`. **Os customers nunca veem dados de A/B test que não sejam os admin runs** — confirmar se isso é intencional ou meio-pé-no-projeto
- **`semantic-enrichment.ts:1450` (`analyzeCrossPageConsistency`)** roda dentro de gate de budget — vale conferir se em sites grandes (>100 páginas) o budget se exaure antes dessa última passada
- **`competitor-fetch.ts` + `serp-observation.ts` + `customer-voice.ts` (Waves 24/25/27)** todos emitem evidência. Confirmei que `competitor_page_snapshot`, `serp_results`, `customer_voice_snapshot` têm consumidores em signals/inference. Mas o **volume real** desses passes em prod (Brave Search API key, Reclame Aqui rate limits) é desconhecido — pode estar falhando silenciosamente como Nuclei

### Padrões Observados

Três padrões claros recorrentes:

1. **"Producer-consumer assymmetry"**: a maioria das mortes são tipos de evidência ou métodos de store que têm **uma das duas pontas, nunca as duas**. O padrão é claro — alguém escreveu o consumidor (signal extractor) primeiro, antecipando que o produtor viria depois, e o produtor nunca chegou. Ou o oposto: produtor entusiasmado, consumidor esquecido. Isso sugere falta de **integration tests end-to-end por feature** que rodariam o caminho completo "evento → evidência → signal → finding" e gritariam quando uma ponta sumisse.

2. **"Infra sem instalação"**: Nuclei + Katana mostraram que features inteiras dependiam de binários externos que **nunca foram adicionados ao build** (resolvido em 2026-06-07, ver Surpresa 1). O padrão — "alguém testou local, comitou, esqueceu de fechar o loop em Dockerfile" — pode estar em outros lugares. **Ação aberta**: auditar todos os `execFile`/`spawn` no codebase para confirmar quantos binários mais estão nessa situação (`ripgrep -n "execFile\(|spawn\(" workers/ apps/ packages/`).

3. **"Phase abandonada"**: Phases 2B, 2D, 4B (e o `SurfaceVitality` da behavioral) compartilham o anti-padrão: tipo de evidência declarado em enum, payload definido em domain, signal extractor escrito, **mas o pass de coleta nunca foi implementado**. Sugere que o time documenta "vamos coletar X" antes de instrumentar, e quando a instrumentação não cabe no sprint, o resto fica órfão. Os enums viram lápides.

Implicação para o surface-audit refactor: **antes de adicionar Wires 1-8, fazer uma varredura "todos os produtores instalados, todos os consumidores acessíveis"**. Caso contrário cada Wire novo arrisca virar Surpresa N+1 desta lista em 6 meses.

## Triagem, Decisões e Verificação das Suspeitas (2026-06-07)

Sessão de revisão das 8 surpresas restantes + 4 suspeitas, com decisões
arquiteturais tomadas pelo fundador e validação operacional via grep.

### Decisões tomadas

1. **`NetworkSurface` / `DiscoveredSurface` paralelo ao `Surface` existente.**
   Não estender semanticamente o modelo do operador (`packages/surfaces/index.ts:27-94`,
   modelo Prisma em `prisma/schema.prisma:426-459`). Razão: overload de
   "Surface" tornaria a tabela operator-declared (escopo, glob URL pattern,
   classification) incompatível com a tabela de surfaces descobertas em
   runtime (URL exata, fingerprint hash, first/last seen cycle, body shape).
   Schema mais limpo separar — vale o custo de migração.

2. **Surpresa 2 (Mobile pass) separada do Wire 1.** Apesar de Wire 1 já
   tocar em `playwright-runtime.ts`, adicionar uma segunda passada mobile +
   emitir `MobileVerificationResultPayload` é escopo real, não one-liner.
   Combinar arriscaria estourar o Wire 1. Mobile vira ticket próprio, com
   sua própria validação contra havefunnels.

3. **Verificação operacional das suspeitas.** Rodada via grep (resultados
   na seção abaixo). Resultado material: confirmada 2ª instância do padrão
   "infra sem instalação" (BRAVE_SEARCH_API_KEY) — Wave 25 (SERP) está
   silent-skipping em produção. Vira ação aberta para o operator.

### Triagem das 8 surpresas

Categorias: **(a)** blocker ou embed obrigatório em Wire; **(b)** atalho
quase-grátis durante o refactor — embed no mesmo PR; **(c)** ticket próprio
sem urgência para o surface refactor.

| # | Surpresa | Categoria | Posicionamento no ROADMAP |
| --- | --- | --- | --- |
| 3 | `SuppressionRule` sem produtor/consumer | **(a)** | **Wire 0** — antes de qualquer expansão de finding volume. Schema + recompute prontos; falta API CRUD + UI + load em `run-cycle.ts`. ~5 dias |
| 9 | Phase 2D — 160+ linhas de detectores mortos | **(a)** | **Embed em Wire 5**: feature flag + havefunnels-only rollout + 1-2 semanas observação antes de expandir. Não vira item separado |
| 4 | `PlaywrightRender` evidence dead read | **(b)** | **Embed em Wire 1** (mesmo PR): adicionar 2 signal extractors (`spa_runtime_error_on_boot`, `static_html_empty_needs_render`). +1 dia |
| 5 | `SurfaceVitality` infra órfã | **(b)** | **Embed em Wire 6**: reusar `extractVitalityFromEvents` em vez de reinventar surface drift. Decisão de `NetworkSurface` paralelo facilita |
| 2 | Phase 2B — Mobile pass nunca roda | **(c)** | **Separado** (decisão acima). Ticket próprio depois do Wire 1 estabilizar |
| 6 | Authenticated session evidence sem detectores | **(c)** | Backlog SaaS vertical — depois de PMF, quando focarmos no vertical autenticado |
| 7 | MCP analytics sem call sites | **(c)** | Backlog produto. Decisões sobre sugestões MCP estão sendo tomadas no escuro; vale ticket prio média |
| 8 | `BehavioralEvent` + `IntegrationSnapshot` enums mortos | **(c)** | Quick win **S** (~1 dia). Reescrever consumers em `maturity.ts:65` + `recompute.ts:1349` para checar presença de payload no input em vez de evidence type morto. Fazer entre wires |

### Resolução das 4 suspeitas

| Suspeita | Estado verificado | Próxima ação |
| --- | --- | --- |
| **1.** `OpportunityTracking` ativada só por status manual | **CONFIRMADA MORTA**. Grep client-side: zero fetches a `/api/actions/[id]/status` em `src/app/`, `src/components/`. API + schema + recompute existem; UI não chama | Backlog **S** — adicionar botões em `src/app/app/actions/page.tsx` que POST status changes. Decisão de produto: quais transições expor? |
| **2.** `UptimeCheck` sem cron, só botão admin | **VIVA mas arquiteturalmente quebrada**. `startHealthCheckTimer()` (`src/libs/health-checker.ts:190`) é chamado em `src/app/app/layout.tsx:23` — Next.js layout do web service, **não no worker**, **sem leader election**. O comentário em `src/libs/leader-election.ts:10` literalmente avisa do problema. Multi-replica → N intervals concorrentes; web reinicia → cron some até alguém acessar `/app` | Backlog **M** — mover para audit-runner worker com leader-election guard. Tirar do layout |
| **3.** `MarketingEvent` + `ABTest` admin-only | **CONFIRMADA admin-only**. Única rota customer-facing é `src/app/api/analytics/event/route.ts:39` (escrita do pixel). Zero rota de leitura customer-facing — todas em `src/app/api/admin/marketing/` | Decisão de produto. Clientes deveriam ver seus próprios resultados de A/B? Se sim, ticket **M**. Se não, doc isso como decisão e remover o ABTest table da maturity scoring |
| **4.** `BRAVE_SEARCH_API_KEY` provavelmente não configurado | **MUITO PROVAVELMENTE UNSET EM PROD.** Não está em `.env.example`, nenhum doc, nenhum runbook, nenhum railway config. Gate em código (`workers/ingestion/enrichment/serp-observation.ts:182` retorna `"Skipped: no SERP provider configured"` silenciosamente). **Mesmo padrão da Surpresa 1 (Nuclei/Katana antes do install)** | **Ação operacional imediata**: o operator (você) precisa verificar no painel Railway se a env var está configurada. Se não, decidir: configurar (pega Brave Search API key, ~$3-5/mês) ou marcar Wave 25 como descontinuada e remover o pass |

### Padrão consolidado

Duas instâncias confirmadas do anti-padrão "infra sem instalação" agora:

1. **Nuclei + Katana** (resolvido em 2026-06-07 via commit `dc6dbbc9`)
2. **BRAVE_SEARCH_API_KEY** (pendente verificação operacional no Railway)

Reforça a recomendação do doc original: **toda feature que depende de
binário externo ou API key precisa de "Definition of Delivered" que inclua
instalação/configuração em produção verificada**. Não basta passar local.

### Sequência final para o ROADMAP

```
Pré-flight:    Verificar Nuclei firing em próximo audit do havefunnels    passivo
Pré-flight:    Operator confere BRAVE_SEARCH_API_KEY no Railway           manual
Wire 0:        Surpresa 3 — SuppressionRule (API + UI + load)             ~5 dias
Wire 1 + 4:    Network-as-surface + PlaywrightRender extractors           ~5-7 dias
               (cria modelo NetworkSurface paralelo ao Surface existente)
Wire 5 + 9:    NetworkAnalysisPayload emitter + feature flag + rollout    ~7-10 dias
Wire 3:        Platform endpoint catalog (OCC, SFCC, BigCommerce…)        ~5 dias
Wire 4:        Custom Nuclei templates (vi_abuse_*_body_shape)            ~5 dias
Wire 2:        Katana → Nuclei chain                                      ~2 dias
Wire 7:        Katana -jc + tuning                                        ~5 dias
Wire 6 + 5:    Surface drift via NetworkSurface diff + SurfaceVitality    ~10-15 dias
Quick wins:    Surpresa 8 (enums mortos) entre wires                      ~1 dia
Backlog:       Surpresas 2 (Mobile), 6 (Auth), 7 (MCP analytics)          separadas
Backlog:       Suspeitas 1, 2, 3 (cada uma com decisão de produto)        separadas
```

Total caminho crítico até "70% de Nuclei/Katana + surface-centric viva":
**~45-55 dias úteis** (1 dev focado), assumindo nenhuma surpresa nova
descoberta durante implementação.

## Decisões e Cleanups Executados (2026-06-07)

Sessão de pós-triagem. Três decisões do fundador → quatro mudanças
materiais no codebase.

### Decisão 1: Brave Search removido — Tavily é provider único

Confirmado pelo operator que `TAVILY_API_KEY` está setada no Railway env
do worker (refuta a "Suspeita 4" — Wave 25 SERP **não** está silent-skipping;
estava só usando o provider esquerdo da factory). Decisão: remover
infraestrutura dual-provider, ficar puro-Tavily.

**Mudanças**:
- `workers/serp/brave-search.ts` deletado
- `workers/serp/provider.ts` simplificado (factory single-provider, comentário atualizado)
- `workers/serp/types.ts` comentários generalizados (não mais "Brave returns this flag")
- `workers/ingestion/enrichment/serp-observation.ts` skip message + rate-limit pacing atualizados
- `workers/ingestion/enrichment/runner.ts` comentário Wave 25 → `TAVILY_API_KEY`
- `packages/domain/evidence.ts` `SerpResultsPayload` docstrings atualizados
- `tests/tavily-adapter.test.ts` testes de "preference order" substituídos por "factory gating"
- `tests/competitive-serp.test.ts` fixture `provider: "brave_search"` → `"tavily"`
- `src/components/console/workspace/CompetitorRadar.tsx` copy customer-facing genérico ("SERP provider")
- `.env.example` ganhou seção `# SERP / Search Intelligence — Tavily [OPTIONAL]` com hint operacional
- `docs/MINI_AUDIT_STATE.md` "Zero Tavily/Brave" → "Zero Tavily"

**Padrão fechado**: o gap "infra sem instalação" da Suspeita 4 é resolvido
pela combinação (a) Tavily presente no Railway env, (b) `.env.example`
documentando a env var pra que próximo operator não cair na mesma armadilha.

### Decisão 2: UptimeCheck deletado — Railway healthcheck é canônico

`startHealthCheckTimer()` rodava no `src/app/app/layout.tsx` (service errado,
sem leader election, multi-replica race). Railway já fornece `/healthz`
healthcheck declarado em `railway.worker.json:31`. Decisão: deletar a
duplicação interna.

**Mudanças**:
- `prisma/schema.prisma` modelo `UptimeCheck` removido (próximo build do worker
  vai dropar a tabela via `prisma db push --accept-data-loss`)
- `src/libs/health-checker.ts` arquivo deletado
- `src/app/api/admin/health-check/route.ts` rota deletada
- `src/app/api/admin/uptime/route.ts` rota deletada
- `src/app/app/admin/system-health/` página deletada
- `src/app/app/layout.tsx` import + call de `startHealthCheckTimer` removidos
- `src/app/api/admin/usage/route.ts` `view === "health"` block removido
- `src/app/api/admin/alerts/route.ts` zod enum perdeu `"health_check"`
- `src/libs/alert-evaluator.ts` `case "health_check"` + comment removidos
- `src/app/app/admin/alerts/page.tsx` `METRIC_LABELS.health_check` removido
- `src/app/app/admin/overview/page.tsx` `HealthData` interface + state + fetch + StatCard de health removidos
- `src/staticData/sidebarData.tsx` nav link removido
- `src/components/app/sidebar-nav-data.ts` nav link removido
- `src/components/app/CommandPalette.tsx` entry removida
- `src/libs/notification-triggers.ts` comentário do `triggerPageDownNotification` atualizado (page-down agora reservado para Wire 6 / SurfaceVitality)
- `tests/unification.test.ts` rota deletada da lista de required routes

### Decisão 3: OpportunityTracking — completar inline, sem tela nova

Triage da Suspeita 1: o tracking **é essencial** (renewal narrative cego
sem ele), mas não merece tela nova. Localização correta: **botões inline
na actions page** (drawer existente, em `src/app/app/actions/page.tsx`
ao redor da `OperationalTimeline` em ~1402), com efeitos colaterais em
**(a)** plano de estratégia mensal e **(b)** contexto MCP.

**Estado atual** (não mudou neste commit, fica como item de ROADMAP):
- API `POST /api/actions/[id]/status` pronta (`src/app/api/actions/[id]/status/route.ts`)
- Schema `OpportunityTracking` pronto + recompute lógica
- UI lê e exibe status (`OperationalTimeline`) — botões de transição não wireados
- Zero fetches client-side da API

**Trabalho pendente** (estimativa M, ~3-5 dias):
1. Adicionar botões de transição (`identified`→`sized`→`accepted`→`implemented`/`archived`) na drawer/timeline da actions page
2. Onde o status muda, disparar refetch do plano de estratégia mensal (endpoint a identificar — provavelmente algum `/api/strategy/monthly` ou recompute via hook existente)
3. Invalidar/atualizar contexto MCP — provavelmente via `mcpStore.saveSession()` ou hook em `apps/mcp/`
4. Tests E2E: customer clica "accepted" → status persistido → plano mensal recomputa → próxima interação MCP reflete

**Posicionamento no ROADMAP**: vira ticket próprio, paralelo aos Wires
do surface refactor. Não bloqueia Wire 0 (SuppressionRule) nem outros.

### Padrão fechado: 2/3 instâncias da síndrome "infra sem instalação" resolvidas

- ✅ Nuclei + Katana (commit `dc6dbbc9`)
- ✅ BRAVE_SEARCH_API_KEY → Tavily migrado + documentado
- ⚠️ Sobra como **disciplina aberta**: Definition of Delivered para futuras features que dependam de env var ou binário externo — incluir "env var documentada em `.env.example` + binário verificado em prod" na lista de checks antes de fechar uma wave.
