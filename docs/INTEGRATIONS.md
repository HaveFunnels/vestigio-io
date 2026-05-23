# INTEGRATIONS.md — Data Source Catalog

> Last updated: 2026-05-23
> Purpose: catalog of every data source Vestigio can ingest behavioral / commercial / marketing events from, organized by **verified vs. aspirational** and **data-flow direction**. Drives the Data Sources tab UI (`/app/data-sources`) and the priority order for adapter implementation.

---

## Strategic framing

**Data sources do not dictate the ICP. Finding types do.** A pixel-only product is forced into commerce because pixel mostly measures browsing. A product with finding types for activation funnels, churn signals, support burden, ad-spend ROI, and lead-quality is open to SaaS B2B, info-product, service businesses, and lead-gen — *as long as* the relevant data can flow in without high integration friction.

Therefore Data Sources is a *coverage problem*: cover the most platforms a Brazilian SMB customer is likely to already use, ranked by integration friction.

**Hard filter:** integrations that require Google-style or Meta-style **app review / homologation** are deprioritized as default. Webhooks, signed POST endpoints, and API tokens that the customer can self-provision are the primary surface. The exceptions where homologation IS worth the wait are exactly the two integrations that move the most money for paid-traffic operators — Meta and Google Ads. For those, a **CSV import bridge** ships first so customers see value before the partner-app approval lands.

### What we learned from the UTMify deep-dive (2026-05-23)

The prior version of this catalog listed UTMify as a webhook source for UTM attribution. **It is not.** UTMify only exposes an inbound POST endpoint where external systems push sales TO UTMify; there is no outbound webhook, no pull API, no export. Confirmed against [utmify.com.br docs](https://docs.utmify.com.br/envio-de-vendas).

This forced a re-examination of every assumed integration in the catalog. The rule going forward:

1. **Every entry must declare its data-flow direction** (inbound = data flows TO Vestigio).
2. **Every entry must be marked verified or aspirational.** "Verified" = someone read the source's API docs and confirmed the data flow exists in the direction we need. "Aspirational" = we assumed based on general knowledge but haven't read the docs.
3. **Until verified, entries are aspirational by default.** No more "we'll just add a webhook adapter for X" without confirming X actually has the webhook we expect.

Three integrations in this catalog have been **verified end-to-end** so far (Shopify OAuth, Mercado Pago webhook, Stripe Connect — they exist in code). Everything else needs the same scrutiny before implementation begins.

### What the post-UTMify pivot means

UTMify aggregated UTM-to-conversion attribution. We lose that source. Two consequences:

1. **UTMs are now harvested from the gateway's native webhook** (Hotmart, Kirvano, Stripe, etc. all pass utm_* params in their order payload).
2. **The big-dollar attribution use case** (ad spend → revenue ROAS) is now anchored on **Meta + Google Ads + Shopify-equivalents** instead. Both Meta and Google sit behind app review, so we ship a **CSV import bridge** for each ahead of partner-app approval landing.

---

## Pillars: Shopify and Meta (with their equivalents)

The two highest-leverage sources for paid-traffic and e-commerce operators are Shopify-class platforms (where the checkout lives) and Meta-class ad networks (where the spend happens). Everything else is supporting cast.

### Shopify (and equivalents)

The Shopify integration surface has **three independent layers**. Each unlocks a different signal class. Today only one (the OAuth admin app) is shipped.

| Layer | What it gives us | Status |
|-------|------------------|--------|
| **Custom App via OAuth (admin API + webhook)** | Server-side order, customer, product, inventory data. Webhook subscriptions managed via the admin API (we register them programmatically; the merchant doesn't configure URLs). | ✅ Shipped — but with minimal scopes (`read_orders`, `read_customers`). Expansion to `read_products`, `read_inventory`, `read_themes`, `read_script_tags`, `read_checkouts` (abandoned), `read_customer_events` is pending and requires re-OAuth of existing customers. |
| **Custom Pixel via Web Pixels API** | First-party in-session behavioral events from the Shopify checkout sandbox — `page_viewed`, `product_viewed`, `cart_viewed`, `checkout_started`, `payment_info_submitted`, `checkout_completed`. **GDPR-compliant by design, adblock-blind, ITP-blind.** Posts to Vestigio's ingest from inside Shopify's sandbox. | ❌ Not built. Wave 21.7 candidate. |
| **App Store listing (or unlisted-by-link)** | Lets the "1-click install" flow work for non-development stores. Without listing, only development stores can install via OAuth. | ❌ Not published. Required before broad rollout. |

**Shopify-equivalents — same three-layer treatment applies:**

| Platform | OAuth admin | Web pixel equivalent | Verified? |
|----------|-------------|----------------------|-----------|
| **Nuvemshop** | ✅ shipped | Has a tracking script API (similar shape) — not built | OAuth verified; pixel API aspirational |
| **WooCommerce** | Plugin (we publish on WP directory) | Plugin can hook into `wp_head` for client-side or REST API for server-side | Aspirational — plugin not built |
| **Wix** | Velo backend snippet (`wix-fetch` from `backend/events.js`) | Custom Element + tag manager | Aspirational |
| **Loja Integrada** | API token + webhook | No first-party pixel API documented as of last check | Aspirational — needs verification |
| **Tray** | API key + webhook | No first-party pixel API documented | Aspirational — needs verification |
| **Bagy** | Webhook | No pixel API | Aspirational |

### Meta Ads (and equivalents)

| Path | What it gives us | Status |
|------|------------------|--------|
| **CSV import (bridge)** | Customer exports Ads Manager report (date range × campaign × ad set × ad × spend × impressions × clicks × attributed conversions). We parse to `MetaAdsSnapshotData`. Bridge so customers see ad ROI BEFORE partner-app approval lands. | ❌ Not built. **Wave 21.6 candidate — highest immediate ROI for any customer running Meta ads.** |
| **Partner App via OAuth** | Same data, polled on a schedule, zero CSV manual export. | 🔄 OAuth endpoints exist in code; **app under review by Meta**. Until approved, no customer can connect. |
| **Conversions API (CAPI) outbound** | We become a CAPI destination — Vestigio POSTS conversion events INTO Meta to keep optimization signal alive in the cookieless world. Different shape; pairs naturally with Stripe/Shopify revenue source-of-truth. | ❌ Not built. Future wave. |

**Meta-equivalents:**

| Platform | CSV bridge | Partner app | Verified? |
|----------|------------|-------------|-----------|
| **Google Ads** | Same shape — CSV export from Google Ads UI | OAuth + Google Ads API. Verified gate same as Meta (Google partner approval). | OAuth aspirational, CSV not built |
| **TikTok Ads** | CSV export available | Partner-app gate similar to Meta | Aspirational |
| **Kwai Ads / LinkedIn Ads / Pinterest Ads** | Out of scope until customer asks. | — | — |

---

## Tier 1 — Webhook-based (no app review, customer self-provisions)

Customer copy-pastes a webhook URL from Vestigio into the source's admin panel, or pastes an API token from the source into Vestigio. Zero code on the customer's side.

### Pagamentos / Checkout

The dominant integration surface for the BR info-product economy. Every entry below is **aspirational** until a docs verification pass confirms (a) outbound webhook exists, (b) the payload includes utm_* params, (c) auth model (signed body, shared secret, etc.) is documented.

| Source | Auth shape (claimed) | What it gives us (claimed) | Verified |
|--------|---------------------|----------------------------|----------|
| **Mercado Pago** | MP webhook | Payment lifecycle, PIX dunning, subscription state | ✅ Shipped |
| **Stripe** | Stripe Connect OAuth + webhook | Charges, subs, MRR, disputes, refunds, failed payments | ✅ Shipped |
| **Kirvano** | Signed webhook | Sale, refund, chargeback, recurrence — info-product BR primary | ❌ Aspirational |
| **Hotmart** | Postback URL | Sale, refund, chargeback, recurrence, abandoned checkout | ❌ Aspirational |
| **Eduzz** | Postback URL | Sale, refund, chargeback, subscription | ❌ Aspirational |
| **Monetizze** | Postback URL | Sale, refund, recurrence | ❌ Aspirational |
| **Kiwify** | Webhook | Sale, refund, abandoned cart | ❌ Aspirational |
| **Cakto** | Webhook | Sale, recurrence, refund | ❌ Aspirational |
| **Yampi** | Webhook | Order created, paid, abandoned cart, boleto expired | ❌ Aspirational |
| **Pagar.me / Stone** | Webhook | Transaction lifecycle, chargeback, anti-fraud signals | ❌ Aspirational |
| **Iugu** | Webhook | Subscription, invoice, charge events | ❌ Aspirational |
| **Asaas** | Webhook | Invoice, subscription, PIX, boleto | ❌ Aspirational |
| **Vindi** | Webhook | Subscription, invoice, dunning | ❌ Aspirational |

**Implementation order for the unverified set** — Hotmart first (largest BR info-product share), Kirvano second (next-largest, info-product), Yampi third (BR small e-comm). Each lands as its own mini-wave: verify docs → write adapter → ship.

### Ads / Marketing aggregators

**UTMify removed (2026-05-23) — confirmed inbound-only, no outbound data flow.**

| Source | Auth shape (claimed) | What it gives us (claimed) | Verified |
|--------|---------------------|----------------------------|----------|
| **Reportana** | Webhook + API | Daily / weekly campaign aggregates from BR paid-traffic agencies. Spend, CPL, ROAS by campaign. | ❌ Aspirational — needs docs verification |
| **Stape** | API + log export | Server-side GTM hosted in BR. Adblock-proof event stream. | ❌ Aspirational |

### CRM / Email / Lead-gen

| Source | Auth shape (claimed) | What it gives us (claimed) | Verified |
|--------|---------------------|----------------------------|----------|
| **RD Station** | Webhook + OAuth | The BR HubSpot. Lead, opportunity, MQL/SQL transitions, deal stages. | ❌ Aspirational |
| **ActiveCampaign** | Webhook | Lead, automation triggers, email engagement, deal stage | ❌ Aspirational |
| **Brevo** | Webhook | Email send / open / click / bounce / unsubscribe. We already use Brevo for outbound. | ❌ Aspirational |
| **Mailchimp** | Webhook | Same shape as Brevo | ❌ Aspirational |
| **Klaviyo** | Webhook | E-comm focused: email + SMS + product/cart events. Klaviyo is the de facto for Shopify customers globally. | ❌ Aspirational |

### Atendimento / Conversação

WhatsApp + chat is the primary commercial channel for a huge slice of BR commerce. Friction signals from support are some of the strongest leading indicators of conversion problems — "customers asking about delivery before checkout" = checkout-trust gap, "support tickets about pricing" = pricing-page clarity gap.

| Source | Auth shape (claimed) | What it gives us (claimed) | Verified |
|--------|---------------------|----------------------------|----------|
| **Z-API** | Webhook | Unofficial WhatsApp via Z-API gateway. Message in, message out, conversation state. | ❌ Aspirational |
| **Take Blip** | Webhook | Enterprise WhatsApp / multichannel BR. Conversation events, bot transitions. | ❌ Aspirational |
| **Octadesk** | Webhook | BR helpdesk + chat. Ticket lifecycle, channel transitions. | ❌ Aspirational |
| **Movidesk** | Webhook | BR helpdesk competitor. Ticket lifecycle. | ❌ Aspirational |
| **Zenvia** | Webhook | BR conversational platform. SMS + WhatsApp + RCS. | ❌ Aspirational |
| **ManyChat** | Webhook | Chatbot funnels — Messenger + WhatsApp + Instagram. | ❌ Aspirational |
| **Anota AI** | Webhook | Delivery / food-service WhatsApp ordering. | ❌ Aspirational |
| **Leadster** | Webhook | BR conversational lead-gen. Chat-to-lead capture, lead qualification questions. | ❌ Aspirational |
| **Kommo** (ex-amoCRM) | Webhook | CRM with native WhatsApp / Instagram / Messenger integration. Strong in BR SMB. | ❌ Aspirational |

### Analytics (no app review)

| Source | Auth shape (claimed) | What it gives us (claimed) | Verified |
|--------|---------------------|----------------------------|----------|
| **Microsoft Clarity** | API key + REST API | Free heatmaps + session replays + rage-click detection. Heavily used in BR as the no-cost alternative to Hotjar. Gives a behavioral signal floor when nothing else is connected. | ❌ Aspirational |

---

## Tier 2 — OAuth or API key with config (still no code)

OAuth with scope selection, or a config step the customer reads. Still no code from the customer.

| Source | Auth shape (claimed) | What it gives us (claimed) | Verified |
|--------|---------------------|----------------------------|----------|
| **PostHog** | API token (project-scoped) | Full event stream from the customer's existing product analytics. Six months of history on day one. | ❌ Aspirational |
| **Amplitude** | API key + secret | Same shape — read existing event stream. | ❌ Aspirational |
| **Mixpanel** | Service account | Same shape. | ❌ Aspirational |
| **Segment** | Destination config | Vestigio registered as a Segment destination; receives every event the customer already routes through Segment. | ❌ Aspirational |
| **HubSpot** | OAuth | Lead, contact, deal, ticket — for B2B customers using HubSpot. (HubSpot OAuth does not require Vestigio to be a verified app for read-only token use up to free-tier limits.) | ❌ Aspirational |
| **Hotjar** | API token | Recordings, heatmaps, feedback. | ❌ Aspirational |
| **Google Search Console** | Google OAuth (verified) | Search queries, indexing, performance. | ✅ Shipped |

---

## Tier 3 — Developer-grade (universal escape hatches)

For customers who want maximum coverage and have engineering capacity. Adblock-proof, platform-vendor-gate-proof, at the cost of customer code or DNS.

| Source | Auth shape (claimed) | What it gives us (claimed) | Verified |
|--------|---------------------|----------------------------|----------|
| **Backend SDK** (`@vestigio/sdk`) | API key | `vestigio.track(event, props)` from the customer's server. Identified user, server-side, adblock-proof. Captures events pixel never sees: async jobs, retries, internal admin actions, scheduled cycles. | ❌ Not built |
| **Generic signed webhook ingest** | HMAC-signed POST to `/api/ingest` | Customer writes a Lambda / Cloud Function that translates an event from any tool we don't natively support into our event shape. Universal escape hatch. | ❌ Not built |
| **First-party pixel via CNAME proxy** | DNS CNAME + script tag | Today's pixel routed through `evt.<customer-domain>` instead of `vestigio.io/track`. Treated as first-party by adblockers, ITP, Brave Shields. | 🔄 Wave 21.1 candidate |
| **Cloudflare Worker log forwarder** | Worker script paste + deploy | Vestigio publishes a ~20-line `worker.js`; the customer creates a Worker on their CF zone, pastes the code, deploys. Captures every request that hits CF and POSTs structured logs to Vestigio. | ❌ Not built |

---

## Future / Out of scope (for now)

Documented so we don't re-debate them every roadmap pass.

- **UTMify** — confirmed inbound-only (no outbound API, no pull, no export). UTMs are harvested from each gateway's native webhook payload instead.
- **Sentry, Datadog, New Relic** — error / APM data is strong behavioral signal but the integration surface is large for the marginal value. Stretch goal for a future wave.
- **Auth providers** (Clerk, Auth0, Supabase Auth, NextAuth) — webhooks would give clean signup / login / MFA-enrolled events. Defer until the SaaS B2B finding-set is filled out enough to justify the work.
- **Bing Webmaster** — equivalent to GSC for Bing. Low BR traffic share, defer.
- **Tally / Typeform / Google Forms** — form submissions are downstream of CRM events we already get from RD Station, ActiveCampaign, etc. Skip.
- **AWS polling via CloudFormation read-only role** — future. Add when at least one customer asks.
- **DB read-replica access** — too high a trust ask for SMB.
- **GA4 OAuth ingestion** — Google's verification process is the same gate that blocks Meta Ads. Avoid in favor of GTM-tag / Measurement Protocol / Clarity as alternative behavioral surfaces.
- **Kwai Ads / LinkedIn Ads / Pinterest Ads** — out of scope until a customer asks.

---

## Implementation priority

The pivot from "many small integrations" to "deep on Shopify + Meta with equivalents" reorders the queue:

### Next two waves

1. **Wave 21.6 — Meta Ads CSV import bridge.** Single most impactful: unlocks ad ROI for paid-traffic customers (havefunnels included) BEFORE Meta partner-app approval lands. Small surface (1 endpoint, 1 parser, 1 UI upload page), ships in ~3-5 days. Same CSV adapter architecture lets Google Ads / TikTok Ads ride on top with minimal extra code.

2. **Wave 21.7 — Shopify Custom Pixel (Web Pixels API).** Unlocks behavioral signal for every Shopify customer. The pixel lives inside Shopify's sandbox (so GDPR + adblock + ITP all moot) and posts to `evt.<customer-domain>` via the CNAME proxy (Wave 21.1). Pairs with the existing OAuth admin app — that gives server-side orders, this gives front-of-funnel behavior.

### Following waves

3. **Shopify scope expansion** — incremental: add `read_products`, `read_inventory`, `read_themes`, `read_script_tags`, `read_checkouts`, `read_customer_events`. Requires re-OAuth migration for existing customers (annoying but unavoidable).

4. **Hotmart / Kirvano / Yampi adapters** — verify docs, write webhook receiver, normalize utm_* + sale data. Each gateway is ~1-2 days once docs are confirmed.

5. **RD Station** — destrava SaaS B2B BR.

6. **Generic signed webhook ingest** + **Backend SDK** — universal mechanisms that every Tier 1 adapter can ride on top of. Build once when at least one customer asks for a source we don't natively support.

7. **Nuvemshop pixel + WooCommerce plugin** — Shopify-equivalent treatment for the other major BR e-comm platforms.

8. **First-party CNAME pixel (Wave 21.1)** — fallback for customers without any other source.

### Reordering trigger

This order changes when:
- A paying customer asks for a source not on the list — that source jumps to the front of the queue
- A docs-verification pass reveals an aspirational entry above is actually unworkable (UTMify-style surprise) — the entry drops to "Out of scope"
- Meta or Google partner-app approval lands — the corresponding CSV bridge becomes the legacy path; OAuth becomes primary
