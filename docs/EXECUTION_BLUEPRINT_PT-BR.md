# Blueprint de Execução — Homepage, Landing Page & Funil

*Última atualização: 2026-04-21 (rev 5 — reordenação AIDA + auditoria product tour + headline LP)*
*Referência: MARKETING_DIRECTION.md*

---

## Como ler este documento

Cada seção segue este formato:

```
ATUAL: O que existe hoje (componente, posição, conteúdo)
VEREDICTO: Manter / Alterar / Remover / Mover / Novo
DIRETIVA: Mudança exata com copy antes→depois
STATUS: ✅ Done / 🔲 Not started / 🟡 Partial
```

### Regras de terminologia (obrigatórias em toda copy)

| Usar | Nunca usar | Por quê |
|------|------------|---------|
| Diagnóstico / ciclo | Relatório | "Relatório" implica entrega estática, enfraquece o conceito de motor de decisão |
| Diagnosticar / Encontrar / Ver | Auditar / Descobrir | "Auditar" soa como compliance; "Descobrir" é passivo |
| Motor de decisão | Plataforma / Solução | Palavras genéricas de SaaS, zero diferenciação |
| Vigiar / Detectar | Monitorar | "Monitorar" soa como ferramenta de uptime |
| Vestigio Pulse AI | MCP calls / Agentic insights | Jargão interno, sem significado para usuários |
| 60 segundos | 24 horas | MiniCalc dá resultados quase instantâneos; "24 horas" cria fricção desnecessária |

---

# PARTE 1 — HOMEPAGE (/)

**Público:** Orgânico, referral, busca por marca
**Objetivo:** Criar consciência de categoria. Fazer o visitante pensar "preciso verificar se isso está acontecendo comigo."
**Tom:** Confiança autoritativa (clareza McKinsey, contenção Stripe)

---

## Seção 1: Hero

**ATUAL:** Posição 1. Componente: `Hero/index.tsx`
- Headline L1: "There's money leaking" (en) / "Tem dinheiro vazando" (pt-BR)
- Headline L2: "from your operation." (en) / "na sua operação." (pt-BR)
- Headline L3: "You just don't know how much." (en) / "Você só não sabe quanto." (pt-BR)
- Subtítulo: "Problems identified and ranked. Decisions ready to execute. Real evidence." (en) / "Problemas identificados e ranqueados. Decisões prontas pra executar. Evidência real." (pt-BR)
- Pills: 4 pares problema→solução
- CTA: "Run free diagnostic" (en) / "Rodar diagnóstico gratuito" (pt-BR)
- Microcopy: Removido

**STATUS:** ✅ Done (headline, subtítulo, pills, CTA, microcopy removido)

**PENDENTE:**

Os pills devem ser mais específicos financeiramente:

| Problema atual (en) | Solução atual (en) | Problema melhor (en) | Solução melhor (en) |
|---------------------|-------------------|---------------------|---------------------|
| "Leads not converting?" | "We show you why" | "Paying for traffic, no conversions?" | "We show you why" |
| "Ad spend not returning?" | "We reveal the leak" | "Scaling ad spend blindly?" | "We quantify the waste" |
| "Nice site, no sales?" | "We find the bottleneck" | "Site looks fine, sales don't?" | "We find what's broken" |
| "Deciding in the dark?" | "Impact in dollars" | "20 problems, no priority?" | "A ranked queue. Fix #1 first." |

| Problema melhor (pt-BR) | Solução melhor (pt-BR) |
|-------------------------|----------------------|
| "Pagando por tráfego sem conversão?" | "Mostramos por quê" |
| "Escalando ads no escuro?" | "Quantificamos o desperdício" |
| "Site bonito, vendas não?" | "Achamos o que está quebrado" |
| "20 problemas, sem prioridade?" | "Fila ranqueada. Corrija o #1 primeiro." |

**Visual:** Manter os trails animados e halos. Funcionam — atmosféricos, não distraem.

---

## Seção 2: Social Proof Strip (NOVO)

**ATUAL:** Não existia. Client gallery está na posição 3, dentro do HomeBigCard.

**VEREDICTO:** Novo. Inserido entre Hero e Product Tour (dentro do HomeBigCard).

**DIRETIVA:** Uma única linha, centralizada, sutil. Sem logos. Apenas um número.

```
EN: "Companies like yours find an average of 9 critical leaks and −$81k/mo in their first Vestigio diagnostic."
PT-BR: "Empresas como a sua encontram em média 9 vazamentos críticos e −R$81k/mês no primeiro diagnóstico Vestigio."
```

O `−R$81k/mês` está destacado em `font-mono font-semibold text-red-400` — o impacto financeiro se destaca sem quebrar o tom contido.

**Visual:** `text-[13px] text-zinc-500`, centralizado, sem borda, sem card. O destaque do `−R$81k/mês` é o único acento de cor. Loss-frame mantido desde o hero.

**STATUS:** ✅ Done

---

## Seção 3: VSL (Video Sales Letter)

**ATUAL:** Não existe.

**VEREDICTO:** Novo. Inserir entre Social Proof Strip e Product Tour. Papel AIDA: ponte **Attention → Interest** — o vídeo explica a proposta de valor num formato que não exige scroll.

**DIRETIVA:** Player de vídeo único, centralizado, full-width dentro do container HomeBigCard. Sem título, sem descrição — apenas o vídeo. O social proof strip acima dá o contexto; o vídeo dá profundidade.

**Visual:**
- Container arredondado (`rounded-2xl`) com borda sutil
- Poster/thumbnail carrega imediatamente; vídeo carrega no play (`preload="none"`)
- Overlay de play button (mesmo padrão do VideoTestimonials)
- Aspect ratio 16:9
- Sem autoplay — usuário inicia

**Asset:** Vídeo em `/videos/vsl.mp4`, poster em `/videos/vsl-poster.webp`. Placeholder até o vídeo real estar pronto.

**STATUS:** 🔲 Not started (aguardando asset de vídeo)

---

## Seção 4: Product Tour

**ATUAL:** Posição 2. Componente: `ProductTour/index.tsx`
- Título: "Not a dashboard. A queue of decisions." (en) / "Não é um painel. É uma fila de decisões." (pt-BR)
- Subtítulo: "Every tab is a different lens on the same revenue picture..." (en)
- Eyebrow: "Product Tour"

**VEREDICTO:** Manter posição (fica na 3, após social proof strip). Alterar copy do header. Papel AIDA: **Interest** — mostrar como funciona.

**DIRETIVA:**

| Elemento | Atual | Escrever (en) | Escrever (pt-BR) |
|----------|-------|---------------|-------------------|
| Eyebrow pill | "Product Tour" | "Inside your decision engine" | "Dentro do seu motor de decisão" |
| Título | Manter — excelente como está | Manter | Manter |
| Subtítulo | "Every tab is a different lens..." | "Your action queue, your evidence trail, your financial clarity — from day one." | "Sua fila de ações, sua trilha de evidências, sua clareza financeira — desde o dia um." |
| CTA | "Run free diagnostic" | Manter | Manter |

**Conteúdo das tabs:** Manter todas as 6 tabs. O mockup interativo do browser é forte.

**Aba Actions:** Reescrita como ações com verbos imperativos e "seus/sua":
```
Antes: "Your checkout takes 2.4s longer than it should" (finding)
Depois: "Speed up your checkout — it's costing you −$18k–42k/mo" (ação)

Antes: "Seu checkout demora 2,4s a mais do que deveria" (finding)
Depois: "Acelere seu checkout — está te custando −R$91k–210k/mês" (ação)
```

**Aba Analysis:** Reescrita como evidências que comprovam cada ação:
```
Antes: "Checkout takes 2.4s longer than it should" (repetição da ação)
Depois: "Your checkout loads in 4.2s — benchmark is 1.8s" (evidência)

Antes: "Checkout demora 2,4s a mais do que deveria" (repetição)
Depois: "Seu checkout carrega em 4,2s — o benchmark é 1,8s" (evidência)
```

**Callout "Recuperável"** ("+$67k/mo"): Manter — é o payoff emocional do tour.
**Card "Fontes de Dados":** Logos de integração (Shopify, Stripe, Meta, Google Ads, Nuvemshop) com indicadores verdes. Implementado no rodapé do sidebar.

**STATUS:** 🟡 Partial (aba Actions e Analysis reescritas, card de dados adicionado. Eyebrow e subtítulo pendentes.)

---

## Seção 5: Outcomes (SUBSTITUI Features Bento)

**ATUAL:** Posição 6. Componente: `Features/index.tsx`. Quatro cards bento: Action Queue, Revenue Leaks, Continuous Watch, Evidence Orbit.

**VEREDICTO:** Mover para posição 4 (após Product Tour). Manter o layout visual bento (visualmente impressionante). Reformular cada card de "o que o produto faz" para "o que acontece com o seu negócio." Papel AIDA: **Desire** — valores em reais/dólares fazem o visitante querer isso pra si.

**DIRETIVA:**

**Card 1 (Action Queue, amber):**

| Atual (en) | Escrever (en) | Escrever (pt-BR) |
|------------|---------------|-------------------|
| "A clear queue of what to fix first" | "Know what to fix Monday morning" | "Saiba o que corrigir segunda de manhã" |
| (descrição removida anteriormente) | "A ranked queue. Impact in dollars, not color codes. The first item is worth $42k/month. The ninth is worth $1.5k. You know where to start." | "Uma fila ranqueada. Impacto em reais, não bolinhas coloridas. O primeiro item vale R$210k/mês. O nono vale R$7k. Você sabe por onde começar." |

**Card 2 (Revenue Leaks, red):**

| Atual (en) | Escrever (en) | Escrever (pt-BR) |
|------------|---------------|-------------------|
| "Find where money is bleeding" | "See exactly what each problem costs" | "Veja exatamente quanto cada problema custa" |
| (descrição removida anteriormente) | "Not 'high severity'. Not a red dot. A dollar amount: −$18,420/month, 94% confidence. You know what to tell your team." | "Não é 'severidade alta'. Não é um ponto vermelho. É um valor: −R$92k/mês, 94% de confiança. Você sabe o que dizer pro seu time." |

**Card 3 (Continuous Watch, emerald):**

| Atual (en) | Escrever (en) | Escrever (pt-BR) |
|------------|---------------|-------------------|
| "Catch regressions before your customers do" | "Last week's deploy broke checkout. You'd know in hours, not days." | "O deploy da semana passada quebrou o checkout. Você saberia em horas, não em dias." |
| (descrição removida anteriormente) | "Continuous cycles compare every surface against the last. When something degrades, it shows up in your queue before a customer complains." | "Ciclos contínuos comparam cada superfície com a anterior. Quando algo degrada, aparece na sua fila antes de um cliente reclamar." |

**Card 4 (Evidence Orbit, sky):**

| Atual (en) | Escrever (en) | Escrever (pt-BR) |
|------------|---------------|-------------------|
| "Every finding traces back to multi-source proof" | "Show your team proof, not your opinion" | "Mostre pro seu time provas, não opinião" |
| (descrição removida anteriormente) | "Every finding: browser screenshot, DOM snapshot, performance trace, timestamp. Your CTO sees evidence, not a dashboard." | "Cada descoberta: screenshot do navegador, snapshot do DOM, trace de performance, timestamp. Seu CTO vê evidência, não um painel." |

**Visual:** Manter a órbita animada, gráficos, linhas de ação, linhas de vazamento. São os melhores elementos visuais do site.

**STATUS:** 🔲 Not started

---

## Seção 6: MiniCalculator (MOVIDO PRA CIMA)

**ATUAL:** Posição 11 (penúltimo, antes do CallToAction). Componente: `MiniCalculator/index.tsx`

**VEREDICTO:** Mover para posição 5 — após Outcomes, antes das seções de rede de segurança. Papel AIDA: **Action** — o visitante já viu o problema (hero), a prova (product tour) e o desejo (outcomes com valores em reais). Agora está Solution-Aware e pronto pra agir.

**Por que posição 5, e não posição 3:** Mover o MiniCalc antes do Product Tour (como originalmente proposto) otimiza para entradas no MiniCalc mas prejudica a conversão em signup. Na posição 3, o visitante entra no MiniCalc tendo visto apenas hero + social proof — sem entender o que a Vestigio faz, sem confiança construída, sem objeções respondidas. Modelo BJ Fogg: Capacidade é alta (grátis, 60s) mas Motivação é baixa (não viram valor). Na posição 5, o visitante viu Interest (product tour) e Desire (outcomes com exemplos de R$210k/mês) — Motivação é alta. Efeito de segunda ordem: menos entradas totais no MiniCalc, mas maior conversão downstream.

**DIRETIVA:**

| Elemento | Atual (en) | Escrever (en) | Escrever (pt-BR) |
|----------|------------|---------------|-------------------|
| Eyebrow | "Free instant diagnostic" | "FREE DIAGNOSTIC" | "DIAGNÓSTICO GRÁTIS" |
| Tagline | "Try Vestigio on your own domain..." | Remover — o título já faz esse trabalho. | Remover |
| Título | "See what you're leaving on the table" | "How much are you losing right now?" | "Quanto você está perdendo agora?" |
| Subtítulo | "Enter your website URL to get a free snapshot..." | "Enter your domain. No signup. No card. 60 seconds." | "Digite seu domínio. Sem cadastro. Sem cartão. 60 segundos." |
| CTA | "Run Free Diagnostic" | Manter | Manter |

**Estado de resultados — manter como está.** A tabela de findings com valores em reais é o elemento mais forte do site.

**STATUS:** 🔲 Not started (mudança de posição + reescrita de copy)

---

## Seção 7: Declaração do Problema (SUBSTITUI Solution Layers)

**ATUAL:** Posição 4. Componente: `SolutionLayers/index.tsx`. Três cards sticky-stack explicando Descobrir → Priorizar → Validar. Usa i18n `homepage.solution_layers`.

**VEREDICTO:** Substituir conteúdo. Manter o tratamento visual sticky-stack (ótimo padrão) mas mudar de processo do produto para consequência pro usuário. Move para posição 6 — rede de segurança para visitantes que passaram pelo MiniCalc sem converter.

**DIRETIVA:**

| Elemento | Atual (en) | Escrever (en) | Escrever (pt-BR) |
|----------|------------|---------------|-------------------|
| Eyebrow | "What Vestigio does" | "THE PROBLEM" | "O PROBLEMA" |
| Título | "Refuse to scale your business in the dark." | "Traffic is not the problem. Scaling a broken system is." | "Tráfego não é o problema. Escalar um sistema quebrado é." |
| Subtítulo | "See early, prioritize with clarity..." | Remover | Remover |

**Card 1:**
```
EN:    "Pages that don't convert. You're paying for traffic that hits a wall. 
        Every visitor that bounces is money you already spent."
PT-BR: "Páginas que não convertem. Você está pagando por tráfego que bate num muro. 
        Cada visitante que sai é dinheiro que você já gastou."
```

**Card 2:**
```
EN:    "Checkouts that leak trust. Your payment flow has friction you can't see. 
        The drop-off happens silently — no alert, no notification."
PT-BR: "Checkouts que vazam confiança. Seu fluxo de pagamento tem fricção que você não vê. 
        O abandono acontece em silêncio — sem alerta, sem notificação."
```

**Card 3:**
```
EN:    "Fixes you can't verify. You ship a fix, but did it actually work? 
        Without continuous verification, you're guessing."
PT-BR: "Correções que você não consegue verificar. Você faz o fix, mas será que funcionou? 
        Sem verificação contínua, você está chutando."
```

**Após os 3 cards, adicionar uma linha:**
```
EN:    "This is what 'scaling in the dark' looks like. And it costs money every day."
PT-BR: "É assim que 'escalar no escuro' se parece. E custa dinheiro todo dia."
```

**Visual:** Manter a animação sticky-stack. Remover o diagrama de chat agentic — é muito orientado a produto pra esta seção.

**STATUS:** 🔲 Not started

---

## Seção 8: Casos de Uso (SUBSTITUI FeaturesWithImage)

**ATUAL:** Posição 5. Componente: `FeaturesWithImage/index.tsx`. Escondido no mobile. 5 cards explicando superfícies do produto.

**VEREDICTO:** Substituir por cenários orientados a persona. Tornar visível no mobile.

**DIRETIVA:**

| Elemento | Atual (en) | Escrever (en) | Escrever (pt-BR) |
|----------|------------|---------------|-------------------|
| Eyebrow | "Use Cases" | "BUILT FOR" | "FEITO PRA" |
| Título | "Audit, prioritize, recover..." | "Operators who won't scale blind" | "Operadores que se recusam a escalar no escuro" |

**Substituir 5 cards de superfície por 3 cenários de persona:**

**Card 1: O Fundador**
```
EN:    "I spend $40k/month on ads. Am I sending traffic into a broken funnel?"
        Vestigio answers in 60 seconds. With dollar amounts on every finding.
PT-BR: "Eu gasto R$200k/mês em ads. Estou mandando tráfego pra um funil quebrado?"
        A Vestigio responde em 60 segundos. Com valores em reais em cada descoberta.
```

**Card 2: O Head de Growth**
```
EN:    "We shipped last week. Did anything break?"
        Vestigio compares every surface against the last cycle. Regressions show up ranked by impact.
PT-BR: "Fizemos deploy semana passada. Algo quebrou?"
        A Vestigio compara cada superfície com o último ciclo. Regressões aparecem ranqueadas por impacto.
```

**Card 3: O CTO**
```
EN:    "Chargebacks are climbing. Where's the root cause?"
        Vestigio traces chargeback risk to specific surfaces, policies, and trust gaps. Evidence attached.
PT-BR: "Chargebacks estão subindo. Onde está a causa raiz?"
        A Vestigio rastreia risco de chargeback até superfícies específicas, políticas e falhas de confiança. Evidência anexada.
```

**Visual:** Cards limpos, sem ícones. Apenas a citação + resposta. A simplicidade é o design.

**STATUS:** 🔲 Not started

---

## Seção 9: Counter / Proposta de Valor

**ATUAL:** Posição 7. Componente: `Counter/index.tsx`. Grid bento com 6 itens: Quick Start, Visibilidade Completa, 4X ROI, Vestigio Pulse, Monitoramento Contínuo, Integrações.

**VEREDICTO:** Simplificar para 3 itens. Remover o supérfluo.

**DIRETIVA:** Manter apenas os mais convincentes:

```
EN:
[4X ROI Guarantee]          [First diagnostic in 60s]     [15,000+ signals per cycle]
You literally can't lose.   Enter your domain,            Automated. Continuous.
                            see results immediately.       No manual review needed.

PT-BR:
[Garantia 4X ROI]           [Primeiro diagnóstico em 60s]  [15.000+ sinais por ciclo]
Você literalmente não       Digite seu domínio,            Automatizado. Contínuo.
tem como perder.            veja resultados imediatamente.  Sem revisão manual.
```

Remover: Quick Start (redundante com "60s"), Vestigio Pulse (guardar pra depois), Integrações (cedo demais pra mencionar).

**STATUS:** 🔲 Not started

---

## Seção 10: Depoimentos em Vídeo

**ATUAL:** Posição 8. Componente: `VideoTestimonials/index.tsx`. Vídeos portrait com conteúdo placeholder de outro produto.

**VEREDICTO:** Remover até existirem vídeos reais de clientes. Conteúdo placeholder ("Review Harvest", "Pooper Scoopers") é pior do que nenhuma prova social.

**DIRETIVA:** Esconder o componente da composição da homepage. Re-adicionar quando vídeos reais de depoimentos de clientes Vestigio estiverem disponíveis. Ao re-adicionar, posicionar ACIMA da seção counter (prova social deve preceder claims).

**STATUS:** 🔲 Not started

---

## Seção 11: Cards de Depoimentos / Success Stories

**ATUAL:** Posição 9. Componente: `Testimonials/index.tsx`. Carrossel com 5 cards genéricos de indústria (stats placeholder sem relação com a Vestigio).

**VEREDICTO:** Substituir por resultados reais de clientes ou substituir por contador honesto.

**DIRETIVA:**

Se existem clientes reais:
```
EN:    "[Company name] found $67k/month in recoverable revenue in their first cycle."
        — [Name], [Role]
PT-BR: "[Nome da empresa] encontrou R$336k/mês em receita recuperável no primeiro ciclo."
        — [Nome], [Cargo]
```

Se ainda não há clientes reais, substituir todo o carrossel por uma única linha de contador:
```
EN:    "127 companies have run their first diagnostic."
PT-BR: "127 empresas já rodaram seu primeiro diagnóstico."
```

Um contador real é mais honesto e mais convincente do que success stories falsas. Stats genéricos de indústria ("51.42% Taxa de Engajamento", "2.8x Crescimento de Receita") não têm conexão com a proposta de valor da Vestigio e prejudicam a credibilidade.

**STATUS:** 🔲 Not started

---

## Seção 12: FAQ

**ATUAL:** Posição 10. Componente: `FAQ/index.tsx`. 4 perguntas (genérica "o que a Vestigio faz", verificação técnica, experimentar antes de pagar, planos de preço).

**VEREDICTO:** Reduzir para 3 perguntas. Substituir por perguntas estratégicas de conversão.

**DIRETIVA:**

| # | Pergunta atual | Nova pergunta (en) | Nova resposta (en) |
|---|---------------|--------------------|--------------------|
| 1 | "What does Vestigio actually do?" | "How is this different from Google Analytics?" | "GA tells you *what* happened. Vestigio tells you *why*, how much it costs, and what to fix first." |
| 2 | "Can I try it before committing?" | "Can I try before paying?" | "Yes. Enter your domain, see your first diagnostic in 60 seconds. No signup, no card." |
| 3 | "How does the verification system work?" | "How accurate are the financial estimates?" | "Every finding uses confidence ranges, not guesses. Evidence is browser-verified and timestamped." |
| 4 | "What pricing plans are available?" | **Remover** | Pertence à /pricing, não à homepage. |

| # | Nova pergunta (pt-BR) | Nova resposta (pt-BR) |
|---|----------------------|----------------------|
| 1 | "Qual a diferença disso pro Google Analytics?" | "O GA diz *o que* aconteceu. A Vestigio diz *por quê*, quanto custa, e o que corrigir primeiro." |
| 2 | "Posso testar antes de pagar?" | "Sim. Digite seu domínio, veja seu primeiro diagnóstico em 60 segundos. Sem cadastro, sem cartão." |
| 3 | "Quão precisas são as estimativas financeiras?" | "Cada descoberta usa faixas de confiança, não chutes. Evidência verificada no navegador e com timestamp." |

**STATUS:** 🔲 Not started

---

## Seção 13: CTA Final

**ATUAL:** Renderizado na homepage. Componente: `CallToAction/index.tsx`.
- Título: "Ready to put your platform on autopilot?" ← usa palavra PROIBIDA "autopilot" e "platform"
- Subtítulo: "Join SaaS teams using Vestigio to automate auditing..." ← usa palavras PROIBIDAS "automate", "auditing"
- CTA primário: "Get started free" ← deveria ser "Run Free Diagnostic"
- CTA secundário: "Try live demo" ← blueprint diz uma ação só

**VEREDICTO:** Reescrever. Uma CTA apenas.

**DIRETIVA:**

```
EN:
Title:    "The money is leaving now."
Subtitle: "Every day without visibility is revenue you don't recover."
CTA:      [Run Free Diagnostic]
Micro:    "You can be looking at your first diagnostic in 60 seconds."

PT-BR:
Título:    "O dinheiro está saindo agora."
Subtítulo: "Cada dia sem visibilidade é receita que você não recupera."
CTA:       [Rodar Diagnóstico Gratuito]
Micro:     "Você pode estar olhando seu primeiro diagnóstico em 60 segundos."
```

Remover CTA secundário ("Try live demo"). Uma ação apenas.

**Visual:** Full-width, fundo escuro, centralizado. Botão CTA emerald.

**STATUS:** 🔲 Not started

---

## Ordem das Seções da Homepage

**ORDEM ATUAL (Home/index.tsx):**
1. Hero ✅
2. ProductTour
3. ClientGallery
4. SolutionLayers
5. FeaturesWithImage
6. Features
7. Counter
8. VideoTestimonials ← placeholder, esconder
9. Testimonials ← placeholder, esconder ou substituir
10. FAQ
11. MiniCalculator ← posição errada
12. CallToAction

**ORDEM ALVO (alinhada ao AIDA):**
1. Hero ✅ — **Attention**: loss-frame, curiosity gap
2. Social Proof Strip ✅ — **Attention** reforço: −R$81k/mês
3. VSL (NOVO) — ponte **Attention → Interest**: explicação em vídeo
4. Product Tour — **Interest**: "é assim que funciona"
5. Outcomes (Features bento) — **Desire**: valores em reais, impacto concreto
6. MiniCalculator (MOVIDO da posição 11) — **Action**: "agora testa no teu domínio"
7. ClientGallery — social proof strip (sutil)
8. Problem Statement (SolutionLayers reescrito) — rede de segurança: consequência da inação
9. Use Cases (FeaturesWithImage reescrito) — rede de segurança: cenários de persona
10. Counter (reduzido para 3 itens) — rede de segurança: proposta de valor
11. FAQ (reduzido para 3 perguntas) — rede de segurança: tratamento de objeções
12. CallToAction (reescrito) — ação final

**Removidos até ter conteúdo real:**
- VideoTestimonials (placeholder de outro produto)
- Success Stories (stats genéricos de placeholder)

---

# PARTE 2 — LANDING PAGE (/lp)

**Público:** Tráfego pago — foco em e-commerce (clicou um anúncio com promessa financeira)
**Objetivo:** Converter. Uma ação. Casar com a promessa do anúncio.
**Tom:** Confronto financeiro direto

**Total de scroll:** 2 telas no máximo. Sem features, sem processo, sem FAQ.

---

## Seção 1: Hero + CTA

**ATUAL (implementado):**
```
Headline L1: "How much money is" (en) / "Quanto dinheiro está" (pt-BR)
Headline L2: "leaking from your operation" (en) / "vazando da sua operação" (pt-BR)  ← gradiente emerald
Headline L3: "without you knowing?" (en) / "sem você perceber?" (pt-BR)  ← gradiente emerald
Subtítulo L1: "Enter your domain." (en) / "Digite seu domínio." (pt-BR)
Subtítulo L2: "Find out in 60 seconds how much YOU lose." (en) / "Descubra em 60 segundos quanto VOCÊ perde." (pt-BR)
```

Gradiente nas L2+L3 controlado por `headline_gradient_parts: "2,3"`. "YOU"/"VOCÊ" renderizado em negrito.
Desktop: subtítulo em uma linha. Mobile: duas linhas (quebra após "Digite seu domínio.").

**STATUS:** ✅ Done (namespace i18n `hero_lp` separado, 4 locales, gradiente emerald)

**PENDENTE:** A /lp atualmente renderiza a homepage completa (todas as seções). Deveria ser simplificada para apenas 5 seções:

1. Hero (com copy específico da LP) ✅
2. MiniCalculator (interação imediata)
3. "O que seu primeiro diagnóstico mostra" (3 linhas com checkmark)
4. Um ponto de prova (stat ou citação de cliente real)
5. CTA final (repetir)

**Visual:** Minimalista. Fundo escuro, texto branco, CTA emerald. Sem pills, sem animação no hero da LP. O número faz o trabalho.

**STATUS:** 🟡 Partial (hero feito, estrutura da página ainda não simplificada)

---

## Seção 2: MiniCalculator (imediato)

Mesmo componente da homepage. Sem mudanças necessárias — a calculadora É a landing page.

---

## Seção 3: O que você vai ver

**DIRETIVA:**

```
EN:
Title: "Your first diagnostic shows:"
3 items (icon + one line each):
- A ranked queue of what's costing you money
- Dollar amounts on every finding (not severity colors)
- Browser-verified evidence you can show your team

PT-BR:
Título: "Seu primeiro diagnóstico mostra:"
3 itens (ícone + uma linha cada):
- Uma fila ranqueada do que está te custando dinheiro
- Valores em reais em cada descoberta (não bolinhas coloridas)
- Evidência verificada no navegador que você pode mostrar pro seu time
```

**Visual:** 3 linhas simples com checkmarks. Sem cards, sem bento grid. Velocidade.

**STATUS:** 🔲 Not started

---

## Seção 4: Um ponto de prova

**DIRETIVA:**

```
EN:    "Average first diagnostic: 9 findings, $41k/month in recoverable revenue."
PT-BR: "Diagnóstico médio: 9 descobertas, R$81k/mês em receita recuperável."
```

Ou se existir cliente real:
```
EN:    "[Company] found $67k/month in recoverable revenue in their first Vestigio cycle."
PT-BR: "[Empresa] encontrou R$336k/mês em receita recuperável no primeiro ciclo Vestigio."
        — [Nome], [Cargo]
```

**STATUS:** 🔲 Not started

---

## Seção 5: CTA Final (repetir)

**DIRETIVA:**

```
EN:    "You're either finding the leaks or funding them."
PT-BR: "Ou você encontra os vazamentos, ou financia eles."
       [Rodar Diagnóstico Gratuito]
```

**STATUS:** 🔲 Not started

---

# PARTE 3 — REDESIGN DO FUNIL

---

## CTA da Homepage → Fluxo de Signup

**ATUAL:**
1. Clica "Rodar diagnóstico gratuito" na homepage
2. → `/auth/signup` (página de auth padrão com Google/GitHub/Magic Link/Senha)
3. Após auth → `/app/onboarding` (formulário de 7 passos)
4. Passo 7: Seleção de plano → checkout Paddle
5. Após pagamento → `/app/onboarding/thank-you` → redirect para `/app/inventory`

**PROBLEMAS:**
- 7 passos no onboarding é demais
- Múltiplos campos por passo cria carga cognitiva
- Seleção de plano acontece DEPOIS de 6 passos de entrada de dados (usuário já investiu, mas também cansou)
- Sem progressive disclosure — usuário vê todos os campos de uma vez por passo

**PROPOSTO:**

### Novo Onboarding: 1 pergunta por tela

**DIRETIVA:** Cada passo é um card full-screen com UM campo e um botão "Continuar" proeminente. Sem scrolling. O indicador de progresso mostra quantos passos faltam.

**Passo 1: Domínio** (mais importante — cria investimento)
```
PT-BR: "Qual domínio devemos diagnosticar?"
[________________________] ← input full-width
☐ Eu possuo ou gerencio este domínio  ← checkbox legal inline
[Continuar]
"Nós só rastreamos páginas públicas. Sem acesso ao seu código ou dados."
```

**Passo 2: Tipo de negócio + Modelo de conversão** (4 cards grandes, toque pra selecionar → sub-pergunta aparece)
```
PT-BR: "Que tipo de negócio?"
[E-commerce]  [SaaS]
[Captação de Leads]  [Híbrido]
← ao tocar revela: "Como seus clientes completam uma compra?"
[Checkout online]  [WhatsApp/Chat]  [Formulário/Contato]
← ao tocar avança automaticamente
```

**Passo 3: Receita mensal** (um campo)
```
PT-BR: "Qual sua receita mensal aproximada?"
[________________________] ← aceita "R$50k", "1.5m", etc.
[Continuar]
"Isso nos ajuda a calibrar as estimativas de impacto."
```

**Passo 4: Seleção de plano** (3 cards, um recomendado, com toggle anual)
```
PT-BR: "Escolha o plano que combina com sua receita em risco."
[Mensal / Anual ← 20% off]
[Starter R$99]  [Pro R$199 ★]  [Max R$399]
"Cada plano se paga no primeiro ciclo."
```

**Resultado: 7 passos → 4 passos. Zero scrolling por passo.**

**STATUS:** 🔲 Not started

---

## CTA da LP → Funil de Lead

**ATUAL:**
1. Clica "Rodar diagnóstico gratuito" na /lp
2. → `/lp/audit` (formulário de 4 passos: org, domínio, métricas, email)
3. → `/lp/audit/result/[id]` (polling, 5 findings, 10 borrados)
4. → Checkout Paddle (desbloquear diagnóstico completo)
5. → `/lp/audit/thank-you/[id]`

**DIRETIVA:** Simplificar para 3 passos:

**Passo 1:** Domínio + checkbox de propriedade
**Passo 2:** Receita (modelo de conversão inferido dos sinais de crawl)
**Passo 3:** Apenas email (sem telefone — telefone assusta leads frios)

**Resultado: 4 passos → 3 passos (domínio, receita, email). Mais rápido até o valor.**

**Página de resultados:** Manter o padrão 5-visíveis + 10-borrados. É uma mecânica forte de conversão.

**STATUS:** 🔲 Not started

---

## MiniCalculator → Ponte pro Signup

**ATUAL (implementado):** MiniCalc passa `?domain=` para `/auth/signup`. Página de signup persiste domínio no `localStorage` (sobrevive ao redirect OAuth). Onboarding lê e pré-preenche o campo de domínio.

**STATUS:** ✅ Done

---

# PARTE 4 — DIRETIVAS TRANSVERSAIS

---

## Consistência de CTA

Toda CTA em ambas as páginas deve usar a mesma linguagem:

| Contexto | Texto da CTA (en) | Texto da CTA (pt-BR) |
|----------|-------------------|---------------------|
| Hero primário | "Run Free Diagnostic" | "Rodar Diagnóstico Gratuito" |
| Submit do MiniCalc | "Run Free Diagnostic" | "Rodar Diagnóstico Gratuito" |
| Product Tour | "Run Free Diagnostic" | "Rodar Diagnóstico Gratuito" |
| Seção final | "Run Free Diagnostic" | "Rodar Diagnóstico Gratuito" |
| Após resultados | "Create Free Account" | "Criar Conta Grátis" |
| Após resultados secundário | "View Pricing" | "Ver Preços" |

Nunca: "Comece", "Saiba Mais", "Cadastre-se", "Teste Grátis", "Rodar Auditoria Grátis"

---

## Formatação de Números

Todos os valores financeiros devem seguir estas regras:
- Sempre usar o caractere de sinal de menos `−` (U+2212), não hífen `-`
- Sempre mostrar faixas: `−R$91k–R$210k/mês`
- Sempre incluir unidade de tempo: `/mês` ou `/mo`
- Usar `k` para milhares, `m` para milhões — nunca por extenso
- Faixas de confiança quando exibidas: `94% de confiança`

---

## i18n

Todos os componentes da homepage e LP agora usam `next-intl` com traduções nos 4 locales (en, pt-BR, es, de). Inglês é o idioma canônico; os outros são traduções.

Todas as mudanças de copy devem ser feitas nesta ordem:
1. `en.json` (canônico)
2. `pt-BR.json` (mercado principal)
3. `es.json`
4. `de.json`

**STATUS:** ✅ Done (migração completa de i18n para todas as seções da homepage)

---

## Considerações Mobile

- Hero: headline deve ter no máximo 3 linhas em tela de 375px
- MiniCalc: inputs full-width, empilhados verticalmente
- Product Tour: apenas ícones nas tabs (sem labels) no mobile — já implementado
- Cards de problema: empilhar verticalmente, sem sticky-stack no mobile
- Bento de outcomes: coluna única no mobile — já implementado
- CTA final: botão full-width, centralizado

---

## Ordem de Implementação (atualizada)

| Fase | O quê | Páginas | Status |
|------|-------|---------|--------|
| **1** | Reescrever hero copy (ambas páginas) | `/`, `/lp` | ✅ Done |
| **2** | Migração completa i18n (todas seções) | `/` | ✅ Done |
| **3** | MiniCalc → Persistência de domínio no signup | `/auth/signup`, onboarding | ✅ Done |
| **4** | Mover MiniCalc para posição 5 (após Outcomes) | `/` | 🔲 |
| **5** | Adicionar social proof strip | `/` | ✅ Done |
| **6** | Reescrever seção final CTA | `/` | 🔲 |
| **7** | Reformular cards bento de features (só copy) | `/` | 🔲 |
| **8** | Substituir conteúdo do Solution Layers | `/` | 🔲 |
| **9** | Substituir cards de persona (FeaturesWithImage) | `/` | 🔲 |
| **10** | Reduzir Counter para 3 itens | `/` | 🔲 |
| **11** | Reduzir FAQ para 3 perguntas | `/` | 🔲 |
| **12** | Esconder VideoTestimonials + Success Stories | `/` | 🔲 |
| **13** | Simplificar /lp para 5 seções apenas | `/lp` | 🔲 |
| **14** | Simplificar onboarding (7→4 passos) | `/app/onboarding` | 🔲 |
| **15** | Simplificar formulário da LP (4→3 passos) | `/lp/audit` | 🔲 |

---

## Métricas de Sucesso

| Métrica | Atual (baseline) | Meta |
|---------|-----------------|------|
| Hero → MiniCalc scroll % | Medir | +30% |
| Taxa de conclusão MiniCalc | Medir | +20% |
| MiniCalc → Signup conversão | Medir | +40% |
| /lp bounce rate | Medir | −25% |
| Taxa de conclusão onboarding | Medir | +50% (menos passos) |
| Tempo do clique CTA ao primeiro diagnóstico | Medir | <2 minutos |

---

# PARTE 5 — CORREÇÕES CRO (aplicadas)

*Aplicadas em 2026-04-19 após rodar auditorias CRO contra o codebase.*

---

## Copy de Pricing (aplicado no código)

| Antes (corrigido) | Depois |
|-------------------|--------|
| "Agentic insights" / "5x more agentic insights" | "Vestigio Pulse AI" / "5x Vestigio Pulse AI" |
| "50 MCP calls/mo" / "250 MCP calls/mo" | "Vestigio Pulse AI interactions/mo" |
| Plano: "Essential intelligence for small teams getting started" | "See what's costing you money. Fix the top 3." / "Veja o que está te custando. Corrija os 3 primeiros." |
| Plano: "Full analysis suite for growing businesses that need an edge" | "Full financial clarity across 3 environments. Daily." / "Clareza financeira completa em 3 ambientes. Diariamente." |
| Plano: "Unlimited scale with dedicated support for large organizations" | "Enterprise-grade. 10 environments. Dedicated support. SLA." / "Enterprise. 10 ambientes. Suporte dedicado. SLA." |

## Fluxo de Auth (aplicado no código)

- Sinais de confiança adicionados ao `/auth/signup`: "Sem cartão de crédito" + "Primeiro diagnóstico em 60s"
- Persistência de domínio: MiniCalc → signup → onboarding via `localStorage`
- Callbacks OAuth redirecionam para `/app` (era `/admin`)
- Onboarding pré-seleciona plano recomendado (Pro)

## Bugs Conhecidos (corrigidos no código)

| Bug | Correção |
|-----|----------|
| Campo nome `maxlength="10"` | Alterado para `maxlength="100"` |
| Callbacks OAuth para `/admin` | Alterado para `/app` |
| Lorem Ipsum em seções i18n | Substituído por copy correto |
| Jargão "MCP calls" no pricing | Substituído por "Vestigio Pulse AI" |

## Problemas Conhecidos (ainda não corrigidos)

| Problema | Impacto | Esforço |
|----------|---------|---------|
| Signup via Magic Link não coleta nome do usuário | Usuários ficam sem nome | Médio |
| Apple Sign-in configurado mas sem botão na UI | Código morto | Baixo |
| Página de resultados da LP mistura inglês e português | Confuso para visitantes não-PT | Médio |
| Findings borrados não mostram impacto financeiro | Oportunidade de FOMO perdida | Baixo |
| Sem triggers de upgrade para Maps/AI Chat/Integrações | Usuários Starter não veem features Pro | Médio |
| Página de thank-you usa cores hardcoded zinc | Quebra no light mode | Baixo |
| Race condition no checkout Paddle com double-open | `setTimeout(1500ms)` é frágil | Baixo |
