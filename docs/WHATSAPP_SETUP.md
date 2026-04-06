# WhatsApp Business Platform setup guide

This document walks through every manual step needed to connect Vestigio to
the Meta WhatsApp Cloud API with **Coexistence mode** (same phone number used
simultaneously in the WhatsApp Business App on your phone and programmatically
via the API).

After following this guide, the only thing left to do is set ~6 environment
variables in Railway. The code is already wired end-to-end.

---

## What you get

- Receive alerts from Vestigio (incidents, regressions, page down) on WhatsApp
  using the same number you already have in the WhatsApp Business App
- Reply to those alerts from your phone — replies become support tickets in
  the admin panel automatically
- Magic-link login via WhatsApp (no email needed)
- Free tier: 1000 business-initiated conversations/month

---

## Prerequisites

1. A physical phone number that is currently registered in the **WhatsApp
   Business App** (v2.24.17 or higher), OR a brand-new number you're willing
   to register. Coexistence needs the number to have existed in WhatsApp
   Business App for at least 1 message.
2. Business verification documents (CNPJ + comprovante de endereço) ready
   to upload to Meta Business Manager.
3. You must be an admin of the Meta Business Manager account.

---

## Step 1 — Create/verify Meta Business Account

1. Go to https://business.facebook.com
2. If you don't have a Business Account yet, create one. Use
   `Vestigio Tecnologia LTDA` as the business name.
3. Navigate to **Business Settings → Business Info → Business verification**
4. Upload CNPJ + comprovante de endereço. Meta reviews in 2-7 business days.
5. Wait until the status reads **"Verified"**. You cannot proceed without
   this.

---

## Step 2 — Create a Meta for Developers app

1. Go to https://developers.facebook.com/apps
2. Click **Create App** → **Business** type → continue
3. App name: `Vestigio` (internal, not shown to users)
4. Contact email: `support@vestigio.io`
5. Business Account: pick the verified one from step 1
6. Click **Create app**

**From the App Dashboard → Settings → Basic, copy these values:**

| Env var | Where |
|---|---|
| `META_APP_ID` | "App ID" at the top of the Basic Settings page |
| `META_APP_SECRET` | "App secret" — click "Show" |

---

## Step 3 — Add the WhatsApp product

1. From the App Dashboard sidebar → **Add products** → **WhatsApp** → **Set up**
2. On the "Getting started" page, you will see **"API Setup"** on the left.

### 3a — Register the phone number with Coexistence

1. Still in **API Setup**, click **Add phone number** → scroll to the section
   labeled **"Use my existing WhatsApp Business app number"** or
   **"Onboard an existing WhatsApp Business app account"**.
   > If you do NOT see this option, Meta hasn't rolled out Coexistence for
   > your account yet. Contact Meta support to request enrollment, or fall
   > back to registering the number as a brand new Cloud API number (which
   > will disconnect it from the Business App on your phone — NOT what we want).
2. Enter your phone number in E.164 format (e.g. `+5511999999999`).
3. Meta sends a 6-digit code **to the WhatsApp Business App on your phone**.
   Check the app, enter the code in the web flow.
4. Within a minute the number is linked.

**Copy these values from the API Setup page:**

| Env var | Where |
|---|---|
| `META_PHONE_NUMBER_ID` | "Phone number ID" next to the green dot |
| `META_WABA_ID` | "WhatsApp Business Account ID" at the top right |

### 3b — Generate a permanent System User token

The "temporary access token" shown in API Setup expires after 24h and is not
useful. You need a permanent system user token:

1. Go to https://business.facebook.com → **Business Settings → Users → System Users**
2. Click **Add** → name it `Vestigio System User` → role **Admin** → create
3. On the new system user, click **Add Assets** → pick the WhatsApp Business
   Account from step 3a → grant **Full Control**
4. Click **Generate new token**
5. Select the Vestigio app from step 2
6. Token expiration: **Never**
7. Permissions (check ALL of these):
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
   - `business_management`
8. Click **Generate** and **copy the token immediately** — Meta only shows
   it once.

| Env var | Value |
|---|---|
| `META_SYSTEM_USER_TOKEN` | The token you just copied |

---

## Step 4 — Configure the webhook

1. Back in the App Dashboard → **WhatsApp → Configuration → Webhook**
2. Click **Edit** on the Webhook row
3. **Callback URL**: `https://vestigio.io/api/whatsapp/webhook`
4. **Verify token**: pick any random string (e.g. generate with
   `openssl rand -hex 32`). Save this as `META_WEBHOOK_VERIFY_TOKEN` in Railway.
5. Click **Verify and save** — Meta will immediately GET the webhook URL;
   our code echoes the challenge back and Meta confirms.
6. **Manage webhook fields** → subscribe to:
   - `messages` (receive inbound messages + status updates)
   - `message_template_status_update` (get notified when templates get approved)

| Env var | Value |
|---|---|
| `META_WEBHOOK_VERIFY_TOKEN` | The random string you picked |

---

## Step 5 — Set the env vars in Railway

```
META_APP_ID=...
META_APP_SECRET=...
META_SYSTEM_USER_TOKEN=...
META_WABA_ID=...
META_PHONE_NUMBER_ID=...
META_WEBHOOK_VERIFY_TOKEN=...
```

Set them in the Vestigio service (NOT the Postgres service) with:

```bash
railway variables --service vestigio-io \
  --set "META_APP_ID=..." \
  --set "META_APP_SECRET=..." \
  --set "META_SYSTEM_USER_TOKEN=..." \
  --set "META_WABA_ID=..." \
  --set "META_PHONE_NUMBER_ID=..." \
  --set "META_WEBHOOK_VERIFY_TOKEN=..."
```

Then redeploy (or wait for the next push).

---

## Step 6 — Verify the connection from the admin panel

Once Railway redeploys with the env vars, sign in as admin and run:

```bash
curl https://vestigio.io/api/admin/whatsapp/status \
  -b "next-auth.session-token=$ADMIN_SESSION_TOKEN"
```

Or just hit the URL from your browser while logged in as admin. You should get:

```json
{
  "configured": true,
  "envStatus": { "META_APP_ID": true, ... },
  "phoneNumber": {
    "display_phone_number": "+55 11 99999-9999",
    "verified_name": "Vestigio",
    "quality_rating": "GREEN",
    ...
  },
  "templates": [],
  "webhook": { "url": "https://vestigio.io/api/whatsapp/webhook", "verify_token_set": true }
}
```

If you see `"configured": false` or a phone number error, double-check the
env vars match exactly what Meta shows.

---

## Step 7 — Register the message templates

All 4 templates (incident, regression, page_down, magic_link) × 4 languages
(pt_BR, en_US, es_LA, de) are defined in
[`src/libs/whatsapp-templates.ts`](../src/libs/whatsapp-templates.ts).

Submit them all to Meta for approval with one POST:

```bash
curl -X POST https://vestigio.io/api/admin/whatsapp/register-templates \
  -b "next-auth.session-token=$ADMIN_SESSION_TOKEN"
```

Response:

```json
{
  "summary": { "total": 16, "created": 16, "already_exists": 0, "failed": 0 },
  "results": [
    { "name": "vestigio_incident", "language": "pt_BR", "status": "created", "id": "..." },
    ...
  ]
}
```

Each template enters **PENDING** status and takes 1-24h for Meta to review.
Utility templates (incident, regression, page_down) usually approve in
<1 hour. Authentication templates (magic_link) take longer because Meta
reviews the exact body text.

You can check approval status any time by running
`GET /api/admin/whatsapp/status` again — the `templates` array will show
each template's current `status: "APPROVED" | "PENDING" | "REJECTED"`.

**Once a template is APPROVED**, Vestigio will automatically start using it
for the corresponding notification event. No code deploy needed.

---

## Step 8 — Send a live test

Once at least one template is approved:

```bash
curl -X POST https://vestigio.io/api/admin/whatsapp/test-send \
  -H "Content-Type: application/json" \
  -b "next-auth.session-token=$ADMIN_SESSION_TOKEN" \
  -d '{
    "to": "+5511999999999",
    "templateName": "vestigio_incident",
    "language": "pt_BR",
    "bodyParams": ["vestigio.io", "Checkout redirect adds 2.4s latency", "Your payment page has 3 unnecessary redirects"]
  }'
```

Expected response:

```json
{ "ok": true, "wamid": "wamid.HBgLNTUx..." }
```

Check your WhatsApp — the message should arrive within seconds, with the
"Open in Vestigio" button at the bottom.

---

## Troubleshooting

### `/api/admin/whatsapp/status` returns `configured: false`

One or more env vars are missing. Check the `envStatus` object in the
response — each key is `true`/`false` for whether that env var is set.

### `phoneNumberError: "Unsupported post request"`

Almost always means `META_PHONE_NUMBER_ID` is wrong. Double-check the value
in Meta App Dashboard → WhatsApp → API Setup → Phone number ID.

### `templatesError: "Invalid OAuth 2.0 Access Token"`

The system user token is expired, revoked, or lacks permissions. Regenerate
it in Business Settings → System Users → (your user) → Generate new token,
making sure to grant:
- `whatsapp_business_messaging`
- `whatsapp_business_management`
- `business_management`

### Template send fails with error code 131008 "Template parameter mismatch"

The number of `bodyParams` you passed doesn't match the `{{1}}`, `{{2}}`,
`{{3}}` placeholders in the approved template body. Check the exact
template body text in `src/libs/whatsapp-templates.ts` and count the
placeholders.

### Template send fails with error code 131051 "Unsupported message type"

The template is still in `PENDING`. Wait for Meta to approve it (check
`/api/admin/whatsapp/status` — look at the `status` field of each template
in the `templates` array).

### Inbound messages don't appear in the `InboundMessage` table

1. Check the Vestigio server logs for `[whatsapp-webhook]` lines.
2. Verify Meta is actually hitting the webhook: Meta App Dashboard →
   WhatsApp → Configuration → Webhook → click **Test** on the `messages` row.
3. Confirm `META_APP_SECRET` is set correctly — without it the signature
   verification fails and the webhook returns 401.

### The quality rating of my phone number drops to YELLOW or RED

Meta reduces quality when users block your number or mark messages as spam.
Fixes:
- Never send promotional content as UTILITY templates
- Honor user opt-outs (Vestigio's `notificationPrefs.whatsappEnabled` flag
  already does this)
- Only message users who opted in explicitly via onboarding or settings

---

## Daily operation reference

| What | How |
|---|---|
| Add a new template | Edit `src/libs/whatsapp-templates.ts` → `POST /api/admin/whatsapp/register-templates` → wait for approval |
| Check account health | `GET /api/admin/whatsapp/status` |
| Send a test message | `POST /api/admin/whatsapp/test-send` |
| See inbound replies | Query `prisma.inboundMessage.findMany({ where: { handled: false } })` |
| Check delivery of a specific message | Look up `wamid` in `NotificationLog.providerId` and see current `status` |

---

## Coexistence-specific notes

Because we're using Coexistence:

- You keep using the WhatsApp Business App on your phone normally. Every
  message you send from the phone also appears in the API (via Messaging
  Echoes) so Vestigio could potentially log it.
- Every template message sent via the API shows up in your WhatsApp Business
  App too, so you can see the full history from the phone.
- Throughput is capped at 20 messages/second (enough for Vestigio's needs).
- Pricing: messages initiated via the WhatsApp Business App on your phone
  are free. Messages initiated via the Cloud API count against the 1000
  free conversations/month and are charged after that (~$0.05 per
  Brazilian conversation).
