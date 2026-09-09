# Proposta de integração — pixel Vestigio no checkout NX4

**Data:** 2026-09-09
**Para:** time de instrumentação da Casa Montelle / NX4
**Objetivo:** fechar o ponto cego que o próprio parecer de vocês identificou (item 5), medindo o funil **inteiro** — storefront + checkout + confirmação — como **uma sessão só**, não dois funis colados.

---

## 1. O que muda com isso

Hoje o pixel da Vestigio vê o site inteiro e para no add-to-cart; a instrumentação de vocês vê produto e checkout. Nenhum dos dois vê a jornada completa de uma pessoa. Com o pixel também no `seguro.casamontelle.com` **e** com uma identidade de sessão compartilhada, a Vestigio passa a medir:

- origem → comportamento no storefront → chegada no checkout → pagamento → confirmação, **por visitante**;
- conversão real por origem (hoje a Vestigio estima; passaria a medir), o que reconcilia a divergência que vocês apontaram (nosso "direto 17x" vs. o Meta 27,5% / direto 24,9% de vocês);
- abandono **dentro** do checkout, que é onde as alavancas reais de vocês vivem (PIX não pago, 44% que não tocam o formulário).

O `data-order-id` que vocês já adicionaram na página de pedido é metade do trabalho e já está feito. O que falta são três peças, uma de cada lado e uma compartilhada.

---

## 2. O bloqueador central: identidade de sessão atravessa domínio?

**Hoje, não.** O pixel guarda o id da sessão em `sessionStorage` (`public/snippet/vestigio.js`), que é **por origem**. Uma pessoa que sai de `casamontelle.com` e entra em `seguro.casamontelle.com` recebe uma sessão nova — dois funis desconexos, exatamente o que **não** queremos.

Os dois domínios compartilham o eTLD+1 (`casamontelle.com`), e vocês já provaram que dá para atravessar: o cookie `nx4_utm` passa. A correção é fazer o mesmo com a identidade de visitante.

**Duas formas, e preferimos a de vocês:**

**Opção A (recomendada) — cookie compartilhado do NX4.** Vocês já ofereceram emitir um `nx4_visitor_id` como cookie eTLD+1 (`Domain=.casamontelle.com`), do jeito que o `nx4_utm` já funciona. Se ele existir **desde o storefront**, o pixel da Vestigio o lê como chave de sessão nos dois domínios e a costura é automática. É a opção mais limpa: uma fonte de verdade de identidade, controlada por vocês, e a Vestigio só consome.

**Opção B (fallback, só nosso) — mudar nosso storage para cookie eTLD+1.** Se por algum motivo o `nx4_visitor_id` não sair no storefront, mudamos o pixel para gravar `vg_sid` num cookie `Domain=.casamontelle.com` em vez de `sessionStorage`. Resolve, mas duplica identidade (a nossa e a de vocês) sem necessidade.

Precisamos saber de vocês: **o `nx4_visitor_id` pode ser emitido já na primeira página do storefront, com `Domain=.casamontelle.com`?** Se sim, seguimos com a Opção A e não mudamos nada no nosso storage.

---

## 3. As três peças

| # | peça | dono | estado |
|---|---|---|---|
| 1 | identidade de sessão no eTLD+1 (`nx4_visitor_id` no storefront, ou cookie nosso) | NX4 (Opção A) ou Vestigio (Opção B) | **decisão pendente** — ver seção 2 |
| 2 | padrões de marco configuráveis por ambiente (`/c/<slug>` = conversão, `/order/<id>` = confirmação) | Vestigio | a fazer, é config por env |
| 3 | snippet no layout do checkout NX4, mesmo `data-env` | NX4 | uma linha, condicionada à loja |

**Sobre a peça 2:** hoje o pixel classifica o marco de conversão por regex de path fixo (`/checkout`, `/pagamento`). Os de vocês são `/c/<slug>` e `/order/<id>`, que não casam. Vamos tornar esses padrões configuráveis por ambiente — a Montelle recebe um conjunto que reconhece os paths do NX4. É trabalho nosso e não depende de vocês.

**Sobre a peça 3:** o ingest da Vestigio já aceita subdomínios do domínio registrado, então `seguro.casamontelle.com` entrega eventos sem nenhuma mudança de backend nosso. Basta o snippet carregar no checkout com o mesmo `data-env` do storefront.

**Confirmação de compra:** já resolvida. O pixel detecta `[data-order-id]` no DOM da página de pedido (`checkConfirmation` no snippet) e vocês já colocaram o atributo. Assim que as peças 1–3 estiverem no ar, o `confirmation_seen` dispara e o funil fecha na venda.

---

## 4. Privacidade e escopo

- A identidade de sessão é anônima (id opaco), sem PII, como hoje. O `nx4_visitor_id`, se usado, precisa ser igualmente opaco — não pode carregar e-mail, CPF ou id de pedido.
- O IP continua hasheado com sal diário no ingest, no checkout como no storefront.
- Nenhum dado de pagamento é lido. O pixel observa navegação, tempo, foco de formulário (contagem e tipo de campo, nunca valores) e o marco de confirmação — não o conteúdo do cartão nem do PIX.

---

## 5. O que pedimos de vocês, em uma frase

Confirmar se o `nx4_visitor_id` pode sair como cookie `Domain=.casamontelle.com` **desde o storefront** (Opção A). Com esse "sim", a integração é: vocês carregam o snippet no checkout com o `data-env` da loja; nós configuramos os padrões de path do NX4 e lemos o cookie de vocês como chave de sessão. O `data-order-id` já feito fecha a compra.

Se preferirem não emitir o cookie no storefront, seguimos com a Opção B (cookie nosso no eTLD+1) — mais trabalho do nosso lado, mesmo resultado.
