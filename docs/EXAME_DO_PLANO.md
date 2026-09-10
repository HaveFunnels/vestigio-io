# Exame do Plano — por que ele parece raso (e é), e o que ele deveria ser

> Data: 2026-09-09 · Base: Plano de Setembro da Casa Montelle (env `cmqdy63ak…`),
> examinado em três camadas: JSON persistido em produção, página renderizada
> (impersonação + screenshots), e pipeline de geração (código, file:line).
>
> Este documento CENTRALIZA e supera as notas espalhadas sobre lacunas do
> plano (wow-gaps de apresentação/prova, veredito do cross-exam Casa
> Montelle, pendência Meta/Google Ads). O que estava certo nelas está
> incorporado aqui; trabalhe a partir deste arquivo.

---

## 0. Veredito

**Não é impressão sua. O plano é raso — e é raso por um motivo mensurável:
ele consome uma fração mínima do que a Vestigio coleta, e o que consome ele
apresenta na taxonomia interna do produto, não nas perguntas do dono.**

Dois números resumem o exame inteiro:

1. **O plano inteiro tem 14 KB de JSON.** Meses de crawl + 19.213 sessões de
   pixel + integrações comprimidos em menos texto que este documento.
2. **A seção "medido pelo pixel" lê 4 de ~50 campos** do agregado de sessão
   (`behavioral-measurement.ts:130-141`). Dead clicks, hesitação, backtracks,
   retries de formulário, abandono de campo, oscilação de carrinho, cupom,
   passo de pagamento, handoffs, CTA visto-vs-clicado, velocidade sentida —
   tudo coletado, nada chega ao plano.

O cliente que pediu "me mostre onde estou perdendo dinheiro" recebe: dois
404 fabricados no topo, um mesmo problema cobrado três vezes com três
valores diferentes, quatro cartões de memória zerados, 45 "concorrentes"
sem um sinal, e a mesma screenshot da homepage repetida em todos os passos.
**Ele não volta no mês 2 — e o mês 2, hoje, seria idêntico ao mês 1.**

O teste ácido que cada seção precisa passar:

> **"O ChatGPT conseguiria escrever isso olhando o site, sem o pixel, sem o
> histórico e sem as integrações?"** Se sim, a seção é commodity e não
> justifica mensalidade. Hoje, ~70% do plano falha nesse teste. O irônico:
> os dados que passam no teste (comportamento medido, spend real, diffs
> longitudinais) são exatamente os que o plano NÃO usa.

---

## 1. Exame linha por linha (como o cliente viu)

Andando a página de cima pra baixo. IDs `[P*]` = precisão/conteúdo,
`[A*]` = apresentação/styling, `[E*]` = estrutura/engenharia.

### 1.1 Banner "2 superfícies críticas com problema" — `/carrinho` e `/payment`, HTTP 404

**[P1 — o pior defeito do plano inteiro.]** A primeira coisa que o cliente
lê é que o "checkout · superfície primária" dele está quebrado. **Nenhuma
das duas páginas jamais existiu.** A loja é Shopify: o carrinho é `/cart`
(existe, 13 links de saída no grafo), o checkout é `seguro.casamontelle.com/c/<slug>`.

Cadeia do falso positivo, confirmada ponta a ponta:
- `packages/page-priority/index.ts:246-247` — lista-template de caminhos
  e-commerce (`/carrinho`, `/carro`, `/carrito`, `/payment`, `/pagamento`…);
- o pipeline proba esses caminhos e grava `PageInventoryItem` **independente
  do status** (mesmo padrão em `workers/ingestion/pipeline.ts:449-471`);
- `api/library/strategy/[month]/ecosystem/route.ts:86-115` seleciona
  `statusCode >= 400` + tier primary → banner vermelho no topo do plano.

Não há em lugar nenhum o critério óbvio: **"crítico" = estava vivo e
morreu** (já retornou 200 antes, ou foi descoberto por link real). Um chute
de template que 404a é o sistema reportando a própria invenção como
problema do cliente. O mesmo defeito de raiz contamina `buildRealPathSet`
(`packages/projections/engine.ts:1105-1117` não filtra status), então
findings podem citar superfícies-fantasma — é a MESMA família do `/account`
que o analista da NX4 apontou 5 vezes no cross-exam.

**Agravante estrutural [E1]:** `getRootDomain` pega os dois últimos labels
(`workers/ingestion/parser.ts:688-692`) — para `loja.com.br` o "root" vira
`com.br`, e `isSameDomain` aceita **qualquer** `*.com.br`. Escopo de crawl,
`crossDomainCount` e path-set erram juntos em todo domínio brasileiro.

### 1.2 Tese do mês

> "Vestigio identificou R$ 79.200/mês de perda potencial concentrada na
> página inicial e checkout, onde copy desalinhado dispersa o comprador
> antes do pedido."

**[P2 — língua.]** "Perda potencial concentrada", "copy desalinhado
dispersa o comprador" — isso é dialeto de agência de CRO, não a língua de
quem vende jogo de cama. O ICP fala: carrinho, frete, PIX, criativo,
anúncio, "tá caro", "não achei o cupom". A regra de voz existe
(`voice-rules.ts`) mas **só é aplicada em next-steps**; a tese, a narrativa
e o value-preview têm prompts pt-BR hardcoded que nunca passam por ela
(`monthly-thesis.ts:177-237` — sem `voiceRulesFor()`).

**[P3 — contradição interna.]** A tese diz "página inicial e checkout". A
narrativa diz "o tema se concentra na página inicial, 65% dos vazamentos"
e três parágrafos depois "os quatro maiores se concentram no carrinho. O
movimento principal deste mês é o carrinho". Três superfícies diferentes
disputando o título de "onde está o problema" no mesmo documento. O leitor
não sai sabendo onde focar — que era a única função da tese.

### 1.3 Hero metrics — "Onde você está em Setembro"

**[A1 — uma parede de zeros como primeira métrica.]** Dos 4 cartões:
Recuperado = R$ 0 (com texto de consolo), Vazando = R$ 79,2k, Em progresso
= 0 (→ 0%), e sparklines `[0,0,0,0,0,0]`. Três dos quatro cartões dizem
"nada aconteceu". Para um plano de mês 1-3 isso é matematicamente
inevitável — então **a seção está errada para a fase da conta**, não os
dados. Enquanto não existe histórico, esses cartões deveriam dar lugar ao
que o pixel JÁ mediu (sessões, origem dominante, funil de checkout), não a
promessas vazias.

**[E2 — custo escondido]:** cada sparkline dispara `aggregateMonth` 6× por
métrica = **12 varreduras completas de findings por geração de plano**
(`hero-metrics.ts:166-181`) para desenhar duas linhas de zeros.

### 1.4 "O que seus visitantes fizeram, por origem"

A única seção com dado 100% medido — e ela é boa no conteúdo (o alerta
TikTok 5s/90% é o melhor insight do plano). Mas:

**[A2 — origem sem identidade visual.]** `facebook`, `tiktok`,
`direto/sem origem` — minúsculas cruas, sem logo, sem capitalização. É
literal `normalizeSource()` retornando lowercase
(`behavioral-measurement.ts:86-92`) com passthrough de qualquer
`utm_source` arbitrário. Duas telas depois, a MESMA origem aparece como
"Facebook Ads"/"TikTok" porque JourneyReplays usa outro humanizador
(`journey-replays.ts:364-385`). **Não existe módulo compartilhado de
identidade de origem** (label + ícone + cor). É o tipo de detalhe que
separa "ferramenta séria" de "script de estagiário" na percepção de quem
paga.

**[P4 — o insight não vira ação.]** O alerta TikTok — o achado
comportamental mais forte do mês — **não gera nenhum next step**. A seção
de ação do plano ignora a seção de medição do plano.

**[P5 — dois totais de sessão no mesmo plano.]** Aqui: "19.213 sessões".
Na seção de jornadas: "de 51261 no total". Dois denominadores sem
reconciliação nem explicação (janelas diferentes, filtros diferentes). O
leitor desconfia dos dois.

### 1.5 "O que seu time recuperou" / "O que sua audit revelou"

**[A3]** "Seu time ainda não recuperou nada este mês." — cartão inteiro
dedicado a culpar o cliente no mês 1.

**[P6 — buyer segments com taxonomia de SaaS.]** "Para o time de
Marketing / de Desenvolvedores / para a Diretoria" — a Casa Montelle é uma
loja Shopify; provavelmente uma pessoa é os três "times". Pior: o maior
bucket de dinheiro (R$ 48,4k/mês) está endereçado a "Desenvolvedores" e
inclui findings de funil (`funnel_missing_stage_browse`) que não são de
engenharia. Labels hardcoded pt-BR (`pack-to-buyer.ts:71-75`), sem locale.

**[P7 — SEO slop com endereço errado.]** "Suas melhores páginas mal
aparecem nos resultados do Google · **/cart**" — finding de SEO apontando
para a página de CARRINHO (que não deve rankear nunca). Viola diretamente
a regra da casa (observação → comportamento de comprador → dinheiro;
nunca SEO genérico) e mina a credibilidade do resto.

**[P8]** "Script Supply Chain Risk · /cart" — título em inglês cru no meio
do plano pt-BR (título de inference key vazando sem tradução).

**[A4]** Faixas de impacto gigantes ("R$ 18,6k a R$ 78,1k" = 4×) exibidas
sem explicação de por que a incerteza é essa — lê-se como chute.

### 1.6 Narrativa "O que aconteceu em Setembro"

**[P9]** Abre com **"O checkout da página inicial opera com baixa
fricção"** — sintagma sem sentido (checkout DA página inicial?), em serif
display, primeiríssima frase da seção mais editorial do plano.

**[P10 — legenda da barra = taxonomia interna.]** "Consistência da
mensagem 35% · Integridade do funil 20% · Exposição no momento da compra
15% · Integridade da receita 10%…" — nomes de packs internos, que somam
90% e não significam nada para o dono da loja.

**[P11 — dinheiro de precisão falsa.]** "garantia escondida (R$ 7.500),
baixa visibilidade orgânica (R$ 7.000), risco na cadeia de scripts
(R$ 7.000), botões que competem (R$ 6.000)" — quatro estimativas de
heurística apresentadas com precisão de contador, uma delas o SEO-no-
carrinho do [P7].

### 1.7 "Sinais da marca" (concorrentes)

**[P12 — a seção que destrói confiança.]** Na tela: "CONCORRENTES — 45
monitorados — sem sinais este ciclo" (cartão vazio). No JSON: os 10
"ativos" incluem `businessforsale.eu`, `i95dev.com`, `instamojo.com`,
`shopeasy.ai`, `ecommercebrasil.com.br` — um marketplace de empresas à
venda, uma consultoria indiana, um gateway, um blog do setor. Zero
concorrentes reais de cama-mesa-banho. Origem: bootstrap automático pega
os **5 primeiros resultados de SERP sem revisão humana**
(`serp-observation.ts:171-173`), não existe cron de desativação (comentário
`:167` admite "future work"), então um pick ruim é permanente.
`withSignalsCount: 0` — a seção literalmente nunca produziu um sinal para
este cliente. **[A5]** E o header sobrepõe texto ("CARTEIRA" por cima de
"clonadores e concorrentes").

### 1.8 "Jornadas que custaram dinheiro este mês"

A ideia é a mais forte do plano (sessões reais + diagnóstico + "o que
testar" — os diagnósticos de LLM são genuinamente bons: "menu do produto
não responde", "indecisão repetida no seletor"). A execução derruba ela:

**[A6 — parece lista porque é lista.]** A "linha do tempo" é uma régua de
1px com pontos coloridos e linhas de texto uniformemente espaçadas
(`JourneyReplays.tsx:361-405`). Sem espaçamento proporcional ao tempo,
sem agrupamento visual por página, 10 tipos de evento mapeados em só 4
cores, contexto rico escondido atrás de hover (invisível no PDF). O design
doc prometia "custom inline SVG para timeline/sequence flow" nível
Miro/Figma (`PLAN_MONTHLY_STRATEGY.md §-1`) — o entregue é um `<ul>` com
bolinhas.

**[A7 — 12 linhas idênticas.]** `Clicou em "Próxima" em /products/vedaplus`
repetido 12 vezes consecutivas, sem compressão ("clicou 12× em Próxima" em
UMA linha com contagem). O carrossel vira ruído que enterra o padrão.

**[P13 — lixo técnico no título.]** "Comprador anônimo · TikTok ·
**(h1-h3/ c1 + c2 | cbo | prt) a**" — nome de campanha/utm cru no título
do cartão. E dentro da timeline: `Clicou em "<img src="//casamontelle.com/
cdn/shop/files/ChatGPTImage20de"` — **HTML vazado como label de evento**, e
`Clicou em "0"` (label de bullet de carrossel levado a sério pelo narrador:
"Clique no botão '0'…").

**[P14 — escala de dinheiro quebrada.]** As 3 jornadas somam R$ 190
(R$ 80 + R$ 80 + R$ 30) sob o título "jornadas que CUSTARAM dinheiro",
num plano cuja tese é R$ 79.200. Nenhuma ponte entre os dois números
(amostra → extrapolação). O leitor vê ou um número inflado ou um número
irrisório — os dois perdem.

### 1.9 "Onde focar este mês" (next steps)

**[P15 — o mesmo problema cobrado 3×.]** Passos 1, 2 e 3 são TODOS
política de troca/reembolso, com três preços diferentes: R$ 15.375 +
R$ 16.650 + R$ 10.000 = **R$ 42k/mês "sangrando" do mesmo problema
contado três vezes** (passo 3 admite: "mesma raiz do vazamento anterior").
E os passos 2 e 5 são ambos cookies/CSRF (R$ 16,7k + R$ 8,5k). O plano de
5 passos tem, na real, 3 assuntos.

**[P16 — passo Frankenstein.]** Passo 2: título "Risco de chargeback por
sessão exposta" (segurança), justificativa inteira sobre política de
reembolso (o assunto do passo 1), procedimento sobre HttpOnly/CSRF
(segurança de novo). Três assuntos costurados num card. Causa provável: o
LLM recebe o Action e "explica" com o contexto do passo anterior, sem
validação de coerência título↔reasoning↔procedimento.

**[P17 — alarmismo afirmado como fato.]** "sessões de comprador **estão
sendo roubadas** nas páginas comerciais" — risco teórico de flag de cookie
narrado como ataque em andamento. É o tipo de frase que ou (a) assusta o
cliente à toa, ou (b) quando ele checa e vê que não é verdade, mata a
confiança no resto.

**[P18 — dono errado.]** "Publique política de reembolso" → owner:
**Desenvolvedor**, 4-5 horas. Escrever política de troca não é tarefa de
dev, e numa Shopify não existe "time de dev".

**[A8 — a mesma screenshot em todos os passos.]** Todos os cards mostram o
MESMO banner promocional da homepage ("Aniversário 7 anos 60% OFF"), um
deles legendado **"SUA PÁGINA · /SITEMAP_PRODUCTS_1.XML"** — a screenshot
da homepage colada num passo sobre um sitemap XML. Causas no código:
matching por path com fallback global para `home`
(`PlanScreenshotContext.tsx:60-65`), screenshots não escopadas ao ciclo do
plano (`[month]/route.ts:628-639`), captura limitada a 5 superfícies
above-the-fold. E **[A9]**: `<img>` sem `onError` + URL pré-assinada de
R2 com validade de 1h mintada no mount (`r2-screenshots.ts:91-100`) —
aba aberta >1h ⇒ todas as imagens viram o glifo quebrado do browser
dentro de uma moldura estilizada com legenda. É exatamente a "estampa de
camiseta com preguiça" que você descreveu.

**[A10 — markdown mastigado.]** Backticks dos procedimentos renderizam
como acentos graves soltos ("configure `HttpOnly`…" vira "H̀ttpOnlỳ"), e
sobra português quebrado de dedupe ("Mesma técnica do Passo 1 (já
detalhada acima), aplicada este componente:").

**[P19 — a soma dos passos não bate com o headline.]** `combinedImpact`
por passo é o Action cru, sem cap e sem dedupe (`next-steps.ts:992-996`) —
os 5 passos somam mais que a exposição capada do hero. O analista externo
já tinha apontado "R$ sem teto"; o cap foi implementado no agregado
(`exposure-cap.ts`) mas **3 seções ainda o contornam**: next-steps,
continuity (`continuity.ts:146-187` — usa `Finding.status='resolved'`, a
EXATA semântica que `honest-aggregates.ts:80-89` documenta como proibida)
e cross-customer (`cross-customer-pattern.ts:129-136`).

### 1.10 "O que o próximo mês destrava" / "Memória dos meses anteriores"

**[P20 — promessas com números de vaidade e conteúdo errado.]** "Stripe +
behavioral entram no engine" (a loja é PIX/NX4 — Stripe é template de
SaaS), "findings ~40% mais específicas" (número inventado), "Com **2121
ciclos** já mapeados" (contagem interna da plataforma, irrelevante pro
cliente), "benchmark vs categoria em 4 meses" — sendo que
`benchmarkAvailability` é uma **string literal hardcoded**
(`memory-rollups.ts:146`); o serviço não existe.

**[A11 — quatro cartões de zeros.]** "Memória": 46 vazamentos × 4 janelas
idênticas + "Você ainda não marcou nada como resolvido" repetido 4×, com
corpos de cartão vazios enormes. E a caixa "Referências de mercado" quebra
linha no meio dos valores, citando "Amazon (Linden, 2006)" — um estudo de
20 anos atrás — como referência de conversão.

### 1.11 Problemas estruturais invisíveis na leitura, letais no uso

- **[E3 — o PDF exportado perde 3 seções silenciosamente.]** As rotas lazy
  (`journeys/`, `ecosystem/`, `predictive/`) não aceitam `export_token` —
  o chromium sem cookie leva 401 e o componente engole (`return null`).
  **Jornadas, ecossistema e preditivo NUNCA saem no PDF** — e foi o PDF
  que você levou pro analista externo.
- **[E4]** TOC rail fora de ordem vs DOM real, com 4 seções que existem
  mas não são navegáveis (`StrategyPlanPanel.tsx:634-669`).
- **[E5]** Seletor CSS morto no print (`strategy.css:133-137` — descendant
  selector para atributos que estão no MESMO elemento), o safety-net de
  revelar seções animadas nunca dispara.
- **[E6]** Locale pela metade: thesis/narrativa/value-preview com prompt
  pt-BR fixo; labels de buyer/memória/continuity/impersonators hardcoded.
  Um cliente `en` recebe um plano bilíngue quebrado.
- **[E7]** `researchRefs` desenhado, persistido, renderizado — e
  **permanentemente vazio** (`next-steps.ts:987`).
- **[E8]** Duas seções somem sem placeholder durante o load
  (`PredictiveLayer.tsx:91`, `EcosystemSection.tsx:125` — `return null`),
  causando layout shift e "buracos" na página.

---

## 2. O que você não está vendo: o inventário coletado-mas-não-consumido

Esta é a resposta central à sua pergunta. O padrão recorrente da casa
("shippar coleta sem consumo") não é um detalhe — **é a causa primária da
rasidão**. O plano é raso porque a camada de síntese só enxerga findings de
crawler; o material diferenciado está no banco, órfão:

| # | Dado | Onde está | Quem consome hoje | O que poderia responder |
|---|------|-----------|-------------------|--------------------------|
| 1 | **Meta/Google Ads: spend 30d, criativos completos (headline/body/CTA/destino), receita atribuída** | polled todo ciclo (`run-cycle.ts:1496,1582`) | **um boolean** (`IntegrationConnection` connected? — `value-preview.ts:45`) | "Você gastou R$ X no TikTok e ele comprou 5s de atenção" — o alerta atual diz "SE há verba"; o número exato está no banco. ROAS por origem. Criativo ↔ landing page (a promessa do anúncio vs o que a página confirma — a PRÓPRIA tese do plano, hoje sem evidência) |
| 2 | **~46 campos do SessionAggregate**: dead_click, hesitation_pause, rapid_backtrack, form_retry, input_focus_abandon, field_inventories, oscillation_pairs, cta_viewed/clicked, time_to_first_commercial_action | agregador calcula tudo (`session-aggregator.ts:440-452`) | só JourneyReplays lê alguns; seção "medido" lê 4 | Funil de fricção por página: "na PDP do conjunto-mason, 34% pausam perto do CTA e 12% clicam morto no menu" |
| 3 | **Funil de e-commerce medido**: cart_add, coupon_apply, shipping_calc, signup_gate_hit, shipping_step/payment_step_reached | idem | **zero packs de sinal, zero seções** | O funil REAL carrinho→frete→pagamento→pago com % medidas — a pergunta nº 1 de qualquer dono de loja. **Com o pixel agora no checkout NX4, isso inclui o checkout inteiro** |
| 4 | **Performance sentida**: load_ms, dom_ready_ms, js_error_count, resource_error_count por página | heartbeat coleta em toda page view | `aggregateSurfaceVitality()` tem **zero callers** | "Sua coleção demora 4,1s no celular do seu comprador; páginas acima de 3s convertem X% menos" — com dado do usuário real, não do crawler |
| 5 | **PageProbe diffs**: contentHash, changedFromPrior, statusCode, fetchMs por dia | probe-runner grava e lê sozinho | dispara re-narração **sem acesso ao diff** | "O que mudou desde ontem" — a espinha dorsal de um produto always-on. Hoje o plano não sabe dizer que a loja trocou o banner |
| 6 | **Atribuição além de first_touch.source**: medium, campaign, gclid, fbclid, latest_touch, touch_count | pixel envia tudo | 1 folha lida (`first_touch.source`) | Alerta por CAMPANHA ("a campanha cbo-prt do TikTok…"), não só por rede — hoje o utm cru vaza no título da jornada [P13] em vez de virar dimensão |
| 7 | **journey_type, last_exit_page, handoff_target_host** | agregados em toda sessão | nada | "Para onde seus compradores vazam" (WhatsApp? Instagram? concorrente?) — o handoff cego do cross-exam |
| 8 | **NetworkSurface** (endpoints de API descobertos) | `selective-headless.ts:425` | **zero leitores no repo inteiro** | — (candidato a deletar coleta) |
| 9 | **Evidence órfãs**: PlaywrightRender, InlineScriptContent, CompetitorDeepSnapshot (fora do radar) | ingestion | nenhum pack | — |
| 10 | **Finding.confidence / verificationMaturity** | engine calcula | nenhuma seção do gerador | Deixar o plano DIZER o que é certeza vs hipótese — ver §3.D |

E o inverso — **o que é exibido sem ter valor**: 45 concorrentes de SERP
sem curadoria [P12], 10 frameworks de copywriting B2B (Pixar, SPIN, BAB…)
aplicados à MESMA home de e-commerce repetindo a mesma conclusão 10 vezes
(copyLensJson: 10 audits, 1 página, 1 insight — "a home é um catálogo sem
narrativa"), 4 janelas de memória zeradas, marcos M3/M6/M12 com features
inexistentes.

---

## 3. Diagnóstico sistêmico — as 5 causas-raiz

**A. Coleta sem consumo.** §2. O moat está no banco, o plano lê crawler.

**B. A taxonomia interna vaza para o cliente.** Packs ("Integridade do
funil 20%"), inference keys em inglês, "Ciclo #2359" no breadcrumb, buyers
de SaaS (eng/marketing/diretoria) numa loja Shopify, frameworks de
copywriting como se fossem entregável. O plano está organizado pela
estrutura do BANCO, não pelas perguntas do DONO. As perguntas do dono são
três: **(1) Quanto entrou e o que ameaça isso? (2) Onde exatamente estou
perdendo comprador — e me PROVA. (3) O que eu mudo esta semana, em que
ordem?** Cada seção que não responde uma das três é peso morto.

**C. Dinheiro sem disciplina única.** O `openLossExposure` capado existe e
hero/tese/narrativa/segments usam. Mas: next-steps soma cru e sem dedupe
[P15, P19], continuity e cross-customer usam a semântica proibida de
`resolved`, retained é uncapped (`hero-metrics.ts:83-92`), e as jornadas
introduzem uma TERCEIRA escala (R$ 190) sem ponte. Regra que falta: **um
único módulo de dinheiro; toda cifra R$ no plano ou vem dele ou não
existe.** E dedupe por problema-raiz ANTES de virar passo: política de
troca é UM problema, UM passo, UM número.

**D. Verdade e invenção no mesmo nível visual.** O plano mistura, sem
hierarquia: (i) medido de verdade (19.213 sessões — ouro), (ii) heurística
com faixa (R$ 7.500 da garantia), (iii) template não-verificado (/carrinho
404, Stripe, benchmark prometido, "sessões sendo roubadas"). O cliente não
tem como saber qual é qual — então quando (iii) desmorona (e o dono da
loja SABE que não tem /carrinho), (i) morre junto. `Finding.confidence`
existe e não é lido. **Todo claim precisa carregar seu grau: MEDIDO /
ESTIMADO / VERIFICAR.**

**E. A apresentação não honra o padrão que o próprio design doc fixou.**
`PLAN_MONTHLY_STRATEGY.md §-1` exigiu "nível Miro/Notion/Figma", visx,
timeline custom, export bonito. Entregue: timeline-lista [A6], mesma
screenshot 3× com legenda de sitemap [A8], zeros como hero [A1], origem
sem logo [A2], PDF mutilado [E3], texto sobreposto [A5], markdown mastigado
[A10]. Não é falta de gosto — é que a barra visual foi definida e depois
não foi cobrada seção a seção.

---

## 4. O que o plano deveria ser — desenho alvo

Reorganizar o plano inteiro em torno das 3 perguntas do dono (§3.B), com o
grau de certeza explícito em cada claim:

```
1. PLACAR DO MÊS (medido)
   Sessões · origem → funil real (chegou → viu produto → carrinho →
   checkout → pagou) com % em cada degrau · vendas confirmadas (pixel
   confirm) · Δ vs mês anterior quando existir.
   → substitui: hero de zeros + behavioral atual

2. ONDE VOCÊ PERDE COMPRADOR (medido + prova)
   3-5 pontos de perda RANQUEADOS por sessões afetadas × valor,
   cada um com: screenshot DA PÁGINA CERTA, o comportamento medido
   (hesitação/dead click/abandono de campo), 1 jornada exemplar,
   e a estimativa R$ com faixa e grau.
   → substitui: buyer segments + narrative + journeys como seções soltas

3. SEU DINHEIRO DE ANÚNCIO (medido, integração)
   Spend por origem × comportamento da origem × receita atribuída.
   "R$ X em TikTok → 1.050 sessões de 5s → R$ 0 atribuído."
   → seção NOVA; os dados já são polled todo ciclo

4. O QUE MUDAR ESTA SEMANA (plano)
   3-5 passos DEDUPADOS por problema-raiz, um número por problema,
   coerência título↔causa↔procedimento validada, dono realista
   (uma pessoa), soma batendo com o headline.
   → substitui: next-steps atual

5. O QUE MUDOU DESDE O ÚLTIMO PLANO (longitudinal — o gancho do mês 2)
   Diffs do probe (banner trocou, página caiu DE VERDADE, preço mudou),
   passos concluídos → recuperado verificado, deltas.
   → substitui: memória de zeros + continuity; é o motivo de VOLTAR
```

Some depois, quando houver substância: benchmark real (Vestigio Index),
concorrentes CURADOS (3-5 reais, com sinal ou fora), copy-lens reduzido a
UMA conclusão acionável por página comercial.

**Sobre as suas hipóteses:** não é falta de skills nem de RAG — a síntese
LLM já produz bons diagnósticos quando recebe dado bom (as jornadas
provam). Parametrização melhor ajuda na margem (voz, locale, dono realista
por porte de loja — `businessContext` já existe e é subusado). O wedge não
precisa mudar: **comportamento medido + spend real + longitudinal é
exatamente o que o ChatGPT-olhando-o-site não tem.** O gap é de CONSUMO e
de DISCIPLINA, não de tese.

---

## 5. Plano de ataque proposto

### Onda 0 — Parar de mentir (pré-requisito de confiança; pequeno)
1. **[P1/E1]** Superfície crítica exige vida prévia (200 anterior ou link
   real de descoberta); probes-template 404 nunca entram em `realPaths`
  nem no banner. Corrigir `getRootDomain` (PSL) para `.com.br`.
2. **[P15/P16/P19]** Next-steps: dedupe por problema-raiz antes do LLM;
   validador de coerência título↔reasoning↔procedimento; impacto por passo
   passa pelo módulo único de dinheiro; alarmismo banido pelas voice rules
   ("estão sendo roubadas" → "não encontramos as proteções X").
3. **[P20]** Remover: Stripe-template, "~40%", "2121 ciclos", benchmark
   prometido sem serviço. Value-preview só promete o que existe.
4. **[P12]** Concorrentes: sem sinal E sem curadoria ⇒ seção não renderiza.
   Bootstrap de SERP passa a sugerir (aba de settings), nunca publicar.
5. **[P5]** Um denominador de sessões, declarado uma vez.

### Onda 1 — Parar de parecer quebrado (apresentação; médio)
6. **[A8/A9]** Screenshot: escopo do ciclo + match por URL completa; sem
   match exato ⇒ SEM imagem (nunca fallback de home); `onError` esconde a
   figura; presign renovado ou proxy; capturar as superfícies dos passos
   (não só top-5 do inventário).
7. **[A2]** Módulo único de identidade de origem (label + ícone + cor) para
   TODAS as seções.
8. **[A6/A7/P13]** Jornadas: comprimir eventos repetidos (×N), tempo
   proporcional (gaps visíveis), sanitizar labels (HTML/utm nunca chegam à
   UI), campanha vira metadado estruturado, contexto visível sem hover.
9. **[E3/E4/E5]** Export: `export_token` nas rotas lazy (o PDF vai pro
   analista externo — hoje vai mutilado); TOC = ordem real do DOM; corrigir
   seletor morto; `data-vsgp-print-hide` no MonthPicker.
10. **[A1/A3/A11]** Gate por fase da conta: mês sem histórico ⇒ hero
    comportamental no lugar de zeros; memória/continuity só renderizam com
    conteúdo real; markdown corretamente renderizado nos procedimentos.

### Onda 2 — Entregar o que só a Vestigio tem (o salto de valor; grande)
11. **Ledger de anúncio** (§2.1): spend × comportamento × atribuição por
    origem/campanha. Os dados já chegam todo ciclo.
12. **Funil de e-commerce medido** (§2.3): consumir os campos de carrinho/
    checkout do agregado — com o pixel no checkout NX4 o funil fecha até
    "pagou". Esta é a seção-âncora do novo plano (§4.1-2).
13. **"O que mudou"** (§2.5): probe diffs viram a seção longitudinal — o
    motor de retenção do mês 2+.
14. **Grau de certeza em todo claim** (§3.D): MEDIDO/ESTIMADO/VERIFICAR
    visível na UI; `Finding.confidence` finalmente lido.
15. **Voz única do ICP** (§3.B): voice rules em TODOS os prompts + labels;
    "ciclo #", packs e inference keys nunca aparecem para o cliente;
    dono-de-passo realista por porte (businessContext).

### Critério de aceite (o teste de outubro)
O plano de outubro da Casa Montelle, lido em 60 segundos por alguém que
não conhece a Vestigio, responde: quanto vendi e o que ameaça isso? · onde
exatamente perco comprador (com prova visual + medida)? · o que mudo esta
semana? · o que mudou desde setembro? — **sem nenhuma superfície
inexistente, sem número repetido em dobro, sem seção vazia, sem palavra
que a dona de uma loja de enxoval não usaria.**

---

## Apêndice — inventário completo de defeitos por ID

| ID | Resumo | Raiz (file:line) |
|----|--------|------------------|
| P1 ✅ | /carrinho e /payment 404 como "superfícies críticas" | CORRIGIDO: filtro compartilhado `EXCLUDE_UNCONFIRMED_SPECULATIVE` (src/lib/inventory-filters.ts) aplicado na rota ecosystem + inventário + console-data; `buildRealPathSet` rejeita evidence com status>=400 |
| P2 | Língua de agência, não do ICP | monthly-thesis.ts:177 (sem voiceRules) |
| P3 | Tese/narrativa citam 3 superfícies-foco diferentes | narrative.ts + thesis (sem validação cruzada) |
| P4 | Alerta TikTok não gera passo | next-steps só lê Actions de crawler |
| P5 ✅ | 19.213 vs 51.261 sessões no mesmo plano | CORRIGIDO: journeys conta em startedAt (não receivedAt do backfill) na MESMA janela de 30d do behavioral; legenda da UI nomeia a janela |
| P6 | Buyers de SaaS p/ loja Shopify; R$ 48k p/ "devs" | pack-to-buyer.ts:19-64 |
| P7 | SEO finding em /cart | resolveFindingSurface + baseline SEO |
| P8 | Título de finding em inglês cru | inference key sem label pt |
| P9 | "Checkout da página inicial" | narrative.ts prompt/inputs |
| P10 | Packs internos na legenda da barra | WhatHappenedNarrative.tsx:162-190 |
| P11 | 4 estimativas com precisão falsa | impact baselines exibidos sem grau |
| P12 ✅ | 45 "concorrentes" SERP sem curadoria, 0 sinais | CORRIGIDO: SERP vira sugestão inativa (ativação é decisão humana); seção só renderiza com curadoria manual ou sinal real; 29 linhas auto-ativas desativadas em prod |
| P13 | UTM cru no título; HTML como label; botão "0" | journey-replays.ts (persona/labels) |
| P14 | R$ 190 vs R$ 79.200 sem ponte | journeys sem extrapolação declarada |
| P15 ✅ | Mesmo problema em 3 passos, 3 preços | CORRIGIDO: dedupeByRootProblem — 1 passo por inference key compartilhada, greedy no ranking; +5 testes |
| P16 ✅ | Passo com título/razão/procedimento de 3 assuntos | CORRIGIDO: ângulo compounding_dependency removido (forçava 'mesma causa raiz do Passo 1' por posição); pós-dedupe a premissa é estruturalmente falsa |
| P17 ✅ | "Sessões estão sendo roubadas" como fato | CORRIGIDO: bans de ataque-ativo nos voice-rules (4 locales) + regra 13 HONESTIDADE no prompt (risco = ausência de proteção) |
| P18 | Política de troca → "Desenvolvedor 4-5h" | suggestedOwner do catálogo |
| P19 ✅ | Soma dos passos > headline capado | CORRIGIDO: combinedImpact escalado proporcionalmente pra caber no openLossExposure capado (pós-dedupe) |
| P20 ✅ | Stripe/40%/2121 ciclos/benchmark-fantasma | CORRIGIDO: marcos só prometem o que existe (vertical-aware, sem Stripe p/ e-commerce); narrativa sem cycleCount; benchmarkAvailability não é mais emitido |
| A1 | Hero = parede de zeros + sparklines 0 | hero-metrics p/ conta nova |
| A2 ✅ | facebook/tiktok minúsculo sem ícone; 2 humanizadores | CORRIGIDO: packages/behavioral/source-identity.ts (chave canônica + label + cor de marca); tabela renderiza dot+label; jornadas e alerta usam o mesmo módulo |
| A3 | "Seu time ainda não recuperou nada" | AttributionTimeline empty state |
| A4 | Faixas 4× sem explicação | BuyerSegments render |
| A5 | Texto sobreposto no header Carteira | Carteira.tsx |
| A6 | Timeline é lista uniforme, 4 cores p/ 10 tipos | JourneyReplays.tsx:117-128,361-405 |
| A7 | 12 eventos idênticos sem compressão | journey event builder |
| A8 ✅ | Mesma screenshot em todo passo; legenda sitemap.xml | CORRIGIDO: fallback de home morto (exact-only); rota escopa lote mais recente; legenda nomeia a superfície DA foto; worker captura páginas citadas por findings (MAX 8) |
| A9 ✅ | img sem onError; presign 1h expira na aba aberta | CORRIGIDO: onError esconde a figura inteira nos 2 pontos; presign 24h |
| A10 | Backticks viram acentos; "aplicada este componente" | NextSteps markdown + dedupe textual |
| A11 | 4 cartões de memória idênticos zerados | memory-rollups + MemoryRollups.tsx |
| E1 ✅ | getRootDomain quebra p/ .com.br | CORRIGIDO: `registrableDomain()` (packages/url-normalize/registrable-domain.ts) com sufixos multi-parte; 5 cópias ingênuas apontadas pra ele |
| E2 | 12 agregações completas p/ sparkline de zeros | hero-metrics.ts:166-181 |
| E3 ✅ | PDF perde journeys/ecosystem/predictive (401 silencioso) | CORRIGIDO: verifyExportTokenForEnvMonth nas 4 rotas lazy + planSectionQuery propaga o token nos fetches dos componentes |
| E4 ✅ | TOC ≠ DOM; 4 seções não navegáveis | CORRIGIDO: rail espelha a ordem real do DOM e inclui attribution/ecosystem/journeys/predictive |
| E5 ✅ | Seletor CSS morto no print | CORRIGIDO: safety-net escopado a [data-vsgp-print] (atributos no MESMO elemento); MonthPicker com print-hide |
| E6 | Locale pela metade | thesis/narrative/labels hardcoded |
| E7 | researchRefs sempre vazio | next-steps.ts:987 |
| E8 | Seções somem sem placeholder (layout shift) | PredictiveLayer.tsx:91; EcosystemSection.tsx:125 |
