import type {
  EnrichmentContext,
  EnrichmentPass,
  EnrichmentResult,
  ShouldRunDecision,
} from "./types";
import { buildFailedResult } from "./types";
import { httpFetch } from "../http-client";
import { extractBodyText } from "../parser";
import { callModel, isLlmEnabled } from "../../../apps/mcp/llm/client";
import type { Evidence, ContentEnrichmentPayload, PolicyPagePayload, FormPayload, PageContentPayload } from "../../../packages/domain";
import {
  EvidenceType,
  SourceKind,
  CollectionMethod,
  FreshnessState,
} from "../../../packages/domain";
import { extractCopyElements } from "./copy-elements-extractor";
import {
  getGuidelinesForPageType,
  serializeGuidelinesForPrompt,
  type PageType,
} from "../../../packages/copy-analysis/guidelines";
import { analyzeCrossPageConsistency } from "./cross-page-copy";
import { runPricingPsychologyEnrichment } from "./pricing-psychology";
import { runLocalizationQualityEnrichment } from "./copy-localization";
import { runMicroCopyEnrichment } from "./copy-micro-copy";
import { runSeoConversionTensionEnrichment } from "./copy-seo-tension";
import { runCopyStalenessEnrichment } from "./copy-staleness";
import type { CopyElementsPayload } from "../../../packages/domain";

// ──────────────────────────────────────────────
// Wave 3.1 — Semantic Enrichment (Policy Pages)
//
// LLM-powered analysis of policy page content quality.
// Uses Haiku for fast, cheap assessment of:
//   - Clarity and readability
//   - Ambiguity flags (vague language)
//   - Regulatory gaps (missing required disclosures)
//   - Missing critical sections
//
// Degradation-safe: all errors are caught and the pass
// returns buildFailedResult(). Rule-based signals from
// Stage A-C continue working without enrichment.
// ──────────────────────────────────────────────

const PASS_NAME = "semantic_enrichment";
const PASS_LABEL = "Wave 3.1 — Semantic Enrichment";

/**
 * Max total LLM-analyzed pages per cycle across all enrichment types (cost control).
 * With 17 enrichment types, each page may trigger multiple analyses.
 * Budget is per-page-analysis (1 Haiku call = 1 budget unit).
 * At ~$0.003/call, 25 units = ~$0.075/cycle — well within acceptable range.
 * The copy staleness enrichment (item P) is regex-only and doesn't consume budget.
 */
const MAX_PAGES = 25;

/** Max body text chars sent to the LLM (cost + context window control) */
const MAX_TEXT_CHARS = 8_000;

// ──────────────────────────────────────────────
// LLM Prompt
// ──────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a policy quality analyst. You assess e-commerce policy pages (refund, privacy, terms, shipping, etc.) for clarity, completeness, and consumer-friendliness.

You MUST respond with valid JSON only — no markdown, no explanation, no preamble.`;

function buildUserPrompt(policyType: string, bodyText: string): string {
  return `Analyze this ${policyType} policy page content for quality. Respond with ONLY a JSON object matching this exact schema:

{
  "clarity_score": <number 0-100, how clear and unambiguous the policy is>,
  "readability_grade": "<string: 'easy' | 'moderate' | 'difficult' | 'very_difficult'>",
  "ambiguity_flags": ["<list of vague/ambiguous phrases or clauses found>"],
  "regulatory_gaps": ["<list of missing regulatory disclosures for e-commerce>"],
  "missing_elements": ["<list of critical sections missing from this policy type>"],
  "confidence": <number 0-100, your confidence in this assessment>
}

Policy content (${policyType}):
---
${bodyText}
---`;
}

// ──────────────────────────────────────────────
// Copy Analysis Prompts (Tier 1)
// ──────────────────────────────────────────────

const CHECKOUT_TRUST_SYSTEM = `You are a checkout trust analyst. You assess e-commerce checkout pages for trust language that reassures buyers at the moment of purchase.

You MUST respond with valid JSON only — no markdown, no explanation, no preamble.`;

function buildCheckoutTrustPrompt(bodyText: string): string {
  return `Analyze this checkout/cart/payment page for trust language. Does it mention:
- Security (SSL, encryption, secure payment)
- Guarantees (money-back, satisfaction, free returns)
- Social proof near the CTA
- Payment method badges

Respond with ONLY a JSON object matching this exact schema:
{
  "trust_signals_present": <boolean>,
  "has_security_language": <boolean>,
  "has_guarantee": <boolean>,
  "has_urgency_manipulation": <boolean>,
  "trust_score": <number 0-100>,
  "confidence": <number 0-100>
}

Page content:
---
${bodyText}
---`;
}

const CTA_CLARITY_SYSTEM = `You are a CTA clarity analyst. You assess web pages for call-to-action effectiveness, competing actions, and clarity of the primary conversion path.

You MUST respond with valid JSON only — no markdown, no explanation, no preamble.`;

function buildCtaClarityPrompt(bodyText: string): string {
  return `Extract all CTA texts from this page. Evaluate:
- Are there competing CTAs?
- Is the primary CTA clear?
- Does the CTA text communicate value vs generic ("Submit", "Click here")?

Respond with ONLY a JSON object matching this exact schema:
{
  "ctas": ["<list of CTA texts found>"],
  "primary_cta_clear": <boolean>,
  "competing_ctas": <number of competing CTAs>,
  "generic_cta_detected": <boolean>,
  "clarity_score": <number 0-100>,
  "confidence": <number 0-100>
}

Page content:
---
${bodyText}
---`;
}

const PRODUCT_PAGE_SYSTEM = `You are a product page copy analyst. You assess product descriptions for quality, uniqueness, benefit-orientation, and persuasiveness.

You MUST respond with valid JSON only — no markdown, no explanation, no preamble.`;

function buildProductPagePrompt(bodyText: string): string {
  return `Analyze this product page description. Evaluate:
- Is the description unique or manufacturer-generic?
- Does it describe benefits or just features?
- Does it address common objections?
- Does it use sensory/emotional language?

Respond with ONLY a JSON object matching this exact schema:
{
  "is_generic_description": <boolean>,
  "benefits_vs_features_ratio": <number 0-1, where 1 = all benefits>,
  "objections_addressed": <boolean>,
  "description_quality_score": <number 0-100>,
  "confidence": <number 0-100>
}

Page content:
---
${bodyText}
---`;
}

const PRICING_FRAMING_SYSTEM = `You are a pricing page analyst. You assess pricing pages for clarity of plan recommendation, value framing, comparison anchoring, and objection handling.

You MUST respond with valid JSON only — no markdown, no explanation, no preamble.`;

function buildPricingFramingPrompt(bodyText: string): string {
  return `Analyze this pricing page. Evaluate:
- Is the recommended plan obvious?
- Are features described as benefits?
- Is there comparison anchoring?
- Are objections handled (FAQ, guarantee)?

Respond with ONLY a JSON object matching this exact schema:
{
  "recommended_plan_clear": <boolean>,
  "value_framing_quality": <number 0-100>,
  "has_objection_handling": <boolean>,
  "framing_score": <number 0-100>,
  "confidence": <number 0-100>
}

Page content:
---
${bodyText}
---`;
}

// ──────────────────────────────────────────────
// Wave 3.10 — Copy Analysis Pack Prompts (8 new)
// ──────────────────────────────────────────────

function buildGuidelinesSystemPrompt(role: string, guidelinesSubset: string): string {
  return `You are a ${role}. You evaluate web pages using evidence-based copy and CRO guidelines.

GUIDELINES (cite guideline IDs in your findings):
${guidelinesSubset}

You MUST respond with valid JSON only — no markdown, no explanation, no preamble.`;
}

// ── 1. Homepage Hero ──

function buildHomepageHeroPrompt(copyElements: string, bodyText: string): string {
  return `Analyze this homepage hero section. Does the value proposition communicate what the product does and why it matters in under 5 seconds? Evaluate the headline against proven formulas (outcome-without-pain, outcome-by-mechanism, never-X-again, etc.). Check CTA specificity — does it communicate value or is it generic?

Respond with ONLY a JSON object matching this exact schema:
{
  "value_prop_score": <number 0-100>,
  "headline_formula_match": <string formula name if matched, or null>,
  "cta_specificity_score": <number 0-100>,
  "issues": [{"guideline_id": "<id>", "finding": "<what is wrong>", "suggestion": "<how to fix>"}],
  "strengths": ["<what the page does well>"],
  "confidence": <number 0-100>
}

EXTRACTED COPY ELEMENTS:
${copyElements}

PAGE CONTENT:
---
${bodyText}
---`;
}

// ── 2. Social Proof Placement ──

function buildSocialProofPlacementPrompt(copyElements: string, bodyText: string): string {
  return `Evaluate the social proof on this page. Is it specific (named people, companies, metrics) or generic? Is it placed near the CTA? What type (testimonial, logo, case study, metric)?

Respond with ONLY a JSON object matching this exact schema:
{
  "proof_quality_score": <number 0-100>,
  "proof_types_found": ["<testimonial|logo|case_study|metric|review|badge>"],
  "specificity": "<high|medium|low|none>",
  "placement_near_cta": <boolean>,
  "issues": [{"guideline_id": "<id>", "finding": "<what is wrong>", "suggestion": "<how to fix>"}],
  "strengths": ["<what the page does well>"],
  "confidence": <number 0-100>
}

EXTRACTED COPY ELEMENTS:
${copyElements}

PAGE CONTENT:
---
${bodyText}
---`;
}

// ── 3. Objection Handling ──

function buildObjectionHandlingPrompt(copyElements: string, bodyText: string): string {
  return `Does this page address common buyer objections? Look for FAQ sections, guarantees, money-back promises, comparison content, ROI calculators, implementation ease claims. Evaluate against loss aversion and regret aversion psychology.

Respond with ONLY a JSON object matching this exact schema:
{
  "objection_coverage_score": <number 0-100>,
  "objections_addressed": ["<list of objections that ARE addressed on-page>"],
  "objections_missing": ["<list of common objections NOT addressed>"],
  "has_guarantee": <boolean>,
  "has_faq": <boolean>,
  "issues": [{"guideline_id": "<id>", "finding": "<what is wrong>", "suggestion": "<how to fix>"}],
  "confidence": <number 0-100>
}

EXTRACTED COPY ELEMENTS:
${copyElements}

PAGE CONTENT:
---
${bodyText}
---`;
}

// ── 4. Urgency & Scarcity ──

function buildUrgencyScarcityPrompt(copyElements: string, bodyText: string): string {
  return `Analyze urgency and scarcity elements on this page. Are they authentic or manipulative? Look for countdown timers, stock counts, "limited offer" language. Flag dark patterns — fake timers that reset, fabricated scarcity, manipulative language. Authentic urgency (real deadlines, genuine capacity limits) is fine.

Respond with ONLY a JSON object matching this exact schema:
{
  "has_urgency": <boolean>,
  "urgency_type": "<authentic|manipulative|none>",
  "elements_found": ["<list of urgency/scarcity elements found>"],
  "dark_pattern_flags": ["<list of dark patterns detected, empty if none>"],
  "issues": [{"guideline_id": "<id>", "finding": "<what is wrong>", "suggestion": "<how to fix>"}],
  "confidence": <number 0-100>
}

EXTRACTED COPY ELEMENTS:
${copyElements}

PAGE CONTENT:
---
${bodyText}
---`;
}

// ── 5. Onboarding Copy ──

function buildOnboardingCopyPrompt(copyElements: string, bodyText: string): string {
  return `Evaluate this onboarding/dashboard page copy. Is there a clear quick-win that shows value fast? Are empty states helpful and instructive? Do tooltips or inline guidance exist? Does the welcome message set expectations? Evaluate against goal-gradient, IKEA effect, and Zeigarnik effect principles.

Respond with ONLY a JSON object matching this exact schema:
{
  "onboarding_quality_score": <number 0-100>,
  "has_welcome": <boolean>,
  "has_quick_win": <boolean>,
  "empty_states_helpful": <boolean>,
  "issues": [{"guideline_id": "<id>", "finding": "<what is wrong>", "suggestion": "<how to fix>"}],
  "confidence": <number 0-100>
}

EXTRACTED COPY ELEMENTS:
${copyElements}

PAGE CONTENT:
---
${bodyText}
---`;
}

// ── 6. Error Page Recovery ──

function buildErrorPageRecoveryPrompt(copyElements: string, bodyText: string): string {
  return `Analyze this error page. Is the tone human and helpful or technical and cold? Does it offer a recovery path (search bar, home link, contact info, popular pages)? Does it maintain brand voice and visual consistency?

Respond with ONLY a JSON object matching this exact schema:
{
  "tone": "<human|technical|mixed>",
  "has_recovery_path": <boolean>,
  "recovery_options": ["<list of recovery options found: search, home_link, contact, popular_pages, back_button>"],
  "brand_consistent": <boolean>,
  "issues": [{"guideline_id": "<id>", "finding": "<what is wrong>", "suggestion": "<how to fix>"}],
  "confidence": <number 0-100>
}

EXTRACTED COPY ELEMENTS:
${copyElements}

PAGE CONTENT:
---
${bodyText}
---`;
}

// ── 7. Navigation Clarity ──

function buildNavigationClarityPrompt(copyElements: string, bodyText: string): string {
  return `Evaluate navigation labels on this page. Are they descriptive or internal jargon? Does the hierarchy match a buyer's mental model? Are there too many items (Hick's Law says 5-7 max)? Are labels benefit-oriented or feature-oriented?

Respond with ONLY a JSON object matching this exact schema:
{
  "clarity_score": <number 0-100>,
  "jargon_labels": ["<list of labels that use internal jargon instead of customer language>"],
  "item_count": <number of top-level nav items>,
  "hierarchy_logical": <boolean>,
  "issues": [{"guideline_id": "<id>", "finding": "<what is wrong>", "suggestion": "<how to fix>"}],
  "confidence": <number 0-100>
}

EXTRACTED COPY ELEMENTS:
${copyElements}

PAGE CONTENT:
---
${bodyText}
---`;
}

// ── 8. Above-Fold Density ──

function buildAboveFoldDensityPrompt(copyElements: string, bodyText: string): string {
  return `Analyze above-the-fold content density. Is the primary message clear or diluted by competing elements? Count: pop-ups, banners, competing CTAs, auto-play videos, chat widgets, cookie notices. Is there a clear visual hierarchy with one dominant element? Evaluate using BJ Fogg's ability model — does complexity reduce the user's ability to act?

Respond with ONLY a JSON object matching this exact schema:
{
  "density_score": <number 0-100, where 100 = clean and focused>,
  "noise_elements": ["<list of distracting elements found above the fold>"],
  "primary_message_clear": <boolean>,
  "competing_ctas": <number of CTAs competing for attention above the fold>,
  "issues": [{"guideline_id": "<id>", "finding": "<what is wrong>", "suggestion": "<how to fix>"}],
  "confidence": <number 0-100>
}

EXTRACTED COPY ELEMENTS:
${copyElements}

PAGE CONTENT:
---
${bodyText}
---`;
}

// ──────────────────────────────────────────────
// Wave 3.10: Guidelines-aware enrichment runner
// ──────────────────────────────────────────────

/**
 * Run a Wave 3.10 copy analysis enrichment that uses:
 * 1. extractCopyElements() for structured page data
 * 2. getGuidelinesForPageType() + category filter for focused guidelines
 * 3. Haiku LLM for analysis
 */
async function runCopyAnalysisEnrichment(
  ctx: EnrichmentContext,
  pages: Evidence[],
  enrichmentType: ContentEnrichmentPayload['enrichment_type'],
  guidelineCategories: string[],
  buildPrompt: (copyElements: string, bodyText: string) => string,
  label: string,
  evidenceAdded: Evidence[],
  budget: { remaining: number; processed: number },
  pageTypeOverride?: PageType,
): Promise<void> {
  const cap = Math.min(pages.length, budget.remaining);
  if (cap <= 0) return;

  for (let i = 0; i < cap; i++) {
    const pageEvidence = pages[i];
    const p = pageEvidence.payload as PageContentPayload;
    budget.processed++;
    budget.remaining--;

    ctx.emit({
      type: "step",
      stage: "enrichment",
      data: {
        message: `Wave 3.10: ${label} (${i + 1}/${cap}) — ${p.url}`,
        index: budget.processed,
      },
      timestamp: new Date(),
    });

    try {
      const response = await httpFetch(p.url);
      if (response.status_code >= 400 && enrichmentType !== 'error_page_recovery') {
        console.warn(`[semantic-enrichment ${ctx.cycle_ref}] ${p.url} returned ${response.status_code}, skipping ${label}`);
        continue;
      }

      const html = response.body;
      const bodyText = extractBodyText(html);
      if (!bodyText || bodyText.length < 50) {
        console.warn(`[semantic-enrichment ${ctx.cycle_ref}] ${p.url} insufficient body text, skipping ${label}`);
        continue;
      }

      // 1. Classify page and extract copy elements
      const pageType = pageTypeOverride || classifyPageType(p.url);
      const funnelStage = inferFunnelStage(pageType);
      const copyElements = extractCopyElements(html, p.url, pageType, funnelStage);

      // 2. Get relevant guidelines subset
      const allGuidelines = getGuidelinesForPageType(pageType);
      const filtered = filterGuidelinesByCategory(allGuidelines, guidelineCategories);
      const guidelinesText = serializeGuidelinesForPrompt(filtered);

      // 3. Build system prompt with guidelines
      const systemPrompt = buildGuidelinesSystemPrompt(
        `${label} specialist`,
        guidelinesText,
      );

      // 4. Serialize copy elements and build user prompt
      const copyElementsText = serializeCopyElementsForPrompt(copyElements);
      const truncatedText = bodyText.slice(0, MAX_TEXT_CHARS);
      const userPrompt = buildPrompt(copyElementsText, truncatedText);

      // 5. Call Haiku
      const result = await callModel("haiku_4_5", [
        { role: "user", content: userPrompt },
      ], {
        max_tokens: 1024,
        temperature: 0.1,
        system: systemPrompt,
      });

      const textBlock = result.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        console.warn(`[semantic-enrichment ${ctx.cycle_ref}] no text in LLM response for ${label} on ${p.url}`);
        continue;
      }

      // 6. Parse JSON response
      const assessment = parseJsonResponse(textBlock.text);
      if (!assessment) {
        console.warn(`[semantic-enrichment ${ctx.cycle_ref}] failed to parse LLM response for ${label} on ${p.url}`);
        continue;
      }

      // 7. Build evidence
      const now = new Date();
      const enrichmentPayload: ContentEnrichmentPayload = {
        type: "content_enrichment",
        enrichment_type: enrichmentType,
        source_evidence_key: pageEvidence.evidence_key,
        source_url: p.url,
        scores: { clarity_score: 0, readability_grade: "n/a" },
        flags: { ambiguity_flags: [], regulatory_gaps: [] },
        missing_elements: [],
        results: assessment as Record<string, unknown>,
        confidence: assessment.confidence,
        model_used: result.model,
        cached: false,
      };

      const evidence: Evidence = {
        id: `enrich_${enrichmentType}_${budget.processed}_${Date.now()}`,
        evidence_key: `content_enrichment:${enrichmentType}:${p.url}`,
        evidence_type: EvidenceType.ContentEnrichment,
        subject_ref: ctx.scoping.subject_ref || `website:${ctx.root_domain}`,
        scoping: ctx.scoping,
        cycle_ref: ctx.cycle_ref,
        freshness: {
          observed_at: now,
          fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          freshness_state: FreshnessState.Fresh,
          staleness_reason: null,
        },
        source_kind: SourceKind.HttpFetch,
        collection_method: CollectionMethod.ApiCall,
        payload: enrichmentPayload,
        quality_score: assessment.confidence,
        created_at: now,
        updated_at: now,
      };

      evidenceAdded.push(evidence);
    } catch (pageErr) {
      const message = pageErr instanceof Error ? pageErr.message : String(pageErr);
      console.warn(`[semantic-enrichment ${ctx.cycle_ref}] error in ${label} for ${p.url}: ${message}`);
    }
  }
}

// ──────────────────────────────────────────────
// URL classification helpers
// ──────────────────────────────────────────────

const CHECKOUT_URL_PATTERNS = /\/(checkout|cart|payment|pay|order|compra|carrinho|pagamento)/i;
const PRODUCT_URL_PATTERNS = /\/(product|item|p|produto|produit)\//i;
const PRICING_URL_PATTERNS = /\/(pricing|plans|precos|prices|planos)/i;
const COMMERCIAL_URL_PATTERNS = /\/(checkout|cart|payment|product|item|p|pricing|plans|precos|homepage|$)/i;

function isCheckoutPage(url: string, evidence: readonly Evidence[]): boolean {
  if (CHECKOUT_URL_PATTERNS.test(url)) return true;
  // Check if any form on this page has payment fields
  return evidence.some(
    (e) =>
      e.evidence_type === EvidenceType.Form &&
      (e.payload as FormPayload).page_url === url &&
      (e.payload as FormPayload).has_payment_fields,
  );
}

function isProductPage(url: string): boolean {
  return PRODUCT_URL_PATTERNS.test(url);
}

function isPricingPage(url: string): boolean {
  return PRICING_URL_PATTERNS.test(url);
}

function isCommercialPage(url: string): boolean {
  return COMMERCIAL_URL_PATTERNS.test(url) || isCheckoutPage(url, []) || isProductPage(url) || isPricingPage(url);
}

// ── Wave 3.10 additional classifiers ──

const HOMEPAGE_URL_PATTERNS = /^https?:\/\/[^/]+\/?(\?.*)?$/i;
const LANDING_PAGE_PATTERNS = /\/(lp|landing|promo|campaign|offer)\b/i;
const ONBOARDING_URL_PATTERNS = /\/(app|dashboard|onboard|welcome|getting-started|setup)\b/i;
const ERROR_PAGE_PATTERNS = /\/(404|500|error|not-found|page-not-found)\b/i;

function isHomepageOrLanding(url: string): boolean {
  return HOMEPAGE_URL_PATTERNS.test(url) || LANDING_PAGE_PATTERNS.test(url);
}

function isOnboardingPage(url: string): boolean {
  return ONBOARDING_URL_PATTERNS.test(url);
}

function isErrorPage(url: string, statusCode?: number): boolean {
  if (statusCode && statusCode >= 400) return true;
  return ERROR_PAGE_PATTERNS.test(url);
}

/** Classify a URL to a PageType for guidelines lookup */
function classifyPageType(url: string): PageType {
  if (isOnboardingPage(url)) return 'onboarding';
  if (isErrorPage(url)) return 'error';
  if (isPricingPage(url)) return 'pricing';
  if (isCheckoutPage(url, [])) return 'checkout';
  if (isProductPage(url)) return 'product';
  if (isHomepageOrLanding(url)) return 'homepage';
  return 'all_commercial';
}

/** Infer funnel stage from page type */
function inferFunnelStage(pageType: PageType): string {
  switch (pageType) {
    case 'homepage':
    case 'landing_page':
    case 'blog':
      return 'awareness';
    case 'feature':
    case 'product':
    case 'about':
      return 'consideration';
    case 'pricing':
    case 'checkout':
      return 'decision';
    case 'onboarding':
      return 'retention';
    default:
      return 'awareness';
  }
}

/** Filter guidelines by specific categories */
function filterGuidelinesByCategory(
  guidelines: ReturnType<typeof getGuidelinesForPageType>,
  categories: string[],
): ReturnType<typeof getGuidelinesForPageType> {
  return guidelines.filter((g) => categories.includes(g.category));
}

/** Serialize copy elements into a compact string for the user prompt */
function serializeCopyElementsForPrompt(elements: ReturnType<typeof extractCopyElements>): string {
  const parts: string[] = [];
  if (elements.h1) parts.push(`H1: ${elements.h1}`);
  if (elements.subheadline) parts.push(`Subheadline: ${elements.subheadline}`);
  if (elements.primary_cta) parts.push(`Primary CTA: ${elements.primary_cta}`);
  if (elements.cta_texts.length > 0) parts.push(`All CTAs: ${elements.cta_texts.join(' | ')}`);
  if (elements.social_proof_elements.length > 0) parts.push(`Social proof: ${elements.social_proof_elements.join(' | ')}`);
  if (elements.trust_signals.length > 0) parts.push(`Trust signals: ${elements.trust_signals.join(' | ')}`);
  if (elements.urgency_indicators.length > 0) parts.push(`Urgency: ${elements.urgency_indicators.join(' | ')}`);
  if (elements.navigation_labels.length > 0) parts.push(`Nav labels: ${elements.navigation_labels.join(' | ')}`);
  parts.push(`Above fold: ${elements.above_fold_text}`);
  parts.push(`Word count: ${elements.word_count} | CTA count: ${elements.cta_count} | Has form: ${elements.has_form} | Has FAQ: ${elements.has_faq} | Has pricing table: ${elements.has_pricing_table}`);
  return parts.join('\n');
}

// ──────────────────────────────────────────────
// Response parsing
// ──────────────────────────────────────────────

interface PolicyQualityAssessment {
  clarity_score: number;
  readability_grade: string;
  ambiguity_flags: string[];
  regulatory_gaps: string[];
  missing_elements: string[];
  confidence: number;
}

function parseAssessment(raw: string): PolicyQualityAssessment | null {
  try {
    // Strip markdown fences if present
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(cleaned);

    // Validate required fields
    if (
      typeof parsed.clarity_score !== "number" ||
      typeof parsed.readability_grade !== "string" ||
      !Array.isArray(parsed.ambiguity_flags) ||
      !Array.isArray(parsed.regulatory_gaps) ||
      !Array.isArray(parsed.missing_elements) ||
      typeof parsed.confidence !== "number"
    ) {
      return null;
    }

    return {
      clarity_score: Math.max(0, Math.min(100, parsed.clarity_score)),
      readability_grade: parsed.readability_grade,
      ambiguity_flags: parsed.ambiguity_flags.filter((f: unknown) => typeof f === "string"),
      regulatory_gaps: parsed.regulatory_gaps.filter((f: unknown) => typeof f === "string"),
      missing_elements: parsed.missing_elements.filter((f: unknown) => typeof f === "string"),
      confidence: Math.max(0, Math.min(100, parsed.confidence)),
    };
  } catch {
    return null;
  }
}

/** Generic JSON parser that strips markdown fences and validates confidence field */
function parseJsonResponse(raw: string): (Record<string, unknown> & { confidence: number }) | null {
  try {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.confidence !== "number") return null;
    parsed.confidence = Math.max(0, Math.min(100, parsed.confidence));
    return parsed;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────
// Eligibility (shouldRun)
// ──────────────────────────────────────────────

function shouldRun(ctx: EnrichmentContext): ShouldRunDecision {
  // Gate 1: Only full audit cycles
  if (ctx.mode !== "full") {
    return {
      run: false,
      reason: `mode is '${ctx.mode}' — semantic enrichment only runs in 'full' mode`,
    };
  }

  // Gate 2: LLM must be enabled
  if (!isLlmEnabled()) {
    return {
      run: false,
      reason: "LLM not enabled (VESTIGIO_LLM_ENABLED !== 'true' or ANTHROPIC_API_KEY missing)",
    };
  }

  // Gate 3: Must have policy pages OR page content with commercial URLs
  const policyPages = ctx.evidence.filter(
    (e) =>
      e.evidence_type === EvidenceType.PolicyPage &&
      (e.payload as PolicyPagePayload).detected === true,
  );

  const pageContentEvidence = ctx.evidence.filter(
    (e) => e.evidence_type === EvidenceType.PageContent,
  );

  if (policyPages.length === 0 && pageContentEvidence.length === 0) {
    return {
      run: false,
      reason: "no detected policy pages or page content in evidence",
    };
  }

  return {
    run: true,
    reason: `${policyPages.length} policy page(s), ${pageContentEvidence.length} page content(s), mode=full, LLM enabled`,
  };
}

// ──────────────────────────────────────────────
// Execution
// ──────────────────────────────────────────────

async function run(ctx: EnrichmentContext): Promise<EnrichmentResult> {
  const startTime = Date.now();

  ctx.emit({
    type: "step",
    stage: "enrichment",
    data: { message: "Wave 3.1: starting semantic enrichment of policy pages", index: 0 },
    timestamp: new Date(),
  });

  try {
    // Collect detected policy pages, capped at MAX_PAGES
    const policyPages = ctx.evidence
      .filter(
        (e) =>
          e.evidence_type === EvidenceType.PolicyPage &&
          (e.payload as PolicyPagePayload).detected === true,
      )
      .slice(0, MAX_PAGES);

    const evidenceAdded: Evidence[] = [];
    let pagesProcessed = 0;

    for (const policyEvidence of policyPages) {
      const payload = policyEvidence.payload as PolicyPagePayload;
      pagesProcessed++;

      ctx.emit({
        type: "step",
        stage: "enrichment",
        data: {
          message: `Wave 3.1: analyzing ${payload.policy_type} policy (${pagesProcessed}/${policyPages.length})`,
          index: pagesProcessed,
        },
        timestamp: new Date(),
      });

      try {
        // 1. Re-fetch the page to get fresh body content
        const response = await httpFetch(payload.url);
        if (response.status_code >= 400) {
          console.warn(
            `[semantic-enrichment ${ctx.cycle_ref}] ${payload.url} returned ${response.status_code}, skipping`,
          );
          continue;
        }

        // 2. Extract body text
        const bodyText = extractBodyText(response.body);
        if (!bodyText || bodyText.length < 50) {
          console.warn(
            `[semantic-enrichment ${ctx.cycle_ref}] ${payload.url} has insufficient body text, skipping`,
          );
          continue;
        }

        // 3. Truncate to MAX_TEXT_CHARS for cost control
        const truncatedText = bodyText.slice(0, MAX_TEXT_CHARS);

        // 4. Call Haiku for policy quality assessment
        const result = await callModel("haiku_4_5", [
          {
            role: "user",
            content: buildUserPrompt(payload.policy_type, truncatedText),
          },
        ], {
          max_tokens: 1024,
          temperature: 0.1,
          system: SYSTEM_PROMPT,
        });

        // 5. Extract text from response
        const textBlock = result.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          console.warn(
            `[semantic-enrichment ${ctx.cycle_ref}] no text in LLM response for ${payload.url}`,
          );
          continue;
        }

        // 6. Parse structured response
        const assessment = parseAssessment(textBlock.text);
        if (!assessment) {
          console.warn(
            `[semantic-enrichment ${ctx.cycle_ref}] failed to parse LLM response for ${payload.url}`,
          );
          continue;
        }

        // 7. Build ContentEnrichmentPayload evidence
        const now = new Date();
        const enrichmentPayload: ContentEnrichmentPayload = {
          type: "content_enrichment",
          enrichment_type: "policy_quality",
          source_evidence_key: policyEvidence.evidence_key,
          source_url: payload.url,
          scores: {
            clarity_score: assessment.clarity_score,
            readability_grade: assessment.readability_grade,
          },
          flags: {
            ambiguity_flags: assessment.ambiguity_flags,
            regulatory_gaps: assessment.regulatory_gaps,
          },
          missing_elements: assessment.missing_elements,
          results: {},
          confidence: assessment.confidence,
          model_used: result.model,
          cached: false,
        };

        const evidence: Evidence = {
          id: `enrich_${pagesProcessed}_${Date.now()}`,
          evidence_key: `content_enrichment:${payload.policy_type}:${payload.url}`,
          evidence_type: EvidenceType.ContentEnrichment,
          subject_ref: ctx.scoping.subject_ref || `website:${ctx.root_domain}`,
          scoping: ctx.scoping,
          cycle_ref: ctx.cycle_ref,
          freshness: {
            observed_at: now,
            fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            freshness_state: FreshnessState.Fresh,
            staleness_reason: null,
          },
          source_kind: SourceKind.HttpFetch,
          collection_method: CollectionMethod.ApiCall,
          payload: enrichmentPayload,
          quality_score: assessment.confidence,
          created_at: now,
          updated_at: now,
        };

        evidenceAdded.push(evidence);
      } catch (pageErr) {
        // Per-page errors are non-fatal — continue to next page
        const message = pageErr instanceof Error ? pageErr.message : String(pageErr);
        console.warn(
          `[semantic-enrichment ${ctx.cycle_ref}] error processing ${payload.url}: ${message}`,
        );
      }
    }

    // ── Tier 1 Copy Analysis: analyze commercial pages ──
    // Collect unique page URLs from PageContent evidence
    const pageContentEvidence = ctx.evidence.filter(
      (e) => e.evidence_type === EvidenceType.PageContent,
    );

    // Classify pages by type for enrichment
    const checkoutPages: Evidence[] = [];
    const commercialPages: Evidence[] = [];
    const productPages: Evidence[] = [];
    const pricingPages: Evidence[] = [];

    for (const e of pageContentEvidence) {
      const p = e.payload as PageContentPayload;
      const url = p.url;
      if (isCheckoutPage(url, ctx.evidence)) checkoutPages.push(e);
      if (isCommercialPage(url)) commercialPages.push(e);
      if (isProductPage(url)) productPages.push(e);
      if (isPricingPage(url)) pricingPages.push(e);
    }

    // Budget guard: track total pages analyzed across all types
    let totalBudget = MAX_PAGES - pagesProcessed;

    // Helper: run a copy enrichment pass for a set of pages
    async function runCopyEnrichment(
      pages: Evidence[],
      enrichmentType: ContentEnrichmentPayload['enrichment_type'],
      systemPrompt: string,
      buildPrompt: (bodyText: string) => string,
      label: string,
    ): Promise<void> {
      const cap = Math.min(pages.length, totalBudget);
      if (cap <= 0) return;

      for (let i = 0; i < cap; i++) {
        const pageEvidence = pages[i];
        const p = pageEvidence.payload as PageContentPayload;
        pagesProcessed++;
        totalBudget--;

        ctx.emit({
          type: "step",
          stage: "enrichment",
          data: {
            message: `Wave 3.1: ${label} (${i + 1}/${cap}) — ${p.url}`,
            index: pagesProcessed,
          },
          timestamp: new Date(),
        });

        try {
          const response = await httpFetch(p.url);
          if (response.status_code >= 400) {
            console.warn(`[semantic-enrichment ${ctx.cycle_ref}] ${p.url} returned ${response.status_code}, skipping ${label}`);
            continue;
          }

          const bodyText = extractBodyText(response.body);
          if (!bodyText || bodyText.length < 50) {
            console.warn(`[semantic-enrichment ${ctx.cycle_ref}] ${p.url} insufficient body text, skipping ${label}`);
            continue;
          }

          const truncatedText = bodyText.slice(0, MAX_TEXT_CHARS);

          const result = await callModel("haiku_4_5", [
            { role: "user", content: buildPrompt(truncatedText) },
          ], {
            max_tokens: 1024,
            temperature: 0.1,
            system: systemPrompt,
          });

          const textBlock = result.content.find((b) => b.type === "text");
          if (!textBlock || textBlock.type !== "text") {
            console.warn(`[semantic-enrichment ${ctx.cycle_ref}] no text in LLM response for ${label} on ${p.url}`);
            continue;
          }

          const assessment = parseJsonResponse(textBlock.text);
          if (!assessment) {
            console.warn(`[semantic-enrichment ${ctx.cycle_ref}] failed to parse LLM response for ${label} on ${p.url}`);
            continue;
          }

          const now = new Date();
          const enrichmentPayload: ContentEnrichmentPayload = {
            type: "content_enrichment",
            enrichment_type: enrichmentType,
            source_evidence_key: pageEvidence.evidence_key,
            source_url: p.url,
            scores: { clarity_score: 0, readability_grade: "n/a" },
            flags: { ambiguity_flags: [], regulatory_gaps: [] },
            missing_elements: [],
            results: assessment as Record<string, unknown>,
            confidence: assessment.confidence,
            model_used: result.model,
            cached: false,
          };

          const evidence: Evidence = {
            id: `enrich_${enrichmentType}_${pagesProcessed}_${Date.now()}`,
            evidence_key: `content_enrichment:${enrichmentType}:${p.url}`,
            evidence_type: EvidenceType.ContentEnrichment,
            subject_ref: ctx.scoping.subject_ref || `website:${ctx.root_domain}`,
            scoping: ctx.scoping,
            cycle_ref: ctx.cycle_ref,
            freshness: {
              observed_at: now,
              fresh_until: new Date(now.getTime() + 24 * 60 * 60 * 1000),
              freshness_state: FreshnessState.Fresh,
              staleness_reason: null,
            },
            source_kind: SourceKind.HttpFetch,
            collection_method: CollectionMethod.ApiCall,
            payload: enrichmentPayload,
            quality_score: assessment.confidence,
            created_at: now,
            updated_at: now,
          };

          evidenceAdded.push(evidence);
        } catch (pageErr) {
          const message = pageErr instanceof Error ? pageErr.message : String(pageErr);
          console.warn(`[semantic-enrichment ${ctx.cycle_ref}] error in ${label} for ${p.url}: ${message}`);
        }
      }
    }

    // Run each copy analysis type (Tier 1 — existing)
    await runCopyEnrichment(checkoutPages, 'checkout_trust', CHECKOUT_TRUST_SYSTEM, buildCheckoutTrustPrompt, 'checkout trust analysis');
    await runCopyEnrichment(commercialPages, 'cta_clarity', CTA_CLARITY_SYSTEM, buildCtaClarityPrompt, 'CTA clarity analysis');
    await runCopyEnrichment(productPages, 'product_page_quality', PRODUCT_PAGE_SYSTEM, buildProductPagePrompt, 'product page quality analysis');
    await runCopyEnrichment(pricingPages, 'pricing_page_framing', PRICING_FRAMING_SYSTEM, buildPricingFramingPrompt, 'pricing page framing analysis');

    // ── Wave 3.10 Copy Analysis Pack (8 new enrichment types) ──
    // Classify additional page sets for the new enrichment types
    const homepageLandingPages: Evidence[] = [];
    const onboardingPages: Evidence[] = [];
    const errorPages: Evidence[] = [];
    const allPages: Evidence[] = [];

    for (const e of pageContentEvidence) {
      const p = e.payload as PageContentPayload;
      const url = p.url;
      allPages.push(e);
      if (isHomepageOrLanding(url)) homepageLandingPages.push(e);
      if (isOnboardingPage(url)) onboardingPages.push(e);
      if (isErrorPage(url)) errorPages.push(e);
    }

    // Shared budget tracker for Wave 3.10
    const w310Budget = { remaining: totalBudget, processed: pagesProcessed };

    // 1. Homepage Hero — homepage/landing pages
    await runCopyAnalysisEnrichment(
      ctx, homepageLandingPages, 'homepage_hero',
      ['value_proposition', 'headline', 'cta', 'above_fold'],
      buildHomepageHeroPrompt, 'homepage hero analysis',
      evidenceAdded, w310Budget, 'homepage',
    );

    // 2. Social Proof Placement — all commercial pages
    await runCopyAnalysisEnrichment(
      ctx, commercialPages, 'social_proof_placement',
      ['social_proof'],
      buildSocialProofPlacementPrompt, 'social proof placement analysis',
      evidenceAdded, w310Budget,
    );

    // 3. Objection Handling — pricing, product, checkout pages
    const objectionPages = [...pricingPages, ...productPages, ...checkoutPages]
      .filter((e, i, arr) => arr.findIndex((x) => (x.payload as PageContentPayload).url === (e.payload as PageContentPayload).url) === i);
    await runCopyAnalysisEnrichment(
      ctx, objectionPages, 'objection_handling',
      ['objection_handling'],
      buildObjectionHandlingPrompt, 'objection handling analysis',
      evidenceAdded, w310Budget,
    );

    // 4. Urgency & Scarcity — product, pricing, checkout pages
    await runCopyAnalysisEnrichment(
      ctx, objectionPages, 'urgency_scarcity',
      ['urgency_scarcity'],
      buildUrgencyScarcityPrompt, 'urgency & scarcity analysis',
      evidenceAdded, w310Budget,
    );

    // 5. Onboarding Copy — SaaS dashboard/app/onboard pages
    await runCopyAnalysisEnrichment(
      ctx, onboardingPages, 'onboarding_copy',
      ['onboarding'],
      buildOnboardingCopyPrompt, 'onboarding copy analysis',
      evidenceAdded, w310Budget, 'onboarding',
    );

    // 6. Error Page Recovery — error pages (4xx/5xx or error URL patterns)
    await runCopyAnalysisEnrichment(
      ctx, errorPages, 'error_page_recovery',
      ['trust_signals', 'copy_style', 'navigation'],
      buildErrorPageRecoveryPrompt, 'error page recovery analysis',
      evidenceAdded, w310Budget, 'error',
    );

    // 7. Navigation Clarity — all pages
    await runCopyAnalysisEnrichment(
      ctx, allPages, 'navigation_clarity',
      ['navigation'],
      buildNavigationClarityPrompt, 'navigation clarity analysis',
      evidenceAdded, w310Budget,
    );

    // 8. Above-Fold Density — all commercial pages
    await runCopyAnalysisEnrichment(
      ctx, commercialPages, 'above_fold_density',
      ['above_fold', 'page_structure'],
      buildAboveFoldDensityPrompt, 'above-fold density analysis',
      evidenceAdded, w310Budget,
    );

    // ── Wave 3.10 Fase 3: Pricing Psychology (Item L) ──
    // Runs on pricing pages AFTER the standard pricing_page_framing enrichment.
    // Deeper psychology-specific analysis: charm pricing, anchoring, Good-Better-Best, etc.
    await runPricingPsychologyEnrichment(ctx, pricingPages, evidenceAdded, w310Budget);

    // ── Wave 3.10 Fase 4: Micro-Copy Audit (Item N) ──
    // Runs on form pages and app/dashboard pages.
    await runMicroCopyEnrichment(ctx, pageContentEvidence, evidenceAdded, w310Budget);

    // ── Wave 3.10 Fase 4: SEO vs Conversion Tension (Item O) ──
    // Runs on all commercial pages.
    await runSeoConversionTensionEnrichment(ctx, pageContentEvidence, evidenceAdded, w310Budget);

    // ── Wave 3.10 Fase 4: Localization Quality (Item M) ──
    // Runs AFTER per-page analysis when multi-locale detected.
    await runLocalizationQualityEnrichment(ctx, pageContentEvidence, evidenceAdded, w310Budget);

    // ── Wave 3.10 Fase 4: Copy Staleness (Item P) ──
    // Zero LLM cost — pure regex/pattern matching, runs on every page.
    await runCopyStalenessEnrichment(ctx, pageContentEvidence, evidenceAdded);

    // ── Wave 3.10 Fase 3: Cross-Page Narrative Consistency (Item K) ──
    // Runs AFTER all per-page enrichments complete. Collects CopyElementsPayload
    // evidence from the cycle and (if 3+ commercial pages) runs a single Haiku
    // call comparing copy across all pages.
    try {
      const copyElementsByPage = new Map<string, CopyElementsPayload>();
      for (const e of ctx.evidence) {
        if (
          e.evidence_type === EvidenceType.ContentEnrichment &&
          (e.payload as ContentEnrichmentPayload).type === 'content_enrichment'
        ) {
          // Skip — these are enrichments, not copy elements
          continue;
        }
        if (
          'type' in e.payload &&
          (e.payload as CopyElementsPayload).type === 'copy_elements'
        ) {
          const ce = e.payload as CopyElementsPayload;
          copyElementsByPage.set(ce.url, ce);
        }
      }

      // Also extract from pages we just analyzed (in case copy_elements evidence
      // was not produced by a separate pass). Build from allPages when the map
      // is still below threshold.
      if (copyElementsByPage.size < 3 && allPages.length >= 3) {
        for (const pe of allPages.slice(0, 15)) {
          const p = pe.payload as PageContentPayload;
          if (copyElementsByPage.has(p.url)) continue;
          try {
            const resp = await httpFetch(p.url);
            if (resp.status_code < 400 && resp.body) {
              const pageType = classifyPageType(p.url);
              const funnelStage = inferFunnelStage(pageType);
              const ce = extractCopyElements(resp.body, p.url, pageType, funnelStage);
              copyElementsByPage.set(p.url, ce);
            }
          } catch {
            // Non-fatal — skip this page
          }
        }
      }

      if (copyElementsByPage.size >= 3) {
        ctx.emit({
          type: "step",
          stage: "enrichment",
          data: {
            message: `Wave 3.10: cross-page consistency analysis (${copyElementsByPage.size} pages)`,
            index: w310Budget.processed + 1,
          },
          timestamp: new Date(),
        });

        const crossPageEvidence = await analyzeCrossPageConsistency(
          copyElementsByPage,
          ctx.scoping,
          ctx.cycle_ref,
        );
        evidenceAdded.push(...crossPageEvidence);
        w310Budget.processed += crossPageEvidence.length;
      }
    } catch (crossPageErr) {
      const msg = crossPageErr instanceof Error ? crossPageErr.message : String(crossPageErr);
      console.warn(`[semantic-enrichment ${ctx.cycle_ref}] cross-page analysis error: ${msg}`);
    }

    // Sync budget back
    totalBudget = w310Budget.remaining;
    pagesProcessed = w310Budget.processed;

    ctx.emit({
      type: "step",
      stage: "enrichment",
      data: {
        message: `Wave 3.1: semantic enrichment complete — ${evidenceAdded.length} enrichment(s) from ${pagesProcessed} page(s)`,
        index: pagesProcessed + 1,
      },
      timestamp: new Date(),
    });

    return {
      pass_name: PASS_NAME,
      status: "completed",
      reason: `${evidenceAdded.length} page(s) enriched (policy + copy analysis)`,
      evidence_added: evidenceAdded,
      duration_ms: Date.now() - startTime,
      attempts: 1,
      cost_units: evidenceAdded.length, // 1 LLM call per enriched page
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[semantic-enrichment ${ctx.cycle_ref}] pass-level error:`, err);
    return buildFailedResult(
      PASS_NAME,
      `Semantic enrichment failed: ${message}`,
      Date.now() - startTime,
      1,
    );
  }
}

// ──────────────────────────────────────────────
// Pass export
// ──────────────────────────────────────────────

export const semanticEnrichmentPass: EnrichmentPass = {
  name: PASS_NAME,
  label: PASS_LABEL,
  shouldRun,
  run,
};
