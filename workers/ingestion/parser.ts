import { URL } from 'url';

// ──────────────────────────────────────────────
// HTML Parser — lightweight regex-based extraction
// ──────────────────────────────────────────────

export interface ParsedPage {
  url: string;
  host: string;
  title: string | null;
  meta_description: string | null;
  h1: string | null;
  canonical_url: string | null;
  lang: string | null;
  links: ParsedLink[];
  forms: ParsedForm[];
  scripts: ParsedScript[];
  iframes: ParsedIframe[];
  meta_tags: Record<string, string>;
  // Phase 2: Deepened extraction
  inline_scripts: string[];
  structured_data: ParsedStructuredData[];
  body_word_count: number;
  body_text_snippet: string | null;
}

export interface ParsedLink {
  href: string;
  text: string | null;
  rel: string | null;
  is_external: boolean;
  target_host: string;
}

export interface ParsedForm {
  action: string;
  method: string;
  target_host: string | null;
  is_external: boolean;
  field_names: string[];
  has_payment_fields: boolean;
}

export interface ParsedScript {
  src: string;
  host: string;
  is_external: boolean;
}

export interface ParsedIframe {
  src: string;
  host: string;
  is_external: boolean;
}

// Phase 2: Structured data from JSON-LD
export interface ParsedStructuredData {
  type: string;      // e.g. 'Product', 'Organization', 'BreadcrumbList', 'FAQPage'
  name: string | null;
  data: Record<string, unknown>;
}

// Phase 2: Policy page content analysis
export interface PolicyContentAnalysis {
  word_count: number;
  has_contact_info: boolean;
  has_return_window: boolean;
  has_refund_process: boolean;
  has_shipping_info: boolean;
  has_cancellation_terms: boolean;
  section_count: number;
  is_thin: boolean;  // <200 words = thin policy
}

const PAYMENT_FIELD_PATTERNS = [
  'card', 'cc-', 'credit', 'cvv', 'cvc', 'expir',
  'billing', 'payment', 'stripe', 'braintree',
];

export function parsePage(html: string, pageUrl: string): ParsedPage {
  const pageHost = new URL(pageUrl).hostname;
  const rootDomain = getRootDomain(pageHost);

  // Phase 2: Extract body text for word count and policy analysis
  const bodyText = extractBodyText(html);
  const wordCount = bodyText ? bodyText.split(/\s+/).filter(w => w.length > 0).length : 0;

  return {
    url: pageUrl,
    host: pageHost,
    title: extractFirst(html, /<title[^>]*>(.*?)<\/title>/is),
    meta_description: extractMetaContent(html, 'description'),
    h1: extractFirst(html, /<h1[^>]*>(.*?)<\/h1>/is),
    canonical_url: extractCanonical(html),
    lang: extractFirst(html, /<html[^>]*\slang=["']([^"']*)["']/i),
    links: extractLinks(html, pageUrl, rootDomain),
    forms: extractForms(html, pageUrl, rootDomain),
    scripts: extractScripts(html, pageUrl, rootDomain),
    iframes: extractIframes(html, pageUrl, rootDomain),
    meta_tags: extractMetaTags(html),
    // Phase 2: Deepened extraction
    inline_scripts: extractInlineScripts(html),
    structured_data: extractStructuredData(html),
    body_word_count: wordCount,
    body_text_snippet: bodyText ? bodyText.slice(0, 500) : null,
  };
}

/**
 * Analyze policy page content depth.
 * Used by the pipeline to enrich PolicyPagePayload with quality metrics.
 */
export function analyzePolicyContent(bodyText: string): PolicyContentAnalysis {
  const words = bodyText.split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;
  const lower = bodyText.toLowerCase();

  // Heading count as proxy for section structure
  const sectionCount = (bodyText.match(/<h[2-4][^>]*>/gi) || []).length;

  return {
    word_count: wordCount,
    has_contact_info: /email|e-mail|phone|telefone|contact|contato|support|suporte|@[a-z]/i.test(lower),
    has_return_window: /\d+\s*(?:days?|dias?|hours?|horas?|business days)/i.test(lower),
    has_refund_process: /refund|reembolso|devolucao|return|devolu/i.test(lower),
    has_shipping_info: /shipping|entrega|frete|delivery|envio|prazo/i.test(lower),
    has_cancellation_terms: /cancel|cancela|rescis|revoga/i.test(lower),
    section_count: sectionCount,
    is_thin: wordCount < 200,
  };
}

function extractFirst(html: string, regex: RegExp): string | null {
  const match = regex.exec(html);
  return match ? match[1].trim() : null;
}

function extractMetaContent(html: string, name: string): string | null {
  const regex = new RegExp(
    `<meta[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`,
    'i',
  );
  const match = regex.exec(html);
  if (match) return match[1];

  const regex2 = new RegExp(
    `<meta[^>]*content=["']([^"']*?)["'][^>]*name=["']${name}["']`,
    'i',
  );
  const match2 = regex2.exec(html);
  return match2 ? match2[1] : null;
}

function extractCanonical(html: string): string | null {
  const match = /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i.exec(html);
  if (match) return match[1];
  const match2 = /<link[^>]*href=["']([^"']*?)["'][^>]*rel=["']canonical["']/i.exec(html);
  return match2 ? match2[1] : null;
}

function extractLinks(html: string, pageUrl: string, rootDomain: string): ParsedLink[] {
  const links: ParsedLink[] = [];
  const regex = /<a\s[^>]*href=["']([^"'#]*?)["'][^>]*>(.*?)<\/a>/gis;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      continue;
    }

    const resolved = resolveUrl(href, pageUrl);
    if (!resolved) continue;

    const targetHost = safeHostname(resolved);
    const rel = extractAttribute(match[0], 'rel');
    const text = match[2].replace(/<[^>]*>/g, '').trim() || null;

    links.push({
      href: resolved,
      text,
      rel,
      is_external: !isSameDomain(targetHost, rootDomain),
      target_host: targetHost,
    });
  }

  return links;
}

function extractForms(html: string, pageUrl: string, rootDomain: string): ParsedForm[] {
  const forms: ParsedForm[] = [];
  const regex = /<form\s[^>]*>(.*?)<\/form>/gis;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const formHtml = match[0];
    const action = extractAttribute(formHtml, 'action') || pageUrl;
    const method = (extractAttribute(formHtml, 'method') || 'GET').toUpperCase();
    const resolved = resolveUrl(action, pageUrl) || pageUrl;
    const targetHost = safeHostname(resolved);

    const fieldNames = extractFieldNames(match[1]);
    const hasPaymentFields = fieldNames.some((f) =>
      PAYMENT_FIELD_PATTERNS.some((p) => f.toLowerCase().includes(p)),
    );

    forms.push({
      action: resolved,
      method,
      target_host: targetHost,
      is_external: !isSameDomain(targetHost, rootDomain),
      field_names: fieldNames,
      has_payment_fields: hasPaymentFields,
    });
  }

  return forms;
}

function extractScripts(html: string, pageUrl: string, rootDomain: string): ParsedScript[] {
  const scripts: ParsedScript[] = [];
  const regex = /<script\s[^>]*src=["']([^"']*?)["'][^>]*>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const src = match[1].trim();
    if (!src) continue;
    const resolved = resolveUrl(src, pageUrl);
    if (!resolved) continue;
    const host = safeHostname(resolved);

    scripts.push({
      src: resolved,
      host,
      is_external: !isSameDomain(host, rootDomain),
    });
  }

  return scripts;
}

function extractIframes(html: string, pageUrl: string, rootDomain: string): ParsedIframe[] {
  const iframes: ParsedIframe[] = [];
  const regex = /<iframe\s[^>]*src=["']([^"']*?)["'][^>]*>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const src = match[1].trim();
    if (!src) continue;
    const resolved = resolveUrl(src, pageUrl);
    if (!resolved) continue;
    const host = safeHostname(resolved);

    iframes.push({
      src: resolved,
      host,
      is_external: !isSameDomain(host, rootDomain),
    });
  }

  return iframes;
}

function extractMetaTags(html: string): Record<string, string> {
  const tags: Record<string, string> = {};
  const regex = /<meta\s[^>]*>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const tag = match[0];
    const property = extractAttribute(tag, 'property') || extractAttribute(tag, 'name');
    const content = extractAttribute(tag, 'content');
    if (property && content) {
      tags[property] = content;
    }
  }

  return tags;
}

function extractFieldNames(formInnerHtml: string): string[] {
  const names: string[] = [];
  const regex = /<(?:input|select|textarea)\s[^>]*name=["']([^"']*?)["'][^>]*>/gi;
  let match;

  while ((match = regex.exec(formInnerHtml)) !== null) {
    if (match[1]) names.push(match[1]);
  }

  return names;
}

function extractAttribute(tag: string, attr: string): string | null {
  const regex = new RegExp(`${attr}=["']([^"']*?)["']`, 'i');
  const match = regex.exec(tag);
  return match ? match[1] : null;
}

function resolveUrl(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// ──────────────────────────────────────────────
// Phase 2: Inline Script Extraction
// ──────────────────────────────────────────────

function extractInlineScripts(html: string): string[] {
  const scripts: string[] = [];
  // Match script tags WITHOUT src attribute (inline scripts)
  const regex = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const content = match[1].trim();
    if (content.length > 10) { // skip trivially empty scripts
      // Cap each inline script to 2KB to avoid memory issues
      scripts.push(content.slice(0, 2048));
    }
  }

  return scripts;
}

// ──────────────────────────────────────────────
// Phase 2: Structured Data Extraction (JSON-LD)
// ──────────────────────────────────────────────

function extractStructuredData(html: string): ParsedStructuredData[] {
  const results: ParsedStructuredData[] = [];
  const regex = /<script\s+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1].trim());
      if (Array.isArray(data)) {
        for (const item of data) {
          const sd = parseStructuredItem(item);
          if (sd) results.push(sd);
        }
      } else if (data['@graph']) {
        for (const item of data['@graph']) {
          const sd = parseStructuredItem(item);
          if (sd) results.push(sd);
        }
      } else {
        const sd = parseStructuredItem(data);
        if (sd) results.push(sd);
      }
    } catch {
      // Invalid JSON-LD — skip
    }
  }

  return results;
}

function parseStructuredItem(item: any): ParsedStructuredData | null {
  if (!item || typeof item !== 'object') return null;
  const type = item['@type'];
  if (!type) return null;

  return {
    type: Array.isArray(type) ? type[0] : String(type),
    name: item.name || item.headline || null,
    data: item,
  };
}

// ──────────────────────────────────────────────
// Phase 2: Body Text Extraction
// ──────────────────────────────────────────────

function extractBodyText(html: string): string | null {
  // Remove scripts and styles
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Remove all HTML tags
  text = text.replace(/<[^>]*>/g, ' ');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > 0 ? text : null;
}

export function getRootDomain(hostname: string): string {
  const parts = hostname.split('.');
  if (parts.length <= 2) return hostname;
  return parts.slice(-2).join('.');
}

export function isSameDomain(host1: string, rootDomain: string): boolean {
  return host1 === rootDomain || host1.endsWith('.' + rootDomain);
}
