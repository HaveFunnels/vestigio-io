# Deploy — Vestigio no Railway

Guia completo para publicar o Vestigio.io no Railway com PostgreSQL, do zero ao app rodando em producao.

---

## Indice

1. [Pre-requisitos](#1-pre-requisitos)
2. [Preparar o repositorio GitHub](#2-preparar-o-repositorio-github)
3. [Criar projeto no Railway](#3-criar-projeto-no-railway)
4. [Provisionar PostgreSQL](#4-provisionar-postgresql)
5. [Configurar variaveis de ambiente](#5-configurar-variaveis-de-ambiente)
6. [Configurar build e deploy](#6-configurar-build-e-deploy)
7. [Criar tabelas e seed](#7-criar-tabelas-e-seed)
8. [Configurar planos e precos (admin)](#8-configurar-planos-e-precos-admin)
9. [Configurar dominio customizado](#9-configurar-dominio-customizado)
10. [Configurar Paddle (principal)](#10-configurar-paddle-principal)
11. [Configurar Stripe (fallback)](#11-configurar-stripe-fallback)
12. [Configurar OAuth (Google/GitHub)](#12-configurar-oauth-googlegithub)
13. [Configurar email (SMTP)](#13-configurar-email-smtp)
14. [Validacao pos-deploy](#14-validacao-pos-deploy)
15. [Escalabilidade e producao](#15-escalabilidade-e-producao)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Pre-requisitos

- Conta no [Railway](https://railway.app) (plano Hobby $5/mes ou superior)
- Conta no [GitHub](https://github.com)
- [Railway CLI](https://docs.railway.app/guides/cli) instalado (opcional, mas recomendado)
- Conta no [Paddle](https://www.paddle.com) (sandbox ou live)
- Chave da [Anthropic API](https://console.anthropic.com) (para MCP Chat)
- Credenciais SMTP para envio de email (ex: Resend, Mailgun, SendGrid)
- Node.js >= 18.18.0 instalado localmente

```bash
# Instalar Railway CLI (macOS)
brew install railway

# Ou via npm
npm install -g @railway/cli

# Login
railway login
```

---

## 2. Preparar o repositorio GitHub

### 2.1. Remover package-lock.json do .gitignore

O `.gitignore` atual ignora `package-lock.json`. O Railway **precisa** desse arquivo para fazer builds reproduziveis com `npm ci`.

Edite `.gitignore` e **remova** estas duas linhas:

```diff
- package-lock.json
- yarn.lock
```

### 2.2. Gerar o lock file

```bash
cd /caminho/para/Vestigio.io

# Gerar package-lock.json
npm install
```

### 2.3. Inicializar o repositorio e fazer push

```bash
# Inicializar git (se ainda nao existe)
git init
git branch -M main

# Criar repositorio no GitHub (via CLI)
gh repo create vestigio-io --private --source=. --remote=origin

# Commit inicial
git add .
git commit -m "Initial commit — Vestigio"

# Push
git push -u origin main
```

---

## 3. Criar projeto no Railway

### Via Dashboard (recomendado para primeira vez)

1. Acesse [railway.app/new](https://railway.app/new)
2. Clique **"Deploy from GitHub repo"**
3. Conecte sua conta GitHub se ainda nao conectou
4. Selecione o repositorio `vestigio-io`
5. Railway vai detectar automaticamente que e um projeto Node.js
6. **NAO faca deploy ainda** — primeiro configure o banco e as variaveis

### Via CLI

```bash
railway init
railway link
```

---

## 4. Provisionar PostgreSQL

### Via Dashboard

1. No projeto Railway, clique **"+ New"** > **"Database"** > **"Add PostgreSQL"**
2. Railway cria automaticamente uma instancia PostgreSQL
3. A variavel `DATABASE_URL` sera injetada automaticamente no servico

### Via CLI

```bash
railway add --plugin postgresql
```

> **Importante**: O Railway injeta `DATABASE_URL` automaticamente quando o PostgreSQL esta no mesmo projeto. Voce **nao precisa** configurar essa variavel manualmente.

---

## 5. Configurar variaveis de ambiente

No Railway Dashboard, va no servico da aplicacao (nao no PostgreSQL) > aba **Variables**.

### 5.1. Gerar chaves secretas

Execute localmente:

```bash
# Gerar SECRET (NextAuth)
openssl rand -base64 32

# Gerar VESTIGIO_SECRET_KEY (AES-256 para encriptacao de credenciais SaaS)
openssl rand -hex 32
```

### 5.2. Variaveis obrigatorias

| Variavel | Valor | Notas |
|----------|-------|-------|
| `DATABASE_URL` | *(automatica)* | Injetada pelo Railway ao adicionar PostgreSQL |
| `SECRET` | `resultado do openssl rand -base64 32` | Chave do NextAuth |
| `NEXTAUTH_URL` | `https://SEU_DOMINIO.up.railway.app` | URL publica do app |
| `SITE_URL` | `https://SEU_DOMINIO.up.railway.app` | Mesmo valor do NEXTAUTH_URL |
| `NODE_ENV` | `production` | Ativa validacoes de producao |
| `VESTIGIO_SECRET_KEY` | `resultado do openssl rand -hex 32` | Encriptacao AES-256 |

#### Paddle (pagamento principal)

| Variavel | Valor | Notas |
|----------|-------|-------|
| `PADDLE_API_KEY` | `pdl_...` | API key do [Paddle Dashboard](https://vendors.paddle.com) > Developer Tools > Authentication |
| `PADDLE_WEBHOOK_SECRET` | `pdl_ntfset_...` | Secret do webhook (configurar na etapa 10) |
| `NEXT_PUBLIC_PADDLE_API_URL` | `https://api.paddle.com` | Use `https://sandbox-api.paddle.com` para testes |
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | `test_...` ou `live_...` | Client token do Paddle Dashboard |

#### Anthropic (MCP Chat / IA)

| Variavel | Valor | Notas |
|----------|-------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Chave da [console.anthropic.com](https://console.anthropic.com) |
| `VESTIGIO_LLM_ENABLED` | `true` | Habilita o chat com IA. Sem isso, chat retorna 503. |

#### Email (SMTP)

| Variavel | Valor | Notas |
|----------|-------|-------|
| `EMAIL_SERVER_HOST` | `smtp.resend.com` | Seu provedor SMTP |
| `EMAIL_SERVER_PORT` | `587` | Porta SMTP (587 para TLS) |
| `EMAIL_SERVER_USER` | *(seu usuario SMTP)* | |
| `EMAIL_SERVER_PASSWORD` | *(sua senha SMTP)* | |
| `EMAIL_FROM` | `noreply@seudominio.com` | Remetente dos emails |

#### Admin

| Variavel | Valor | Notas |
|----------|-------|-------|
| `ADMIN_EMAILS` | `seu@email.com` | Email do admin (recebe role ADMIN no registro) |

### 5.3. Variaveis opcionais

```bash
# Stripe (fallback — se quiser manter como opcao)
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# OAuth (omitir desativa login social)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# AI legado (OpenAI, usado apenas para gerar conteudo marketing)
OPENAI_API_KEY=sk-...

# Storage (Cloudflare R2)
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ACCOUNT_ID=
NEXT_PUBLIC_IMAGE_URL=

# CMS (Sanity)
NEXT_PUBLIC_SANITY_PROJECT_ID=
NEXT_PUBLIC_SANITY_PROJECT_TITLE=
SANITY_API_KEY=
SANITY_HOOK_SECRET=
```

### 5.4. Adicionar variaveis via CLI

```bash
railway variables set SECRET="SUA_CHAVE"
railway variables set VESTIGIO_SECRET_KEY="SUA_CHAVE"
railway variables set NEXTAUTH_URL="https://seuapp.up.railway.app"
railway variables set SITE_URL="https://seuapp.up.railway.app"
railway variables set NODE_ENV="production"
railway variables set PADDLE_API_KEY="pdl_..."
railway variables set PADDLE_WEBHOOK_SECRET="pdl_ntfset_..."
railway variables set NEXT_PUBLIC_PADDLE_API_URL="https://sandbox-api.paddle.com"
railway variables set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN="test_..."
railway variables set ANTHROPIC_API_KEY="sk-ant-..."
railway variables set VESTIGIO_LLM_ENABLED="true"
railway variables set EMAIL_SERVER_HOST="smtp.resend.com"
railway variables set EMAIL_SERVER_PORT="587"
railway variables set EMAIL_SERVER_USER="resend"
railway variables set EMAIL_SERVER_PASSWORD="re_SUA_API_KEY"
railway variables set EMAIL_FROM="noreply@seudominio.com"
railway variables set ADMIN_EMAILS="seu@email.com"
```

---

## 6. Configurar build e deploy

### 6.1. nixpacks.toml

O arquivo `nixpacks.toml` na raiz do projeto ja existe. Verifique que contem:

```toml
[phases.setup]
nixPkgs = ["nodejs_18", "npm-9_x"]

[phases.install]
cmds = ["npm ci"]

[phases.build]
cmds = ["npx prisma generate", "npm run build"]

[start]
cmd = "npx prisma db push --skip-generate && npm run start"
```

> **Por que `db push`?** O projeto e greenfield — sem historico de migrations. `db push` aplica o schema direto no banco. E idempotente: se o schema ja estiver aplicado, nao faz nada.

### 6.2. Health check

Adicione no Railway: **Settings** > **Healthcheck Path**: `/api/auth/session`

---

## 7. Criar tabelas e seed

### 7.1. Primeiro deploy — schema aplicado automaticamente

O start command (`npx prisma db push --skip-generate`) cria todas as tabelas no primeiro deploy. Nos deploys seguintes, aplica apenas diferencas.

### 7.2. Rodar seed (uma vez, apos primeiro deploy)

```bash
railway run npx tsx prisma/seed.ts
```

O seed cria:
- **Usuario admin** (se `ADMIN_EMAILS` estiver configurado)
- **Configuracoes da plataforma** (PlatformConfig com limites de plano)
- **Conta demo** populada com dados realistas:
  - Login: `demo@vestigio.io` / `demo1234`
  - Organizacao "Acme Store" (plano Pro, ecommerce)
  - Paginas crawleadas, ciclo de auditoria, relacoes entre paginas

### 7.3. Verificar banco

```bash
railway run npx prisma studio
```

---

## 8. Configurar planos e precos (admin)

Apos o primeiro deploy e seed, acesse o painel admin para configurar os planos:

1. Faca login com o email configurado em `ADMIN_EMAILS`
2. Acesse `/app/admin/pricing`
3. Configure para cada plano (Vestigio, Pro, Max):
   - **Preco** ($/mes)
   - **MCP Calls/mo** (limite de queries de chat)
   - **Environments** (limite de dominios)
   - **Members** (limite de membros)
   - **Continuous Audits** (on/off)
   - **Credits** (on/off)
4. Na secao **Payment Provider Price IDs**, insira:
   - **Paddle Price ID**: `pri_...` (do Paddle Dashboard > Catalog > Prices)
   - **Stripe Price ID**: `price_...` (opcional, se usar Stripe como fallback)
   - **Lemon Squeezy ID**: (opcional)
5. Clique **Save Configuration**

> **Importante**: Sem os Paddle Price IDs configurados aqui, o checkout do onboarding nao vai funcionar. Os IDs vem do Paddle Dashboard > Catalog > Products > Prices.

---

## 9. Configurar dominio customizado

### 9.1. Dominio gerado pelo Railway

Apos o primeiro deploy, ative em **Service** > **Settings** > **Networking** > **Generate Domain**.

### 9.2. Dominio customizado

1. **Service** > **Settings** > **Networking** > **Custom Domain**
2. Adicione seu dominio (ex: `app.vestigio.io`)
3. Configure no seu provedor DNS:

```
CNAME  app  →  vestigio-io-production-XXXX.up.railway.app
```

4. Railway provisiona SSL automaticamente (Let's Encrypt)

### 9.3. Atualizar variaveis apos dominio

```bash
railway variables set NEXTAUTH_URL="https://app.vestigio.io"
railway variables set SITE_URL="https://app.vestigio.io"
```

> **Critico**: Se `NEXTAUTH_URL` nao bater com a URL real, o login vai falhar.

---

## 10. Configurar Paddle (principal)

### 10.1. Criar produtos no Paddle

1. Acesse [Paddle Dashboard](https://vendors.paddle.com) > **Catalog** > **Products**
2. Crie 3 produtos: Vestigio, Vestigio Pro, Vestigio Max
3. Para cada produto, crie um **Price** (subscription, mensal)
4. Anote os **Price IDs** (`pri_...`) — voce vai inseri-los na tela `/app/admin/pricing`

### 10.2. Criar webhook no Paddle

1. Paddle Dashboard > **Developer Tools** > **Notifications**
2. Clique **"New destination"**
3. URL: `https://SEU_DOMINIO/api/paddle/webhook`
4. Selecione os eventos:
   - `transaction.completed`
   - `subscription.created`
   - `subscription.updated`
   - `subscription.canceled`
5. Copie o **Webhook Secret** (`pdl_ntfset_...`)
6. Configure no Railway:

```bash
railway variables set PADDLE_WEBHOOK_SECRET="pdl_ntfset_..."
```

### 10.3. Configurar Client Token

1. Paddle Dashboard > **Developer Tools** > **Authentication**
2. Copie o **Client-side token**
3. Configure no Railway:

```bash
railway variables set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN="test_..."
```

### 10.4. Testar checkout

1. Registre uma nova conta no app
2. Complete o onboarding (org + dominio + business context)
3. Na tela de planos, clique "Activate"
4. O checkout do Paddle deve abrir como overlay
5. Use cartao de teste do Paddle sandbox: `4242 4242 4242 4242`
6. Apos pagamento, a org deve ser ativada automaticamente via webhook

---

## 11. Configurar Stripe (fallback)

Se quiser manter Stripe como opcao (o sistema suporta ambos):

### 11.1. Webhook

1. [dashboard.stripe.com/webhooks](https://dashboard.stripe.com/webhooks) > **"Add endpoint"**
2. URL: `https://SEU_DOMINIO/api/stripe/webhook`
3. Eventos: `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.updated`
4. Copie o Signing Secret (`whsec_...`)

```bash
railway variables set STRIPE_SECRET_KEY="sk_..."
railway variables set STRIPE_WEBHOOK_SECRET="whsec_..."
```

### 11.2. Price IDs

Insira os Stripe Price IDs na tela `/app/admin/pricing` na coluna "Stripe Price ID".

> **Nota**: O onboarding usa Paddle por padrao. Para usar Stripe, o fluxo do onboarding precisa enviar `paymentProvider: "stripe"` (requer mudanca no frontend).

---

## 12. Configurar OAuth (Google/GitHub)

### Google OAuth

1. [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
2. Crie um **OAuth 2.0 Client ID** (tipo: Web Application)
3. Authorized redirect URI: `https://SEU_DOMINIO/api/auth/callback/google`

```bash
railway variables set GOOGLE_CLIENT_ID="..."
railway variables set GOOGLE_CLIENT_SECRET="..."
```

### GitHub OAuth

1. [github.com/settings/developers](https://github.com/settings/developers)
2. Crie um **OAuth App**
3. Authorization callback URL: `https://SEU_DOMINIO/api/auth/callback/github`

```bash
railway variables set GITHUB_CLIENT_ID="..."
railway variables set GITHUB_CLIENT_SECRET="..."
```

---

## 13. Configurar email (SMTP)

| Provedor | HOST | PORT | Notas |
|----------|------|------|-------|
| **Resend** | `smtp.resend.com` | `587` | Recomendado, tier gratuito generoso |
| **SendGrid** | `smtp.sendgrid.net` | `587` | Alternativa popular |
| **Mailgun** | `smtp.mailgun.org` | `587` | Bom para volume |
| **Amazon SES** | `email-smtp.REGIAO.amazonaws.com` | `587` | Barato para alto volume |

```bash
railway variables set EMAIL_SERVER_HOST="smtp.resend.com"
railway variables set EMAIL_SERVER_PORT="587"
railway variables set EMAIL_SERVER_USER="resend"
railway variables set EMAIL_SERVER_PASSWORD="re_SUA_API_KEY"
railway variables set EMAIL_FROM="noreply@seudominio.com"
```

O email e usado para: magic link login, convites de equipe, reset de senha.

---

## 14. Validacao pos-deploy

### Checklist completo

```bash
# 1. Logs de startup
railway logs
# Procure por:
#   Ready on http://0.0.0.0:PORT
# Se houver erros, verifique variaveis de ambiente

# 2. App responde
curl -I https://SEU_DOMINIO
# HTTP 200

# 3. NextAuth funciona
curl https://SEU_DOMINIO/api/auth/session
# Retorna {} (sessao vazia, nao erro)

# 4. Banco OK
railway run npx prisma studio
```

### Testes manuais — jornada completa do usuario

- [ ] Acessar pagina inicial carrega sem erros
- [ ] Registrar novo usuario via email/senha
- [ ] Login redireciona para `/app/onboarding` (usuario novo, sem org)
- [ ] Onboarding: preencher nome, dominio (validacao DNS funciona), business context
- [ ] Onboarding: selecionar plano, checkout Paddle abre
- [ ] Pagamento com cartao de teste funciona
- [ ] Apos pagamento, org e ativada (redirect para `/app/analysis`)
- [ ] Login subsequente vai direto para `/app/analysis` (nao onboarding)
- [ ] Pagina de Analysis mostra findings apos rodar scan
- [ ] Inventory mostra paginas descobertas
- [ ] Chat com IA funciona (mensagem → resposta streaming)
- [ ] Maps carrega com visualizacao interativa
- [ ] Organization page mostra dados reais
- [ ] Magic link login funciona (email chega, link redireciona)

### Testes admin

- [ ] Login com email de `ADMIN_EMAILS` vai para `/app/admin/overview`
- [ ] Admin > Pricing mostra planos configurados
- [ ] Admin > Organizations lista organizacoes reais
- [ ] Admin > Environments lista dominios reais

---

## 15. Escalabilidade e producao

### 15.1. Escalar o servico

No Railway: **Service** > **Settings** > **Scaling**:

- **Replicas**: Comece com 1
- **Memory**: 1GB recomendado (Next.js + Prisma)
- **vCPU**: 1 para comecar

> **Multiplas replicas**: A fila de jobs e em memoria. Com mais de 1 replica, migre para Redis.

### 15.2. Escalar PostgreSQL

- Ative **connection pooling** com mais de 1 replica
- Railway Pro inclui backups automaticos

### 15.3. Redis (quando escalar)

```bash
railway add --plugin redis
```

Use para: fila de jobs distribuida, cache de sessoes, rate limiting distribuido.

### 15.4. Monitoramento

- **Railway Metrics**: CPU, memoria, rede
- **Erros**: O Vestigio persiste erros na tabela `PlatformError` — acesse via `/app/admin/errors`
- **Usage**: `/app/admin/usage-billing` mostra metricas de uso por org
- **Logs**: `railway logs --tail`

### 15.5. Backups

```bash
pg_dump "DATABASE_URL_PUBLICA" > backup_$(date +%Y%m%d).sql
```

### 15.6. CI/CD

Railway faz deploy automatico a cada push na branch `main`. Configure em **Settings** > **Build & Deploy**.

---

## 16. Troubleshooting

### Build falha com "npm ci" error

```bash
# Gerar package-lock.json e commitar
npm install
git add package-lock.json
git commit -m "Add package-lock.json"
git push
```

### Login nao funciona / loop de redirect

**Causa**: `NEXTAUTH_URL` nao bate com a URL real.

```bash
railway variables set NEXTAUTH_URL="https://URL_CORRETA"
```

### Chat retorna 503 "Chat not configured"

**Causa**: Faltam variaveis da Anthropic.

```bash
railway variables set ANTHROPIC_API_KEY="sk-ant-..."
railway variables set VESTIGIO_LLM_ENABLED="true"
```

### Checkout do Paddle nao abre

**Causa**: Price IDs nao configurados.

1. Verifique que `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` esta configurado
2. Acesse `/app/admin/pricing` e insira os Paddle Price IDs
3. Verifique o console do browser para erros do Paddle.js

### Onboarding nao redireciona apos pagamento

**Causa**: Webhook do Paddle nao esta configurado ou nao esta recebendo eventos.

1. Verifique no Paddle Dashboard > Developer Tools > Notifications > Logs
2. Confirme que a URL do webhook esta correta: `https://SEU_DOMINIO/api/paddle/webhook`
3. Confirme que `PADDLE_WEBHOOK_SECRET` esta configurado no Railway

### `db push` falha no deploy

```bash
# Ver o que vai ser aplicado
railway run npx prisma db push --accept-data-loss
```

### Memoria alta / OOM Kill

```bash
# Limitar heap do Node.js
railway variables set NODE_OPTIONS="--max-old-space-size=768"
```

### Playwright nao funciona

Adicione ao `nixpacks.toml`:

```toml
[phases.setup]
nixPkgs = ["nodejs_18", "npm-9_x", "chromium", "nss", "freetype", "harfbuzz", "ca-certificates", "fonts-liberation"]
aptPkgs = ["libnss3", "libatk-bridge2.0-0", "libdrm2", "libxkbcommon0", "libgbm1"]
```

```bash
railway variables set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/usr/bin/chromium"
```

---

## Resumo dos comandos — ordem de execucao

```bash
# === LOCAL ===

# 1. Preparar repositorio
npm install
git init && git branch -M main
gh repo create vestigio-io --private --source=. --remote=origin
git add . && git commit -m "Initial commit"
git push -u origin main

# 2. Gerar chaves
openssl rand -base64 32       # → SECRET
openssl rand -hex 32          # → VESTIGIO_SECRET_KEY

# === RAILWAY ===

# 3. Criar projeto + banco
railway init
railway add --plugin postgresql

# 4. Configurar variaveis obrigatorias
railway variables set SECRET="..."
railway variables set VESTIGIO_SECRET_KEY="..."
railway variables set NEXTAUTH_URL="https://..."
railway variables set SITE_URL="https://..."
railway variables set NODE_ENV="production"
railway variables set ADMIN_EMAILS="seu@email.com"

# 5. Paddle (pagamento)
railway variables set PADDLE_API_KEY="pdl_..."
railway variables set PADDLE_WEBHOOK_SECRET="pdl_ntfset_..."
railway variables set NEXT_PUBLIC_PADDLE_API_URL="https://sandbox-api.paddle.com"
railway variables set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN="test_..."

# 6. Anthropic (chat IA)
railway variables set ANTHROPIC_API_KEY="sk-ant-..."
railway variables set VESTIGIO_LLM_ENABLED="true"

# 7. Email (SMTP)
railway variables set EMAIL_SERVER_HOST="smtp.resend.com"
railway variables set EMAIL_SERVER_PORT="587"
railway variables set EMAIL_SERVER_USER="resend"
railway variables set EMAIL_SERVER_PASSWORD="re_..."
railway variables set EMAIL_FROM="noreply@..."

# 8. Deploy (db push roda automaticamente no start)
railway up

# 9. Seed (uma vez, apos primeiro deploy)
railway run npx tsx prisma/seed.ts

# 10. Configurar planos (no browser)
# Acessar https://SEU_DOMINIO/app/admin/pricing
# Inserir Paddle Price IDs e salvar

# 11. Verificar
railway logs
curl -I https://SEU_DOMINIO

# 12. Configurar Paddle webhook (no Paddle Dashboard)
# URL: https://SEU_DOMINIO/api/paddle/webhook
# Eventos: transaction.completed, subscription.updated, subscription.canceled
```
