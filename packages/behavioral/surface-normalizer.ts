import { Surface, SurfacePageType, SurfaceVariant } from './types';

// ──────────────────────────────────────────────
// Surface Normalizer
//
// Normalizes raw URLs into logical surfaces.
// Prevents URL explosion from tracking params,
// A/B tests, and decorations.
//
// Key rules:
// - Strip tracking params at surface level
// - Preserve attribution separately
// - Meaningful route params become variants
// - Classify commercial intent from path patterns
// ──────────────────────────────────────────────

// Params to strip entirely (tracking noise)
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'gclid', 'fbclid', '_ga', '_gl', 'mc_cid', 'mc_eid',
  'ref', 'affiliate', 'partner', 'click_id', 'dclid',
  'msclkid', 'twclid', 'li_fat_id', 'ttclid',
]);

// Params that indicate a variant (A/B, experiment)
const VARIANT_PARAMS = new Set([
  'variant', 'v', 'ab', 'experiment', 'test', 'version',
]);

// Page type classification (multilingual: EN, PT-BR, ES)
const PAGE_TYPE_PATTERNS: { type: SurfacePageType; patterns: RegExp[] }[] = [
  { type: 'checkout', patterns: [/\/(checkout|check-out|pagamento|pagar|comprar|purchase|finalizar)/i] },
  { type: 'cart', patterns: [/\/(cart|carrinho|carrito|cesta|basket|bag|sacola)/i] },
  { type: 'pricing', patterns: [/\/(pricing|precos|precios|plans|planos)/i] },
  { type: 'product', patterns: [/\/(product|produto|producto|item|shop|loja)/i] },
  { type: 'category', patterns: [/\/(category|categoria|collection|colecao)/i] },
  { type: 'support', patterns: [/\/(support|suporte|help|ajuda|contact|contato|faq)/i] },
  { type: 'policy', patterns: [/\/(policy|privacy|terms|refund|return|politica|termos)/i] },
  { type: 'account', patterns: [/\/(account|conta|login|signin|register|cadastro)/i] },
  { type: 'onboarding', patterns: [/\/(onboarding|welcome|setup|getting-started)/i] },
  { type: 'thank_you', patterns: [/\/(thank|obrigado|gracias|confirmation|confirmacao)/i] },
  { type: 'blog', patterns: [/\/(blog|article|artigo|post|news)/i] },
  { type: 'landing', patterns: [/\/(lp|landing|promo|offer|oferta)/i] },
];

const COMMERCIAL_TYPES: Set<SurfacePageType> = new Set([
  'checkout', 'cart', 'pricing', 'product', 'category', 'landing', 'thank_you',
]);

/**
 * Normalize a raw URL into a surface identity.
 */
export function normalizeSurface(rawUrl: string): {
  surface_id: string;
  normalized_path: string;
  host: string;
  page_type: SurfacePageType;
  is_commercial: boolean;
  variant: SurfaceVariant | null;
} {
  let url: URL;
  try {
    url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://placeholder${rawUrl}`);
  } catch {
    return {
      surface_id: `surface:unknown:${rawUrl.slice(0, 50)}`,
      normalized_path: rawUrl.slice(0, 100),
      host: 'unknown',
      page_type: 'unknown',
      is_commercial: false,
      variant: null,
    };
  }

  const host = url.hostname;
  const path = url.pathname.replace(/\/$/, '') || '/';

  // Strip tracking params, collect variant hints
  let variantHint: string | null = null;
  const cleanParams = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (TRACKING_PARAMS.has(key)) continue;
    if (VARIANT_PARAMS.has(key)) {
      variantHint = `${key}=${value}`;
      continue;
    }
    cleanParams.set(key, value);
  }

  // Build normalized path (without tracking, with meaningful params)
  const paramStr = cleanParams.toString();
  const normalizedPath = paramStr ? `${path}?${paramStr}` : path;

  // Surface ID: host + normalized path (stable identity)
  const surfaceId = `surface:${host}:${normalizedPath}`.toLowerCase();

  // Classify page type
  const pageType = classifyPageType(path);
  const isCommercial = COMMERCIAL_TYPES.has(pageType);

  // Build variant if detected
  let variant: SurfaceVariant | null = null;
  if (variantHint) {
    variant = {
      surface_id: surfaceId,
      variant_id: `${surfaceId}:${variantHint}`,
      variant_type: 'ab_test',
      raw_url: rawUrl,
      session_count: 0,
    };
  }

  return { surface_id: surfaceId, normalized_path: normalizedPath, host, page_type: pageType, is_commercial: isCommercial, variant };
}

/**
 * Classify page type from path patterns.
 */
export function classifyPageType(path: string): SurfacePageType {
  for (const { type, patterns } of PAGE_TYPE_PATTERNS) {
    if (patterns.some(p => p.test(path))) return type;
  }
  if (path === '/' || path === '') return 'homepage';
  return 'unknown';
}

/**
 * Build a display label for a surface.
 */
export function buildSurfaceLabel(path: string, pageType: SurfacePageType): string {
  if (path === '/') return 'Homepage';
  const labels: Record<SurfacePageType, string> = {
    homepage: 'Homepage',
    landing: 'Landing Page',
    product: 'Product Page',
    category: 'Category Page',
    cart: 'Cart',
    checkout: 'Checkout',
    pricing: 'Pricing',
    support: 'Support',
    policy: 'Policy Page',
    account: 'Account',
    onboarding: 'Onboarding',
    thank_you: 'Thank You',
    blog: 'Blog',
    unknown: path.split('/').filter(Boolean).pop() || 'Page',
  };
  const base = labels[pageType] || path;
  // Add path specificity
  const segments = path.split('/').filter(Boolean);
  if (segments.length > 1 && pageType !== 'unknown') {
    return `${base} (${segments.slice(-1)[0]})`;
  }
  return base;
}
