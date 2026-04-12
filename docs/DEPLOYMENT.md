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

# WhatsApp (Meta Cloud API)
META_APP_ID=...
META_APP_SECRET=...
META_SYSTEM_USER_TOKEN=...
META_WABA_ID=...
META_PHONE_NUMBER_ID=...
META_WEBHOOK_VERIFY_TOKEN=...

# AI
ANTHROPIC_API_KEY=sk-ant-...
VESTIGIO_LLM_ENABLED=true
```
