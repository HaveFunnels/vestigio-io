# Control Plane Assessment

## 1. Executive summary

O estado atual do control plane da Vestigio é de uma base promissora no engine, mas com shell e modelo operacional ainda incompletos para hardening ou go-live.

O que está mais sólido hoje não é o shell. O que está mais sólido é o núcleo analítico local em `packages/*`, o assembler MCP em `apps/mcp/*`, a pipeline de ingestão HTTP em `workers/ingestion/*` e o loop de verificação/recompute em `workers/verification/*`. Esse núcleo já trabalha com `workspace_ref`, `environment_ref`, projeções, mapas e respostas estruturadas de MCP ([apps/mcp/context.ts](../apps/mcp/context.ts), [apps/mcp/server.ts](../apps/mcp/server.ts), [workers/ingestion/pipeline.ts](../workers/ingestion/pipeline.ts), [workers/verification/orchestrator.ts](../workers/verification/orchestrator.ts)).

O shell novo em `src/app/(console)` ainda é majoritariamente um shell visual. As rotas existem, o layout principal existe e há componentes reutilizáveis bons para tabela, cards, badges e drawer, mas as páginas do console estão alimentadas por `demo*` arrays inline, não por dados reais do MCP. Isso é explícito em `analysis`, `actions`, `workspaces`, `maps`, `settings` e `chat` ([src/app/(console)/analysis/page.tsx#L13](../src/app/(console)/analysis/page.tsx), [src/app/(console)/actions/page.tsx#L12](../src/app/(console)/actions/page.tsx), [src/app/(console)/workspaces/page.tsx#L12](../src/app/(console)/workspaces/page.tsx), [src/app/(console)/maps/page.tsx#L19](../src/app/(console)/maps/page.tsx), [src/app/(console)/settings/page.tsx#L6](../src/app/(console)/settings/page.tsx), [src/app/(console)/chat/page.tsx#L99](../src/app/(console)/chat/page.tsx)).

O onboarding atual é um wizard visual de 4 passos, mas não persiste nada, não cria workspace, não cria environment, não dispara ingestão, não inicializa ciclo de auditoria e não integra com billing, auth ou MCP. Ele serve como referência de UX inicial, não como activation flow real ([src/app/(console)/onboard/page.tsx#L22](../src/app/(console)/onboard/page.tsx#L22), [src/app/(console)/onboard/page.tsx#L54](../src/app/(console)/onboard/page.tsx#L54)).

A modelagem de tenancy/RBAC está desalinhada entre conceito e persistência. No domínio analítico, existem `Workspace`, `Environment` e `BusinessProfile` como contratos TypeScript ([packages/domain/workspace.ts](../packages/domain/workspace.ts)). No banco Prisma, isso não existe. O banco real só conhece `User`, `Account`, `Session`, `ApiKey`, `Invitation` e `VerificationToken`, com `role` global no usuário e billing também no usuário ([prisma/schema.prisma](../prisma/schema.prisma)). Não há `Organization`, `Membership`, `Workspace`, `Environment`, `BusinessProfile` nem tabela de ownership.

Para deploy sério, o sistema ainda não está pronto. Ele sobe como um único processo Next.js com Postgres e integrações opcionais, mas o control plane novo não está conectado à camada analítica real, não há persistência de tenancy/environment, não há worker plane separado, `browser_verification` e `integration_pull` são stubs, e a proteção de rota cobre apenas `/user/*` e `/admin/*`, não o novo `(console)` ([src/middleware.ts#L32](../src/middleware.ts#L32), [workers/verification/executors.ts#L185](../workers/verification/executors.ts#L185)).

Diagnóstico objetivo:

- Shell: bom o suficiente como base visual, não como base operacional endurecível sem reestruturação parcial.
- Onboarding: esqueleto visual, não activation flow.
- Tenancy/RBAC: conceitualmente iniciado no domínio, inexistente na persistência e na UI operacional.
- Deploy/go-live: viável apenas como demo técnica/local; não viável como control plane SaaS sério no estado atual.

## 2. Shell current state

### Estrutura real de rotas/pages

O app usa Next.js App Router (`src/app`) e hoje convive com três superfícies:

- `src/app/(console)/*`: novo shell Vestigio.
- `src/app/(site)/*`: site marketing + auth + dashboards legado SaaSBold.
- `src/app/(studio)/studio/*`: Sanity Studio.

Rotas do control plane novo:

- `/onboard` via [src/app/(console)/onboard/page.tsx](../src/app/(console)/onboard/page.tsx)
- `/chat` via [src/app/(console)/chat/page.tsx](../src/app/(console)/chat/page.tsx)
- `/actions` via [src/app/(console)/actions/page.tsx](../src/app/(console)/actions/page.tsx)
- `/workspaces` via [src/app/(console)/workspaces/page.tsx](../src/app/(console)/workspaces/page.tsx)
- `/analysis` via [src/app/(console)/analysis/page.tsx](../src/app/(console)/analysis/page.tsx)
- `/maps` via [src/app/(console)/maps/page.tsx](../src/app/(console)/maps/page.tsx)
- `/settings` via [src/app/(console)/settings/page.tsx](../src/app/(console)/settings/page.tsx)

### Layout principal

O layout do console é extremamente simples: sidebar fixa à esquerda e área scrollável à direita, sem header, sem auth gate, sem provider de sessão, sem loading/data boundary e sem seleção de workspace/environment ([src/app/(console)/layout.tsx#L7](../src/app/(console)/layout.tsx#L7)).

Isso é positivo por ser thin no layout, mas ainda é fino demais para um control plane real. Faltam pelo menos:

- contexto de sessão/workspace/environment
- boundary de erro/loading
- shell-level actions
- guardas de autorização
- estado global do audit cycle

### Navegação/sidebar

A sidebar é local, client-side, com sete entradas hardcoded: `Onboard`, `Chat`, `Actions`, `Workspaces`, `Analysis`, `Maps`, `Settings` ([src/components/console/Sidebar.tsx#L7](../src/components/console/Sidebar.tsx#L7)). Ela resolve ativo por `pathname.startsWith(item.href)` e tem apenas estado local de colapso ([src/components/console/Sidebar.tsx#L27](../src/components/console/Sidebar.tsx#L27)).

Implicações:

- Não existe IA de navegação contextual por workspace ativo.
- Não existe distinção entre setup e operação.
- Não existe noção de tenancy ou environment na navegação.
- Não há sincronização com `McpSessionContext`, apesar de esse conceito existir no MCP.

### Áreas já implementadas

Existem superfícies de console bem definidas:

- `analysis`: findings com filtros, seleção e drawer.
- `actions`: priorização de ações com drawer.
- `workspaces`: três workspaces analíticos com drill-down.
- `maps`: visualização causal em React Flow.
- `chat`: superfície conversacional tipo MCP answer.
- `settings`: domains/data/account overview.
- `onboard`: wizard inicial.

Componentes de console reutilizados:

- [src/components/console/DataTable.tsx](../src/components/console/DataTable.tsx)
- [src/components/console/SideDrawer.tsx](../src/components/console/SideDrawer.tsx)
- [src/components/console/SummaryCards.tsx](../src/components/console/SummaryCards.tsx)
- [src/components/console/SeverityBadge.tsx](../src/components/console/SeverityBadge.tsx)
- [src/components/console/ImpactBadge.tsx](../src/components/console/ImpactBadge.tsx)

Esses componentes parecem uma base sólida de UI. O problema não é falta de shell visual; é falta de wiring real com o runtime e com a persistência.

### Dependências entre UI e MCP

Existe uma interface explícita de frontend para MCP em [src/lib/mcp-client.ts](../src/lib/mcp-client.ts). Ela define wrappers tipados como:

- `fetchFindingProjections`
- `fetchActionProjections`
- `fetchWorkspaceProjections`
- `fetchMap`
- `discussFinding`
- `analyzeFindings`
- `requestVerification`

O arquivo também deixa explícito que, nesta fase, o MCP é `in-process` e que futuramente deveria virar HTTP/stdio ([src/lib/mcp-client.ts#L19](../src/lib/mcp-client.ts#L19)).

Mas hoje há dois problemas práticos:

1. O server MCP exige `loadContext()` antes de qualquer `callTool()` ([apps/mcp/server.ts#L54](../apps/mcp/server.ts#L54), [apps/mcp/server.ts#L99](../apps/mcp/server.ts#L99)).
2. Não há uso do `mcp-client` nas páginas do console e também não há chamada visível de `loadContext()` em `src` ([resultado de busca `rg`](../src/lib/mcp-client.ts), [apps/mcp/server.ts](../apps/mcp/server.ts)).

Conclusão: a dependência conceitual UI->MCP existe, mas a integração operacional ainda não existe.

### Thin frontend ou frontend com lógica demais?

Hoje o frontend do console é paradoxal:

- Arquiteturalmente, ele foi desenhado para ser thin.
- Concretamente, ele ainda carrega lógica demais de apresentação e dados fake.

Exemplos:

- `analysis` define `demoFindings` inline ([src/app/(console)/analysis/page.tsx#L16](../src/app/(console)/analysis/page.tsx#L16)).
- `actions` define `demoActions` inline ([src/app/(console)/actions/page.tsx#L16](../src/app/(console)/actions/page.tsx#L16)).
- `workspaces` define `demoWorkspaces` inline ([src/app/(console)/workspaces/page.tsx#L16](../src/app/(console)/workspaces/page.tsx#L16)).
- `maps` define `demoMaps` inline ([src/app/(console)/maps/page.tsx#L22](../src/app/(console)/maps/page.tsx#L22)).
- `chat` define `demoMessages`, `findingContextMessage` e composições contextuais inline ([src/app/(console)/chat/page.tsx#L108](../src/app/(console)/chat/page.tsx#L108), [src/app/(console)/chat/page.tsx#L486](../src/app/(console)/chat/page.tsx#L486)).

Diagnóstico do shell:

- Sólido: layout base, navegação, componentes de visualização, taxonomia das áreas.
- Placeholder: praticamente todas as páginas do console.
- Acoplado: o shell ainda está acoplado ao dataset fake e desacoplado do MCP real.
- Pronto para evoluir: a camada de componentes e a taxonomia funcional.

## 3. Onboarding current state

### O que existe hoje

Existe um wizard client-side de 4 passos em [src/app/(console)/onboard/page.tsx](../src/app/(console)/onboard/page.tsx):

1. `Domain`
2. `Business context`
3. `Conversion model`
4. `Install pixel (optional)`

O estado é um único `useState<OnboardState>` com:

- `domain`
- `businessType`
- `monthlyRevenue`
- `averageTicket`
- `conversionModel`

Referências:

- definição de estado em [src/app/(console)/onboard/page.tsx#L11](../src/app/(console)/onboard/page.tsx#L11)
- total de steps em [src/app/(console)/onboard/page.tsx#L22](../src/app/(console)/onboard/page.tsx#L22)

### Quais dados são capturados

Step 1:

- `domain` ([src/app/(console)/onboard/page.tsx#L94](../src/app/(console)/onboard/page.tsx#L94))

Step 2:

- `businessType`
- `monthlyRevenue`
- `averageTicket`

([src/app/(console)/onboard/page.tsx#L132](../src/app/(console)/onboard/page.tsx#L132))

Step 3:

- `conversionModel`

([src/app/(console)/onboard/page.tsx#L208](../src/app/(console)/onboard/page.tsx#L208))

Step 4:

- nenhum dado novo persistível; apenas exibe snippet de pixel

([src/app/(console)/onboard/page.tsx#L245](../src/app/(console)/onboard/page.tsx#L245))

### O que é persistido e onde

Nada.

Não há:

- `fetch`
- `server action`
- `route handler`
- `prisma`
- `mcp-client`
- `runIngestion`
- `loadContext`

no onboarding atual.

Os botões finais `Skip` e `Done` têm handlers vazios comentados ([src/app/(console)/onboard/page.tsx#L272](../src/app/(console)/onboard/page.tsx#L272)).

### O que é só UI placeholder

Praticamente tudo no flow atual:

- o botão `Analyze` só avança step, não analisa nada ([src/app/(console)/onboard/page.tsx#L123](../src/app/(console)/onboard/page.tsx#L123))
- o pixel snippet usa `YOUR_SITE_ID`, mas não existe criação real de `site_id` ([src/app/(console)/onboard/page.tsx#L38](../src/app/(console)/onboard/page.tsx#L38))
- não há verificação de domínio
- não há validação semântica do business profile
- não há confirmação de instalação do pixel

### O que dispara audit/análise

Nada dispara audit/análise no onboarding.

Existe uma pipeline de ingestão real em [workers/ingestion/pipeline.ts](../workers/ingestion/pipeline.ts), com `runIngestion(input)` recebendo `domain`, `workspace_ref`, `environment_ref`, `website_ref` e `cycle_ref` ([workers/ingestion/pipeline.ts#L31](../workers/ingestion/pipeline.ts#L31), [workers/ingestion/pipeline.ts#L116](../workers/ingestion/pipeline.ts#L116)).

Mas não há qualquer conexão do wizard com essa pipeline.

### Já existe criação de workspace/environment?

No fluxo real de onboarding, não.

Há contrato conceitual de `Workspace` e `Environment` em `packages/domain/workspace.ts`, mas isso não é persistido nem instanciado pelo onboarding ([packages/domain/workspace.ts#L8](../packages/domain/workspace.ts#L8), [packages/domain/workspace.ts#L20](../packages/domain/workspace.ts#L20)).

### Pixel é tratado como opcional?

Sim, visualmente ele é tratado como opcional ([src/app/(console)/onboard/page.tsx#L249](../src/app/(console)/onboard/page.tsx#L249)).

Mas isso é apenas UX. Não existe uma modelagem real de:

- pixel installed
- pixel pending
- pixel skipped
- pixel verified

### Business profile já existe ou está só visualmente representado?

No runtime do control plane, está só visualmente representado.

No domínio analítico, existe um contrato forte de `BusinessProfile` com:

- `business_model`
- `monthly_revenue_range`
- `average_ticket_range`
- `chargeback_rate_range`
- `churn_rate_range`
- `traffic_plan_range`
- `growth_goal`
- `platform_hints`
- `provider_hints`
- `conversion_model`

([packages/domain/workspace.ts#L42](../packages/domain/workspace.ts#L42))

Mas o onboarding atual captura apenas uma fração disso e sem mapear para esse contrato.

### Diagnóstico do onboarding

- Real hoje: somente a UX do wizard.
- Falta: persistência, criação de tenant/workspace/environment, ingestão inicial, business profile real, audit cycle, status, retomada de activation.
- Reestruturação necessária: alta. O wizard atual não deve ser “endurecido”; deve ser transformado em activation flow real orientado a entidade e processo.

## 4. Stack and runtime architecture

### Framework web e router

- Framework: Next.js 15 App Router ([package.json#L34](../package.json#L34), [src/app](../src/app))
- React: 19 ([package.json#L43](../package.json#L43))
- Router: filesystem routing de `src/app`

### ORM / banco

- ORM: Prisma 5 ([package.json#L25](../package.json#L25), [package.json#L42](../package.json#L42))
- Banco: PostgreSQL ([prisma/schema.prisma#L1](../prisma/schema.prisma#L1))

Observação importante: só existe `prisma/schema.prisma`. Não há pasta `prisma/migrations`, seed script nem comandos de migrate/db push em `package.json` ([package.json#L8](../package.json#L8)).

### Auth provider

- `next-auth` com `PrismaAdapter` ([src/libs/auth.ts#L21](../src/libs/auth.ts#L21))
- Providers:
  - credentials
  - impersonate
  - fetchSession
  - email magic link
  - GitHub
  - Google

([src/libs/auth.ts#L31](../src/libs/auth.ts#L31))

### Billing provider

O projeto suporta três billing providers no mesmo código:

- Stripe
- Lemon Squeezy
- Paddle

E todos atualizam campos no `User` (`customerId`, `subscriptionId`, `priceId`, `currentPeriodEnd`) em vez de entidade de billing por workspace ([prisma/schema.prisma#L59](../prisma/schema.prisma#L59)).

### State / data fetching

No console novo:

- `useState`, `useMemo`, `useSearchParams`
- sem React Query / SWR
- sem cache layer explícita
- sem fetching real

No shell legado/site:

- `SessionProvider` e `ThemeProvider` existem em [src/app/(site)/providers.tsx](../src/app/(site)/providers.tsx)

O console novo não usa esse provider tree.

### Design system / UI libs

- Tailwind CSS ([package.json#L73](../package.json#L73))
- componentes próprios
- `@xyflow/react` para mapas ([package.json#L26](../package.json#L26))
- `apexcharts` também instalado, mas não é o centro do console novo

### Test runner

Não há runner unificado configurado em `package.json`.

Os testes são scripts TypeScript executados diretamente com `tsx`, conforme comentários dos próprios arquivos, por exemplo [tests/verification.test.ts#L6](../tests/verification.test.ts#L6).

Isso implica:

- há suíte de engine razoável
- não há integração automatizada clara em CI pelo `package.json`
- não há testes de App Router/UI

### MCP client/server integration shape

A shape é clara e útil:

- `src/lib/mcp-client.ts` encapsula o uso do MCP na UI.
- `apps/mcp/server.ts` é a porta única do engine.
- `apps/mcp/context.ts` monta contexto chamando `recomputeAll`.
- `apps/mcp/tools.ts` expõe tools de summary, projections, maps, answers e verification.

Mas a integração ainda é:

- in-process
- síncrona para a maior parte das consultas
- não inicializada por nenhum boot de contexto visível na UI

### Workers / background execution shape

Há dois grupos de workers locais:

- ingestão HTTP estática: [workers/ingestion](../workers/ingestion)
- verificação/recompute: [workers/verification](../workers/verification)

Hoje isso não é um worker plane real. É biblioteca executável dentro do mesmo runtime Node. Não há:

- fila
- scheduler
- retry externo
- persistência de job
- processo separado obrigatório

### Deployment assumptions implícitas

O projeto assume um deploy de app monolítico Next.js:

- `dev`: `next dev --turbopack`
- `build`: `prisma generate && next build`
- `start`: `next start`

([package.json#L8](../package.json#L8))

Não há Dockerfile, compose, Procfile, queue infra nem worker commands.

## 5. Tenancy / RBAC / ownership assessment

### Existe Organization?

Não no banco real.

Também não encontrei contrato de `Organization` em `packages/domain`. O conceito mais próximo no domínio é `tenant_id` dentro de `Workspace` ([packages/domain/workspace.ts#L8](../packages/domain/workspace.ts#L8)).

### Existe Workspace?

- No domínio TypeScript: sim.
- No banco Prisma: não.
- Na UI: sim, mas como projeção analítica/demo.

Existem dois significados diferentes de workspace hoje:

1. `Workspace` como boundary analítico/tenant conceitual em `packages/domain/workspace.ts`.
2. “Workspaces” como views analíticas (`preflight`, `revenue`, `chargeback`) em `src/app/(console)/workspaces/page.tsx`.

Isso já é uma fonte de ambiguidade arquitetural.

### Existe Membership?

Não.

Não há tabela, interface ou política visível de membership user<->workspace.

### Como roles são modelados?

Roles são modelados apenas como `role: String?` em `User` e `Invitation`, com uso prático de `ADMIN` e `USER` ([prisma/schema.prisma#L47](../prisma/schema.prisma#L47), [prisma/schema.prisma#L59](../prisma/schema.prisma#L59)).

### Roles são por usuário ou por workspace?

Por usuário, globalmente.

O middleware também só conhece `ADMIN` e `USER` globais ([src/middleware.ts#L7](../src/middleware.ts#L7)).

Isso é insuficiente para a visão Vestigio porque impede:

- ownership por workspace
- admin de um workspace sem admin global
- operador/read-only/reviewer por ambiente
- RBAC por escopo

### Billing está ligado a user ou workspace?

Ao usuário.

Campos de billing estão diretamente em `User`:

- `customerId`
- `subscriptionId`
- `priceId`
- `currentPeriodEnd`

([prisma/schema.prisma#L69](../prisma/schema.prisma#L69))

Para um control plane workspace-centric isso está errado estruturalmente.

### Existe environment registry?

- No domínio analítico: sim, como contrato.
- Na persistência: não.
- Na UI: não.

`McpRequestScope` e `Scoping` exigem `environment_ref` ([apps/mcp/types.ts](../apps/mcp/types.ts), [apps/mcp/context.ts#L49](../apps/mcp/context.ts#L49)), mas não há tabela real para registrar ambientes.

### Existe distinção entre produção/staging?

Somente conceitual.

- `Environment` possui `environment_type` e `is_production` no domínio ([packages/domain/workspace.ts#L20](../packages/domain/workspace.ts#L20)).
- `McpServer` também tem `default_is_production` no config ([apps/mcp/server.ts#L27](../apps/mcp/server.ts#L27)).

Mas isso não está persistido nem exposto no shell.

### O que existe, o que não existe, o que está errado

Existe:

- role global `ADMIN|USER`
- convite com role global
- contratos de workspace/environment/business profile no domínio
- scoping analítico com `workspace_ref` e `environment_ref`

Não existe:

- organization
- membership
- workspace persistido
- environment persistido
- role por workspace
- role por environment
- ownership model
- audit ownership

Está errado para a visão Vestigio:

- billing no usuário
- authz centrada em `/admin` vs `/user`
- ausência total de tenant persistence
- conflito semântico entre “workspace” analítico e “workspace” de tenancy

## 6. Persistence / setup assessment

### Schema principal

O schema Prisma atual é de boilerplate SaaS/auth:

- `User`
- `Account`
- `Session`
- `ApiKey`
- `Invitation`
- `VerificationToken`

([prisma/schema.prisma](../prisma/schema.prisma))

### Entidades relevantes persistidas hoje

Persistidas:

- usuário
- sessão/auth providers
- convites
- API keys
- billing do usuário

Não persistidas:

- evidence
- signals
- inferences
- decisions
- actions
- workspaces analíticos
- business profile
- workspace tenant
- environment
- audit cycle
- verification requests/results

### O que ainda é in-memory

Muito do que importa para o control plane:

- `EvidenceStore` é in-memory no `McpServer` ([apps/mcp/server.ts#L41](../apps/mcp/server.ts#L41))
- `VerificationOrchestrator` guarda requests/runs/results em `Map` in-memory ([workers/verification/orchestrator.ts](../workers/verification/orchestrator.ts))
- `McpSessionContext` é in-memory ([apps/mcp/server.ts#L48](../apps/mcp/server.ts#L48))
- context analítico é remontado em memória via `assembleContext`/`recomputeAll` ([apps/mcp/context.ts#L40](../apps/mcp/context.ts#L40))

Isso inviabiliza robustez multiusuário, retomada de estado e operação real.

### Como o setup inicial do banco funciona

O código pressupõe Prisma Client gerado no build ([package.json#L10](../package.json#L10)), mas não há instrução explícita no repositório sobre:

- `prisma migrate deploy`
- `prisma migrate dev`
- `prisma db push`
- seed

Nem há pasta de migrations.

Diagnóstico: o bootstrap do banco está subespecificado no repositório.

### Env vars obrigatórias aparentes

Para local mínimo do app:

- `DATABASE_URL`
- `SECRET`
- `NEXTAUTH_URL`
- `SITE_URL`
- `SITE_NAME`

Prováveis para auth completa:

- `EMAIL_SERVER_*` e `EMAIL_FROM` se usar magic link/invite/reset
- `GOOGLE_CLIENT_ID/SECRET`
- `GITHUB_CLIENT_ID/SECRET`

Para features opcionais:

- Stripe/Paddle/Lemon
- Sanity
- Mailchimp
- Algolia
- R2
- OpenAI

Referência base: [/.env.example](../.env.example)

### O que é necessário para rodar localmente

No mínimo:

- Node/npm
- Postgres acessível por `DATABASE_URL`
- Prisma client gerado
- `SECRET`
- `NEXTAUTH_URL`
- algum conjunto mínimo de variáveis de site

Se não usar email/social/billing, parte das features do boilerplate ficará quebrada ou inacessível.

### O que é necessário para staging

Além do local:

- strategy explícita de migração Prisma
- secrets de auth
- URL pública consistente para callbacks
- definição clara de quais integrações ficam ligadas
- banco persistente

### O que é necessário para um go-live básico

Ainda falta antes mesmo da infra:

- persistência de tenancy/workspace/environment
- persistência de audit state/evidence/verifications
- activation flow real
- wiring do console ao MCP
- authz do console

## 7. Deployment / environment assessment

### Serviços/processos existentes

De forma prática, hoje existe um único serviço executável claro: o app Next.js.

O resto é biblioteca interna:

- MCP server
- ingestion worker
- verification worker

### O que precisa rodar junto

Para o app atual:

- Next.js app
- Postgres

Opcionalmente, dependendo das features ligadas:

- Stripe webhook listener em dev
- provedores externos de billing/auth/email

### O que pode rodar separado

Conceitualmente, no futuro:

- MCP server
- ingestion
- verification

Hoje, porém, tudo está desenhado para rodar in-process, não como deployment separado.

### MCP está in-process ou já separável?

Hoje está in-process. Isso é explícito em [src/lib/mcp-client.ts#L23](../src/lib/mcp-client.ts#L23).

Ele é separável arquiteturalmente por design de interface, mas não operacionalmente pronto:

- não há transporte HTTP/stdio
- não há bootstrap externo
- não há contrato de autenticação entre UI e MCP
- não há persistência compartilhada do contexto

### Workers precisam de processo próprio?

Hoje não precisam para o código funcionar, porque são chamados como bibliotecas.

Mas para produção séria, o verification path e futuras coletas provavelmente precisarão de processo próprio ou job system. No estado atual, não existe esse plano operacional implementado.

### Há sinais de que o app assume ambiente único?

Sim.

Sinais principais:

- ausência de entities reais de environment
- ausência de selector de environment na UI
- ausência de config/env registry persistido
- middleware baseado apenas em `/admin` e `/user`
- billing e ownership atrelados ao usuário

Embora o engine aceite `environment_ref`, o produto rodável ainda assume implicitamente um ambiente único por usuário/aplicação.

### Existe configuração por env?

Existe configuração por variável de ambiente de infraestrutura/integrations, mas não existe configuração de environments de produto/tenant.

### Como eu subiria isso hoje

Hoje eu subiria assim, como demo técnica:

1. Provisionar Postgres.
2. Definir `.env` mínimo.
3. Garantir schema Prisma aplicado manualmente.
4. Rodar `npm run build`.
5. Rodar `npm start`.

Isso sobe a aplicação monolítica. Não sobe um control plane operacionalizado.

### Principais riscos de deploy

- console novo sem auth gate próprio
- console novo sem dados reais
- MCP sem contexto carregado pela UI
- verificação browser/integration indisponível
- estado analítico in-memory
- sem tenancy persistida
- sem migrations explícitas

### O que falta antes de chamar de deployável

Para demo interna: pouco.

Para deploy sério: muito.

No mínimo:

- persistência do core control-plane
- wiring do shell ao runtime real
- hardening de authz
- activation flow funcional
- estratégia de migração e operação

## 8. Critical gaps

### Critical now

- Não existe modelo persistido de `Workspace`, `Environment`, `Membership` ou ownership no banco ([prisma/schema.prisma](../prisma/schema.prisma), [packages/domain/workspace.ts](../packages/domain/workspace.ts)).
- O shell novo não está protegido pelo middleware; o matcher cobre apenas `/user/*` e `/admin/*` ([src/middleware.ts#L32](../src/middleware.ts#L32)).
- O console usa dados demo em quase todas as páginas e não está ligado ao MCP real ([src/app/(console)/analysis/page.tsx#L13](../src/app/(console)/analysis/page.tsx#L13), [src/app/(console)/chat/page.tsx#L99](../src/app/(console)/chat/page.tsx#L99)).
- O onboarding não persiste nada e não dispara ingestão nem criação de entidade ([src/app/(console)/onboard/page.tsx](../src/app/(console)/onboard/page.tsx)).
- Billing está ligado ao usuário e não ao workspace ([prisma/schema.prisma#L69](../prisma/schema.prisma#L69)).
- `browser_verification` e `integration_pull` são stubs ([workers/verification/executors.ts#L185](../workers/verification/executors.ts#L185), [workers/verification/executors.ts#L207](../workers/verification/executors.ts#L207)).

### Important next

- Separar semanticamente workspace de tenancy vs workspace analítico.
- Persistir evidence/audit/verifications ou ao menos o lifecycle mínimo.
- Definir bootstrap real do MCP context a partir de dados persistidos.
- Introduzir selector de workspace/environment no shell.
- Revisar API key generation: hoje a “key” é hash do `user.role`, não um segredo aleatório ([src/actions/api-key.ts#L23](../src/actions/api-key.ts#L23)).
- Formalizar migrações Prisma e setup reprodutível.

### Later

- Separar MCP em processo próprio.
- Introduzir queue/worker infra.
- Expandir verification para browser real e pulls de integração.
- Consolidar ou remover o dashboard legado `/admin`/`/user`.

## 9. Recommended next phase

### A. O shell atual está bom o suficiente para ser endurecido, ou precisa de reestruturação antes?

Precisa de reestruturação antes de hardening sério.

Não precisa ser jogado fora. A base visual e a taxonomia estão boas. Mas endurecer o shell atual sem antes conectá-lo ao runtime real vai endurecer placeholder.

Minha leitura:

- preservar layout, navegação e componentes
- reestruturar o shell em torno de entidades reais: workspace, environment, activation state, audit cycle
- só depois fazer hardening

### B. O onboarding atual serve como base real para um activation flow, ou é só um esqueleto visual?

É só um esqueleto visual.

Serve como referência de ordem de perguntas, não como base operacional.

### C. Quais são os passos concretos necessários antes de eu tentar um deploy sério?

1. Definir e persistir o modelo control-plane real: workspace, environment, membership, business profile, activation state, audit cycle.
2. Decidir o boundary entre shell/control-plane e engine analítico, inclusive o significado oficial de “workspace”.
3. Conectar onboarding à criação dessas entidades e ao primeiro ciclo de ingestão.
4. Conectar o console ao MCP/contexto real, removendo datasets demo.
5. Endurecer auth/authz do console novo com escopo por workspace.
6. Definir estratégia de banco e migrations reprodutíveis.
7. Só então preparar deploy/ops do monólito ou separação em serviços.

### D. Qual é a melhor ordem?

Minha recomendação de ordem é:

1. `activation flow`
2. `control plane hardening`
3. `browser verification`
4. `collection evolution`
5. `go-live`

Justificativa:

- Sem activation flow real, não há entidade nem contexto confiável para o control plane endurecer.
- Sem control plane endurecido e ligado ao runtime, browser verification vira feature isolada.
- `browser verification` hoje é stub, então deve entrar depois do modelo operacional básico.
- `collection evolution` faz mais sentido quando tenancy/environment e activation estiverem fechados.
- `go-live` deve ser o último, não o próximo.

## 10. What still requires human product decision

Algumas decisões ainda não podem ser inferidas com precisão só pelo código:

- Qual é a definição oficial de “workspace” no produto: tenant/account, pack analítico, domínio monitorado ou container operacional?
- Existe uma `Organization` acima de `Workspace`, ou `Workspace` será a unidade comercial e de billing?
- O billing deve ser por workspace, por environment monitorado, por volume de audits ou por usuário seat-based?
- O activation flow deve exigir apenas um domínio inicial ou já múltiplos environments no primeiro setup?
- O pixel é opcional para todo cliente ou obrigatório para determinados tipos de business/conversion model?
- O shell legado `/admin` e `/user` será mantido em paralelo, migrado ou removido?
- O MCP continuará in-process no go-live inicial ou já precisa nascer como serviço separado?
- Browser verification entra como capability premium, background job, ou passo obrigatório de activation?

Sem essas decisões, dá para avançar no diagnóstico técnico, mas não fechar corretamente o modelo final de tenancy, billing e rollout.
