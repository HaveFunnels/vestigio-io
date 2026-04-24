# Blueprint de Execução — Homepage, Landing Page & Funil

*Última atualização: 2026-04-24 (rev 7 — fases 4-8 concluídas removidas)*
*Referência: MARKETING_DIRECTION.md*

---

## Como ler este documento

Itens concluídos foram removidos. Para histórico, consulte o git.

### Regras de terminologia (obrigatórias em toda copy)

| Usar | Nunca usar | Por quê |
|------|-----------|---------|
| Diagnóstico / ciclo | Relatório / Report | "Relatório" implica entregável estático |
| Diagnosticar / Encontrar / Ver | Auditar / Descobrir | "Auditar" soa compliance; "Descobrir" é passivo |
| Motor de decisão | Plataforma / Solução | Palavras genéricas de SaaS |
| Vigiar / Capturar | Monitorar | "Monitorar" soa como ferramenta de uptime |
| Vestigio Pulse AI | MCP calls / Insights agênticos | Jargão interno |
| 60 segundos | 24 horas | Resultados são quase instantâneos |

---

# PARTE 1 — HOMEPAGE (/)

---

## Seção 1: Hero — PENDENTE

Os pills devem ser mais financeiramente específicos:

| Problema mais afiado (PT-BR) | Solução mais afiada (PT-BR) |
|------------------------------|----------------------------|
| "Pagando por tráfego sem conversão?" | "Mostramos por quê" |
| "Escalando ad spend no escuro?" | "Quantificamos o desperdício" |
| "Site bonito, vendas não?" | "Encontramos o que está quebrado" |
| "20 problemas, sem prioridade?" | "Uma fila ranqueada. Resolva o #1 primeiro." |

**STATUS:** 🔲 Not started (apenas copy dos pills)

---

## Seção 3: VSL

**ATUAL:** Componente existe. Sem vídeo real.

**STATUS:** 🟡 Partial (aguardando vídeo)

---

## Seção 6: MiniCalculator — reescrita de copy

| Elemento | Atual | Escrever (PT-BR) |
|----------|-------|-------------------|
| Eyebrow | "Diagnóstico instantâneo gratuito" | "DIAGNÓSTICO GRATUITO" |
| Tagline | remover | — |
| Title | "Veja o que está deixando na mesa" | "Quanto você está perdendo agora?" |
| Subtitle | "Digite a URL..." | "Digite seu domínio. Sem cadastro. Sem cartão. 60 segundos." |

**STATUS:** 🔲 Not started

---

## Seção 9: Counter / Value Props

Simplificar de 6 para 3 itens:

```
[Garantia de 4X ROI]    [Primeiro diagnóstico em 60s]    [15.000+ sinais por ciclo]
```

**STATUS:** 🔲 Not started

---

## Seção 11: Success Stories

Substituir placeholders com dados reais ou contador honesto.

**STATUS:** 🔲 Not started

---

## Seção 12: FAQ

Reduzir de 4 para 3 perguntas:

| # | Nova Pergunta (PT-BR) | Nova Resposta (PT-BR) |
|---|---|---|
| 1 | "Como isso é diferente do Google Analytics?" | "O GA diz o que aconteceu. A Vestigio diz por quê, quanto custa, e o que corrigir primeiro." |
| 2 | "Posso testar antes de pagar?" | "Sim. Digite seu domínio, veja seu primeiro diagnóstico em 60 segundos. Sem cadastro, sem cartão." |
| 3 | "Quão precisas são as estimativas financeiras?" | "Cada finding usa intervalos de confiança, não chutes. Evidência verificada por browser com timestamp." |

**STATUS:** 🔲 Not started

---

## Ordem das Seções da Homepage

1. Hero ✅
2. Social Proof Strip ✅
3. VSL 🟡
4. Product Tour ✅
5. ClientGallery ✅
6. MiniCalculator ✅ (cópia após HomeBigCard)
7. SolutionLayers ✅ (consequence-driven)
8. FeaturesWithImage ✅ (persona cards)
9. Features ✅ (outcome-first bento)
10. Counter
11. VideoTestimonials ✅
12. Testimonials ← placeholder
13. FAQ
14. MiniCalculator ✅ (posição original)
15. CallToAction ✅

---

# PARTE 2 — LANDING PAGE (/lp)

## Estrutura LP — reduzir para 5 seções

1. Hero ✅
2. MiniCalculator
3. "O que seu diagnóstico mostra" (3 linhas com checkmark) 🔲
4. Um ponto de prova 🔲
5. CTA final 🔲

**STATUS:** 🟡 Partial

---

# PARTE 3 — REDESIGN DO FUNIL

## Signup: 7→4 passos

1. Domínio + checkbox
2. Tipo de negócio + modelo de conversão
3. Receita mensal
4. Seleção de plano

**STATUS:** 🔲 Not started

## LP Lead Form: 4→3 passos

1. Domínio + checkbox
2. Receita
3. Email apenas

**STATUS:** 🔲 Not started

---

# PARTE 4 — DIRETIVAS TRANSVERSAIS

## Consistência de CTA

| Contexto | Texto |
|----------|-------|
| Hero | "Rodar Diagnóstico Gratuito" |
| MiniCalc | "Rodar Diagnóstico Gratuito" |
| Product Tour | "Rodar Diagnóstico Gratuito" |
| Seção final | "Rodar Diagnóstico Gratuito" |
| Após resultados | "Criar Conta Gratuita" |

Nunca: "Comece Grátis", "Saiba Mais", "Cadastre-se", "Teste Grátis"

---

## Ordem de Implementação

| Fase | O quê | Status |
|------|-------|--------|
| **9** | Reduzir Counter para 3 itens | 🔲 |
| **10** | Reduzir FAQ para 3 perguntas | 🔲 |
| **11** | Substituir Success Stories | 🔲 |
| **12** | Reescrita de copy do MiniCalc | 🔲 |
| **13** | Simplificar /lp para 5 seções | 🔲 |
| **14** | Simplificar onboarding (7→4 passos) | 🔲 |
| **15** | Simplificar LP lead form (4→3 passos) | 🔲 |

---

## Issues Conhecidas

| Issue | Impacto | Esforço |
|-------|---------|---------|
| Magic Link não coleta nome | Usuários sem nome | Médio |
| Apple Sign-in sem botão na UI | Código morto | Baixo |
| Resultado LP mistura EN e PT | Confuso | Médio |
| Findings borrados sem impacto financeiro | FOMO perdido | Baixo |
| Sem triggers de upgrade | Starter perde features Pro | Médio |
| Race condition Paddle checkout | Frágil | Baixo |
