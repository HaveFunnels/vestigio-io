# Vestigio.io - Proposta de Frontend Baseada em Mockups de Referencia

> **SUPERSEDED** — This document was the original proposal based on mockup references. The frontend has been significantly built out since then. For the current state of all screens and components, see `docs/FRONTEND_DESCRIPTION.md`. For the current UX hierarchy and interaction model, see `docs/UX_SURFACES.md`.

> Analise das caracteristicas visuais dos mockups de referencia, mapeamento para componentes Vestigio, e status de implementacao.

---

## Sumario

1. [Identidade Visual dos Mockups](#1-identidade-visual-dos-mockups)
2. [Sidebar e Navegacao](#2-sidebar-e-navegacao)
3. [Tela: Inventory / Findings (Light)](#3-tela-inventory--findings-light)
4. [Tela: Grafo de Relacionamentos (Dark)](#4-tela-grafo-de-relacionamentos-dark)
5. [Tela: Reports / Side Panel (Light)](#5-tela-reports--side-panel-light)
6. [Botao Vestigio AI](#6-botao-vestigio-ai)
7. [Mapeamento Mockup → Vestigio](#7-mapeamento-mockup--vestigio)
8. [Itens Pendentes](#8-itens-pendentes)

---

## 1. Identidade Visual dos Mockups

### 1.1 Paleta de Cores

Os mockups usam violeta/roxo como cor primaria. A Vestigio optou por manter **emerald** como acento, gerenciavel via CSS variables (`globals.css`). Trocar para violeta requer alterar apenas as variables `--accent-*` e `--sidebar-active-*`.

#### Light Theme (observado nos mockups)
| Elemento | Cor observada | Uso |
|---|---|---|
| Background principal | `#FFFFFF` branco puro | Fundo da area de conteudo |
| Background sidebar | `#FAFAFA` cinza muito sutil | Fundo da sidebar colapsada |
| Texto primario | `#1A1A2E` preto-azulado | Titulos e texto principal |
| Texto secundario | `#6B7280` cinza medio | Subtitulos, metadados |
| Borda de tabela | `#E5E7EB` cinza claro | Linhas de separacao |
| Cor primaria | `#6C5CE7` violeta | Badges, botoes, links ativos |
| Risk score gradient | Vermelho → amarelo → escuro | Barra horizontal de risco |
| Cards de icone (Reports) | Laranja, vermelho, teal, roxo, amarelo, coral | Quadrados coloridos grandes |

#### Dark Theme (observado nos mockups)
| Elemento | Cor observada | Uso |
|---|---|---|
| Background principal | `#0F0F1A` preto-azulado profundo | Nao e zinc puro, tem tonalidade azul/violeta |
| Background sidebar | `#0A0A15` preto mais profundo | Sidebar colapsada |
| Texto primario | `#F0F0F5` branco levemente azulado | Titulos |
| Texto secundario | `#8B8BA3` cinza-lavanda | Metadados |
| Borda | `#2A2A40` violeta muito escuro | Linhas e bordas |
| Linhas de conexao (grafo) | Violeta com glow/brilho | Emissao de luz entre nodes |
| Node badges | Vermelho `#EF4444` | Contadores de problemas |

### 1.2 Tipografia Observada

- **Titulos de pagina**: Sans-serif bold, ~24px
- **Labels de tabela**: Sans-serif medium, ~13px, uppercase, cinza
- **Texto de celula**: Sans-serif regular, ~14px
- **Badges/pills**: Sans-serif medium, ~12px
- **Numeros grandes (stats)**: Sans-serif bold, ~28-32px
- **Subtexto de stats**: Sans-serif regular, ~12px, cinza

### 1.3 Espacamento e Bordas

- **Border radius**: ~8px cards/containers, ~16-20px pills/badges, fully rounded icones
- **Sombras**: Sutis no light (quase flat), ausentes no dark
- **Espacamento**: Generoso — padding ~20-24px containers, gap ~16px cards
- **Bordas**: 1px, cinza claro no light, cinza-violeta escuro no dark

### 1.4 Feeling Geral

**Ferramenta enterprise de analytics** com polish excepcional:
- Confianca tecnica sem ser brutalmente tecnica — sofisticada, nao terminal
- Densidade de informacao controlada
- Branding forte — uma cor domina tudo
- Transicao light→dark coesa — mesmo produto em dois modos

### 1.5 Status de Implementacao

| Aspecto | Status |
|---|---|
| CSS Variables para cores | **Implementado** — `globals.css` com `:root` (light) e `.dark` |
| Tailwind tokens semanticos | **Implementado** — `surface`, `edge`, `content`, `accent`, `sidebar` |
| ThemeProvider no console/app | **Implementado** — `AppProviders` com defaultTheme="dark" |
| Trocar cores facilmente | **Implementado** — editar CSS variables em `globals.css` |
| Espacamento 20-24px | **Parcialmente** — aplicado nos componentes migrados |

---

## 2. Sidebar e Navegacao

### 2.1 Comportamento dos Mockups vs Implementacao

| Aspecto | Mockup | Status na Vestigio |
|---|---|---|
| Estado padrao colapsado (so icones) | Sim | **Implementado** |
| Expansao no hover (desktop) | Sim | **Implementado** — delay de 80ms no leave |
| Overlay com backdrop (mobile) | Sim | **Implementado** — hamburger no header |
| Labels de secao ocultos quando colapsado | Sim | **Implementado** — opacity transition |
| Fundo diferente do conteudo | Sim | **Implementado** — `bg-sidebar-bg` separado |
| Item ativo com pill solido | Sim | **Implementado** — `bg-sidebar-active-bg text-sidebar-active-text` |
| Submenu expansivel (Analysis) | N/A nos mockups | **Implementado** — Analysis expande para Findings + Inventory |

### 2.2 Estrutura de Navegacao Implementada

> **Updated**: Sidebar order changed in the UX overhaul. Actions is now first (default landing). Analysis moved to 4th position as expandable parent.

```
Product
├── Actions → /app/actions (DEFAULT LANDING)
├── Workspaces → /app/workspaces
│   └── Detail → /app/workspaces/[id]
├── Chat → /app/chat
├── Analysis (expansivel)
│   ├── Findings → /app/analysis
│   └── Inventory → /app/inventory
└── Maps → /app/maps

Control Plane
├── Organization → /app/organization
├── Billing → /app/billing
├── Members → /app/members
├── Settings → /app/settings
└── Data Sources → /app/settings/data-sources

Platform Admin (condicional)
├── Overview, Organizations, Users, Environments
├── Usage & Billing, Pricing, System Health
└── Error Tracking, Platform Config
```

### 2.3 Arquivos Envolvidos

- `src/components/app/AppSidebar.tsx` — componente principal (hover-expand + mobile overlay + submenus)
- `src/components/app/AppSidebarLayout.tsx` — client wrapper com estado mobileOpen e hamburger
- `src/components/app/sidebar-nav-data.ts` — dados de navegacao com tipagem NavItem

### 2.4 Top Bar (parcialmente implementado)

| Aspecto | Mockup | Vestigio Atual | Pendente |
|---|---|---|---|
| Seletor de ambiente | Direita com chevron | Esquerda (OrgSelector) | Reposicionar |
| Notificacoes (sino) | Presente | Ausente | Criar |
| Avatar do usuario | Presente | Ausente | Criar |
| Badge de plano | Nao visivel | Presente (direita) | Manter |

---

## 3. Tela: Inventory / Findings (Light)

### 3.1 Descricao Visual (Mockup)

**Cards de metricas**: 4 cards com icone, numero grande bold, sparkline ao lado, label abaixo, sub-badges opcionais.

**Barra de filtros**: Pills arredondadas com icone + texto + chevron. Toggle "Table" / "Fabric".

**Tabela**: Headers com method badges (POST=violeta, GET=verde, PUT=azul), risk score com barra gradiente, paginacao com controles, CSV export, config de colunas.

**Popover**: Card flutuante ao clicar no risk score com detalhes inline.

### 3.2 Status na Vestigio

| Aspecto | Mockup | Status |
|---|---|---|
| SummaryCards com sparklines | Com sparklines | **Implementado** — prop `sparkData` com ApexCharts |
| Tokens semanticos no DataTable | Cores adaptativas | **Implementado** — `border-edge`, `text-content`, etc. |
| Tokens no SideDrawer | Cores adaptativas | **Implementado** |
| Light mode funcional | Sim | **Implementado** — CSS variables + ThemeProvider |
| Filtros como pills | Pills arredondadas | **Pendente** — ainda usa selects nativos |
| Paginacao | Controles de pagina | **Pendente** |
| CSV export | Botao | **Pendente** |
| Config de colunas | Engrenagem | **Pendente** |
| Risk score gradient bar | Barra gradiente | **Pendente** |
| Popover de detalhe inline | Card flutuante | **Pendente** |
| Toggle Table/Graph | Dois botoes pill | **Pendente** |

### 3.3 Nota sobre Findings vs Inventory

Nos mockups, "Inventory" mostra APIs. Na Vestigio:
- **Findings** (`/app/analysis`) mostra findings com impacto financeiro — equivale funcionalmente ao "Inventory" do mockup
- **Inventory** (`/app/inventory`) mostra surfaces (paginas/rotas) — conceito separado
- Ambas agora sao acessiveis como sub-itens de "Analysis" na sidebar

---

## 4. Tela: Grafo de Relacionamentos (Dark)

### 4.1 Descricao Visual (Mockup)

**Organizacao columnar**: Pills coloridas ("Agents", "MCPs", "Technologies", "3rd Party Vendors") como headers de zona.

**Nodes ricos**: Cards com icones de plataforma, nomes, URLs truncadas, badges numericos vermelhos para alertas. Node selecionado com glow violeta.

**Linhas de conexao**: Violeta/lavanda com **glow** (emissao de luz), bezier suave, semi-transparentes, ficam mais brilhantes na selecao.

**Insight Layers**: Painel com toggles de camadas visiveis.

### 4.2 Adaptacao para Vestigio (User Journey Graph)

| Coluna Mockup | Equivalente Vestigio |
|---|---|
| Agents | **Root Causes** |
| MCPs | **Findings** |
| Technologies | **Surfaces** |
| 3rd Party Vendors | **Actions** |

### 4.3 Status na Vestigio

| Aspecto | Status |
|---|---|
| ReactFlow como base | **Implementado** — ja usa @xyflow/react |
| Custom nodes (RootCause, Finding, Action, Category) | **Implementado** — basicos |
| Edges com cores semanticas | **Implementado** — red, emerald, zinc, blue |
| Organizacao columnar com headers | **Pendente** |
| Glow nas linhas (SVG filter) | **Pendente** — somente no edge clicado/hover, nao em todas |
| Nodes ricos com icones e badges numericos | **Pendente** |
| Insight Layers (toggles de camada) | **Pendente** |
| Node selecionado com glow | **Pendente** |
| Cor das linhas | **Decidido** — manter cores diferentes por tipo, glow so no hover/click |

---

## 5. Tela: Reports / Side Panel (Light)

### 5.1 Descricao Visual (Mockup)

**Side Panel wizard**: Ocupa ~60% da largura, step indicator (1→2), lista de cards de template com quadrados coloridos grandes (~64px) e icones brancos, botoes Cancel/Next.

### 5.2 Status na Vestigio

| Aspecto | Status |
|---|---|
| SideDrawer existente | **Implementado** — migrado para tokens semanticos |
| Suporte a wizard/steps | **Pendente** |
| Cards de selecao com icones | **Pendente** |
| Tela de Reports | **Nao existe** — nao ha equivalente planejado |

---

## 6. Botao Vestigio AI

### 6.1 Descricao Visual (Mockup — "Pepper AI")

- **Posicao**: Fixed bottom-right (FAB)
- **Light**: Pill branca com sombra, icone de sparkle + "Pepper AI"
- **Dark**: Pill escura, icone violeta + "Pepper AI"
- **Clique**: Abre chat/assistant

### 6.2 Especificacao Decidida

| Aspecto | Decisao |
|---|---|
| Posicao | Fixed bottom-right, z-50, ~24px do canto |
| Texto | "Vestigio AI" com icone sparkle |
| Light | `bg-surface shadow border-edge text-content` |
| Dark | `bg-surface-card border-edge-subtle text-content accent icon` |
| Clique (sem selecao) | Navega para `/app/chat` |
| Clique (com rows selecionadas) | Navega para `/app/chat` passando os findings/surfaces selecionados como contexto |
| Badge de contagem | Exibe numero de rows selecionadas (ex: "3" em badge emerald) |

### 6.3 Status

**Pendente** — nao implementado ainda. Chat continua acessivel pela sidebar.

---

## 7. Mapeamento Mockup → Vestigio

### 7.1 Componentes — Status Atualizado

> **Note**: This table reflects the state after the UX overhaul. For the full current description, see `docs/FRONTEND_DESCRIPTION.md`.

| Componente do Mockup | Equivalente Vestigio | Status |
|---|---|---|
| Sidebar colapsada (hover-expand) | AppSidebar | **Implementado** |
| Sidebar mobile (overlay + hamburger) | AppSidebar + AppSidebarLayout | **Implementado** |
| Submenu expansivel | Analysis → Findings + Inventory | **Implementado** |
| Item ativo (pill solido) | `bg-sidebar-active-bg` | **Implementado** |
| CSS Variables (tema controlavel) | `globals.css` + `tailwind.config.ts` | **Implementado** |
| ThemeProvider (light/dark) | `AppProviders` | **Implementado** |
| Stats cards com sparklines | SummaryCards com ApexCharts | **Implementado** |
| DataTable com tokens semanticos | DataTable | **Implementado** |
| SideDrawer com tokens semanticos | SideDrawer | **Implementado** |
| ConsoleState com tokens semanticos | ConsoleState | **Implementado** |
| OrgSelector com tokens semanticos | OrgSelector | **Implementado** |
| VerificationBadge | VerificationBadge | **Implementado** — maturity badges on all tables |
| ChangeBadge | ChangeBadge | **Implementado** — change class per finding/action |
| VerificationPanel | VerificationPanel | **Implementado** — stepped progress in drawers |
| ChangeTimeline | ChangeTimeline | **Implementado** — vertical timeline in workspaces |
| VerificationSufficiencyWarning | VerificationSufficiencyWarning | **Implementado** — alerts for under-verified items |
| PreflightChecklist | PreflightChecklist (inline) | **Implementado** — pass/fail/warning checklist mode |
| Category tabs (Actions) | Actions page tabs | **Implementado** — All/Incidents/Opportunities/Verifications |
| Workspace detail page | `/workspaces/[id]` | **Implementado** — full detail with change tracking |
| Chat rich content blocks | ChatMessageRenderer | **Implementado** — 10+ block types including navigation CTA |
| ConversationSidebar | ConversationSidebar | **Implementado** — date grouping, hover delete |
| ModelSelector | ModelSelector | **Implementado** — Default/Ultra with plan gating |
| Pill filter bar | — | **Pendente** |
| Paginacao | — | **Pendente** |
| Risk score gradient bar | — | **Pendente** |
| Popover de detalhe inline | — | **Pendente** |
| Graph glow edges | — | **Pendente** |
| Rich graph nodes | — | **Pendente** |
| Graph column headers | — | **Pendente** |
| Insight Layers (grafo) | — | **Pendente** |
| Column config (tabela) | — | **Pendente** |
| CSV export | — | **Pendente** |
| Side panel wizard | — | **Pendente** |
| Floating AI button | — | **Pendente** |
| Top bar: notificacoes + avatar | — | **Pendente** |

---

## 8. Itens Pendentes

### 8.1 Prioridade Alta

| Item | Descricao | Complexidade |
|---|---|---|
| **FilterPills** | Substituir selects nativos por pills arredondadas com icone + texto + chevron | Media |
| **Floating AI Button** | FAB "Vestigio AI" no bottom-right, navega para `/app/chat` | Baixa |
| **Pagination** | Controle de items-per-page + navegacao de paginas | Media |

### 8.2 Prioridade Media

| Item | Descricao | Complexidade |
|---|---|---|
| **Graph Glow Edges** | SVG filter de glow nas edges do ReactFlow | Media |
| **Rich Graph Nodes** | Nodes com icones, badges numericos, URLs truncadas | Alta |
| **Graph Column Headers** | Pills coloridas horizontais separando zonas do grafo | Media |
| **RiskScoreBar** | Barra gradiente horizontal para impacto/risco | Baixa |
| **Top bar enhancements** | Reposicionar OrgSelector, adicionar notificacoes + avatar | Media |

### 8.3 Prioridade Baixa

| Item | Descricao | Complexidade |
|---|---|---|
| **Popover inline** | Preview rapido de finding sem abrir drawer | Media |
| **Column config** | Engrenagem para mostrar/ocultar colunas da tabela | Media |
| **CSV export** | Botao de exportacao de dados | Baixa |
| **Insight Layers** | Toggles de camadas visiveis no grafo | Media |
| **Side panel wizard** | SideDrawer com steps e formularios de criacao | Alta |

### 8.4 Decisoes Resolvidas

| Decisao | Resolucao |
|---|---|
| **Cor de acento** | Manter **emerald**. Trocar para violeta so requer editar CSS variables. |
| **Background dark** | Manter **zinc puro** (zinc-950). |
| **Bordas dark** | Manter **zinc-800**. |
| **Glow do grafo** | Manter cores diferentes por tipo de edge. Glow **somente no edge clicado ou hover**, nao em todas. |
| **Floating AI Button** | Navega para `/app/chat`. Exibe contagem de rows selecionadas. Passa rows como contexto ao chat. |
| **Paginacao** | **Backend-paginada**, 25 items por pagina. |
| **Top bar** | OrgSelector a **direita**. Adicionar **sino** (notificacoes com popover) e **"?"** (link para docs/blog). |
| **Theme default** | **Dark** permanece como default do console/app. |
| **Detalhe de finding** | **SideDrawer** para detalhe completo + **popover** para preview rapido. |

---

## Arquivos de Referencia do Design System

| Arquivo | Proposito |
|---|---|
| `src/styles/globals.css` | CSS variables (light + dark) — ponto unico para trocar cores |
| `tailwind.config.ts` | Tokens semanticos (`surface`, `edge`, `content`, `accent`, `sidebar`) |
| `src/app/app/providers.tsx` | ThemeProvider para console/app |
| `src/components/app/AppSidebar.tsx` | Sidebar hover-expand + mobile overlay + submenus |
| `src/components/app/AppSidebarLayout.tsx` | Client wrapper com estado mobile |
| `src/components/app/sidebar-nav-data.ts` | Dados de navegacao tipados |
| `docs/FRONTEND_DESCRIPTION.md` | Descricao completa de todas as telas atuais |
