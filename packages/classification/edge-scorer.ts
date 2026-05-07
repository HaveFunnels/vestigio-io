// ──────────────────────────────────────────────
// Edge Scorer — Link intent classification
//
// Classifies each SurfaceRelation with a linkIntent and linkWeight
// to distinguish CTA links from nav/footer noise.
// ──────────────────────────────────────────────

import type { SurfacePageType } from './page-classifier';

// ── Types ──

export type LinkIntent =
  | 'cta_primary'
  | 'cta_secondary'
  | 'body_contextual'
  | 'navigation'
  | 'footer'
  | 'utility';

export type LinkPosition = 'header' | 'nav' | 'footer' | 'main' | 'aside' | 'unknown';

export interface EdgeScore {
  linkIntent: LinkIntent;
  linkWeight: number; // 0.0 - 1.0
  linkText: string | null;
  position: LinkPosition;
}

export interface SurfaceRelationForScoring {
  sourceUrl: string;
  targetUrl: string;
  relationType: string;
  linkText?: string | null;
  position?: LinkPosition;
  targetPageType?: SurfacePageType | null;
  occurrenceCount?: number; // how many pages this same link appears on
  totalPagesCrawled?: number;
}

// ── CTA Detection ──

const CTA_PRIMARY_PATTERNS = [
  /\b(buy|comprar|add\s?to\s?cart|adicionar|start|começar|sign\s?up|cadastr|get\s?started|try\s?free|iniciar|assinar|subscribe)\b/i,
  /\b(create\s?account|criar\s?conta|start\s?free|begin|register|registr)\b/i,
];

const CTA_SECONDARY_PATTERNS = [
  /\b(learn\s?more|saiba\s?mais|see\s?(pricing|plans|details)|ver\s?(preços|planos|detalhes))\b/i,
  /\b(view|ver|explore|explorar|discover|descobrir|read\s?more|leia\s?mais)\b/i,
  /\b(request\s?demo|agendar|schedule|book|free\s?trial|teste\s?grátis)\b/i,
  /\b(contact|contato|fale\s?conosco|talk\s?to)\b/i,
];

const UTILITY_PATTERNS = [
  /\b(home|início|back|voltar|previous|anterior|next|próximo)\b/i,
  /\b(page\s?\d|página\s?\d)/i,
  /^\d+$/, // pagination numbers
  /\b(skip|pular|accessibility|acessibilidade)\b/i,
];

// High-value target page types that boost edge weight
const HIGH_VALUE_TARGETS = new Set<SurfacePageType>([
  'checkout', 'signup', 'pricing', 'demo', 'cart',
]);

const MEDIUM_VALUE_TARGETS = new Set<SurfacePageType>([
  'features', 'product', 'contact', 'landing',
]);

// ── Scorer ──

export function scoreEdge(rel: SurfaceRelationForScoring): EdgeScore {
  const text = rel.linkText?.trim() || null;
  const position = rel.position || 'unknown';

  // 1. Check if this is a repeated navigation link (appears on most pages)
  if (rel.occurrenceCount && rel.totalPagesCrawled && rel.totalPagesCrawled > 2) {
    const ratio = rel.occurrenceCount / rel.totalPagesCrawled;
    if (ratio >= 0.8) {
      // Appears on 80%+ of pages → navigation or footer
      return {
        linkIntent: position === 'footer' ? 'footer' : 'navigation',
        linkWeight: position === 'footer' ? 0.1 : 0.2,
        linkText: text,
        position,
      };
    }
  }

  // 2. Position-based initial classification
  if (position === 'footer') {
    return { linkIntent: 'footer', linkWeight: 0.1, linkText: text, position };
  }

  if (position === 'nav' || position === 'header') {
    // Nav links get low weight unless they have CTA text
    if (text && CTA_PRIMARY_PATTERNS.some(p => p.test(text))) {
      return { linkIntent: 'cta_secondary', linkWeight: 0.7, linkText: text, position };
    }
    return { linkIntent: 'navigation', linkWeight: 0.2, linkText: text, position };
  }

  // 3. Text-based classification (for main/unknown position)
  if (text) {
    // Check for utility/pagination links
    if (UTILITY_PATTERNS.some(p => p.test(text))) {
      return { linkIntent: 'utility', linkWeight: 0.0, linkText: text, position };
    }

    // Check for primary CTA text
    if (CTA_PRIMARY_PATTERNS.some(p => p.test(text))) {
      return { linkIntent: 'cta_primary', linkWeight: 1.0, linkText: text, position };
    }

    // Check for secondary CTA text
    if (CTA_SECONDARY_PATTERNS.some(p => p.test(text))) {
      return { linkIntent: 'cta_secondary', linkWeight: 0.7, linkText: text, position };
    }
  }

  // 4. Target page type boost
  if (rel.targetPageType) {
    if (HIGH_VALUE_TARGETS.has(rel.targetPageType)) {
      return { linkIntent: 'cta_secondary', linkWeight: 0.7, linkText: text, position };
    }
    if (MEDIUM_VALUE_TARGETS.has(rel.targetPageType)) {
      return { linkIntent: 'body_contextual', linkWeight: 0.5, linkText: text, position };
    }
  }

  // 5. Form action gets high weight
  if (rel.relationType === 'form_action') {
    return { linkIntent: 'cta_primary', linkWeight: 1.0, linkText: text, position };
  }

  // 6. Redirect/runtime navigation
  if (rel.relationType === 'redirect' || rel.relationType === 'runtime_navigation') {
    return { linkIntent: 'body_contextual', linkWeight: 0.6, linkText: text, position };
  }

  // 7. Default: body contextual link in main content
  if (position === 'main') {
    return { linkIntent: 'body_contextual', linkWeight: 0.5, linkText: text, position };
  }

  // 8. Unknown position, no CTA text → medium weight
  return { linkIntent: 'body_contextual', linkWeight: 0.4, linkText: text, position };
}

/**
 * Score a batch of edges.
 * Computes occurrence counts first to identify repeated navigation links.
 */
export function scoreEdges(
  relations: SurfaceRelationForScoring[],
  totalPagesCrawled: number,
): Map<string, EdgeScore> {
  // Count how many distinct source pages each targetUrl appears in
  const targetOccurrences = new Map<string, Set<string>>();
  for (const rel of relations) {
    let sources = targetOccurrences.get(rel.targetUrl);
    if (!sources) {
      sources = new Set();
      targetOccurrences.set(rel.targetUrl, sources);
    }
    sources.add(rel.sourceUrl);
  }

  const results = new Map<string, EdgeScore>();
  for (const rel of relations) {
    const key = `${rel.sourceUrl}|${rel.targetUrl}`;
    const occurrenceCount = targetOccurrences.get(rel.targetUrl)?.size ?? 1;
    const enrichedRel: SurfaceRelationForScoring = {
      ...rel,
      occurrenceCount,
      totalPagesCrawled,
    };
    results.set(key, scoreEdge(enrichedRel));
  }

  return results;
}
