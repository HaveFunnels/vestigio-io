# Resposta ao comentário da Casa Montelle — correções aplicadas na Vestigio

**Data:** 2026-09-10
**Responde a:** "Comentário ao Plano de Estratégia Setembro 2026" (09/09), placar 3 procedem / 3 cobertura / 10 análise
**Finalidade:** permitir que o analista da Montelle avalie se as correções cobrem os problemas apontados, item a item, e o que ficou deliberadamente para depois.

Uma nota de método antes da lista: **o plano de setembro que vocês comentaram foi gerado antes de qualquer correção abaixo.** Nada neste documento conserta aquele PDF; conserta o gerador. A avaliação de cobertura honesta é sobre um plano **regenerado** — ver seção 4.

---

## 1. O que foi corrigido, mapeado aos seus pontos

### Família "dinheiro fabricado" — N2, N3, N4, N5, T4, T7, R4

| ponto de vocês | correção | resultado verificável num plano novo |
|---|---|---|
| N2/T7 — R$ 305.756/mês somando percentuais sem teto, 1,5x a receita real | Teto de agregação: nenhuma soma de exposição pode exceder **40% da receita mensal declarada** (`packages/impact/exposure-cap.ts`; racional documentado: o maior baseline individual é 35% — agregado acima disso afirma sobreposição, agregado acima da receita afirma aritmética quebrada). Estimativas individuais por finding permanecem, pois isoladas são defensáveis. | Nenhum R$ agregado no plano acima de 40% da receita declarada. Para a Montelle (se declarado ~R$ 198k): teto de ~R$ 79k/mês. |
| N3 — "essa é receita em risco, não projeção" | A frase não existia no código: era o LLM obedecendo regras de voz que empurravam "receita em risco" sem contra-regra. Ambos os prompts (narrativa e tese) agora carregam regra absoluta: valores de baseline são **estimativas** e nunca podem ser descritos como medidos; "medido" é reservado a dado do pixel. | Nenhuma ocorrência de "não é projeção", "medido", "comprovado" aplicada a valor de baseline. |
| N4/T4 — "R$ 23.750 recuperados", "maior ganho" datado no dia da geração | "Recuperado" agora tem **uma única fonte** em todas as seções (`honest-aggregates.ts`): ações que o cliente marcou como concluídas E que o ciclo seguinte verificou. `Finding.status="resolved"` (que dispara quando a detecção para de acusar — inclusive quando o detector é consertado) não alimenta mais nenhum número de recuperação. O "maior ganho" é nomeado pelo que o cliente fez, não pela chave do detector que silenciou. | "Recuperado" zerado até existir ação fechada e verificada. Sem "maior ganho" datado em dia de deploy do detector. |
| N5 — "a medição está calibrada e segurando receita" | Era literalmente instrução nossa: o prompt injetava "Está calibrado / segura receita" no ponto positivo. Removido; o positivo é descrito como ponto forte detectado, sem certificado de calibração. | Nenhuma afirmação de calibração de medição. |
| R4 — janelas 3M/6M/12M repetindo o mesmo dado numa conta de <3 meses | Janelas que alcançam antes da existência da conta são marcadas `insufficientHistory` com `accountSince`. E o conteúdo delas mudou de base (ações verificadas), o que elimina a repetição do mesmo "ganho" fantasma. | Janelas de 6/12M sinalizadas como histórico insuficiente, não apresentadas como um ano de dados. |
| N1 — contagens inconsistentes (34/26/28/72) | **Parcial.** A troca de base (ações verificadas vs. transições de detector) remove a maior fonte de divergência; não implementamos ainda uma contagem única canônica compartilhada por todas as seções. | Divergência reduzida; consistência total ainda não garantida. |

### Família "superfícies inexistentes" — T1, T2, T5

Causa raiz confirmada por vocês e por nós: um mapa estático `inference_key → paths` com vocabulário SaaS (`/pricing`, `/features`, `/about`, `/support`, `/product`) escrito verbatim nos findings.

**Correção:** todo finding resolve sua superfície nesta ordem — (1) a URL de evidência de onde a observação veio; (2) apenas os tokens do vocabulário que **casam com um path realmente rastreado** (com prefixo: `/product` sobrevive via `/products/x`); (3) site inteiro (`/`). Evidência off-site (domínios clonados) ancora como site inteiro em vez de vazar host no campo de path. Fixado por 8 testes de regressão (`surface-resolution.test.ts`).

**Resultado verificável:** nenhum finding num plano novo cita um path que retorne 404. Cada path citado esteve no crawl.

### Família "passos incoerentes" — P3

Causa: título vem da ação, corpo vem do LLM, procedimento vem de um catálogo pela chave primária — três fontes sem verificação cruzada, e o "empréstimo" de procedimento entre passos disparava por texto idêntico sem exigir a mesma causa.

**Correções:** (1) emprestar o procedimento de um passo anterior agora **exige a mesma causa primária**; colisão de catálogo cai no procedimento genérico — menos específico, porém verdadeiro. (2) Regra de prompt: o corpo trata exclusivamente do problema e da superfície do título; menção a outra superfície só como uma frase de contraste explícito com o Passo 1.

**Resultado verificável:** nenhum passo com título de um assunto e checklist de outro.

### P1 — "afirmar ausência quando é não-verificado"

**Parcial.** A resolução de superfícies elimina os casos ancorados em página inexistente. O caso específico de vocês — crawler não alcança o checkout NX4 (exige `cart`) e o plano concluiu "não há selos" — exige um mecanismo de "superfície não verificada" nos detectores de ausência, que **não foi implementado ainda**. Registrado como pendência de mesma prioridade do item 4.1.6 de vocês.

---

## 2. Correções anteriores que afetam a próxima leitura (08–09/09)

Já estavam no ar antes do parecer ou entraram no mesmo dia; listadas porque mudam o dado que qualquer round 2 vai olhar:

- `cta_click` restrito a rótulo comercial (antes: seta de carrossel marcava `intent_expressed`);
- `cta_viewed` restrito a CTA comercial (antes: 7,2 eventos/pageview de botão genérico);
- `load_ms` passou a ser coletado (antes: 155 amostras em 50.409 heartbeats);
- Sessões agregadas em `BehavioralSessionAggregate` (base para o item 7 de vocês).

Dado comportamental **anterior a 09/09** continua contaminado pelos dois primeiros; qualquer métrica de intenção histórica deve ser lida com essa ressalva.

## 3. O que NÃO foi coberto ainda, deliberadamente

Do 4.1 de vocês, em ordem da nossa fila:

| item de vocês | status | nota |
|---|---|---|
| 6 — handoff por comportamento + intercept de `fetch`/XHR `/cart/add` | **próximo** | invalida nosso "zero handoff" e a cegueira de add-to-cart; é a maior correção de medição pendente |
| 4 — `/account` como login de plataforma, não checkout | **próximo** | detector ainda classifica errado |
| 7 — publicar o que o pixel mediu no plano (origem, permanência, scroll, alerta TikTok) + filtro de bot | **planejado** | é a mudança estrutural; a fundação (agregados de sessão) está no ar em modo sombra |
| 5 — pixel no checkout NX4 + paths configuráveis por env | **planejado** | ingest já aceita subdomínio; falta o path config (`/c/<slug>`, `/order/<id>`); o `data-order-id` que vocês adicionaram será usado |
| 9 — snippet próprio listado no supply chain + SRI | **pendente** | correto e constrangedor; entra com o item 6 |
| 1 (parte) — usar receita real da Shopify conectada como base do teto | **pendente** | hoje o teto usa a receita declarada no perfil |

## 4. Como avaliar a cobertura

1. Regeneraremos o plano de setembro da Montelle com o gerador corrigido e enviaremos o novo PDF.
2. Checklist objetivo sobre o plano novo: (a) algum R$ agregado > 40% da receita declarada? (b) algum "recuperado" sem ação verificada? (c) algum path citado que 404? (d) algum passo com título/procedimento de assuntos diferentes? (e) janelas de memória apresentando histórico que não existe?
3. Qualquer "sim" é regressão nossa e voltamos ao ponto.

O objetivo declarado deste ciclo, nas palavras do operador: *o plano deve ser preciso quanto às suas recomendações e descobrir insights que nem mesmo a Montelle conseguiu encontrar.* A precisão é este documento; os insights novos dependem dos itens 6, 7 e 5 acima — o pixel enxergando o que a instrumentação de vocês, por estar só no produto e checkout, não vê: o comportamento site-inteiro por origem, antes do clique em Comprar.
