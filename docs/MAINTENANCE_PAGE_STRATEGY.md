# Maintenance Page Strategy (Cloudflare-fronted)

Drafted during the Railway outage on 2026-05-19. Vestigio.io and
app.vestigio.io both went dark for the duration of the outage (~hours).
Customers — pt-BR ones at minimum — got Cloudflare's bare "Web server is
returning an unknown error" page instead of a branded message with an ETA
and a status link. We want a maintenance page that:

- replaces 5xx / timeout errors with a branded HTML response,
- ideally tells the visitor what's happening and where to follow updates,
- works on the Cloudflare Free plan if at all possible,
- requires zero manual toggling when the origin recovers,
- doesn't accidentally fire on a one-off slow request to a healthy origin.

Three options ordered by recommendation.

---

## Option A — Cloudflare Workers (recommended)

Single worker bound to both `vestigio.io/*` and `app.vestigio.io/*`. The
worker proxies normal traffic to the origin and falls back to a static
maintenance HTML when the origin returns 5xx, times out, or refuses the
connection. Works on every Cloudflare plan including Free.

### Sketch

```js
// workers/maintenance-fallback.js
const MAINTENANCE_HTML = `<!doctype html>
<html lang="pt-BR">
  <head>…branded inline CSS + logo + status link…</head>
  <body>
    <main>
      <h1>Estamos voltando logo logo</h1>
      <p>Nosso provedor de infraestrutura está com instabilidade.
         O Vestigio volta assim que tudo normalizar.</p>
      <p>Status ao vivo:
         <a href="https://status.railway.com">status.railway.com</a></p>
    </main>
  </body>
</html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isApi = url.pathname.startsWith("/api/");

    try {
      const upstream = await fetch(request, {
        // Hard cap so the worker doesn't sit on Cloudflare's CPU budget
        // waiting for a stuck origin.
        signal: AbortSignal.timeout(8_000),
      });

      // 5xx from origin → serve maintenance HTML (for HTML requests).
      // For API calls we pass the 5xx through so the client retry
      // logic still sees the actual status code.
      if (upstream.status >= 500 && !isApi) {
        return maintenance();
      }

      return upstream;
    } catch (err) {
      // TCP timeout, DNS failure, connection refused — all land here.
      // For HTML pages serve the maintenance template, for APIs return
      // 503 JSON so existing client error-handling kicks in.
      if (isApi) {
        return new Response(
          JSON.stringify({ message: "Service temporarily unavailable" }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        );
      }
      return maintenance();
    }
  },
};

function maintenance() {
  return new Response(MAINTENANCE_HTML, {
    status: 503, // honest status code — bots and CDNs respect 503
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Tell Cloudflare not to cache the maintenance response so
      // visitors auto-recover the moment the origin is back.
      "Cache-Control": "no-store",
      "Retry-After": "120",
    },
  });
}
```

### Wiring

1. `wrangler init maintenance-fallback` and paste the worker above.
2. Route the worker on `vestigio.io/*` AND `app.vestigio.io/*` in the
   Cloudflare dashboard (Workers → Routes).
3. Deploy: `wrangler deploy`.

### Trade-offs

- ✅ Single artifact, branded, locale-aware, status link inline.
- ✅ Auto-recovers — no manual flag to flip when Railway comes back.
- ✅ API paths keep returning JSON 503 so the existing fetch error
  handling continues to work (it's why we have the AbortController +
  timeout fallbacks we just shipped).
- ⚠️ Free plan workers have a 10ms CPU budget per invocation. The
  fallback HTML is inline so it stays well under that; the proxied
  request only counts CPU, not wallclock, so the 8s timeout is fine.

### Sharper version (only after we ship the basic one)

- Serve different HTML for the marketing root vs the app domain (the
  marketing page can be playful; the app page should be terser and
  more actionable, since the visitor was mid-workflow).
- Honour `Accept-Language` to swap the locale of the maintenance copy
  (pt-BR / en / es / de).
- Inline the SVG logo and a tiny gradient background so the page
  doesn't look like a default 5xx.

---

## Option B — Cloudflare "Always Online"

Free feature. Cloudflare crawls your site, caches whole pages, and serves
the cached copy when the origin is unreachable.

- ✅ Zero code.
- ❌ Only serves pages Cloudflare actually crawled. The authenticated app
  surfaces (which require sessions and live data) won't have anything
  cached, so visitors hitting `app.vestigio.io/app/dashboard` still get a
  Cloudflare error.
- ❌ The cached marketing page looks alive when the rest of the product
  isn't — risk of confusing visitors who hit pricing → sign up → 5xx.

Worth turning on as a belt-and-suspenders for the marketing root only,
but not a substitute for Option A on the app domain.

---

## Option C — Cloudflare Custom Error Pages

Pro plan ($25/mo) and up. Lets you upload static HTML that replaces the
default error pages per status code (502, 503, 504, …).

- ✅ Branded, simple, no worker.
- ❌ Paid plan only.
- ❌ Can't differentiate by route or locale, can't include dynamic
  data (e.g. a live status link that you control).
- ❌ Less flexible than the worker — when Railway is half-up (slow but
  not 5xx) we can't intercept based on latency.

Skip unless we already need other Pro features.

---

## Companion: in-app banner for partial degradation

The maintenance page covers full-down. For partial degradation (Railway
is up, Anthropic Haiku is timing out, Stripe webhooks are slow), we want
a non-modal status banner inside the app itself. Two pieces needed:

1. A `/api/health/services` endpoint that pings the critical
   dependencies (Prisma, Redis, Anthropic, Stripe) with a 2s budget each
   and returns `{ services: [{ name, status, lastChecked }] }`.
2. A `<DegradationBanner />` client component in
   `src/components/console/` that polls `/api/health/services` every
   60s and renders a top banner when any service is unhealthy.

Already partially scaffolded — `src/libs/health-checker.ts` exists. Wire
it to the new endpoint + UI.

---

## What I'd ship first

1. Worker from Option A on both domains. Cost: ~2h to write + deploy.
   Locks in the branded fallback before the next outage.
2. Wire `src/libs/health-checker.ts` to an `/api/health/services`
   endpoint + `<DegradationBanner />`. Cost: ~half day. Catches the
   "Anthropic is degraded but Vestigio core is up" case the worker
   never sees.
3. (Later) Always Online on the marketing root, just to cover the case
   where even the worker route is broken — defense in depth.
