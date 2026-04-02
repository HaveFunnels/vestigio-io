/**
 * Vestigio Behavioral Intelligence Snippet v2.0
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

  // ── Init ──
  function init() {
    var script = document.querySelector('script[data-env]');
    if (!script) return;
    envId = script.getAttribute('data-env') || '';
    if (!envId) return;

    var customEndpoint = script.getAttribute('data-endpoint');
    if (customEndpoint) ENDPOINT = customEndpoint;

    sessionId = getOrCreateSession();
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
  function getOrCreateSession() {
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
    var attr = {
      source: params.get('utm_source') || null,
      medium: params.get('utm_medium') || null,
      campaign: params.get('utm_campaign') || null,
      referrer: document.referrer || null,
      landing_url: canonicalUrl(),
      gclid: params.get('gclid') || null,
      fbclid: params.get('fbclid') || null,
    };
    try {
      var firstTouch = localStorage.getItem('vg_first_touch');
      if (!firstTouch) {
        localStorage.setItem('vg_first_touch', JSON.stringify(attr));
      }
    } catch(e) {}
    return attr;
  }

  // ── URL Normalization ──
  function canonicalUrl() {
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) return canonical.href;
    var url = new URL(window.location.href);
    ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','gclid','fbclid','_ga','mc_cid','mc_eid'].forEach(function(p) {
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
      if (document.querySelector('[data-order-id], [data-confirmation], .order-confirmation, .purchase-success, #order-confirmed')) {
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
      var perf = {};
      if (window.performance && performance.timing) {
        var t = performance.timing;
        perf.dom_ready_ms = t.domContentLoadedEventEnd ? t.domContentLoadedEventEnd - t.navigationStart : null;
        perf.load_ms = t.loadEventEnd ? t.loadEventEnd - t.navigationStart : null;
      }
      var jsErrors = 0;
      var resourceErrors = 0;
      window.addEventListener('error', function(e) {
        if (e.filename) jsErrors++;
        else resourceErrors++;
      });
      emit('heartbeat', {
        url: canonicalUrl(),
        timing: perf,
        js_error_count: jsErrors,
        resource_error_count: resourceErrors,
        page_alive: true,
      });

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
    if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.getAttribute('role') === 'button') return 'cta_click';
    return null;
  }

  // ── CTA Visibility / Operability Tracking ──
  function bindCtaVisibilityTracking() {
    if (typeof IntersectionObserver === 'undefined') return;

    var ctas = document.querySelectorAll('a[href], button, [role="button"], input[type="submit"]');
    if (ctas.length === 0) return;

    ctaObserver = new IntersectionObserver(function(entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.isIntersecting) {
          var el = entry.target;
          var key = semanticLabel(el).slice(0, 40);
          if (!ctaViewedSet[key]) {
            ctaViewedSet[key] = Date.now();
            emit('cta_viewed', {
              url: canonicalUrl(),
              label: key,
              is_disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
            });
          }
        }
      }
    }, { threshold: 0.5 });

    // Only observe primary CTAs (buttons, submit inputs, prominent links)
    for (var j = 0; j < ctas.length; j++) {
      var cta = ctas[j];
      if (cta.tagName === 'BUTTON' || cta.tagName === 'INPUT' ||
          (cta.tagName === 'A' && cta.getAttribute('role') === 'button') ||
          isPrimaryCta(cta)) {
        ctaObserver.observe(cta);
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

        // Emit field inventory (structural only, no values)
        var inventory = buildFieldInventory(form);
        emit('field_inventory', {
          url: canonicalUrl(),
          field_count: inventory.field_count,
          field_kinds: inventory.field_kinds,
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

        // Bind submit tracking with retry detection
        form.addEventListener('submit', function() {
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

  // ── Batch Flush ──
  function flush(sync) {
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
      try {
        fetch(ENDPOINT, {
          method: 'POST',
          body: payload,
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
        }).catch(function() {});
      } catch(e) {}
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
