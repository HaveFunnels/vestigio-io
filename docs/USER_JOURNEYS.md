# User Journeys — Launch Readiness Audit

> Last updated: 2026-04-14
> Companion to: [ARCHITECTURE_V2.md](ARCHITECTURE_V2.md), [ROADMAP.md](ROADMAP.md), [DEPLOY.md](DEPLOY.md)

## Purpose

Este documento descreve as **jornadas de usuário reais** — não o que está planejado, mas o que está **escrito em código hoje** — com distinção explícita entre:

- **WORKS** — caminho crítico traçado linha-a-linha, dependências óbvias satisfeitas
- **PARTIAL** — funciona até certo ponto, mas falha silenciosamente ou depende de etapa manual
- **BROKEN** — UI/API existe mas caminho crítico tem defeito que impede o fluxo acabar
- **STUB** — código presente, chamado em lugar nenhum, ou retorna no-op
- **MISSING** — jornada mencionada em produto/marketing mas sem implementação

Cada seção tem **file:line references** para verificação. Nada aqui é speculation — é leitura de código.

---

## TL;DR — Launch readiness

| Jornada | Estado | Blocker para launch? |
|---------|--------|----------------------|
| Self-serve signup (Stripe) | **WORKS** | Não |
| Self-serve signup (Paddle) | **BROKEN** | **SIM** — se Paddle é primário |
| /lp lead funnel | **PARTIAL** | SIM se Paddle for caminho de conversão |
| Login (email+senha, OAuth, magic link) | **WORKS** | Não |
| Admin provisioning | **WORKS** | Não |
| Impersonation | **WORKS** (com gaps de UX) | Não |
| Owner onboarding → activation | **WORKS** | Não |
| First audit cycle + SSE banner | **WORKS** | Não |
| Continuous audits (hot/warm/cold) | **WORKS** se worker deployado | **SIM** — worker não está no Railway config |
| Inactivity pause + email | **PARTIAL** — pausa funciona, email não | Não (mas UX quebrada) |
| Auto-resume após acesso | **WORKS** | Não |
| Pixel → behavioral findings | **WORKS** | Não |
| Shopify integration | **WORKS** | Não |
| Nuvemshop integration | **WORKS** | Não |
| Stripe como revenue source | **NÃO É FEATURE** — comunicar | Não |
| MCP chat end-to-end | **WORKS** | Não |
| Verification on demand | **WORKS** em runtime, **PERDIDO** em restart | Não (mas fragiliza UX) |
| Actions surface + verify/resolve | **WORKS** (mesma ressalva) | Não |
| Workspaces / Analysis / Maps / Inventory | **WORKS** | Não |
| Knowledge base (160 foundation articles) | **WORKS** | Não |
| Notificações (email/WhatsApp) | **MIXED** — infra existe, dispatcher de NotificationLog não | Não |

**Blockers críticos para launch** (ordenados):

1. **Paddle checkout client-side quebrado** (`src/paddle/paddleLoader.tsx:31,44`) — bloqueia o funil Paddle primário e a monetização /lp. Se decidir ir Stripe-only, não é blocker.
2. **Worker não configurado no Railway** (`Dockerfile:89` roda web, não há serviço separado para `npm run start:worker`) — sem isso, cycles são enfileirados mas ninguém drena, audits contínuos efetivamente não rodam.
3. **Notification dispatcher não existe** — `NotificationLog` é escrito em pausa por inatividade e outros eventos, mas nenhum cron/job lê e envia email. Emails são silenciosamente dropados.

Tudo mais é operacionalmente OK.

---

## 1. Self-serve signup → Stripe → first audit — **WORKS**

**Jornada:** visitor → `/auth/signup` → email+senha → `/onboarding` → Stripe Checkout → webhook → Org+Env criados → primeiro audit dispara.

**Happy path file-by-file:**

- Signup form: `src/components/Auth/SignupWithPassword.tsx:82-86` → `POST /api/user/register` (`src/app/api/user/register/route.ts:56-60`) — cria User com bcrypt hash.
- Login pós-signup: NextAuth CredentialsProvider (`src/libs/auth.ts:68-111`) com rate-limit (5 tentativas em 15min, linhas 23-48).
- Onboarding form: coleta BusinessType, domain, landingUrl, revenue, AOV, SaaS access. `POST /api/onboard` (`src/app/api/onboard/route.ts:82-124`) cria Organization (status=pending) + Environment + BusinessProfile.
- Checkout Stripe: linhas 134-144 criam sessão com `metadata: { onboarding: 'true', organizationId, userId }`.
- Webhook Stripe (`src/app/api/stripe/webhook/route.ts:36-145`): em `checkout.session.completed`, ativa org, cria Membership, cria primeiro `AuditCycle` + enfileira via `enqueueAuditCycle()` com fallback in-process (linhas 108-143).
- JWT: o login seguinte popula `hasOrganization=true` e, após `/environments/activate`, `hasActivatedEnv=true` (`src/libs/auth.ts:244-263`).
- Middleware (`src/middleware.ts:144-158`) libera `/app/*`.

**Config obrigatório:**
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- `SECRET` (NextAuth), `NEXTAUTH_URL`
- `DATABASE_URL`, `REDIS_URL` (opcional mas recomendado)
- SMTP ou `BREVO_API_KEY` (para password reset, magic link)

---

## 2. Self-serve signup → Paddle → first audit — **BROKEN**

**Blocker identificado:** o cliente Paddle no browser está quebrado em dois pontos.

**Onde quebra:**

- `src/paddle/paddleLoader.tsx:31` hardcoda `window?.Paddle?.Environment.set("sandbox")` — produção nunca é inicializada.
- `src/paddle/paddleLoader.tsx:44`: em `checkout.completed`, chama `signIn("fetchSession", ...)`. Esse provider foi **removido intencionalmente** como vulnerabilidade de segurança — ver comentário em `src/libs/auth.ts:162` *"fetchSession provider REMOVED — was a security vulnerability"*. Chamada silenciosamente falha; usuário vê toast genérico mas sessão nunca é criada.

**O que FUNCIONA no lado Paddle:**

- Webhook handler (`src/app/api/paddle/webhook/route.ts`) é sólido: cobre `subscription.created/updated/canceled/paused/resumed/past_due/activated/trialing`, `transaction.completed/payment_failed/updated`, `customer.*`, `adjustment.*`. HMAC verification ativo (linhas 18-35). Chama `resolvePlanFromPriceId()` e atualiza `Organization.plan/status`. Cria AuditCycle + enfileira (linhas 489-515).
- O problema é que o **cliente nunca chega ao webhook** — `Paddle.Checkout.open()` nunca dispara corretamente porque o loader está quebrado.

**Config que precisaria ser setada mesmo depois do fix:**
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`
- `NEXT_PUBLIC_PADDLE_ENV=production` (e paddleLoader tem que ler esse env, hoje ignora)
- `NEXT_PUBLIC_PADDLE_VESTIGIO_PRICE_ID` / `NEXT_PUBLIC_PADDLE_LP_PRICE_ID`
- `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`

**Fix necessário:**
1. Trocar `Environment.set("sandbox")` por `Environment.set(process.env.NEXT_PUBLIC_PADDLE_ENV || "sandbox")`.
2. Substituir `signIn("fetchSession")` por outra estratégia de post-checkout redirect (ex.: webhook cria user + magic link via Brevo + redireciona para `/auth/check-email`).

---

## 3. /lp lead funnel → paid conversion — **PARTIAL**

**Jornada:** visitor → `/lp/audit` → 4-step form → mini-audit dispara → `/lp/audit/result/[leadId]` → "Unlock full audit" → Paddle checkout → webhook promove lead a Org real → magic link por email.

**O que FUNCIONA:**

- Form + anti-bot: `src/app/(site)/lp/audit/page.tsx` (4 steps: nome/domínio/revenue, email, phone, confirmation). Honeypot + behavioral scoring + HMAC form token em `src/app/api/lead/[id]/step/[n]/route.ts:104-132`.
- Lead creation: `POST /api/lead/start` (`src/app/api/lead/start/route.ts:60-70`) cria `AnonymousLead` status=draft com `expiresAt` a 14d.
- Mini-audit: `apps/audit-runner/run-mini-audit.ts:37-207` — pipeline shallow (1 fetch, 5s budget), cacheado 14d por domain hash.
- Result page: `src/app/(site)/lp/audit/result/[leadId]/page.tsx` faz polling a cada 3s em `/api/lead/[leadId]`, renderiza 5 findings visíveis + 10 blurred.
- Lead promotion: `apps/audit-runner/promote-lead.ts:79-297` — on Paddle webhook com `custom_data.leadId`, cria User + Organization + Environment + BusinessProfile + envia magic link + cria primeiro AuditCycle. Marca lead como `converted`. **Lógica é sólida e completa.**

**O que QUEBRA:**

- **Mesmo defeito de paddleLoader** — o botão "Unlock full audit" abre `Paddle.Checkout.open()` mas o cliente Paddle está em sandbox e signIn pós-checkout está morto (ver seção 2).
- **Stripe não tem equivalente /lp** — o webhook Stripe só cobre `/onboard` com `metadata.organizationId` pré-criado. Não há path para lead → Stripe checkout.
- **Cleanup de leads stale:** leads têm `expiresAt` mas **não há cron** lendo esse campo + marcando `status=expired` ou deletando. Tabela cresce indefinidamente.
- **Phone field é coletado mas não usado:** `promote-lead.ts:209-230` cria notification prefs mas nenhum SMS é enviado. Brevo suporta SMS, integração não é chamada.

**Para ir live com /lp:** ou consertar Paddle checkout (seção 2), ou adicionar path Stripe para LP.

---

## 4. Login — **WORKS**

**Jornada:** `/auth/signin` → email+senha ou OAuth ou magic link → JWT com claims → middleware libera rotas.

**O que FUNCIONA:**

- Email+senha: `src/libs/auth.ts:68-111` — CredentialsProvider com bcrypt + rate-limit (5 tentativas/15min em `authRateLimiter`, linhas 23-48).
- OAuth: Google/GitHub/Apple carregados condicionalmente se env vars presentes (linhas 202-221).
- Magic link (EmailProvider): linhas 165-200, envia via Brevo se `BREVO_API_KEY` setado, senão SMTP.
- Forgot password: `POST /api/forgot-password/reset` (linhas 38-49) minta token 10min; `POST /api/forgot-password/verify-token` (linhas 18-32) valida.
- Session: JWT 12h (linhas 60-64). Callback popula `hasOrganization`, `hasActivatedEnv`, `role`, `isImpersonating` (linhas 234-297).
- Middleware (`src/middleware.ts:144-158`): `needsOnboarding = hasOrganization === false || hasActivatedEnv === false` — redireciona para `/app/onboarding` quando shell.

**Gap conhecido (não-blocker):**

- **Signup via magic link não existe.** EmailProvider só funciona para login de usuários existentes. User novo recebendo magic link vê callback silenciosamente falhar (proteção contra enumeration). Todo signup passa por password-based form.

**Config:**
- `SECRET`, `NEXTAUTH_URL` — obrigatório.
- `EMAIL_SERVER_*` ou `BREVO_API_KEY` — para magic link + password reset.
- `GOOGLE_CLIENT_ID/SECRET` etc — opcional por provider.

---

## 5. Admin provisioning → impersonate → activate — **WORKS** (gaps de UX)

**Jornada:** admin loga → `/app/admin/organizations/new` → cria Org shell → impersona → completa onboarding como owner → clica "Activate environment" → primeiro cycle dispara.

**O que FUNCIONA:**

- Admin role check (`src/app/api/admin/organizations/route.ts:16-17`): `session.user.role === "ADMIN"` em todos endpoints admin.
- Org creation (linhas 136-289): Organization + owner User (password=null) + Membership em transação atômica. Plan validado contra `PlatformConfig`. Audit log escrito (linhas 291-309).
- Provisioned mode (linhas 261-285): se domain passado, cria Environment + BusinessProfile inline. `activated=false` até owner ativar explicitamente (protege contra audits admin-triggered).
- Form UI: `src/app/app/admin/organizations/new/page.tsx` — submit + success screen com botão "Sign in as owner".
- PATCH (`src/app/api/admin/organizations/[id]/route.ts:175-323`): atualiza plan/status/orgType/trialEndsAt com before/after em audit log.
- Impersonation (`src/libs/auth.ts:114-160`): provider próprio valida senha admin, troca sessão para owner. Token carrega `isImpersonating=true` (linhas 280, 308).
- **Activity suppression durante impersonate:** `src/app/app/layout.tsx:48,53-57` pula `touchEnvActivity` + `resumeIfPaused` quando `isImpersonating === true` — não reseta relógio de inatividade do owner.
- Audit log em impersonate: `src/app/api/admin/impersonate/route.ts:45-56`.

**Gaps de UX (não-blocker, mas vale documentar):**

- **Owner criado com `password=null`.** Nenhum email automático é enviado. Admin tem que passar impersonate OU dizer ao customer "use forgot password com seu email".
- **Sem botão "Stop impersonating"** na UI. Admin tem que dar logout inteiro e logar de novo como admin.
- **Sem banner visual indicando impersonation.** Flag existe na session mas nenhum componente consome.

---

## 6. Owner onboarding + "Activate environment" + first cycle + SSE — **WORKS**

**Jornada:** owner (self-serve ou impersonated) → `/app/onboarding` → wizard passa BusinessProfile → "Activate environment" → primeiro cycle enfileirado → SSE banner mostra progresso.

**O que FUNCIONA:**

- `src/app/app/onboarding/page.tsx:97-114`: `getSteps()` pula steps `org` e `plan` quando `hasActiveOrg=true` (admin-provisioned). Checa JWT `hasActivatedEnv` para rota correta.
- Wizard captura: business type, domain, landing URL, monthly revenue, AOV, conversion model, SaaS access, phone, notification channels.
- Domain validation: `/api/validate-domain` (non-blocking, só warn).
- `POST /api/environments/activate` (`src/app/api/environments/activate/route.ts:70-263`):
  - Cria ou reusa Environment (idempotente — re-ativação limpa `continuousPaused`).
  - Upsert BusinessProfile + SaasAccessConfig.
  - `activated=true`.
  - Cria `AuditCycle` (status=pending, cycleType=full).
  - **Dispatch:** `enqueueAuditCycle()` com fallback `import('./run-cycle').then(m => m.runAuditCycle(cycle.id))` (linhas 227-235).
  - Bump `org.status` pending → active se necessário.
  - Retorna `redirectTo: "/app/inventory"`.
- SSE stream (`src/app/api/cycles/[id]/stream/route.ts:44-245`): poll a cada 2s, emite `status` + `complete`/`error`, heartbeat 15s, 10min guardrail. Valida membership no org do cycle.
- Latest discovery (`src/app/api/cycles/latest/route.ts:21-105`): honra cookie `active_env`.
- Banner (`src/components/app/CycleProgressBanner.tsx:43-171`): EventSource, render progresso, `router.refresh()` no complete.

**Fragilidades:**

- Dispatch é fire-and-forget. Se `enqueueAuditCycle()` retornar false (Redis down) e o `runAuditCycle` via `.then()` falhar mid-execution, heal cron (60s) recolhe depois de ~10min. Fallback existe mas testou sob restart?
- Banner não reconecta se EventSource drop mid-stream. Usuário vê banner sumir sem saber se cycle continuou.

---

## 7. Continuous audits (hot/warm/cold por plano) — **WORKS SE WORKER DEPLOYADO** ⚠

**Jornada:** cada hora, scheduler enumera envs → resolve due cycleType por plano → enfileira → worker drena.

**Verdict: código 100% pronto, deployment 0% pronto para produção.**

**O que FUNCIONA no código:**

- Scheduler cron registrado em `src/instrumentation-node.ts:285-304` sob leader key `"audit-scheduler"` com intervalo 1h.
- `runSchedulerPass()` (`apps/audit-runner/scheduler.ts:134-229`): filtro correto `activated=true AND continuousPaused=false AND org.status != suspended` (linhas 149-152). Demo orgs incluídos.
- `PLAN_CADENCE` (`src/libs/plan-config.ts:54-70`):
  - `vestigio` (Starter): cold 7d, sem hot/warm.
  - `pro`: hot 1h, warm 4h, cold 3d.
  - `max`: hot 15min, warm 1h, cold 1d.
- `resolveDueCycleType` (scheduler.ts:50-117): skip se in-flight, groupBy + `_max: completedAt` eficiente, legacy `full` trata como cold, priority cold > warm > hot.
- Queue (`apps/platform/audit-cycle-queue.ts:95-127`): RPUSH por tier, metadata hash, lock por env via `SET NX EX` (TTL 15min), DLQ após 3 falhas.
- Worker (`apps/audit-runner/worker-loop.ts:194-285`): LPOP em ordem de priority, attempts separado do dequeue (fix C3), SIGTERM graceful com lock cleanup.
- Run-cycle branching (`apps/audit-runner/run-cycle.ts:107-693`): `pipelineMode='full'` cold / `'shallow_plus'` hot+warm, `url_filter` intersect, `cycleBudgetMs` por mode, `carry-forward` apenas fora do allow-list (fix #2), first-cycle fallback cold quando sem anterior (fix #3, linhas 207-219).
- Staged pipeline respeita `url_filter` (`workers/ingestion/staged-pipeline.ts:347-349`) com canon antes do intersect.
- Stage D gated: `workers/ingestion/enrichment/selective-headless.ts:59-68` só dispara em `mode='full'` — browser verification é cold-only.
- Findings + CycleSnapshot persistidos (`run-cycle.ts:594,605-616`).
- Usage meter escreve tabela `Usage` no finally{} (`src/libs/usage-meter.ts:51-85`).
- `GET /api/admin/metrics/audit-runner` retorna queue depth + cycles-by-status + p50/p95 + DLQ + top orgs.

**O que QUEBRA em deploy:**

- **`Dockerfile:89` tem `CMD ["node", "server.js"]`** — roda só o web server.
- **`nixpacks.toml:11`** `[start] cmd` idem.
- **Não há definição de segundo serviço Railway** rodando `npm run start:worker`.
- Consequência: scheduler enfileira cycles no Redis, mas ninguém drena. Queue cresce. Audits **não rodam** exceto quando caem no fallback in-process durante dispatch de webhook/activation — e mesmo aí rodam no processo web.

**Gotchas adicionais:**

- **Instrumentation hook só boota com `NEXT_RUNTIME === 'nodejs'`** (`src/instrumentation.ts:25`). Se Railway Next.js edge runtime estiver ativo no web process, cron nunca sobe.
- **`initRedis()` falha silenciosa** (`src/instrumentation-node.ts:59-62`): se Redis falhar ao conectar, `getRedis()` retorna null, `enqueueAuditCycle()` retorna false, scheduler cai em fallback in-process → cycles rodam no web process, bloqueando requests HTTP.

**Para launch:**

1. Confirmar `REDIS_URL` está setado e `[Redis] Connected` aparece nos logs de boot.
2. Adicionar segundo serviço Railway:
   - **Source**: mesmo repo.
   - **Custom Start Command**: `npx prisma db push --skip-generate && npm run start:worker`.
   - **Env**: mesmos `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, etc.
   - **Memory**: 512MB+ (Chromium pool usa ~300MB por instance × 3 = 900MB).
3. Smoke test: criar env Pro → aguardar 1h → verificar `redis-cli LLEN vestigio:auditq:priority:hot` cresce → verificar `AuditCycle.status` transiciona pending → running → complete → `Finding` table popula.

Ver [DEPLOY.md § 15.3.1](DEPLOY.md).

---

## 8. Inactivity pause → email → resume — **PARTIAL**

**Jornada:** env sem acesso 14d → cron pausa → email deveria avisar owner → owner volta → `resumeIfPaused` enfileira catch-up cycle.

**O que FUNCIONA:**

- Pause cron em `src/instrumentation-node.ts:189-274`: hourly, leader-elected, filtra `activated=true, continuousPaused=false, orgType in (customer,trial)` (excludes demo), `lastAccessedAt < now - 14d`, seta `continuousPaused=true`.
- Cria `NotificationLog` row com `event='inactivity_pause'`, `status='skipped'` (linhas 249-258).
- Resume (`src/libs/env-activity.ts:69-153`): atomic `updateMany` com `where: { continuousPaused: true }` para evitar double-resume race (linhas 89-97). Checa pending/running cycles antes de criar novo (linhas 105-114). Enfileira catch-up.
- Touch (`src/libs/env-activity.ts:36-58`): 1h-debounced, chamado do layout (`src/app/app/layout.tsx:55-56`), pulado quando impersonating.
- Banner amarelo pause: `src/components/app/AppSidebarLayout.tsx` scopado ao env atual via `orgCtx.envId` (fix #13).

**O que QUEBRA:**

- **Notification dispatcher não existe.** NotificationLog é escrito mas **nenhum cron/job lê e despacha email**. Comentário em `src/instrumentation-node.ts:247` declara *"dispatcher reads from it"* — esse dispatcher não está implementado. Owner nunca é avisado.
- **Toast de resume não é mostrado.** `resumeIfPaused()` retorna `boolean` indicando se reativou, mas `src/app/app/layout.tsx:55-56` ignora o return value. Owner volta, vê página normal, não sabe que catch-up cycle está rodando.

**Para consertar email de inatividade:**
- Adicionar cron em `src/instrumentation-node.ts` que lê `NotificationLog` status=skipped de `inactivity_pause` event + chama `notifyOrganization()` (função existe em `src/libs/notifications.ts` com Brevo+Nodemailer) + marca row como `sent`.
- Dispositivos similares provavelmente existem para outros eventos (pause, incidents) — mesma ausência de dispatcher pode afetar mais notificações. **Ver seção 16**.

---

## 9. Pixel install → behavioral data → findings — **WORKS**

**Jornada:** owner copia snippet de `/app/settings/data-sources` → cola no site → browser events POST → RawBehavioralEvent persiste → processor aggrega em sessions+cohorts → evidence → findings.

**O que FUNCIONA:**

- Snippet: `public/snippet/vestigio.js` é código de produção real (~10.5KB). Envia batches de eventos (page_view, route_change, cta_click, scroll_depth, confirmation_seen).
- Install UI: `src/app/app/settings/data-sources/page.tsx:359` — card com copy-paste.
- Ingest endpoint (`src/app/api/behavioral/ingest/route.ts:146-149`): CORS headers, rate limit via IP hash (600/min), sanitizer (drop unknown types / oversized / clock-skewed), persiste em `RawBehavioralEvent` (dual content-type: sendBeacon `text/plain` + fetch `application/json`).
- Processing (`apps/audit-runner/process-behavioral.ts:94-98`): lê eventos agrupados por `(envId, sessionId)`, roda `aggregateSession()` por sessão, reduz N sessões em dois payloads: `BehavioralSessionPayload` (env-level) e `BehavioralCohortPayload` (device splits) — linha 224.
- Wrap como evidence (`process-behavioral.ts:577` via `wrapAsEvidence(payload, scoping, cycleRef, windowHours)`) — windowHours vem do `CYCLE_MODE_CONFIG` (hot=1h, warm=24h, cold=30d).
- Feed ao engine (`apps/audit-runner/run-cycle.ts:432-463`): evidence entra no `recomputeAll()`.
- Behavioral workspaces (`packages/classification/eligibility.ts`): ativados quando `session_count >= 20`.
- Prune: cron deleta `RawBehavioralEvent` > 30d.

**Realidade prática:** customer instala snippet → primeiros eventos chegam em segundos → primeiro hot cycle após instalação gera behavioral evidence → findings comportamentais aparecem. **Sem dependência de OAuth/API key.**

**Gotcha:** os 7 behavioral workspaces ficam com `pixel_status !== active` até atingir o threshold de 20 sessions. UX mostra card locked que linka para data-sources — funciona, mas customer novo pode achar que está quebrado antes de acumular sessions.

---

## 10. Shopify integration — **WORKS**

**Jornada:** owner vai em `/app/settings/data-sources` → "Connect Shopify" → insere store URL + access token → verificação API → próximo cycle puxa orders/customers/products → signals entram em findings.

**O que FUNCIONA:**

- Adapter (`packages/shopify-adapter/`): `client.ts`, `aggregator.ts`, `mapper.ts`, `snapshot-mapper.ts`.
- Poller (`workers/shopify/poller.ts:81-221`): fetch orders, checkouts, customers, products, inventory em janela de 90d. Retorna `ShopifyPollResult` com métricas + `BusinessInputs` + error handling + adaptive backoff.
- Connection UI (`src/app/app/settings/data-sources/page.tsx:207-267`): form "Connect Shopify".
- Connection API (`src/app/api/integrations/route.ts:194-195`): verifica credenciais via API test call (`shop.json`).
- Credenciais armazenadas criptografadas: linha 171 `encryptConfig()`.
- Chamado do cycle (`apps/audit-runner/run-cycle.ts:480-510`): lê `IntegrationConnection where provider='shopify'`, decripta, chama `pollShopifyData()`, mapeia para `IntegrationSnapshot<'shopify'>`.
- Reconcile com outras fontes (`packages/integrations/reconcile.ts:78` `reconcileBusinessInputs`).
- Alimenta `recomputeAll()` em `run-cycle.ts:595`.

**Estado:** customer conecta Shopify → no próximo cycle, métricas comerciais reais (monthly_revenue, AOV, abandonment_rate, refund_rate, repeat_rate) entram no engine → findings de revenue e chargeback usam dados reais.

**Config:** Shopify access token (custom app ou OAuth) + store URL.

---

## 11. Nuvemshop integration — **WORKS**

Estrutura espelha Shopify. Adapter em `packages/nuvemshop-adapter/`, poller em `workers/nuvemshop/poller.ts`, UI em `src/app/app/settings/data-sources/page.tsx:269-356`. Mesmo flow de reconciliação em `reconcileBusinessInputs`.

**Config:** Nuvemshop store ID + access token.

---

## 12. Stripe como revenue source — **NÃO É FEATURE**

**Clareza necessária para comunicação:**

Stripe tem DOIS papéis no produto:

1. **Billing (nós → customer):** usamos Stripe para cobrar a assinatura Vestigio. Funciona — ver seção 1. `src/stripe/`, `src/app/api/stripe/webhook/route.ts`.
2. **Revenue data source (customer → nós):** **não existe.** Nenhum poller/adapter que lê Stripe do customer para alimentar findings de revenue. UI `src/app/app/settings/data-sources/page.tsx:390-397` mostra card Stripe como `status: "not_configured"`, `configurable: false` — é grayed out por design.

Se customer perguntar "vocês integram com Stripe?", a resposta honesta é: **"para billing sim, para revenue intelligence ainda não — hoje fontes de revenue são Shopify e Nuvemshop"**.

---

## 13. MCP chat end-to-end — **WORKS**

**Jornada:** `/app/chat` → pergunta → MCP pipeline → Anthropic API → tools executam → response streamed → findings/actions renderizados inline.

**O que FUNCIONA:**

- UI (`src/app/app/chat/page.tsx`): React chat com SSE streaming.
- API (`src/app/api/chat/route.ts:37-320`): auth + budget check (linhas 38-171) → `executePipeline()` com `mcpServer` (linha 317).
- Pipeline LLM (`apps/mcp/llm/pipeline.ts:81-200+`): `callModel()` para Anthropic.
- Cliente SDK (`apps/mcp/llm/client.ts:13-22`): `new Anthropic({ apiKey })` real.
- Tools (`apps/mcp/tools.ts` via `server.callTool()`): `get_finding_projections`, `get_action_projections`, `get_workspaces`, etc — todos retornam dados reais do engine/projections.
- Resources (`apps/mcp/resources.ts`): read-models.
- Playbooks (`apps/mcp/playbooks.ts` + `playbook-prompts.ts`): triggers por contexto.
- Suggestion engine (`apps/mcp/suggestion-engine-v2.ts`): emite sugestões.
- Session (`apps/mcp/session.ts` + Prisma `Conversation`): persistência real.
- KB resolution: `$$KB{finding:KEY}$$` markers resolvidos server-side (`src/app/api/chat/route.ts:378-400`).
- Usage tracking: `apps/mcp/usage.ts` + token ledger em `apps/platform/token-ledger.ts`.
- Rate limiter: `apps/mcp/llm/rate-limiter.ts` Redis-backed.

**Config:**
- `ANTHROPIC_API_KEY` (sem isso, chat retorna 503 "Chat not configured" — `src/app/api/chat/route.ts:83`).
- `VESTIGIO_LLM_ENABLED=true`.

**Realidade:** customer abre `/app/chat`, pergunta "quais os maiores vazamentos de revenue no meu checkout?", recebe resposta LLM-powered grounded em evidence real do cycle mais recente. Chat é produção, não demo.

---

## 14. Verification on demand — **WORKS AT RUNTIME, LOST ON RESTART** ⚠

**Jornada:** chat ou drawer de Action pede "re-verify" → `verification_request` dispara → orquestrador roda Playwright → resultado atualiza finding.

**O que FUNCIONA em runtime:**

- Trigger do chat (`src/app/api/chat/route.ts:193-227`): cria verification request + roteia para orchestrator.
- API dedicada (`src/app/api/verification/run/route.ts:44-244`): valida + chama `server.verify()` → `VerificationOrchestrator` → Playwright probe real via `workers/verification/playwright-runtime.ts` (sob chromium pool).
- Re-compute após: novas evidences geradas → finding projection atualizada.

**O que QUEBRA:**

- **Nenhuma tabela `VerificationRequest` no Prisma schema.** Estado do orquestrador é in-memory only (`apps/mcp/server.ts:58,128`).
- Em restart do worker/web process, **todas verificações em andamento são perdidas silenciosamente**. Customer clica "Re-verify", servidor reinicia, UI volta sem feedback.
- Comentário flag em `src/app/api/verification/run/route.ts:33` reconhece isso como gap.

**Impacto UX:** fragiliza mas não bloqueia. Verificações são rápidas (< 2min típico) e re-clicks são idempotentes. Em launch isso vai gerar ocasionalmente tickets de suporte "apertei re-verify e não aconteceu nada" após deploys.

**Fix futuro:** Prisma model `VerificationRequest` (status pending/running/complete/failed, payload, result), persist no início da orchestration em `server.verify()`, restore no boot.

---

## 15. Actions / Workspaces / Analysis / Maps / Inventory / KB — **WORKS**

### Actions
- `src/app/app/actions/page.tsx:139-283`: lista real de `ActionProjection[]` via MCP `get_action_projections`.
- Derivação: `packages/actions/deriver.ts:18-75` produz primary/secondary/verification actions a partir de decisions.
- Drawer com evidence + reasoning.
- "Re-verify" + "Confirm resolution" botões: `runVerification()` (linhas 235-282) POSTa `/api/verification/run` com toast + `router.refresh()`. **Funciona com a ressalva da seção 14.**
- Sort por `priority_score` (linha 366 da page).

### Workspaces
- `src/app/app/workspaces/page.tsx:39-146`: renderiza real `WorkspaceProjection[]`.
- Core packs (revenue, chargeback, security, readiness, brand/fraud): populam com dados reais.
- 7 behavioral workspaces: renderizam SEMPRE (mesmo sem pixel), mas locked via `pixel_status !== "active"` (linha 189 opacity-50, linha 185 routing para data-sources).
- Pulse Summary: **existe** em `/src/app/api/workspace/pulse-summary/` (contrário ao que um audit inicial sugeriu). LLM-powered briefing com 1h cache.
- Perspective detail: `/app/workspaces/perspective/[slug]` wired.

### Analysis
- `src/app/app/analysis/page.tsx:110-165`: progressive SSE stream de `/api/analysis/stream`.
- Filtros severity/pack/polarity/impact range funcionais.
- `change_class` badges (`new_issue | regression | improvement | resolved`) populados pelo engine via `packages/change-detection/engine.ts`.
- `confidence_tier: low|medium|high` — low filtrado fora do projection (Wave 2.4), sem confidence numérico na UI.
- Verification vocabulary: `static_evidence | confirming | confirmed` (Wave 2.4 rename via `migrateLegacyVerificationMaturity()`).

### Maps
- `src/app/app/maps/page.tsx:1-156`: ReactFlow custom nodes (RootCauseNode, FindingNode, ActionNode).
- Driven by `packages/maps/engine.ts` a partir de inferences reais.

### Inventory
- `src/app/app/inventory/page.tsx`: lista real `InventorySurface[]` com filtros type/HTTP status/response time.
- Session count populado do behavioral cohort (null até pixel).
- "Mark as critical" sidedrawer: implementado (não deferido como sugeria roadmap).

### Knowledge base
- 160 foundation articles **são reais**: `packages/knowledge/foundation-articles.ts` gera programaticamente a partir de `INFERENCE_TITLES` + `ROOT_CAUSE_TITLES` + translations + guides.
- Sanity override layer: hand-authored article com matching key vence o foundation.
- Learn-more cards em finding + action drawers + `$$KB{finding:KEY}$$` em chat — todos resolvem via Sanity primeiro, foundation como fallback.

---

## 16. Notificações (email + WhatsApp) — **MIXED**

**Mapeamento real:**

| Canal/Evento | Funciona? |
|--------------|-----------|
| Magic link login (Brevo/SMTP) | **WORKS** (`src/libs/auth.ts:165-200`) |
| Password reset email | **WORKS** (`src/app/api/forgot-password/*`) |
| Lead promotion magic link | **WORKS** (`apps/audit-runner/promote-lead.ts`) |
| Incident notification (audit-runner) | **WORKS** — `triggerIncidentNotifications` chamado em `run-cycle.ts:620-627`, usa `src/libs/notifications.ts` (Brevo/Nodemailer) |
| Inactivity pause email | **BROKEN** — `NotificationLog` escrito, nenhum dispatcher lê |
| WhatsApp outbound templates | **WORKS** (`src/libs/whatsapp-meta.ts`, `src/libs/whatsapp-templates.ts`) |
| WhatsApp inbound webhook | **WORKS** (`src/app/api/whatsapp/webhook/route.ts`) |
| Notification preferences UI | **WORKS** (capturado em onboarding) |
| Generic `NotificationLog` dispatcher | **MISSING** — sem cron lendo `status=skipped` |

**Gap crítico:** há um padrão de escrita em `NotificationLog` para vários eventos esperando um dispatcher central. Esse dispatcher nunca foi escrito. Eventos que usam chamada direta (`notifyOrganization` inline) funcionam; eventos que só escrevem log (`inactivity_pause`) são dropados.

**Config:**
- `BREVO_API_KEY` preferível, senão `EMAIL_SERVER_*`.
- `META_SYSTEM_USER_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`, `META_WEBHOOK_VERIFY_TOKEN` para WhatsApp.

---

## 17. Admin surfaces — **WORKS**

- `/app/admin/organizations` — lista + detalhe + new.
- `/app/admin/users` — CRUD.
- `/app/admin/metrics` — consome `/api/admin/metrics/*`.
- `/app/admin/surface-scans` — roda prospect scans (`apps/audit-runner/run-prospect-scan.ts`).
- `/app/admin/platform-config` — edita `PlatformConfig`.
- `/app/admin/whatsapp` — templates.
- `/app/admin/feedback`, `/app/admin/support-tickets` — real.
- Impersonation via `/api/admin/impersonate` (ver seção 5).

**Todas as telas consultam dados reais.** Único gap é a ausência de UI para stop-impersonate (seção 5).

---

## 18. Dead code / featureless listings

Items que aparecem no repo mas não são features vivas:

- **LemonSqueezy** (`src/app/api/lemon-squeezy/`): handlers existem, nunca referenciados em `integrations.config.tsx`, sem UI. Artefato histórico — **remover**.
- **`apps/platform/audit-scheduler.ts`**: scheduler in-memory legacy, não tem consumidor vivo. Scheduler canônico é `apps/audit-runner/scheduler.ts`. Deprecar ou deletar.
- **Katana + Nuclei binários em PATH**: `workers/katana/runner.ts` e `workers/nuclei/runner.ts` spawnam subprocess — **em produção Railway sem esses binários instalados, enrichment skippa silenciosamente**. Enrichment é opcional, mas se é parte do pitch comercial "deep crawl + security scan", precisa entrar no Dockerfile.

---

## Critical blockers for launch day — ordenados

### BLOCKER 1: Worker não deployado no Railway
**Impact:** audits contínuos não rodam. Custom de Pro paga mas só recebe o cycle inicial de activation. Depois, nada.
**Fix:** adicionar segundo Railway service com `Custom Start Command: npm run start:worker` (seção 7).

### BLOCKER 2 (se Paddle for primário): Paddle checkout quebrado
**Impact:** customer clica "Assinar Pro" → nada acontece → nunca vira subscription. /lp funnel idem.
**Fix:** arrumar `src/paddle/paddleLoader.tsx:31,44` (seção 2).
**Alternativa:** declarar Stripe-only no launch e esconder/desabilitar Paddle. Webhook Paddle continua instalado para o dia que consertar.

### BLOCKER 3 (UX): NotificationLog dispatcher missing
**Impact:** inactivity pause silencioso, outros eventos que esperam dispatcher também silenciosos.
**Fix:** cron em `src/instrumentation-node.ts` que lê `NotificationLog` status=skipped + chama `notifyOrganization()` + marca sent.

### Pós-launch (não bloqueia):
- Persistence de `VerificationRequest` (seção 14) — evita UX estranha em restart.
- Banner stop-impersonate (seção 5).
- Katana/Nuclei binaries no Dockerfile (se enrichment faz parte do pitch).
- Lead expiration cron (seção 3).

---

## Config summary (env vars obrigatórias para launch)

### Sempre obrigatórias
- `DATABASE_URL` — Postgres (Railway).
- `REDIS_URL` — Upstash/Railway Redis. Sem isso, queue + leader election + rate-limit caem em fallback in-memory (single-replica only).
- `SECRET`, `NEXTAUTH_URL` — NextAuth.
- `ANTHROPIC_API_KEY` — sem isso, MCP chat retorna 503.
- `VESTIGIO_LLM_ENABLED=true`.

### Billing (Stripe se for primário, Paddle se for — ou ambos)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Stripe checkout + webhook.
- `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `NEXT_PUBLIC_PADDLE_ENV=production`, `NEXT_PUBLIC_PADDLE_VESTIGIO_PRICE_ID`, `NEXT_PUBLIC_PADDLE_LP_PRICE_ID` — Paddle (depois que consertar loader).

### Email
- `BREVO_API_KEY` (preferível) ou `EMAIL_SERVER_HOST/PORT/USER/PASSWORD` + `EMAIL_FROM` — magic link, password reset, incident notifications, lead magic link.

### Workers
- `CHROMIUM_POOL_SIZE=3` (default) — cap RAM.
- `AUDIT_WORKER_CONCURRENCY=2` (default).
- `WORKER_HEALTH_PORT=3001` (default).

### OAuth (opcional)
- `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_ID/SECRET`, `APPLE_*`.

### WhatsApp (opcional)
- `META_SYSTEM_USER_TOKEN`, `META_PHONE_NUMBER_ID`, `META_WABA_ID`, `META_WEBHOOK_VERIFY_TOKEN`.

### Knowledge base (opcional — fallback para foundation articles se ausente)
- `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_API_TOKEN`.

---

## How to smoke-test launch readiness

```
1. Deploy web + worker em Railway (2 services).
2. Verificar logs de boot:
   - Web: "[Redis] Connected" ou warning de fallback.
   - Worker: "[audit-worker] health server listening on :3001".
3. Criar customer test:
   - Via /app/admin/organizations/new (shell, plan=Pro, orgType=customer).
   - Impersonar.
   - Completar onboarding → Activate environment.
4. Verificar:
   - `AuditCycle` criado com status=pending → running → complete em < 5min.
   - SSE banner aparece e some no complete.
   - Findings aparecem em /app/analysis.
   - Workspaces em /app/workspaces.
5. Esperar 1h (ou manipular `lastCompleted` no DB para forçar due):
   - Scheduler deve enfileirar hot cycle.
   - Worker deve dequeue + rodar.
   - Novo Finding delta aparece com change_class correto.
6. Testar pixel: instalar snippet em domínio real, gerar ~25 sessions, rodar cold cycle, verificar behavioral workspace sai do locked state.
7. Testar MCP chat: perguntar sobre findings, receber resposta LLM real.
8. Testar Shopify: conectar store de dev, verificar no próximo cycle que commerce signals aparecem.
9. Testar billing: completar Stripe checkout, ver Org.plan atualizar via webhook.
10. (Pós-fix) testar Paddle checkout end-to-end.
```

Se tudo isso passa, está pronto para receber customers pagantes.
