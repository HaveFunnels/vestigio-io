import { URL } from 'url';
import { httpFetch, HttpResponse } from './http-client';
import { parsePage, ParsedPage, getRootDomain, isSameDomain, analyzePolicyContent } from './parser';
import {
  Evidence,
  EvidenceType,
  SourceKind,
  CollectionMethod,
  FreshnessState,
  PageType,
  Scoping,
  makeRef,
  Freshness,
  HttpResponsePayload,
  PageContentPayload,
  RedirectPayload,
  ScriptPayload,
  FormPayload,
  LinkPayload,
  IframePayload,
  CheckoutIndicatorPayload,
  ProviderIndicatorPayload,
  PlatformIndicatorPayload,
  PolicyPagePayload,
  InlineScriptContentPayload,
  StructuredDataItemPayload,
  TechnologyDetectedPayload,
} from '../../packages/domain';
import { detectTechnologies, DetectionInput, DetectedTechnology } from '../../packages/technology-registry';

// ──────────────────────────────────────────────
// Ingestion Pipeline — domain -> evidence
// ──────────────────────────────────────────────

export interface IngestionInput {
  domain: string;
  workspace_ref: string;
  environment_ref: string;
  website_ref: string;
  cycle_ref: string;
}

export interface IngestionResult {
  pages_fetched: number;
  evidence: Evidence[];
  errors: IngestionError[];
}

export interface IngestionError {
  url: string;
  error: string;
}

const CHECKOUT_TOKENS = [
  'checkout', 'cart', 'pay', 'payment', 'comprar', 'pedido',
  'order', 'billing', 'purchase', 'buy', 'carrinho',
];

const POLICY_TOKENS: Record<string, string> = {
  'privacy': 'privacy',
  'privacidade': 'privacy',
  'terms': 'terms',
  'termos': 'terms',
  'refund': 'refund',
  'reembolso': 'refund',
  'devolucao': 'refund',
  'return': 'refund',
  'shipping': 'shipping',
  'entrega': 'shipping',
  'frete': 'shipping',
  'cookie': 'cookie',
  'security': 'security',
  'seguranca': 'security',
};

const PROVIDER_PATTERNS: Record<string, RegExp[]> = {
  stripe: [/js\.stripe\.com/i, /stripe\.com/i],
  paypal: [/paypal\.com/i, /paypalobjects\.com/i],
  shopify: [/cdn\.shopify\.com/i, /checkout\.shopify\.com/i],
  mercadopago: [/mercadopago\.com/i, /mercadolibre\.com/i],
  pagseguro: [/pagseguro\.uol\.com\.br/i],
  braintree: [/braintreegateway\.com/i, /braintree-api\.com/i],
  square: [/squareup\.com/i, /square\.com/i],
  adyen: [/adyen\.com/i],
  woocommerce: [/woocommerce/i],
};

const PLATFORM_PATTERNS: Record<string, { regex: RegExp; source: string }[]> = {
  shopify: [
    { regex: /cdn\.shopify\.com/i, source: 'script' },
    { regex: /Shopify\.theme/i, source: 'html' },
  ],
  wordpress: [
    { regex: /wp-content/i, source: 'html' },
    { regex: /wp-includes/i, source: 'html' },
  ],
  woocommerce: [
    { regex: /woocommerce/i, source: 'html' },
    { regex: /wc-/i, source: 'html' },
  ],
  magento: [
    { regex: /mage\/cookies/i, source: 'html' },
    { regex: /Magento/i, source: 'html' },
  ],
  wix: [
    { regex: /wix\.com/i, source: 'script' },
    { regex: /parastorage\.com/i, source: 'script' },
  ],
  squarespace: [
    { regex: /squarespace\.com/i, source: 'script' },
    { regex: /sqsp/i, source: 'html' },
  ],
};

let evidenceCounter = 0;
function nextId(): string {
  return `ev_${Date.now()}_${++evidenceCounter}`;
}

export async function runIngestion(input: IngestionInput): Promise<IngestionResult> {
  const evidence: Evidence[] = [];
  const errors: IngestionError[] = [];
  const rootUrl = normalizeUrl(input.domain);
  const rootDomain = getRootDomain(new URL(rootUrl).hostname);
  const scoping = buildScoping(input);
  const allParsedPages: ParsedPage[] = []; // Phase 2B: accumulate for tech detection wiring

  // 1. Fetch homepage
  const homepageResult = await fetchAndParse(rootUrl, scoping, input.cycle_ref, evidence, errors);
  if (!homepageResult) {
    return { pages_fetched: 0, evidence, errors };
  }
  allParsedPages.push(homepageResult.parsed);

  // 2. Discover candidate pages from homepage links
  const candidateUrls = discoverCandidates(homepageResult.parsed, rootDomain, rootUrl);

  // 3. Fetch candidate pages
  let fetched = 1;
  for (const url of candidateUrls) {
    const result = await fetchAndParse(url, scoping, input.cycle_ref, evidence, errors);
    if (result) {
      fetched++;
      allParsedPages.push(result.parsed);
    }
  }

  // 3B. Phase 2B: Recursive crawl — discover links from ALL fetched pages, not just homepage
  // Prioritize commercial relevance, respect crawl constraints
  const MAX_RECURSIVE_PAGES = 10;
  const recursiveSeen = new Set(candidateUrls.map(u => normalizeUrlForDedup(u)));
  recursiveSeen.add(normalizeUrlForDedup(rootUrl));
  const recursiveCandidates: string[] = [];

  for (const parsed of allParsedPages) {
    if (recursiveCandidates.length >= MAX_RECURSIVE_PAGES) break;
    for (const link of parsed.links) {
      if (link.is_external) continue;
      const key = normalizeUrlForDedup(link.href);
      if (recursiveSeen.has(key)) continue;
      recursiveSeen.add(key);

      const path = safePathname(link.href);
      const text = (link.text || '').toLowerCase();
      // Only add commercially relevant pages from deeper pages
      if (isCheckoutCandidate(path, text) || isPricingCandidate(path, text) ||
          isContactCandidate(path, text) || isPolicyCandidate(path) ||
          /help|faq|confirm|success|thank|obrigado|garantia|warranty|exchange|troca/i.test(path + ' ' + text)) {
        recursiveCandidates.push(link.href);
        if (recursiveCandidates.length >= MAX_RECURSIVE_PAGES) break;
      }
    }
  }

  for (const url of recursiveCandidates) {
    const result = await fetchAndParse(url, scoping, input.cycle_ref, evidence, errors);
    if (result) {
      fetched++;
      allParsedPages.push(result.parsed);
    }
  }

  // 4. Detect platform from all evidence
  detectPlatforms(evidence, homepageResult.response, homepageResult.parsed, scoping, input.cycle_ref);

  // 5. Phase 2B: Run technology registry with FULL wiring (inline scripts + HTML bodies)
  const techDetectionInput = buildTechDetectionInput(evidence, allParsedPages);
  const detectedTechs = detectTechnologies(techDetectionInput);
  for (const tech of detectedTechs) {
    evidence.push(
      createEvidence({
        evidence_type: EvidenceType.TechnologyDetected,
        subject_ref: tech.detected_on[0] || rootUrl,
        scoping,
        cycle_ref: input.cycle_ref,
        freshness: buildFreshness(),
        payload: {
          type: 'technology_detected',
          technology_key: tech.key,
          display_name: tech.display_name,
          category: tech.category,
          confidence: tech.confidence,
          detection_source: tech.detection_source,
          detected_on: tech.detected_on,
          logo_key: tech.logo_key,
        } as TechnologyDetectedPayload,
      }),
    );
  }

  return { pages_fetched: fetched, evidence, errors };
}

async function fetchAndParse(
  url: string,
  scoping: Scoping,
  cycle_ref: string,
  evidence: Evidence[],
  errors: IngestionError[],
): Promise<{ response: HttpResponse; parsed: ParsedPage } | null> {
  try {
    const response = await httpFetch(url);
    const freshness = buildFreshness();

    // HTTP response evidence
    evidence.push(
      createEvidence({
        evidence_type: EvidenceType.HttpResponse,
        subject_ref: url,
        scoping,
        cycle_ref,
        freshness,
        payload: {
          type: 'http_response',
          url: response.url,
          status_code: response.status_code,
          headers: response.headers,
          response_time_ms: response.response_time_ms,
          content_type: response.content_type,
          content_length: response.content_length,
        } as HttpResponsePayload,
      }),
    );

    // Redirect evidence
    if (response.redirect_chain.length > 0) {
      evidence.push(
        createEvidence({
          evidence_type: EvidenceType.Redirect,
          subject_ref: url,
          scoping,
          cycle_ref,
          freshness,
          payload: {
            type: 'redirect',
            source_url: response.url,
            target_url: response.final_url,
            status_code: response.redirect_chain[0].status_code,
            hop_count: response.redirect_chain.length,
            chain: response.redirect_chain,
          } as RedirectPayload,
        }),
      );
    }

    // Parse content
    const isHtml = response.content_type != null && response.content_type.includes('text/html');
    if (!isHtml) {
      // Skip HTML parsing for non-HTML content, return empty parsed result
      // but still include the HTTP response evidence already added above
      return { response, parsed: parsePage('', url) };
    }

    const parsed = parsePage(response.body, response.final_url);

    // Page content evidence
    evidence.push(
      createEvidence({
        evidence_type: EvidenceType.PageContent,
        subject_ref: response.final_url,
        scoping,
        cycle_ref,
        freshness,
        payload: {
          type: 'page_content',
          url: response.final_url,
          title: parsed.title,
          meta_description: parsed.meta_description,
          h1: parsed.h1,
          canonical_url: parsed.canonical_url,
          lang: parsed.lang,
          has_forms: parsed.forms.length > 0,
          form_count: parsed.forms.length,
          script_count: parsed.scripts.length,
          external_script_count: parsed.scripts.filter((s) => s.is_external).length,
          internal_link_count: parsed.links.filter((l) => !l.is_external).length,
          external_link_count: parsed.links.filter((l) => l.is_external).length,
          body_word_count: parsed.body_word_count,
        } as PageContentPayload,
      }),
    );

    // Script evidence
    for (const script of parsed.scripts) {
      if (script.is_external) {
        evidence.push(
          createEvidence({
            evidence_type: EvidenceType.Script,
            subject_ref: response.final_url,
            scoping,
            cycle_ref,
            freshness,
            payload: {
              type: 'script',
              page_url: response.final_url,
              src: script.src,
              host: script.host,
              is_external: true,
              known_provider: detectProviderFromUrl(script.src),
            } as ScriptPayload,
          }),
        );
      }
    }

    // Form evidence
    for (const form of parsed.forms) {
      evidence.push(
        createEvidence({
          evidence_type: EvidenceType.Form,
          subject_ref: response.final_url,
          scoping,
          cycle_ref,
          freshness,
          payload: {
            type: 'form',
            page_url: response.final_url,
            action: form.action,
            method: form.method,
            target_host: form.target_host,
            is_external: form.is_external,
            field_names: form.field_names,
            has_payment_fields: form.has_payment_fields,
          } as FormPayload,
        }),
      );
    }

    // Iframe evidence
    for (const iframe of parsed.iframes) {
      evidence.push(
        createEvidence({
          evidence_type: EvidenceType.Iframe,
          subject_ref: response.final_url,
          scoping,
          cycle_ref,
          freshness,
          payload: {
            type: 'iframe',
            page_url: response.final_url,
            src: iframe.src,
            host: iframe.host,
            is_external: iframe.is_external,
            known_provider: detectProviderFromUrl(iframe.src),
          } as IframePayload,
        }),
      );
    }

    // Checkout indicator evidence
    extractCheckoutIndicators(parsed, response.final_url, scoping, cycle_ref, freshness, evidence);

    // Provider indicator evidence
    extractProviderIndicators(parsed, response.final_url, scoping, cycle_ref, freshness, evidence);

    // Policy page evidence
    extractPolicyIndicators(parsed, response.final_url, scoping, cycle_ref, freshness, evidence);

    // Phase 2: Inline script content evidence (for technology detection patterns)
    if (parsed.inline_scripts.length > 0) {
      evidence.push(
        createEvidence({
          evidence_type: EvidenceType.InlineScriptContent,
          subject_ref: response.final_url,
          scoping,
          cycle_ref,
          freshness,
          payload: {
            type: 'inline_script_content',
            page_url: response.final_url,
            detected_patterns: [], // populated by technology detector later
            total_inline_scripts: parsed.inline_scripts.length,
          } as InlineScriptContentPayload,
        }),
      );
    }

    // Phase 2: Structured data evidence
    for (const sd of parsed.structured_data) {
      const trustTypes = ['Organization', 'LocalBusiness', 'Store', 'Brand'];
      const commerceTypes = ['Product', 'Offer', 'AggregateOffer'];
      evidence.push(
        createEvidence({
          evidence_type: EvidenceType.StructuredDataItem,
          subject_ref: response.final_url,
          scoping,
          cycle_ref,
          freshness,
          payload: {
            type: 'structured_data_item',
            page_url: response.final_url,
            schema_type: sd.type,
            name: sd.name,
            is_trust_signal: trustTypes.includes(sd.type),
            is_commerce_signal: commerceTypes.includes(sd.type),
          } as StructuredDataItemPayload,
        }),
      );
    }

    return { response, parsed };
  } catch (err) {
    errors.push({
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function normalizeUrlForDedup(raw: string): string {
  try {
    const u = new URL(raw);
    u.hostname = u.hostname.toLowerCase();
    u.hash = '';
    // Remove trailing slash unless path is exactly '/'
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return raw;
  }
}

function discoverCandidates(
  parsed: ParsedPage,
  rootDomain: string,
  rootUrl: string,
): string[] {
  const seen = new Set<string>([normalizeUrlForDedup(rootUrl)]);
  const candidates: string[] = [];

  // Probe common paths first so critical policy pages aren't dropped by the limit
  const commonPaths = [
    '/checkout', '/cart', '/login', '/contact', '/pricing',
    '/privacy', '/terms', '/refund-policy', '/return-policy',
    '/shipping', '/about',
  ];

  for (const p of commonPaths) {
    const url = new URL(p, rootUrl).toString();
    const key = normalizeUrlForDedup(url);
    if (!seen.has(key)) {
      seen.add(key);
      candidates.push(url);
    }
  }

  // Then add discovered links from the homepage
  for (const link of parsed.links) {
    if (link.is_external) continue;
    const key = normalizeUrlForDedup(link.href);
    if (seen.has(key)) continue;
    seen.add(key);

    const path = new URL(link.href).pathname.toLowerCase();
    const text = (link.text || '').toLowerCase();

    // Prioritize checkout/cart/login/contact/policy pages
    const isCandidate =
      isCheckoutCandidate(path, text) ||
      isLoginCandidate(path, text) ||
      isContactCandidate(path, text) ||
      isPolicyCandidate(path) ||
      isPricingCandidate(path, text);

    if (isCandidate) {
      candidates.push(link.href);
    }
  }

  return candidates.slice(0, 20); // limit to avoid excessive fetching
}

function isCheckoutCandidate(path: string, text: string): boolean {
  return CHECKOUT_TOKENS.some((t) => path.includes(t) || text.includes(t));
}

function isLoginCandidate(path: string, text: string): boolean {
  return /login|signin|sign-in|account|register|signup/i.test(path + ' ' + text);
}

function isContactCandidate(path: string, text: string): boolean {
  return /contact|contato|fale-conosco|support|suporte/i.test(path + ' ' + text);
}

function isPolicyCandidate(path: string): boolean {
  return Object.keys(POLICY_TOKENS).some((t) => path.includes(t));
}

function isPricingCandidate(path: string, text: string): boolean {
  return /pricing|preco|planos|plans/i.test(path + ' ' + text);
}

function extractCheckoutIndicators(
  parsed: ParsedPage,
  pageUrl: string,
  scoping: Scoping,
  cycle_ref: string,
  freshness: Freshness,
  evidence: Evidence[],
): void {
  // Check links for checkout indicators
  for (const link of parsed.links) {
    const tokens = CHECKOUT_TOKENS.filter(
      (t) =>
        link.href.toLowerCase().includes(t) ||
        (link.text && link.text.toLowerCase().includes(t)),
    );
    if (tokens.length > 0) {
      evidence.push(
        createEvidence({
          evidence_type: EvidenceType.CheckoutIndicator,
          subject_ref: pageUrl,
          scoping,
          cycle_ref,
          freshness,
          payload: {
            type: 'checkout_indicator',
            page_url: pageUrl,
            indicator_source: 'link',
            target_url: link.href,
            target_host: link.target_host,
            is_external: link.is_external,
            checkout_mode: link.is_external ? 'redirect' : null,
            confidence: link.is_external ? 60 : 40,
            tokens_matched: tokens,
          } as CheckoutIndicatorPayload,
        }),
      );
    }
  }

  // Check forms for checkout indicators
  for (const form of parsed.forms) {
    if (form.has_payment_fields || form.is_external) {
      evidence.push(
        createEvidence({
          evidence_type: EvidenceType.CheckoutIndicator,
          subject_ref: pageUrl,
          scoping,
          cycle_ref,
          freshness,
          payload: {
            type: 'checkout_indicator',
            page_url: pageUrl,
            indicator_source: 'form',
            target_url: form.action,
            target_host: form.target_host,
            is_external: form.is_external,
            checkout_mode: form.has_payment_fields ? 'embedded' : 'redirect',
            confidence: form.has_payment_fields ? 75 : 50,
            tokens_matched: form.has_payment_fields ? ['payment_fields'] : [],
          } as CheckoutIndicatorPayload,
        }),
      );
    }
  }
}

function extractProviderIndicators(
  parsed: ParsedPage,
  pageUrl: string,
  scoping: Scoping,
  cycle_ref: string,
  freshness: Freshness,
  evidence: Evidence[],
): void {
  for (const script of parsed.scripts) {
    for (const [provider, patterns] of Object.entries(PROVIDER_PATTERNS)) {
      if (patterns.some((p) => p.test(script.src))) {
        evidence.push(
          createEvidence({
            evidence_type: EvidenceType.ProviderIndicator,
            subject_ref: pageUrl,
            scoping,
            cycle_ref,
            freshness,
            payload: {
              type: 'provider_indicator',
              page_url: pageUrl,
              provider_name: provider,
              detection_source: 'script',
              confidence: 70,
              domain_match: script.host,
            } as ProviderIndicatorPayload,
          }),
        );
      }
    }
  }

  for (const iframe of parsed.iframes) {
    for (const [provider, patterns] of Object.entries(PROVIDER_PATTERNS)) {
      if (patterns.some((p) => p.test(iframe.src))) {
        evidence.push(
          createEvidence({
            evidence_type: EvidenceType.ProviderIndicator,
            subject_ref: pageUrl,
            scoping,
            cycle_ref,
            freshness,
            payload: {
              type: 'provider_indicator',
              page_url: pageUrl,
              provider_name: provider,
              detection_source: 'iframe',
              confidence: 75,
              domain_match: iframe.host,
            } as ProviderIndicatorPayload,
          }),
        );
      }
    }
  }
}

function extractPolicyIndicators(
  parsed: ParsedPage,
  pageUrl: string,
  scoping: Scoping,
  cycle_ref: string,
  freshness: Freshness,
  evidence: Evidence[],
): void {
  // Check if current page IS a policy page (by URL pattern)
  const currentPath = safePathname(pageUrl);
  let currentPagePolicyType: string | null = null;
  for (const [token, policyType] of Object.entries(POLICY_TOKENS)) {
    if (currentPath.includes(token)) {
      currentPagePolicyType = policyType;
      break;
    }
  }

  // If this page itself is a policy page, analyze its content depth
  if (currentPagePolicyType && parsed.body_word_count > 0) {
    const analysis = analyzePolicyContent(parsed.body_text_snippet || '');
    evidence.push(
      createEvidence({
        evidence_type: EvidenceType.PolicyPage,
        subject_ref: pageUrl,
        scoping,
        cycle_ref,
        freshness,
        payload: {
          type: 'policy_page',
          url: pageUrl,
          policy_type: currentPagePolicyType as any,
          detected: true,
          confidence: 75,
          word_count: parsed.body_word_count,
          // Phase 2C fix: pass full policy content analysis
          has_return_window: analysis.has_return_window,
          has_refund_process: analysis.has_refund_process,
          has_contact_info: analysis.has_contact_info,
          has_shipping_info: analysis.has_shipping_info,
          has_cancellation_terms: analysis.has_cancellation_terms,
          section_count: analysis.section_count,
        } as PolicyPagePayload,
      }),
    );
  }

  // Also detect policy pages from links on this page
  for (const link of parsed.links) {
    const path = safePathname(link.href);
    for (const [token, policyType] of Object.entries(POLICY_TOKENS)) {
      if (path.includes(token) || (link.text && link.text.toLowerCase().includes(token))) {
        // Don't duplicate if we already detected this page as a policy page itself
        if (link.href === pageUrl && currentPagePolicyType) break;
        evidence.push(
          createEvidence({
            evidence_type: EvidenceType.PolicyPage,
            subject_ref: pageUrl,
            scoping,
            cycle_ref,
            freshness,
            payload: {
              type: 'policy_page',
              url: link.href,
              policy_type: policyType as any,
              detected: true,
              confidence: 65,
              word_count: null, // word count only available when we fetch the page
              has_return_window: null,
              has_refund_process: null,
              has_contact_info: null,
              has_shipping_info: null,
              has_cancellation_terms: null,
              section_count: null,
            } as PolicyPagePayload,
          }),
        );
        break;
      }
    }
  }
}

function detectPlatforms(
  evidence: Evidence[],
  response: HttpResponse,
  parsed: ParsedPage,
  scoping: Scoping,
  cycle_ref: string,
): void {
  const freshness = buildFreshness();
  const htmlAndScripts = response.body + ' ' + parsed.scripts.map((s) => s.src).join(' ');

  for (const [platform, patterns] of Object.entries(PLATFORM_PATTERNS)) {
    for (const p of patterns) {
      if (p.regex.test(htmlAndScripts)) {
        evidence.push(
          createEvidence({
            evidence_type: EvidenceType.PlatformIndicator,
            subject_ref: response.final_url,
            scoping,
            cycle_ref,
            freshness,
            payload: {
              type: 'platform_indicator',
              platform_name: platform,
              detection_source: p.source as any,
              confidence: 60,
              matched_pattern: p.regex.source,
            } as PlatformIndicatorPayload,
          }),
        );
        break;
      }
    }
  }
}

function detectProviderFromUrl(url: string): string | null {
  for (const [provider, patterns] of Object.entries(PROVIDER_PATTERNS)) {
    if (patterns.some((p) => p.test(url))) {
      return provider;
    }
  }
  return null;
}

function normalizeUrl(domain: string): string {
  if (domain.startsWith('http://') || domain.startsWith('https://')) {
    return domain;
  }
  return `https://${domain}`;
}

function buildScoping(input: IngestionInput): Scoping {
  return {
    workspace_ref: input.workspace_ref,
    environment_ref: input.environment_ref,
    subject_ref: input.website_ref,
    path_scope: null,
  };
}

function buildFreshness(): Freshness {
  const now = new Date();
  const freshUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24h TTL
  return {
    observed_at: now,
    fresh_until: freshUntil,
    freshness_state: FreshnessState.Fresh,
    staleness_reason: null,
  };
}

function computeQualityScore(payload: any): number {
  let score = 50; // baseline

  // Factor 1: response time (from http_response payloads or payloads carrying response_time_ms)
  const responseTime: number | undefined = payload.response_time_ms;
  if (responseTime != null) {
    if (responseTime < 500) {
      score += 20;        // fast
    } else if (responseTime < 1500) {
      score += 10;        // moderate
    } else if (responseTime < 3000) {
      score += 5;         // slow
    }
    // very slow (>= 3000): no bonus
  }

  // Factor 2: status code
  const statusCode: number | undefined = payload.status_code;
  if (statusCode != null) {
    if (statusCode >= 200 && statusCode < 300) {
      score += 20;        // success
    } else if (statusCode >= 300 && statusCode < 400) {
      score += 10;        // redirect
    } else {
      score -= 10;        // client/server error
    }
  }

  // Factor 3: collection method accuracy — static fetch is less accurate
  // than a rendered/browser-based fetch, so cap the bonus modestly
  score += 5; // baseline accuracy bonus for StaticFetch

  // Clamp to [0, 100]
  return Math.max(0, Math.min(100, score));
}

function createEvidence(params: {
  evidence_type: EvidenceType;
  subject_ref: string;
  scoping: Scoping;
  cycle_ref: string;
  freshness: Freshness;
  payload: any;
}): Evidence {
  const id = nextId();
  const now = new Date();
  return {
    id,
    evidence_key: `${params.evidence_type}_${id}`,
    evidence_type: params.evidence_type,
    subject_ref: params.subject_ref,
    scoping: { ...params.scoping, subject_ref: params.subject_ref },
    cycle_ref: params.cycle_ref,
    freshness: params.freshness,
    source_kind: SourceKind.HttpFetch,
    collection_method: CollectionMethod.StaticFetch,
    payload: params.payload,
    quality_score: computeQualityScore(params.payload),
    created_at: now,
    updated_at: now,
  };
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

// Phase 2B: Build technology detection input from evidence + parsed pages
// This completes the Phase 2A wiring gap — inline scripts and HTML bodies
// are now properly fed to the technology detector.
function buildTechDetectionInput(evidence: Evidence[], parsedPages: ParsedPage[]): DetectionInput {
  const scriptSrcs: string[] = [];
  const iframeSrcs: string[] = [];
  const pageUrls: string[] = [];

  for (const ev of evidence) {
    const p = ev.payload as any;
    if (ev.evidence_type === EvidenceType.Script) {
      scriptSrcs.push(p.src || '');
      pageUrls.push(p.page_url || ev.subject_ref);
    }
    if (ev.evidence_type === EvidenceType.Iframe) {
      iframeSrcs.push(p.src || '');
    }
  }

  // Phase 2B: Wire inline scripts and HTML body text from parsed pages
  // This is the key fix — Phase 2A left these empty
  const inlineScripts: string[] = [];
  const htmlBodies: string[] = [];
  for (const page of parsedPages) {
    for (const script of page.inline_scripts) {
      inlineScripts.push(script);
    }
    if (page.body_text_snippet) {
      htmlBodies.push(page.body_text_snippet);
    }
  }

  return {
    script_srcs: scriptSrcs,
    iframe_srcs: iframeSrcs,
    html_bodies: htmlBodies,
    inline_scripts: inlineScripts,
    page_urls: pageUrls.length > 0 ? pageUrls : parsedPages.map(p => p.url),
  };
}
