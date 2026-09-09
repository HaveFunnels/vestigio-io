# Integração do pixel no checkout — desenho agnóstico

**Data:** 2026-09-09 (rev. 2 — incorpora o parecer do NX4)
**Para:** time de instrumentação da Casa Montelle / NX4
**Princípio:** a Vestigio se adapta à loja, não o contrário. O trabalho de costurar o funil mora no nosso pixel. O que sobra para vocês é o mínimo irredutível — o que só quem tem o backend consegue fazer.

---

## 0. Correção e mudança de postura

A rev. 1 desta proposta pedia que vocês emitissem um `nx4_visitor_id`, alterassem o redirect do Comprar e chamassem uma API. Estava errada de postura — era um handshake sob medida, não um produto que se instala em qualquer loja. Reescrevemos o pixel para absorver essa complexidade.

E uma correção de fato, apontada por vocês: **o `data-order-id` não existe hoje** na página de pedido. A rev. 1 dizia que estava feito; não está. Isso muda o desenho da confirmação (seção 3).

---

## 1. O que o pixel passou a fazer sozinho (já no ar, commit `fd4f0443`)

Tudo abaixo é do nosso lado, funciona em qualquer loja com storefront + checkout em subdomínio irmão, e **não pede nada de vocês**:

**Costura cross-domínio.** O pixel agora escreve o próprio id de visitante num cookie no eTLD+1 (`.casamontelle.com`, achado por sondagem de cookie, sem lista de sufixos públicos), espelha em localStorage, e — porque 81% do tráfego de vocês é webview onde cookie cai entre navegações — **carrega o id e a sessão na URL** de qualquer link que aponte para um subdomínio irmão. Na chegada, adota na precedência **URL → cookie → localStorage → novo**. Exatamente a ordem que vocês descreveram, feita pelo pixel.

**Um funil, uma sessão.** A sessão (timeout de 30 min) atravessa o hop storefront→checkout via URL, então as duas páginas compartilham a mesma sessão — não dois funis colados. O **visitante** (365 dias) é separado da **sessão**, como vocês frisaram: comprador que volta semana que vem é sessão nova, mesmo visitante.

**First-touch preservado.** Uma chegada costurada não sobrescreve a atribuição: o referrer ali é a própria loja, não uma aquisição. A origem real (tiktok, meta) já viajou na sessão compartilhada.

**Decoração automática de links.** Feita no clique, sobre `<a href>`. Cobre o caso comum (o botão é um link) com **zero código de vocês**.

---

## 2. O único caso em que vocês encostam uma linha

Vocês disseram que o Comprar redireciona via JS (`inject.js` intercepta o clique e faz `location.href`), não por `<a href>`. Isso o pixel **não** consegue interceptar — o setter de `location.href` é nativo e não-configurável.

Para esse caso, e só ele, expusemos uma função:

```js
// no inject.js, onde vocês montam a URL do redirect do Comprar:
location.href = window.vestigio.decorate(targetUrl);
```

`decorate()` devolve a URL com os parâmetros de costura anexados, e é no-op se o destino não for subdomínio irmão. É a única linha de integração que a Montelle precisa — e existe porque o checkout de vocês é JS, não porque o desenho exige.

O parecer de vocês sugeriu embutir o `nx4_vid` no redirect. Não precisa: `decorate()` já lê o nosso id (que por sua vez adota o de vocês se ele existir no cookie/URL). Uma fonte de verdade, a de vocês quando presente.

---

## 3. Confirmação de compra — o ponto do PIX, que vocês têm razão

Vocês apontaram o erro central: `/order/<id>` **não é venda**, é a página de espera do PIX, e 35% nunca viram pago. Nós corrigimos o pixel para **nunca inferir venda**:

- `/order/`, `/checkout` e afins classificam no máximo como "pagamento em andamento", nunca como concluído.
- A mera existência de `[data-order-id]` **não conta mais** como venda (era o nosso bug — inflava conversão em ~metade).
- Uma venda só é registrada com sinal **explícito de pago**.

Como o PIX vira pago sem reload, o caminho robusto é uma chamada quando o status muda — o que vocês mesmos propuseram e é mais confiável que observar DOM:

```js
// quando o polling do PIX confirma pagamento:
window.vestigio.confirm({ order_id: id, value: total });
```

Alternativa passiva, se preferirem não chamar a API: o pixel também aceita um marcador `[data-order-status="paid"]` no DOM (observado por mudança de atributo). Qualquer um dos dois; a chamada é mais robusta. O `data-order-id` sozinho, deliberadamente, não basta.

---

## 4. Instalação no checkout — concordamos que não é "uma linha"

Vocês têm razão: no lado de vocês, é um provider `vestigio` no registro de pixels, por checkout, com o env id — como Meta e TikTok. Isso é arquitetura da plataforma de vocês, não imposição nossa; do nosso lado o requisito é só o snippet carregado com o mesmo `data-env` do storefront. O ingest já aceita o subdomínio, então nada muda no nosso backend.

Sobre canonical vs URL real: vocês declaram `rel="canonical"` do checkout e da página de pedido apontando para `casamontelle.com` (deliberado, para indexação e link-preview). Na v2.4 isso colapsaria o campo `url` de todo evento do checkout para a home do storefront, e o agregador atribuiria o comportamento inteiro do checkout à superfície home — contaminando a leitura. **Corrigido na v2.5, do nosso lado e de forma geral:** o `canonicalUrl()` passou a ignorar canonical cross-host (hostname diferente do da página) e usar a URL real do checkout, sem parâmetros de tracking. Canonical apontando para outro host é justamente o sinal de que a página não quer ser tratada como aquele destino — vale para qualquer checkout em subdomínio, não só o de vocês. **Não precisa de ajuste de vocês.**

---

## 5. Limites que assumimos, para não prometer o que não entrega

- **Safari/ITP:** cookie escrito por JS expira em 7 dias. Irrelevante para costurar a sessão (minutos); não conte com ele para reconhecer retorno de 8+ dias. O carry por URL cobre a costura independente disso. O `nx4_utm` tem a mesma limitação.
- **Visitante ≠ sessão:** já tratado no pixel (seção 1), exatamente como vocês pediram.

---

## 6. SRI — decisão que é de vocês, e concordamos com a exigência

Isso coloca um script de terceiros na página de pagamento. Vocês listaram SRI como pendência nossa e estão certos: condicionem a ativação na Montelle a publicarmos o snippet com hash de integridade. É item da nossa fila e faremos antes de qualquer ativação no checkout. Enquanto isso não sair, a costura funciona só no storefront, que já é ganho.

---

## 7. Resumo do que sobra para cada lado

**Vestigio (nós):** costura cross-domínio ✔ (no ar), nunca-inferir-venda ✔ (no ar), padrões de path por ambiente (a fazer), preferir URL real no checkout (a fazer), SRI no snippet (a fazer, gate para ativação).

**Casa Montelle / NX4:**
1. Carregar o snippet no checkout com o `data-env` da loja (provider no registro de pixels).
2. UMA das duas: `window.vestigio.confirm({order_id})` quando o PIX confirma, **ou** `data-order-status="paid"` no DOM.
3. Se o Comprar redireciona por JS: `location.href = window.vestigio.decorate(url)` — uma linha.

Três itens, todos coisas que só quem tem o backend do checkout consegue fazer. Nenhum cookie novo, nenhum handshake sob medida. É o mínimo irredutível.


---

## 8. Rev. 3 — respostas ao review do NX4

Os três pontos bloqueantes e os dois menores do parecer estão certos. Estado:

**1. Dedupe por pedido (não por sessão).** Corrigido no pixel (`1d928b92`): `window.vestigio.confirm` deduplica por `order_id` em localStorage, não só por sessão — reabertura da página de pedido pago dias depois não conta de novo. **Mas vocês têm razão que localStorage cai em webview**, então o dedupe durável é do lado de vocês: **o ingest do NX4 deve deduplicar por `order_id`** antes de contar. É o guard que sobrevive ao webview.

**2. `vg_sid` adotado sem verificação.** Corrigido (`1d928b92`): a sessão carregada só é adotada se o link foi seguido dentro de **30 min** (TTL no parâmetro `vg_t`) E, quando há cookie, se o `vg_vid` da URL bate com o do dispositivo. Um link de checkout compartilhado horas depois abre sessão nova (mesmo visitante se o cookie estiver presente), não entra na sessão de quem enviou. Cobre os dois cenários que vocês levantaram.

**3. SRI exige URL versionada — de acordo, e é a condição do gate.** O snippet agora carrega versão (v2.5) e a instalação no checkout deve fixar `/snippet/v2.5/vestigio.js`, imutável, com o hash SRI. O `/snippet/vestigio.js` (latest) fica só no storefront, que não é superfície de pagamento. Política: a versão sobe a cada mudança relevante para o checkout, e o hash é reemitido junto. **A infra de servir o caminho versionado imutável é o trabalho que fecha o gate — está do nosso lado, e é o pré-requisito para ativar no checkout.**

**Detalhe (value):** documentado como **BRL decimal** (ex.: `129.90`) na API `confirm`.

**Detalhe (inferência de venda no servidor):** vocês apontaram que nosso agregador ainda marca `reached_thank_you` por regex de path ("obrigado"/"confirmacao"). Para a Montelle não afeta (os paths de vocês não casam), mas o texto da rev. 2 foi absoluto demais. A precisão: o **snippet** nunca infere venda da mera existência de um elemento nem de uma página de PIX pendente. No **servidor**, uma página de sucesso explícita ("/obrigado") é um **proxy** de conversão para lojas que não chamam a API; o `confirm` explícito é **prova** e prevalece sobre o proxy quando presente. Fluxos de PIX (onde a página de pedido precede o pagamento) precisam do `confirm` — o proxy sozinho superestimaria.

## 9. A decisão do gate — recomendação

Concordamos com vocês: **ativar na Montelle só depois do SRI com URL versionada.** A costura no storefront já está no ar sem nada de vocês, coletando o funil site-inteiro. A página de pagamento é o lugar errado para um script que ainda muda várias vezes por dia sem hash imutável. O caminho:

1. Storefront: já ativo, sem ação de vocês.
2. Nós: publicar `/snippet/v2.5/vestigio.js` imutável + hash SRI.
3. Vocês: provider `vestigio` no checkout apontando para a URL versionada + SRI; o `confirm` no pago; a linha do `decorate` se o Comprar for JS.

Assim o checkout entra com o script pinado e verificado, e o storefront já vai coletando enquanto isso.
