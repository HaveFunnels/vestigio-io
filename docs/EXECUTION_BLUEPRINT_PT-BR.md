# Blueprint de Execução — Homepage, Landing Page & Funil

*Última atualização: 2026-04-23 (rev 6 — itens concluídos removidos, status atualizado)*
*Referência: MARKETING_DIRECTION.md*

---

## Como ler este documento

Cada seção segue este formato:

```
ATUAL: O que existe hoje (componente, posição, conteúdo)
VEREDICTO: Manter / Alterar / Remover / Mover / Novo
DIRETIVA: Mudança exata com copy antes→depois
STATUS: 🔲 Not started / 🟡 Partial
```

Itens concluídos foram removidos. Para histórico, consulte o git.

### Regras de terminologia (obrigatórias em toda copy)

| Usar | Nunca usar | Por quê |
|------|-----------|---------|
| Diagnóstico / ciclo | Relatório / Report | "Relatório" implica entregável estático, enfraquece o motor de decisão |
| Diagnosticar / Encontrar / Ver | Auditar / Descobrir | "Auditar" soa compliance; "Descobrir" é passivo |
| Motor de decisão | Plataforma / Solução | Palavras genéricas de SaaS, diferenciação zero |
| Vigiar / Capturar | Monitorar | "Monitorar" soa como ferramenta de uptime |
| Vestigio Pulse AI | MCP calls / Insights agênticos | Jargão interno, sem significado para o usuário |
| 60 segundos | 24 horas | Resultados do MiniCalc são quase instantâneos |

---

# PARTE 1 — HOMEPAGE (/)

**Público:** Orgânico, referência, brand search
**Objetivo:** Criar consciência de categoria. Fazer o visitante pensar "preciso verificar se isso está acontecendo comigo."
**Tom:** Confiança autoritativa (clareza McKinsey, contenção Stripe)

---

## Seção 1: Hero — PENDENTE

Os pills devem ser mais financeiramente específicos:

| Problema atual (EN) | Solução atual (EN) | Problema mais afiado (EN) | Solução mais afiada (EN) |
|---------------------|-------------------|--------------------------|--------------------------|
| "Leads not converting?" | "We show you why" | "Paying for traffic, no conversions?" | "We show you why" |
| "Ad spend not returning?" | "We reveal the leak" | "Scaling ad spend blindly?" | "We quantify the waste" |
| "Nice site, no sales?" | "We find the bottleneck" | "Site looks fine, sales don't?" | "We find what's broken" |
| "Deciding in the dark?" | "Impact in dollars" | "20 problems, no priority?" | "A ranked queue. Fix #1 first." |

**PT-BR correspondente:**

| Problema mais afiado (PT-BR) | Solução mais afiada (PT-BR) |
|------------------------------|----------------------------|
| "Pagando por tráfego sem conversão?" | "Mostramos por quê" |
| "Escalando ad spend no escuro?" | "Quantificamos o desperdício" |
| "Site bonito, vendas não?" | "Encontramos o que está quebrado" |
| "20 problemas, sem prioridade?" | "Uma fila ranqueada. Resolva o #1 primeiro." |

**STATUS:** 🔲 Not started (apenas copy dos pills — todo o resto está feito)

---

## Seção 3: VSL (Video Sales Letter)

**ATUAL:** Componente existe (`VSL/index.tsx`). Caminhos placeholder para vídeo (`/videos/vsl.mp4`, `/videos/vsl-poster.webp`). Sem asset de vídeo real.

**STATUS:** 🟡 Partial (componente pronto, aguardando vídeo real)

---

## Seção 5: Outcomes (SUBSTITUI Features Bento)

**ATUAL:** Posição 6. Componente: `Features/index.tsx`. Quatro cards bento: Action Queue, Revenue Leaks, Continuous Watch, Evidence Orbit.

**VEREDICTO:** Mover para posição 4 (depois do Product Tour). Manter o layout visual bento. Reformular cada card de "o que o produto faz" para "o que acontece com o seu negócio." Papel AIDA: **Desire**.

**DIRETIVA:**

**Card 1 (Action Queue, amber):**

| Atual (EN) | Escrever (EN) | Escrever (PT-BR) |
|------------|--------------|-------------------|
| "A clear queue of what to fix first" | "Know what to fix Monday morning" | "Saiba o que corrigir na segunda de manhã" |
| "Every finding ranked by impact..." | "A ranked queue. Impact in dollars, not color codes. The first item is worth $42k/month." | "Uma fila ranqueada. Impacto em reais, não em cores. O primeiro item vale R$42k/mês. O nono vale R$1.5k. Você sabe por onde começar." |

**Card 2 (Revenue Leaks, red):**

| Atual (EN) | Escrever (EN) | Escrever (PT-BR) |
|------------|--------------|-------------------|
| "Find where money is bleeding" | "See exactly what each problem costs" | "Veja exatamente quanto cada problema custa" |
| "Vestigio quantifies every leak..." | "Not 'high severity'. Not a red dot. A dollar amount: −$18,420/month, 94% confidence." | "Não é 'severidade alta'. Não é um ponto vermelho. Um valor: −R$18.420/mês, 94% de confiança. Você sabe o que dizer pro time." |

**Card 3 (Continuous Watch, emerald):**

| Atual (EN) | Escrever (EN) | Escrever (PT-BR) |
|------------|--------------|-------------------|
| "Catch regressions before your customers do" | "Last week's deploy broke checkout. You'd know in hours, not days." | "O deploy da semana passada quebrou o checkout. Você saberia em horas, não em dias." |
| "Each deploy and campaign creates..." | "Continuous cycles compare every surface against the last." | "Ciclos contínuos comparam cada superfície com a anterior. Quando algo degrada, aparece na sua fila antes de um cliente reclamar." |

**Card 4 (Evidence Orbit, sky):**

| Atual (EN) | Escrever (EN) | Escrever (PT-BR) |
|------------|--------------|-------------------|
| "Every finding traces back to multi-source proof" | "Show your team proof, not your opinion" | "Mostre pro time evidência, não opinião" |
| "Browser-verified, cross-checked..." | "Every finding: browser screenshot, DOM snapshot, performance trace, timestamp." | "Cada finding: screenshot do browser, snapshot do DOM, trace de performance, timestamp. Seu CTO vê evidência, não um dashboard." |

**STATUS:** 🔲 Not started

---

## Seção 6: MiniCalculator (MOVER PRA CIMA)

**ATUAL:** Posição 13. Componente: `MiniCalculator/index.tsx`

**VEREDICTO:** Mover para posição 5 — depois de Outcomes.

**DIRETIVA:**

| Elemento | Atual (EN / PT-BR) | Escrever (EN) | Escrever (PT-BR) |
|----------|-------------------|--------------|-------------------|
| Eyebrow | "Free instant diagnostic" / "Diagnóstico instantâneo gratuito" | "FREE DIAGNOSTIC" | "DIAGNÓSTICO GRATUITO" |
| Tagline | "Try Vestigio on your own domain..." | Remover | Remover |
| Title | "See what you're leaving on the table" | "How much are you losing right now?" | "Quanto você está perdendo agora?" |
| Subtitle | "Enter your website URL..." | "Enter your domain. No signup. No card. 60 seconds." | "Digite seu domínio. Sem cadastro. Sem cartão. 60 segundos." |

**STATUS:** 🔲 Not started (mudança de posição + reescrita de copy)

---

## Seção 7: Problem Statement (SUBSTITUI Solution Layers)

**ATUAL:** Posição 4. Componente: `SolutionLayers/index.tsx`.

**VEREDICTO:** Substituir conteúdo. Manter a animação sticky-stack. Mudar de processo do produto para consequência do usuário. Mover para posição 6.

**DIRETIVA:**

| Elemento | Atual (EN) | Escrever (EN) | Escrever (PT-BR) |
|----------|-----------|--------------|-------------------|
| Eyebrow | "What Vestigio does" | "THE PROBLEM" | "O PROBLEMA" |
| Title | "Refuse to scale your business in the dark." | "Traffic is not the problem. Scaling a broken system is." | "Tráfego não é o problema. Escalar um sistema quebrado é." |

**Card 1 (EN / PT-BR):**
```
EN:    "Pages that don't convert. You're paying for traffic that hits a wall. 
        Every visitor that bounces is money you already spent."
PT-BR: "Páginas que não convertem. Você paga por tráfego que bate numa parede.
        Cada visitante que sai é dinheiro que você já gastou."
```

**Card 2 (EN / PT-BR):**
```
EN:    "Checkouts that leak trust. Your payment flow has friction you can't see. 
        The drop-off happens silently — no alert, no notification."
PT-BR: "Checkouts que vazam confiança. Seu fluxo de pagamento tem fricção que você não vê.
        O abandono acontece em silêncio — sem alerta, sem notificação."
```

**Card 3 (EN / PT-BR):**
```
EN:    "Fixes you can't verify. You ship a fix, but did it actually work? 
        Without continuous verification, you're guessing."
PT-BR: "Correções que você não consegue verificar. Você corrige, mas funcionou de verdade?
        Sem verificação contínua, é chute."
```

**Após os 3 cards (EN / PT-BR):**
```
EN:    "This is what 'scaling in the dark' looks like. And it costs money every day."
PT-BR: "Isso é escalar no escuro. E custa dinheiro todo dia."
```

**STATUS:** 🔲 Not started

---

## Seção 8: Use Cases (SUBSTITUI FeaturesWithImage)

**ATUAL:** Posição 5. Componente: `FeaturesWithImage/index.tsx`. Escondido no mobile.

**VEREDICTO:** Substituir com cenários por persona. Mostrar no mobile.

**DIRETIVA:**

| Elemento | Escrever (EN) | Escrever (PT-BR) |
|----------|--------------|-------------------|
| Eyebrow | "BUILT FOR" | "FEITO PARA" |
| Title | "Operators who won't scale blind" | "Operadores que não escalam no escuro" |

**Card 1: O Fundador (EN / PT-BR)**
```
EN:    "I spend $40k/month on ads. Am I sending traffic into a broken funnel?"
       Vestigio answers in 60 seconds. With dollar amounts on every finding.
PT-BR: "Gasto R$200k/mês em ads. Estou mandando tráfego pra um funil quebrado?"
       A Vestigio responde em 60 segundos. Com valores em reais em cada finding.
```

**Card 2: O Head de Growth (EN / PT-BR)**
```
EN:    "We shipped last week. Did anything break?"
       Vestigio compares every surface against the last cycle.
PT-BR: "Fizemos deploy semana passada. Quebrou alguma coisa?"
       A Vestigio compara cada superfície com o ciclo anterior. Regressões aparecem ranqueadas por impacto.
```

**Card 3: O CTO (EN / PT-BR)**
```
EN:    "Chargebacks are climbing. Where's the root cause?"
       Vestigio traces chargeback risk to specific surfaces, policies, and trust gaps.
PT-BR: "Chargebacks estão subindo. Qual é a causa raiz?"
       A Vestigio rastreia risco de chargeback até superfícies, políticas e gaps de confiança específicos.
```

**STATUS:** 🔲 Not started

---

## Seção 9: Counter / Value Props

**DIRETIVA:** Simplificar para 3 itens.

```
EN:    [4X ROI Guarantee]  [First diagnostic in 60s]  [15,000+ signals per cycle]
PT-BR: [Garantia de 4X ROI] [Primeiro diagnóstico em 60s] [15.000+ sinais por ciclo]
```

**STATUS:** 🔲 Not started

---

## Seção 11: Testimonial Cards / Success Stories

**VEREDICTO:** Substituir com resultados reais de clientes ou contador honesto.

**STATUS:** 🔲 Not started

---

## Seção 12: FAQ

**VEREDICTO:** Reduzir para 3 perguntas estratégicas de conversão.

| # | Nova Pergunta (EN) | Nova Pergunta (PT-BR) | Nova Resposta (PT-BR) |
|---|---|---|---|
| 1 | "How is this different from Google Analytics?" | "Como isso é diferente do Google Analytics?" | "O GA diz o que aconteceu. A Vestigio diz por quê, quanto custa, e o que corrigir primeiro." |
| 2 | "Can I try before paying?" | "Posso testar antes de pagar?" | "Sim. Digite seu domínio, veja seu primeiro diagnóstico em 60 segundos. Sem cadastro, sem cartão." |
| 3 | "How accurate are the financial estimates?" | "Quão precisas são as estimativas financeiras?" | "Cada finding usa intervalos de confiança, não chutes. Evidência verificada por browser com timestamp." |

**STATUS:** 🔲 Not started

---

## Seção 13: CTA Final

**DIRETIVA:**

```
EN:    Title: "The money is leaving now."  Subtitle: "Every day without visibility is revenue you don't recover."
PT-BR: Title: "O dinheiro está saindo agora."  Subtitle: "Cada dia sem visibilidade é receita que você não recupera."
CTA:   [Rodar Diagnóstico Gratuito]
Micro: "Você pode estar olhando seu primeiro diagnóstico em 60 segundos."
```

**STATUS:** 🔲 Not started

---

## Ordem das Seções da Homepage

**ORDEM ATUAL (Home/index.tsx):**
1. Hero ✅
2. Social Proof Strip ✅
3. VSL 🟡
4. Product Tour ✅
5. ClientGallery ✅
6. SolutionLayers
7. FeaturesWithImage
8. Features
9. Counter
10. VideoTestimonials ✅ (vídeos reais de clientes do R2 CDN)
11. Testimonials ← placeholder, substituir
12. FAQ
13. MiniCalculator ← posição errada
14. (CallToAction ausente da composição)

**ORDEM ALVO (AIDA):**
1. Hero ✅ — **Atenção**
2. Social Proof Strip ✅ — **Atenção** reforço
3. VSL 🟡 — **Atenção → Interesse**
4. Product Tour ✅ — **Interesse**
5. Outcomes (Features bento) — **Desejo**
6. MiniCalculator (MOVIDO da 13) — **Ação**
7. ClientGallery — social proof
8. Problem Statement (SolutionLayers reescrito) — rede de segurança
9. Use Cases (FeaturesWithImage reescrito) — rede de segurança
10. Counter (reduzido para 3 itens) — rede de segurança
11. Video Testimonials ✅ — social proof real
12. FAQ (reduzido para 3 perguntas) — objeções
13. CallToAction (reescrito) — ação final

---

# PARTE 2 — LANDING PAGE (/lp)

**Público:** Tráfego pago — foco e-commerce
**Objetivo:** Converter. Uma ação. Corresponder à promessa do anúncio.
**Tom:** Confronto financeiro direto

**Scroll total:** 2 telas máximo.

---

## Seção 1: Hero + CTA — PENDENTE

A /lp atualmente renderiza a homepage inteira. Deve ser reduzida a 5 seções:

1. Hero (com copy específica da LP) ✅
2. MiniCalculator (interação imediata)
3. "O que seu primeiro diagnóstico mostra" (3 linhas com checkmark)
4. Um ponto de prova (estatística ou quote real)
5. CTA final (repetição)

**STATUS:** 🟡 Partial (hero feito, estrutura da página não simplificada)

---

## Seção 3: O que você vai ver

```
Título: "Seu primeiro diagnóstico mostra:"
- Uma fila ranqueada do que está custando dinheiro
- Valores em reais em cada finding (não cores de severidade)
- Evidência verificada por browser que você pode mostrar pro time
```

**STATUS:** 🔲 Not started

---

## Seção 4: Um ponto de prova

```
"Primeiro diagnóstico médio: 9 findings, R$41k/mês em receita recuperável."
```

**STATUS:** 🔲 Not started

---

## Seção 5: CTA final (repetição)

```
Você está encontrando os vazamentos ou financiando eles.
[Rodar Diagnóstico Gratuito]
```

**STATUS:** 🔲 Not started

---

# PARTE 3 — REDESIGN DO FUNIL

---

## Homepage CTA → Fluxo de Signup

**DIRETIVA:** Simplificar de 7 para 4 passos (1 pergunta por tela).

**Passo 1:** Domínio
**Passo 2:** Tipo de negócio + modelo de conversão (cards grandes)
**Passo 3:** Receita mensal
**Passo 4:** Seleção de plano

**STATUS:** 🔲 Not started

---

## LP CTA → Funil de Leads

**DIRETIVA:** Simplificar de 4 para 3 passos:

**Passo 1:** Domínio + checkbox de propriedade
**Passo 2:** Receita (modelo de conversão inferido dos sinais do crawl)
**Passo 3:** Email apenas (sem telefone)

**STATUS:** 🔲 Not started

---

# PARTE 4 — DIRETIVAS TRANSVERSAIS

---

## Consistência de CTA

| Contexto | Texto do CTA |
|----------|-------------|
| Hero primário | "Rodar Diagnóstico Gratuito" |
| MiniCalc submit | "Rodar Diagnóstico Gratuito" |
| Product Tour | "Rodar Diagnóstico Gratuito" |
| Seção final | "Rodar Diagnóstico Gratuito" |
| Após resultados | "Criar Conta Gratuita" |

Nunca: "Comece Grátis", "Saiba Mais", "Cadastre-se", "Teste Grátis", "Rodar Auditoria Gratuita"

---

## Formatação de Números

- Sempre usar sinal de menos `−` (U+2212), não hífen `-`
- Sempre mostrar intervalos: `−R$18k–R$42k/mês`
- Sempre incluir unidade de tempo: `/mês`
- Usar `k` para milhares, `m` para milhões
- Intervalos de confiança: `94% de confiança`

---

## Ordem de Implementação

| Fase | O quê | Páginas | Status |
|------|-------|---------|--------|
| **4** | ~~Mover MiniCalc para posição 5~~ → Adicionada cópia após HomeBigCard | `/`, `/lp` | ✅ |
| **5** | Reescrever CTA final | `/`, `/lp` | ✅ |
| **6** | Reformular cards do features bento | `/` | ✅ |
| **7** | Substituir conteúdo Solution Layers | `/` | ✅ |
| **8** | Substituir cards de persona (FeaturesWithImage) | `/` | 🔲 |
| **9** | Reduzir Counter para 3 itens | `/` | 🔲 |
| **10** | Reduzir FAQ para 3 perguntas | `/` | 🔲 |
| **11** | Substituir Success Stories (dados reais ou contador) | `/` | 🔲 |
| **12** | Simplificar /lp para 5 seções | `/lp` | 🔲 |
| **13** | Simplificar onboarding (7→4 passos) | `/app/onboarding` | 🔲 |
| **14** | Simplificar formulário de leads LP (4→3 passos) | `/lp/audit` | 🔲 |

---

## Issues Conhecidas (não corrigidas)

| Issue | Impacto | Esforço |
|-------|---------|---------|
| Signup via Magic Link não coleta nome do usuário | Usuários sem nome | Médio |
| Apple Sign-in configurado mas sem botão na UI | Código morto | Baixo |
| Página de resultado da LP mistura EN e PT | Confuso para não-PT | Médio |
| Findings borrados não mostram impacto financeiro | Oportunidade de FOMO perdida | Baixo |
| Sem triggers de upgrade para Maps/AI Chat/Integrations | Usuários Starter perdem features Pro | Médio |
| Race condition no checkout Paddle (double-open) | `setTimeout(1500ms)` é frágil | Baixo |
