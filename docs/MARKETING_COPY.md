# MARKETING_COPY.md - Plano de Marketing e Copy para a Vestigio

> Documento estrategico para reposicionar a Vestigio para venda direta.
>
> Baseado em:
> - `docs/PRODUCT_MODEL.md`
> - `docs/DECISION_ENGINE.md`
> - `docs/NORTHSTAR.md`
> - `docs/UX_SURFACES.md`
> - `docs/FRONTEND_DESCRIPTION.md`
> - homepage atual em `src/components/Home/*`
> - funil `/lp` e mini-audit em `src/app/(site)/lp/*`
> - referencia `docs/desiredexample.html` (Chargeflow)

## 1. Resumo Executivo

A melhor oportunidade da Vestigio nao e se vender como "analytics para SaaS", nem como "AI tool", nem como "crawler com dashboard".

A melhor oportunidade e se vender como:

**uma decision engine para negocios digitais que mostra onde voce esta perdendo dinheiro, o que corrigir primeiro e o que pode piorar se voce continuar escalando no escuro**

Isso muda tudo.

Hoje a home publica ainda comunica um SaaS generico. O produto real, porem, ja mostra algo muito mais forte:

- fila priorizada de acoes
- estimativa de impacto
- leitura de risco e upside
- auditoria de superficies e jornadas
- verificacao/corroboracao
- monitoramento de regressao

O caminho ideal nao e copiar a Chargeflow visualmente ou narrativamente. O caminho ideal e aprender com a clareza comercial dela:

- dor unica e imediata
- promessa forte
- prova visivel
- CTA cedo
- ritmo de urgencia
- assets que empurram o usuario para o proximo passo

Para a Vestigio, isso deve virar:

- home `/` = category creation + product proof + self-qualification
- `/lp` = direct response pesado + quiz/challenge + mini audit + checkout
- posicionamento = **negocio digital**, nao apenas **SaaS**

## 2. Verdades do Produto

Antes de qualquer copy, estas sao as verdades que a comunicacao precisa respeitar:

1. A Vestigio e **decision-first**, nao findings-first.
2. A superficie mais vendavel do produto e **Actions**, porque responde "o que eu faco agora?".
3. O produto existe para responder perguntas de negocio:
   - posso escalar trafego?
   - onde estou perdendo receita?
   - o que esta quebrando confianca?
   - o que corrigir primeiro?
4. Chat e importante, mas **chat nao e a categoria do produto**. Chat e interface de acesso.
5. Vestigio nao e:
   - PostHog com IA
   - Mixpanel com auditoria
   - scanner de seguranca
   - replay tool
   - checklist de CRO
6. O produto funciona melhor quando comunica:
   - impacto
   - prioridade
   - explicabilidade
   - verificacao
   - mudanca/regressao ao longo do tempo

## 3. ICP Recomendado

### ICP primario

O ICP ideal para venda direta nao e "enterprise".

O ICP ideal e:

**donos e operadores de negocios digitais com receita em operacao, dependencia de site/funil, e baixa tolerancia para perder dinheiro por friccao, erro, confianca fraca ou mensuracao ruim**

### Segmentos mais promissores

Em vez de segmentar por cargo, a Vestigio deve segmentar por **modelo de negocio** e **sintoma percebido**.

| Segmento | Dores mais fortes | Angulo mais forte |
|---|---|---|
| Ecommerce / lojas online | abandono, checkout fraco, chargeback, trafego desperdicado | "Onde seu checkout esta vazando dinheiro" |
| Infoprodutos / funis | promessa desalinhada, pagina fraca, handoff ruim, mensuracao fraca | "Nao compre mais trafego para funil quebrado" |
| SaaS / apps | onboarding, signup, pricing, churn inicial, regressao apos deploy | "O que esta travando conversao e ativacao" |
| Consultores, medicos, advogados, contadores | lead capture ruim, baixa confianca, paginas fracas, WhatsApp/form | "Por que seu site gera interesse mas nao gera contato" |
| Agencias de marketing | auditoria vendavel, prova de valor, retencao, upsell | "Use Vestigio para achar o que o cliente nao esta vendo" |
| Blog writers / publishers | CTA fraco, monetizacao, paginas lentas, queda de conversao | "Seu conteudo atrai, mas sua operacao captura?" |

### Importante

A homepage principal nao deve parecer "feita para todos".

Ela deve parecer feita para:

**quem tem um negocio digital rodando e sente que esta perdendo dinheiro sem enxergar onde**

## 4. Mapa Competitivo

### Concorrentes diretos? Ainda nao exatamente

PostHog e Mixpanel podem parecer concorrentes, mas na pratica sao **adjacentes**, nao o mesmo produto.

Eles respondem principalmente:

- o que aconteceu
- quem clicou
- onde caiu a conversao
- como eventos performaram

A Vestigio deve responder:

- o que esta arriscando crescimento
- o que esta vazando receita
- o que corrigir primeiro
- o que precisa ser verificado
- o que piorou desde o ultimo ciclo

### Como enquadrar os concorrentes

| Categoria | Exemplos | O que o comprador pensa | Como a Vestigio deve se diferenciar |
|---|---|---|---|
| Product analytics | PostHog, Mixpanel, Amplitude, GA4 | "Quero entender eventos e funnels" | "Analytics mostra o que aconteceu. Vestigio diz o que merece acao agora." |
| Session replay / UX behavior | Hotjar, Clarity, FullStory | "Quero ver o usuario sofrendo" | "Replay mostra sintomas. Vestigio transforma sinais em fila de prioridade." |
| SEO / site audit | Semrush, Ahrefs, Screaming Frog, Lighthouse | "Quero achar problemas no site" | "Checklist aponta issues. Vestigio cola impacto, prioridade e decisao de negocio." |
| Observability / errors | Sentry, Datadog RUM, LogRocket | "Quero monitorar bugs e performance" | "Observability mostra eventos tecnicos. Vestigio cruza confianca, receita, jornada e risco comercial." |
| Ferramentas nichadas | Chargeflow, Justt e afins | "Quero resolver um problema especifico" | "Vestigio cobre a operacao digital inteira, nao so um sintoma." |
| Consultoria / auditoria manual | agencias, freelancers CRO, consultores | "Quero um diagnostico especializado" | "Vestigio entrega diagnostico continuo, verificavel e escalavel." |

### Frase de posicionamento competitivo

Boa frase:

**PostHog e Mixpanel ajudam voce a medir. A Vestigio ajuda voce a decidir.**

Melhor ainda:

**Analytics te entrega eventos. A Vestigio te entrega uma fila defendavel do que corrigir, monitorar e validar.**

## 5. Diagnostico da Homepage Atual

### O que a home atual acerta

1. O tema visual escuro combina com a identidade do produto autenticado.
2. O `Product Tour` e uma boa decisao, porque o produto precisa ser visto.
3. A `MiniCalculator` e um asset comercial forte.
4. O resultado do mini-audit em `/lp/audit/result/[leadId]` ja tem um bom DNA de direct response.
5. O produto em si tem superficies com potencial comercial muito maior do que a maioria das startups early-stage.

### O que a home atual erra

1. O hero vende "SaaS intelligence on autopilot", mas o produto e mais amplo e mais concreto do que isso.
2. A copy principal e vaga demais:
   - "intelligence layer"
   - "evidence-based decisions"
   - "optimize your SaaS platform"
   Essas frases descrevem o mecanismo, nao o ganho.
3. O tour e a mini calculadora mostram exemplos muito mais proximos de ecommerce/funil/comercial do que de "SaaS intelligence".
4. Existe um conflito de categoria:
   - o hero fala SaaS
   - o tour fala checkout/cart/revenue leak
   - o LP fala website/landing audit
5. O site ainda carrega cara de boilerplate em algumas secoes:
   - features genericas
   - testimonials genericos
   - FAQ generico
   - counters potencialmente nao verificaveis
6. A home nao explora o fato mais vendavel do produto:
   - a Vestigio responde "o que eu faco agora?" com impacto e prioridade.
7. `/lp` ainda esta muito parecido com `/`.
   Isso desperdica a oportunidade de separar:
   - narrativa de marca
   - narrativa de conversao agressiva

### Diagnostico mais importante

Hoje a Vestigio parece, ao mesmo tempo:

- SaaS analytics
- website audit
- AI assistant
- revenue leak detector

Ela precisa parecer uma coisa so:

**um sistema que audita a operacao digital e transforma caos em decisoes priorizadas**

## 6. O Que Aprender com a Chargeflow

### O que a Chargeflow faz muito bem

1. Escolhe uma dor que qualquer comprador entende em segundos.
2. Usa resultado como headline, nao tecnologia.
3. Repete prova forte o tempo todo:
   - marcas
   - ROI
   - integracoes
   - taxa de sucesso
4. Quebra o produto em modulos comerciais faceis de comprar.
5. Tem CTA cedo, CTA repetido e CTA coerente.
6. Usa ferramentas gratuitas e calculators para capturar intent.
7. Mantem o ritmo da pagina sempre puxando o usuario para frente.

### O que a Vestigio nao deve copiar

1. Nao deve prometer numeros duros que ainda nao consegue defender.
2. Nao deve estreitar demais a categoria se o produto serve varios modelos de negocio.
3. Nao deve fingir uma precisao enterprise onde ainda faltam cases e provas publicas.

### Traducao correta do aprendizado

A Chargeflow vence pela clareza.

A Vestigio deve vencer por:

- clareza
- prova de produto
- agressividade controlada
- e um CTA de autodiagnostico impossivel de ignorar

## 7. Posicionamento Recomendado

### Categoria recomendada

**Decision engine para operacao digital**

Variacoes aceitaveis:

- intelligence engine para operacao digital
- auditor continuo de receita, risco e confianca
- sistema de decisao para funis e sites de negocios digitais

### Frase-mestra

**A Vestigio mostra onde seu negocio digital esta vazando dinheiro, o que corrigir primeiro e o que pode piorar se voce continuar escalando no escuro.**

### One-liner curta

**Auditoria, prioridade e monitoramento continuo para sites e funis que nao podem operar no escuro.**

### Versao mais agressiva

**Antes de comprar mais trafego, descubra o que no seu site ja esta desperdicando receita.**

### Versao mais factual

**A Vestigio audita suas superficies digitais, estima impacto, prioriza acoes e monitora regressoes com evidencias.**

## 8. Pilares de Mensagem

### Pilar 1 - Dinheiro perdido sem visibilidade

Mensagem:

**Voce nao precisa de mais dashboard. Voce precisa ver onde a operacao esta te custando dinheiro.**

### Pilar 2 - Prioridade acionavel

Mensagem:

**Vestigio nao despeja 100 achados. Ela organiza o que corrigir primeiro.**

### Pilar 3 - Confianca e verificacao

Mensagem:

**Nao e chute, nem "IA vibes". E diagnostico com evidencias, impacto e verificacao.**

### Pilar 4 - Continuo, nao pontual

Mensagem:

**O problema nao e so o que esta quebrado hoje. E o que vai piorar no proximo deploy, na proxima campanha e na proxima mudanca de rota.**

## 9. Linguagem Recomendada

### Palavras que devem aparecer mais

- receita
- trafego
- funil
- operacao digital
- confianca
- risco
- impacto
- prioridade
- regressao
- o que corrigir primeiro
- encontrar vazamentos
- destravar crescimento
- validar correcoes

### Palavras que devem aparecer menos

- intelligence layer
- optimize your SaaS platform
- AI-powered insights
- platform health
- compliance-first
- autopilot
- observability
- monitoramento abstrato

### Regra de copy

Sempre que possivel, substituir:

- mecanismo abstrato -> resultado concreto
- categoria tecnica -> pergunta de negocio
- feature -> decisao

## 10. Angulos de Marketing com Mais Potencial

### Ranking de maior potencial

| Prioridade | Angulo | Porque funciona | Onde usar melhor |
|---|---|---|---|
| 1 | **Nao compre mais trafego para um funil quebrado** | Dor imediata e universal em media buyer, infoproduto, ecommerce e lead gen | Meta Ads, TikTok Ads, advertorial, LP |
| 2 | **Veja onde seu site esta vazando dinheiro** | Traduz o valor em segundos | Hero, calculator, organic social, Taboola |
| 3 | **Descubra o que corrigir primeiro** | Tira ansiedade e overload | Homepage, LP, creative demo |
| 4 | **Passe no teste antes de escalar** | Introduz urgencia + challenge | quiz, challenge, pre-headline, retargeting |
| 5 | **Seu site parece bom. Sua operacao tambem?** | Explora gap entre estetica e performance real | organic viral, advertorial, founders |
| 6 | **Cada deploy pode criar um novo vazamento** | Forte para SaaS, apps, agencias e times de growth | lifecycle email, retargeting, homepage secondary story |
| 7 | **Pare de juntar 6 ferramentas para descobrir o obvio tarde demais** | Muito bom contra stack fragmentada | comparison page, landing B2B creator/agencies |

### Angulo principal recomendado para a home

**Descubra onde seu site/funil esta vazando dinheiro e o que corrigir primeiro antes de escalar.**

Esse angulo:

- e amplo o suficiente para o ICP
- e agressivo
- e factual
- conversa com os assets que voce ja possui
- aproxima a home do mini audit e do `/lp`

## 11. Features Mais Impactantes para a Home

Para nao overwelmar, a home deve vender na seguinte ordem:

### 1. Fila de Acoes Prioritarias

Essa e a melhor feature comercial do produto.

Frase:

**A Vestigio transforma sinais espalhados em uma fila clara do que voce deve corrigir agora.**

### 2. Estimativa de Impacto

Sem isso, a home vira mais uma ferramenta de "insights".

Frase:

**Nao diga so que ha problema. Mostre a faixa de impacto.**

### 3. Auditoria de Superficies e Jornadas

Isso da concretude.

Frase:

**Da homepage ao checkout, formulario, onboarding ou pagina de contato, a Vestigio mostra onde a experiencia quebra.**

### 4. Regressao e Monitoramento Continuo

Isso tira a sensacao de auditoria pontual.

Frase:

**Nao e so um scan. E um jeito de saber o que piorou depois.**

### 5. Verificacao / Corroboracao

Muito forte para credibilidade.

Frase:

**Achado serio precisa de evidencia seria.**

### 6. Workspaces por pergunta de negocio

Importante, mas secundario na home.

Frase:

**Organize diagnostico por objetivo: receita, escala, confianca, chargeback, mensuracao.**

### 7. AI Chat

Deve entrar como acelerador, nao como heroi.

Frase:

**Pergunte em linguagem natural. Decida com base em contexto real.**

### Recomendacao pratica

Na home publica, mostrar no maximo 4 promessas principais:

1. encontre vazamentos
2. priorize correcoes
3. valide com evidencias
4. monitore regressoes

## 12. Homepage Ideal da Vestigio

### Estrutura recomendada

#### 1. Hero de diagnostico imediato

Objetivo:

- parar o scroll
- comunicar dor
- puxar para auditoria

Headline recomendada:

**Descubra onde seu site esta vazando dinheiro antes de investir mais em trafego.**

Subheadline:

**A Vestigio audita sua operacao digital, estima impacto, mostra o que corrigir primeiro e monitora o que pode piorar depois.**

CTA primario:

- `Rodar auditoria gratis`

CTA secundario:

- `Ver o produto em acao`

Microcopy:

- `Funciona para ecommerce, SaaS, infoprodutos, servicos, apps e funis de lead.`

### 2. Input/challenge acima da dobra

Aqui entra um dos seus melhores assets:

- mini calculator
- quiz curto
- domain input

Recomendacao:

Transformar o primeiro bloco interativo em:

**"Passe no teste antes de escalar"**

Fluxo:

1. insere dominio
2. escolhe modelo de negocio
3. ve findings simulados/reais
4. CTA: `Unlock all findings`

### 3. Bloco "O que a Vestigio responde"

Em vez de "features", usar 4 perguntas:

- Onde estou perdendo dinheiro?
- O que eu corrijo primeiro?
- Posso escalar com seguranca?
- O que piorou desde a ultima analise?

Cada card deve apontar para um pedaco real do produto:

- Actions
- Analysis
- Workspaces
- Monitoring

### 4. Product tour com foco em Actions

O tour atual e bom, mas o enquadramento deve mudar.

Titulo:

**Nao e um dashboard. E uma fila de decisoes.**

Subtitulo:

**Veja como a Vestigio transforma achados, impacto e evidencias em prioridade operacional.**

Observacao critica:

Hoje o tour usa linguagem muito commerce-heavy enquanto o hero usa linguagem SaaS.
O ideal e o tour ter um toggle:

- Ecommerce
- SaaS
- Lead Gen
- Info

Isso aumenta identificacao sem mudar a estrutura tecnica do componente.

### 5. Bloco comparativo contra analytics/checklists

Titulo:

**Analytics mostram o que aconteceu. A Vestigio mostra o que fazer agora.**

Estrutura:

| Ferramenta | Mostra | Nao resolve |
|---|---|---|
| Analytics | eventos e funnels | prioridade e causa-raiz |
| Replay | sessoes e friccao | fila de correcoes |
| Audit tools | issues e score | impacto e decisao |
| Vestigio | risco, impacto, prioridade e verificacao | - |

Esse bloco e importante para neutralizar comparacao mental com PostHog/Mixpanel.

### 6. Bloco de prova de produto

Se ainda nao houver prova social forte, nao inventar.

Melhor usar:

- telas reais
- findings redacted
- resultado do mini-audit
- impacto estimado
- before/after state

Melhor titulo:

**Veja o tipo de coisa que a Vestigio encontra em minutos.**

### 7. Bloco de monitoramento e regressao

Titulo:

**O risco nao para quando a campanha sobe ou quando o deploy entra.**

Subtitulo:

**A Vestigio acompanha o que mudou, o que piorou e o que precisa ser revalidado.**

Esse bloco ajuda muito com:

- SaaS
- apps
- agencias
- negocios que vivem de performance

### 8. Segmentos de uso

Nao por cargo.

Por contexto:

- `Para quem vende online`
- `Para quem gera leads`
- `Para quem vende software`
- `Para quem gerencia clientes`

Cada card deve terminar com o mesmo CTA:

- `Ver como a Vestigio ajuda`

### 9. FAQ de objecoes reais

As objecoes certas nao sao "what pricing plans are available?".

As objecoes certas sao:

- Isso substitui analytics?
- Funciona se eu nao tiver pixel?
- Serve para meu tipo de negocio?
- A auditoria e automatica ou so um score?
- Como a Vestigio prova o que encontrou?
- O que eu vejo gratis antes de pagar?

### 10. CTA final

Titulo:

**Seu site pode estar operando pior do que parece.**

Subtitulo:

**Descubra o que esta custando receita, confianca e escala antes do proximo empurrao de trafego.**

CTA:

- `Rodar auditoria gratis`

Secundario:

- `Ver exemplo de findings`

## 13. Copys Recomendadas para o Hero

### Opcao A - Melhor equilibrio

**Descubra onde seu site esta vazando dinheiro antes de investir mais em trafego.**

### Opcao B - Mais agressiva

**Nao escale um funil quebrado. Descubra primeiro o que esta custando receita.**

### Opcao C - Mais ampla para negocio digital

**Veja o que esta travando crescimento na sua operacao digital e o que corrigir primeiro.**

### Opcao D - Mais founder-led

**Seu site pode parecer bom e ainda estar perdendo dinheiro em silencio.**

### Opcao E - Mais tecnica, ainda comercial

**Auditoria, prioridade e monitoramento continuo para negocios digitais que nao podem operar no escuro.**

## 14. CTAs Recomendados

### CTA primario

- `Rodar auditoria gratis`
- `Ver o que a Vestigio encontra`
- `Descobrir meus vazamentos`
- `Passar no teste antes de escalar`

### CTA secundario

- `Ver tour do produto`
- `Ver findings de exemplo`
- `Como funciona`
- `Abrir demonstracao`

### CTA de alto intent

- `Unlock all findings`
- `Quero ver todos os achados`
- `Ver impacto completo`
- `Comecar a corrigir agora`

## 15. Graphics, Motion Graphics e Vectors Ideais

### Regra central

A Vestigio nao precisa de abstracoes bonitas. Ela precisa de **evidencia visual comercial**.

Logo, priorizar:

- UI real
- numeros reais ou honestamente mockados
- fluxo visual de jornada
- estados de antes/depois

Evitar:

- blobs
- 3D generico
- particulas sem significado
- ornamentos que nao empurram conversao

### Assets estaticos recomendados

1. **Action Queue Hero**
   - card com 3-5 acoes
   - prioridade
   - impacto
   - severidade

2. **Revenue Leak Snapshot**
   - surfaces com highlight em vermelho
   - faixa de impacto por etapa

3. **Before / After**
   - antes: funil com vazamentos
   - depois: achados resolvidos e risco reduzido

4. **Blurred Findings Grid**
   - manter e evoluir o padrao do `/lp/audit/result`
   - funciona muito bem para urgencia e curiosidade

5. **Question Cards**
   - cards grandes com perguntas de negocio
   - "posso escalar?"
   - "o que corrigir?"

### Motion graphics recomendados

1. **Scan-to-findings**
   - dominio entra
   - superficies surgem
   - findings aparecem
   - CTA `Unlock all findings`

2. **Leak pulse**
   - linhas vermelhas saindo de homepage > pricing > checkout > thank-you
   - contador de impacto somando

3. **Action ranking animation**
   - varios achados aparecem
   - agrupam
   - viram fila de prioridades

4. **Regression alert**
   - deploy/change
   - uma rota cai
   - Vestigio aponta regressao

5. **Verification reveal**
   - claim
   - evidence
   - verified / needs follow-up

### Vectors ideais

1. mapas de jornada com nodes e edges
2. sinais de friccao/confianca/queda
3. layers de surfaces
4. setas e conectores com semantica de causa-raiz
5. overlays de "money leak", "trust break", "tracking gap"

### Melhor ideia para motion com foco em conversao

**Um mini desafio visual em 3 passos:**

1. "Seu site passa no teste?"
2. linhas escaneiam o dominio
3. tela mostra 3 problemas + `Ver todos`

Isso junta:

- curiosity gap
- urgencia
- participacao
- CTA natural

## 16. Storytelling que a Home Pode Contar

### Story 1 - O site bonito que perde dinheiro

Narrativa:

**Seu site parece bom. Sua operacao tambem?**

Muito forte para:

- infoproduto
- SaaS
- servicos
- agencias

### Story 2 - O trafego caro entrando num caminho fraco

Narrativa:

**O problema nao e comprar trafego. E comprar trafego para um caminho que ja esta desperdicando receita.**

Muito forte para:

- Meta Ads
- TikTok
- advertorial

### Story 3 - O caos de sinais desconectados

Narrativa:

**Analytics mostra uma queda. Replay mostra um usuario irritado. O time ainda nao sabe o que fazer primeiro.**

Vestigio entra como:

**a camada que transforma isso em ordem de acao**

### Story 4 - O deploy silencioso que piora tudo

Narrativa:

**Nao e so o que esta ruim agora. E o que ficou pior sem ninguem perceber.**

Muito forte para:

- SaaS
- apps
- agencias

### Story 5 - A operacao que depende de confianca

Narrativa:

**Confianca nao quebra so no branding. Ela quebra no checkout, no form, no redirecionamento, na prova, na mensuracao, no contato.**

## 17. Quizzes, Challenges e Assets de Conversao

Sua equipe esta certa em priorizar isso.

Para venda direta, Vestigio combina muito com ativos de autodiagnostico.

### Os 3 melhores formatos

#### 1. Scale Readiness Challenge

Headline:

**Seu site esta pronto para escalar ou so parece pronto?**

Formato:

- 5 perguntas
- score vermelho / amarelo / verde
- CTA para mini-audit

#### 2. Revenue Leak Quiz

Headline:

**Onde voce provavelmente esta perdendo dinheiro sem perceber?**

Formato:

- escolhe modelo de negocio
- escolhe sintomas
- resultado com 3 vazamentos provaveis
- CTA `Ver findings reais no meu dominio`

#### 3. Fix-First Challenge

Headline:

**Se a Vestigio auditasse seu site agora, o que viria em P1?**

Formato:

- usuario escolhe dor principal
- ve exemplo de action queue
- CTA `Gerar minha fila`

### Recomendacao

Manter o `/lp` como territorio desses assets.

O `/` nao precisa virar uma carta de vendas completa.

## 18. Estrategia por Pagina

### `/`

Papel:

- explicar a categoria
- mostrar prova de produto
- qualificar o visitante
- mandar para audit/tour

### `/lp`

Papel:

- capturar demanda fria
- ser agressivo
- usar quiz/challenge
- puxar para form
- puxar para mini-audit
- puxar para checkout

### Recomendacao forte

`/lp` nao deve continuar como clone da home.

Ela deve ser mais curta, mais direta e mais obcecada por:

- dor
- prova
- curiosidade
- CTA

## 19. O Que Remover ou Reescrever da Home Atual

### Reescrever imediatamente

1. `Put your SaaS intelligence on autopilot`
2. `Vestigio is the intelligence layer...`
3. `Everything you need to operate your SaaS`
4. `Build, launch, and scale with confidence`
5. FAQ generico e focado em pricing

### Revisar com muito cuidado

1. logos de marcas se forem placeholders
2. testimonials se nao forem reais
3. counters como `99% evidence accuracy` se nao forem comprovaveis publicamente

Se a prova ainda nao existe, trocar por:

- proof of product
- sample findings
- redacted results
- real UI

## 20. Guardrails de Copy

### Fazer

- ser agressivo no framing da dor
- ser conservador no claim numerico
- usar verbos concretos
- transformar features em decisoes
- puxar o usuario para um proximo passo claro

### Nao fazer

- parecer ferramenta enterprise lenta
- soar como "AI wrapper"
- exagerar sem evidencia
- usar 8 blocos de feature antes do primeiro momento de prova
- esconder o mini-audit

## 21. Prioridades de Implementacao

### P1

Reposicionar a home de "SaaS intelligence" para "decision engine para operacao digital".

### P2

Refazer hero e dobra inicial com:

- headline de dor
- CTA de audit
- CTA de tour
- prova de amplitude de ICP

### P3

Reenquadrar o `Product Tour` como:

**Actions-first**

e idealmente adicionar toggle por modelo de negocio.

### P4

Separar `/` e `/lp` de verdade.

### P5

Criar 2-3 quizzes/challenges como maquinas de captura para paid + organic.

## 22. Recomendacao Final

Se eu tivesse que resumir a homepage ideal da Vestigio em uma unica direcao, seria:

**Pare de vender "intelligence". Comece a vender clareza brutal sobre onde a operacao digital esta perdendo dinheiro, o que corrigir primeiro e o que pode quebrar de novo.**

A homepage ideal da Vestigio nao deve fazer o visitante pensar:

**"Interessante, parece uma plataforma sofisticada."**

Ela deve fazer o visitante pensar:

**"Eu preciso rodar isso no meu site agora."**
