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

/** Max total pages to analyze per cycle across all enrichment types (cost control) */
const MAX_PAGES = 10;

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

    // Run each copy analysis type
    await runCopyEnrichment(checkoutPages, 'checkout_trust', CHECKOUT_TRUST_SYSTEM, buildCheckoutTrustPrompt, 'checkout trust analysis');
    await runCopyEnrichment(commercialPages, 'cta_clarity', CTA_CLARITY_SYSTEM, buildCtaClarityPrompt, 'CTA clarity analysis');
    await runCopyEnrichment(productPages, 'product_page_quality', PRODUCT_PAGE_SYSTEM, buildProductPagePrompt, 'product page quality analysis');
    await runCopyEnrichment(pricingPages, 'pricing_page_framing', PRICING_FRAMING_SYSTEM, buildPricingFramingPrompt, 'pricing page framing analysis');

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
