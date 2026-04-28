import { callModel } from "../../../apps/mcp/llm/client";
import { httpFetch } from "../http-client";
import { extractBodyText } from "../parser";
import { extractCopyElements } from "./copy-elements-extractor";
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
// Wave 3.10 Fase 4 — Item O: SEO vs Conversion Tension
//
// Cross-references the page's copy with SEO patterns to detect
// when optimization for search engines hurts persuasion.
// Runs on all commercial pages.
//
// Produces ContentEnrichmentPayload with enrichment_type: 'seo_conversion_tension'
// Feeds signal `seo_conversion_conflict` when tension_score > 60
// ──────────────────────────────────────────────

/** Max body text chars sent to the LLM */
const MAX_TEXT_CHARS = 8_000;

// ── Types ──────────────────────────────────────

export interface SeoConversionTension {
  tension_score: number; // 0-100 (0 = no tension, 100 = severe conflict)
  keyword_stuffing_detected: boolean;
  h1_optimized_for: 'seo' | 'conversion' | 'balanced';
  issues: Array<{
    element: string;
    seo_version: string;
    conversion_version: string;
    recommendation: string;
  }>;
  confidence: number;
}

// ── Prompt ──────────────────────────────────────

const SYSTEM_PROMPT = `You are an SEO-conversion tension analyst. You detect when a page has been over-optimized for search engines at the expense of conversion persuasion. You balance both concerns and recommend where the balance tips too far.

You MUST respond with valid JSON only — no markdown fences, no explanation, no preamble.`;

function buildSeoConversionPrompt(copyElements: string, bodyText: string): string {
  return `Analyze this page for SEO-conversion tension. Look for:

1. **Keyword-stuffed headlines**: H1/H2 tags that read like search queries rather than compelling statements
2. **H1 optimized for search but not for buyer**: The main heading targets a keyword but doesn't communicate value or create curiosity
3. **Meta description vs page CTA mismatch**: The meta description promises one thing, but the page CTA directs to something different
4. **Alt text keyword-packed**: Image alt text stuffed with keywords instead of being descriptive
5. **Unnatural keyword repetition**: The same phrase repeated unnaturally throughout the copy
6. **SEO content blocks diluting conversion**: Large keyword-rich paragraphs below the fold that add SEO value but distract from the purchase path
7. **Title tag vs page headline mismatch**: Title tag targets keywords while the visible H1 tries to convert, creating cognitive dissonance

Rate the balance. A good page serves BOTH search and conversion. A bad page sacrifices one for the other.

Respond with ONLY a JSON object matching this exact schema:
{
  "tension_score": <number 0-100, where 0 = no tension / well-balanced, 100 = severe SEO-conversion conflict>,
  "keyword_stuffing_detected": <boolean>,
  "h1_optimized_for": "<seo | conversion | balanced>",
  "issues": [{"element": "<which element>", "seo_version": "<how it reads for SEO>", "conversion_version": "<how it should read for conversion>", "recommendation": "<what to do>"}],
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

function parseAssessment(raw: string): SeoConversionTension | null {
  try {
    const cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.tension_score !== "number") return null;
    if (typeof parsed.confidence !== "number") return null;

    return {
      tension_score: Math.max(0, Math.min(100, parsed.tension_score)),
      keyword_stuffing_detected: !!parsed.keyword_stuffing_detected,
      h1_optimized_for: validateH1Optimization(String(parsed.h1_optimized_for || "balanced")),
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.slice(0, 10).map((i: Record<string, unknown>) => ({
            element: String(i.element || ""),
            seo_version: String(i.seo_version || ""),
            conversion_version: String(i.conversion_version || ""),
            recommendation: String(i.recommendation || ""),
          }))
        : [],
      confidence: Math.max(0, Math.min(100, parsed.confidence)),
    };
  } catch {
    return null;
  }
}

function validateH1Optimization(val: string): SeoConversionTension["h1_optimized_for"] {
  const valid = ["seo", "conversion", "balanced"];
  return valid.includes(val) ? (val as SeoConversionTension["h1_optimized_for"]) : "balanced";
}

// ── Copy elements serializer ──────────────────

function serializeCopyElementsForPrompt(
  elements: ReturnType<typeof extractCopyElements>,
): string {
  const parts: string[] = [];
  if (elements.h1) parts.push(`H1: ${elements.h1}`);
  if (elements.subheadline) parts.push(`Subheadline: ${elements.subheadline}`);
  if (elements.primary_cta) parts.push(`Primary CTA: ${elements.primary_cta}`);
  if (elements.cta_texts.length > 0)
    parts.push(`All CTAs: ${elements.cta_texts.join(" | ")}`);
  if (elements.social_proof_elements.length > 0)
    parts.push(`Social proof: ${elements.social_proof_elements.join(" | ")}`);
  if (elements.trust_signals.length > 0)
    parts.push(`Trust signals: ${elements.trust_signals.join(" | ")}`);
  if (elements.navigation_labels.length > 0)
    parts.push(`Nav labels: ${elements.navigation_labels.join(" | ")}`);
  parts.push(`Above fold: ${elements.above_fold_text}`);
  parts.push(
    `Word count: ${elements.word_count} | CTA count: ${elements.cta_count} | Has form: ${elements.has_form} | Has FAQ: ${elements.has_faq} | Has pricing table: ${elements.has_pricing_table}`,
  );
  return parts.join("\n");
}

// ── URL classifier ────────────────────────────

const COMMERCIAL_URL_PATTERNS = /\/(checkout|cart|payment|product|item|p|pricing|plans|precos|homepage|lp|landing|promo|features?|solutions?|demo|trial|$)/i;

function isCommercialPage(url: string): boolean {
  if (COMMERCIAL_URL_PATTERNS.test(url)) return true;
  // Root URL is commercial
  try {
    const parsed = new URL(url);
    if (parsed.pathname === '/' || parsed.pathname === '') return true;
  } catch {
    // ignore
  }
  return false;
}

// ── Main entry point ───────────────────────────

/**
 * Run SEO vs conversion tension analysis on commercial pages.
 *
 * Called from semantic-enrichment.ts during the enrichment pipeline.
 * Detects when SEO optimization hurts persuasion.
 *
 * @param ctx             Enrichment context
 * @param pageContentEvidence  All page content evidence items
 * @param evidenceAdded   Output array to append new evidence to
 * @param budget          Shared budget tracker
 */
export async function runSeoConversionTensionEnrichment(
  ctx: EnrichmentContext,
  pageContentEvidence: Evidence[],
  evidenceAdded: Evidence[],
  budget: { remaining: number; processed: number },
): Promise<void> {
  if (budget.remaining <= 0) return;

  // Filter to commercial pages
  const commercialPages: Evidence[] = [];
  for (const e of pageContentEvidence) {
    const p = e.payload as PageContentPayload;
    if (isCommercialPage(p.url)) {
      commercialPages.push(e);
    }
  }

  if (commercialPages.length === 0) return;

  const cap = Math.min(commercialPages.length, budget.remaining);

  for (let i = 0; i < cap; i++) {
    const pageEvidence = commercialPages[i];
    const p = pageEvidence.payload as PageContentPayload;
    budget.processed++;
    budget.remaining--;

    ctx.emit({
      type: "step",
      stage: "enrichment",
      data: {
        message: `Wave 3.10: SEO-conversion tension (${i + 1}/${cap}) — ${p.url}`,
        index: budget.processed,
      },
      timestamp: new Date(),
    });

    try {
      const response = await httpFetch(p.url);
      if (response.status_code >= 400) {
        console.warn(`[copy-seo-tension ${ctx.cycle_ref}] ${p.url} returned ${response.status_code}, skipping`);
        continue;
      }

      const html = response.body;
      const bodyText = extractBodyText(html);
      if (!bodyText || bodyText.length < 50) {
        console.warn(`[copy-seo-tension ${ctx.cycle_ref}] ${p.url} insufficient body text, skipping`);
        continue;
      }

      const copyElements = extractCopyElements(html, p.url, 'all_commercial', 'awareness');
      const copyElementsText = serializeCopyElementsForPrompt(copyElements);
      const truncatedText = bodyText.slice(0, MAX_TEXT_CHARS);

      const result = await callModel(
        "haiku_4_5",
        [{ role: "user", content: buildSeoConversionPrompt(copyElementsText, truncatedText) }],
        {
          max_tokens: 1024,
          temperature: 0.1,
          system: SYSTEM_PROMPT,
        },
      );

      const textBlock = result.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        console.warn(`[copy-seo-tension ${ctx.cycle_ref}] no text in LLM response for ${p.url}`);
        continue;
      }

      const assessment = parseAssessment(textBlock.text);
      if (!assessment) {
        console.warn(`[copy-seo-tension ${ctx.cycle_ref}] failed to parse LLM response for ${p.url}`);
        continue;
      }

      const now = new Date();
      const enrichmentPayload: ContentEnrichmentPayload = {
        type: "content_enrichment",
        enrichment_type: "seo_conversion_tension",
        source_evidence_key: pageEvidence.evidence_key,
        source_url: p.url,
        scores: {
          clarity_score: 100 - assessment.tension_score, // invert: high tension = low clarity
          readability_grade: assessment.h1_optimized_for,
        },
        flags: {
          ambiguity_flags: assessment.issues.map(
            (issue) => `${issue.element}: SEO="${issue.seo_version}" vs Conversion="${issue.conversion_version}"`,
          ),
          regulatory_gaps: [],
        },
        missing_elements: [],
        results: {
          tension_score: assessment.tension_score,
          keyword_stuffing_detected: assessment.keyword_stuffing_detected,
          h1_optimized_for: assessment.h1_optimized_for,
          issues: assessment.issues,
        },
        confidence: assessment.confidence,
        model_used: result.model,
        cached: false,
      };

      const evidence: Evidence = {
        id: `enrich_seo_conversion_tension_${budget.processed}_${Date.now()}`,
        evidence_key: `content_enrichment:seo_conversion_tension:${p.url}`,
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

      console.log(
        `[copy-seo-tension ${ctx.cycle_ref}] ${p.url}: tension=${assessment.tension_score}/100, h1=${assessment.h1_optimized_for}, keyword_stuffing=${assessment.keyword_stuffing_detected}, issues=${assessment.issues.length}`,
      );
    } catch (pageErr) {
      const message = pageErr instanceof Error ? pageErr.message : String(pageErr);
      console.warn(`[copy-seo-tension ${ctx.cycle_ref}] error for ${p.url}: ${message}`);
    }
  }
}
