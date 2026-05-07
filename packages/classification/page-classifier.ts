// ──────────────────────────────────────────────
// Page Classifier — Multi-signal page type resolution
//
// Combines 5 signal sources to classify each page:
//   1. Pathname regex (fast, always available)
//   2. Title + H1 keyword matching (always available from crawl)
//   3. Structural signals (forms, pricing tables, etc.)
//   4. LLM classification (when enrichment ran)
//   5. Business model context (when onboarding complete)
//
// Output: { classifiedType, confidence, signals[] }
// ──────────────────────────────────────────────

import type { Evidence } from '../domain';

// ── Types ──

export type SurfacePageType =
  | 'homepage'
  | 'landing'
  | 'features'
  | 'pricing'
  | 'product'
  | 'category'
  | 'cart'
  | 'checkout'
  | 'signup'
  | 'demo'
  | 'account'
  | 'onboarding'
  | 'thank_you'
  | 'blog'
  | 'support'
  | 'policy'
  | 'contact'
  | 'about'
  | 'other';

export interface ClassificationVote {
  source: string;
  vote: SurfacePageType;
  confidence: number; // 0-100
  weight: number;     // 0-1
}

export interface PageClassificationResult {
  classifiedPageType: SurfacePageType;
  classificationConfidence: number; // 0-100
  classificationSignals: ClassificationVote[];
}

interface PageContext {
  url: string;
  path: string;
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  hasForms: boolean;
  formCount: number;
  bodyWordCount: number;
  existingPageType: string; // from regex-only inference
  businessModel: string | null; // org's declared business model
}

// ── Signal 1: Pathname Regex (weight 0.2) ──

const PATH_RULES: Array<{ pattern: RegExp; type: SurfacePageType }> = [
  { pattern: /^\/$/, type: 'homepage' },
  { pattern: /\/(checkout|cart|carrinho|comprar|pay|payment|billing)/i, type: 'checkout' },
  { pattern: /\/(pricing|preco|planos|plans|precios)/i, type: 'pricing' },
  { pattern: /\/(product|produto|item|p\/)/i, type: 'product' },
  { pattern: /\/(features|funcionalidades|recursos|capabilities)/i, type: 'features' },
  { pattern: /\/(demo|agendar|schedule|book)/i, type: 'demo' },
  { pattern: /\/(signup|sign-up|register|cadastro|criar-conta|get-started|start)/i, type: 'signup' },
  { pattern: /\/(login|signin|sign-in|account|conta|dashboard|app)/i, type: 'account' },
  { pattern: /\/(category|categoria|collection|colecao|collections)/i, type: 'category' },
  { pattern: /\/(cart|sacola|bag)/i, type: 'cart' },
  { pattern: /\/(thank|obrigado|success|confirmation|confirmed)/i, type: 'thank_you' },
  { pattern: /\/(onboarding|welcome|setup|getting-started)/i, type: 'onboarding' },
  { pattern: /\/(blog|news|noticia|article|post|articles)/i, type: 'blog' },
  { pattern: /\/(contact|contato|fale-conosco)/i, type: 'contact' },
  { pattern: /\/(about|sobre|quem-somos|about-us|team|equipe)/i, type: 'about' },
  { pattern: /\/(support|suporte|help|faq|helpcenter|help-center|docs|documentation)/i, type: 'support' },
  { pattern: /\/(privacy|terms|refund|return|shipping|cookie|policy|termos|privacidade)/i, type: 'policy' },
];

function classifyByPath(path: string): ClassificationVote | null {
  if (path === '/' || path === '') {
    return { source: 'pathname', vote: 'homepage', confidence: 90, weight: 0.2 };
  }
  for (const { pattern, type } of PATH_RULES) {
    if (pattern.test(path)) {
      return { source: 'pathname', vote: type, confidence: 75, weight: 0.2 };
    }
  }
  return null; // no match — doesn't vote
}

// ── Signal 2: Title + H1 Keywords (weight 0.25) ──

const TITLE_KEYWORDS: Array<{ keywords: RegExp; type: SurfacePageType }> = [
  { keywords: /\b(pricing|plans|price|planos|preços|precios)\b/i, type: 'pricing' },
  { keywords: /\b(checkout|payment|pagamento|finalizar)\b/i, type: 'checkout' },
  { keywords: /\b(cart|carrinho|sacola|bag)\b/i, type: 'cart' },
  { keywords: /\b(sign\s?up|register|create\s?account|cadastr|criar\s?conta|get\s?started)\b/i, type: 'signup' },
  { keywords: /\b(features|funcionalidades|recursos|capabilities|what\s?we\s?do)\b/i, type: 'features' },
  { keywords: /\b(demo|schedule|agendar|book\s?a\s?(call|demo|meeting))\b/i, type: 'demo' },
  { keywords: /\b(thank|obrigado|order\s?confirmed|pedido\s?confirmado)\b/i, type: 'thank_you' },
  { keywords: /\b(blog|articles?|news|insights)\b/i, type: 'blog' },
  { keywords: /\b(contact|contato|fale\s?conosco|get\s?in\s?touch)\b/i, type: 'contact' },
  { keywords: /\b(about|sobre|quem\s?somos|our\s?story|our\s?team)\b/i, type: 'about' },
  { keywords: /\b(help|support|faq|documentation|docs|suporte)\b/i, type: 'support' },
  { keywords: /\b(privacy|terms|policy|termos|privacidade|cookies)\b/i, type: 'policy' },
  { keywords: /\b(login|sign\s?in|my\s?account|dashboard)\b/i, type: 'account' },
  { keywords: /\b(onboarding|welcome|getting\s?started|setup)\b/i, type: 'onboarding' },
];

function classifyByContent(title: string | null, h1: string | null): ClassificationVote | null {
  const text = [title, h1].filter(Boolean).join(' ');
  if (!text) return null;

  for (const { keywords, type } of TITLE_KEYWORDS) {
    if (keywords.test(text)) {
      return { source: 'title_h1', vote: type, confidence: 70, weight: 0.25 };
    }
  }
  return null;
}

// ── Signal 3: Structural Signals (weight 0.15) ──

function classifyByStructure(ctx: PageContext): ClassificationVote | null {
  // Many forms + short content = signup/contact page
  if (ctx.hasForms && ctx.formCount >= 1 && ctx.bodyWordCount < 500) {
    // Could be signup, contact, or checkout — look at path for disambiguation
    if (/checkout|pay|billing/i.test(ctx.path)) {
      return { source: 'structure', vote: 'checkout', confidence: 65, weight: 0.15 };
    }
    if (/contact|contato/i.test(ctx.path)) {
      return { source: 'structure', vote: 'contact', confidence: 60, weight: 0.15 };
    }
    return { source: 'structure', vote: 'signup', confidence: 50, weight: 0.15 };
  }

  // Very long content (>2000 words) = blog/article
  if (ctx.bodyWordCount > 2000) {
    return { source: 'structure', vote: 'blog', confidence: 55, weight: 0.15 };
  }

  // Homepage pattern: short path + moderate content
  if (ctx.path === '/' && ctx.bodyWordCount > 200) {
    return { source: 'structure', vote: 'homepage', confidence: 80, weight: 0.15 };
  }

  return null;
}

// ── Signal 4: LLM Classification (weight 0.3) ──

function classifyByLLM(evidence: Evidence[], pageUrl: string): ClassificationVote | null {
  // Look for content_enrichment evidence with page_purpose_validation
  for (const ev of evidence) {
    if (ev.evidence_type !== 'content_enrichment') continue;
    const payload = ev.payload as any;
    if (!payload || payload.source_url !== pageUrl) continue;

    // Check for explicit page type in enrichment results
    if (payload.enrichment_type === 'page_purpose_validation' || payload.enrichment_type === 'above_fold_density') {
      const results = payload.results as Record<string, unknown> | undefined;
      if (results?.detected_page_type) {
        const llmType = mapLLMTypeToSurface(results.detected_page_type as string);
        if (llmType) {
          return { source: 'llm_enrichment', vote: llmType, confidence: 85, weight: 0.3 };
        }
      }
    }

    // Infer from enrichment_type itself
    const typeMapping: Record<string, SurfacePageType> = {
      'homepage_hero': 'homepage',
      'pricing_psychology': 'pricing',
      'checkout_trust': 'checkout',
      'product_description_quality': 'product',
      'onboarding_copy_quality': 'onboarding',
    };
    if (payload.source_url === pageUrl && typeMapping[payload.enrichment_type]) {
      return { source: 'llm_enrichment_type', vote: typeMapping[payload.enrichment_type], confidence: 75, weight: 0.3 };
    }
  }
  return null;
}

function mapLLMTypeToSurface(llmType: string): SurfacePageType | null {
  const map: Record<string, SurfacePageType> = {
    'homepage': 'homepage',
    'pricing': 'pricing',
    'checkout': 'checkout',
    'product': 'product',
    'onboarding': 'onboarding',
    'error': 'other',
    'all_commercial': 'landing',
    'landing': 'landing',
    'features': 'features',
    'signup': 'signup',
    'demo': 'demo',
    'blog': 'blog',
    'support': 'support',
    'contact': 'contact',
    'about': 'about',
    'policy': 'policy',
  };
  return map[llmType.toLowerCase()] ?? null;
}

// ── Signal 5: Business Model Context (weight 0.1) ──

function classifyByBusinessModel(ctx: PageContext): ClassificationVote | null {
  if (!ctx.businessModel) return null;

  // SaaS-specific: a page with forms + "free trial" / "start" text is likely signup
  if (ctx.businessModel === 'saas' || ctx.businessModel === 'SaaS') {
    const text = [ctx.title, ctx.h1].filter(Boolean).join(' ').toLowerCase();
    if (ctx.hasForms && /free|trial|start|begin|get\s?started|try/i.test(text)) {
      return { source: 'business_model', vote: 'signup', confidence: 60, weight: 0.1 };
    }
    // In SaaS, /features pages are landing pages (consideration)
    if (/feature|solution|integra/i.test(ctx.path)) {
      return { source: 'business_model', vote: 'features', confidence: 55, weight: 0.1 };
    }
  }

  // Ecommerce: pages with product schema signals
  if (ctx.businessModel === 'ecommerce' || ctx.businessModel === 'Ecommerce') {
    if (/\/p\/|\/product/i.test(ctx.path)) {
      return { source: 'business_model', vote: 'product', confidence: 60, weight: 0.1 };
    }
  }

  return null;
}

// ── Main Classifier ──

export function classifyPage(ctx: PageContext, evidence: Evidence[]): PageClassificationResult {
  const votes: ClassificationVote[] = [];

  // Gather votes from all signals
  const pathVote = classifyByPath(ctx.path);
  if (pathVote) votes.push(pathVote);

  const contentVote = classifyByContent(ctx.title, ctx.h1);
  if (contentVote) votes.push(contentVote);

  const structureVote = classifyByStructure(ctx);
  if (structureVote) votes.push(structureVote);

  const llmVote = classifyByLLM(evidence, ctx.url);
  if (llmVote) votes.push(llmVote);

  const bizVote = classifyByBusinessModel(ctx);
  if (bizVote) votes.push(bizVote);

  // No votes at all → fall back to existing classification
  if (votes.length === 0) {
    return {
      classifiedPageType: (ctx.existingPageType as SurfacePageType) || 'other',
      classificationConfidence: 20,
      classificationSignals: [{ source: 'fallback', vote: ctx.existingPageType as SurfacePageType || 'other', confidence: 20, weight: 1.0 }],
    };
  }

  // Tally weighted scores per type
  const scores = new Map<SurfacePageType, number>();
  for (const v of votes) {
    const current = scores.get(v.vote) ?? 0;
    scores.set(v.vote, current + (v.confidence * v.weight));
  }

  // Pick winner
  let bestType: SurfacePageType = 'other';
  let bestScore = 0;
  for (const [type, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      bestType = type;
    }
  }

  // Compute confidence: how much do signals agree?
  const totalWeight = votes.reduce((sum, v) => sum + v.weight, 0);
  const agreeingWeight = votes
    .filter(v => v.vote === bestType)
    .reduce((sum, v) => sum + v.weight, 0);
  const agreementRatio = totalWeight > 0 ? agreeingWeight / totalWeight : 0;

  // Base confidence from average of agreeing votes, scaled by agreement ratio
  const agreeingVotes = votes.filter(v => v.vote === bestType);
  const avgConfidence = agreeingVotes.length > 0
    ? agreeingVotes.reduce((sum, v) => sum + v.confidence, 0) / agreeingVotes.length
    : 50;

  const confidence = Math.round(avgConfidence * agreementRatio);

  // Cap confidence based on available signal count
  const maxConfidence = votes.length >= 3 ? 100 : votes.length === 2 ? 80 : 60;

  return {
    classifiedPageType: bestType,
    classificationConfidence: Math.min(confidence, maxConfidence),
    classificationSignals: votes,
  };
}

// ── Batch classifier for all pages in an audit ──

export interface PageForClassification {
  url: string;
  path: string;
  title: string | null;
  h1: string | null;
  metaDescription: string | null;
  hasForms: boolean;
  formCount: number;
  bodyWordCount: number;
  existingPageType: string;
}

export function classifyPages(
  pages: PageForClassification[],
  evidence: Evidence[],
  businessModel: string | null,
): Map<string, PageClassificationResult> {
  const results = new Map<string, PageClassificationResult>();

  for (const page of pages) {
    const ctx: PageContext = {
      ...page,
      businessModel,
    };
    results.set(page.url, classifyPage(ctx, evidence));
  }

  return results;
}
