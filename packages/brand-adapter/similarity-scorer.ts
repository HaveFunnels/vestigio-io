import { BrandImpersonationCandidate, BrandThreatType, ImpersonationConfidence } from './types';
import { hasSensitiveTokens, hasPaymentTokens } from './domain-generator';

// ──────────────────────────────────────────────
// Similarity Scorer — Phase 3E.1 Upgrade
//
// Weighted multi-signal scoring model:
// - domain similarity: MEDIUM weight
// - brand token presence: MEDIUM weight
// - title similarity: MEDIUM weight
// - favicon similarity: HIGH weight
// - commerce signals: HIGH weight
// - sensitive path detection: HIGH weight
// - credential/payment capture: VERY HIGH weight
//
// Phishing patterns (login/payment + brand) can
// reach high confidence even with moderate domain
// similarity. Visual match (favicon + title)
// strongly boosts score.
// ──────────────────────────────────────────────

// Weighted scoring model
const WEIGHTS = {
  domain_similarity_high: 25,     // domain sim > 80
  domain_similarity_medium: 15,   // domain sim > 60
  domain_similarity_low: 8,       // domain sim > 40
  brand_token_presence: 15,
  title_similarity_high: 18,      // title sim > 60
  title_similarity_medium: 10,    // title sim > 30
  favicon_match: 22,              // HIGH — visual match is strong indicator
  favicon_similar: 12,            // favicon sim > 50
  commerce_signals: 18,           // HIGH — commerce intent is strong indicator
  sensitive_path: 20,             // HIGH — login/payment/verify paths
  credential_capture: 28,         // VERY HIGH — password/form capture
  payment_capture: 28,            // VERY HIGH — card/payment form capture
  brand_keyword_density_high: 12, // density > 3
  brand_keyword_density_med: 6,   // density > 1
  is_active: 3,
};

// Marketplace domains to suppress (false positive reduction)
const MARKETPLACE_SUPPRESSION = /\b(amazon|mercadolivre|mercadoliber|ebay|aliexpress|shopee|magalu|americanas|submarino|casasbahia|walmart)\b/i;

/**
 * Enrichment data extracted from fetched HTML.
 */
export interface HtmlEnrichment {
  title: string | null;
  faviconUrl: string | null;
  hasCredentialCapture: boolean;
  hasPaymentCapture: boolean;
  hasSensitivePath: boolean;
  brandKeywordDensity: number;
  hasCommerceSignals: boolean;
}

/**
 * Extract enrichment signals from raw HTML + URL.
 * Lightweight — operates on first 10KB of HTML.
 */
export function extractHtmlEnrichment(
  html: string,
  url: string,
  brandTokens: string[],
): HtmlEnrichment {
  const snippet = html.slice(0, 10000);
  const lowerSnippet = snippet.toLowerCase();

  // Title
  const titleMatch = snippet.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim().slice(0, 200) : null;

  // Favicon
  const faviconMatch = snippet.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i)
    || snippet.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);
  const faviconUrl = faviconMatch ? faviconMatch[1] : null;

  // Credential capture: password inputs, login forms
  const hasCredentialCapture =
    /input[^>]*type=["']password["']/i.test(snippet) ||
    (/form/i.test(snippet) && /login|signin|sign.?in|entrar|acesso/i.test(snippet));

  // Payment capture: card inputs, payment forms
  const hasPaymentCapture =
    /input[^>]*(?:name|id|placeholder)=["'][^"']*(?:card|cvv|cvc|expir|cc-|credit)/i.test(snippet) ||
    (/form/i.test(snippet) && /payment|pagamento|checkout|billing|pagar/i.test(snippet));

  // Sensitive path in URL
  const hasSensitivePath = /\/(login|signin|account|checkout|payment|verify|update|auth|secure|confirmar|validar|pagamento)\b/i.test(url);

  // Brand keyword density
  let brandMentions = 0;
  for (const token of brandTokens) {
    const regex = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const matches = lowerSnippet.match(regex);
    if (matches) brandMentions += matches.length;
  }
  // Also check title
  if (title) {
    for (const token of brandTokens) {
      if (title.toLowerCase().includes(token.toLowerCase())) brandMentions += 2; // title mentions count more
    }
  }
  const brandKeywordDensity = brandMentions;

  // Commerce signals
  const hasCommerceSignals = /checkout|cart|buy|shop|store|comprar|carrinho|pedido|price|pricing|add.to.cart|comprar|pagar/i.test(snippet);

  return {
    title,
    faviconUrl,
    hasCredentialCapture,
    hasPaymentCapture,
    hasSensitivePath,
    brandKeywordDensity,
    hasCommerceSignals,
  };
}

/**
 * Compare favicon URLs for similarity.
 * Returns similarity score 0-100.
 */
export function computeFaviconSimilarity(
  candidateFavicon: string | null,
  rootFavicon: string | null,
): number | null {
  if (!candidateFavicon || !rootFavicon) return null;

  // Normalize: strip query params, protocol, and size indicators
  const normalize = (url: string) =>
    url.replace(/^https?:\/\//, '').replace(/\?.*$/, '').replace(/-\d+x\d+/, '').toLowerCase();

  const a = normalize(candidateFavicon);
  const b = normalize(rootFavicon);

  if (a === b) return 100;

  // Check if paths are the same (different hosts)
  const pathA = a.replace(/^[^/]+/, '');
  const pathB = b.replace(/^[^/]+/, '');
  if (pathA === pathB && pathA.length > 5) return 80;

  // Check filename match
  const fileA = a.split('/').pop() || '';
  const fileB = b.split('/').pop() || '';
  if (fileA === fileB && fileA.length > 3) return 60;

  return 0;
}

/**
 * Compute overall impersonation score for a candidate.
 * Uses weighted multi-signal model.
 */
export function scoreCandidate(
  domain: string,
  rootDomain: string,
  brandTokens: string[],
  httpStatus: number | null,
  enrichment: HtmlEnrichment | null,
  rootTitle: string | null,
  rootFavicon: string | null,
): BrandImpersonationCandidate {
  const domainSim = computeDomainSimilarity(domain, rootDomain);
  const hasBrandTokens = brandTokens.some(t => domain.toLowerCase().includes(t.toLowerCase()));
  const isActive = httpStatus !== null && httpStatus >= 200 && httpStatus < 500;

  // Enrichment-derived signals (null if page not fetched)
  const titleSim = enrichment?.title && rootTitle ? computeTextSimilarity(enrichment.title, rootTitle) : null;
  const faviconSim = enrichment?.faviconUrl ? computeFaviconSimilarity(enrichment.faviconUrl, rootFavicon) : null;
  const faviconMatch = faviconSim !== null && faviconSim >= 60;
  const hasCommerceSignals = enrichment?.hasCommerceSignals || false;
  const hasCredentialCapture = enrichment?.hasCredentialCapture || false;
  const hasPaymentCapture = enrichment?.hasPaymentCapture || false;
  const hasSensitivePath = enrichment?.hasSensitivePath || hasSensitiveTokens(domain);
  const brandDensity = enrichment?.brandKeywordDensity || 0;

  // ── Weighted confidence scoring ──
  let score = 0;

  // Domain similarity (MEDIUM)
  if (domainSim > 80) score += WEIGHTS.domain_similarity_high;
  else if (domainSim > 60) score += WEIGHTS.domain_similarity_medium;
  else if (domainSim > 40) score += WEIGHTS.domain_similarity_low;

  // Brand token presence (MEDIUM)
  if (hasBrandTokens) score += WEIGHTS.brand_token_presence;

  // Title similarity (MEDIUM)
  if (titleSim !== null && titleSim > 60) score += WEIGHTS.title_similarity_high;
  else if (titleSim !== null && titleSim > 30) score += WEIGHTS.title_similarity_medium;

  // Favicon match (HIGH)
  if (faviconMatch) score += WEIGHTS.favicon_match;
  else if (faviconSim !== null && faviconSim > 50) score += WEIGHTS.favicon_similar;

  // Commerce signals (HIGH)
  if (hasCommerceSignals) score += WEIGHTS.commerce_signals;

  // Sensitive path (HIGH) — login/payment/verify in URL
  if (hasSensitivePath) score += WEIGHTS.sensitive_path;

  // Credential capture (VERY HIGH) — password inputs, login forms
  if (hasCredentialCapture) score += WEIGHTS.credential_capture;

  // Payment capture (VERY HIGH) — card inputs, payment forms
  if (hasPaymentCapture) score += WEIGHTS.payment_capture;

  // Brand keyword density
  if (brandDensity > 3) score += WEIGHTS.brand_keyword_density_high;
  else if (brandDensity > 1) score += WEIGHTS.brand_keyword_density_med;

  // Active bonus
  if (isActive) score += WEIGHTS.is_active;

  // Cap at 100
  score = Math.min(100, score);

  // ── False positive suppression ──
  // Suppress generic marketplace domains
  if (MARKETPLACE_SUPPRESSION.test(domain)) {
    score = Math.min(score, 20);
  }
  // Suppress domains with no brand tokens AND low domain similarity AND no content signals
  if (!hasBrandTokens && domainSim < 40 && !hasCommerceSignals && !hasCredentialCapture && !hasPaymentCapture) {
    score = Math.min(score, 15);
  }

  // ── Classification ──
  const confidence: ImpersonationConfidence = score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low';
  const threatType = classifyThreatType(domain, rootDomain, brandTokens, domainSim, hasCredentialCapture, hasPaymentCapture, hasSensitivePath);

  return {
    domain,
    threat_type: threatType,
    is_active: isActive,
    http_status: httpStatus,
    domain_similarity: domainSim,
    has_brand_tokens: hasBrandTokens,
    title_similarity: titleSim,
    has_commerce_signals: hasCommerceSignals,
    favicon_match: faviconMatch,
    confidence,
    confidence_score: score,
    commercial_interpretation: buildInterpretation(domain, threatType, confidence, hasCommerceSignals, hasCredentialCapture, hasPaymentCapture),
    // Phase 3E.1 fields
    brand_keyword_density: brandDensity,
    has_sensitive_path: hasSensitivePath,
    has_credential_capture: hasCredentialCapture,
    has_payment_capture: hasPaymentCapture,
    favicon_similarity_score: faviconSim,
  };
}

function classifyThreatType(
  domain: string,
  rootDomain: string,
  brandTokens: string[],
  similarity: number,
  hasCredentialCapture: boolean,
  hasPaymentCapture: boolean,
  hasSensitivePath: boolean,
): BrandThreatType {
  // Phishing takes priority when credential/payment capture detected
  if (hasCredentialCapture || hasPaymentCapture) return 'phishing_pattern';
  if (hasSensitivePath && similarity > 50) return 'phishing_pattern';

  const rootBrand = rootDomain.replace(/\.(com|com\.br|net|org|co|io|app|store|shop)$/i, '');
  const candidateName = domain.replace(/\.(com|com\.br|net|org|co|io|app|store|shop)$/i, '');

  if (similarity > 85) return 'typosquat';
  if (/loja|store|shop|outlet|atacado|tienda|comprar|buy|pagamento|payment|checkout/i.test(candidateName)) return 'commercial_keyword';
  if (rootBrand === candidateName) return 'tld_variation';
  if (brandTokens.some(t => candidateName.includes(t))) return 'brand_interception';
  return 'commercial_keyword';
}

function computeDomainSimilarity(domain: string, rootDomain: string): number {
  const a = domain.replace(/\.[^.]+(\.[^.]+)?$/, '').toLowerCase();
  const b = rootDomain.replace(/\.[^.]+(\.[^.]+)?$/, '').toLowerCase();
  if (a === b) return 100;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  const dist = levenshteinDistance(a, b);
  return Math.max(0, Math.round((1 - dist / maxLen) * 100));
}

function computeTextSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let overlap = 0;
  for (const w of wordsA) { if (wordsB.has(w)) overlap++; }
  return Math.round((overlap / Math.max(wordsA.size, wordsB.size)) * 100);
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function buildInterpretation(
  domain: string,
  threatType: BrandThreatType,
  confidence: ImpersonationConfidence,
  hasCommerce: boolean,
  hasCredential: boolean,
  hasPayment: boolean,
): string {
  const prefix = confidence === 'high' ? 'Active' : confidence === 'medium' ? 'Potential' : 'Possible';
  const captureNote = hasPayment
    ? ' Page contains payment capture forms.'
    : hasCredential
    ? ' Page contains credential capture forms.'
    : '';

  switch (threatType) {
    case 'typosquat': return `${prefix} typosquat domain mimicking the brand. Users who mistype the URL land on ${domain}${hasCommerce ? ' which shows commerce intent' : ''}.${captureNote}`;
    case 'commercial_keyword': return `${prefix} brand+commerce keyword domain positioned to capture purchase-intent traffic.${captureNote}`;
    case 'tld_variation': return `${prefix} TLD variation of the brand domain. Traffic reaching the wrong TLD is diverted.${captureNote}`;
    case 'brand_interception': return `${prefix} domain intercepting brand-related search and direct traffic.${captureNote}`;
    case 'phishing_pattern': return `${prefix} phishing surface mimicking brand identity.${captureNote || ' High content or structural similarity to legitimate site.'}`;
    default: return `${prefix} lookalike domain with brand similarity.${captureNote}`;
  }
}
