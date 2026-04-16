# Manual Configuration Steps for Production

These are environment variables and external service configurations that must be
set up manually before the corresponding features work in production.

For the full Railway deployment walkthrough (project creation, database, build
settings, etc.), see [`docs/DEPLOY.md`](./DEPLOY.md).

---

## Email Notifications (Brevo)

| Env var | Description | Where to get it |
|---------|-------------|-----------------|
| `BREVO_API_KEY` | Brevo API key (starts with `xkeysib-`) | Brevo dashboard → Settings → API Keys |
| `BREVO_SENDER_EMAIL` | Verified sender email (e.g., `notifications@vestigio.io`) | Brevo → Senders → Add sender → Verify domain |
| `BREVO_SENDER_NAME` | Display name for emails (e.g., "Vestigio") | Same as above |

---

## SMS Notifications (Brevo)

| Env var | Description | Where to get it |
|---------|-------------|-----------------|
| `BREVO_SMS_SENDER` | Alphanumeric sender ID, max 11 chars (e.g., "Vestigio") | Brevo → SMS → Settings → Sender name |

**Note:** SMS requires a Brevo paid plan with SMS credits. Purchase SMS credits
at Brevo → SMS → Buy credits.

---

## WhatsApp Notifications (Meta Cloud API — Coexistence Mode)

Full setup guide: [`docs/WHATSAPP_SETUP.md`](./WHATSAPP_SETUP.md)

| Env var | Description | Where to get it |
|---------|-------------|-----------------|
| `META_APP_ID` | Facebook App ID | Meta for Developers → App Dashboard |
| `META_APP_SECRET` | Facebook App Secret | Same → Settings → Basic |
| `META_SYSTEM_USER_TOKEN` | Permanent system user token (NOT the 24h debug token) | Business Settings → System Users → Generate Token (with `whatsapp_business_messaging` permission) |
| `META_WABA_ID` | WhatsApp Business Account ID | WhatsApp Manager → Account Settings |
| `META_PHONE_NUMBER_ID` | Phone number ID registered to the WABA | WhatsApp Manager → Phone Numbers |
| `META_WEBHOOK_VERIFY_TOKEN` | Shared secret for webhook subscription | You choose this; Meta echoes it back during verification |

**Coexistence Mode**: The same phone number can be used in both the WhatsApp
Business App (on a phone) AND the Cloud API. Messages sent from either channel
appear in both. This is the recommended setup — your team can respond to
customers via the app while Vestigio sends automated notifications via the API.

**Steps:**

1. Create a Meta for Developers app with WhatsApp product enabled
2. Add your existing WhatsApp Business number (enable Coexistence in the app settings)
3. Create a System User with `whatsapp_business_messaging` permission
4. Generate a permanent token for the system user
5. Set all `META_*` env vars in Railway (or wherever you deploy)
6. Subscribe the webhook endpoint at `POST /api/whatsapp/webhook` with your verify token
7. Create message templates in WhatsApp Manager (see `src/libs/whatsapp-templates.ts` for required templates)

For the full step-by-step with screenshots-level detail and troubleshooting, see
[`docs/WHATSAPP_SETUP.md`](./WHATSAPP_SETUP.md).

---

## Paddle Billing

| Env var | Description |
|---------|-------------|
| `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` | Paddle.js client token |
| `NEXT_PUBLIC_PADDLE_ENV` | `production` or `sandbox` |
| `PADDLE_API_KEY` | Paddle server-side API key |
| `PADDLE_WEBHOOK_SECRET` | Webhook signature verification secret |

**Plan Price IDs**: Configure in Admin → Platform Config → Pricing. Each plan
needs a `paddlePriceId` matching a Paddle price ID.

---

## Integration Credentials Encryption

| Env var | Description |
|---------|-------------|
| `VESTIGIO_SECRET_KEY` | AES-256 encryption key for integration credentials (Shopify tokens, etc.). Generate with `openssl rand -hex 32`. Falls back to `SECRET` if not set. |

---

## Nuvemshop Integration

| Env var | Description | Where to get it |
|---------|-------------|-----------------|
| `NUVEMSHOP_APP_ID` | Nuvemshop Partner App ID (e.g., `29656`) | partners.nuvemshop.com.br → App → Overview |
| `NUVEMSHOP_CLIENT_SECRET` | App client secret for OAuth token exchange | partners.nuvemshop.com.br → App → Credentials |

**OAuth setup in Nuvemshop Partners:**
1. Go to partners.nuvemshop.com.br → App → Edit
2. Set **Redirect URL** to: `https://app.vestigio.io/api/integrations/nuvemshop/callback`
3. Set required **Scopes**: `read_orders`, `read_customers`, `read_products`
4. Set **LGPD Webhooks**:
   - Store Redact URL: `https://app.vestigio.io/api/integrations/nuvemshop/webhooks/store-redact`
   - Customers Redact URL: `https://app.vestigio.io/api/integrations/nuvemshop/webhooks/customers-redact`
   - Customers Data Request URL: `https://app.vestigio.io/api/integrations/nuvemshop/webhooks/customers-data-request`

**Demo store:** https://vestigiodemostore.lojavirtualnuvem.com.br/

---

## Meta Ads Integration

Reuses `META_APP_ID` + `META_APP_SECRET` from the WhatsApp Cloud API setup
above — same Meta App can serve both products. No extra env vars needed.

| Env var | Description | Where to get it |
|---------|-------------|-----------------|
| `META_APP_ID` | Facebook App ID (shared with WhatsApp) | Meta for Developers → App Dashboard |
| `META_APP_SECRET` | Facebook App Secret (shared with WhatsApp) | Same → Settings → Basic |

**Meta App Review required.** Ads needs two permissions our WhatsApp scope
doesn't cover, so you must submit a separate review:

- `ads_read` — read campaign spend + creative (Advanced Access)
- `business_management` — list ad accounts user has access to (Advanced Access)

**OAuth setup in Meta for Developers → App → Use cases / Products:**

1. Add the **Facebook Login for Business** product
2. **Valid OAuth Redirect URIs**: `https://app.vestigio.io/api/integrations/meta-ads/callback`
3. **App Domains**: `vestigio.io`
4. **Privacy Policy URL**: `https://vestigio.io/privacy`
5. **Terms of Service URL**: `https://vestigio.io/terms`
6. **User data deletion** — required for App Review. Point to our callback:
   - **Data Deletion Request URL**: `https://app.vestigio.io/api/integrations/meta-ads/deletion`
   - **Deauthorize Callback URL**: `https://app.vestigio.io/api/integrations/meta-ads/deauthorize`
7. Submit App Review for `ads_read` + `business_management`
   - Hardest parts: demo video (screencast of the connect flow + how we
     use the data) + scope justification text
   - Timeline: 1-4 weeks depending on review queue

Once approved, the Vestigio UI shows "Conectar com Meta" as the default
path — clients click once and authorize. Manual System User token path
remains as an "Advanced" fallback for technical users.

---

## Google Ads Integration

| Env var | Description | Where to get it |
|---------|-------------|-----------------|
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth 2.0 Client ID (Web application) | Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth client secret | Same — download or copy after creation |
| `GOOGLE_ADS_DEVELOPER_TOKEN` | Vestigio-owned developer token (shared across all tenants) | ads.google.com/aw/apicenter — apply under our MCC manager account |

Unlike the static-token/manual path, with OAuth the developer token is
**Vestigio-side** — clients never apply for their own. Vestigio's one
approved token polls each client's account using their refresh token.

**Google Cloud OAuth setup:**

1. Create (or select) a Google Cloud project dedicated to Vestigio
2. **APIs & Services → Library** → enable **Google Ads API**
3. **APIs & Services → OAuth consent screen**:
   - User Type: **External**
   - Privacy Policy URL: `https://vestigio.io/privacy`
   - Terms of Service URL: `https://vestigio.io/terms`
   - Authorized domains: `vestigio.io`
   - Scopes: add `https://www.googleapis.com/auth/adwords` (sensitive — requires verification)
4. **APIs & Services → Credentials** → Create Credentials → **OAuth client ID**:
   - Application type: **Web application**
   - Authorized redirect URIs: `https://app.vestigio.io/api/integrations/google-ads/callback`
   - Copy Client ID + Client Secret to env vars
5. Submit OAuth consent screen for **verification**:
   - Required because the `adwords` scope is sensitive
   - Demo video required (screencast of entire connect + data use flow)
   - Privacy policy must disclose how the data is used
   - Timeline: 2-6 weeks
6. **Google Ads Developer Token** (in parallel):
   - Apply at ads.google.com/aw/apicenter under a MCC (manager) account
   - Basic access (15k ops/day): typically 1-5 business days
   - Include the Vestigio product description + intended use case
   - Paste approved token into `GOOGLE_ADS_DEVELOPER_TOKEN`

Google Ads does **not** have a data deletion webhook — client revocation
happens user-side via Google Account settings. When a user revokes
Vestigio's access, the next poll fails; we auto-mark the integration as
`error` status. The existing DELETE `/api/integrations` endpoint covers
Vestigio-initiated removal.

---

## Database

| Env var | Description |
|---------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |

After adding new Prisma models, run:

```bash
DATABASE_URL=<your-url> npx prisma db push
```

---

## Quick Reference — All Required Env Vars

```bash
# Core
DATABASE_URL=postgresql://...
SECRET=<openssl rand -base64 32>
NEXTAUTH_URL=https://vestigio.io
SITE_URL=https://vestigio.io
NODE_ENV=production
VESTIGIO_SECRET_KEY=<openssl rand -hex 32>
ADMIN_EMAILS=admin@vestigio.io

# Paddle
PADDLE_API_KEY=pdl_...
PADDLE_WEBHOOK_SECRET=pdl_ntfset_...
NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=live_...
NEXT_PUBLIC_PADDLE_ENV=production

# Brevo (email + SMS)
BREVO_API_KEY=xkeysib-...
BREVO_SENDER_EMAIL=notifications@vestigio.io
BREVO_SENDER_NAME=Vestigio
BREVO_SMS_SENDER=Vestigio

# WhatsApp (Meta Cloud API) — shared with Meta Ads
META_APP_ID=...
META_APP_SECRET=...
META_SYSTEM_USER_TOKEN=...
META_WABA_ID=...
META_PHONE_NUMBER_ID=...
META_WEBHOOK_VERIFY_TOKEN=...

# Nuvemshop
NUVEMSHOP_APP_ID=29656
NUVEMSHOP_CLIENT_SECRET=...

# Google Ads (OAuth + shared developer token)
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_ADS_DEVELOPER_TOKEN=...

# AI
ANTHROPIC_API_KEY=sk-ant-...
VESTIGIO_LLM_ENABLED=true
```
