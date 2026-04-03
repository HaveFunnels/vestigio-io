# Vestigio.io - Documento Descritivo do Frontend

> Inventario completo de todas as telas, elementos visuais, navegacao, jornadas de usuario e identidade visual da aplicacao Vestigio.io.

---

## Sumario

1. [Identidade Visual e Design System](#1-identidade-visual-e-design-system)
2. [Estrutura de Navegacao](#2-estrutura-de-navegacao)
3. [Telas Publicas (Marketing / Landing Page)](#3-telas-publicas-marketing--landing-page)
4. [Telas de Autenticacao](#4-telas-de-autenticacao)
5. [Console - Telas do Produto (Usuario Autenticado)](#5-console---telas-do-produto-usuario-autenticado)
6. [Painel do Usuario (Control Plane)](#6-painel-do-usuario-control-plane)
7. [Painel Administrativo (Admin)](#7-painel-administrativo-admin)
8. [Jornada do Usuario](#8-jornada-do-usuario)
9. [Mapa de Rotas Completo](#9-mapa-de-rotas-completo)

---

## 1. Identidade Visual e Design System

### 1.1 Feeling Geral

A UI da Vestigio transmite uma sensacao de **ferramenta profissional de inteligencia analitica**. O console do produto utiliza um tema **escuro predominante** (fundo quase preto, zinc-950) com acentos em **verde esmeralda** (emerald-400/500/600) que trazem a sensacao de um terminal de monitoramento sofisticado. As cores semanticas (vermelho para critico, ambar para alerta, azul para informativo) sao usadas com parcimonia, transmitindo confianca e precisao. O site marketing, por outro lado, usa fundo claro com acentos em **roxo** (#635BFF), trazendo uma identidade mais amigavel e moderna para a landing page.

A impressao geral e de um **produto data-driven, serio e tecnico**, mas com uma camada de acessibilidade na landing page que convida usuarios nao-tecnicos.

### 1.2 Paleta de Cores

#### Cores Primarias
| Token | Valor | Uso |
|---|---|---|
| Primary | `#635BFF` | CTAs da landing page, links, botoes primarios do site |
| Primary Dark | `#3E22E9` | Hover e variantes escuras do primary |
| Emerald-400 | `#34d399` | Sidebar ativo, badges de sucesso, botoes do console |
| Emerald-500 | `#10b981` | Progress bars, indicadores de progresso |
| Emerald-600 | `#059669` | Botoes primarios do console (Send, Next, Activate) |

#### Fundos
| Contexto | Light Mode | Dark Mode |
|---|---|---|
| Body (site) | `#FFFFFF` | `#151F34` |
| Console/App | — | `bg-zinc-950` (#09090b) |
| Cards (site) | `#FFFFFF` | `#272E40` (gray-dark) |
| Cards (console) | — | `bg-zinc-900/50` (semi-transparente) |
| Inputs (console) | — | `bg-zinc-900` |

#### Bordas
| Contexto | Cor |
|---|---|
| Site (light) | `#E8E8E8` (stroke) |
| Site (dark) | `#394152` (stroke-dark) |
| Console | `border-zinc-800` (primaria), `border-zinc-700` (secundaria/interativa) |

#### Cores Semanticas
| Token | Valor | Uso |
|---|---|---|
| Red/Danger | `#F23030` / `red-400` | Severity Critical, erros, impact alto |
| Amber/Warning | `amber-400` | Severity Medium, alertas, contradicoes |
| Green/Success | `#00BC55` / `emerald-400` | Status ativo, sinais positivos |
| Blue/Info | `blue-400` | Badges informativos, nodes de categoria |

#### Texto
| Contexto | Cor |
|---|---|
| Titulo principal (console) | `text-zinc-100` |
| Texto secundario (console) | `text-zinc-200` |
| Texto muted (console) | `text-zinc-400` / `text-zinc-500` |
| Labels minusculos (console) | `text-zinc-500` / `text-zinc-600` |
| Texto principal (site light) | `#0E172B` (black) |
| Texto body (site) | `#64748B` |

### 1.3 Tipografia

- **Fonte primaria**: Satoshi (custom, weights 300-900, com italico)
- **Fonte secundaria**: Inter (Google Font)
- **Monospace**: `font-mono` do sistema (usado em dados tecnicos, impactos financeiros, porcentagens)
- **Letter-spacing**: Tracking negativo em titulos (`-0.16px` no body, ate `-1.6px` em headings)
- **Escala de headings customizada**:
  - heading-1: 60px / 72px
  - heading-2: 48px / 58px
  - heading-3: 40px / 48px
  - heading-4: 35px / 45px
  - heading-5: 28px / 40px
  - heading-6: 24px / 30px

### 1.4 Bordas e Raios

- **Border radius padrao (site)**: `rounded-lg` (8px), `rounded-[15px]` em imagens de blog
- **Border radius padrao (console)**: `rounded-md` (6px) para badges e inputs, `rounded-lg` (8px) para containers
- **Sombras (site)**: `shadow-1` (sutil), `shadow-features` (hover em cards), `shadow-testimonial` (testimonials)
- **Sombras (console)**: Nao usa sombras — usa bordas e backgrounds semi-transparentes para hierarquia

### 1.5 Dark Mode e Design Tokens

- Implementado via classe CSS (`darkMode: "class"`) + **CSS variables** em `src/styles/globals.css`
- Provider: `next-themes` em todos os layouts (site, console e app)
- Console/app: default **dark**, pode ser trocado para light
- Site marketing: default **light**
- **CSS variables** definidas em `:root` (light) e `.dark` (dark) usando formato RGB channels
- **Tailwind tokens semanticos**: `bg-surface`, `text-content`, `border-edge`, `bg-accent-cta`, etc.
- Cores semanticas de status (red, amber, blue para severity) permanecem hardcoded — nao sao tema

### 1.6 Tokens Semanticos (Design System)

| Token Tailwind | Light | Dark | Uso |
|---|---|---|---|
| `bg-surface` | branco | zinc-950 | Fundo da pagina |
| `bg-surface-card` | branco | zinc-900 | Fundo de cards |
| `bg-surface-input` | branco | zinc-900 | Fundo de inputs |
| `border-edge` | zinc-200 | zinc-800 | Bordas primarias |
| `border-edge-subtle` | zinc-300 | zinc-700 | Bordas interativas |
| `text-content` | zinc-950 | zinc-100 | Texto principal |
| `text-content-secondary` | zinc-900 | zinc-200 | Texto secundario |
| `text-content-muted` | zinc-600 | zinc-400 | Texto muted |
| `text-content-faint` | zinc-400 | zinc-500 | Texto sutil |
| `bg-accent-cta` | emerald-600 | emerald-600 | Botoes primarios |
| `text-accent-text` | emerald-700 | emerald-400 | Texto de acento |
| `bg-sidebar-active-bg` | emerald-600 | emerald-500 | Item ativo da sidebar |

### 1.7 Componentes com Sparklines

O componente `SummaryCards` agora suporta mini-graficos via prop `sparkData: number[]`, renderizados com ApexCharts (sparkline mode, area chart, 40px de altura, cor baseada no variant).

---

## 2. Estrutura de Navegacao

### 2.1 Visao Geral dos Layouts

A aplicacao possui **2 layouts principais** usados pelo usuario, mais 2 auxiliares:

```
┌─────────────────────────────────────────────────────┐
│ (site) Layout — Header fixo + Footer                │  LAYOUT PRINCIPAL 1
│   ├── Paginas publicas (landing, blog, auth)        │  (marketing, auth)
│   ├── /user/* — Dashboard usuario (legado)          │
│   └── /admin/* — Dashboard admin (legado)           │
├─────────────────────────────────────────────────────┤
│ /app Layout — AppSidebar + Top bar (dark default)    │  LAYOUT PRINCIPAL 2
│   ├── Paginas do produto (analysis, chat, maps...)  │  (produto autenticado)
│   ├── Control plane (billing, members, org)         │
│   └── /app/admin/* — Admin platform                 │
├ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─┤
│ (console) Layout — LEGADO, redirecionado para /app  │  (middleware redireciona)
│ (studio) Layout — Sanity CMS (admin de conteudo)    │  (uso interno)
└─────────────────────────────────────────────────────┘
```

**Nota**: O route group `(console)` existe no codigo mas o middleware redireciona todas as suas rotas para `/app/*`. As paginas em `/app/` fazem re-export das paginas do `(console)`, reutilizando o codigo. O layout `(console)` e o `/app` sao visualmente identicos (dark-only, sidebar + top bar), diferindo apenas na sidebar (o `/app` tem secoes extras: Control Plane e Platform Admin).

### 2.2 Header do Site Marketing

**Arquivo**: `src/components/Header/index.tsx`

**Aparencia visual**: Barra fixa no topo, inicialmente transparente, que ganha fundo branco e sombra ao fazer scroll. Em dark mode, fundo escuro.

**Elementos dispostos (da esquerda para direita)**:
- Logo Vestigio (link para home)
- Menu de navegacao horizontal (visivel em `xl+`): Features, Pricing, Blog, Pages (com submenus)
- Theme toggler (sol/lua com animacao deslizante)
- Language switcher (seletor de idioma)
- Botao de busca global (abre modal)
- Se nao autenticado: botoes "Sign In" e "Sign Up" (botao primario roxo)
- Se autenticado: menu dropdown de conta (Account Settings, Dashboard, Log Out)

**Responsivo**: Em mobile, o menu e substituido por um hamburger que abre o menu em coluna.

### 2.3 AppSidebar (Console do Produto)

**Arquivos**: `src/components/app/AppSidebar.tsx`, `src/components/app/AppSidebarLayout.tsx`, `src/components/app/sidebar-nav-data.ts`

**Comportamento**:
- **Desktop (md+)**: Colapsada por padrao (56px, so icones). Expande ao hover (~224px) com transicao suave. Labels e titulos de secao aparecem/desaparecem com opacity transition.
- **Mobile (<md)**: Overlay lateral com backdrop escuro, aberta via botao hamburger no header. Sempre expandida. Fecha ao clicar no backdrop ou ao navegar.

**Aparencia visual**: Fundo `bg-sidebar-bg` (levemente diferente do conteudo) com borda direita `border-edge`.

**Elementos dispostos (de cima para baixo)**:

1. **Logo** "VESTIGIO" em `text-accent-text`, oculto quando colapsado (opacity transition)
2. **Secao "Product"** (label uppercase, 10px):
   - **Actions** (icone de raio, `/app/actions`) — **primeiro item, default landing**
   - **Workspaces** (icone de grid, `/app/workspaces`)
   - **Chat** (icone de balao de mensagem, `/app/chat`)
   - **Analysis** (icone de lupa) — **expansivel**, com chevron rotativo:
     - Findings (icone de documento, `/app/analysis`)
     - Inventory (icone de camadas, `/app/inventory`)
   - **Maps** (icone de mapa, `/app/maps`)
3. **Secao "Control Plane"**:
   - Organization, Billing, Members, Settings, Data Sources
4. **Secao "Platform Admin"** (somente se `isAdmin === true`):
   - Overview, Organizations, Users, Environments
   - Usage & Billing, Pricing, System Health, Error Tracking, Platform Config

**Estados dos itens**:
- Inativo: `text-content-muted`, hover: `bg-surface-card-hover text-content-secondary`
- Ativo: `bg-sidebar-active-bg text-sidebar-active-text` (pill solido emerald)
- Parent ativo: mesmo estilo se qualquer child estiver ativo
- Children ativos: `text-accent-text` (sem background)

**Submenu expansivel**:
- Animacao via `grid-template-rows` (0fr → 1fr)
- Auto-expande se rota filha ativa no carregamento
- Clicar no icone quando colapsado: expande sidebar + abre submenu

### 2.4 Top Bar do Console

Barra horizontal no topo (12px de altura), com `border-b border-zinc-800`:

- **Esquerda**: `OrgSelector` — dropdown mostrando nome da organizacao atual e dominio, com ponto verde indicativo. Permite trocar entre organizacoes.
- **Direita**: `McpUsageIndicator` (uso de consultas MCP) + badge do plano atual (texto 10px, uppercase, zinc-500, borda zinc-700).

### 2.5 Sidebar do Dashboard (User/Admin no site)

**Arquivo**: `src/components/Common/Dashboard/Sidebar.tsx`

**Aparencia visual**: Sidebar branca (light mode) ou escura (dark mode), largura fixa 290px no desktop. Em mobile, aparece como overlay lateral com backdrop escuro, deslizando da esquerda com `translate-x`.

**Elementos**: Logo no topo, seguido de dois grupos de menu (Main Menu e Others) com icones SVG. Items ativos usam `bg-primary/10 text-primary`. Alguns itens exibem badge "Coming Soon".

---

## 3. Telas Publicas (Marketing / Landing Page)

### 3.1 Home Page

**Rota**: `/`
**Arquivo**: `src/app/(site)/page.tsx` → `src/components/Home/`

A home page e composta por secoes empilhadas verticalmente, cada uma como componente independente:

#### 3.1.1 Hero Section
**Arquivo**: `src/components/Home/Hero/index.tsx`

**Descricao visual**: Secao centralizada de impacto. Headline grande e bold (escalando de `text-heading-4` em mobile ate 58px em desktop) com palavra-chave destacada em cor primaria (`#573CFF`) e sublinhado decorativo via SVG. Abaixo, subtitulo em texto body. CTA "Sign In" como botao branco com texto escuro e icone de seta circular. Ao fundo, formas SVG decorativas (ocultas em mobile).

**Brand showcase**: Grid horizontal de logos de parceiros/clientes abaixo do CTA, com descricao e logos que mudam de cor no hover.

#### 3.1.2 Features Section
**Arquivo**: `src/components/Home/Features/index.tsx`

**Descricao visual**: Grid de cards em 3 colunas (1 em mobile, 2 em tablet, 3 em desktop) sobre fundo cinza claro (`bg-gray-1`). Cada card e branco com `rounded-[15px]`, sombra sutil (`shadow-1`) que aumenta no hover (`shadow-features`). Dentro do card: icone SVG, titulo bold e descricao em texto body. Header da secao com titulo e subtitulo centralizados.

#### 3.1.3 Features with Image Section
**Arquivo**: `src/components/Home/FeaturesWithImage/index.tsx`

**Descricao visual**: Blocos alternados — conteudo a esquerda com imagem a direita, depois invertido. Cada bloco tem titulo, subtitulo e lista de features com checkmarks roxos (`#573CFF`). Imagens ilustrativas ao lado (max-width 484px). Em mobile, empilha verticalmente.

#### 3.1.4 Counter Section
**Arquivo**: `src/components/Home/Counter/index.tsx`

**Descricao visual**: Tres estatisticas exibidas horizontalmente com divisores verticais (ou horizontais em mobile). Numeros grandes em cor primaria com animacao CountUp. Exemplos: "20+ Integrations", "100+ UI Components", "12000+ USD Saved". Divisor gradiente no topo.

#### 3.1.5 Testimonials Section
**Arquivo**: `src/components/Home/Testimonials/index.tsx`

**Descricao visual**: Layout masonry CSS em 3 colunas (1 em mobile, 2 em sm, 3 em lg) sobre fundo cinza. Cards brancos arredondados (`rounded-2xl`) com sombra (`shadow-testimonial`) que aumenta no hover. Cada card mostra avatar circular, nome, cargo e citacao separados por divisor horizontal.

#### 3.1.6 Pricing Section
**Arquivo**: `src/components/Home/Pricing/index.tsx`

**Descricao visual**: Delega renderizacao para componente de billing (Stripe/Paddle/LemonSqueezy). Exibe 3 planos: Basico ($99/mo), Pro ($199/mo, destacado como ativo), e Empresarial ($399/mo). Cada card mostra nome, preco, publico-alvo, descricao e lista de features incluidas com botao CTA.

#### 3.1.7 FAQ Section
**Arquivo**: `src/components/Home/FAQ/index.tsx`

**Descricao visual**: Accordion centralizado (max-width 662px) sobre fundo cinza. Items brancos arredondados com sombra. Clique no botao expande/colapsa a resposta com animacao suave (`grid-template-rows`). Icone chevron rotaciona 180 graus ao expandir. Primeiro item aberto por padrao.

#### 3.1.8 Newsletter Section
**Arquivo**: `src/components/Home/Newsletter/index.tsx`

**Descricao visual**: Fundo gradiente horizontal (rosa-roxo para azul: `#F7E8F3` → `#E0E0FC`). Titulo grande centralizado, subtitulo e formulario de email. Input branco com sombra e botao primario roxo que se posiciona absolutamente a direita do input em telas maiores. Integra com Mailchimp.

#### 3.1.9 Call to Action Section
**Arquivo**: `src/components/Home/CallToAction/index.tsx`

**Descricao visual**: Fundo inteiro em cor primaria roxo (`#635BFF`). Texto branco grande centralizado com subtitulo em cinza claro. Botao CTA branco com hover de opacidade. Formas SVG decorativas ao fundo.

#### 3.1.10 Blog Section
**Arquivo**: `src/components/Home/Blog/index.tsx`

**Descricao visual**: Grid de cards de blog posts. Cada card mostra imagem, titulo, data e preview do conteudo.

### 3.2 Footer

**Arquivo**: `src/components/Footer/index.tsx`

**Descricao visual**: Fundo preto (`bg-black`). Layout multi-coluna com logo e links sociais (X/Twitter, Dev.to, GitHub) a esquerda, e tres colunas de links (Product, Resources, Company) a direita. Texto cinza (`text-gray-5`) que transiciona para branco no hover. Formas SVG decorativas ao fundo (ocultas em mobile).

### 3.3 Blog

**Rotas**: `/blog`, `/blog/[slug]`, `/blog/author/[slug]`

- **Lista**: Grid de cards de posts puxados do Sanity CMS
- **Post individual**: Conteudo rich text com tipografia customizada (headings em Satoshi bold, imagens com `rounded-[15px]`, blockquotes com borda esquerda primaria de 3px)
- **Por autor**: Posts filtrados por slug do autor

### 3.4 Support

**Rota**: `/support`
**Descricao**: Pagina de suporte com informacoes de contato e ajuda.

### 3.5 Thank You

**Rota**: `/thank-you`
**Descricao**: Pagina de confirmacao pos-cadastro com animacao de sucesso e links para Account e Login.

### 3.6 Error (404)

**Rota**: `/error`
**Descricao**: Pagina de erro 404 com componente `<NotFound />`.

---

## 4. Telas de Autenticacao

### 4.1 Sign In

**Rota**: `/auth/signin`
**Arquivo**: `src/components/Auth/Signin/index.tsx`

**Descricao visual**: Container centralizado (max-width 400px) com padding.

**Elementos dispostos (de cima para baixo)**:
1. **Botoes de login social**: Google e GitHub, full-width, empilhados
2. **Divisor**: Linha horizontal com texto "OR" centralizado
3. **Toggle de metodo**: Dois botoes em estilo tab (38px de altura, rounded):
   - "Magic Link" | "Password"
   - Tab ativo: fundo primario claro com texto primario
   - Tab inativo: texto escuro, fundo transparente
4. **Formulario condicional**:
   - Magic Link: apenas campo de email
   - Password: campos email + senha (com toggle de visibilidade via icone de olho)
5. **Botao de submit**: Fundo escuro (`bg-dark`), texto branco, full-width
6. **Link para signup**: "Don't have an account? Sign up →" com link em cor primaria
7. **Divisor horizontal**
8. **Demo sign-in**: Opcao de login de demonstracao

### 4.2 Sign Up

**Rota**: `/auth/signup`
**Arquivo**: `src/components/Auth/Signup/index.tsx`

**Descricao visual**: Identico ao Sign In em layout. Mesmos botoes sociais, divisor "OR", toggle tabs ("Magic Link" | "Email"). Formulario de cadastro com email e confirmacao de senha. Link inferior: "Already have an account? Sign in →".

### 4.3 Forgot Password

**Rota**: `/auth/forgot-password`
**Arquivo**: `src/components/Auth/ForgotPassword/`

**Descricao visual**: Formulario simples centralizado com campo de email e botao de envio para solicitar reset de senha.

### 4.4 Reset Password

**Rota**: `/auth/reset-password/[token]`
**Arquivo**: `src/components/Auth/ResetPassword/`

**Descricao visual**: Formulario com campos de nova senha e confirmacao. Recebe token dinamico da URL para validacao.

### 4.5 Invite (Signup por Convite)

**Rota**: `/auth/invite`
**Arquivo**: `src/components/Auth/InvitedSignin/`

**Descricao visual**: Formulario de cadastro para usuarios convidados, com Suspense fallback durante carregamento.

---

## 5. Console - Telas do Produto (Usuario Autenticado)

> Todas as telas do console compartilham o layout escuro (zinc-950), sidebar colapsavel a esquerda, e top bar com OrgSelector + McpUsageIndicator. O conteudo principal fica em `flex-1 overflow-y-auto`.

### 5.1 Onboarding (Wizard Multi-step)

**Rota**: `/app/onboarding` (alias de `/onboard`)
**Arquivo**: `src/app/(console)/onboard/page.tsx`

**Descricao visual**: Wizard centralizado (max-width `lg`, container) com indicador de progresso no topo.

**Indicador de progresso**: Label "Step X/Y" em zinc-500, seguido de barra segmentada onde steps completos sao `bg-emerald-500` e futuros sao `bg-zinc-800`.

**Steps**:

1. **Nome da organizacao**: Heading "Name your organization", campo de texto com borda zinc-700, foco emerald.
2. **Dominio**: Heading "What domain do you want to audit?", input tipo URL.
3. **Contexto de negocio**:
   - Grid 2x2 de botoes de tipo de negocio (Ecommerce, Lead Gen, SaaS, Hybrid)
     - Selecionado: `border-emerald-600, bg-emerald-500/10, text-zinc-100`
     - Nao selecionado: `border-zinc-700, text-zinc-400`
   - Campos opcionais: Monthly Revenue, Average Order Value
   - Dropdown: Conversion Model (checkout/whatsapp/form/external)
4. **[Somente SaaS] Acesso autenticado**: Container arredondado (`border-zinc-700, bg-zinc-900/50`):
   - App login URL, email de teste
   - Grid 2 colunas: Auth method dropdown, MFA dropdown
   - Nota em texto 12px zinc-500
5. **Review**: Grid de cards de revisao (label em zinc-500, valor em zinc-200) com borda zinc-800
6. **Escolha de plano**: Cards de plano empilhados verticalmente:
   - Selecionado: `border-emerald-600, bg-emerald-500/5`
   - Destaque "Recommended" em badge emerald
   - Preco bold, lista de features com "+" emerald
   - Botao "Activate [Plan] — [Price]/mo" em emerald-600

**Navegacao inferior**: Botoes "Previous" (zinc-700), "Skip" (texto zinc-400, step SaaS), "Next" (emerald-600).

### 5.2 Analysis

**Rota**: `/app/analysis`
**Arquivo**: `src/app/(console)/analysis/page.tsx`

**Descricao visual**: Tela principal de findings com impacto financeiro quantificado.

**Elementos dispostos (de cima para baixo)**:

1. **Header**: Titulo "Analysis" + subtitulo descrevendo estado (idle/ongoing/complete)

2. **Timeline de Steps** (durante analise em andamento):
   - Container arredondado `bg-zinc-900/50` com `border-zinc-800`
   - Indicador de pulse animado em `emerald-500` ao lado do step atual
   - Historico de steps anteriores como pontos menores
   - Barra de progresso de cobertura: fundo `zinc-800`, preenchimento `emerald-600` com animacao smooth

3. **Alerta de Challenge** (se detectado WAF/CF): Box ambar (`border-amber-900/50, bg-amber-500/5`) com icone de alerta

4. **Summary Cards** (4 cards em grid responsivo):
   - "Findings" (contagem)
   - "Est. Monthly Impact" (valor monetario, cor por severidade: vermelho >$20k, ambar >$5k, verde caso contrario)
   - "High Impact Issues" (contagem)
   - "Avg Confidence" (porcentagem)

5. **Controles de filtro** (flex-wrap, gap-3):
   - 3 selects dropdown (polarity, severity, pack) com bordas zinc-700
   - Checkbox "Hide positive signals" com acento emerald-500
   - Botao "Clear filters"
   - Botao "Analyze X Together" (emerald, aparece com 2+ selecionados)
   - Contador "X of Y findings"

6. **DataTable**: Tabela multi-coluna clicavel:
   - Coluna checkbox (selecao multipla)
   - Icone de polaridade (!, checkmark, bullet) com cores (red-400, emerald-400, zinc-500)
   - Titulo do finding + root cause como subtitulo
   - Badge de severidade (Critical/High/Medium/Low com cores)
   - Confidence % em monospace
   - Est. Impact com range badge
   - Tipo de impacto (Revenue Loss, Conversion Loss, etc.)
   - Pack label (Scale, Revenue, Chargeback, SaaS)
   - **VerificationBadge**: Maturity indicator (unverified/pending/partially/verified/degraded/stale) com cores e icones
   - **ChangeBadge**: Change class (regression/improvement/new/resolved/stable) com cores semanticas
   - Botao "Discuss" (borda zinc-700, hover emerald)

7. **SideDrawer** (abre ao clicar em linha):
   - Painel deslizante da direita, fundo zinc com backdrop preto
   - **Summary**: Texto da causa + badges (severity, confidence %, pack, surface, **verification maturity**, **change class**)
   - **Effect**: Texto descritivo em zinc-400
   - **Root Cause**: Container escuro (`border-zinc-800, bg-zinc-900/50`) em monospace
   - **Impact Breakdown**: 3 boxes com Monthly Range, Midpoint, Impact Type
   - **Reasoning**: Texto explicativo longo
   - **Evidence Contradictions**: Alerta ambar (se aplicavel) com contagem e delta de confianca
   - **VerificationPanel**: Stepped progress bar mostrando lifecycle de verificacao (unverified → pending → partially → verified), method label, freshness indicator, degradation warnings
   - **VerificationSufficiencyWarning**: Alerta quando finding de alto impacto nao tem verificacao suficiente
   - **Suppression transparency**: Se evidence foi suprimida, razao visivel
   - Botao "Discuss" full-width emerald

### 5.3 Chat

**Rota**: `/app/chat`
**Arquivo**: `src/app/(console)/chat/page.tsx`

**Descricao visual**: Interface conversacional estilo chat com respostas MCP.

**Elementos dispostos**:

1. **Banner de contexto** (se finding/batch selecionado):
   - Fundo `bg-zinc-900/50`, label emerald uppercase
   - Detalhe em zinc-300, link "Clear context" em zinc-500

2. **Banner de playbook ativo** (quando rodando):
   - Tema emerald (`border-emerald-800/30, bg-emerald-500/5`)
   - Loader animado giratório, label "Playbook running" + contador de steps

3. **Budget Bar**: Barra de progresso horizontal mostrando queries MCP restantes:
   - Verde: <70% usado
   - Ambar: 70-89%
   - Vermelho: 90%+
   - Mensagens contextuais e nudge de upgrade quando esgotado

4. **Container de mensagens** (area scrollavel):
   - **Mensagem do usuario**: Alinhada a direita, borda zinc-800, texto zinc-100
   - **Mensagem do sistema**: Alinhada a esquerda, borda zinc-800, fundo zinc-900/70

5. **Conteudo via ChatMessageRenderer** (ContentBlock system dentro da bolha do sistema):
   - **markdown**: Resposta formatada em texto zinc-200
   - **tool_call**: Spinner que vira checkmark, label descritivo ("Analyzing findings..."), duracao, resultado expansivel
   - **finding_card**: Card inline com severity bar, titulo, impact range, pack, root cause, click-to-navigate
   - **action_card**: Card inline com priority circle, titulo, cross-pack badge, savings estimate
   - **impact_summary**: Visualizacao de impacto financeiro
   - **confidence**: Badge de confianca (emerald >=70%, ambar 50-69%, red <50%)
   - **navigation_cta**: **Botoes de navegacao para outras surfaces** (Actions, Maps, Analysis, Workspaces) — o chat direciona o usuario para onde agir
   - **suggested_prompts**: Botoes horizontais de follow-up (borda zinc-700, hover emerald), **incluindo prompts sobre mudancas** ("What regressed?", "Show resolved issues")
   - **create_action**: Formulario ambar editavel para salvar como action
   - **quote**: Blockquote com borda esquerda e fonte
   - **data_rows**: Tabela key-value com severity badges

6. **Estado vazio** (sem mensagens):
   - "Ask Vestigio" centralizado com subtitulo
   - 4 botoes de perguntas pre-definidas (Scale, Revenue, Cause, Fix)
   - Botao "Open Playbooks" (emerald com icone de livro)

7. **Prompt Gate Card** (detectado prompt fraco/misfire):
   - Card de qualidade com nivel e razao
   - Box verde para texto sugerido de reescrita
   - Botoes: "Send Original", "Send Suggested", "Dismiss"

8. **Area de input** (fixada no rodape):
   - Borda superior zinc-800, fundo zinc-950
   - Botao de playbook (icone, borda zinc-700)
   - Input de texto (borda zinc-700, foco: borda/ring emerald)
   - Botao Send (bg-emerald-600, disabled: opacity-50)

9. **Drawer de Playbooks**: Painel lateral com playbooks disponiveis:
   - 6 templates (Find Revenue Leaks, Improve Conversion, etc.)
   - Labels de categoria, estimativa de queries, requisitos de plano

### 5.4 Actions (Default Landing Page)

**Rota**: `/app/actions` (alias de `/actions`) — **default landing page after login**
**Arquivo**: `src/app/(console)/actions/page.tsx`

**Descricao visual**: Operational queue categorizando incidents, opportunities e verifications. Superficie primaria de valor.

**Elementos dispostos**:

1. **Header**: "Actions" + subtitulo sobre priorizacao

2. **Category Tabs**: Barra de tabs no topo para filtrar por tipo:
   - All | Incidents | Opportunities | Verifications
   - Cada tab com contagem de itens e dot colorido por categoria

3. **Change Summary Banner** (quando change report disponivel):
   - Contagens de regressions, improvements, new issues, resolved items
   - Indicador de trend geral
   - Link para ChangeTimeline expandido

4. **Summary Cards** (4 cards):
   - "Total Actions" (contagem)
   - "Total Impact Addressable" (valor monetario, variante "danger" vermelho)
   - "Cross-Pack" (contagem, variante "info" azul)
   - "High Severity" (contagem, variante "warning" ambar)

5. **DataTable**:
   - **Priority (#)**: Monospace, zinc-400
   - **Action Title**: Bold zinc-200 + root cause em zinc-500
   - **Category badge**: Incident (red dot), Opportunity (emerald dot), Verification (blue dot), Observation (zinc dot) — com estilo `bg-[color]-500/10 text-[color]-400 border-[color]-500/20`
   - **Severity**: Badge colorido (Critical/High/Medium/Low)
   - **Est. Impact**: Range badge com valor min-max
   - **Confidence**: Porcentagem monospace
   - **Effort hint**: Trivial/Low/Medium/High/Very High com cor progressiva
   - **VerificationBadge**: Maturity indicator (unverified/pending/partially/verified/degraded/stale)
   - **ChangeBadge**: Change class (regression/improvement/new/resolved/stable)
   - **Scope**: "cross-pack" (emerald-400) ou "single" (zinc-500)

6. **SideDrawer** (ao clicar):
   - "What This Fixes" com descricao + badges (category, severity, verification maturity, change)
   - "Operational Status Timeline" — timeline visual de transicoes de status
   - **VerificationPanel**: stepped progress bar com method, freshness, degradation warnings
   - **VerificationSufficiencyWarning**: alerta se verificacao insuficiente para item de alto impacto
   - "Impact Unlocked" com Monthly Range e Midpoint
   - "Root Cause" em box escuro
   - Badge de scope
   - **Resolve path buttons**: "Request Verification" (emerald), "Mark Resolved" (com confirmacao), "Suppress" (com transparencia)
   - Botao "Discuss" para navegar ao Chat com contexto

### 5.5 Workspaces

**Rota**: `/app/workspaces` (list), `/app/workspaces/[id]` (detail)
**Arquivos**: `src/app/(console)/workspaces/page.tsx`, `src/app/(console)/workspaces/[id]/page.tsx`

**Descricao visual**: Persistent operational instruments agrupados por decision pack. Nao sao views — sao contextos versionados que rastreiam estado entre ciclos.

#### List View (`/app/workspaces`)

**Elementos dispostos**:

1. **Header**: "Workspaces" + subtitulo
2. **Grid de Workspace Cards** (1 coluna mobile, 3 em lg):
   - Cards clicaveis como links para `/workspaces/[id]`
   - Inativo: `border-zinc-800, bg-zinc-900/50`, hover: `border-zinc-700`
   - **Interior do card**:
     - Nome (text-base, bold, zinc-100) + badge de tipo colorido
     - **Trend arrow** (melhoria/regressao vs ciclo anterior)
     - Badge de severity a direita
     - Grid 2x2 de metricas: Monthly Loss (red-400), Issues (zinc-300), Confidence (zinc-300), Top Issue (zinc-400 truncado)
3. **Tipos de workspace**: Preflight (Scale Readiness), Revenue (Revenue Integrity), Chargeback (Chargeback Resilience)

#### Detail View (`/app/workspaces/[id]`)

**Elementos dispostos**:

1. **Header**: Nome do workspace + badge de tipo + trend arrow + botao "Back to Workspaces"
2. **Summary Cards** (4): Total Monthly Loss, Highest Impact, Issues Found, Confidence

3. **Preflight Checklist Mode** (somente para tipo `preflight` com readiness data):
   - **PreflightChecklist**: Lista de items com icones pass/fail/warning
   - Cada item: titulo, status, severity, referencia ao finding
   - **Overall readiness badge** no topo: READY / READY WITH RISKS / NOT READY / N/A
   - Items agrupados por blocker / risk / opportunity

4. **ChangeTimeline** (quando change report disponivel):
   - Timeline vertical de mudancas ordenadas por criticidade
   - Regressions primeiro, depois new issues, improvements, resolved
   - Cada item com ChangeBadge e titulo
   - Collapsible com maxItems default

5. **Trust Strength Panels**: Avaliacao de trust por categoria com indicadores de forca

6. **Verification Sufficiency Warnings** (VerificationSufficiencyWarning): Alerta quando findings de alto impacto nao tem verificacao suficiente

7. **DataTable de findings**:
   - Severity, impact, confidence, surface
   - **VerificationBadge** e **ChangeBadge** por linha
   - Evidence quality indicators

8. **SideDrawer**: Mesma estrutura do Analysis (Summary, Effect, Root Cause, Impact Breakdown, Reasoning, Evidence Contradictions, **VerificationPanel**, **VerificationSufficiencyWarning**)

### 5.6 Maps

**Rota**: `/app/maps`
**Arquivo**: `src/app/(console)/maps/page.tsx`

**Descricao visual**: Visualizacao causal interativa usando ReactFlow.

**Elementos dispostos**:

1. **Header** (com border-b zinc-800): "Maps" + subtitulo, px-6 py-4

2. **Seletor de mapas** (tabs):
   - Botoes para diferentes mapas (revenue_leakage, chargeback_risk, root_cause)
   - Ativo: `emerald-600/50 border, emerald-500/10 bg, emerald-400 text`
   - Inativo: `zinc-700 border, zinc-400 text`

3. **Canvas ReactFlow** (area principal):
   - Fundo escuro com grid Background (cor `#27272a`)
   - **Tipos de node**:
     - **Root Cause Node**: Borda 2px, rounded-lg, min-width 200px. Cor varia por severidade (critical=red, high=red claro, medium=amber, low=zinc). Label "ROOT CAUSE" uppercase, impacto em red monospace.
     - **Finding Node**: Borda 1px, rounded-md, min-width 180px. Label "Finding", impacto midpoint em amber monospace.
     - **Action Node**: Borda emerald-600/50, bg emerald-500/10. Label "Action" em emerald-400, impacto "unlocks" em emerald monospace.
     - **Category Node**: Borda blue-600/50, bg blue-500/10. Texto blue-400, bold.
   - **Tipos de edge**:
     - Causal: red-500, largura 2, animado
     - Contributes: zinc-500, tracejado, largura 1.5
     - Addresses: emerald-500, largura 2
     - Transition: blue-500, largura 1.5
   - Controles customizados (zinc-900 bg, zinc-700 borders)
   - MiniMap com nodes coloridos

4. **Legenda** (border-t zinc-800): Flex horizontal com quadrados coloridos (h-3 w-3) e labels para cada tipo de node e edge.

### 5.7 Inventory

**Rota**: `/inventory`
**Arquivo**: `src/app/(console)/inventory/page.tsx`

**Descricao visual**: Inventario de surfaces (paginas/rotas) normalizadas.

**Elementos dispostos**:

1. **Header**: "Inventory" + subtitulo
2. **Summary Cards** (4 cards):
   - "Total Surfaces" (contagem)
   - "Live" (contagem, variante success = emerald)
   - "Commercial" (contagem, variante info = azul)
   - "With Findings" (contagem, variante warning = ambar)
3. **Filtros** (flex gap-3): Dropdown de status (All/Live/Not Seen) e tipo (All/Commercial/Support/Policy/Other), ambos com bordas zinc-700
4. **Estado vazio**: Texto centralizado "No surfaces discovered yet" com instrucoes
5. **DataTable**:
   - **Surface**: Label + host/path em monospace zinc-500
   - **Type**: Badge (commercial=bg-blue-900/30 text-blue-400, outros=bg-zinc-800 text-zinc-400)
   - **Status**: Ponto colorido (green-400 para live, zinc-500 para not seen) + texto
   - **Sessions**: Contagem monospace
   - **Findings**: Botao clicavel (amber-400 se >0, zinc-600 se 0)
   - **Sources**: Badges de fontes de descoberta

### 5.8 Data Sources

**Rota**: `/app/settings/data-sources`
**Arquivo**: `src/app/(console)/data-sources/page.tsx` e `src/app/app/settings/data-sources/page.tsx`

**Descricao visual**: Setup de integracoes e fontes de dados.

**Elementos dispostos**:

1. **Header**: "Data Sources" + subtitulo
2. **Secao Behavioral Snippet**:
   - Heading "Behavioral Snippet" (zinc-200)
   - Box de codigo (bg-zinc-950, monospace) com botao "Copy" (bg-zinc-800)
   - **Grid de plataformas** (1-2-3 colunas responsivo):
     - Cards com borda zinc-800, bg zinc-900
     - Circulo de icone (w-8 h-8, bg-zinc-800)
     - Nome da plataforma (zinc-200)
     - Badge de status (verde=connected, vermelho=error, cinza=not connected)
     - Descricao (zinc-500, 12px)
     - Botao "Copy snippet" (bg-zinc-800)
     - Plataformas: Shopify Pixel, WordPress Pixel, Wix, Framer, Webflow, Vibecoding, Other

3. **Secao Commerce Integrations**:
   - Grid similar com cards de plataformas de comercio (Shopify)
   - Botao "Connect" (bg blue-900/30, text blue-400)

4. **Formulario SaaS** (na versao /app/settings/data-sources):
   - Campos: Login URL, email, senha (nunca pre-preenchido), auth method, MFA mode
   - Flags booleanas, activation goal, upgrade path
   - Status badges (not_configured, configured, verified, failed, awaiting_manual_mfa, coming_soon)

### 5.9 Settings

**Rota**: `/app/settings`
**Arquivo**: `src/app/(console)/settings/page.tsx`

**Descricao visual**: Hub de configuracao.

**Elementos dispostos**:
1. **Header**: "Settings" + subtitulo
2. **Secao Domains**: Heading "Domains" (zinc-100, lg bold), box vazio (borda zinc-800, py-8) com mensagem que dominios sao configurados via onboarding
3. **Secao Data Overview**: Heading + box vazio com mensagem que dados estarao disponiveis apos primeiro ciclo de auditoria
4. **Secao Account**: Heading + texto que configuracoes de conta sao gerenciadas no control plane

---

## 6. Painel do Usuario (Control Plane)

### 6.1 Organization

**Rota**: `/app/organization`
**Arquivo**: `src/app/app/organization/page.tsx`

**Descricao visual**: Grid 2 colunas (lg).

**Coluna 1 - Details**: Container rounded-lg com borda, bg zinc-900/50. Label "Details" (uppercase, zinc-400). 4 linhas: Organization, Plan, Status, Created — cada uma com label zinc-500 e valor zinc-200 (atualmente "—").

**Coluna 2 - Environments**: Mesmo estilo. Mensagem centralizada "Environments are configured during onboarding."

### 6.2 Billing

**Rota**: `/app/billing`
**Arquivo**: `src/app/app/billing/page.tsx`

**Descricao visual**: Grid 2 colunas (lg).

**Coluna 1 - Current Plan**: Container rounded-lg. Label "Current Plan" (uppercase, zinc-400). 4 linhas: Plan, Price, Renewal, MCP Usage (todos "—"). Botao "Manage Subscription" full-width com borda.

**Coluna 2 - Usage This Period**: Mensagem "Usage data available after first MCP call."

### 6.3 Members

**Rota**: `/app/members`
**Arquivo**: `src/app/app/members/page.tsx`

**Descricao visual**:

**Header**: Titulo "Members" + subtitulo a esquerda. Botao "Invite Member" (emerald-600) a direita.

**Tabela**: Container rounded-md com borda zinc-800. Header da tabela em zinc-900/60 com 4 colunas (Member, Role, Joined, Actions) em uppercase 12px bold zinc-400. Body com estado vazio: mensagem centralizada zinc-500.

**Modal de Convite** (ao clicar "Invite Member"): Overlay com card modal centralizado contendo campo de email, dropdown de role (User/Admin), botoes Confirm/Cancel.

### 6.4 User Account Settings (Legacy)

**Rota**: `/user`
**Arquivo**: `src/app/(site)/user/page.tsx`

**Descricao visual**: Layout com sidebar branca/escura de 290px + conteudo principal. Breadcrumb no topo. Componente `AccountSettings` com formulario de perfil (nome, email, foto, etc.) usando InputGroup e FormButton padronizados.

### 6.5 User Billing (Legacy)

**Rota**: `/user/billing`
**Descricao visual**: Mesmo layout sidebar. Componente `Billing` com gerenciamento de assinatura.

### 6.6 User Invoice (Legacy)

**Rota**: `/user/invoice`
**Descricao visual**: Tabela de historico de compras com colunas Plan, Billing Date, Transaction ID, Amount e botao Download. Botoes de download em cor primaria. Layout responsivo com colunas ocultas em mobile.

---

## 7. Painel Administrativo (Admin)

### 7.1 Admin Dashboard (Legacy)

**Rota**: `/admin`
**Arquivo**: `src/app/(site)/admin/page.tsx`

**Descricao visual**: Layout com sidebar admin. Grid de DataStatsCards (1→2→3→4 colunas responsivo) mostrando KPIs com icone circular colorido, valor bold, label traduzido e indicador de porcentagem (verde/vermelho com seta). Abaixo, secao "Overview" com grid de graficos ApexCharts.

### 7.2 Platform Overview (App)

**Rota**: `/app/admin/overview`
**Arquivo**: `src/app/app/admin/overview/page.tsx`

**Descricao visual**: Header "Platform Overview" (zinc-100) + subtitulo. Grid de 4 cards (2→4 colunas):
- Organizations (contagem)
- MCP Today (queries)
- Playwright Today (runs)
- Revenue Est. (dolares)

Cada card: rounded-md, borda, bg zinc-900/50. Label uppercase 12px zinc-500, valor text-xl bold zinc-100. Alerta ambar condicional para orgs acima do limite MCP.

### 7.3 Manage Users

**Rota**: `/admin/manage-users`
**Arquivo**: `src/app/(site)/admin/manage-users/page.tsx`

**Descricao visual**: Breadcrumb + `UsersListContainer`. Tabela com colunas: nome, email, role, data de registro, acoes. Filtros por role (USER/ADMIN) e busca por texto. Cards brancos com sombra (light) ou cinza escuro (dark).

### 7.4 Organizations

**Rota**: `/admin/organizations`
**Arquivo**: `src/app/(site)/admin/organizations/page.tsx`

**Descricao visual**: Header com titulo "Organizations" (text-2xl bold) + input de busca (rounded-md) a direita. Tabela com 7 colunas:
- Organization (font-medium)
- Plan (badge com bg primario claro)
- Environments (numero)
- Members (numero)
- Status (badge verde para "active", vermelho para outros)
- Created (data em body color)
- Actions: 3 links — "View", "Suspend" (ambar), "Impersonate"

Estado vazio: mensagem centralizada sobre onboarding.

### 7.5 Environments

**Rota**: `/admin/environments`
**Arquivo**: `src/app/(site)/admin/environments/page.tsx`

**Descricao visual**: Header com titulo + input de busca de dominio. Tabela com 6 colunas:
- Domain (font-medium)
- Organization (nome)
- Production (Yes/No)
- Last Audit (badge verde para "complete", ambar para pending)
- Created (data)
- Actions: "Trigger Audit" (primario), "Maintenance" (ambar), "View Findings"

### 7.6 System Health

**Rota**: `/admin/system-health`
**Arquivo**: `src/app/(site)/admin/system-health/page.tsx`

**Descricao visual**: Header "System Health" + subtitulo. Grid de 4 cards de metricas (1→2→4 colunas):
- "MCP Calls Today" (valor em cor primaria)
- "Error Rate" (valor em green-500)
- "Avg Latency" (valor em amber-500)
- "Active Audits" (valor em body color)

Cada card: borda, rounded-lg, label uppercase 12px, valor text-2xl bold.

Secao "Recent MCP Logs": Container arredondado com header "Recent MCP Logs" e body com mensagem placeholder.

### 7.7 Outras Paginas Admin

| Rota | Descricao |
|---|---|
| `/admin/account-settings` | Configuracoes de conta do admin |
| `/admin/pricing` | Configuracao de precos |
| `/admin/notifications` | Gerenciamento de notificacoes |
| `/admin/send-newsletter` | Composicao e envio de newsletter (editor rich text Quill) |
| `/admin/send-notification` | Envio de notificacoes push |
| `/admin/ai-integration` | Configuracao de servicos de IA |
| `/admin/api` | Credenciais e configuracoes de API |
| `/admin/usage-billing` | Metricas de uso e faturamento da plataforma |
| `/app/admin/errors` | Rastreamento de erros |
| `/app/admin/platform-config` | Configuracao da plataforma |

---

## 8. Jornada do Usuario

### 8.1 Jornada Primaria (Novo Usuario)

```
Landing Page (/)
    │
    ├── Explora secoes: Hero → Features → Pricing → FAQ
    │
    ▼
Sign Up (/auth/signup)
    │ Social (Google/GitHub) ou Email
    │
    ▼
Thank You (/thank-you)
    │
    ▼
Sign In (/auth/signin)
    │
    ▼
Onboarding (/app/onboarding)
    │ Step 1: Nome da org
    │ Step 2: Dominio
    │ Step 3: Contexto de negocio
    │ Step 4: [SaaS] Acesso autenticado
    │ Step 5: Review
    │ Step 6: Escolha de plano → Checkout Stripe
    │
    ▼
Console do Produto
    ├── Actions (/app/actions) — Ponto de entrada padrao (operational queue)
    ├── Workspaces (/app/workspaces) — Instrumentos operacionais persistentes
    │     └── Detail (/app/workspaces/[id]) — Checklist, change tracking, trust strength
    ├── Chat (/app/chat) — Perguntas + change report awareness + navigation CTAs
    ├── Analysis (/app/analysis) — Findings com verificacao e change badges
    ├── Maps (/app/maps) — Visualizacao causal
    └── Inventory (/inventory) — Surfaces descobertas
```

### 8.2 Jornada de Uso Recorrente

```
Sign In → Console (Actions como default)
    │
    ├── Revisa operational queue na Actions
    │     ├── Filtra por tab: Incidents / Opportunities / Verifications
    │     ├── Observa Change Summary Banner (regressions, new, resolved)
    │     └── Clica em action → SideDrawer com VerificationPanel, resolve paths
    │
    ├── Navega para Workspaces para contexto profundo
    │     ├── Seleciona workspace → Detail page (/workspaces/[id])
    │     ├── Revisa ChangeTimeline e trust strength panels
    │     └── Preflight: checklist mode com pass/fail/warning
    │
    ├── Conversa no Chat sobre decisions e changes
    │     ├── Perguntas pre-definidas + prompts sobre mudancas
    │     ├── Playbooks guiados
    │     ├── Navigation CTA blocks → navega para surfaces relevantes
    │     └── Change report awareness ("what regressed?")
    │
    ├── Revisa findings detalhados na Analysis
    │     └── Clica em finding → SideDrawer com verificacao e evidence
    │           └── "Discuss" → Vai para Chat com contexto
    │
    ├── Visualiza Maps para entender causas raiz
    │     └── Nodes interativos com relacoes causais
    │
    └── Gerencia Workspaces como instrumentos persistentes
```

### 8.3 Jornada do Admin

```
Sign In (com role ADMIN)
    │
    ▼
Console do Produto (mesma experiencia de usuario)
    │
    ├── Sidebar mostra secao "Platform Admin"
    │
    ▼
Admin Surfaces:
    ├── Overview (/app/admin/overview) — Metricas globais
    ├── Organizations (/app/admin/organizations) — Gerenciar tenants
    ├── Users (/app/admin/users) — Listar/filtrar usuarios
    ├── Environments (/app/admin/environments) — Dominios/auditorias
    ├── System Health (/app/admin/system-health) — Performance MCP
    ├── Usage & Billing — Metricas de uso
    ├── Pricing — Configuracao de planos
    ├── Error Tracking — Rastreamento de erros
    └── Platform Config — Configuracoes da plataforma
```

### 8.4 Jornada de Usuario Convidado

```
Recebe email de convite
    │
    ▼
Invite Signup (/auth/invite)
    │ Formulario pre-preenchido
    │
    ▼
Console (ja vinculado a organizacao do convidante)
```

---

## 9. Mapa de Rotas Completo

### Rotas Publicas (sem autenticacao)
| Rota | Tela | Tipo |
|---|---|---|
| `/` | Home / Landing Page | Marketing |
| `/blog` | Lista de blog posts | Conteudo |
| `/blog/[slug]` | Post individual | Conteudo |
| `/blog/author/[slug]` | Posts por autor | Conteudo |
| `/support` | Pagina de suporte | Marketing |
| `/thank-you` | Confirmacao de cadastro | Transicional |
| `/error` | Pagina 404 | Erro |
| `/auth/signin` | Login | Autenticacao |
| `/auth/signup` | Cadastro | Autenticacao |
| `/auth/forgot-password` | Solicitar reset de senha | Autenticacao |
| `/auth/reset-password/[token]` | Resetar senha | Autenticacao |
| `/auth/invite` | Cadastro por convite | Autenticacao |
| `/studio/[[...index]]` | Sanity CMS Studio | CMS |

### Rotas do Produto (usuario autenticado)
| Rota | Tela | Layout |
|---|---|---|
| `/app` | Redirect → `/app/actions` | App |
| `/app/actions` | Operational queue (default landing) — tabs, change banner, verification | Console |
| `/app/workspaces` | Workspace list — persistent operational instruments | Console |
| `/app/workspaces/[id]` | Workspace detail — checklist, ChangeTimeline, trust strength | Console |
| `/app/chat` | Chat conversacional com rich content blocks + navigation CTAs | Console |
| `/app/analysis` | Findings com verificacao e change badges | Console |
| `/app/maps` | Visualizacao causal ReactFlow | Console |
| `/app/onboarding` | Wizard de setup multi-step | Console |
| `/app/settings` | Configuracoes gerais | Console |
| `/app/settings/data-sources` | Integracoes e fontes de dados | Console |
| `/app/organization` | Detalhes da organizacao | App |
| `/app/billing` | Assinatura e pagamento | App |
| `/app/members` | Gerenciamento de membros | App |

### Rotas Admin (role ADMIN)
| Rota | Tela | Layout |
|---|---|---|
| `/app/admin/overview` | Metricas da plataforma | App |
| `/app/admin/organizations` | Gerenciar organizacoes | App |
| `/app/admin/users` | Gerenciar usuarios | App |
| `/app/admin/environments` | Dominios e auditorias | App |
| `/app/admin/system-health` | Saude do sistema MCP | App |
| `/app/admin/usage-billing` | Uso e faturamento | App |
| `/app/admin/pricing` | Configuracao de precos | App |
| `/app/admin/errors` | Rastreamento de erros | App |
| `/app/admin/platform-config` | Config da plataforma | App |

### Rotas Legacy (redirecionadas via middleware)
| Rota antiga | Redireciona para |
|---|---|
| `/analysis` | `/app/analysis` |
| `/chat` | `/app/chat` |
| `/actions` | `/app/actions` |
| `/workspaces` | `/app/workspaces` |
| `/maps` | `/app/maps` |
| `/onboard` | `/app/onboarding` |
| `/settings` | `/app/settings` |
| `/user/*` | `/app` |
| `/admin/*` | `/app` (admin only) |

---

## Componentes Compartilhados de Referencia

| Componente | Arquivo | Descricao |
|---|---|---|
| DataTable | `src/components/console/DataTable.tsx` | Tabela generica tipada com colunas customizaveis |
| SummaryCards | `src/components/console/SummaryCards.tsx` | Grid de cards de metricas com variantes de cor e sparklines |
| SideDrawer | `src/components/console/SideDrawer.tsx` | Painel lateral deslizante (escape/backdrop para fechar) |
| SeverityBadge | `src/components/console/SeverityBadge.tsx` | Badge de severidade com cores por nivel |
| ImpactBadge | `src/components/console/ImpactBadge.tsx` | Badge de impacto com range monetario |
| **VerificationBadge** | `src/components/console/VerificationBadge.tsx` | Badge de maturity de verificacao (unverified/pending/partially/verified/degraded/stale) |
| **ChangeBadge** | `src/components/console/ChangeBadge.tsx` | Badge de classe de mudanca (regression/improvement/new/resolved/stable) |
| **VerificationPanel** | `src/components/console/VerificationPanel.tsx` | Painel de lifecycle de verificacao com stepped progress bar, method, freshness, degradation |
| **VerificationSufficiencyWarning** | `src/components/console/VerificationSufficiencyWarning.tsx` | Alerta quando itens de alto impacto nao tem verificacao suficiente |
| **ChangeTimeline** | `src/components/console/ChangeTimeline.tsx` | Timeline vertical de mudancas entre ciclos, ordenada por criticidade |
| **ChatMessageRenderer** | `src/components/console/chat/ChatMessageRenderer.tsx` | Dispatcher de ContentBlock[] para sub-componentes (markdown, tool_call, finding_card, action_card, navigation_cta, etc.) |
| **ConversationSidebar** | `src/components/console/chat/ConversationSidebar.tsx` | Painel lateral colapsavel com historico de conversas, date grouping, hover delete |
| **ModelSelector** | `src/components/console/chat/ModelSelector.tsx` | Pill dropdown compacto: Default/Ultra com plan gating e cost badge |
| **ChatInputBar** | `src/components/console/chat/ChatInputBar.tsx` | Input auto-resize com Shift+Enter, model selector embutido |
| PromptGateCard | `src/components/console/PromptGateCard.tsx` | Card de avaliacao de qualidade de prompt |
| ChatBudgetBar | `src/components/console/ChatBudgetBar.tsx` | Barra de uso MCP com thresholds de cor |
| OrgSelector | `src/components/console/OrgSelector.tsx` | Dropdown de selecao de organizacao |
| ConsoleState | `src/components/console/ConsoleState.tsx` | Estados vazios e de carregamento com tokens semanticos |
| AppSidebar | `src/components/app/AppSidebar.tsx` | Sidebar colapsavel do app |
| InputGroup | `src/components/Common/Dashboard/InputGroup.tsx` | Input com label, toggle de senha |
| FormButton | `src/components/Common/Dashboard/FormButton.tsx` | Botao de submit full-width |
| DeleteModal | `src/components/Common/Modals/DeleteModal.tsx` | Modal de confirmacao de exclusao |
| InviteUserModal | `src/components/Common/Modals/InviteUserModal.tsx` | Modal de convite de usuario |
| Card | `src/components/Common/Dashboard/Card.tsx` | Container card basico |
| Loader | `src/components/Common/Loader.tsx` | Spinner circular animado |
| ThemeToggler | `src/components/Common/Dashboard/Header/ThemeToggler.tsx` | Toggle sol/lua de tema |
| CopyToClipboard | `src/components/Common/CopyToClipboard.tsx` | Botao copiar com feedback "Copied" |
