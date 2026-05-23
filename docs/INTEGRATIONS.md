# INTEGRATIONS.md — Data Source Catalog

> Last updated: 2026-05-22
> Purpose: catalog of every data source Vestigio can ingest behavioral / commercial / marketing events from, grouped by integration friction. The list informs the Data Sources tab UI (`/app/data-sources`) and the priority order for adapter implementation.

---

## Strategic framing

**Data sources do not dictate the ICP. Finding types do.** A pixel-only product is forced into commerce because pixel mostly measures browsing. A product with finding types for activation funnels, churn signals, support burden, ad-spend ROI, and lead-quality is open to SaaS B2B, info-product, service businesses, and lead-gen — *as long as* the relevant data can flow in without high integration friction.

Therefore Data Sources is a *coverage problem*: cover the most platforms a Brazilian SMB customer is likely to already use, ranked by integration friction. The same product serves all of them; the difference is which sources are ticked on.

**Hard filter applied to this catalog:** integrations that require Google-style or Meta-style **app review / homologation** are deprioritized. Webhooks, signed POST endpoints, and API tokens that the customer can self-provision are the primary surface. Google Search Console (already shipped) and Meta/Google Ads (already deferred in roadmap pending approval) are the exceptions because the work is sunk; everything new should avoid that approval gate.

---

## Tier 1 — Rápidas

One-click connect, no developer needed. Either a copy-paste webhook URL from the source's admin panel, or an API token the customer pastes into Vestigio. Zero customer code.

### Pagamentos / Checkout (BR + global)

| Source | Auth shape | What it gives us |
|--------|------------|-------------------|
| **Mercado Pago** ✅ already shipped | MP webhook | Payment lifecycle, PIX dunning, subscription state |
| **Stripe** ✅ already shipped | Stripe Connect OAuth + webhook | Charges, subs, MRR, disputes, refunds, failed payments |
| **Kirvano** | Signed webhook | Sale, refund, chargeback, recurrence — info-product BR primary |
| **Hotmart** | Postback URL | Sale, refund, chargeback, recurrence, abandoned checkout — largest BR info-product platform |
| **Eduzz** | Postback URL | Sale, refund, chargeback, subscription |
| **Monetizze** | Postback URL | Sale, refund, recurrence |
| **Kiwify** | Webhook | Sale, refund, abandoned cart |
| **Cakto** | Webhook | Sale, recurrence, refund |
| **Yampi** | Webhook | Order created, paid, abandoned cart, boleto expired |
| **Pagar.me / Stone** | Webhook | Transaction lifecycle, chargeback, anti-fraud signals |
| **Iugu** | Webhook | Subscription, invoice, charge events |
| **Asaas** | Webhook | Invoice, subscription, PIX, boleto |
| **Vindi** | Webhook | Subscription, invoice, dunning |

### E-commerce platforms (BR + global)

| Source | Auth shape | What it gives us |
|--------|------------|-------------------|
| **Shopify** ✅ already shipped | OAuth + webhook | Order, product, inventory, customer events (server-side, admin API) |
| **Shopify Custom Pixels** | App-embedded pixel script | First-party in-session behavioral events (page_view, product_viewed, cart_viewed, checkout_started, payment_info_submitted) routed through Shopify's sandbox. GDPR-compliant by design, no third-party-cookie problem, adblock-blind. Complements the OAuth integration — that gives server-side events (orders), this gives front-of-funnel behavior. |
| **Nuvemshop** ✅ already shipped | OAuth + webhook | Same shape as Shopify, BR-focused |
| **Wix Velo** | Backend snippet (`wix-fetch` in `backend/events.js`) | Customer pastes Vestigio-provided Velo code into their Wix site editor. Velo runs server-side inside Wix, so events flow without a client pixel. Captures any Wix Data event the customer chooses to forward (product viewed, member-area actions, form submissions). |
| **WordPress / WooCommerce** | Vestigio plugin (WP plugin directory) | Customer installs the plugin from inside their WP admin. Plugin auto-detects WooCommerce (cart/order/refund), Contact Form 7 + WPForms + Gravity Forms (lead capture), and core WP events (post published, comment, login). Server-side, runs inside the customer's WP stack. Significant BR coverage since WordPress + WooCommerce is the default stack for small / mid-tier BR merchants who outgrew Wix but haven't migrated to a platform e-commerce. |
| **Loja Integrada** | API token + webhook | Order, product, customer |
| **Tray** | API key + webhook | Order, product, customer — large in BR mid-market |
| **Bagy** | Webhook | Order, customer (BR fashion / niche) |

### Ads / Marketing (BR)

| Source | Auth shape | What it gives us |
|--------|------------|-------------------|
| **UTMfy** | Webhook | Per-conversion UTM attribution: source / medium / campaign / content. Critical for BR paid-traffic operators who use UTMfy as the single source of truth for ad-to-conversion. |
| **Reportana** | Webhook + API | Daily / weekly campaign aggregates from BR paid-traffic agencies. Spend, CPL, ROAS by campaign. Pairs with UTMfy for full ad funnel reconstruction. |
| **Stape** | API + log export | Server-side GTM hosted in BR. Lets us read events server-side, fully adblock-proof. |
| **RD Station** | Webhook + OAuth | The BR HubSpot. Lead, opportunity, MQL/SQL transitions, deal stages. Imprescindível for SaaS B2B BR. |
| **ActiveCampaign** | Webhook | Lead, automation triggers, email engagement, deal stage |
| **Brevo** | Webhook | Email send / open / click / bounce / unsubscribe. We already use Brevo for outbound — same account can feed events back. |
| **Mailchimp** | Webhook | Same shape as Brevo |
| **Klaviyo** | Webhook | E-comm focused: email + SMS + product/cart events. Klaviyo is the de facto for Shopify customers globally. |

### Atendimento / Conversação (BR)

WhatsApp + chat is the primary commercial channel for a huge slice of BR commerce. Friction signals from support are some of the strongest leading indicators of conversion problems — "customers asking about delivery before checkout" = checkout-trust gap, "support tickets about pricing" = pricing-page clarity gap.

| Source | Auth shape | What it gives us |
|--------|------------|-------------------|
| **Z-API** | Webhook | Unofficial WhatsApp via Z-API gateway. Message in, message out, conversation state. Used by many small BR shops. |
| **Take Blip** | Webhook | Enterprise WhatsApp / multichannel BR. Conversation events, bot transitions. |
| **Octadesk** | Webhook | BR helpdesk + chat. Ticket lifecycle, channel transitions. |
| **Movidesk** | Webhook | BR helpdesk competitor. Ticket lifecycle. |
| **Zenvia** | Webhook | BR conversational platform. SMS + WhatsApp + RCS. |
| **ManyChat** | Webhook | Chatbot funnels — Messenger + WhatsApp + Instagram. |
| **Anota AI** | Webhook | Delivery / food-service WhatsApp ordering. BR-specific. |
| **Leadster** | Webhook | BR conversational lead-gen. Chat-to-lead capture, lead qualification questions. |
| **Kommo** (ex-amoCRM) | Webhook | CRM with native WhatsApp / Instagram / Messenger integration. Strong in BR SMB. Lead, contact, pipeline events. |

### Analytics (no app review)

| Source | Auth shape | What it gives us |
|--------|------------|-------------------|
| **Microsoft Clarity** | API key + REST API | Free heatmaps + session replays + rage-click detection. Heavily used in BR as the no-cost alternative to Hotjar. Gives us a behavioral signal floor even when the customer has nothing else connected. |

---

## Tier 2 — Avançadas

OAuth with scope selection, or a config step that the customer reads. Still no code. The customer needs to know what they're sharing.

| Source | Auth shape | What it gives us |
|--------|------------|-------------------|
| **PostHog** | API token (project-scoped) | Full event stream from the customer's existing product analytics. Six months of history on day one. Zero new instrumentation. |
| **Amplitude** | API key + secret | Same shape — read existing event stream. |
| **Mixpanel** | Service account | Same shape. |
| **Segment** | Destination config | Vestigio registered as a Segment destination; receives every event the customer already routes through Segment. |
| **HubSpot** | OAuth | Lead, contact, deal, ticket — for B2B customers using HubSpot. (HubSpot OAuth does not require Vestigio to be a verified app for read-only token use up to free-tier limits.) |
| **Hotjar** | API token | Recordings, heatmaps, feedback. |
| **Google Search Console** ✅ already shipped | Google OAuth (verified) | Search queries, indexing, performance. Kept because it already exists; new Google-OAuth integrations are out of scope. |

---

## Tier 3 — Para Desenvolvedores

For customers who want maximum coverage and have engineering capacity. These are the integrations that escape every adblocker and every platform-vendor gate, at the cost of requiring code in the customer's app.

| Source | Auth shape | What it gives us |
|--------|------------|-------------------|
| **Backend SDK** (`@vestigio/sdk`) | API key | `vestigio.track(event, props)` from the customer's server. Identified user, server-side, adblock-proof. Captures events pixel never sees: async jobs, retries, internal admin actions, scheduled cycles. |
| **Generic signed webhook ingest** | HMAC-signed POST to `/api/ingest` | Customer writes a Lambda / Cloud Function that translates an event from any tool we don't natively support into our event shape. Universal escape hatch. |
| **First-party pixel via CNAME proxy** (Wave 21.1) | DNS CNAME + script tag | Today's pixel routed through `evt.<customer-domain>` instead of `vestigio.io/track`. Treated as first-party by adblockers, ITP, Brave Shields. Fallback path for customers without backend access or modern analytics tooling. |
| **Cloudflare Worker log forwarder** | Worker script paste + deploy | Vestigio publishes a ~20-line `worker.js`; the customer creates a Worker on their CF zone, pastes the code, deploys. Captures every request that hits CF (path, status, response time, geo, UA, referrer) and POSTs structured logs to Vestigio. Adblock-proof, no app code change, runs at the edge so zero added latency. The same shape ports to Vercel Edge / Netlify Edge if a customer asks. |

---

## Future / Out of scope (for now)

Documented so we don't re-debate them every roadmap pass.

- **Sentry, Datadog, New Relic** — error / APM data is strong behavioral signal but the integration surface is large for the marginal value. Stretch goal for a future wave.
- **Auth providers** (Clerk, Auth0, Supabase Auth, NextAuth) — webhooks would give clean signup / login / MFA-enrolled events. Defer until the SaaS B2B finding-set is filled out enough to justify the work.
- **Bing Webmaster** — equivalent to GSC for Bing. Low BR traffic share, defer.
- **Tally / Typeform / Google Forms** — form submissions are downstream of CRM events we already get from RD Station, ActiveCampaign, etc. Skip.
- **AWS polling via CloudFormation read-only role** — future. The shape: customer runs a `cloudformation deploy` of a Vestigio-published template that creates a read-only IAM role limited to specific log groups or buckets. Vestigio assumes the role periodically and pulls. Zero credentials in our hands beyond the role ARN. Pairs naturally with CloudWatch Logs, ALB logs, CloudFront logs. Add when at least one customer asks.
- **DB read-replica access** — too high a trust ask for SMB. Removed from this catalog.
- **GA4 OAuth ingestion** — Google's verification process is the same gate that blocks Meta Ads. Avoid in favor of GTM-tag / Measurement Protocol / Clarity as alternative behavioral surfaces.

---

## Implementation priority — to be detailed in follow-up sessions

The actual order is best decided after deep-dives on individual sources (data shape, webhook payload structure, signal mapping). This section is a placeholder that the next session will fill.

Working hypothesis for the order:

1. **Generic signed webhook ingest** + **Backend SDK shape** — the universal mechanisms. Every Tier 1 adapter rides on top of these.
2. **UTMfy + Reportana** — paid-traffic operators are the buyer persona with the most evident ROI from Vestigio analysis. Pair gives full ad-funnel reconstruction.
3. **Hotmart + Kirvano + Yampi** — info-product and BR e-comm primary checkouts. Likely the stack used by `havefunnels.com` and similar customers.
4. **RD Station** — destrava SaaS B2B BR.
5. **Microsoft Clarity** — free for the customer, gives a behavioral signal floor on every connected env.
6. **Leadster + Kommo + Z-API** — atendimento / lead capture / WhatsApp commercial signal.
7. **PostHog / Amplitude / Segment** — destrava SaaS B2B customers with mature analytics tooling.
8. **First-party CNAME pixel** (Wave 21.1) — fallback for customers without any of the above.

The deep-dive sessions will fix this order based on:
- Webhook payload shape (some are easier to map than others)
- BR market adoption (verify the assumptions in this catalog)
- Signal-to-finding mapping (which sources unlock which finding types)
- Customer-driven priority (what the first 5-10 paying customers actually use)
