import { callModel } from "../../../apps/mcp/llm/client";
import { httpFetch } from "../http-client";
import { extractBodyText } from "../parser";
import { extractCopyElements } from "./copy-elements-extractor";
import {
  getGuidelinesForPageType,
  serializeGuidelinesForPrompt,
} from "../../../packages/copy-analysis/guidelines";
import type {
  Evidence,
  ContentEnrichmentPayload,
  PageContentPayload,
} from "../../../packages/domain";
import {
  EvidenceType,
  SourceKind,
  CollectionMethod,
  FreshnessState,
} from "../../../packages/domain";
import type { EnrichmentContext } from "./types";

// ──────────────────────────────────────────────
// Wave 3.10 Fase 3 — Pricing Page Psychology
//
// Specialized Haiku analysis that goes deeper than the existing
// `pricing_page_framing` enrichment. Uses marketing-psychology
// pricing models from the guidelines KB:
//   - Charm pricing (left-digit bias, $99 vs $100)
//   - Rule of 100 (% off < $100, $ off > $100)
//   - Good-Better-Best (3 tiers, recommended, decoy)
//   - Mental accounting ($/day vs $/month vs $/year)
//   - Anchoring (highest price first, cost-of-inaction)
//   - Loss framing ("Save $X" vs "Don't lose $X")
//   - Social proof on pricing page
//   - Objection handling (FAQ, guarantee)
//
// Only runs on pages classified as 'pricing'.
// Runs AFTER the standard pricing_page_framing enrichment.
// ──────────────────────────────────────────────

/** Max body text chars sent to the LLM */
const MAX_TEXT_CHARS = 8_000;

// ── Types ──────────────────────────────────────

export interface PricingPsychologyAnalysis {
  psychology_score: number; // 0-100
  pricing_model: "tiered" | "single" | "usage_based" | "custom" | "unknown";
  tier_count: number;
  has_recommended_plan: boolean;
  has_anchor_price: boolean;
  charm_pricing_used: boolean;
  framing_type: "gain" | "loss" | "neutral";
  mental_accounting: string | null; // "per_day" | "per_month" | "per_year" | null
  techniques_detected: string[];
  techniques_missing: string[];
  issues: Array<{
    finding: string;
    suggestion: string;
    psychology_model: string;
  }>;
  confidence: number;
}

// ── Prompt ──────────────────────────────────────

function buildPricingPsychologySystemPrompt(guidelinesText: string): string {
  return `You are a pricing page psychology analyst specializing in behavioral economics and pricing psychology. You evaluate pricing pages against evidence-based psychological pricing models.

GUIDELINES (cite guideline IDs in your findings):
${guidelinesText}

You MUST respond with valid JSON only — no markdown fences, no explanation, no preamble.`;
}

function buildPricingPsychologyPrompt(
  copyElements: string,
  bodyText: string,
): string {
  return `Analyze this pricing page using pricing psychology principles. Evaluate:

1. **Charm pricing**: Are prices ending in 9/99? ($99 vs $100 — left-digit bias)
2. **Rule of 100**: For items <$100, is % discount shown? For >$100, is $ amount shown?
3. **Good-Better-Best**: Are there 3 tiers? Is middle recommended? Is there a visual anchor/decoy?
4. **Mental accounting framing**: Is price shown as $/day, $/month, $/year? Which frame is used?
5. **Anchoring**: Is the highest price shown first? Is cost-of-inaction anchoring used?
6. **Loss framing**: "Save $X" vs "Don't lose $X/month" — which frame is used?
7. **Social proof on pricing**: Are testimonials on the pricing page? Do they reference value/ROI?
8. **Objection handling**: FAQ below pricing? Money-back guarantee visible?

Respond with ONLY a JSON object matching this exact schema:
{
  "psychology_score": <number 0-100, overall pricing psychology effectiveness>,
  "pricing_model": "<tiered | single | usage_based | custom | unknown>",
  "tier_count": <number of pricing tiers found>,
  "has_recommended_plan": <boolean, is one plan visually highlighted as recommended>,
  "has_anchor_price": <boolean, is anchoring used (highest first, or cost-of-inaction)>,
  "charm_pricing_used": <boolean, are prices ending in 9/99>,
  "framing_type": "<gain | loss | neutral>",
  "mental_accounting": <"per_day" | "per_month" | "per_year" | null>,
  "techniques_detected": ["<list of psychology techniques actively used, e.g. anchoring, decoy_effect, social_proof, charm_pricing, loss_framing, mental_accounting, reciprocity, zero_price_effect>"],
  "techniques_missing": ["<list of high-impact techniques NOT used but should be>"],
  "issues": [{"finding": "<what is wrong>", "suggestion": "<how to fix>", "psychology_model": "<which model this applies to>"}],
  "confidence": <number 0-100>
}

EXTRACTED COPY ELEMENTS:
${copyElements}

PAGE CONTENT:
---
${bodyText}
---`;
}

// ── Response parsing ───────────────────────────

function parseAssessment(raw: string): PricingPsychologyAnalysis | null {
  try {
    const cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.psychology_score !== "number") return null;
    if (typeof parsed.confidence !== "number") return null;

    return {
      psychology_score: Math.max(0, Math.min(100, parsed.psychology_score)),
      pricing_model: validatePricingModel(
        String(parsed.pricing_model || "unknown"),
      ),
      tier_count: typeof parsed.tier_count === "number" ? parsed.tier_count : 0,
      has_recommended_plan: !!parsed.has_recommended_plan,
      has_anchor_price: !!parsed.has_anchor_price,
      charm_pricing_used: !!parsed.charm_pricing_used,
      framing_type: validateFramingType(
        String(parsed.framing_type || "neutral"),
      ),
      mental_accounting: validateMentalAccounting(parsed.mental_accounting),
      techniques_detected: Array.isArray(parsed.techniques_detected)
        ? parsed.techniques_detected.filter(
            (t: unknown) => typeof t === "string",
          )
        : [],
      techniques_missing: Array.isArray(parsed.techniques_missing)
        ? parsed.techniques_missing.filter(
            (t: unknown) => typeof t === "string",
          )
        : [],
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.slice(0, 10).map((i: Record<string, unknown>) => ({
            finding: String(i.finding || ""),
            suggestion: String(i.suggestion || ""),
            psychology_model: String(i.psychology_model || ""),
          }))
        : [],
      confidence: Math.max(0, Math.min(100, parsed.confidence)),
    };
  } catch {
    return null;
  }
}

function validatePricingModel(
  model: string,
): PricingPsychologyAnalysis["pricing_model"] {
  const valid = ["tiered", "single", "usage_based", "custom", "unknown"];
  return valid.includes(model)
    ? (model as PricingPsychologyAnalysis["pricing_model"])
    : "unknown";
}

function validateFramingType(
  type: string,
): PricingPsychologyAnalysis["framing_type"] {
  const valid = ["gain", "loss", "neutral"];
  return valid.includes(type)
    ? (type as PricingPsychologyAnalysis["framing_type"])
    : "neutral";
}

function validateMentalAccounting(
  val: unknown,
): string | null {
  if (val === null || val === undefined) return null;
  const valid = ["per_day", "per_month", "per_year"];
  const str = String(val);
  return valid.includes(str) ? str : null;
}

// ── Copy elements serializer (reused from semantic-enrichment pattern) ──

function serializeCopyElementsForPrompt(
  elements: ReturnType<typeof extractCopyElements>,
): string {
  const parts: string[] = [];
  if (elements.h1) parts.push(`H1: ${elements.h1}`);
  if (elements.subheadline) parts.push(`Subheadline: ${elements.subheadline}`);
  if (elements.primary_cta)
    parts.push(`Primary CTA: ${elements.primary_cta}`);
  if (elements.cta_texts.length > 0)
    parts.push(`All CTAs: ${elements.cta_texts.join(" | ")}`);
  if (elements.social_proof_elements.length > 0)
    parts.push(
      `Social proof: ${elements.social_proof_elements.join(" | ")}`,
    );
  if (elements.trust_signals.length > 0)
    parts.push(`Trust signals: ${elements.trust_signals.join(" | ")}`);
  parts.push(`Above fold: ${elements.above_fold_text}`);
  parts.push(
    `Word count: ${elements.word_count} | CTA count: ${elements.cta_count} | Has form: ${elements.has_form} | Has FAQ: ${elements.has_faq} | Has pricing table: ${elements.has_pricing_table}`,
  );
  return parts.join("\n");
}

// ── Main entry point ───────────────────────────

/**
 * Run pricing psychology analysis on pricing pages.
 *
 * Called from semantic-enrichment.ts AFTER the standard
 * pricing_page_framing enrichment. Only runs on pages classified
 * as 'pricing'.
 *
 * @param ctx             Enrichment context
 * @param pricingPages    Evidence items for pricing pages
 * @param evidenceAdded   Output array to append new evidence to
 * @param budget          Shared budget tracker
 */
export async function runPricingPsychologyEnrichment(
  ctx: EnrichmentContext,
  pricingPages: Evidence[],
  evidenceAdded: Evidence[],
  budget: { remaining: number; processed: number },
): Promise<void> {
  const cap = Math.min(pricingPages.length, budget.remaining);
  if (cap <= 0) return;

  // Get pricing psychology guidelines
  const allGuidelines = getGuidelinesForPageType("pricing");
  const pricingGuidelines = allGuidelines.filter(
    (g) => g.category === "pricing_psychology",
  );
  const guidelinesText = serializeGuidelinesForPrompt(pricingGuidelines);

  for (let i = 0; i < cap; i++) {
    const pageEvidence = pricingPages[i];
    const p = pageEvidence.payload as PageContentPayload;
    budget.processed++;
    budget.remaining--;

    ctx.emit({
      type: "step",
      stage: "enrichment",
      data: {
        message: `Wave 3.10: pricing psychology analysis (${i + 1}/${cap}) — ${p.url}`,
        index: budget.processed,
      },
      timestamp: new Date(),
    });

    try {
      const response = await httpFetch(p.url);
      if (response.status_code >= 400) {
        console.warn(
          `[pricing-psychology ${ctx.cycle_ref}] ${p.url} returned ${response.status_code}, skipping`,
        );
        continue;
      }

      const html = response.body;
      const bodyText = extractBodyText(html);
      if (!bodyText || bodyText.length < 50) {
        console.warn(
          `[pricing-psychology ${ctx.cycle_ref}] ${p.url} insufficient body text, skipping`,
        );
        continue;
      }

      // Extract copy elements for structured data
      const copyElements = extractCopyElements(html, p.url, "pricing", "decision");
      const copyElementsText = serializeCopyElementsForPrompt(copyElements);
      const truncatedText = bodyText.slice(0, MAX_TEXT_CHARS);

      // Build system prompt with pricing psychology guidelines
      const systemPrompt = buildPricingPsychologySystemPrompt(guidelinesText);
      const userPrompt = buildPricingPsychologyPrompt(
        copyElementsText,
        truncatedText,
      );

      // Call Haiku
      const result = await callModel(
        "haiku_4_5",
        [{ role: "user", content: userPrompt }],
        {
          max_tokens: 1500,
          temperature: 0.1,
          system: systemPrompt,
        },
      );

      const textBlock = result.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        console.warn(
          `[pricing-psychology ${ctx.cycle_ref}] no text in LLM response for ${p.url}`,
        );
        continue;
      }

      const assessment = parseAssessment(textBlock.text);
      if (!assessment) {
        console.warn(
          `[pricing-psychology ${ctx.cycle_ref}] failed to parse LLM response for ${p.url}`,
        );
        continue;
      }

      // Build ContentEnrichmentPayload evidence
      const now = new Date();
      const enrichmentPayload: ContentEnrichmentPayload = {
        type: "content_enrichment",
        enrichment_type: "pricing_psychology",
        source_evidence_key: pageEvidence.evidence_key,
        source_url: p.url,
        scores: {
          clarity_score: assessment.psychology_score,
          readability_grade: assessment.pricing_model,
        },
        flags: {
          ambiguity_flags: assessment.techniques_missing.map(
            (t) => `Missing technique: ${t}`,
          ),
          regulatory_gaps: [],
        },
        missing_elements: assessment.techniques_missing,
        results: {
          psychology_score: assessment.psychology_score,
          pricing_model: assessment.pricing_model,
          tier_count: assessment.tier_count,
          has_recommended_plan: assessment.has_recommended_plan,
          has_anchor_price: assessment.has_anchor_price,
          charm_pricing_used: assessment.charm_pricing_used,
          framing_type: assessment.framing_type,
          mental_accounting: assessment.mental_accounting,
          techniques_detected: assessment.techniques_detected,
          techniques_missing: assessment.techniques_missing,
          issues: assessment.issues,
        },
        confidence: assessment.confidence,
        model_used: result.model,
        cached: false,
      };

      const evidence: Evidence = {
        id: `enrich_pricing_psychology_${budget.processed}_${Date.now()}`,
        evidence_key: `content_enrichment:pricing_psychology:${p.url}`,
        evidence_type: EvidenceType.ContentEnrichment,
        subject_ref:
          ctx.scoping.subject_ref || `website:${ctx.root_domain}`,
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

      console.log(
        `[pricing-psychology ${ctx.cycle_ref}] ${p.url}: score=${assessment.psychology_score}/100, model=${assessment.pricing_model}, tiers=${assessment.tier_count}, techniques=${assessment.techniques_detected.length}`,
      );
    } catch (pageErr) {
      const message =
        pageErr instanceof Error ? pageErr.message : String(pageErr);
      console.warn(
        `[pricing-psychology ${ctx.cycle_ref}] error for ${p.url}: ${message}`,
      );
    }
  }
}
