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
// Wave 3.10 Fase 4 — Item N: Micro-Copy Audit
//
// Analyzes form labels, error messages, button text, tooltips,
// empty states, and confirmation messages. Runs on pages that
// have forms (has_form: true from CopyElementsPayload) or are
// app/dashboard pages.
//
// Produces ContentEnrichmentPayload with enrichment_type: 'micro_copy'
// Feeds signal `micro_copy_friction_high` when microcopy_score < 40
// ──────────────────────────────────────────────

/** Max body text chars sent to the LLM */
const MAX_TEXT_CHARS = 8_000;

// ── Types ──────────────────────────────────────

export interface MicroCopyAnalysis {
  microcopy_score: number; // 0-100
  form_labels_quality: 'clear' | 'generic' | 'technical';
  button_text_quality: 'specific' | 'generic'; // "Submit" = generic
  has_helpful_errors: boolean;
  placeholder_quality: 'instructive' | 'redundant' | 'absent';
  field_count: number;
  issues: Array<{ element: string; current: string; suggestion: string }>;
  confidence: number;
}

// ── Prompt ──────────────────────────────────────

const SYSTEM_PROMPT = `You are a micro-copy specialist. You analyze form labels, button text, error messages, placeholder text, helper text, empty states, and confirmation messages for clarity, helpfulness, and human tone.

You MUST respond with valid JSON only — no markdown fences, no explanation, no preamble.`;

function buildMicroCopyPrompt(copyElements: string, bodyText: string): string {
  return `Analyze the micro-copy on this page — form labels, button text, error messages, placeholder text, helper text. Is it clear, human, and helpful? Or is it technical, generic, or confusing? Rate form friction based on label clarity and field count.

Look for:
- **Form labels**: Are they descriptive? Do they tell users what to enter? Or are they generic ("Name", "Email") without context?
- **Button text**: Is it specific and action-oriented ("Start free trial", "Get my report") or generic ("Submit", "Send", "OK")?
- **Error messages**: Are they helpful and instructive, or technical and blaming ("Invalid input", "Error 422")?
- **Placeholder text**: Does it provide examples or instructions, or just repeat the label?
- **Helper text**: Is there inline guidance near fields that need it?
- **Empty states**: Are they instructive with a clear CTA, or just blank?

Respond with ONLY a JSON object matching this exact schema:
{
  "microcopy_score": <number 0-100, overall micro-copy quality>,
  "form_labels_quality": "<clear | generic | technical>",
  "button_text_quality": "<specific | generic>",
  "has_helpful_errors": <boolean>,
  "placeholder_quality": "<instructive | redundant | absent>",
  "field_count": <number of form fields detected>,
  "issues": [{"element": "<which element>", "current": "<current text>", "suggestion": "<better text>"}],
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

function parseAssessment(raw: string): MicroCopyAnalysis | null {
  try {
    const cleaned = raw
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    if (typeof parsed.microcopy_score !== "number") return null;
    if (typeof parsed.confidence !== "number") return null;

    return {
      microcopy_score: Math.max(0, Math.min(100, parsed.microcopy_score)),
      form_labels_quality: validateLabelsQuality(String(parsed.form_labels_quality || "generic")),
      button_text_quality: parsed.button_text_quality === "specific" ? "specific" : "generic",
      has_helpful_errors: !!parsed.has_helpful_errors,
      placeholder_quality: validatePlaceholderQuality(String(parsed.placeholder_quality || "absent")),
      field_count: typeof parsed.field_count === "number" ? parsed.field_count : 0,
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.slice(0, 15).map((i: Record<string, unknown>) => ({
            element: String(i.element || ""),
            current: String(i.current || ""),
            suggestion: String(i.suggestion || ""),
          }))
        : [],
      confidence: Math.max(0, Math.min(100, parsed.confidence)),
    };
  } catch {
    return null;
  }
}

function validateLabelsQuality(val: string): MicroCopyAnalysis["form_labels_quality"] {
  const valid = ["clear", "generic", "technical"];
  return valid.includes(val) ? (val as MicroCopyAnalysis["form_labels_quality"]) : "generic";
}

function validatePlaceholderQuality(val: string): MicroCopyAnalysis["placeholder_quality"] {
  const valid = ["instructive", "redundant", "absent"];
  return valid.includes(val) ? (val as MicroCopyAnalysis["placeholder_quality"]) : "absent";
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
  if (elements.navigation_labels.length > 0)
    parts.push(`Nav labels: ${elements.navigation_labels.join(" | ")}`);
  parts.push(`Above fold: ${elements.above_fold_text}`);
  parts.push(
    `Word count: ${elements.word_count} | CTA count: ${elements.cta_count} | Has form: ${elements.has_form} | Has FAQ: ${elements.has_faq}`,
  );
  return parts.join("\n");
}

// ── URL classifiers ───────────────────────────

const FORM_PAGE_PATTERNS = /\/(contact|signup|sign-up|register|login|log-in|apply|subscribe|demo|quote|request|book|schedule|checkout|cart|payment)/i;
const APP_DASHBOARD_PATTERNS = /\/(app|dashboard|onboard|welcome|getting-started|setup|settings|account|profile|admin)\b/i;

function isFormOrAppPage(url: string, hasForm: boolean): boolean {
  if (hasForm) return true;
  if (FORM_PAGE_PATTERNS.test(url)) return true;
  if (APP_DASHBOARD_PATTERNS.test(url)) return true;
  return false;
}

// ── Main entry point ───────────────────────────

/**
 * Run micro-copy audit on form pages and app/dashboard pages.
 *
 * Called from semantic-enrichment.ts during the enrichment pipeline.
 * Analyzes micro-copy quality: form labels, button text, error
 * messages, placeholder text.
 *
 * @param ctx             Enrichment context
 * @param pageContentEvidence  All page content evidence items
 * @param evidenceAdded   Output array to append new evidence to
 * @param budget          Shared budget tracker
 */
export async function runMicroCopyEnrichment(
  ctx: EnrichmentContext,
  pageContentEvidence: Evidence[],
  evidenceAdded: Evidence[],
  budget: { remaining: number; processed: number },
): Promise<void> {
  if (budget.remaining <= 0) return;

  // Filter to form pages and app/dashboard pages
  const eligiblePages: Evidence[] = [];
  for (const e of pageContentEvidence) {
    const p = e.payload as PageContentPayload;
    if (isFormOrAppPage(p.url, p.has_forms)) {
      eligiblePages.push(e);
    }
  }

  if (eligiblePages.length === 0) return;

  const cap = Math.min(eligiblePages.length, budget.remaining);

  for (let i = 0; i < cap; i++) {
    const pageEvidence = eligiblePages[i];
    const p = pageEvidence.payload as PageContentPayload;
    budget.processed++;
    budget.remaining--;

    ctx.emit({
      type: "step",
      stage: "enrichment",
      data: {
        message: `Wave 3.10: micro-copy audit (${i + 1}/${cap}) — ${p.url}`,
        index: budget.processed,
      },
      timestamp: new Date(),
    });

    try {
      const response = await httpFetch(p.url);
      if (response.status_code >= 400) {
        console.warn(`[copy-micro-copy ${ctx.cycle_ref}] ${p.url} returned ${response.status_code}, skipping`);
        continue;
      }

      const html = response.body;
      const bodyText = extractBodyText(html);
      if (!bodyText || bodyText.length < 50) {
        console.warn(`[copy-micro-copy ${ctx.cycle_ref}] ${p.url} insufficient body text, skipping`);
        continue;
      }

      const copyElements = extractCopyElements(html, p.url, 'all_commercial', 'awareness');
      const copyElementsText = serializeCopyElementsForPrompt(copyElements);
      const truncatedText = bodyText.slice(0, MAX_TEXT_CHARS);

      const result = await callModel(
        "haiku_4_5",
        [{ role: "user", content: buildMicroCopyPrompt(copyElementsText, truncatedText) }],
        {
          max_tokens: 1024,
          temperature: 0.1,
          system: SYSTEM_PROMPT,
        },
      );

      const textBlock = result.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        console.warn(`[copy-micro-copy ${ctx.cycle_ref}] no text in LLM response for ${p.url}`);
        continue;
      }

      const assessment = parseAssessment(textBlock.text);
      if (!assessment) {
        console.warn(`[copy-micro-copy ${ctx.cycle_ref}] failed to parse LLM response for ${p.url}`);
        continue;
      }

      const now = new Date();
      const enrichmentPayload: ContentEnrichmentPayload = {
        type: "content_enrichment",
        enrichment_type: "micro_copy",
        source_evidence_key: pageEvidence.evidence_key,
        source_url: p.url,
        scores: {
          clarity_score: assessment.microcopy_score,
          readability_grade: assessment.form_labels_quality,
        },
        flags: {
          ambiguity_flags: assessment.issues.map(
            (issue) => `${issue.element}: "${issue.current}" -> "${issue.suggestion}"`,
          ),
          regulatory_gaps: [],
        },
        missing_elements: [],
        results: {
          microcopy_score: assessment.microcopy_score,
          form_labels_quality: assessment.form_labels_quality,
          button_text_quality: assessment.button_text_quality,
          has_helpful_errors: assessment.has_helpful_errors,
          placeholder_quality: assessment.placeholder_quality,
          field_count: assessment.field_count,
          issues: assessment.issues,
        },
        confidence: assessment.confidence,
        model_used: result.model,
        cached: false,
      };

      const evidence: Evidence = {
        id: `enrich_micro_copy_${budget.processed}_${Date.now()}`,
        evidence_key: `content_enrichment:micro_copy:${p.url}`,
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
        `[copy-micro-copy ${ctx.cycle_ref}] ${p.url}: score=${assessment.microcopy_score}/100, labels=${assessment.form_labels_quality}, buttons=${assessment.button_text_quality}, fields=${assessment.field_count}`,
      );
    } catch (pageErr) {
      const message = pageErr instanceof Error ? pageErr.message : String(pageErr);
      console.warn(`[copy-micro-copy ${ctx.cycle_ref}] error for ${p.url}: ${message}`);
    }
  }
}
