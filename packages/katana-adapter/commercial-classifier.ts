import {
  KatanaRawResult,
  KatanaClassifiedRoute,
  CommercialDiscoveryFamily,
  RouteIntent,
  DiscoveryMethod,
} from './types';

// ──────────────────────────────────────────────
// Commercial Classifier
//
// Transforms raw Katana URLs into commercially
// meaningful classified routes. Only commercially
// relevant discoveries pass through.
//
// Multilingual: covers English, Portuguese (BR),
// and Spanish route naming conventions.
// ──────────────────────────────────────────────

// Route intent detection patterns (multilingual)
const INTENT_PATTERNS: { intent: RouteIntent; patterns: RegExp[] }[] = [
  {
    intent: 'cart',
    patterns: [
      /\/(cart|carrinho|carrito|cesta|basket|bag|sacola)/i,
      /[?&](add.?to.?cart|quantity|qty)/i,
    ],
  },
  {
    intent: 'checkout',
    patterns: [
      /\/(checkout|check-out|pagamento|pagar|comprar|purchase|buy|finalizar)/i,
      /\/(payment|pay|stripe|paypal)/i,
    ],
  },
  {
    intent: 'coupon_discount',
    patterns: [
      /\/(coupon|cupom|cupon|discount|desconto|descuento|promo|promocao|promocion|voucher|gift.?card|vale)/i,
      /[?&](coupon|cupom|cupon|discount|promo|code|codigo)/i,
      /\/(apply.?coupon|validate.?coupon|redeem|resgatar|canjear)/i,
    ],
  },
  {
    intent: 'refund_return',
    patterns: [
      /\/(refund|reembolso|devolucion|return|devolucao|troca|exchange|cambio|cancel|cancelar)/i,
      /\/(request.?refund|initiate.?return|solicitar.?reembolso)/i,
    ],
  },
  {
    intent: 'billing',
    patterns: [
      /\/(billing|fatura|factura|invoice|nota.?fiscal|subscription|assinatura|suscripcion|plan)/i,
      /\/(upgrade|downgrade|change.?plan|alterar.?plano|cambiar.?plan)/i,
    ],
  },
  {
    intent: 'order_confirmation',
    patterns: [
      /\/(order|pedido|confirmation|confirmacao|confirmacion|receipt|recibo|thank.?you|obrigado|gracias)/i,
      /\/(order.?status|track|rastrear|rastreo|shipping.?status)/i,
    ],
  },
  {
    intent: 'support_help',
    patterns: [
      /\/(support|suporte|soporte|help|ajuda|ayuda|faq|contact|contato|contacto|atendimento)/i,
      /\/(ticket|chat|live.?chat|helpdesk|knowledge.?base|central.?de.?ajuda)/i,
    ],
  },
  {
    intent: 'account_action',
    patterns: [
      /\/(account|conta|cuenta|profile|perfil|settings|configuracoes|configuraciones)/i,
      /\/(login|signin|sign.?in|register|cadastro|registro|password|senha|contrasena)/i,
    ],
  },
  {
    intent: 'pricing',
    patterns: [
      /\/(pricing|precos|precios|plans|planos|planes|tarifa)/i,
    ],
  },
  {
    intent: 'product',
    patterns: [
      /\/(product|produto|producto|item|shop|loja|tienda|catalog|catalogo)/i,
    ],
  },
];

// Discovery family classification based on intent + discovery signals
const FAMILY_RULES: {
  family: CommercialDiscoveryFamily;
  intents: RouteIntent[];
  extraCondition?: (url: string, raw: KatanaRawResult) => boolean;
}[] = [
  {
    family: 'pricing_control',
    intents: ['coupon_discount', 'cart'],
    extraCondition: (url) =>
      /coupon|cupom|cupon|discount|desconto|promo|price|preco|precio|gift.?card|vale|voucher/i.test(url),
  },
  {
    family: 'safeguard_bypass',
    intents: ['checkout', 'billing', 'pricing'],
    extraCondition: (url) =>
      /alternate|alt|v2|beta|test|staging|old|legacy|direct|skip|bypass/i.test(url) ||
      /[?&](force|override|debug|test|mode)/i.test(url),
  },
  {
    family: 'business_logic_abuse',
    intents: ['account_action', 'order_confirmation', 'billing', 'refund_return'],
    extraCondition: (url) =>
      /api|endpoint|action|submit|process|execute|admin|internal/i.test(url),
  },
  {
    family: 'commerce_variant',
    intents: ['checkout', 'cart', 'pricing', 'product'],
  },
  {
    family: 'support_burden',
    intents: ['support_help'],
  },
];

// Guessability heuristic — does the URL follow a predictable/enumerable pattern?
const GUESSABLE_PATTERNS = [
  /\/\d+$/,                           // numeric ID
  /\/[a-f0-9-]{36}/i,                 // UUID
  /[?&](id|order|code|token)=[^&]+/i, // query param with identifiers
  /\/(v1|v2|api)\//i,                 // API versioning
  /\/(test|staging|dev|beta|old)\//i, // environment indicators
  /\/(admin|internal|debug|config)\//i, // operational paths
];

// Safeguard indicators — signs that the route has protection
const SAFEGUARD_INDICATORS = [
  /csrf|_token|nonce|authenticity/i,
  /captcha|recaptcha|hcaptcha/i,
  /auth|bearer|session|cookie/i,
  /rate.?limit|throttl/i,
];

/**
 * Classify raw Katana results into commercially meaningful discoveries.
 * Only commercially relevant routes pass through.
 */
export function classifyKatanaResults(
  rawResults: KatanaRawResult[],
  knownUrls: Set<string>,
): KatanaClassifiedRoute[] {
  const classified: KatanaClassifiedRoute[] = [];

  for (const raw of rawResults) {
    // Skip non-page content
    if (raw.status_code >= 400 && raw.status_code !== 403) continue;
    if (raw.content_type && !raw.content_type.includes('html') && !raw.content_type.includes('json')) continue;

    // Classify intent
    const intent = classifyIntent(raw.url);
    if (intent === 'unknown') continue; // only commercially relevant

    // Classify family
    const family = classifyFamily(raw.url, raw, intent);
    if (!family) continue;

    // Determine if net-new
    const normalizedUrl = normalizeUrl(raw.url);
    const isNetNew = !knownUrls.has(normalizedUrl);

    // Determine commercial surface
    const isCommercial = isCommercialSurface(raw.url);

    // Guessability check
    const appearsGuessable = GUESSABLE_PATTERNS.some(p => p.test(raw.url));

    // Safeguard check (basic heuristic from URL patterns)
    const hasVisibleSafeguards = SAFEGUARD_INDICATORS.some(p => p.test(raw.url));

    // Confidence: net-new JS-discovered routes on commercial surfaces get higher confidence
    let confidence = 45;
    if (isNetNew) confidence += 15;
    if (isCommercial) confidence += 10;
    if (raw.source === 'script' || raw.source === 'xhr') confidence += 10;
    if (appearsGuessable && !hasVisibleSafeguards) confidence += 5;
    confidence = Math.min(90, confidence);

    classified.push({
      url: raw.url,
      discovery_method: mapDiscoveryMethod(raw.source),
      route_intent: intent,
      discovery_family: family,
      is_net_new: isNetNew,
      is_commercial_surface: isCommercial,
      confidence,
      commercial_interpretation: buildInterpretation(intent, family, isNetNew, appearsGuessable),
      appears_guessable: appearsGuessable,
      has_visible_safeguards: hasVisibleSafeguards,
    });
  }

  return classified;
}

function classifyIntent(url: string): RouteIntent {
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some(p => p.test(url))) return intent;
  }
  return 'unknown';
}

function classifyFamily(
  url: string,
  raw: KatanaRawResult,
  intent: RouteIntent,
): CommercialDiscoveryFamily | null {
  for (const rule of FAMILY_RULES) {
    if (!rule.intents.includes(intent)) continue;
    if (rule.extraCondition && !rule.extraCondition(url, raw)) continue;
    return rule.family;
  }
  // Fallback: if intent is commercial but no specific family matched
  if (['checkout', 'cart', 'pricing', 'billing'].includes(intent)) {
    return 'commerce_variant';
  }
  if (['coupon_discount'].includes(intent)) {
    return 'pricing_control';
  }
  if (['refund_return'].includes(intent)) {
    return 'business_logic_abuse';
  }
  if (['support_help'].includes(intent)) {
    return 'support_burden';
  }
  return null;
}

function mapDiscoveryMethod(source: string): DiscoveryMethod {
  switch (source) {
    case 'script': return 'js_crawl';
    case 'xhr': return 'api_endpoint';
    case 'form': return 'form_action';
    default: return 'js_crawl';
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}${u.pathname}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

function isCommercialSurface(url: string): boolean {
  return /checkout|cart|pay|payment|billing|order|purchase|pricing|login|comprar|pedido|carrinho|carrito|pagamento|pagar/i.test(url);
}

function buildInterpretation(
  intent: RouteIntent,
  family: CommercialDiscoveryFamily,
  isNetNew: boolean,
  appearsGuessable: boolean,
): string {
  const prefix = isNetNew ? 'Deep discovery revealed' : 'Confirmed';
  const guessNote = appearsGuessable ? ' following a guessable/predictable pattern' : '';

  switch (family) {
    case 'pricing_control':
      return `${prefix} a ${intent.replace('_', '/')} route${guessNote} that may allow discount or pricing manipulation outside intended controls`;
    case 'business_logic_abuse':
      return `${prefix} a business-critical ${intent.replace('_', '/')} endpoint${guessNote} reachable outside the expected safeguard envelope`;
    case 'commerce_variant':
      return `${prefix} an alternate ${intent.replace('_', '/')} path${guessNote} that may operate outside the main trust and measurement model`;
    case 'support_burden':
      return `${prefix} support/help infrastructure${guessNote} structurally separated from the commercial journey`;
    case 'safeguard_bypass':
      return `${prefix} an alternate commercial action${guessNote} that may bypass intended pricing or trust safeguards`;
    default:
      return `${prefix} a commercially relevant ${intent.replace('_', '/')} route${guessNote}`;
  }
}
