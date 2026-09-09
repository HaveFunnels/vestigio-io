# Casa Montelle — leitura comportamental do Vestigio

**Data:** 09/09/2026
**Finalidade:** cruzamento com a instrumentação própria da Casa Montelle para medir a acurácia da inferência comportamental do Vestigio.

---

## 0. Por que este documento existe

Este não é um relatório de conclusões fechadas. É um conjunto de **afirmações verificáveis**, cada uma com o número que a sustenta e o método que a produziu, para que quem tem a verdade de campo possa confirmar ou refutar item a item.

A assimetria de cobertura é o ponto central do exercício:

| | Vestigio | Instrumentação Casa Montelle |
|---|---|---|
| Site inteiro (home, coleções, políticas) | **sim** | não |
| Página de produto | sim | **sim** |
| Carrinho | parcial (só se mudar URL) | — |
| Checkout | **não** | **sim** |
| Pedido concluído / receita | **não** | **sim** |

**A sobreposição é a página de produto.** É lá que a acurácia pode ser medida. Fora dela, divergência é esperada e não significa erro — significa cobertura diferente.

Onde eu digo "zero checkout", leia-se **"zero eventos de checkout observados pelo pixel do Vestigio"**, não "zero vendas". O pixel não está no checkout.

---

## 1. Base de medição

| | |
|---|---|
| Janela | 25/07/2026 a 09/09/2026 (46 dias) |
| Sessões | 46.972 |
| Eventos | 572.499 |
| Domínio | casamontelle.com |
| Origem do dado | pixel first-party do Vestigio (`public/snippet/vestigio.js`) |

Todos os números deste documento vêm desta base única. Uma versão anterior desta análise misturava duas amostras (2.000 sessões agregadas para umas métricas, 46 mil para outras); os números abaixo foram recalculados sobre a base completa.

**Sessão** = agrupamento por `sessionId` gerado no navegador, com timeout de 30 minutos de inatividade. Não é sessão de GA4 nem de Shopify Analytics — **divergência de contagem total de sessões é esperada e não indica erro**.

---

## 2. Definições — leia antes de comparar números

A maior fonte de falso desacordo é definicional. O que cada termo significa aqui:

| termo | definição exata no Vestigio |
|---|---|
| `form_start` | Primeiro `focusin` em um input dentro de um `<form>`, por formulário, por página. **Não é específico do formulário de compra.** |
| `form_submit` | Evento `submit` disparado pelo `<form>`. Se o tema adiciona ao carrinho via `fetch()` num handler de clique sem submeter o form, **não gera evento**. |
| `scroll_depth` | Marcos discretos de 25%, 50%, 75% e 90%. Não existe granularidade entre 0 e 25 — "0% de scroll" significa **"não atingiu 25%"**, não "não moveu um pixel". |
| `cta_click` | Clique em elemento cujo texto casa com padrão comercial. **Ver seção 6 — esta definição estava quebrada durante a janela medida.** |
| duração da sessão | Último evento menos primeiro evento. Uma sessão de 1 evento tem duração 0. |
| `viu_carrinho` | Alguma URL da sessão contém `/cart` ou `/carrinho`. **Carrinho em drawer não muda URL e não é contado.** |

---

## 3. Afirmações para verificação

Cada uma numerada, com confiança declarada e como refutar.

### A1 — 83,7% das sessões não atingem 25% de scroll

39.311 de 46.972 sessões nunca dispararam o marco de 25%. 20.532 (43,7%) duraram menos de 10 segundos.

**Confiança: alta.** Medição direta, não inferida.
**Como refutar:** se a instrumentação de vocês registra profundidade de rolagem contínua na página de produto e a mediana for materialmente acima de 25%.

### A2 — O tráfego do TikTok tem mediana de 2 segundos por sessão

| origem | sessões | % sem atingir 25% scroll | duração mediana |
|---|---|---|---|
| Facebook | 23.919 | 78,2% | 32 s |
| **TikTok** | **20.964** | **94,3%** | **2 s** |
| direto/sem origem | 2.014 | 40,9% | 58 s |

Com DOM pronto em 1,3 s (mediana, 50.413 amostras), uma sessão de 2 segundos significa saída quase imediata à renderização.

**Confiança: alta** para a comparação relativa entre origens. **Média** para o valor absoluto, porque uma sessão de evento único mede 0 e isso puxa a mediana para baixo.
**Como refutar:** tempo de permanência na página de produto por origem, na instrumentação de vocês.

### A3 — O tráfego direto/orgânico converte muito melhor que o pago

| origem | sessões | enviou form de compra | taxa |
|---|---|---|---|
| Facebook | 23.919 | 52 | 0,217% |
| TikTok | 20.964 | 18 | 0,086% |
| **direto/sem origem** | **2.014** | **73** | **3,625%** |

O tráfego direto é 4,3% do volume e responde por 51% dos envios de formulário de compra observados. Também é o que mais chega ao carrinho: 40 sessões, contra 19 do Facebook e 2 do TikTok.

**Confiança: alta** para a direção. **Baixa** para os valores absolutos — ver A4.
**Como refutar:** conversão por origem no analytics de vocês. **Esta é a afirmação mais importante do documento**; se ela se sustentar, tem implicação direta de alocação de verba.

### A4 — O funil observado termina antes do checkout

```
46.972  sessões
39.311  não atingiram 25% de scroll        (83,7%)
 3.897  focaram um form em página de produto (8,3%)
   143  dispararam submit de form em produto (0,30%)
    61  visitaram uma URL de carrinho        (0,13%)
     0  eventos de checkout
```

**Confiança: baixa nos degraus finais.** Ver seção 5 — há pelo menos três motivos técnicos para esses números serem artificialmente baixos.
**Como refutar:** número real de add-to-cart e de checkouts iniciados no mesmo período. **Espero divergência grande aqui, e é isso que o exercício deve medir.**

### A5 — O formulário da página de produto tem conclusão anômala frente aos demais formulários do site

| formulário | sessões que iniciaram | que enviaram | conclusão |
|---|---|---|---|
| **página de produto** | **3.894** | **143** | **3,7%** |
| busca | 104 | 56 | 53,8% |
| outras páginas | 286 | 78 | 27,3% |
| contato | 20 | 5 | 25,0% |

O argumento aqui é **interno e relativo**: todos os formulários foram medidos pelo mesmo mecanismo, então um deles convertendo a 3,7% enquanto os outros ficam entre 25% e 54% aponta para algo específico daquele formulário — seja atrito real, seja o mecanismo de medição não servir para ele.

**Confiança: média.** A anomalia é real; a interpretação ("o formulário de compra tem atrito") é **uma de duas explicações possíveis**, e a outra está na seção 5.
**Como refutar:** se o add-to-cart de vocês não é um submit de formulário, esta comparação é inválida e deve ser descartada.

### A6 — 16,2% das páginas levam mais de 3 segundos para o DOM ficar pronto

50.413 amostras. Mediana 1.309 ms, p75 2.243 ms, p90 4.013 ms.

**Confiança: alta** para `dom_ready`. **Nenhuma** para tempo de carregamento completo — ver seção 6.
**Como refutar:** dados de Web Vitals de vocês (LCP, TTFB) na página de produto.

---

## 4. Interpretação, separada dos fatos

Os números acima são medições. O que segue é leitura, e pode estar errada:

1. **O TikTok parece estar comprando toques acidentais.** Mediana de 2 segundos e 94,3% sem scroll, em campanhas cujo nome indica segmentação ampla ("ABERTO", "35+ ALL", "25+ FEM"), é o padrão de clique no feed sem intenção.

2. **O tráfego direto é o ativo subexplorado.** 4% do volume, 51% da intenção de compra observada. Entender de onde ele vem provavelmente vale mais que otimizar os 44 mil pagos.

3. **A comparação entre formulários sugere atrito específico na compra** — mas só se o add-to-cart for de fato um submit de formulário.

---

## 5. Três motivos para o funil estar subestimado

Em ordem de probabilidade:

**5.1 — Add-to-cart via AJAX sem submit.** Se o tema intercepta o clique e faz `fetch('/cart/add')` sem submeter o `<form>`, o Vestigio não vê `form_submit`, não vê mudança de URL e não vê nada. Isso explicaria sozinho os três degraus finais. **É a primeira coisa a verificar.**

**5.2 — Carrinho em drawer.** Carrinho lateral não muda URL. As 61 sessões de "viu carrinho" seriam só as que abriram `/cart` como página.

**5.3 — Checkout fora do alcance.** O checkout do Shopify roda em domínio/caminho onde o pixel não está instalado. Sem isso, "0 checkout" é tautológico.

Vale notar que o Vestigio registrou **zero handoff para host externo** em 46.972 sessões. Se houvesse redirecionamento para um checkout em outro domínio, o pixel deveria ter detectado a saída. A ausência sugere que os visitantes não chegam a esse ponto — mas se o handoff só ocorre depois de um add-to-cart que não estamos vendo (5.1), a ausência não prova nada.

---

## 6. Bugs na instrumentação do Vestigio durante esta janela

Divulgação completa — estes defeitos afetam o dado acima e foram corrigidos em 09/09/2026, **depois** da coleta:

**6.1 — `cta_click` contava navegação como intenção de compra.**
Qualquer `<a>`, `<button>` ou `[role=button]` era classificado como CTA. De 12.795 cliques registrados, **24 tinham rótulo comercial** — todos "Ver carrinho". Os mais frequentes eram "Próxima" e "Anterior" (setas de carrossel), "Abrir menu", "Fechar".

Consequência séria: um `cta_click` marcava a sessão como tendo atingido o marco `intent_expressed`. **Clicar na seta do carrossel marcava o visitante como tendo expressado intenção de compra.** Qualquer número de "intenção" ou "engajamento com CTA" desta janela está inflado e não deve ser cruzado.

**6.2 — Tempo de carregamento não era medido.**
O snippet lia `performance.timing.loadEventEnd` dentro do handler de `load`, quando esse valor ainda é 0. Resultado: 50.409 heartbeats, **155 com tempo de carregamento**. A seção A6 usa `dom_ready_ms`, que era coletado corretamente.

**6.3 — `cta_viewed` observava todo botão da página.**
Corrigido em 08/09. Gerava 7,2 eventos por pageview e inflava o denominador da taxa de engajamento com CTA. Pelo mesmo motivo de 6.1, taxas de engajamento desta janela não são confiáveis.

Os números das seções A1 a A5 **não dependem** de nenhum dos três — usam scroll, duração, atribuição, eventos de formulário e URL. A6 usa `dom_ready`, não afetado.

---

## 7. O que eu gostaria de saber de vocês

Em ordem de valor para calibrar o Vestigio:

1. **O add-to-cart é submit de formulário ou `fetch()` em handler de clique?** Determina se A4 e A5 são válidos ou lixo.
2. **Quantos add-to-cart e checkouts iniciados no período 25/07–09/09?** O delta contra 143 e 0 mede o tamanho do ponto cego.
3. **Conversão por origem (FB / TikTok / direto).** A3 é a afirmação com maior consequência prática; quero saber se ela se sustenta.
4. **Tempo de permanência na página de produto por origem.** Confirma ou derruba A2.
5. **Contagem total de sessões de vocês no período.** Para calibrar a diferença de definição, não para comparar diretamente.

---

## 8. O que este exercício deve produzir

Não "o Vestigio acertou ou errou", mas **onde a inferência comportamental sem acesso ao backend chega perto da verdade e onde ela erra sistematicamente**. As três respostas possíveis, todas úteis:

- **Convergência na página de produto** → a inferência vale, e o gap é só cobertura de checkout, resolvível instalando o pixel lá.
- **Divergência por mecanismo** (5.1) → o Vestigio precisa detectar add-to-cart via AJAX, não só via form submit.
- **Divergência de direção** (A3 invertida, por exemplo) → problema conceitual sério, e é melhor descobrir agora.
