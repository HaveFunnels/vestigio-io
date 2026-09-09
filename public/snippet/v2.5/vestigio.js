/**
 * Vestigio Behavioral Intelligence Snippet v2.5
 *
 * v2.5 (2026-09-09): canonicalUrl() ignores a cross-host canonical — a
 * checkout that declares rel="canonical" to the storefront no longer
 * collapses every checkout event's url onto the storefront home. Strips
 * the stitch params from the url field too.
 *
 * v2.4 (2026-09-09): cross-domain funnel stitching (visitor id in
 * eTLD+1 cookie + URL carry), never-infer-a-sale confirmation with a
 * per-order-deduped window.vestigio.confirm() API, fresh-session TTL so
 * shared checkout links do not merge sessions, commercial-only cta
 * classification, real page-load timing.
 *
 * Versioning: the checkout install MUST pin an immutable, versioned URL
 * (/snippet/v2.4/vestigio.js) so a Subresource Integrity hash on a
 * payment page stays valid across deploys. The unversioned
 * /snippet/vestigio.js is "latest" and is fine for the storefront, which
 * is not a payment surface. Bump this version on any change that the
 * checkout should pick up, and re-issue the SRI hash with it.
 *
 * v2.1 (2026-07-13): fix — endpoint now derives from the pixel's own
 * script src origin instead of resolving against window.location. The
 * previous relative URL sent POST /api/behavioral/ingest to the CUSTOMER's
 * domain (404 loop + spammy console errors + zero telemetry reaching
 * Vestigio). See init() below.
 *
 * Lightweight first-party behavioral intelligence.
 * Captures semantic signals — NOT session replay or raw telemetry.
 *
 * Privacy:
 * - Never captures typed values, passwords, payment fields, or PII
 * - Prefers semantic labels over raw DOM content
 * - First-party only — no third-party tracking
 * - Batched + throttled transmission
 * - Field inventory captures structure only (kinds + count), never values
 *
 * Install: <script async src="https://app.vestigio.io/snippet/vestigio.js" data-env="ENV_ID"></script>
 */
(function() {
  'use strict';

  // ── Configuration ──
  var ENDPOINT = '/api/behavioral/ingest';
  var BATCH_INTERVAL = 5000;    // 5s flush
  var MAX_BATCH_SIZE = 50;
  var SCROLL_MILESTONES = [25, 50, 75, 90];
  var DEAD_CLICK_THRESHOLD = 3;  // 3 clicks in 2s same area
  var SESSION_TIMEOUT = 30 * 60 * 1000; // 30 min
  var HESITATION_THRESHOLD_MS = 3000; // 3s pause = hesitation
  var RAPID_BACKTRACK_MS = 5000; // <5s on page = rapid backtrack
  var CTA_LATE_THRESHOLD_MS = 3000; // CTA appearing >3s after load
  var EXCESSIVE_FIELD_COUNT = 6;

  // ── State ──
  var envId = '';
  var sessionId = '';
  var queue = [];
  var scrollReached = {};
  var clickBuffer = [];
  var pageEntryTime = Date.now();
  var attribution = {};
  var currentMilestone = null; // tracks highest milestone reached
  var lastActivityTime = Date.now();
  var ctaObserver = null;
  var ctaViewedSet = {};       // track which CTAs have been reported as viewed
  var formSubmitCounts = {};   // track form submit attempts per form
  var trackedForms = {};       // forms already inventoried
  var handoffStarted = false;
  var handoffTarget = null;
  var intentTimestamp = null;   // when intent was first expressed
  var conversionStartTimestamp = null; // when conversion started
  var firstCommercialActionTimestamp = null;
  var pricingViewedTimestamp = null;
  var pageLoadTimestamp = Date.now();

  // ── Trusted Checkout Providers ──
  var TRUSTED_CHECKOUT_HOSTS = [
    'checkout.stripe.com', 'pay.stripe.com',
    'www.paypal.com', 'paypal.com',
    'checkout.shopify.com',
    'js.braintreegateway.com',
    'checkout.square.site',
    'secure.checkout.visa.com',
    'masterpass.com',
    'pay.google.com', 'appleid.apple.com',
    'mercadopago.com', 'checkout.mercadopago.com',
    'pagseguro.uol.com.br',
    'pagar.me', 'api.pagar.me',
  ];

  // ── Confirmation Semantics ──
  var CONFIRMATION_PATH_PATTERNS = /\/(thank|thanks|obrigado|gracias|agradecimiento|confirmation|confirmacao|confirmaci[oó]n|order-confirmed|pedido-confirmado|pedido-realizado|compra-realizada|purchase-complete|success|exito|sucesso|welcome-aboard|signup-complete|registro-completo|cadastro-completo|bienvenid[oa])/i;
  var CONFIRMATION_TITLE_PATTERNS = /thank\s*you|order\s*confirm|purchase\s*complete|obrigad[oa]|gracias|success|[eé]xito|sucesso|pedido\s*confirm|compra\s*realizada|bienvenid|bem.vindo|welcome|registro\s*completo|cadastro\s*completo/i;

  // ── Journey Type Classification ──
  var JOURNEY_PATTERNS = {
    ecommerce: /\/(product|producto|produto|cart|carrito|carrinho|checkout|shop|store|loja|tienda|comprar|buy|catalog|catalogo|cat[aá]logo|collection|colec[cç][aã]o|colecci[oó]n|offer|oferta)/i,
    lead_gen: /\/(contact|contacto|contato|demo|trial|free|quote|consultation|orcamento|or[cç]amento|cotacao|cota[cç][aã]o|cotizaci[oó]n|presupuesto|agendar|schedule|book|formulario|formul[aá]rio)/i,
    saas_onboarding: /\/(onboarding|setup|getting-started|welcome|bienvenid|bem.vindo|dashboard|app|painel|panel|configurar|configura[cç][aã]o|inicio)/i,
    support_reassurance: /\/(support|soporte|suporte|help|ayuda|ajuda|faq|contact|contacto|contato|knowledge|base-de-conhecimento|centro-de-ayuda|atendimento|atencion)/i,
    checkout_billing: /\/(checkout|billing|payment|pricing|pagamento|pago|planos|planes|precos|pre[cç]os|precios|factura[cç][aã]o|facturaci[oó]n|assinatura|suscripci[oó]n|subscription)/i,
  };

  // ── GDPR Consent ──
  //
  // Customers can control consent in two ways:
  //   1. data-consent="granted" on the script tag (opt-in by default)
  //   2. window.vestigio.setConsent(true|false) at runtime (for CMP integration)
  //
  // When consent is not granted, the snippet still initializes but does
  // NOT capture or transmit events. Calling setConsent(true) later
  // activates tracking from that moment. setConsent(false) pauses it.
  var consentGranted = true;

  function checkInitialConsent(script) {
    var attr = script.getAttribute('data-consent');
    if (attr && attr !== 'granted') {
      consentGranted = false;
    }
  }

  // Public API: window.vestigio = { setConsent, deleteSession }
  window.vestigio = window.vestigio || {};
  window.vestigio.setConsent = function(granted) {
    consentGranted = !!granted;
    if (!consentGranted) {
      queue = [];
    }
  };
  window.vestigio.deleteSession = function() {
    try { sessionStorage.removeItem('vg_sid'); } catch(e) {}
    try { sessionStorage.removeItem('vg_milestone'); } catch(e) {}
    queue = [];
    sessionId = '';
    consentGranted = false;
  };
  // Decorate a URL with the cross-domain stitch params. Only needed by a
  // store whose buy button navigates via JS (location.href = ...) instead
  // of a plain <a href>, which we cannot intercept. Plain-link stores get
  // stitching with zero code. Usage: location.href = window.vestigio.decorate(url).
  window.vestigio.decorate = function(url) {
    try { return decorateUrl(url); } catch (e) { return url; }
  };
  window.vestigio.confirm = function(order) {
    // Explicit "this order is PAID" signal — the robust confirmation
    // path, since only the merchant knows a PIX cleared.
    //   order = { order_id?, value? }   value in BRL, decimal (e.g. 129.90)
    //
    // Deduped by ORDER, not just by session: a buyer who reopens the paid
    // order page days later (a WhatsApp or email receipt link) lands in a
    // NEW session, so a session-only guard would count the sale twice.
    // We remember confirmed order ids in localStorage. localStorage drops
    // in webviews, so this is best-effort on our side — the server ingest
    // must dedupe on order_id too, which is the durable guard.
    order = order || {};
    var oid = order.order_id || null;
    if (oid) {
      try {
        var seen = JSON.parse(localStorage.getItem('vg_confirmed_orders') || '[]');
        if (seen.indexOf(oid) !== -1) return; // already counted this order
        seen.push(oid);
        // Bound the list so it cannot grow forever on a shared device.
        if (seen.length > 50) seen = seen.slice(-50);
        localStorage.setItem('vg_confirmed_orders', JSON.stringify(seen));
      } catch (e) { /* storage blocked — fall through, server dedupes */ }
    }
    if (currentMilestone === 'conversion_completed' && !oid) return;
    currentMilestone = 'conversion_completed';
    persistSessionState();
    emit('confirmation_seen', {
      url: canonicalUrl(),
      order_id: oid,
      value: typeof order.value === 'number' ? order.value : null, // BRL decimal
      source: 'api',
    });
    flush(true);
  };

  // ── Init ──
  // ── Cross-domain visitor stitching ──────────────
  //
  // A store's checkout often lives on a sibling subdomain
  // (seguro.loja.com) while the storefront is loja.com. Session state in
  // sessionStorage is per-origin, so without this the visitor arrives at
  // checkout as a brand-new session — two disconnected funnels instead
  // of one. The whole value of measuring the funnel is being able to say
  // "this TikTok visitor reached checkout and abandoned".
  //
  // We do the stitching ourselves, so the merchant does not have to emit
  // anything: a visitor id in an eTLD+1 cookie (readable across
  // subdomains), mirrored to localStorage, AND — because ~80% of social
  // commerce traffic is in-app webviews where cookies drop between
  // navigations — carried in the URL of any outbound link to a sibling
  // subdomain. On arrival we adopt in precedence URL → cookie →
  // localStorage → new. No merchant cookie, no merchant redirect change.
  //
  // Registrable domain without a public-suffix list: walk the hostname
  // labels writing a probe cookie at each scope; the browser refuses to
  // set a cookie on a public suffix, so the narrowest scope that sticks
  // is the registrable domain. Memoized.
  var STITCH_VID_PARAM = 'vg_vid';
  var STITCH_SID_PARAM = 'vg_sid';
  var STITCH_TS_PARAM = 'vg_t';
  // A carried session is adopted only if the link was followed within
  // this window. Checkout URLs get shared between people (WhatsApp, "look
  // at this"), and without a freshness bound whoever opens someone else's
  // link would be merged into that person's session. A real buy-button
  // hop reaches checkout in seconds; a shared link opened later falls
  // back to a fresh session (still the same VISITOR if their cookie is
  // present). Matches the 30-min session timeout.
  var STITCH_SID_TTL_MS = 30 * 60 * 1000;
  var _registrableDomain = null;

  function registrableDomain() {
    if (_registrableDomain !== null) return _registrableDomain;
    var host = location.hostname;
    // IPs and single-label hosts (localhost) have no registrable domain
    // to broaden to — cookie stays host-scoped.
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.indexOf('.') === -1) {
      _registrableDomain = host;
      return host;
    }
    var labels = host.split('.');
    var probe = 'vg_pd=1;path=/;SameSite=Lax';
    for (var i = labels.length - 2; i >= 0; i--) {
      var candidate = labels.slice(i).join('.');
      document.cookie = probe + ';Domain=.' + candidate;
      if (document.cookie.indexOf('vg_pd=1') !== -1) {
        // Stuck — clean the probe and take this scope.
        document.cookie = 'vg_pd=;path=/;Domain=.' + candidate + ';expires=Thu, 01 Jan 1970 00:00:00 GMT';
        _registrableDomain = candidate;
        return candidate;
      }
    }
    _registrableDomain = host;
    return host;
  }

  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function writeVisitorCookie(vid) {
    // 365-day visitor cookie at the registrable domain. Safari's ITP
    // caps JS cookies at 7 days, which is fine: within-funnel stitching
    // happens in minutes, and the URL carry covers webviews regardless.
    try {
      var exp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
      document.cookie =
        STITCH_VID_PARAM + '=' + encodeURIComponent(vid) +
        ';path=/;expires=' + exp + ';SameSite=Lax;Domain=.' + registrableDomain();
    } catch (e) {}
  }

  var visitorId = '';
  // True when this pageload was stitched from a sibling subdomain (the
  // visitor arrived carrying our id in the URL). Used to preserve
  // first-touch attribution — a stitched arrival's referrer is our own
  // storefront, not a new acquisition source.
  var arrivedViaStitch = false;

  function initVisitor() {
    var params = new URLSearchParams(location.search);
    var fromUrl = params.get(STITCH_VID_PARAM);
    if (fromUrl) {
      visitorId = fromUrl;
      arrivedViaStitch = true;
    } else {
      visitorId = readCookie(STITCH_VID_PARAM) || null;
      if (!visitorId) {
        try { visitorId = localStorage.getItem('vg_vid'); } catch (e) {}
      }
    }
    if (!visitorId) {
      visitorId = 'vgv_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
    writeVisitorCookie(visitorId);
    try { localStorage.setItem('vg_vid', visitorId); } catch (e) {}
  }

  // Append our stitch params to a URL when the destination is a sibling
  // subdomain of the same registrable domain (and not the current host).
  // Public as window.vestigio.decorate(url) so a store whose checkout
  // button navigates via JS (location.href = ...) rather than a plain
  // <a href> can opt a single URL in — the only line of integration a
  // merchant might need, and only in that case.
  function decorateUrl(rawUrl) {
    try {
      var u = new URL(rawUrl, location.href);
      var rd = registrableDomain();
      var sameRegistrable = u.hostname === rd || u.hostname.slice(-(rd.length + 1)) === '.' + rd;
      if (!sameRegistrable || u.hostname === location.hostname) return rawUrl;
      u.searchParams.set(STITCH_VID_PARAM, visitorId);
      if (sessionId) {
        u.searchParams.set(STITCH_SID_PARAM, sessionId);
        u.searchParams.set(STITCH_TS_PARAM, String(Date.now()));
      }
      return u.toString();
    } catch (e) {
      return rawUrl;
    }
  }

  // Decorate anchors at click time — covers the common case (the buy
  // button is a link) with zero merchant work and no eager DOM rewriting.
  function bindStitchDecoration() {
    document.addEventListener('click', function(e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      var decorated = decorateUrl(a.getAttribute('href'));
      if (decorated !== a.getAttribute('href')) a.setAttribute('href', decorated);
    }, true);
  }

  function init() {
    var script = document.querySelector('script[data-env]');
    if (!script) return;
    envId = script.getAttribute('data-env') || '';
    if (!envId) return;

    checkInitialConsent(script);

    // Derive ingest origin from the pixel's own <script src>. Without
    // this, `fetch('/api/behavioral/ingest')` resolves against
    // window.location.origin (the CUSTOMER's site) and 404s on every
    // send — spammy console errors on their live shop, plus zero
    // events actually reaching Vestigio. Reading script.src gives us
    // the Vestigio host the pixel was loaded from, so the endpoint
    // stays correct across dev/staging/prod without hardcoding.
    var customEndpoint = script.getAttribute('data-endpoint');
    if (customEndpoint) {
      ENDPOINT = customEndpoint;
    } else {
      try {
        var scriptOrigin = new URL(script.src, window.location.href).origin;
        ENDPOINT = scriptOrigin + ENDPOINT;
      } catch (e) {
        // Malformed script src — fall back to production host so at
        // least the pixel keeps working for the primary deployment.
        ENDPOINT = 'https://app.vestigio.io' + ENDPOINT;
      }
    }

    initVisitor();
    sessionId = getOrCreateSession();
    bindStitchDecoration();
    attribution = captureAttribution();

    // Emit initial page_view
    emit('page_view', {
      url: canonicalUrl(),
      title: document.title || null,
      referrer: document.referrer || null,
      journey_type: classifyJourneyType(window.location.pathname),
    });

    // Classify initial milestone
    updateMilestone(window.location.pathname);

    // Check for confirmation page
    checkConfirmation();

    // Surface vitality / heartbeat
    emitVitality();

    // Bind listeners
    bindRouteChanges();
    bindScrollTracking();
    bindClickTracking();
    bindFormTracking();
    bindVisibility();
    bindHesitationTracking();
    bindCtaVisibilityTracking();
    bindHandoffDetection();

    // Flush on interval
    setInterval(flush, BATCH_INTERVAL);

    // Flush on unload
    window.addEventListener('beforeunload', function() {
      emit('page_leave', { time_on_page_ms: Date.now() - pageEntryTime });
      flush(true);
    });
  }

  // ── Session Management ──
  //
  // The session is the funnel: one visit from landing to checkout. The
  // VISITOR (visitorId, above) is the longer-lived identity that links a
  // returning buyer's separate visits — different thing, deliberately
  // kept separate. Session id lives in sessionStorage (per-origin, 30min
  // timeout); to make the funnel survive the storefront→checkout domain
  // hop it is also carried in the stitch URL, adopted here with highest
  // precedence so both domains share ONE session, not two.
  function getOrCreateSession() {
    // Stitched arrival: adopt the session carried from the sibling
    // subdomain so the funnel is continuous. sessionStorage was empty
    // here (different origin), so this is the only way the checkout page
    // knows it is the same visit that started on the storefront.
    try {
      var qp = new URLSearchParams(location.search);
      var sidFromUrl = qp.get(STITCH_SID_PARAM);
      var tsFromUrl = parseInt(qp.get(STITCH_TS_PARAM) || '0', 10);
      // Adopt only a FRESH carried session (see STITCH_SID_TTL_MS): this
      // is what stops a shared checkout link from merging strangers into
      // one session. Also require the carried visitor to match the one we
      // resolved on this device when a cookie is present — a stronger
      // check than TTL alone, and free in the normal (non-shared) case.
      var freshEnough = tsFromUrl > 0 && (Date.now() - tsFromUrl) < STITCH_SID_TTL_MS;
      var vidFromUrl = qp.get(STITCH_VID_PARAM);
      var cookieVid = readCookie(STITCH_VID_PARAM);
      var visitorMatches = !cookieVid || !vidFromUrl || cookieVid === vidFromUrl;
      if (sidFromUrl && freshEnough && visitorMatches) {
        sessionStorage.setItem('vg_session', JSON.stringify({ id: sidFromUrl, ts: Date.now() }));
        return sidFromUrl;
      }
    } catch (e) {}
    try {
      var stored = sessionStorage.getItem('vg_session');
      if (stored) {
        var parsed = JSON.parse(stored);
        if (Date.now() - parsed.ts < SESSION_TIMEOUT) {
          parsed.ts = Date.now();
          sessionStorage.setItem('vg_session', JSON.stringify(parsed));
          // Restore state
          if (parsed.milestone) currentMilestone = parsed.milestone;
          if (parsed.intent_ts) intentTimestamp = parsed.intent_ts;
          if (parsed.conv_ts) conversionStartTimestamp = parsed.conv_ts;
          if (parsed.first_action_ts) firstCommercialActionTimestamp = parsed.first_action_ts;
          return parsed.id;
        }
      }
    } catch(e) {}
    var id = 'vgs_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { sessionStorage.setItem('vg_session', JSON.stringify({ id: id, ts: Date.now() })); } catch(e) {}
    return id;
  }

  function persistSessionState() {
    try {
      var stored = sessionStorage.getItem('vg_session');
      if (stored) {
        var parsed = JSON.parse(stored);
        parsed.ts = Date.now();
        parsed.milestone = currentMilestone;
        parsed.intent_ts = intentTimestamp;
        parsed.conv_ts = conversionStartTimestamp;
        parsed.first_action_ts = firstCommercialActionTimestamp;
        sessionStorage.setItem('vg_session', JSON.stringify(parsed));
      }
    } catch(e) {}
  }

  // ── Attribution ──
  function captureAttribution() {
    var params = new URLSearchParams(window.location.search);
    // A stitched arrival (checkout reached from our own storefront) is
    // not an acquisition event: its referrer is a sibling subdomain of
    // the same store. Sending it as a source would rewrite the visit's
    // origin to "referrer loja.com" and lose the real first touch
    // (tiktok, meta). The real origin already rode in on the shared
    // session from the storefront; here we send no competing source.
    var internalReferral = arrivedViaStitch && !params.get('utm_source');
    var attr = {
      source: params.get('utm_source') || null,
      medium: params.get('utm_medium') || null,
      campaign: params.get('utm_campaign') || null,
      referrer: internalReferral ? null : (document.referrer || null),
      landing_url: canonicalUrl(),
      gclid: params.get('gclid') || null,
      fbclid: params.get('fbclid') || null,
    };
    try {
      // Only the first touch of the visitor's FIRST domain sets this;
      // a stitched arrival never overwrites it.
      var firstTouch = localStorage.getItem('vg_first_touch');
      if (!firstTouch && !internalReferral) {
        localStorage.setItem('vg_first_touch', JSON.stringify(attr));
      }
    } catch(e) {}
    return attr;
  }

  // ── URL Normalization ──
  function canonicalUrl() {
    // Prefer the page's canonical — UNLESS it points to a different
    // hostname than the page we are on. A cross-host canonical is exactly
    // the signal that the page does not want to be treated as that
    // destination: a checkout on seguro.loja.com that declares
    // rel="canonical" = loja.com (to consolidate indexing and link
    // previews under the storefront) would otherwise collapse every
    // checkout event's url onto the storefront home, and the server
    // aggregator would attribute the whole checkout to the home surface.
    // So we only trust a same-host canonical; cross-host falls through to
    // the real, stripped location. General to any store with a checkout
    // on a sibling subdomain.
    try {
      var canonical = document.querySelector('link[rel="canonical"]');
      if (canonical && canonical.href) {
        var cHost = new URL(canonical.href, location.href).hostname;
        if (cHost === location.hostname) return canonical.href;
      }
    } catch (e) { /* malformed canonical — use location */ }
    var url = new URL(window.location.href);
    // Strip acquisition params AND our own stitch params so the url field
    // is the clean page URL, not a query-polluted one.
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','_ga','mc_cid','mc_eid',
     STITCH_VID_PARAM, STITCH_SID_PARAM, STITCH_TS_PARAM].forEach(function(p) {
      url.searchParams.delete(p);
    });
    return url.origin + url.pathname + (url.search || '');
  }

  // ── Canonical Milestone Taxonomy ──
  var MILESTONE_ORDER = ['awareness_seen', 'consideration_started', 'intent_expressed', 'conversion_started', 'conversion_completed', 'post_conversion_seen'];

  function milestoneIndex(m) {
    return m ? MILESTONE_ORDER.indexOf(m) : -1;
  }

  function updateMilestone(pathname) {
    var newMilestone = classifyMilestone(pathname);
    if (newMilestone && milestoneIndex(newMilestone) > milestoneIndex(currentMilestone)) {
      currentMilestone = newMilestone;
      persistSessionState();

      // Track timing landmarks
      if (newMilestone === 'intent_expressed' && !intentTimestamp) {
        intentTimestamp = Date.now();
        persistSessionState();
      }
      if (newMilestone === 'conversion_started' && !conversionStartTimestamp) {
        conversionStartTimestamp = Date.now();
        persistSessionState();
      }
    }
  }

  function classifyMilestone(pathname) {
    var p = (pathname || '').toLowerCase();
    // Post-conversion
    if (CONFIRMATION_PATH_PATTERNS.test(p)) return 'post_conversion_seen';
    // Conversion
    if (/\/(checkout|pagamento|pago|purchase|finalizar|billing\/confirm|factura|confirmar.pedido|confirmar.compra)/.test(p)) return 'conversion_started';
    // Intent
    if (/\/(cart|carrinho|carrito|add-to-cart|agregar-al-carrito|adicionar-ao-carrinho|pricing|planos|planes|precos|pre[cç]os|precios|cotizaci[oó]n|orcamento|or[cç]amento)/.test(p)) return 'intent_expressed';
    // Consideration
    if (/\/(product|producto|produto|item|compare|comparar|review|rese[nñ]a|avalia[cç][aã]o|demo|trial|free|detalhe|detalle)/.test(p)) return 'consideration_started';
    // Awareness (any commercial-adjacent page)
    if (/\/(shop|store|loja|tienda|category|categoria|collection|colec[cç][aã]o|colecci[oó]n|landing|lp|offer|oferta|catalog|catalogo|cat[aá]logo)/.test(p)) return 'awareness_seen';
    return null;
  }

  // ── Confirmation / Success Detection ──
  function checkConfirmation() {
    var pathname = window.location.pathname;
    var signals = [];

    // URL pattern
    if (CONFIRMATION_PATH_PATTERNS.test(pathname)) {
      signals.push('url_pattern');
    }

    // Title match
    if (CONFIRMATION_TITLE_PATTERNS.test(document.title || '')) {
      signals.push('title_match');
    }

    // DOM markers: look for success-indicating elements
    try {
      var h1 = document.querySelector('h1');
      if (h1 && CONFIRMATION_TITLE_PATTERNS.test(h1.textContent || '')) {
        signals.push('h1_match');
      }
      // Check for order confirmation semantic markers
      // A sale is never inferred from the mere existence of an order
      // element. [data-order-id] alone marks an order that EXISTS, which
      // on a PIX flow means a payment that has not happened yet — on this
      // kind of store, ~35% of generated orders are never paid. Counting
      // it as a sale inflates measured conversion by roughly half.
      //
      // Only an element that explicitly asserts PAID counts here. For
      // stores whose paid state arrives after render without a new page
      // (PIX polling), the robust path is the merchant calling
      // window.vestigio.confirm({order_id}) — see the public API — which
      // does not depend on us guessing a DOM shape at all.
      if (document.querySelector('[data-order-status="paid"], [data-payment-status="paid"], .payment-confirmed, .purchase-success, #order-confirmed')) {
        signals.push('dom_marker');
      }
    } catch(e) {}

    if (signals.length > 0) {
      updateMilestone(pathname); // will set post_conversion_seen or conversion_completed
      if (milestoneIndex(currentMilestone) < milestoneIndex('conversion_completed')) {
        currentMilestone = 'conversion_completed';
        persistSessionState();
      }
      emit('confirmation_seen', {
        url: canonicalUrl(),
        signals: signals,
        time_since_conversion_start_ms: conversionStartTimestamp ? Date.now() - conversionStartTimestamp : null,
      });
    }
  }

  // ── Surface Vitality / Heartbeat ──
  function emitVitality() {
    window.addEventListener('load', function() {
      pageLoadTimestamp = Date.now();
      // loadEventEnd is only set once the load event has finished
      // dispatching, and this runs inside that event — so reading it
      // here returned 0, and the null guard turned that into a missing
      // value. Measured on one production store: 50,409 heartbeats,
      // 155 with a load time. Page speed was effectively unmeasured.
      //
      // Navigation Timing Level 2 is read first because it reports
      // durations relative to navigation start directly, then Level 1 as
      // a fallback for older browsers. Either way the read is deferred
      // to the next macrotask so loadEventEnd has been written.
      var perf = {};
      function readTimings() {
        try {
          var nav =
            performance.getEntriesByType &&
            performance.getEntriesByType('navigation')[0];
          if (nav && nav.loadEventEnd) {
            perf.dom_ready_ms = Math.round(nav.domContentLoadedEventEnd) || null;
            perf.load_ms = Math.round(nav.loadEventEnd) || null;
            return;
          }
        } catch (err) { /* fall through to Level 1 */ }
        if (window.performance && performance.timing) {
          var t = performance.timing;
          perf.dom_ready_ms = t.domContentLoadedEventEnd
            ? t.domContentLoadedEventEnd - t.navigationStart
            : null;
          perf.load_ms = t.loadEventEnd ? t.loadEventEnd - t.navigationStart : null;
        }
      }
      var jsErrors = 0;
      var resourceErrors = 0;
      window.addEventListener('error', function(e) {
        if (e.filename) jsErrors++;
        else resourceErrors++;
      });
      // The heartbeat is emitted from inside the deferred read, not
      // alongside it — emitting synchronously here would send `perf`
      // before readTimings had filled it, which is the same class of
      // ordering mistake that made load_ms null in the first place.
      setTimeout(function() {
        readTimings();
        emit('heartbeat', {
          url: canonicalUrl(),
          timing: perf,
          js_error_count: jsErrors,
          resource_error_count: resourceErrors,
          page_alive: true,
        });
      }, 0);

      // After load, check for late-rendered CTAs
      setTimeout(checkLateCtaRendering, CTA_LATE_THRESHOLD_MS + 500);
    });
  }

  // ── Route Change Detection (SPA) ──
  function bindRouteChanges() {
    var lastUrl = window.location.href;
    var lastPathname = window.location.pathname;
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function() {
      origPush.apply(this, arguments);
      onRouteChange();
    };
    history.replaceState = function() {
      origReplace.apply(this, arguments);
      onRouteChange();
    };
    window.addEventListener('popstate', onRouteChange);

    function onRouteChange() {
      var newUrl = window.location.href;
      if (newUrl !== lastUrl) {
        var timeOnPage = Date.now() - pageEntryTime;

        // Rapid backtrack detection
        if (timeOnPage < RAPID_BACKTRACK_MS && lastPathname !== window.location.pathname) {
          emit('rapid_backtrack', {
            url: canonicalUrl(),
            from_url: lastUrl,
            time_on_page_ms: timeOnPage,
          });
        }

        // Pricing viewed tracking
        if (/\/(pricing|precos|precios|plans|planos)/.test(lastPathname)) {
          pricingViewedTimestamp = Date.now();
        }

        pageEntryTime = Date.now();
        lastUrl = newUrl;
        lastPathname = window.location.pathname;
        scrollReached = {};
        ctaViewedSet = {};

        emit('route_change', {
          url: canonicalUrl(),
          title: document.title,
          journey_type: classifyJourneyType(window.location.pathname),
        });

        updateMilestone(window.location.pathname);
        checkConfirmation();

        // Re-bind CTA visibility for new page
        if (ctaObserver) ctaObserver.disconnect();
        setTimeout(function() { bindCtaVisibilityTracking(); }, 500);
      }
    }
  }

  // ── Scroll Tracking ──
  function bindScrollTracking() {
    var ticking = false;
    window.addEventListener('scroll', function() {
      if (!ticking) {
        requestAnimationFrame(function() {
          var scrollTop = window.scrollY || document.documentElement.scrollTop;
          var docHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - window.innerHeight;
          if (docHeight <= 0) { ticking = false; return; }
          var pct = Math.round((scrollTop / docHeight) * 100);
          for (var i = 0; i < SCROLL_MILESTONES.length; i++) {
            var m = SCROLL_MILESTONES[i];
            if (pct >= m && !scrollReached[m]) {
              scrollReached[m] = true;
              emit('scroll_depth', { depth_pct: m, url: canonicalUrl() });
            }
          }
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }

  // ── Click Tracking ──
  function bindClickTracking() {
    document.addEventListener('click', function(e) {
      var target = e.target;
      if (!target) return;

      lastActivityTime = Date.now();

      // CTA detection
      var el = target.closest('a, button, [role="button"], input[type="submit"]');
      if (el) {
        var label = semanticLabel(el);
        var intent = classifyClickIntent(el, label);
        if (intent) {
          emit(intent, { label: label, url: canonicalUrl() });
          // Track first commercial action
          if (!firstCommercialActionTimestamp && (intent === 'checkout_open' || intent === 'cta_click')) {
            firstCommercialActionTimestamp = Date.now();
            persistSessionState();
          }
          // Intent expressed on CTA click
          if (intent === 'cta_click' || intent === 'checkout_open') {
            if (milestoneIndex(currentMilestone) < milestoneIndex('intent_expressed')) {
              updateMilestone('/cart'); // triggers intent_expressed
            }
          }
        }
      }

      // Dead/rage click heuristic
      var now = Date.now();
      clickBuffer.push({ x: e.clientX, y: e.clientY, t: now });
      clickBuffer = clickBuffer.filter(function(c) { return now - c.t < 2000; });
      if (clickBuffer.length >= DEAD_CLICK_THRESHOLD) {
        var area = clickBuffer.every(function(c) {
          return Math.abs(c.x - clickBuffer[0].x) < 30 && Math.abs(c.y - clickBuffer[0].y) < 30;
        });
        if (area) {
          emit('dead_click', { url: canonicalUrl(), count: clickBuffer.length });
          clickBuffer = [];
        }
      }
    });
  }

  function classifyClickIntent(el, label) {
    var href = (el.href || '').toLowerCase();
    var lower = label.toLowerCase();
    if (/checkout|comprar|buy|purchase|pagar|finalizar|add.to.cart|agregar.al.carrito|adicionar.ao.carrinho|order.now|pedir.ahora|compre.agora|place.order|realizar.pedido|finalizar.compra|proceed.to.payment|ir.al.pago|ir.para.pagamento/i.test(lower) || /checkout|comprar|buy|cart|carrito|carrinho|order|pedido|payment|pago|pagamento/i.test(href)) return 'checkout_open';
    if (/support|suporte|soporte|help|ajuda|ayuda|contact|contato|contacto|faq|chat.with.us|fale.conosco|habla.con.nosotros|customer.service|atendimento|atencion.al.cliente|live.chat|chat.en.vivo|assistant|asistente|assistente/i.test(lower) || /support|help|contact|faq|soporte|suporte|ayuda|ajuda|contacto|contato|chat|atendimento/i.test(href)) return 'support_open';
    if (/policy|privacy|terms|refund|return|politica|termos|privacidad|condiciones|reembolso|devolucion|devolucao|reembolso|terms.of.service|termos.de.servico|terminos.de.servicio|privacy.policy|politica.de.privacidad|politica.de.privacidade|warranty|garantia|garantia|shipping.policy|politica.de.envio|politica.de.envio|cookie|lgpd|gdpr/i.test(lower) || /policy|privacy|terms|refund|return|politica|termos|privacidad|condiciones|reembolso|devolucion|devolucao|warranty|garantia|cookie|lgpd|gdpr/i.test(href)) return 'policy_open';
    // Everything above is classified from the href or the label, so it
    // means something commercially. This last step used to return
    // 'cta_click' for any anchor, button or [role=button] at all, which
    // made carousel arrows, menu toggles and close buttons count as
    // commercial actions.
    //
    // That was not only noise. A 'cta_click' sets
    // firstCommercialActionTimestamp and advances the session to the
    // intent_expressed milestone, so clicking "Próxima" on an image
    // carousel marked the visitor as having expressed purchase intent.
    // Measured on one production store: of 12,795 recorded cta_click
    // events, 24 had a commercial label — the rest were "Próxima",
    // "Anterior", "Abrir menu", "Fechar" and untitled anchors.
    //
    // A CTA now has to look like one. Elements that fail this are still
    // tracked as dead clicks, form interactions and scroll depth; they
    // just no longer claim intent the visitor never expressed.
    if (isPrimaryCta(el)) return 'cta_click';
    return null;
  }

  // ── CTA Visibility / Operability Tracking ──
  //
  // What counts as a CTA here feeds cta_viewed_count, which the engine
  // divides cta_clicked_count by to produce an engagement rate (see
  // cta_viewed_not_engaged in packages/signals/engine.ts). So a loose
  // definition does not just cost storage — it inflates the denominator
  // with elements nobody was ever supposed to click and reports the page
  // as unpersuasive when it is fine.
  //
  // The previous rule observed every BUTTON and INPUT on the page. On a
  // real storefront that is the menu toggle, carousel arrows, accordion
  // headers, quantity steppers and the cookie banner. Measured on one
  // production site: 7.2 cta_viewed per page view, 58% of all pixel
  // traffic at ~35k events/day.
  //
  // Now an element has to look commercial — a checkout/support/policy
  // destination, or CTA-shaped text — to be worth observing.
  function isCommercialCta(el) {
    var label = semanticLabel(el);
    var intent = classifyClickIntent(el, label);
    // These three are commercially meaningful by construction: they are
    // classified off the href/label, not off the tag name.
    if (intent === 'checkout_open' || intent === 'support_open' || intent === 'policy_open') {
      return true;
    }
    return isPrimaryCta(el);
  }

  function bindCtaVisibilityTracking() {
    if (typeof IntersectionObserver === 'undefined') return;

    var ctas = document.querySelectorAll('a[href], button, [role="button"], input[type="submit"]');
    if (ctas.length === 0) return;

    // Backstop for pathological pages (infinite product grids, page
    // builders that wrap every tile in a CTA-worded button). The
    // engagement-rate signal saturates well before this.
    var MAX_CTA_VIEWED_PER_PAGE = 12;
    var ctaViewedCount = 0;

    ctaObserver = new IntersectionObserver(function(entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.isIntersecting) {
          if (ctaViewedCount >= MAX_CTA_VIEWED_PER_PAGE) return;
          var el = entry.target;
          var key = semanticLabel(el).slice(0, 40);
          if (!ctaViewedSet[key]) {
            ctaViewedSet[key] = Date.now();
            ctaViewedCount++;
            emit('cta_viewed', {
              url: canonicalUrl(),
              label: key,
              is_disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
            });
          }
        }
      }
    }, { threshold: 0.5 });

    for (var j = 0; j < ctas.length; j++) {
      if (isCommercialCta(ctas[j])) {
        ctaObserver.observe(ctas[j]);
      }
    }
  }

  function isPrimaryCta(el) {
    var text = (el.textContent || '').toLowerCase().trim();
    return /buy|purchase|order now|add to cart|sign up|start|get started|subscribe|register|checkout|try.free|free trial|demo|request.demo|book.a.demo|contact.us|contact.sales|talk.to.sales|talk.to.an?.expert|get.in.touch|send.message|call.us|chat.with|speak.to|schedule.a.call|book.a.call|book.a.meeting|request.a.quote|get.a.quote|comprar|compre|compre j[aá]|pagar|assinar|cadastr|registr|come[cç]ar|obter oferta|pedir cota[cç][aã]o|agendar|experimentar|testar|aproveitar|baixar|assistir|ver agora|fale conosco|falar com|contatar|enviar mensagem|chamar no whatsapp|atendimento|ligar agora|agende.uma.reuni[aã]o|solicitar or[cç]amento|iniciar|contratar|adquirir|comprar ahora|suscribir|registrarse|empezar|obtener|solicitar|probar|descargar|contratar|contactar|hablar con|llamar|enviar mensaje|chatear|agendar.una.llamada|solicitar.cotizaci[oó]n|hablar.con.ventas|atenci[oó]n/i.test(text);
  }

  function checkLateCtaRendering() {
    var ctas = document.querySelectorAll('button, [role="button"], input[type="submit"]');
    for (var i = 0; i < ctas.length; i++) {
      var cta = ctas[i];
      if (isPrimaryCta(cta)) {
        // Check if CTA was added to DOM late (after load threshold)
        // We use the fact that this function runs after CTA_LATE_THRESHOLD_MS
        var rect = cta.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          // CTA exists now — check if it was dynamically inserted late
          if (!cta._vgEarlyPresent) {
            emit('cta_rendered_late', {
              url: canonicalUrl(),
              label: semanticLabel(cta).slice(0, 40),
              render_delay_ms: CTA_LATE_THRESHOLD_MS,
            });
          }
        }
      }
    }
  }

  // Mark CTAs present at load time
  function markEarlyCtAs() {
    try {
      var ctas = document.querySelectorAll('button, [role="button"], input[type="submit"]');
      for (var i = 0; i < ctas.length; i++) {
        ctas[i]._vgEarlyPresent = true;
      }
    } catch(e) {}
  }

  // ── Hesitation / Friction Detection ──
  function bindHesitationTracking() {
    // Track mouse/keyboard idle as hesitation before CTA areas
    var hesitationTimer = null;

    document.addEventListener('mousemove', function() {
      lastActivityTime = Date.now();
      clearTimeout(hesitationTimer);
      hesitationTimer = setTimeout(function() {
        // Check if we are near a CTA
        var activeEl = document.elementFromPoint(
          window.innerWidth / 2, window.innerHeight / 2
        );
        if (activeEl) {
          var nearCta = activeEl.closest('button, a[href], [role="button"], input[type="submit"]');
          if (nearCta || isOnCommercialSurface()) {
            emit('hesitation_pause', {
              url: canonicalUrl(),
              pause_ms: HESITATION_THRESHOLD_MS,
              near_cta: !!nearCta,
              surface_type: classifyJourneyType(window.location.pathname),
            });
          }
        }
      }, HESITATION_THRESHOLD_MS);
    }, { passive: true });

    document.addEventListener('keydown', function() {
      lastActivityTime = Date.now();
      clearTimeout(hesitationTimer);
    }, { passive: true });
  }

  function isOnCommercialSurface() {
    var p = window.location.pathname.toLowerCase();
    return /\/(checkout|cart|pricing|product|shop|store|billing|purchase|loja|carrinho|order|precos|planos)/i.test(p);
  }

  // ── Form Tracking (extended with field inventory) ──
  function bindFormTracking() {
    document.addEventListener('focusin', function(e) {
      var input = e.target;
      if (!input || !input.closest) return;
      var form = input.closest('form');

      if (form && !trackedForms[formKey(form)]) {
        trackedForms[formKey(form)] = true;

        // Emit field inventory: counts and boolean flags only.
        // field_kinds is intentionally omitted to prevent leaking
        // the customer's form schema (which fields they collect).
        var inventory = buildFieldInventory(form);
        emit('field_inventory', {
          url: canonicalUrl(),
          field_count: inventory.field_count,
          sensitive_field_count: inventory.field_kinds.filter(function(k) {
            return k === 'email' || k === 'phone' || k === 'cpf_cnpj_like' || k === 'card_like';
          }).length,
          has_sensitive: inventory.has_sensitive_fields,
          has_password: inventory.has_password,
          has_card_like: inventory.has_card_like,
          has_freeform_message: inventory.has_freeform_message,
        });

        emit('form_start', {
          url: canonicalUrl(),
          has_payment_fields: inventory.has_card_like,
          field_count: inventory.field_count,
          has_sensitive: inventory.has_sensitive_fields,
        });

        // Track first commercial action on form start
        if (!firstCommercialActionTimestamp) {
          firstCommercialActionTimestamp = Date.now();
          persistSessionState();
        }

        // Bind submit tracking with retry detection + error capture
        form.addEventListener('submit', function(e) {
          var key = formKey(form);
          formSubmitCounts[key] = (formSubmitCounts[key] || 0) + 1;
          if (formSubmitCounts[key] > 1) {
            emit('form_retry', {
              url: canonicalUrl(),
              attempt_number: formSubmitCounts[key],
            });
          } else {
            emit('form_submit', { url: canonicalUrl() });
          }
        });

        // Capture client-side validation errors (HTML5 constraint API)
        form.addEventListener('invalid', function(e) {
          if (e.target && e.target.validationMessage) {
            emit('form_error', {
              url: canonicalUrl(),
              error_source: 'validation',
              field_kind: classifyFieldKind(e.target),
            });
          }
        }, true);
      }

      // Track input focus abandon for sensitive fields
      if (input.tagName === 'INPUT' || input.tagName === 'SELECT' || input.tagName === 'TEXTAREA') {
        var fieldKind = classifyFieldKind(input);
        if (isSensitiveFieldKind(fieldKind)) {
          trackSensitiveFieldFocus(input, fieldKind);
        }
      }
    });
  }

  function formKey(form) {
    return form.id || form.action || ('form_' + form.querySelectorAll('input').length);
  }

  function buildFieldInventory(form) {
    var inputs = form.querySelectorAll('input, select, textarea');
    var kinds = [];
    var hasSensitive = false;
    var hasPassword = false;
    var hasCardLike = false;
    var hasFreeform = false;

    for (var i = 0; i < inputs.length; i++) {
      var kind = classifyFieldKind(inputs[i]);
      if (kind !== 'other' && kinds.indexOf(kind) === -1) kinds.push(kind);
      if (kind === 'password') hasPassword = true;
      if (kind === 'card_like') hasCardLike = true;
      if (kind === 'freeform_message') hasFreeform = true;
      if (isSensitiveFieldKind(kind)) hasSensitive = true;
    }

    return {
      field_count: inputs.length,
      field_kinds: kinds,
      has_sensitive_fields: hasSensitive,
      has_password: hasPassword,
      has_card_like: hasCardLike,
      has_freeform_message: hasFreeform,
    };
  }

  function classifyFieldKind(input) {
    var type = (input.type || '').toLowerCase();
    var name = (input.name || '').toLowerCase();
    var id = (input.id || '').toLowerCase();
    var auto = (input.autocomplete || '').toLowerCase();
    var placeholder = (input.placeholder || '').toLowerCase();
    var combined = name + ' ' + id + ' ' + auto + ' ' + placeholder;

    if (type === 'password') return 'password';
    if (type === 'email' || /email|e-mail|correo/i.test(combined)) return 'email';
    if (type === 'tel' || /phone|telefone|celular|mobile|tel[eé]fono|whatsapp|m[oó]vil/i.test(combined)) return 'phone';
    if (/card|cvv|cvc|expir|cc-|credit|billing.*number|tarjeta|cart[aã]o|n[uú]mero.?do.?cart[aã]o/i.test(combined)) return 'card_like';
    if (/cpf|cnpj|ssn|tax.?id|document|rut|dni|c[eé]dula|nit|rfc|curp|identidad/i.test(combined)) return 'cpf_cnpj_like';
    if (/coupon|cupom|cup[oó]n|promo|discount|desconto|descuento|voucher|c[oó]digo.?promocional/i.test(combined)) return 'coupon';
    if (/company|empresa|organization|organiza[cç][aã]o|raz[aã]o.?social|nombre.?empresa/i.test(combined)) return 'company';
    if (/address|endere[cç]o|rua|street|cep|zip|postal|direcci[oó]n|calle|colonia|bairro|cidade|city|ciudad|estado|state|provincia|c[oó]digo.?postal/i.test(combined)) return 'address';
    if (/name|nome|nombre|first.?name|last.?name|full.?name|nome.?completo|nombre.?completo|sobrenome|apellido/i.test(combined)) return 'name';
    if (input.tagName === 'TEXTAREA' || /message|mensagem|mensaje|comment|coment[aá]rio|description|descri[cç][aã]o|descripci[oó]n|observa[cç][oõ]es|observaciones|detalhes|detalles/i.test(combined)) return 'freeform_message';
    return 'other';
  }

  function isSensitiveFieldKind(kind) {
    return kind === 'password' || kind === 'card_like' || kind === 'cpf_cnpj_like' ||
           kind === 'email' || kind === 'phone' || kind === 'address';
  }

  function trackSensitiveFieldFocus(input, fieldKind) {
    var focusTime = Date.now();
    function onBlurOrLeave() {
      input.removeEventListener('blur', onBlurOrLeave);
      // Check if form was submitted (in which case this is not an abandon)
      setTimeout(function() {
        var form = input.closest('form');
        if (form) {
          var key = formKey(form);
          if (!formSubmitCounts[key]) {
            // No submission happened after focusing sensitive field
            var timeOnField = Date.now() - focusTime;
            if (timeOnField > 1000) { // Only if they spent >1s on the field
              emit('input_focus_abandon', {
                url: canonicalUrl(),
                field_kind: fieldKind,
                time_on_field_ms: timeOnField,
              });
            }
          }
        }
      }, 2000); // Wait 2s to check if submit happened
    }
    input.addEventListener('blur', onBlurOrLeave, { once: true });
  }

  // ── Handoff / Trust Continuity Detection ──
  function bindHandoffDetection() {
    // Detect navigation away to trusted checkout providers
    document.addEventListener('click', function(e) {
      var link = e.target && e.target.closest('a[href]');
      if (!link) return;

      try {
        var href = new URL(link.href, window.location.origin);
        if (href.hostname !== window.location.hostname) {
          var isTrusted = TRUSTED_CHECKOUT_HOSTS.some(function(h) {
            return href.hostname === h || href.hostname.endsWith('.' + h);
          });
          if (isTrusted || isCheckoutLikeUrl(href.pathname)) {
            handoffStarted = true;
            handoffTarget = href.hostname;
            emit('trusted_handoff', {
              url: canonicalUrl(),
              target_host: href.hostname,
              provider_guess: guessProvider(href.hostname),
            });
          }
        }
      } catch(ex) {}
    });

    // Detect return from handoff
    window.addEventListener('focus', function() {
      if (handoffStarted) {
        handoffStarted = false;
        // Check if we came back with confirmation
        setTimeout(function() {
          checkConfirmation();
        }, 1000);
      }
    });
  }

  function isCheckoutLikeUrl(path) {
    return /checkout|payment|pay|billing|comprar|seguro|pagar/i.test(path);
  }

  function guessProvider(hostname) {
    if (/stripe/i.test(hostname)) return 'stripe';
    if (/paypal/i.test(hostname)) return 'paypal';
    if (/shopify/i.test(hostname)) return 'shopify';
    if (/square/i.test(hostname)) return 'square';
    if (/mercadopago/i.test(hostname)) return 'mercadopago';
    if (/pagseguro/i.test(hostname)) return 'pagseguro';
    if (/pagar\.me/i.test(hostname)) return 'pagarme';
    if (/braintree/i.test(hostname)) return 'braintree';
    return null;
  }

  // ── Journey Type Classification ──
  function classifyJourneyType(pathname) {
    var p = (pathname || '').toLowerCase();
    for (var type in JOURNEY_PATTERNS) {
      if (JOURNEY_PATTERNS[type].test(p)) return type;
    }
    return null;
  }

  // ── Visibility ──
  function bindVisibility() {
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        emit('page_leave', { time_on_page_ms: Date.now() - pageEntryTime, visibility: true });
      }
    });
  }

  // ── Semantic Label Extraction (NO PII) ──
  function semanticLabel(el) {
    return (
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      (el.textContent || '').trim().slice(0, 60) ||
      el.tagName.toLowerCase()
    );
  }

  // ── Event Emission ──
  function emit(type, data) {
    if (!consentGranted) return;
    queue.push({
      type: type,
      ts: Date.now(),
      session_id: sessionId,
      env_id: envId,
      url: data.url || canonicalUrl(),
      data: data,
    });
    if (queue.length >= MAX_BATCH_SIZE) flush();
  }

  // ── IndexedDB Offline Queue ──
  //
  // When a flush fails (network down, server error), the batch is
  // persisted to IndexedDB so it can be retried later. On the next
  // successful flush, any queued batches are drained first.
  var IDB_NAME = 'vestigio_offline';
  var IDB_STORE = 'batches';
  var IDB_VERSION = 1;
  var offlineDb = null;

  function openOfflineDb(cb) {
    if (offlineDb) return cb(offlineDb);
    if (!window.indexedDB) return cb(null);
    try {
      var req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = function(e) {
        e.target.result.createObjectStore(IDB_STORE, { autoIncrement: true });
      };
      req.onsuccess = function(e) { offlineDb = e.target.result; cb(offlineDb); };
      req.onerror = function() { cb(null); };
    } catch(e) { cb(null); }
  }

  function saveToOffline(payload) {
    openOfflineDb(function(db) {
      if (!db) return;
      try {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).add(payload);
      } catch(e) {}
    });
  }

  function drainOffline() {
    openOfflineDb(function(db) {
      if (!db) return;
      try {
        var tx = db.transaction(IDB_STORE, 'readwrite');
        var store = tx.objectStore(IDB_STORE);
        var req = store.getAll();
        req.onsuccess = function() {
          var items = req.result || [];
          if (items.length === 0) return;
          store.clear();
          for (var i = 0; i < items.length; i++) {
            sendPayload(items[i], 0);
          }
        };
      } catch(e) {}
    });
  }

  // ── Batch Flush ──
  var MAX_RETRIES = 3;

  function sendPayload(payload, attempt) {
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
      }).then(function(resp) {
        if (resp.ok || resp.status === 204) {
          drainOffline();
        } else if (attempt < MAX_RETRIES) {
          var delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          setTimeout(function() { sendPayload(payload, attempt + 1); }, delay);
        } else {
          saveToOffline(payload);
        }
      }).catch(function() {
        if (attempt < MAX_RETRIES) {
          var delay = Math.min(1000 * Math.pow(2, attempt), 8000);
          setTimeout(function() { sendPayload(payload, attempt + 1); }, delay);
        } else {
          saveToOffline(payload);
        }
      });
    } catch(e) {
      saveToOffline(payload);
    }
  }

  function flush(sync) {
    if (!consentGranted) return;
    if (queue.length === 0) return;
    var batch = queue.splice(0, MAX_BATCH_SIZE);
    var payload = JSON.stringify({
      events: batch,
      attribution: attribution,
      session_id: sessionId,
      env_id: envId,
    });

    if (sync && navigator.sendBeacon) {
      navigator.sendBeacon(ENDPOINT, payload);
    } else {
      sendPayload(payload, 0);
    }
  }

  // ── Boot ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      markEarlyCtAs();
      init();
    });
  } else {
    markEarlyCtAs();
    init();
  }
})();
