import type { CopyElementsPayload } from '../../../packages/domain/evidence';
import { extractBodyText } from '../parser';

// ──────────────────────────────────────────────
// Wave 3.10: Copy Elements Extractor
//
// Pure parser function (no LLM call). Extracts structured copy
// elements from raw HTML using regex/string matching, reusing the
// same lightweight extraction patterns from workers/ingestion/parser.ts.
//
// The output CopyElementsPayload feeds the copy-analysis Haiku
// for messaging quality, CTA clarity, and funnel alignment scoring.
// ──────────────────────────────────────────────

/**
 * Extract structured copy elements from an HTML page.
 *
 * @param html     Raw HTML body
 * @param url      Canonical URL of the page
 * @param pageType Page classification (homepage, landing_page, pricing, etc.)
 * @param funnelStage Funnel stage (awareness, consideration, decision, retention)
 * @returns CopyElementsPayload ready for evidence storage or Haiku analysis
 */
export function extractCopyElements(
  html: string,
  url: string,
  pageType: string,
  funnelStage: string,
): CopyElementsPayload {
  const bodyText = extractBodyText(html) || '';
  const aboveFoldText = bodyText.slice(0, 500);
  const words = bodyText.split(/\s+/).filter((w) => w.length > 0);

  const h1 = extractFirstTag(html, 'h1');
  const subheadline = extractSubheadline(html);
  const ctaTexts = extractCtaTexts(html);
  const primaryCta = extractPrimaryCta(html);
  const navLabels = extractNavigationLabels(html);
  const socialProof = extractSocialProofElements(html);
  const trustSignals = extractTrustSignals(html);
  const urgencyIndicators = extractUrgencyIndicators(html);

  return {
    type: 'copy_elements',
    url,
    page_type: pageType,
    funnel_stage: funnelStage,

    h1,
    subheadline,
    cta_texts: ctaTexts,
    primary_cta: primaryCta,
    social_proof_elements: socialProof,
    trust_signals: trustSignals,
    urgency_indicators: urgencyIndicators,
    above_fold_text: aboveFoldText,
    navigation_labels: navLabels,
    body_text: bodyText.slice(0, 2000),

    word_count: words.length,
    cta_count: ctaTexts.length,
    has_form: /<form[\s>]/i.test(html),
    has_pricing_table: detectPricingTable(html),
    has_faq: detectFaq(html),
  };
}

// ──────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────

/** Strip HTML tags from a string, collapse whitespace. */
function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Extract text content of the first occurrence of a given tag. */
function extractFirstTag(html: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const match = regex.exec(html);
  if (!match) return null;
  const text = stripTags(match[1]);
  return text.length > 0 ? text : null;
}

/**
 * Subheadline: first <h2> or first <p> that appears after the first <h1>.
 * Falls back to first <h2> anywhere if no h1 found.
 */
function extractSubheadline(html: string): string | null {
  // Try to find the first <h1> position
  const h1Match = /<h1[^>]*>[\s\S]*?<\/h1>/i.exec(html);
  const searchFrom = h1Match ? h1Match.index + h1Match[0].length : 0;
  const afterH1 = html.slice(searchFrom);

  // Look for first <h2> after h1
  const h2Match = /<h2[^>]*>([\s\S]*?)<\/h2>/i.exec(afterH1);
  if (h2Match) {
    const text = stripTags(h2Match[1]);
    if (text.length > 0) return text;
  }

  // Look for first <p> after h1 with meaningful content (>20 chars)
  const pMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(afterH1);
  if (pMatch) {
    const text = stripTags(pMatch[1]);
    if (text.length > 20) return text;
  }

  // Fallback: first <h2> anywhere
  return extractFirstTag(html, 'h2');
}

/**
 * Extract all CTA-like text content:
 * - <button> elements
 * - <a> with button-like classes (btn, button, cta)
 * - <input type="submit">
 * - <a> with role="button"
 */
function extractCtaTexts(html: string): string[] {
  const ctas: string[] = [];
  const seen = new Set<string>();

  // <button> elements
  const buttonRegex = /<button[^>]*>([\s\S]*?)<\/button>/gi;
  let m;
  while ((m = buttonRegex.exec(html)) !== null) {
    addCta(stripTags(m[1]), ctas, seen);
  }

  // <a> with button-like class
  const linkBtnRegex = /<a\s[^>]*class=["'][^"']*(?:btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = linkBtnRegex.exec(html)) !== null) {
    addCta(stripTags(m[1]), ctas, seen);
  }

  // <input type="submit">
  const submitRegex = /<input\s[^>]*type=["']submit["'][^>]*>/gi;
  while ((m = submitRegex.exec(html)) !== null) {
    const valueMatch = /value=["']([^"']*)["']/i.exec(m[0]);
    if (valueMatch) {
      addCta(valueMatch[1].trim(), ctas, seen);
    }
  }

  // <a> with role="button"
  const roleBtnRegex = /<a\s[^>]*role=["']button["'][^>]*>([\s\S]*?)<\/a>/gi;
  while ((m = roleBtnRegex.exec(html)) !== null) {
    addCta(stripTags(m[1]), ctas, seen);
  }

  return ctas;
}

function addCta(text: string, list: string[], seen: Set<string>): void {
  if (!text || text.length < 2 || text.length > 100) return;
  const normalized = text.toLowerCase();
  if (seen.has(normalized)) return;
  seen.add(normalized);
  list.push(text);
}

/**
 * Best guess at the primary CTA:
 * 1. First <button> with a class containing primary/main/hero
 * 2. First <a> with a class containing primary/main/hero AND btn/button/cta
 * 3. First <button> on the page
 */
function extractPrimaryCta(html: string): string | null {
  // 1. Primary-class button
  const primaryBtn = /<button[^>]*class=["'][^"']*(?:primary|main|hero)[^"']*["'][^>]*>([\s\S]*?)<\/button>/i.exec(html);
  if (primaryBtn) {
    const text = stripTags(primaryBtn[1]);
    if (text.length >= 2) return text;
  }

  // 2. Primary-class link-button
  const primaryLink = /<a\s[^>]*class=["'][^"']*(?:primary|main|hero)[^"']*(?:btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(html);
  if (primaryLink) {
    const text = stripTags(primaryLink[1]);
    if (text.length >= 2) return text;
  }

  // Also check reverse class order (btn...primary)
  const primaryLink2 = /<a\s[^>]*class=["'][^"']*(?:btn|button|cta)[^"']*(?:primary|main|hero)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(html);
  if (primaryLink2) {
    const text = stripTags(primaryLink2[1]);
    if (text.length >= 2) return text;
  }

  // 3. Fallback: first <button>
  const firstBtn = /<button[^>]*>([\s\S]*?)<\/button>/i.exec(html);
  if (firstBtn) {
    const text = stripTags(firstBtn[1]);
    if (text.length >= 2) return text;
  }

  return null;
}

/**
 * Extract top-level navigation labels from <nav> <a> elements.
 */
function extractNavigationLabels(html: string): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();

  // Find all <nav> blocks
  const navRegex = /<nav[^>]*>([\s\S]*?)<\/nav>/gi;
  let navMatch;
  while ((navMatch = navRegex.exec(html)) !== null) {
    const navContent = navMatch[1];
    // Extract <a> inside nav
    const linkRegex = /<a\s[^>]*>([\s\S]*?)<\/a>/gi;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(navContent)) !== null) {
      const text = stripTags(linkMatch[1]);
      if (text.length >= 2 && text.length <= 50) {
        const norm = text.toLowerCase();
        if (!seen.has(norm)) {
          seen.add(norm);
          labels.push(text);
        }
      }
    }
  }

  return labels;
}

// ──────────────────────────────────────────────
// Contextual element extraction
// ──────────────────────────────────────────────

const SOCIAL_PROOF_PATTERNS: RegExp[] = [
  /testimonial/i,
  /review/i,
  /trusted\s+by/i,
  /as\s+seen\s+(?:on|in)/i,
  /customers?\s+(?:love|trust|say|include)/i,
  /companies?\s+(?:trust|use|rely)/i,
  /\d+[,.]?\d*\+?\s*(?:customers?|users?|companies?|businesses?|clients?)/i,
  /\u2605|\u2B50|\u2606/, // star characters
  /\d+(?:\.\d)?\s*(?:out of|\/)\s*5/i,
  /(?:4|5)\s*stars?/i,
  /case\s+stud(?:y|ies)/i,
  /success\s+stor(?:y|ies)/i,
];

const TRUST_SIGNAL_PATTERNS: RegExp[] = [
  /guarantee/i,
  /money[\s-]*back/i,
  /secure/i,
  /ssl/i,
  /refund/i,
  /privacy/i,
  /certifi/i,
  /complian/i,
  /gdpr/i,
  /hipaa/i,
  /soc\s*2/i,
  /iso\s*27001/i,
  /pci[\s-]*dss/i,
  /verified/i,
  /encrypted/i,
  /256[\s-]*bit/i,
  /risk[\s-]*free/i,
  /no[\s-]*risk/i,
  /satisfaction/i,
];

const URGENCY_PATTERNS: RegExp[] = [
  /limited/i,
  /hurry/i,
  /only\s+\d+\s+left/i,
  /act\s+(?:now|fast|quickly)/i,
  /don[''\u2019]t\s+miss/i,
  /expires?/i,
  /countdown/i,
  /last\s+chance/i,
  /ending\s+soon/i,
  /today\s+only/i,
  /offer\s+ends/i,
  /while\s+(?:supplies|stocks?)\s+last/i,
  /\d+\s*(?:hours?|minutes?|days?)\s+left/i,
  /spots?\s+(?:left|remaining|available)/i,
  /selling\s+fast/i,
  /almost\s+(?:gone|sold\s+out)/i,
];

/**
 * Generic contextual extractor: finds text blocks near matching patterns.
 * Splits the text-stripped HTML into sentences/blocks and returns those
 * that match any of the given patterns.
 */
function extractContextualElements(
  html: string,
  patterns: RegExp[],
  maxResults: number = 10,
  includeBlockquotes: boolean = false,
): string[] {
  // Work with text-stripped version for content matching
  const text = stripTags(html);
  const results: string[] = [];
  const seen = new Set<string>();

  // Split into sentence-like chunks
  const chunks = text
    .split(/[.!?\n]+/)
    .map((c) => c.trim())
    .filter((c) => c.length > 10 && c.length < 500);

  for (const chunk of chunks) {
    if (results.length >= maxResults) break;
    for (const pattern of patterns) {
      if (pattern.test(chunk)) {
        const norm = chunk.toLowerCase().slice(0, 80);
        if (!seen.has(norm)) {
          seen.add(norm);
          results.push(chunk.slice(0, 200));
        }
        break; // one match per chunk is enough
      }
    }
  }

  // Also check for blockquotes (common testimonial pattern)
  if (includeBlockquotes) {
    const bqRegex = /<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi;
    let m;
    while ((m = bqRegex.exec(html)) !== null && results.length < maxResults) {
      const bqText = stripTags(m[1]);
      if (bqText.length > 10) {
        const norm = bqText.toLowerCase().slice(0, 80);
        if (!seen.has(norm)) {
          seen.add(norm);
          results.push(bqText.slice(0, 200));
        }
      }
    }
  }

  return results;
}

function extractSocialProofElements(html: string): string[] {
  return extractContextualElements(html, SOCIAL_PROOF_PATTERNS, 10, true);
}

function extractTrustSignals(html: string): string[] {
  return extractContextualElements(html, TRUST_SIGNAL_PATTERNS);
}

function extractUrgencyIndicators(html: string): string[] {
  return extractContextualElements(html, URGENCY_PATTERNS);
}

// ──────────────────────────────────────────────
// Boolean detectors
// ──────────────────────────────────────────────

/**
 * Detect pricing table patterns:
 * - <table> with pricing-related classes or nearby pricing terms
 * - <div> with pricing-related classes
 * - Repeated price patterns ($XX/mo, $XX.XX)
 */
function detectPricingTable(html: string): boolean {
  // Pricing-class elements
  if (/class=["'][^"']*pric(?:e|ing)[^"']*["']/i.test(html)) return true;
  // Table near pricing keywords
  if (/<table[\s\S]{0,500}(?:pric|plan|tier|month|year|annual)/i.test(html)) return true;
  // Multiple price patterns (at least 2 distinct prices suggest a pricing table)
  const priceMatches = html.match(/\$\d+(?:\.\d{2})?(?:\/(?:mo|month|yr|year))?/g);
  if (priceMatches && priceMatches.length >= 2) return true;
  // data-plan or data-tier attributes
  if (/data-(?:plan|tier|price)/i.test(html)) return true;

  return false;
}

/**
 * Detect FAQ patterns:
 * - "frequently asked" text
 * - FAQ section/class
 * - Accordion patterns (details/summary, data-accordion)
 * - Schema.org FAQPage structured data
 */
function detectFaq(html: string): boolean {
  if (/frequently\s+asked/i.test(html)) return true;
  if (/class=["'][^"']*faq[^"']*["']/i.test(html)) return true;
  if (/id=["'][^"']*faq[^"']*["']/i.test(html)) return true;
  if (/<details[^>]*>[\s\S]*?<summary/i.test(html)) return true;
  if (/data-accordion/i.test(html)) return true;
  if (/FAQPage/i.test(html)) return true;

  return false;
}
